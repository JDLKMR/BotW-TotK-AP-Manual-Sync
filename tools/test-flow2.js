// Start-inventory handling, "Server" label, silent armor pruning, Travel Medallion instances (TotK)
const fs = require('fs'), os = require('os'), path = require('path');
const { WebSocketServer } = require('ws');
const { SyncManager } = require('../src/main/syncEngine');
const { JsonStore, DEFAULT_SETTINGS } = require('../src/main/store');
const { APWORLDS, buildPlan, loadItemInfo } = require('../src/main/rules');
const { runDriver, verifyDriver } = require('./jsdomHost'); const { openEditor, loadSave } = require('./probe');
const ROOT = process.env.APWORLD_REPOS || '/home/claude/src', VENDOR = path.join(__dirname, '..', 'vendor/savegame-editors');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'apsync2-')); const saveDir = path.join(tmp, 'save', '1'); fs.mkdirSync(saveDir, { recursive: true });
const SAVE = path.join(saveDir, 'progress.sav'); const orig = fs.readFileSync(ROOT + '/TotK-APManual-main/totk-save/progress.sav'); fs.writeFileSync(SAVE, orig);
const sleep = ms => new Promise(r => setTimeout(r, ms));
let items = JSON.parse(fs.readFileSync(path.join(ROOT, APWORLDS.totk.dir, 'data/items.json'), 'utf8')); items = Array.isArray(items) ? items : items.data;
const name2id = {}; items.forEach((i, n) => name2id[i.name] = 1000 + n);
const wss = new WebSocketServer({ port: 38998 }); let sock;
wss.on('connection', ws => { sock = ws;
  ws.send(JSON.stringify([{ cmd: 'RoomInfo', seed_name: 'SEED2', datapackage_checksums: { [APWORLDS.totk.game]: 'abc' } }]));
  ws.on('message', d => JSON.parse(d.toString()).forEach(p => {
    if (p.cmd === 'GetDataPackage') ws.send(JSON.stringify([{ cmd: 'DataPackage', data: { games: { [APWORLDS.totk.game]: { item_name_to_id: name2id } } } }]));
    if (p.cmd === 'Connect') { ws.send(JSON.stringify([{ cmd: 'Connected', slot: 1, players: [{ slot: 1, name: 'Link' }, { slot: 2, name: 'Zelda' }], checked_locations: [] }]));
      // start inventory first (location -2, player 0 like the real server)
      const start = ['Heart Container', 'Heart Container', 'Heart Container', 'Weapon Slot', 'Weapon Slot'];
      ws.send(JSON.stringify([{ cmd: 'ReceivedItems', index: 0, items: start.map(n => ({ item: name2id[n], location: -2, player: 0, flags: 1 })) }])); }
  })); });
const send = (list, index, loc, player, flags = 1) => sock.send(JSON.stringify([{ cmd: 'ReceivedItems', index, items: list.map(n => ({ item: name2id[n], location: loc, player, flags })) }]));
(async () => {
  const logs = []; let fail = 0; const check = (c, m) => { console.log((c ? '  PASS ' : '  FAIL ') + m); if (!c) fail++; };
  const settings = new JsonStore(path.join(tmp, 'settings.json'), DEFAULT_SETTINGS);
  Object.assign(settings.data, { server: '127.0.0.1', port: 38998, pollMs: 500 }); settings.data.games.totk = { enabled: true, slot: 'Link', saveDir };
  const ledger = new JsonStore(path.join(tmp, 'ledger.json'), { botw: {}, totk: {} });
  // an OLD ledger for the same seed (as left by earlier testing): start-item handling must not depend on the ledger being new
  ledger.data.totk = { seedKey: 'SEED2|Link', receivedNames: ['Heart Container', 'Heart Container', 'Heart Container', 'Weapon Slot', 'Weapon Slot'], confirmed: {}, pending: null, lastSig: null, retry: false };
  const mgr = new SyncManager({ settings, ledgerStore: ledger, dirs: { vendorDir: VENDOR, apworldsRoot: path.join(__dirname, '..', 'apworlds'), backupRoot: path.join(tmp, 'backups'), dataDir: path.join(tmp, 'data') }, host: { run: runDriver, verify: verifyDriver } });
  mgr.on('log', e => { logs.push(e); console.log(`  [${e.level}] ${e.msg}`); }); mgr.start(); await sleep(2000);
  const st = () => mgr.games.totk.status();
  console.log('\n== A. fresh seed, only start inventory');
  check(st().items === 5 && !st().awaitingSave && st().pendingItems === 0, `status: items=${st().items} awaiting=${st().awaitingSave} pending=${st().pendingItems} (want 5 / false / 0)`);
  check(logs.some(l => /start inventory/.test(l.msg)), 'start items labelled "start inventory"');
  check(logs.some(l => /Start inventory recognized: 5/.test(l.msg)), 'log says how many start items were recognized');

  console.log('\n== B. player picks up armor that was NOT received, then saves');
  const info = loadItemInfo('totk', path.join(__dirname, '..', 'apworlds'));
  const withArmor = (await runDriver('totk', orig, buildPlan('totk', { 'Amber Earrings': 1, "Ancient Hero's Aspect": 1 }, {}, { vendorDir: VENDOR, armorNames: info.armorNames, pruneArmor: false }))).bytes;
  const n0 = logs.length; fs.writeFileSync(SAVE, withArmor); fs.utimesSync(SAVE, new Date(), new Date(Date.now() + 5000)); await sleep(11000);
  const now = fs.readFileSync(SAVE); check(Buffer.compare(now, withArmor) !== 0, 'save was rewritten');
  const dom = await openEditor('totk'); loadSave(dom.window, now, 'progress.sav'); const armorLeft = JSON.parse(dom.window.eval('JSON.stringify(SavegameEditor.pouches.armors.items.length)')); dom.window.close();
  check(armorLeft === 0, `unreceived armor removed (left: ${armorLeft})`);
  const newLogs = logs.slice(n0).map(l => l.msg).join(' | ');
  check(!/armor|remov|wrote|reload/i.test(newLogs), 'nothing about it in the log:  ' + (newLogs || '(only "New progress.sav detected")'));

  console.log('\n== C. items arrive: 1 from the server (player 0), 3 Travel Medallions from Zelda');
  send(['Stamina Vessel'], 5, -1, 0); await sleep(300); send(['Travel Medallion', 'Travel Medallion', 'Travel Medallion'], 6, 9, 2, 0); await sleep(800);
  check(logs.some(l => /Stamina Vessel.*from Server/.test(l.msg)), 'log says "from Server"'); check(!logs.some(l => /Player 0/.test(l.msg)), 'no "Player 0" anywhere');
  check(st().awaitingSave && st().pendingItems === 4 && st().pendingProgression === 1, `4 new items, 1 progression -> status says: ${st().pendingItems} new items (${st().pendingProgression} progression)`);
  fs.writeFileSync(SAVE, orig); fs.utimesSync(SAVE, new Date(), new Date(Date.now() + 15000)); await sleep(11000);
  const out = fs.readFileSync(SAVE);
  const d2 = await openEditor('totk'); loadSave(d2.window, out, 'progress.sav');
  const meds = JSON.parse(d2.window.eval(`JSON.stringify(SavegameEditor.pouches.key.items.filter(function(i){return /WarpDLC/.test(i.id)}).map(function(i){return i.id+'x'+i.quantity}))`)); d2.window.close();
  check(!st().awaitingSave && st().pendingItems === 0, `Up to date right after the first successful write (awaiting=${st().awaitingSave} pending=${st().pendingItems})`);
  check(meds.length === 1 && meds[0] === 'Obj_WarpDLCx3', 'ONE Travel Medallion entry with quantity 3: ' + JSON.stringify(meds));
  mgr.stop(); wss.close(); console.log(fail ? `\n${fail} FAILED` : '\nALL PASS'); process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FLOW2 FAILED', e); process.exit(2); });
