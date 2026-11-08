import { db, collection, getDocs } from "./fb.js";
import { toMin, minToStr, dateStr, addDays, parseDate } from "./util.js";

const list = async name => (await getDocs(collection(db, name))).docs.map(d => ({ id: d.id, ...d.data() }));
export const loadUsers = () => list("users");
export const loadTeams = () => list("teams");
export const loadMatches = () => list("matches");
export const loadAvailability = () => list("availability");

export const approvedOnly = users => users.filter(u => u.status === "approved");

// ---------- Statistiche (solo sfide interne concluse) ----------
export function computeStats(users, teams, matches, avail) {
  const by = {};
  approvedOnly(users).forEach(u => by[u.id] = { user: u, hours: 0, played: 0, wins: 0, organized: 0, teamsCreated: 0 });
  avail.forEach(a => { if (by[a.uid]) by[a.uid].hours += (toMin(a.end) - toMin(a.start)) / 60; });
  teams.forEach(t => { if (by[t.createdBy]) by[t.createdBy].teamsCreated++; });
  matches.filter(m => m.type === "challenge" && m.status === "completed").forEach(m => {
    const pa = m.playersA || [], pb = m.playersB || [];
    [...pa, ...pb].forEach(id => by[id] && by[id].played++);
    (m.winner === m.teamA ? pa : pb).forEach(id => by[id] && by[id].wins++);
    new Set([m.organizedBy, m.acceptedBy]).forEach(id => by[id] && by[id].organized++);
  });
  Object.values(by).forEach(s => s.hours = Math.round(s.hours * 10) / 10);
  return by;
}

export function teamRecords(teams, matches) {
  const rec = {};
  teams.forEach(t => rec[t.id] = { team: t, wins: 0, losses: 0 });
  matches.filter(m => m.type === "challenge" && m.status === "completed" && m.winner).forEach(m => {
    const loser = m.winner === m.teamA ? m.teamB : m.teamA;
    if (rec[m.winner]) rec[m.winner].wins++;
    if (rec[loser]) rec[loser].losses++;
  });
  return Object.values(rec).map(r => ({ ...r, played: r.wins + r.losses, rate: r.wins + r.losses ? r.wins / (r.wins + r.losses) : 0 }));
}

// ---------- Orari in comune ----------
const BLOCK = 30;
function memberBlocks(slots, ds) {
  const wd = parseDate(ds).getDay();
  const blocks = new Array(48).fill(false);
  slots.forEach(s => {
    if ((s.type === "recurring" && s.weekday === wd) || (s.type === "specific" && s.date === ds)) {
      for (let m = toMin(s.start); m < toMin(s.end); m += BLOCK) blocks[Math.floor(m / BLOCK)] = true;
    }
  });
  return blocks;
}

// Restituisce, per i prossimi `days` giorni, le fasce in cui almeno `min` membri sono liberi.
export function commonSlots(memberIds, avail, days = 14, min = memberIds.length) {
  const out = [];
  const today = new Date();
  for (let i = 0; i < days; i++) {
    const ds = dateStr(addDays(today, i));
    const counts = new Array(48).fill(0);
    memberIds.forEach(uid => memberBlocks(avail.filter(a => a.uid === uid), ds).forEach((b, k) => b && counts[k]++));
    let k = 0;
    const ranges = [];
    while (k < 48) {
      if (counts[k] >= min) {
        let j = k, low = counts[k];
        while (j < 48 && counts[j] >= min) { low = Math.min(low, counts[j]); j++; }
        ranges.push({ start: minToStr(k * BLOCK), end: minToStr(j * BLOCK), count: low });
        k = j;
      } else k++;
    }
    if (ranges.length) out.push({ date: ds, ranges });
  }
  return out;
}
