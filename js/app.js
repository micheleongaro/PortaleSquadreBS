import {
  auth, db, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut,
  sendEmailVerification, sendPasswordResetEmail, deleteUser,
  doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc, collection, query, where, writeBatch,
  serverTimestamp, arrayUnion, arrayRemove
} from "./fb.js";
import { ADMIN_EMAIL } from "./firebase-config.js";
import {
  esc, USERNAME_RE, WEEKDAYS, passwordChecks, passwordOk, toMin, dateStr, fmtDate, matchDateTime,
  tsMs, isOnline, timeAgo, toast, errMsg
} from "./util.js";
import { crestSvg, CREST_SHAPES, CREST_SYMBOLS, CREST_COLORS, DEFAULT_CREST, DEFAULT_AVATAR, brawlerImg, loadBrawlers } from "./assets.js";
import { loadUsers, loadTeams, loadMatches, loadAvailability, approvedOnly, computeStats, teamRecords, commonSlots } from "./data.js";

const state = { user: null, me: null, registering: false, heartbeat: null };
const app = document.getElementById("app");
const nav = document.getElementById("nav");

// ======================= Utilità =======================
const isAdmin = () => !!state.user && state.user.emailVerified && (state.user.email || "").toLowerCase() === ADMIN_EMAIL.toLowerCase();
const meId = () => state.user?.uid;
const go = h => { if (location.hash === h) render(); else location.hash = h; };
const actionSettings = () => ({ url: location.origin + location.pathname });
const avatar = (u, size = 40) => `<img class="avatar" width="${size}" height="${size}" src="${brawlerImg(u?.avatar)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`;
const userChip = (u, size = 32) => u ? `<a class="chip-user" href="#/player/${encodeURIComponent(u.username)}">${avatar(u, size)}<span>${esc(u.username)}</span></a>` : `<span class="muted">utente rimosso</span>`;
const loading = () => { app.innerHTML = `<div class="loading"><div class="spinner"></div></div>`; };
const $ = sel => app.querySelector(sel);
const $$ = sel => [...app.querySelectorAll(sel)];

function bindForm(sel, handler) {
  const f = $(sel);
  if (!f) return;
  f.addEventListener("submit", async e => {
    e.preventDefault();
    const btn = f.querySelector("button[type=submit]");
    if (btn) btn.disabled = true;
    try { await handler(new FormData(f), f); }
    catch (err) { console.error(err); toast(errMsg(err), "err"); }
    finally { if (btn) btn.disabled = false; }
  });
}
function onClick(sel, handler) {
  $$(sel).forEach(el => el.addEventListener("click", async e => {
    e.preventDefault();
    el.disabled = true;
    try { await handler(el.dataset, el); }
    catch (err) { console.error(err); toast(errMsg(err), "err"); }
    finally { el.disabled = false; }
  }));
}

// ======================= Autenticazione =======================
onAuthStateChanged(auth, async u => {
  state.user = u;
  if (state.registering) return;
  await refreshMe();
  render();
});

async function refreshMe() {
  stopHeartbeat();
  if (!state.user) { state.me = null; return; }
  try {
    const s = await getDoc(doc(db, "users", state.user.uid));
    state.me = s.exists() ? { id: s.id, ...s.data() } : null;
    if (state.me && state.user.emailVerified && !state.me.emailVerified) {
      await state.user.getIdToken(true);
      await updateDoc(doc(db, "users", state.user.uid), { emailVerified: true });
      state.me.emailVerified = true;
    }
    if (state.me && isAdmin() && state.me.status === "pending") {
      await state.user.getIdToken(true);
      await updateDoc(doc(db, "users", state.user.uid), { status: "approved" });
      state.me.status = "approved";
    }
    if (state.me?.status === "approved" && state.user.emailVerified) startHeartbeat();
  } catch (e) { console.error(e); state.me = null; }
}

function startHeartbeat() {
  const beat = () => updateDoc(doc(db, "users", meId()), { lastSeen: serverTimestamp() }).catch(() => {});
  beat();
  state.heartbeat = setInterval(() => { if (document.visibilityState === "visible") beat(); }, 60000);
}
function stopHeartbeat() { if (state.heartbeat) clearInterval(state.heartbeat); state.heartbeat = null; }

// ======================= Router =======================
window.addEventListener("hashchange", render);

const routes = {
  home: viewHome, disponibilita: viewAvailability, squadre: viewTeams, squadra: viewTeam,
  partite: viewMatches, classifica: viewLeaderboard, giocatori: viewPlayers, player: viewPlayers,
  profilo: viewProfile, admin: viewAdmin
};

async function render() {
  const [, route = "", param = ""] = (location.hash || "#/").split("/");
  const p = decodeURIComponent(param);
  renderNav();
  window.scrollTo(0, 0);

  if (!state.user) {
    if (route === "registrati") return viewRegister();
    if (route === "recupero") return viewReset();
    return viewLogin();
  }
  if (!state.user.emailVerified) return viewVerify();
  if (!state.me) return viewMessage("Richiesta non trovata", "Non risulta nessuna richiesta di accesso attiva per questo account, oppure è stata rifiutata. Se pensi sia un errore, contatta l'amministratore.");
  if (state.me.status === "banned") return viewMessage("Accesso sospeso", "Il tuo account è stato disattivato dall'amministratore.");
  if (state.me.status !== "approved") return viewMessage("Richiesta in attesa", "La tua email è verificata. Ora l'amministratore deve approvare il tuo account: riprova ad accedere più tardi.");

  const view = routes[route];
  if (route === "admin" && !isAdmin()) return go("#/home");
  try { await (view || viewHome)(p); }
  catch (e) { console.error(e); app.innerHTML = `<section class="card"><h2>Ops</h2><p>${esc(errMsg(e))}</p></section>`; }
}

function renderNav() {
  const ok = state.user?.emailVerified && state.me?.status === "approved";
  document.body.classList.toggle("logged", !!ok);
  if (!ok) { nav.innerHTML = state.user ? `<button class="btn btn-ghost" id="logout">Esci</button>` : ""; }
  else {
    const route = (location.hash.split("/")[1]) || "home";
    const items = [["home", "Home"], ["disponibilita", "Disponibilità"], ["squadre", "Squadre"], ["partite", "Partite"],
      ["classifica", "Classifica"], ["giocatori", "Giocatori"], ["profilo", "Profilo"]];
    if (isAdmin()) items.push(["admin", "Admin"]);
    nav.innerHTML = `
      <button class="menu-toggle" id="menuToggle" aria-label="Menu">☰</button>
      <div class="nav-links" id="navLinks">
        ${items.map(([r, l]) => `<a href="#/${r}" class="${route === r || (route === "squadra" && r === "squadre") || (route === "player" && r === "giocatori") ? "active" : ""}">${l}</a>`).join("")}
        <button class="btn btn-ghost" id="logout">Esci</button>
      </div>`;
    document.getElementById("menuToggle").onclick = () => document.getElementById("navLinks").classList.toggle("open");
    nav.querySelectorAll(".nav-links a").forEach(a => a.onclick = () => document.getElementById("navLinks").classList.remove("open"));
  }
  const lo = document.getElementById("logout");
  if (lo) lo.onclick = async () => { stopHeartbeat(); await signOut(auth); go("#/"); };
}

// ======================= Pagine pubbliche =======================
const DISCLAIMER = `<div class="disclaimer"><strong>Avviso:</strong> questo sito è un progetto amatoriale e non commerciale creato da un gruppo di amici.
  Non è affiliato, sponsorizzato né approvato da Supercell, e Supercell non ne è responsabile.
  Le immagini dei Brawler sono usate secondo la <a href="https://supercell.com/en/fan-content-policy/" target="_blank" rel="noopener">Fan Content Policy di Supercell</a>.</div>`;

function viewLogin() {
  app.innerHTML = `
    <section class="hero"><h1 class="glow">Portale Squadre</h1><p>Organizza le partite con i tuoi amici: disponibilità, squadre, sfide e classifiche.</p></section>
    <section class="card narrow">
      <h2>Accedi</h2>
      <form id="f">
        <label>Email<input name="email" type="email" required autocomplete="email"></label>
        <label>Password<input name="pw" type="password" required autocomplete="current-password"></label>
        <button class="btn" type="submit">Entra</button>
      </form>
      <p class="links"><a href="#/recupero">Password dimenticata?</a> · <a href="#/registrati">Richiedi l'accesso</a></p>
    </section>
    ${DISCLAIMER}`;
  bindForm("#f", async fd => { await signInWithEmailAndPassword(auth, fd.get("email").trim(), fd.get("pw")); });
}

function viewRegister() {
  app.innerHTML = `
    <section class="card narrow">
      <h2>Richiedi l'accesso</h2>
      <p class="muted">Dopo la registrazione dovrai verificare la tua email; poi l'amministratore approverà il tuo account.</p>
      <form id="f">
        <label>Username<input name="username" required minlength="8" maxlength="20" pattern="[A-Za-z0-9]{8,20}" autocomplete="username">
          <small>Almeno 8 caratteri, solo lettere e numeri.</small></label>
        <label>Email<input name="email" type="email" required autocomplete="email"></label>
        <label>Telefono<input name="phone" type="tel" required pattern="[+0-9 ]{6,20}" placeholder="+39 333 1234567"></label>
        <label>Password<input name="pw" id="pw" type="password" required autocomplete="new-password"></label>
        <ul class="pw-checks" id="pwChecks"></ul>
        <label>Ripeti password<input name="pw2" type="password" required autocomplete="new-password"></label>
        <label class="check"><input type="checkbox" name="ok" required> Ho letto l'avviso: è un gruppo amatoriale tra amici, non collegato a Supercell.</label>
        <button class="btn" type="submit">Invia richiesta</button>
      </form>
      <p class="links"><a href="#/">Hai già un account? Accedi</a></p>
    </section>
    ${DISCLAIMER}`;
  const pw = $("#pw"), list = $("#pwChecks");
  const upd = () => list.innerHTML = passwordChecks(pw.value).map(c => `<li class="${c.ok ? "ok" : ""}">${c.ok ? "✓" : "•"} ${c.label}</li>`).join("");
  pw.addEventListener("input", upd); upd();

  bindForm("#f", async fd => {
    const username = fd.get("username").trim(), email = fd.get("email").trim(), phone = fd.get("phone").trim();
    const p1 = fd.get("pw"), p2 = fd.get("pw2");
    if (!USERNAME_RE.test(username)) throw new Error("Lo username deve avere almeno 8 caratteri, solo lettere e numeri.");
    if (!passwordOk(p1)) throw new Error("La password non rispetta le regole.");
    if (p1 !== p2) throw new Error("Le due password non coincidono.");
    const lower = username.toLowerCase();
    if ((await getDoc(doc(db, "usernames", lower))).exists()) throw new Error("Questo username è già in uso.");

    state.registering = true;
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, p1);
      const uid = cred.user.uid;
      try {
        const b = writeBatch(db);
        b.set(doc(db, "usernames", lower), { uid });
        b.set(doc(db, "users", uid), {
          username, usernameLower: lower, status: "pending", emailVerified: false,
          avatar: DEFAULT_AVATAR, delegates: [], createdAt: serverTimestamp(), lastSeen: serverTimestamp()
        });
        b.set(doc(db, "users", uid, "private", "contact"), { email, phone });
        await b.commit();
      } catch (e) {
        await deleteUser(cred.user).catch(() => {});
        throw e.code === "permission-denied" ? new Error("Username non disponibile, scegline un altro.") : e;
      }
      await sendEmailVerification(cred.user, actionSettings()).catch(e => console.warn(e));
    } finally {
      state.registering = false;
    }
    await refreshMe();
    go("#/");
    render();
  });
}

function viewReset() {
  app.innerHTML = `
    <section class="card narrow">
      <h2>Recupero password</h2>
      <p class="muted">Inserisci la tua email: riceverai un link per scegliere una nuova password.</p>
      <form id="f"><label>Email<input name="email" type="email" required></label><button class="btn" type="submit">Invia link</button></form>
      <p class="links"><a href="#/">Torna all'accesso</a></p>
    </section>`;
  bindForm("#f", async fd => {
    await sendPasswordResetEmail(auth, fd.get("email").trim(), actionSettings());
    toast("Se l'email è registrata, riceverai il link a breve.");
    go("#/");
  });
}

function viewVerify() {
  app.innerHTML = `
    <section class="card narrow">
      <h2>Verifica la tua email</h2>
      <p>Ti abbiamo mandato un link a <strong>${esc(state.user.email)}</strong>. Aprilo per confermare l'indirizzo (controlla anche lo spam).</p>
      <p class="muted">Dopo la verifica, la richiesta arriva all'amministratore per l'approvazione.</p>
      <div class="row"><button class="btn" id="done">Ho verificato</button><button class="btn btn-ghost" id="again">Rimanda email</button></div>
    </section>`;
  onClick("#done", async () => {
    await state.user.reload();
    if (!auth.currentUser.emailVerified) return toast("Email non ancora verificata.", "err");
    state.user = auth.currentUser;
    await refreshMe(); render();
  });
  onClick("#again", async () => { await sendEmailVerification(state.user, actionSettings()); toast("Email inviata di nuovo."); });
}

function viewMessage(title, text) {
  app.innerHTML = `<section class="card narrow"><h2>${esc(title)}</h2><p>${esc(text)}</p></section>${DISCLAIMER}`;
}

// ======================= Home =======================
async function viewHome() {
  loading();
  const [users, teams, matches] = await Promise.all([loadUsers(), loadTeams(), loadMatches()]);
  const approved = approvedOnly(users);
  const online = approved.filter(isOnline);
  const myTeams = teams.filter(t => t.members?.includes(meId()));
  const myTeamIds = new Set(myTeams.map(t => t.id));
  const teamById = Object.fromEntries(teams.map(t => [t.id, t]));
  const upcoming = matches.filter(m => m.status === "scheduled" && (myTeamIds.has(m.teamA) || myTeamIds.has(m.teamB)))
    .sort((a, b) => matchDateTime(a) - matchDateTime(b));
  const todo = matches.filter(m => needsMyAction(m, teamById)).length;

  app.innerHTML = `
    <section class="hero small"><h1 class="glow">Ciao ${esc(state.me.username)}</h1></section>
    <section class="stats-row">
      <div class="stat"><span class="num cyan">${online.length}</span><span>online ora</span></div>
      <div class="stat"><span class="num violet">${approved.length}</span><span>iscritti</span></div>
      <div class="stat"><span class="num">${myTeams.length}</span><span>tue squadre</span></div>
      <a class="stat ${todo ? "alert" : ""}" href="#/partite"><span class="num">${todo}</span><span>azioni da fare</span></a>
    </section>
    <section class="card">
      <h2>Prossime partite</h2>
      ${upcoming.length ? upcoming.slice(0, 5).map(m => matchCard(m, teamById)).join("") : `<p class="muted">Nessuna partita in programma. Vai su una <a href="#/squadre">squadra</a> per vedere gli orari in comune e proporne una.</p>`}
    </section>
    <section class="card">
      <h2>Online adesso</h2>
      <div class="chips">${online.length ? online.map(u => userChip(u)).join("") : `<span class="muted">Nessuno oltre a te.</span>`}</div>
    </section>
    ${DISCLAIMER}`;
}

// ======================= Disponibilità =======================
async function viewAvailability(forUid) {
  loading();
  const users = await loadUsers();
  const delegators = approvedOnly(users).filter(u => u.id !== meId() && (u.delegates || []).includes(meId()));
  const target = forUid && delegators.find(u => u.id === forUid) ? forUid : meId();
  const targetUser = users.find(u => u.id === target);
  const snap = await getDocs(query(collection(db, "availability"), where("uid", "==", target)));
  const slots = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  const recurring = slots.filter(s => s.type === "recurring").sort((a, b) => a.weekday - b.weekday || a.start.localeCompare(b.start));
  const today = dateStr(new Date());
  const specific = slots.filter(s => s.type === "specific").sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  const hours = slots.reduce((s, a) => s + (toMin(a.end) - toMin(a.start)) / 60, 0);
  const slotRow = s => `<li class="slot"><span>${s.type === "recurring" ? `Ogni ${WEEKDAYS[s.weekday].toLowerCase()}` : fmtDate(s.date)} · <strong>${s.start}–${s.end}</strong>${s.type === "specific" && s.date < today ? ' <em class="muted">(passata)</em>' : ""}</span><button class="btn btn-small btn-danger" data-del="${s.id}">Elimina</button></li>`;

  app.innerHTML = `
    <section class="card">
      <h2>Disponibilità ${target !== meId() ? `di ${esc(targetUser?.username)}` : ""}</h2>
      ${delegators.length ? `<label>Stai gestendo le disponibilità di
        <select id="who"><option value="">me stesso</option>${delegators.map(u => `<option value="${u.id}" ${u.id === target ? "selected" : ""}>${esc(u.username)} (delega)</option>`).join("")}</select></label>` : ""}
      <p class="muted">Totale inserito: <strong>${Math.round(hours * 10) / 10} ore</strong>.</p>
      <form id="f" class="grid-form">
        <label>Tipo<select name="type" id="type"><option value="recurring">Ricorrente (ogni settimana)</option><option value="specific">Data specifica</option></select></label>
        <label id="wdBox">Giorno<select name="weekday">${WEEKDAYS.map((d, i) => `<option value="${i}" ${i === 1 ? "selected" : ""}>${d}</option>`).join("")}</select></label>
        <label id="dateBox" hidden>Data<input type="date" name="date" min="${today}"></label>
        <label>Dalle<input type="time" name="start" step="1800" value="18:00" required></label>
        <label>Alle<input type="time" name="end" step="1800" value="20:00" required></label>
        <button class="btn" type="submit">Aggiungi</button>
      </form>
    </section>
    <section class="card"><h3>Ricorrenti</h3><ul class="slots">${recurring.map(slotRow).join("") || `<li class="muted">Nessuna.</li>`}</ul></section>
    <section class="card"><h3>Date specifiche</h3><ul class="slots">${specific.map(slotRow).join("") || `<li class="muted">Nessuna.</li>`}</ul></section>`;

  const who = $("#who");
  if (who) who.onchange = () => go(who.value ? `#/disponibilita/${who.value}` : "#/disponibilita");
  const type = $("#type");
  type.onchange = () => { $("#wdBox").hidden = type.value !== "recurring"; $("#dateBox").hidden = type.value === "recurring"; };
  bindForm("#f", async fd => {
    let start = fd.get("start"), end = fd.get("end");
    if (end === "00:00") end = "24:00";
    if (toMin(start) % 30 || toMin(end) % 30) throw new Error("Usa orari a mezz'ora (es. 18:00, 18:30).");
    if (start >= end) throw new Error("L'orario di fine deve essere dopo l'inizio.");
    const data = { uid: target, type: fd.get("type"), start, end, createdBy: meId(), createdAt: serverTimestamp() };
    if (data.type === "recurring") data.weekday = Number(fd.get("weekday"));
    else { data.date = fd.get("date"); if (!data.date) throw new Error("Scegli una data."); }
    await addDoc(collection(db, "availability"), data);
    toast("Disponibilità aggiunta.");
    viewAvailability(target === meId() ? "" : target);
  });
  onClick("[data-del]", async ds => { await deleteDoc(doc(db, "availability", ds.del)); viewAvailability(target === meId() ? "" : target); });
}

// ======================= Squadre =======================
function crestPicker(current = DEFAULT_CREST) {
  const opt = (obj, sel) => Object.keys(obj).map(k => `<option value="${k}" ${k === sel ? "selected" : ""}>${k}</option>`).join("");
  return `<div class="crest-picker">
    <div class="crest-preview" id="crestPreview">${crestSvg(current, 96)}</div>
    <div class="grid-form">
      <label>Forma<select name="shape">${opt(CREST_SHAPES, current.shape)}</select></label>
      <label>Simbolo<select name="symbol">${opt(CREST_SYMBOLS, current.symbol)}</select></label>
      <label>Colore<select name="color">${opt(CREST_COLORS, current.color)}</select></label>
    </div></div>`;
}
function bindCrestPicker(form) {
  const upd = () => form.querySelector("#crestPreview").innerHTML = crestSvg(readCrest(new FormData(form)), 96);
  ["shape", "symbol", "color"].forEach(n => form.querySelector(`[name=${n}]`).onchange = upd);
}
const readCrest = fd => ({ shape: fd.get("shape"), symbol: fd.get("symbol"), color: fd.get("color") });

const teamTile = (t, users) => `<a class="team-tile" href="#/squadra/${t.id}">${crestSvg(t.crest, 56)}<div><strong>${esc(t.name)}</strong><span class="muted">${t.members?.length || 0} membri${t.organizers?.includes(meId()) ? " · sei organizzatore" : ""}</span></div></a>`;

async function viewTeams() {
  loading();
  const teams = (await loadTeams()).sort((a, b) => a.name.localeCompare(b.name));
  const mine = teams.filter(t => t.members?.includes(meId()));
  const others = teams.filter(t => !t.members?.includes(meId()));
  app.innerHTML = `
    <section class="card"><h2>Le tue squadre</h2><div class="tiles">${mine.map(t => teamTile(t)).join("") || `<p class="muted">Non fai ancora parte di nessuna squadra.</p>`}</div></section>
    <section class="card"><h2>Crea una squadra</h2>
      <p class="muted">Chi crea la squadra ne diventa automaticamente organizzatore.</p>
      <form id="f"><label>Nome squadra<input name="name" required minlength="2" maxlength="30"></label>${crestPicker()}<button class="btn" type="submit">Crea squadra</button></form>
    </section>
    <section class="card"><h2>Altre squadre</h2><div class="tiles">${others.map(t => teamTile(t)).join("") || `<p class="muted">Nessuna.</p>`}</div></section>`;
  bindCrestPicker($("#f"));
  bindForm("#f", async fd => {
    const ref = await addDoc(collection(db, "teams"), {
      name: fd.get("name").trim(), crest: readCrest(fd), members: [meId()], organizers: [meId()],
      createdBy: meId(), createdAt: serverTimestamp()
    });
    toast("Squadra creata!");
    go(`#/squadra/${ref.id}`);
  });
}

async function viewTeam(id) {
  loading();
  const [users, teams, matches, avail] = await Promise.all([loadUsers(), loadTeams(), loadMatches(), loadAvailability()]);
  const t = teams.find(x => x.id === id);
  if (!t) { app.innerHTML = `<section class="card"><p>Squadra non trovata.</p></section>`; return; }
  const userById = Object.fromEntries(users.map(u => [u.id, u]));
  const teamById = Object.fromEntries(teams.map(x => [x.id, x]));
  const isOrg = t.organizers?.includes(meId());
  const isMember = t.members?.includes(meId());
  const members = (t.members || []).map(uid => userById[uid]).filter(Boolean);
  const candidates = approvedOnly(users).filter(u => !t.members?.includes(u.id)).sort((a, b) => a.username.localeCompare(b.username));
  const rec = teamRecords([t], matches)[0];
  const tm = matches.filter(m => m.teamA === id || m.teamB === id).sort((a, b) => matchDateTime(b) - matchDateTime(a));

  const n = members.length;
  const minFree = Math.max(1, n > 2 ? n - 1 : n);
  const slots = n ? commonSlots(t.members, avail, 14, minFree) : [];

  app.innerHTML = `
    <section class="card team-head">
      ${crestSvg(t.crest, 88)}
      <div><h2>${esc(t.name)}</h2><p class="muted">${rec.wins} vinte · ${rec.losses} perse · win rate ${rec.played ? Math.round(rec.rate * 100) + "%" : "–"}</p></div>
    </section>
    <section class="card">
      <h3>Membri</h3>
      <ul class="members">${members.map(u => `<li>${userChip(u)} ${t.organizers?.includes(u.id) ? '<span class="badge">organizzatore</span>' : ""}
        ${isOrg && u.id !== meId() ? `<button class="btn btn-small btn-ghost" data-rm="${u.id}">Rimuovi</button>` : ""}</li>`).join("")}</ul>
      ${isOrg ? `<form id="addM" class="row"><select name="uid" required><option value="">Aggiungi un giocatore…</option>${candidates.map(u => `<option value="${u.id}">${esc(u.username)}</option>`).join("")}</select><button class="btn btn-small" type="submit">Aggiungi</button></form>` : ""}
      ${isMember ? `<button class="btn btn-small btn-danger" id="leave">Lascia la squadra</button>` : ""}
      <p class="muted small">Per diventare organizzatore chiedi all'amministratore.</p>
    </section>
    ${isMember ? `
    <section class="card">
      <h3>Orari in comune (prossimi 14 giorni)</h3>
      <p class="muted small">${n > 2 ? `Fasce in cui sono liberi almeno ${minFree} membri su ${n}.` : "Fasce in cui sono liberi tutti i membri."} Tocca una fascia per proporre una partita.</p>
      ${slots.length ? `<div class="common">${slots.map(d => `<div class="common-day"><strong>${fmtDate(d.date)}</strong><div class="chips">${d.ranges.map(r => `<button class="slot-chip ${r.count === n ? "full" : ""}" data-date="${d.date}" data-time="${r.start}">${r.start}–${r.end} · ${r.count}/${n}</button>`).join("")}</div></div>`).join("")}</div>` : `<p class="muted">Nessun orario in comune. Chiedi ai compagni di inserire le loro disponibilità.</p>`}
    </section>
    <section class="card">
      <h3>Proponi una partita</h3>
      <p class="muted small">${isOrg ? "Come organizzatore, la sfida parte subito verso l'altra squadra." : "La proposta andrà all'organizzatore della tua squadra."}</p>
      <form id="prop" class="grid-form">
        <label>Tipo<select name="type" id="mtype"><option value="challenge">Sfida contro squadra del sito</option><option value="external">Evento esterno / allenamento</option></select></label>
        <label id="oppTeam">Avversario<select name="teamB">${teams.filter(x => x.id !== id).map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join("")}</select></label>
        <label id="oppExt" hidden>Avversario esterno<input name="opponent" maxlength="40" placeholder="es. allenamento"></label>
        <label>Data<input type="date" name="date" min="${dateStr(new Date())}" required></label>
        <label>Ora<input type="time" name="time" required></label>
        <button class="btn" type="submit">Proponi</button>
      </form>
      <p class="muted small">Gli eventi esterni servono solo a organizzarsi: non contano in statistiche e classifiche.</p>
    </section>` : ""}
    ${isOrg ? `<section class="card"><h3>Modifica squadra</h3><form id="edit"><label>Nome<input name="name" value="${esc(t.name)}" required minlength="2" maxlength="30"></label>${crestPicker({ ...DEFAULT_CREST, ...t.crest })}<button class="btn" type="submit">Salva</button></form></section>` : ""}
    <section class="card"><h3>Partite della squadra</h3>${tm.map(m => matchCard(m, teamById, userById)).join("") || `<p class="muted">Nessuna partita.</p>`}</section>`;

  bindMatchActions(teamById, () => viewTeam(id));
  bindForm("#addM", async fd => { await updateDoc(doc(db, "teams", id), { members: arrayUnion(fd.get("uid")) }); viewTeam(id); });
  onClick("[data-rm]", async ds => { if (confirm("Rimuovere questo giocatore?")) { await updateDoc(doc(db, "teams", id), { members: arrayRemove(ds.rm) }); viewTeam(id); } });
  onClick("#leave", async () => {
    if (!confirm("Vuoi davvero lasciare la squadra?")) return;
    await updateDoc(doc(db, "teams", id), { members: arrayRemove(meId()), organizers: arrayRemove(meId()) });
    go("#/squadre");
  });
  const mtype = $("#mtype");
  if (mtype) mtype.onchange = () => { $("#oppTeam").hidden = mtype.value !== "challenge"; $("#oppExt").hidden = mtype.value === "challenge"; };
  $$(".slot-chip").forEach(b => b.onclick = () => {
    const f = $("#prop"); f.date.value = b.dataset.date; f.time.value = b.dataset.time; f.scrollIntoView({ behavior: "smooth" });
  });
  bindForm("#prop", async fd => {
    const type = fd.get("type");
    const data = { type, teamA: id, teamB: null, opponent: "", date: fd.get("date"), time: fd.get("time"), proposedBy: meId(), createdAt: serverTimestamp() };
    if (type === "challenge") { data.teamB = fd.get("teamB"); if (!data.teamB) throw new Error("Non ci sono altre squadre da sfidare."); }
    else data.opponent = (fd.get("opponent") || "").trim() || "Avversario esterno";
    if (matchDateTime(data) < new Date()) throw new Error("Scegli una data e un'ora future.");
    if (isOrg) { data.status = type === "challenge" ? "challenged" : "scheduled"; data.organizedBy = meId(); }
    else data.status = "proposed";
    await addDoc(collection(db, "matches"), data);
    toast(isOrg ? (type === "challenge" ? "Sfida inviata!" : "Evento in programma!") : "Proposta inviata all'organizzatore.");
    viewTeam(id);
  });
  if ($("#edit")) {
    bindCrestPicker($("#edit"));
    bindForm("#edit", async fd => { await updateDoc(doc(db, "teams", id), { name: fd.get("name").trim(), crest: readCrest(fd) }); toast("Salvato."); viewTeam(id); });
  }
}

// ======================= Partite =======================
const STATUS = {
  proposed: ["Proposta", "in attesa dell'organizzatore"], challenged: ["Sfida lanciata", "in attesa dell'avversario"],
  scheduled: ["In programma", ""], completed: ["Conclusa", ""], disputed: ["Contestata", "risultati diversi: decide l'admin"],
  declined: ["Rifiutata", ""], cancelled: ["Annullata", ""]
};
const orgOf = (teamId, teamById) => !!teamId && !!teamById[teamId]?.organizers?.includes(meId());

function needsMyAction(m, teamById) {
  const a = orgOf(m.teamA, teamById), b = orgOf(m.teamB, teamById);
  if (m.status === "proposed" && a) return true;
  if (m.status === "challenged" && b) return true;
  if (m.status === "scheduled" && m.type === "challenge" && matchDateTime(m) < new Date()) {
    if (a && !m.reportA) return true;
    if (b && !m.reportB) return true;
  }
  return false;
}

function matchCard(m, teamById, userById = {}) {
  const A = teamById[m.teamA], B = teamById[m.teamB];
  const a = orgOf(m.teamA, teamById), b = orgOf(m.teamB, teamById);
  const past = matchDateTime(m) < new Date();
  const [label, sub] = STATUS[m.status] || [m.status, ""];
  const side = (t, name) => `<div class="side">${t ? crestSvg(t.crest, 40) : '<div class="ext-ico">?</div>'}<span>${esc(t?.name || name || "–")}</span></div>`;
  const btns = [];
  if (m.status === "proposed" && a) btns.push(`<button class="btn btn-small" data-act="approve" data-id="${m.id}">Approva</button>`, `<button class="btn btn-small btn-ghost" data-act="decline" data-id="${m.id}">Rifiuta</button>`);
  if (m.status === "challenged" && b) btns.push(`<button class="btn btn-small" data-act="accept" data-id="${m.id}">Accetta sfida</button>`, `<button class="btn btn-small btn-ghost" data-act="decline" data-id="${m.id}">Rifiuta</button>`);
  if (m.status === "scheduled" && m.type === "challenge" && past) {
    if ((a && !m.reportA) || (b && !m.reportB)) btns.push(`<span class="muted small">Chi ha vinto?</span>
      <button class="btn btn-small" data-act="report" data-id="${m.id}" data-w="${m.teamA}">${esc(A?.name || "A")}</button>
      <button class="btn btn-small" data-act="report" data-id="${m.id}" data-w="${m.teamB}">${esc(B?.name || "B")}</button>`);
    else if (a || b) btns.push(`<span class="muted small">Risultato inviato, in attesa dell'altra squadra.</span>`);
  }
  if (m.status === "scheduled" && m.type === "external" && a && past) btns.push(`<button class="btn btn-small" data-act="done" data-id="${m.id}">Segna come svolta</button>`);
  if (["scheduled", "challenged", "proposed"].includes(m.status) && (a || b || (m.proposedBy === meId() && m.status === "proposed"))) btns.push(`<button class="btn btn-small btn-danger" data-act="cancel" data-id="${m.id}">Annulla</button>`);
  if (["completed", "disputed"].includes(m.status) && m.type === "challenge" && [...(m.playersA || []), ...(m.playersB || [])].includes(meId()))
    btns.push(`<button class="btn btn-small btn-ghost" data-act="appeal" data-id="${m.id}">Fai appello</button>`);
  const result = m.status === "completed" && m.type === "challenge" && m.winner ? `<div class="result">Vince <strong>${esc(teamById[m.winner]?.name || "?")}</strong></div>` : "";
  const proposer = userById[m.proposedBy];
  return `<div class="match status-${m.status}">
    <div class="match-top"><span class="tag">${m.type === "external" ? "Evento esterno" : "Sfida"}</span><span class="tag tag-${m.status}">${label}</span><span class="when">${fmtDate(m.date)} · ${esc(m.time)}</span></div>
    <div class="versus">${side(A)}<span class="vs">VS</span>${side(B, m.opponent)}</div>
    ${result}${sub ? `<p class="muted small">${sub}</p>` : ""}${proposer && m.status === "proposed" ? `<p class="muted small">Proposta da ${esc(proposer.username)}</p>` : ""}
    ${btns.length ? `<div class="row actions">${btns.join("")}</div>` : ""}
  </div>`;
}

function bindMatchActions(teamById, refresh) {
  onClick("[data-act]", async ds => {
    const ref = doc(db, "matches", ds.id);
    const m = { id: ds.id, ...(await getDoc(ref)).data() };
    const now = { updatedAt: serverTimestamp() };
    switch (ds.act) {
      case "approve":
        await updateDoc(ref, { ...now, status: m.type === "challenge" ? "challenged" : "scheduled", organizedBy: meId() });
        toast(m.type === "challenge" ? "Sfida inviata all'avversario." : "Evento in programma."); break;
      case "decline":
        await updateDoc(ref, { ...now, status: "declined" }); break;
      case "accept": {
        await updateDoc(ref, {
          ...now, status: "scheduled", acceptedBy: meId(),
          playersA: teamById[m.teamA]?.members || [], playersB: teamById[m.teamB]?.members || []
        });
        toast("Sfida accettata!"); break;
      }
      case "report": {
        const mine = orgOf(m.teamA, teamById) && !m.reportA ? "reportA" : "reportB";
        const other = mine === "reportA" ? m.reportB : m.reportA;
        const upd = { ...now, [mine]: ds.w };
        if (other) {
          if (other === ds.w) { upd.status = "completed"; upd.winner = ds.w; }
          else upd.status = "disputed";
        }
        await updateDoc(ref, upd);
        toast(upd.status === "disputed" ? "I risultati non coincidono: la partita passa all'admin." : "Risultato salvato."); break;
      }
      case "done":
        await updateDoc(ref, { ...now, status: "completed" }); break;
      case "cancel":
        if (!confirm("Annullare questa partita?")) return;
        await updateDoc(ref, { ...now, status: "cancelled" }); break;
      case "appeal": {
        const text = prompt("Spiega all'amministratore cosa non va nel risultato:");
        if (!text || !text.trim()) return;
        await addDoc(collection(db, "appeals"), { matchId: m.id, uid: meId(), text: text.trim().slice(0, 500), status: "open", createdAt: serverTimestamp() });
        toast("Appello inviato all'amministratore."); break;
      }
    }
    refresh();
  });
}

async function viewMatches() {
  loading();
  const [users, teams, matches] = await Promise.all([loadUsers(), loadTeams(), loadMatches()]);
  const teamById = Object.fromEntries(teams.map(t => [t.id, t]));
  const userById = Object.fromEntries(users.map(u => [u.id, u]));
  const myTeamIds = new Set(teams.filter(t => t.members?.includes(meId())).map(t => t.id));
  const mine = matches.filter(m => myTeamIds.has(m.teamA) || myTeamIds.has(m.teamB));
  const todo = mine.filter(m => needsMyAction(m, teamById));
  const todoIds = new Set(todo.map(m => m.id));
  const open = mine.filter(m => !todoIds.has(m.id) && ["proposed", "challenged", "scheduled", "disputed"].includes(m.status)).sort((a, b) => matchDateTime(a) - matchDateTime(b));
  const closed = mine.filter(m => ["completed", "declined", "cancelled"].includes(m.status)).sort((a, b) => matchDateTime(b) - matchDateTime(a));
  const sec = (title, arr, empty) => `<section class="card"><h2>${title}</h2>${arr.map(m => matchCard(m, teamById, userById)).join("") || `<p class="muted">${empty}</p>`}</section>`;
  app.innerHTML = sec("Da fare", todo, "Niente da fare.") + sec("In corso e in programma", open, "Nessuna partita aperta.") + sec("Storico", closed.slice(0, 30), "Nessuna partita conclusa.");
  bindMatchActions(teamById, viewMatches);
}

// ======================= Classifica =======================
async function viewLeaderboard() {
  loading();
  const [users, teams, matches, avail] = await Promise.all([loadUsers(), loadTeams(), loadMatches(), loadAvailability()]);
  const stats = Object.values(computeStats(users, teams, matches, avail));
  const cats = [
    { key: "hours", title: "Più ore di disponibilità", bad: "Meno ore di disponibilità", unit: "ore" },
    { key: "played", title: "Più partite giocate", bad: "Meno partite giocate", unit: "partite" },
    { key: "organized", title: "Più partite organizzate", bad: "Meno partite organizzate", unit: "partite" }
  ];
  const podium = (arr, key, unit) => {
    const top = arr.slice(0, 3);
    const order = [1, 0, 2].filter(i => top[i]);
    return `<div class="podium">${order.map(i => `<div class="step step-${i + 1}">${avatar(top[i].user, 56)}<a href="#/player/${encodeURIComponent(top[i].user.username)}">${esc(top[i].user.username)}</a><span class="val">${top[i][key]} ${unit}</span><div class="block">${i + 1}</div></div>`).join("")}</div>`;
  };
  const bottom = (arr, render) => `<ol class="relegation">${arr.map(s => `<li>${userChip(s.user, 28)}<span class="val">${render(s)}</span></li>`).join("")}</ol>`;
  const records = teamRecords(teams, matches).filter(r => r.played).sort((a, b) => b.rate - a.rate || b.played - a.played);

  app.innerHTML = `
    <section class="hero small"><h1 class="glow">Classifica</h1><p class="muted">Globale tra tutti gli iscritti. Contano solo le sfide tra squadre del sito.</p></section>
    ${cats.map(c => {
      const sorted = [...stats].sort((a, b) => b[c.key] - a[c.key] || a.user.username.localeCompare(b.user.username));
      return `<section class="card"><h2>${c.title}</h2>${podium(sorted, c.key, c.unit)}</section>`;
    }).join("")}
    <section class="card relegation-zone"><h2>🔻 Zona retrocessione</h2>
      <div class="rel-grid">
        ${cats.map(c => `<div><h3>${c.bad}</h3>${bottom([...stats].sort((a, b) => a[c.key] - b[c.key] || a.user.username.localeCompare(b.user.username)).slice(0, 3), s => `${s[c.key]} ${c.unit}`)}</div>`).join("")}
        <div><h3>Non si vede da più tempo</h3>${bottom([...stats].sort((a, b) => tsMs(a.user.lastSeen) - tsMs(b.user.lastSeen)).slice(0, 3), s => timeAgo(s.user.lastSeen))}</div>
      </div>
    </section>
    <section class="card"><h2>Classifica squadre · win rate</h2>
      ${records.length ? `<table class="table"><thead><tr><th>#</th><th>Squadra</th><th>V</th><th>P</th><th>Win rate</th></tr></thead><tbody>
        ${records.map((r, i) => `<tr><td>${i + 1}</td><td><a class="team-inline" href="#/squadra/${r.team.id}">${crestSvg(r.team.crest, 28)} ${esc(r.team.name)}</a></td><td>${r.wins}</td><td>${r.losses}</td><td><strong>${Math.round(r.rate * 100)}%</strong></td></tr>`).join("")}
      </tbody></table>` : `<p class="muted">Ancora nessuna sfida conclusa.</p>`}
    </section>`;
}

// ======================= Giocatori / statistiche =======================
async function viewPlayers(username) {
  loading();
  const [users, teams, matches, avail] = await Promise.all([loadUsers(), loadTeams(), loadMatches(), loadAvailability()]);
  const stats = computeStats(users, teams, matches, avail);
  const approved = approvedOnly(users).sort((a, b) => a.username.localeCompare(b.username));
  const target = username ? approved.find(u => u.usernameLower === username.toLowerCase()) : null;
  let card = "";
  if (username && !target) card = `<section class="card"><p>Nessun giocatore con username <strong>${esc(username)}</strong>.</p></section>`;
  if (target) {
    const s = stats[target.id];
    const tt = teams.filter(t => t.members?.includes(target.id));
    card = `<section class="card player-card">
      <div class="player-head">${avatar(target, 96)}<div><h2>${esc(target.username)}</h2><p class="muted">${isOnline(target) ? '<span class="dot"></span> online ora' : "ultimo accesso: " + timeAgo(target.lastSeen)}</p></div></div>
      <div class="stats-row">
        <div class="stat"><span class="num cyan">${s.played}</span><span>partite giocate</span></div>
        <div class="stat"><span class="num">${s.wins}</span><span>vittorie</span></div>
        <div class="stat"><span class="num violet">${s.hours}</span><span>ore disponibilità</span></div>
        <div class="stat"><span class="num">${s.organized}</span><span>partite organizzate</span></div>
        <div class="stat"><span class="num">${s.teamsCreated}</span><span>squadre create</span></div>
      </div>
      <h3>Squadre</h3><div class="tiles">${tt.map(t => teamTile(t)).join("") || '<p class="muted">Nessuna.</p>'}</div>
    </section>`;
  }
  app.innerHTML = `
    <section class="card"><h2>Cerca un giocatore</h2>
      <form id="f" class="row"><input name="q" list="ulist" placeholder="Username" value="${esc(username || "")}" required><datalist id="ulist">${approved.map(u => `<option value="${esc(u.username)}">`).join("")}</datalist><button class="btn" type="submit">Cerca</button></form>
    </section>
    ${card}
    <section class="card"><h3>Tutti i giocatori (${approved.length})</h3><div class="chips">${approved.map(u => userChip(u)).join("")}</div></section>`;
  bindForm("#f", async fd => go(`#/player/${encodeURIComponent(fd.get("q").trim())}`));
}

// ======================= Profilo =======================
async function viewProfile() {
  loading();
  const [users, priv, brawlers] = await Promise.all([loadUsers(), getDoc(doc(db, "users", meId(), "private", "contact")), loadBrawlers()]);
  const contact = priv.exists() ? priv.data() : {};
  const me = users.find(u => u.id === meId()) || state.me;
  const delegates = (me.delegates || []).map(id => users.find(u => u.id === id)).filter(Boolean);
  const candidates = approvedOnly(users).filter(u => u.id !== meId() && !(me.delegates || []).includes(u.id)).sort((a, b) => a.username.localeCompare(b.username));

  app.innerHTML = `
    <section class="card player-head">${avatar(me, 96)}<div><h2>${esc(me.username)}</h2><p class="muted">${esc(contact.email || state.user.email)}${isAdmin() ? ' · <span class="badge">amministratore</span>' : ""}</p></div></section>
    <section class="card"><h3>Il tuo avatar</h3>
      <input id="bsearch" placeholder="Cerca un Brawler…">
      <div class="avatar-grid" id="agrid">${brawlers.map(b => `<button class="avatar-opt ${b.id === me.avatar ? "sel" : ""}" data-av="${b.id}" data-name="${esc(b.name.toLowerCase())}" title="${esc(b.name)}"><img src="${brawlerImg(b.id)}" alt="${esc(b.name)}" loading="lazy" onerror="this.parentElement.remove()"><span>${esc(b.name)}</span></button>`).join("")}</div>
    </section>
    <section class="card"><h3>Delega disponibilità</h3>
      <p class="muted small">Chi deleghi può inserire e modificare le tue disponibilità. Puoi revocare la delega quando vuoi.</p>
      <ul class="members">${delegates.map(u => `<li>${userChip(u)}<button class="btn btn-small btn-ghost" data-undel="${u.id}">Revoca</button></li>`).join("") || '<li class="muted">Nessuna delega attiva.</li>'}</ul>
      <form id="del" class="row"><select name="uid" required><option value="">Scegli un giocatore…</option>${candidates.map(u => `<option value="${u.id}">${esc(u.username)}</option>`).join("")}</select><button class="btn btn-small" type="submit">Delega</button></form>
    </section>
    <section class="card"><h3>Contatti</h3>
      <form id="contact" class="row"><label>Telefono<input name="phone" type="tel" pattern="[+0-9 ]{6,20}" value="${esc(contact.phone || "")}" required></label><button class="btn btn-small" type="submit">Salva</button></form>
      <p class="muted small">Email e telefono sono visibili solo a te e all'amministratore.</p>
      <button class="btn btn-ghost" id="pwreset">Cambia password (via email)</button>
    </section>`;

  $("#bsearch").oninput = e => { const q = e.target.value.toLowerCase(); $$(".avatar-opt").forEach(b => b.hidden = !b.dataset.name.includes(q)); };
  onClick("[data-av]", async ds => {
    await updateDoc(doc(db, "users", meId()), { avatar: Number(ds.av) });
    state.me.avatar = Number(ds.av);
    $$(".avatar-opt").forEach(b => b.classList.toggle("sel", b.dataset.av === ds.av));
    $(".player-head img").src = brawlerImg(Number(ds.av));
    toast("Avatar aggiornato.");
  });
  bindForm("#del", async fd => { await updateDoc(doc(db, "users", meId()), { delegates: arrayUnion(fd.get("uid")) }); toast("Delega attivata."); viewProfile(); });
  onClick("[data-undel]", async ds => { await updateDoc(doc(db, "users", meId()), { delegates: arrayRemove(ds.undel) }); toast("Delega revocata."); viewProfile(); });
  bindForm("#contact", async fd => { await setDoc(doc(db, "users", meId(), "private", "contact"), { phone: fd.get("phone").trim() }, { merge: true }); toast("Salvato."); });
  onClick("#pwreset", async () => { await sendPasswordResetEmail(auth, state.user.email, actionSettings()); toast("Ti abbiamo mandato l'email per cambiare password."); });
}

// ======================= Amministrazione =======================
async function viewAdmin(tab) {
  tab = ["richieste", "utenti", "squadre", "contestazioni"].includes(tab) ? tab : "richieste";
  loading();
  const [users, teams, matches, appealsSnap] = await Promise.all([loadUsers(), loadTeams(), loadMatches(), getDocs(collection(db, "appeals"))]);
  const appeals = appealsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const userById = Object.fromEntries(users.map(u => [u.id, u]));
  const teamById = Object.fromEntries(teams.map(t => [t.id, t]));
  const pending = users.filter(u => u.status === "pending");
  const contacts = {};
  await Promise.all(users.map(async u => { try { const s = await getDoc(doc(db, "users", u.id, "private", "contact")); contacts[u.id] = s.exists() ? s.data() : {}; } catch { contacts[u.id] = {}; } }));
  const disputed = matches.filter(m => m.status === "disputed");
  const openAppeals = appeals.filter(a => a.status === "open");
  const tabs = [["richieste", `Richieste (${pending.filter(u => u.emailVerified).length})`], ["utenti", "Utenti"], ["squadre", "Organizzatori"], ["contestazioni", `Contestazioni (${disputed.length + openAppeals.length})`]];
  const contactLine = u => `<span class="muted small">${esc(contacts[u.id]?.email || "")} · ${esc(contacts[u.id]?.phone || "")}</span>`;

  let body = "";
  if (tab === "richieste") {
    const ver = pending.filter(u => u.emailVerified), unver = pending.filter(u => !u.emailVerified);
    body = `<section class="card"><h2>Richieste da approvare</h2>
      <ul class="admin-list">${ver.map(u => `<li><div>${avatar(u, 32)} <strong>${esc(u.username)}</strong><br>${contactLine(u)}</div>
        <div class="row"><button class="btn btn-small" data-approve="${u.id}">Approva</button><button class="btn btn-small btn-danger" data-reject="${u.id}">Rifiuta</button></div></li>`).join("") || '<li class="muted">Nessuna richiesta.</li>'}</ul></section>
      <section class="card"><h3>In attesa di verifica email</h3><ul class="admin-list">${unver.map(u => `<li><div><strong>${esc(u.username)}</strong><br>${contactLine(u)}</div><button class="btn btn-small btn-ghost" data-reject="${u.id}">Elimina</button></li>`).join("") || '<li class="muted">Nessuna.</li>'}</ul></section>`;
  }
  if (tab === "utenti") {
    const all = users.filter(u => u.status !== "pending").sort((a, b) => a.username.localeCompare(b.username));
    body = `<section class="card"><h2>Utenti</h2><ul class="admin-list">${all.map(u => `<li><div>${avatar(u, 32)} <strong>${esc(u.username)}</strong> ${u.status === "banned" ? '<span class="badge badge-red">bannato</span>' : ""}<br>${contactLine(u)} <span class="muted small">· ${timeAgo(u.lastSeen)}</span></div>
      ${u.id === meId() ? '<span class="badge">tu</span>' : u.status === "banned" ? `<button class="btn btn-small" data-unban="${u.id}">Riattiva</button>` : `<button class="btn btn-small btn-danger" data-ban="${u.id}">Banna</button>`}</li>`).join("")}</ul></section>`;
  }
  if (tab === "squadre") {
    body = teams.sort((a, b) => a.name.localeCompare(b.name)).map(t => {
      const members = (t.members || []).map(id => userById[id]).filter(Boolean);
      return `<section class="card"><div class="team-inline">${crestSvg(t.crest, 40)} <h3>${esc(t.name)}</h3></div>
        <ul class="members">${members.map(u => `<li>${userChip(u, 28)} ${t.organizers?.includes(u.id)
          ? `<span class="badge">organizzatore</span><button class="btn btn-small btn-ghost" data-unorg="${u.id}" data-team="${t.id}">Togli ruolo</button>`
          : `<button class="btn btn-small" data-org="${u.id}" data-team="${t.id}">Rendi organizzatore</button>`}</li>`).join("")}</ul>
        <button class="btn btn-small btn-danger" data-delteam="${t.id}">Elimina squadra</button></section>`;
    }).join("") || `<section class="card"><p class="muted">Nessuna squadra.</p></section>`;
  }
  if (tab === "contestazioni") {
    const resolveBtns = m => `<div class="row actions"><span class="muted small">Vincitore:</span>
      <button class="btn btn-small" data-resolve="${m.id}" data-w="${m.teamA}">${esc(teamById[m.teamA]?.name || "A")}</button>
      <button class="btn btn-small" data-resolve="${m.id}" data-w="${m.teamB}">${esc(teamById[m.teamB]?.name || "B")}</button>
      <button class="btn btn-small btn-ghost" data-void="${m.id}">Annulla partita</button></div>`;
    body = `<section class="card"><h2>Risultati contestati</h2>${disputed.map(m => `${matchCard(m, teamById, userById)}
        <p class="muted small">${esc(teamById[m.teamA]?.name)} dice: vince ${esc(teamById[m.reportA]?.name || "?")} · ${esc(teamById[m.teamB]?.name)} dice: vince ${esc(teamById[m.reportB]?.name || "?")}</p>${resolveBtns(m)}`).join("") || '<p class="muted">Nessuno.</p>'}</section>
      <section class="card"><h2>Appelli aperti</h2>${openAppeals.map(a => {
        const m = matches.find(x => x.id === a.matchId);
        return `<div class="appeal"><p>${userChip(userById[a.uid], 28)}: “${esc(a.text)}”</p>${m ? matchCard(m, teamById, userById) + resolveBtns(m) : '<p class="muted">Partita non trovata.</p>'}
          <button class="btn btn-small btn-ghost" data-close="${a.id}">Chiudi appello senza modifiche</button></div>`;
      }).join("") || '<p class="muted">Nessuno.</p>'}</section>`;
  }

  app.innerHTML = `<section class="hero small"><h1 class="glow">Amministrazione</h1></section>
    <nav class="tabs">${tabs.map(([k, l]) => `<a href="#/admin/${k}" class="${k === tab ? "active" : ""}">${l}</a>`).join("")}</nav>${body}`;
  $$(".match .actions").forEach(el => el.remove());   // nel pannello admin si usano i pulsanti dedicati

  const reload = () => viewAdmin(tab);
  onClick("[data-approve]", async ds => { await updateDoc(doc(db, "users", ds.approve), { status: "approved" }); toast("Utente approvato."); reload(); });
  onClick("[data-reject]", async ds => {
    const u = userById[ds.reject];
    if (!confirm(`Rifiutare ed eliminare la richiesta di ${u.username}?`)) return;
    const b = writeBatch(db);
    b.delete(doc(db, "users", u.id, "private", "contact"));
    b.delete(doc(db, "usernames", u.usernameLower));
    b.delete(doc(db, "users", u.id));
    await b.commit(); toast("Richiesta rifiutata."); reload();
  });
  onClick("[data-ban]", async ds => { if (confirm(`Bannare ${userById[ds.ban].username}?`)) { await updateDoc(doc(db, "users", ds.ban), { status: "banned" }); reload(); } });
  onClick("[data-unban]", async ds => { await updateDoc(doc(db, "users", ds.unban), { status: "approved" }); reload(); });
  onClick("[data-org]", async ds => { await updateDoc(doc(db, "teams", ds.team), { organizers: arrayUnion(ds.org) }); reload(); });
  onClick("[data-unorg]", async ds => { await updateDoc(doc(db, "teams", ds.team), { organizers: arrayRemove(ds.unorg) }); reload(); });
  onClick("[data-delteam]", async ds => { if (confirm("Eliminare la squadra? Le partite restano nello storico.")) { await deleteDoc(doc(db, "teams", ds.delteam)); reload(); } });
  const closeAppeals = async (matchId, resolution) => {
    const b = writeBatch(db);
    openAppeals.filter(a => a.matchId === matchId).forEach(a => b.update(doc(db, "appeals", a.id), { status: "closed", resolution, closedAt: serverTimestamp() }));
    await b.commit();
  };
  onClick("[data-resolve]", async ds => {
    await updateDoc(doc(db, "matches", ds.resolve), { status: "completed", winner: ds.w, reportA: ds.w, reportB: ds.w, resolvedByAdmin: true, updatedAt: serverTimestamp() });
    await closeAppeals(ds.resolve, "winner:" + ds.w); toast("Risultato aggiornato."); reload();
  });
  onClick("[data-void]", async ds => {
    await updateDoc(doc(db, "matches", ds.void), { status: "cancelled", resolvedByAdmin: true, updatedAt: serverTimestamp() });
    await closeAppeals(ds.void, "cancelled"); toast("Partita annullata."); reload();
  });
  onClick("[data-close]", async ds => { await updateDoc(doc(db, "appeals", ds.close), { status: "closed", resolution: "rejected", closedAt: serverTimestamp() }); reload(); });
}
