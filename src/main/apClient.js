/* Minimal Archipelago protocol client: connects to ONE slot and keeps the list of received item names. */
const { EventEmitter } = require('events');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const REFUSED_FATAL = new Set(['InvalidSlot', 'InvalidGame', 'IncompatibleVersion', 'InvalidPassword', 'InvalidItemsHandling']);

class APClient extends EventEmitter {
  constructor({ host, port, password, slot, game, dataDir, uuid }) {
    super();
    Object.assign(this, { host, port, password: password || '', slot, game, dataDir, uuid: uuid || crypto.randomUUID() });
    this.state = 'stopped'; // stopped | connecting | connected | error
    this.items = [];        // [{name,id,player,location}]
    this.players = {};
    this.seedName = null;
    this._backoff = 2000; this._stop = true; this._scheme = null;
  }
  start() { this._stop = true; this._stop = false; this._connect(); }
  stop() { this._stop = true; clearTimeout(this._timer); if (this.ws) { try { this.ws.close(); } catch (_) {} this.ws = null; } this._set('stopped'); }
  _set(state, detail) { this.state = state; this.emit('state', state, detail); }
  _urls() {
    const h = String(this.host).trim();
    if (/^wss?:\/\//i.test(h)) return [h.includes(':', 6) ? h : `${h}:${this.port}`];
    const order = this._scheme ? [this._scheme] : ['ws', 'wss'];
    return order.map(s => `${s}://${h}:${this.port}`);
  }
  _connect(urls) {
    if (this._stop) return;
    urls = urls || this._urls();
    const url = urls[0];
    this._set('connecting', url);
    let opened = false;
    const ws = new WebSocket(url, { handshakeTimeout: 8000, rejectUnauthorized: false });
    this.ws = ws;
    ws.on('open', () => { opened = true; this._scheme = url.split(':')[0]; });
    ws.on('message', (data) => { try { JSON.parse(data.toString()).forEach(p => this._onPacket(p)); } catch (e) { this.emit('log', 'warn', 'Bad packet: ' + e.message); } });
    ws.on('error', (e) => { this.emit('log', 'warn', `Connection error (${url}): ${e.message}`); });
    ws.on('close', () => {
      if (this.ws !== ws) return; this.ws = null;
      if (this._stop || this.state === 'error') return;
      if (!opened && urls.length > 1) return this._connect(urls.slice(1));
      this._set('connecting', 'reconnecting');
      this._timer = setTimeout(() => this._connect(), this._backoff);
      this._backoff = Math.min(this._backoff * 2, 30000);
    });
  }
  _send(pkts) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(pkts)); }
  _dpPath(checksum) { return path.join(this.dataDir, `datapackage-${this.game}-${checksum || 'x'}.json`.replace(/[^\w.\-]/g, '_')); }
  _sendConnect() {
    this._send([{ cmd: 'Connect', password: this.password, game: this.game, name: this.slot, uuid: this.uuid, version: { major: 0, minor: 6, build: 1, class: 'Version' }, items_handling: 7, tags: ['Tracker'], slot_data: false }]);
  }
  _onPacket(p) {
    switch (p.cmd) {
      case 'RoomInfo': {
        this.seedName = p.seed_name;
        const sum = (p.datapackage_checksums || {})[this.game];
        this._dpSum = sum;
        let cached = null;
        try { cached = JSON.parse(fs.readFileSync(this._dpPath(sum), 'utf8')); } catch (_) {}
        if (cached && sum) { this._applyDP(cached); this._sendConnect(); }
        else this._send([{ cmd: 'GetDataPackage', games: [this.game] }]);
        break;
      }
      case 'DataPackage': {
        const g = p.data && p.data.games && p.data.games[this.game];
        if (!g) { this._fatal(`Server has no data for game "${this.game}" (is this the right room?)`); break; }
        try { fs.mkdirSync(this.dataDir, { recursive: true }); fs.writeFileSync(this._dpPath(this._dpSum), JSON.stringify(g)); } catch (_) {}
        this._applyDP(g); this._sendConnect(); break;
      }
      case 'Connected': {
        this._backoff = 2000;
        this.slotNum = p.slot;
        this.players = {}; (p.players || []).forEach(pl => { this.players[pl.slot] = pl.alias || pl.name; });
        this._set('connected');
        this.emit('connected', { seedName: this.seedName, slot: this.slot });
        break;
      }
      case 'ConnectionRefused': this._fatal('Connection refused: ' + (p.errors || []).join(', '), (p.errors || []).some(e => REFUSED_FATAL.has(e))); break;
      case 'ReceivedItems': this._onItems(p); break;
      default: break;
    }
  }
  _applyDP(g) { this.idToName = {}; for (const [n, id] of Object.entries(g.item_name_to_id || {})) this.idToName[id] = n; }
  _fatal(msg, fatal = true) {
    this.emit('log', 'error', msg); this._set(fatal ? 'error' : 'connecting', msg);
    if (fatal) { this._stop = true; if (this.ws) { try { this.ws.close(); } catch (_) {} } }
  }
  _onItems(p) {
    const fresh = (p.items || []).map(i => ({ name: (this.idToName || {})[i.item] || `Unknown item ${i.item}`, id: i.item, player: i.player, location: i.location, flags: i.flags || 0 }));
    if (p.index === 0) this.items = fresh;
    else if (p.index === this.items.length) this.items = this.items.concat(fresh);
    else { this.emit('log', 'warn', 'Item index mismatch, resyncing'); this._send([{ cmd: 'Sync' }]); return; }
    this.emit('items', this.items, fresh, p.index === 0);
  }
  playerName(slot) { return slot === 0 ? 'Server' : (this.players[slot] || `Player ${slot}`); } // slot 0 = items sent by the host/server
}
module.exports = { APClient };
