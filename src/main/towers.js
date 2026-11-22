/*
 * Tower lists + teleport coordinates.
 * Dropdown order = the internal tower numbering (see BOTW_TOWERS / TOTK_TOWERS in rules.js), except that
 * Great Plateau Tower (BotW) / Lookout Landing Skyview Tower (TotK) come first.
 *
 * Coordinates are read from plain .txt files (one tower per line: the tower's name followed by X Y Z; the LAST three numbers on a line
 * are used, so "Hebra Tower: -3,654.2 ..." style labels are fine). The values are the ones the save editors show in their
 * Position X / Y / Z boxes. Looked up in <user data>/towers/ first, then src/main/towers/. A file belongs to a game when its
 * name contains botw|breath|sheikah (BotW) or totk|tears|skyview (TotK). Towers without coordinates stay greyed out in the app.
 */
const fs = require('fs'); const path = require('path');
const { BOTW_TOWERS, TOTK_TOWERS } = require('./rules');

const KEYWORDS = { botw: ['botw', 'breath', 'sheikah'], totk: ['totk', 'tears', 'skyview'] };
const norm = (s) => String(s).toLowerCase().replace(/[^a-z]/g, '');

function defs(game) {
  const map = game === 'botw' ? BOTW_TOWERS : TOTK_TOWERS, suffix = game === 'botw' ? /\s+Tower$/ : /\s+Skyview Tower$/;
  const all = Object.entries(map).map(([item, id]) => ({ id, item, label: item.replace(suffix, '') })).sort((a, b) => a.id.localeCompare(b.id));
  const first = game === 'botw' ? '07' : '01';
  return [all.find(d => d.id === first)].concat(all.filter(d => d.id !== first));
}

function parseCoordText(text, list) {
  const out = {}, byLen = list.slice().sort((a, b) => norm(b.label).length - norm(a.label).length), numRe = /-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi;
  const rows = [];
  String(text).split(/\r?\n/).forEach(line => {
    if (!line.trim() || /^\s*(#|\/\/)/.test(line)) return;
    const nums = (line.replace(/,(?=\d{3}\b)/g, '').match(numRe) || []).map(Number); if (nums.length < 3) return;
    const xyz = nums.slice(-3), n = norm(line.replace(numRe, ' ')), hit = byLen.find(d => n.includes(norm(d.label)));
    rows.push({ hit, xyz });
  });
  rows.forEach(r => { if (r.hit && !out[r.hit.id]) out[r.hit.id] = { x: r.xyz[0], y: r.xyz[1], z: r.xyz[2] }; });
  if (!Object.keys(out).length && rows.length === list.length) { // no names at all: lines are in internal order
    list.slice().sort((a, b) => a.id.localeCompare(b.id)).forEach((d, i) => { out[d.id] = { x: rows[i].xyz[0], y: rows[i].xyz[1], z: rows[i].xyz[2] }; });
  }
  return out;
}

function loadCoords(game, dirs) {
  const list = defs(game), res = {};
  for (const dir of [].concat(dirs || []).reverse()) { // later = higher priority, so the user-data folder (listed first) wins
    let files = []; try { files = fs.readdirSync(dir).filter(f => /\.txt$/i.test(f) && KEYWORDS[game].some(k => f.toLowerCase().includes(k))).sort(); } catch (_) { continue; }
    for (const f of files) { try { Object.assign(res, parseCoordText(fs.readFileSync(path.join(dir, f), 'utf8'), list)); } catch (_) { /* unreadable file: skip */ } }
  }
  return res;
}

function describe(dirs) {
  const o = {};
  for (const game of ['botw', 'totk']) { const c = loadCoords(game, dirs); o[game] = defs(game).map(d => ({ id: d.id, item: d.item, label: d.label, hasCoords: !!c[d.id] })); }
  return o;
}
/* ids of the towers received so far, from a {itemName: count} map */
function receivedIds(game, counts) { return defs(game).filter(d => (counts[d.item] || 0) > 0).map(d => d.id); }
const defById = (game, id) => defs(game).find(d => d.id === id) || null;

module.exports = { defs, parseCoordText, loadCoords, describe, receivedIds, defById };
