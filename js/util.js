export const USERNAME_RE = /^[A-Za-z0-9]{8,20}$/;
export const WEEKDAYS = ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"];
export const WEEKDAYS_SHORT = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"];
export const ONLINE_MS = 3 * 60 * 1000;

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function passwordChecks(pw) {
  return [
    { ok: pw.length >= 8, label: "Almeno 8 caratteri" },
    { ok: /[A-Z]/.test(pw), label: "Una lettera maiuscola" },
    { ok: /[a-z]/.test(pw), label: "Una lettera minuscola" },
    { ok: /[0-9]/.test(pw), label: "Un numero" },
    { ok: /[^A-Za-z0-9]/.test(pw), label: "Un carattere speciale" }
  ];
}
export const passwordOk = pw => passwordChecks(pw).every(c => c.ok);

export const toMin = t => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
export const minToStr = m => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export function dateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function parseDate(ds) { const [y, m, d] = ds.split("-").map(Number); return new Date(y, m - 1, d); }
export function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
export function fmtDate(ds) {
  const d = parseDate(ds);
  return `${WEEKDAYS_SHORT[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}
export function matchDateTime(m) { const d = parseDate(m.date); const mins = toMin(m.time); d.setMinutes(mins); return d; }

export const tsMs = ts => (ts && typeof ts.toMillis === "function") ? ts.toMillis() : 0;
export const isOnline = u => Date.now() - tsMs(u.lastSeen) < ONLINE_MS;
export function timeAgo(ts) {
  const ms = tsMs(ts);
  if (!ms) return "mai";
  const diff = Date.now() - ms;
  if (diff < ONLINE_MS) return "online ora";
  const min = Math.floor(diff / 60000);
  if (min < 60) return `${min} min fa`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} ore fa`;
  const g = Math.floor(h / 24);
  return g === 1 ? "1 giorno fa" : `${g} giorni fa`;
}

export function toast(msg, kind = "ok") {
  const el = document.createElement("div");
  el.className = `toast toast-${kind}`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.classList.add("show"), 10);
  setTimeout(() => { el.classList.remove("show"); setTimeout(() => el.remove(), 300); }, 3500);
}

export function errMsg(e) {
  const code = e?.code || "";
  const map = {
    "auth/invalid-credential": "Email o password non corretti.",
    "auth/wrong-password": "Email o password non corretti.",
    "auth/user-not-found": "Email o password non corretti.",
    "auth/email-already-in-use": "Esiste già un account con questa email.",
    "auth/invalid-email": "Indirizzo email non valido.",
    "auth/weak-password": "Password troppo debole.",
    "auth/too-many-requests": "Troppi tentativi, riprova tra qualche minuto.",
    "auth/network-request-failed": "Problema di connessione, riprova.",
    "auth/unauthorized-continue-uri": "Dominio non autorizzato in Firebase (vedi README, passo 4).",
    "permission-denied": "Operazione non permessa."
  };
  return map[code] || e?.message || "Errore imprevisto.";
}
