// Same seed name, but the room is reset (item list starts over) while the app still remembers the old list.
const fs = require('fs'), os = require('os'), path = require('path');
const { WebSocketServer } = require('ws'); const { SyncManager } = require('../src/main/syncEngine');
const { JsonStore, DEFAULT_SETTINGS } = require('../src/main/store'); const { APWORLDS } = require('../src/main/rules'); const { runDriver, verifyDriver } = require('./jsdomHost');
const { openEditor, loadSave } = require('./probe');
const ROOT = process.env.APWORLD_REPOS || '/home/claude/src', A = path.join(__dirname, '..'); const GAME = 'totk';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'apsync-reset-')); const saveDir = path.join(tmp, '1'); fs.mkdirSync(saveDir);
const SAVE = path.join(saveDir, 'progress.sav'); const orig = fs.readFileSync(ROOT + '/TotK-APManual-main/totk-save/progress.sav'); fs.writeFileSync(SAVE, orig);
let items = JSON.parse(fs.readFileSync(path.join(A, 'apworlds', APWORLDS[GAME].dir, 'data/items.json'), 'utf8')); items = Array.isArray(items) ? items : items.data;
const n2i = {}; items.forEach((i, n) => n2i[i.name] = 1000 + n); const sleep = ms => new Promise(r => setTimeout(r, ms));
let fail = 0; const check = (c, m) => { console.log((c ? '  PASS ' : '  FAIL ') + m); if (!c) fail++; };
const wss = new WebSocketServer({ port: 38995 }); let sock, idx = 0;
wss.on('connection', ws => { sock = ws; idx = 0; ws.send(JSON.stringify([{ cmd: 'RoomInfo', seed_name: 'SAMESEED', datapackage_checksums: { [APWORLDS[GAME].game]: 'abc' } }]));
  ws.on('message', d => JSON.parse(d.toString()).forEach(p => {
    if (p.cmd === 'GetDataPackage') ws.send(JSON.stringify([{ cmd: 'DataPackage', data: { games: { [APWORLDS[GAME].game]: { item_name_to_id: n2i } } } }]));
    if (p.cmd === 'Connect') { ws.send(JSON.stringify([{ cmd: 'Connected', slot: 1, players: [{ slot: 1, name: 'Link' }], checked_locations: [] }]));
      const start = ['Heart Container', 'Heart Container', 'Heart Container']; ws.send(JSON.stringify([{ cmd: 'ReceivedItems', index: 0, items: start.map(n => ({ item: n2i[n], location: -2, player: 0, flags: 0 })) }])); idx = 3; } })); });
const send = (list) => { sock.send(JSON.stringify([{ cmd: 'ReceivedItems', index: idx, items: list.map(n => ({ item: n2i[n], location: -1, player: 0, flags: 0 })) }])); idx += list.length; }; // what /send produces
(async () => {
  const logs = []; const settings = new JsonStore(path.join(tmp, 's.json'), DEFAULT_SETTINGS); Object.assign(settings.data, { server: '127.0.0.1', port: 38995, pollMs: 500 }); settings.data.games[GAME] = { enabled: true, slot: 'Link', saveDir };
  const ledger = new JsonStore(path.join(tmp, 'l.json'), { botw: {}, totk: {} });
  const mgr = new SyncManager({ settings, ledgerStore: ledger, dirs: { vendorDir: path.join(A, 'vendor/savegame-editors'), apworldsRoot: path.join(A, 'apworlds'), backupRoot: tmp + '/b', dataDir: tmp + '/d' }, host: { run: runDriver, verify: verifyDriver } });
  mgr.on('log', e => { logs.push(e); if (e.level !== 'item') console.log(`     [${e.level}] ${e.msg}`); });
  const st = () => mgr.games[GAME].status(); const touch = async (bytes, n) => { fs.writeFileSync(SAVE, bytes); fs.utimesSync(SAVE, new Date(), new Date(Date.now() + n * 6000)); await sleep(9000); return fs.readFileSync(SAVE); };
  mgr.start(); await sleep(2000);
  console.log('\n== epoch 1: host sends Ultrahand, Gaiters, 2 Travel Medallions; player saves');
  send(['Ultrahand', 'Gaiters of the Depths', 'Travel Medallion', 'Travel Medallion']); await sleep(700);
  check(st().pendingItems === 4 && st().pendingProgression === 2, `host-sent items: ${st().pendingItems} new (${st().pendingProgression} progression) - progression comes from the APWorld, not the server flag`);
  let cur = await touch(orig, 1); check(st().pendingItems === 0 && !st().awaitingSave, 'applied -> up to date');
  console.log('\n== room is reset (same seed name, list starts over) and the app reconnects');
  mgr.stop(); mgr.start(); await sleep(2500);
  check(logs.some(l => /does not continue the one remembered/.test(l.msg)), 'reset detected and logged');
  check(ledger.data[GAME].receivedNames.length === 3 && Object.keys(ledger.data[GAME].confirmed).every(k => k === 'Heart Container'), 'ledger started fresh (only the start inventory is known)');
  console.log('\n== epoch 2: host sends the same items again');
  send(['Ultrahand', 'Gaiters of the Depths', 'Travel Medallion', 'Travel Medallion']); await sleep(700);
  check(st().pendingItems === 4 && st().pendingProgression === 2 && st().awaitingSave, `status again: ${st().pendingItems} new (${st().pendingProgression} progression)  (before this fix: 0 -> "Pending changes")`);
  cur = await touch(cur, 2);
  const w = (await openEditor(GAME)).window; loadSave(w, cur, 'progress.sav');
  const r = JSON.parse(w.eval(`JSON.stringify({armor:SavegameEditor.pouches.armors.items.map(function(a){return a.id}), meds:SavegameEditor.pouches.key.items.filter(function(i){return /Warp/.test(i.id)}).map(function(i){return i.id+'x'+i.quantity}), uh:new Variable('IsGet.Obj_UltraHand','Bool').value})`)); w.close();
  check(r.uh === 1 && r.armor.length === 1 && r.meds.length === 1, `save state: Ultrahand=${r.uh}, armor=${JSON.stringify(r.armor)}, medallions=${JSON.stringify(r.meds)}`);
  check(!st().awaitingSave && st().pendingItems === 0, 'up to date after the one save');
  mgr.stop(); wss.close(); console.log(fail ? `\n${fail} FAILED` : '\nALL PASS'); process.exit(fail ? 1 : 0);
})().catch(e => { console.error('RESET TEST FAILED', e); process.exit(2); });
