// ---------- Stemmi neon originali per le squadre ----------
export const CREST_SHAPES = {
  scudo: '<path d="M50 6 L88 20 L84 58 C80 78 64 90 50 96 C36 90 20 78 16 58 L12 20 Z"/>',
  esagono: '<polygon points="50,4 92,28 92,72 50,96 8,72 8,28"/>',
  cerchio: '<circle cx="50" cy="50" r="44"/>',
  rombo: '<polygon points="50,4 96,50 50,96 4,50"/>',
  bandiera: '<path d="M14 8 H86 V70 L50 94 L14 70 Z"/>'
};
function starPoints(cx, cy, r1, r2, n = 5) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? r2 : r1, a = Math.PI / n * i - Math.PI / 2;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(" ");
}
export const CREST_SYMBOLS = {
  fulmine: '<polygon points="56,20 30,56 47,56 42,82 70,44 53,44"/>',
  stella: `<polygon points="${starPoints(50, 52, 26, 11)}"/>`,
  corona: '<polygon points="28,66 72,66 76,36 62,50 50,30 38,50 24,36"/>',
  fiamma: '<path d="M50 18 C62 36 74 44 68 64 C64 78 36 78 32 64 C28 50 40 44 44 32 C46 44 52 46 50 18 Z"/>',
  vetta: '<polygon points="50,24 76,72 24,72"/><polygon points="50,40 62,62 38,62" fill="#0d0d16"/>',
  mirino: '<circle cx="50" cy="52" r="18" fill="none" stroke-width="5"/><rect x="47" y="24" width="6" height="56"/><rect x="22" y="49" width="56" height="6"/>',
  ali: '<path d="M50 40 C38 28 20 28 14 36 C24 38 30 44 32 52 C24 50 18 52 16 56 C28 56 36 62 40 70 L50 62 L60 70 C64 62 72 56 84 56 C82 52 76 50 68 52 C70 44 76 38 86 36 C80 28 62 28 50 40 Z"/>',
  teschio: '<path d="M50 24 C34 24 26 36 28 50 C29 56 32 58 34 60 L34 70 L66 70 L66 60 C68 58 71 56 72 50 C74 36 66 24 50 24 Z"/><circle cx="41" cy="48" r="6" fill="#0d0d16"/><circle cx="59" cy="48" r="6" fill="#0d0d16"/>'
};
export const CREST_COLORS = {
  viola: "#b026ff", ciano: "#00e5ff", fucsia: "#ff2bd6", verde: "#39ff14",
  arancio: "#ff8a00", giallo: "#ffe600", rosso: "#ff1f4b", blu: "#3d7bff"
};
export const DEFAULT_CREST = { shape: "scudo", symbol: "fulmine", color: "viola" };

export function crestSvg(crest, size = 48) {
  const c = { ...DEFAULT_CREST, ...(crest || {}) };
  const col = CREST_COLORS[c.color] || CREST_COLORS.viola;
  return `<svg class="crest" width="${size}" height="${size}" viewBox="0 0 100 100" aria-hidden="true" style="filter:drop-shadow(0 0 6px ${col})">
    <g fill="#0d0d16" stroke="${col}" stroke-width="4" stroke-linejoin="round">${CREST_SHAPES[c.shape] || CREST_SHAPES.scudo}</g>
    <g fill="${col}" stroke="${col}">${CREST_SYMBOLS[c.symbol] || CREST_SYMBOLS.fulmine}</g>
  </svg>`;
}

// ---------- Avatar: Brawler ufficiali (Fan Content Policy Supercell) ----------
export const DEFAULT_AVATAR = 16000000;
export const brawlerImg = id => `https://cdn.brawlify.com/brawlers/borderless/${id || DEFAULT_AVATAR}.png`;

let brawlerCache = null;
export async function loadBrawlers() {
  if (brawlerCache) return brawlerCache;
  try {
    const saved = sessionStorage.getItem("brawlers");
    if (saved) return (brawlerCache = JSON.parse(saved));
  } catch {}
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const r = await fetch("https://api.brawlapi.com/v1/brawlers", { signal: ctrl.signal });
    clearTimeout(t);
    const data = await r.json();
    brawlerCache = data.list
      .filter(b => b.released !== false)
      .map(b => ({ id: b.id, name: b.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
    try { sessionStorage.setItem("brawlers", JSON.stringify(brawlerCache)); } catch {}
  } catch {
    // Se l'elenco online non risponde, mostriamo comunque le immagini per ID.
    brawlerCache = Array.from({ length: 90 }, (_, i) => ({ id: 16000000 + i, name: `Brawler ${i + 1}` }));
  }
  return brawlerCache;
}
