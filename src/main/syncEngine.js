/*
 * SyncManager: wires Archipelago connections (one per enabled game/slot) to save-file watchers.
 *
 * Flow per game:
 *   AP items arrive -> counted by name -> "awaiting save" if anything is new
 *   player saves in-game -> file mtime/size changes -> settle -> verify lineage of our previous write
 *   -> build plan (counts vs ledger) -> run the real save-editor code -> back up + overwrite the save
 */
const { EventEmitter } = require('events');
const fs = require('fs'); const path = require('path');
const { APClient } = require('./apClient');
const { buildPlan, loadItemInfo, APWORLDS } = require('./rules');
const S = require('./saveStore');
const T = require('./towers');

const GAMES = {
  botw: { label: 'Breath of the Wild', saveFile: 'game_data.sav' },
  totk: { label: 'Tears of the Kingdom', saveFile: 'progress.sav' }
};
const countNames = (names) => names.reduce((m, n) => (m[n] = (m[n] || 0) + 1, m), {});
const sigOf = (counts) => Object.keys(counts).sort().map(k => k + '=' + counts[k]).join('|');

class GameSync extends EventEmitter {
  constructor({ key, settings, ledgerStore, host, dirs, armorNames, progNames }) {
    super();
    Object.assign(this, { key, settings, ledgerStore, host, dirs, armorNames, progNames: progNames || new Set() });
    this.def = GAMES[key]; this.apState = 'stopped'; this.apDetail = ''; this.saveState = 'unknown';
    this.busy = false; this.baseline = null; this.cand = null; this.candSince = 0; this.lastMessage = '';
  }
  get cfg() { return this.settings.data.games[this.key]; }
  get L() { return this.ledgerStore.data[this.key]; }
  get file() { return S.resolveSavePath(this.cfg.saveDir, this.def.saveFile); }
  log(level, msg) { this.emit('log', { game: this.key, level, msg, t: Date.now() }); }
  pruneActive() { return this.settings.data.removeUnreceivedArmor !== false && !!this.L.seedKey; }
  towerCfg() { return Object.assign({ unlockWarps: true, teleportTo: '' }, this.cfg.towers || {}); }
  ctx() { return { vendorDir: this.dirs.vendorDir, armorNames: this.armorNames, pruneArmor: this.pruneActive(), ballad: this.key === 'botw' ? (this.cfg.ballad || {}) : undefined, towers: this.towerCfg(), towerCoords: T.loadCoords(this.key, this.dirs.towerDirs) }; }

  counts() { return countNames(this.L.receivedNames || []); }
  startCounts() { return this.L.startCounts || {}; }
  /* what is already in the save: our ledger, plus the start inventory (the template save already contains it) */
  effConfirmed() {
    const c = Object.assign({}, this.L.confirmed || {}), st = this.startCounts(), pc = (this.L.pending && this.L.pending.confirmed) || {};
    for (const k of Object.keys(st)) c[k] = Math.max(c[k] || 0, st[k]);
    for (const k of Object.keys(pc)) c[k] = Math.max(c[k] || 0, pc[k]); // written to the save but not yet seen in a later game save: counts as applied for display
    return c;
  }
  balladBits() { const b = (this.cfg.ballad) || {}; return ['rito', 'goron', 'zora', 'gerudo'].map(k => (b[k] === false ? 0 : 1)).join(''); }
  /* signature of a save with nothing written yet. Starting with "Unlock Tower Warps" off is part of it: with no tower items there is nothing in the save to change, so a fresh seed is "up to date" */
  baseSig() { return (this.key === 'botw' ? '|ballad=1111' : '') + this.warpSig(); }
  warpSig() { return this.towerCfg().unlockWarps === false ? '|nowarp' : ''; }
  /* option part of the signature: only non-default values add a token, so existing ledgers stay "up to date" after an upgrade */
  towerSig() { const t = this.towerCfg(); return this.warpSig() + (t.teleportTo ? '|tp=' + t.teleportTo : ''); }
  currentSig() { return sigOf(this.nonStartCounts()) + (this.key === 'botw' ? '|ballad=' + this.balladBits() : '') + this.towerSig(); }
  nonStartCounts() { const c = this.counts(), st = this.startCounts(), o = {}; for (const k of Object.keys(c)) { const n = c[k] - (st[k] || 0); if (n > 0) o[k] = n; } return o; }
  /* something new for the player to save-and-reload for (NOT the pending lineage check: that must not keep the UI at "awaiting") */
  needsWork() { const L = this.L; return !!(L.retry || this.currentSig() !== (L.lastSig == null ? this.baseSig() : L.lastSig)); }
  shouldProcess() { return this.needsWork() || !!this.L.pending || this.pruneActive(); }
  pendingProgression() { const c = this.counts(), conf = this.effConfirmed(), prog = this.L.progNames || {}; let n = 0; for (const k of Object.keys(c)) if (prog[k] || this.progNames.has(k)) n += Math.max(0, c[k] - (conf[k] || 0)); return n; }
  pendingItems() { const c = this.counts(), conf = this.effConfirmed(); let n = 0; for (const k of Object.keys(c)) n += Math.max(0, c[k] - (conf[k] || 0)); return n; }
  status() {
    return { key: this.key, label: this.def.label, enabled: !!this.cfg.enabled, ap: this.apState, apDetail: this.apDetail, save: this.saveState, file: this.file,
      awaitingSave: this.needsWork(), items: (this.L.receivedNames || []).length, startItems: Object.values(this.startCounts()).reduce((a, b) => a + b, 0), pendingItems: this.pendingItems(), pendingProgression: this.pendingProgression(), lastApply: this.L.lastApply || null, message: this.lastMessage, busy: this.busy, towers: T.receivedIds(this.key, this.counts()) };
  }
  emitStatus() { this.emit('status', this.status()); }

  /* ---- AP side ---- */
  attachAp(client) {
    this.ap = client;
    client.on('state', (s, d) => { this.apState = s; this.apDetail = d || ''; this.emitStatus(); });
    client.on('log', (lvl, m) => this.log(lvl, m));
    client.on('connected', ({ seedName }) => { this.log('info', `Connected to Archipelago as "${client.slot}" (seed ${seedName})`); });
    client.on('items', (items, fresh, isFull) => this.onItems(client, items, fresh, isFull));
  }
  onItems(client, items, fresh, isFull) {
    const seedKey = `${client.seedName}|${client.slot}`;
    let isNewSeed = false;
    if (this.L.seedKey !== seedKey) {
      if (this.L.seedKey) this.log('warn', 'Different seed/slot than last time: starting a fresh ledger for this game.');
      isNewSeed = true;
      this.ledgerStore.data[this.key] = { seedKey, receivedNames: [], confirmed: {}, pending: null, lastSig: null, retry: false, sigVersion: 3 };
    }
    /* The server's item list only ever grows. If a full list arrives that does NOT continue the one we remember, the room was reset/restarted
       (same seed name, empty list): the old ledger would wrongly say those items are already in the save, so start a fresh one. */
    const names = items.map(i => i.name);
    if (!isNewSeed && isFull) {
      const prev = this.L.receivedNames || [];
      if (prev.length && (names.length < prev.length || prev.some((n, i) => names[i] !== n))) {
        this.log('warn', 'The server\'s item list does not continue the one remembered from before (room reset or restarted?). Starting a fresh ledger for this game.');
        this.ledgerStore.data[this.key] = { seedKey, receivedNames: [], confirmed: {}, pending: null, lastSig: null, retry: false, sigVersion: 3 };
      }
    }
    this.L.receivedNames = names;
    this.L.progNames = this.L.progNames || {};
    items.forEach(i => { if (i.flags & 1) this.L.progNames[i.name] = true; }); // NetworkItem.flags bit 0 = progression
    /* Start inventory = items the server sends with location -2 (Manual puts its starting_items there via push_precollected).
       The template save already contains them, so they count as applied, whatever the ledger history is. */
    const startNames = this.settings.data.ignoreStartItems !== false ? items.filter(i => i.location === -2).map(i => i.name) : [];
    this.L.startCounts = countNames(startNames);
    /* older ledgers stored a different signature format: a signature that matched the items back then means "up to date" */
    if ((this.L.sigVersion || 1) < 3) {
      const old = this.L.lastSig;
      if (old && (old === sigOf(this.counts()) || old === sigOf(this.nonStartCounts()))) this.L.lastSig = this.currentSig();
      else if (!old) this.L.lastSig = null;
      else this.L.lastSig = 'outdated';
      this.L.sigVersion = 3;
    }
    if (isFull) this.log('info', startNames.length ? `Start inventory recognized: ${startNames.length} item(s) are treated as already in your save.` : `No start-inventory items recognized among ${items.length} received item(s).`);
    this.ledgerStore.save();
    const label = (i) => (i.location === -2 ? 'start inventory' : client.playerName(i.player));
    fresh.slice(0, 25).forEach(i => this.log('item', `${i.name}  (from ${label(i)})`));
    if (fresh.length > 25) this.log('item', `… and ${fresh.length - 25} more`);
    if (this.needsWork()) this.lastMessage = 'New items received — save in-game, then reload the save.';
    this.emitStatus();
  }

  /* ---- watcher ---- */
  start() { this.stop(); this._t = setInterval(() => this.tick().catch(e => this.log('error', 'Watcher: ' + e.message)), Math.max(500, this.settings.data.pollMs || 1500)); this.tick().catch(() => {}); }
  stop() { clearInterval(this._t); this._t = null; this.baseline = null; this.cand = null; }
  async tick() {
    if (!this.cfg.enabled || this.busy) return;
    const f = this.file;
    if (!f) { this.saveState = 'unset'; this.emitStatus(); return; }
    const st = await S.statSave(f);
    const prev = this.saveState; this.saveState = st ? 'ok' : 'missing';
    if (prev !== this.saveState) this.emitStatus();
    if (!st) return;
    if (!this.baseline) { this.baseline = st; return; }
    if (S.sameStat(st, this.baseline)) { this.cand = null; return; }
    const now = Date.now();
    if (!S.sameStat(st, this.cand)) { this.cand = st; this.candSince = now; return; }
    if (now - this.candSince < 1200) return; // still being written
    this.baseline = st; this.cand = null;
    this.log('info', `New ${this.def.saveFile} detected.`);
    if (this.shouldProcess()) await this.process('save'); // pruning may need to run even when no new items arrived
  }

  /* ---- apply ---- */
  async applyNow() {
    if (!this.file) { this.log('error', 'No save location set.'); return; }
    if (!(this.L.receivedNames || []).length) { this.log('warn', 'No received items yet (connect to Archipelago first).'); return; }
    await this.process('manual');
  }
  async process(reason) {
    if (this.busy) return;
    this.busy = true; this.emitStatus();
    try {
      const file = this.file; let bytes;
      for (let i = 0; i < 5; i++) { try { bytes = await fs.promises.readFile(file); break; } catch (e) { if (i === 4) throw e; await new Promise(r => setTimeout(r, 500)); } }
      const L = this.L; const quiet = reason !== 'manual' && !this.needsWork(); // nothing user-visible expected: stay silent unless something visible happens
      /* did the previous write survive into this save? */
      if (L.pending) {
        let ok = true;
        if (L.pending.assertions.length) ok = (await this.host.verify(this.key, bytes, L.pending.assertions)).every(Boolean);
        if (ok) { L.confirmed = L.pending.confirmed; this.log('info', 'Previous edits are present in this save (confirmed).'); }
        else this.log('warn', 'Previous edits were NOT in this save (saved again before reloading?). Re-applying them.');
        L.pending = null;
      }
      const counts = this.counts();
      const eff = this.effConfirmed();
      const plan = buildPlan(this.key, counts, eff, this.ctx());
      const res = await this.host.run(this.key, bytes, plan);
      const rep = res.report;
      /* new ledger state */
      const conf = Object.assign({}, eff); const handled = new Set();
      for (const a of plan.adds) { const k = a.ledgerKey || a.key; handled.add(k); conf[k] = (conf[k] || 0) + Math.floor(((rep.applied[a.key]) || 0) / a.per); }
      for (const k of Object.keys(plan.rupeeItems)) { handled.add(k); conf[k] = (conf[k] || 0) + plan.rupeeItems[k]; }
      for (const k of Object.keys(counts)) if (!handled.has(k)) conf[k] = counts[k];
      const unapplied = plan.adds.filter(a => (rep.applied[a.key] || 0) < a.qty);
      const changed = Buffer.compare(res.bytes, bytes) !== 0;
      rep.warnings.forEach(w => this.log('warn', w));
      const visible = rep.changes.length > 0 || rep.warnings.length > 0;
      if (changed && !visible) { // only silent housekeeping changed (e.g. armor that was not received): write it, say nothing
        await S.backup(file, path.join(this.dirs.backupRoot, this.key), this.settings.data.keepBackups || 15);
        await S.overwrite(file, res.bytes);
        this.baseline = await S.statSave(file);
        L.confirmed = conf;
      } else if (changed) {
        await S.backup(file, path.join(this.dirs.backupRoot, this.key), this.settings.data.keepBackups || 15);
        const how = await S.overwrite(file, res.bytes);
        this.baseline = await S.statSave(file);
        L.pending = { confirmed: conf, assertions: plan.checks.filter((c, i) => rep.pre[i] === false) };
        rep.changes.slice(0, 40).forEach(c => this.log('change', c));
        if (rep.changes.length > 40) this.log('change', `… ${rep.changes.length - 40} more changes`);
        this.log('info', `Wrote updated ${this.def.saveFile} (${how}). Reload your save in-game to get the new items. Backup kept.`);
        this.lastMessage = 'Save updated — reload it in-game.';
      } else {
        L.confirmed = conf;
        if (!quiet) { this.log('info', 'Save already up to date; nothing written.'); this.lastMessage = 'Up to date.'; }
      }
      if (plan.manual.length && !quiet) this.log('info', `No automatic change for: ${[...new Set(plan.manual)].join(', ')} (manual items).`);
      if (plan.teleport && rep.teleported) { // one-shot: written (or already there), so stop asking for it
        this.log('info', `Teleport set: your save now points at ${plan.teleport.tower.replace(/ Skyview Tower$| Tower$/, '')}${changed ? ' - reload the save in-game to appear there (saving again first would overwrite it)' : ''}.`);
        if (this.cfg.towers) { this.cfg.towers.teleportTo = ''; this.settings.save(); this.emit('cfg'); }
      }
      L.retry = unapplied.length > 0;
      L.lastSig = this.currentSig(); if (!quiet || visible) L.lastApply = new Date().toISOString();
      this.ledgerStore.save();
    } catch (e) {
      this.log('error', `Apply failed: ${e.message}`); this.lastMessage = 'Last apply failed — see log.';
    } finally { this.busy = false; this.emitStatus(); }
  }
}

class SyncManager extends EventEmitter {
  constructor({ settings, ledgerStore, host, dirs }) {
    super(); Object.assign(this, { settings, ledgerStore, host, dirs }); this.games = {}; this.paused = false;
    for (const k of Object.keys(GAMES)) if (!this.ledgerStore.data[k]) this.ledgerStore.data[k] = {};
  }
  start() {
    this.stop();
    if (this.paused) return;
    const s = this.settings.data;
    for (const key of Object.keys(GAMES)) {
      const cfg = s.games[key]; if (!cfg.enabled) continue;
      const info = loadItemInfo(key, this.dirs.apworldsRoot);
      const g = new GameSync({ key, settings: this.settings, ledgerStore: this.ledgerStore, host: this.host, dirs: this.dirs, armorNames: info.armorNames, progNames: info.progNames });
      g.on('log', e => this.emit('log', e)); g.on('status', st => this.emit('status', st)); g.on('cfg', () => this.emit('cfg'));
      this.games[key] = g; g.start();
      if (cfg.slot && s.server) {
        const ap = new APClient({ host: s.server, port: s.port, password: s.password, slot: cfg.slot, game: APWORLDS[key].game, dataDir: this.dirs.dataDir });
        g.attachAp(ap); ap.start();
      } else g.log('warn', 'No slot name set: not connecting to Archipelago for this game.');
      g.emitStatus();
    }
  }
  stop() { for (const g of Object.values(this.games)) { g.stop(); if (g.ap) g.ap.stop(); } this.games = {}; }
  setPaused(p) { this.paused = p; this.start(); }
  statuses() { return Object.values(this.games).map(g => g.status()); }
  refresh() { Object.values(this.games).forEach(g => g.emitStatus()); } // after settings changed without a reconnect
  async applyNow(key) { if (this.games[key]) await this.games[key].applyNow(); }
}
module.exports = { SyncManager, GameSync, GAMES, countNames };
