/* Tiny JSON persistence (settings + ledger) in the app data dir. */
const fs = require('fs'); const path = require('path');
class JsonStore {
  constructor(file, defaults) { this.file = file; this.data = JSON.parse(JSON.stringify(defaults)); this._load(defaults); }
  _load(defaults) { try { const d = JSON.parse(fs.readFileSync(this.file, 'utf8')); this.data = deepMerge(JSON.parse(JSON.stringify(defaults)), d); } catch (_) {} }
  save() { fs.mkdirSync(path.dirname(this.file), { recursive: true }); const t = this.file + '.tmp'; fs.writeFileSync(t, JSON.stringify(this.data, null, 2)); fs.renameSync(t, this.file); }
}
function deepMerge(a, b) { for (const k of Object.keys(b || {})) { if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] && typeof a[k] === 'object') deepMerge(a[k], b[k]); else a[k] = b[k]; } return a; }
const DEFAULT_SETTINGS = {
  server: 'archipelago.gg', port: 38281, password: '',
  minimizeToTray: true, closeToTray: true, startMinimized: false, launchAtLogin: false, pollMs: 1500, keepBackups: 15, ignoreStartItems: true, removeUnreceivedArmor: true,
  games: { botw: { enabled: false, slot: '', saveDir: '', ballad: { rito: true, goron: true, zora: true, gerudo: true } }, totk: { enabled: false, slot: '', saveDir: '' } }
};
module.exports = { JsonStore, DEFAULT_SETTINGS };
