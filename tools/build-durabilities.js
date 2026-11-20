// Builds src/main/durabilities.json from every CSV in data/durability/<botw|totk>/.
// Values are stored as IN-GAME durability. (BotW's save wants value x100; rules.js applies that, TotK is raw.)
// Understands two layouts: "Name"/"Weapon"/"Shield"/"Bow" column + "Durability" column, including
// the BotW chart's several side-by-side blocks (Weapon,Damage,Durability,Total Use ... repeated).
const fs = require('fs'), path = require('path');
function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
const NAME_HDR = new Set(['name', 'weapon', 'shield', 'bow', 'weapon name', 'item']);
function extract(rows) {
  const out = {}; let cols = [];
  for (const r of rows) {
    const low = r.map(c => c.trim().toLowerCase());
    const durCols = low.map((c, i) => c === 'durability' ? i : -1).filter(i => i >= 0);
    if (durCols.length) {
      cols = durCols.map(d => { for (let k = d - 1; k >= 0; k--) if (NAME_HDR.has(low[k])) return [k, d]; return null; }).filter(Boolean);
      continue;
    }
    for (const [n, d] of cols) {
      const name = (r[n] || '').trim(), v = parseFloat(String(r[d] || '').replace(/,/g, ''));
      if (name && isFinite(v) && !(name in out)) out[name] = v;
    }
  }
  return out;
}
const root = path.join(__dirname, '..'), result = { botw: {}, totk: {} };
for (const game of ['botw', 'totk']) {
  const dir = path.join(root, 'data', 'durability', game);
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir).filter(f => /\.csv$/i.test(f)).sort()) {
    const got = extract(parseCsv(fs.readFileSync(path.join(dir, f), 'utf8')));
    console.log(`${game}: ${f} -> ${Object.keys(got).length} entries`);
    Object.assign(result[game], got);
  }
}
fs.writeFileSync(path.join(root, 'src', 'main', 'durabilities.json'), JSON.stringify(result, null, 1));
for (const [g, names] of [['botw', ['Royal Broadsword', 'Royal Shield', 'Savage Lynel Shield', 'Royal Bow', 'Savage Lynel Bow', 'Hylian Shield', 'Bow of Light', 'Master Sword']], ['totk', ['Royal Broadsword', 'Royal Shield', 'Savage Lynel Shield', 'Royal Bow', 'Savage Lynel Bow', 'Hylian Shield']]])
  console.log(g, names.map(n => `${n}=${result[g][n] ?? '—'}`).join(' | '));
