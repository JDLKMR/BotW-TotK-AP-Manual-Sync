/*
 * Optional command-line arguments (identical on Windows and Linux):
 *   --server <host>:<port>        Archipelago server (port optional: the current port setting is kept when omitted)
 *   --botw-slot <slot>            slot name for Breath of the Wild
 *   --totk-slot <slot>            slot name for Tears of the Kingdom
 *   --password <password>         room password
 *   --enable-botw <true|false>    turn BotW syncing on/off
 *   --enable-totk <true|false>    turn TotK syncing on/off
 * "--flag=value" works too (handy for values that start with "--"). Anything not listed here is ignored.
 * Pure Node (no Electron) so it can be unit-tested.
 */
const FLAGS = {
  '--server': 'server', '--botw-slot': 'botwSlot', '--totk-slot': 'totkSlot', '--password': 'password',
  '--enable-botw': 'enableBotw', '--enable-totk': 'enableTotk'
};
const TRUE = new Set(['true', '1', 'yes', 'on']); const FALSE = new Set(['false', '0', 'no', 'off']);

function parseBool(v) { const s = String(v).trim().toLowerCase(); return TRUE.has(s) ? true : FALSE.has(s) ? false : null; }

/* "host", "host:port", "ws://host:port", "wss://host", "[::1]:port" -> { host, port|undefined } or { error } */
function parseServer(raw) {
  let s = String(raw).trim(); if (!s) return { error: 'empty value' };
  let scheme = ''; const m = s.match(/^(wss?):\/\//i); if (m) { scheme = m[1].toLowerCase() + '://'; s = s.slice(m[0].length); }
  s = s.replace(/\/.*$/, ''); // drop any path
  let host = s, port;
  const v6 = s.match(/^(\[[^\]]+\])(?::(\d*))?$/);
  if (v6) { host = v6[1]; if (v6[2]) port = v6[2]; }
  else if ((s.match(/:/g) || []).length === 1) { const i = s.indexOf(':'); host = s.slice(0, i); port = s.slice(i + 1); }
  if (!host) return { error: 'missing host' };
  if (port !== undefined && port !== '') {
    if (!/^\d+$/.test(port) || +port < 1 || +port > 65535) return { error: `invalid port "${port}"` };
    port = parseInt(port, 10);
  } else port = undefined;
  return { host: scheme + host, port };
}

/* argv: process.argv (or any array of tokens). Returns { values, errors } - values only holds what was given and valid. */
function parseArgs(argv) {
  const values = {}, errors = [], toks = Array.from(argv || []).map(String);
  for (let i = 0; i < toks.length; i++) {
    const m = toks[i].match(/^(--[A-Za-z][\w-]*)(?:=([\s\S]*))?$/);
    if (!m || !FLAGS[m[1].toLowerCase()]) continue;
    const flag = m[1].toLowerCase(), key = FLAGS[flag]; let val;
    if (m[2] !== undefined) val = m[2];
    else {
      const next = toks[i + 1];
      if (next === undefined || (next.startsWith('--') && FLAGS[next.split('=')[0].toLowerCase()])) { errors.push(`${flag}: missing value`); continue; }
      val = next; i++;
    }
    if (key === 'server') { const r = parseServer(val); if (r.error) { errors.push(`${flag}: ${r.error}`); continue; } values.server = r.host; if (r.port !== undefined) values.port = r.port; else delete values.port; }
    else if (key === 'enableBotw' || key === 'enableTotk') { const b = parseBool(val); if (b === null) { errors.push(`${flag}: expected true or false, got "${val}"`); continue; } values[key] = b; }
    else values[key] = val;
  }
  return { values, errors };
}

/* Applies parsed values to the settings object (mutates it). Returns human-readable lines for the log (never the password itself). */
function applyToSettings(data, values) {
  const notes = [];
  if (values.server !== undefined) { data.server = values.server; notes.push(`server = ${values.server}`); }
  if (values.port !== undefined) { data.port = values.port; notes.push(`port = ${values.port}`); }
  if (values.password !== undefined) { data.password = values.password; notes.push('password set'); }
  if (values.botwSlot !== undefined) { data.games.botw.slot = values.botwSlot; notes.push(`BotW slot = ${values.botwSlot}`); }
  if (values.totkSlot !== undefined) { data.games.totk.slot = values.totkSlot; notes.push(`TotK slot = ${values.totkSlot}`); }
  if (values.enableBotw !== undefined) { data.games.botw.enabled = values.enableBotw; notes.push(`BotW syncing ${values.enableBotw ? 'enabled' : 'disabled'}`); }
  if (values.enableTotk !== undefined) { data.games.totk.enabled = values.enableTotk; notes.push(`TotK syncing ${values.enableTotk ? 'enabled' : 'disabled'}`); }
  return notes;
}
module.exports = { parseArgs, parseServer, applyToSettings, FLAGS };
