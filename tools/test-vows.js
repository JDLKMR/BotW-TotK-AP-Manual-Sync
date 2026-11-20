const fs = require('fs'), path = require('path');
const { buildPlan, loadItemInfo } = require('../src/main/rules'); const { runDriver } = require('./jsdomHost'); const { openEditor, loadSave } = require('./probe');
const ROOT = process.env.APWORLD_REPOS || '/home/claude/src', VENDOR = path.join(__dirname, '..', 'vendor/savegame-editors');
let fail = 0; const check = (c, m) => { console.log((c ? '  PASS ' : '  FAIL ') + m); if (!c) fail++; };
const give = (game, bytes, adds) => runDriver(game, bytes, { adds: adds.map(([n, mode]) => ({ key: n, editorName: n, mode: mode || 'unique', qty: 1, per: 1 })) }).then(r => r.bytes);
async function keys(bytes) { const w = (await openEditor('totk')).window; loadSave(w, bytes, 'progress.sav'); const r = JSON.parse(w.eval(`JSON.stringify(SavegameEditor.pouches.key.items.map(function(i){return i.id+'x'+i.quantity}))`)); w.close(); return r; }
const has = (ks, id) => ks.some(k => k.startsWith(id + 'x'));
(async () => {
  const info = loadItemInfo('totk', path.join(__dirname, '..', 'apworlds'));
  const plan = (counts, confirmed, prune = true) => buildPlan('totk', counts, confirmed || {}, { vendorDir: VENDOR, armorNames: info.armorNames, pruneArmor: prune });
  const orig = fs.readFileSync(ROOT + '/TotK-APManual-main/totk-save/progress.sav');
  console.log('== Sage\'s Vows (TotK)');
  // player completed dungeons: has Vow + Solemn of Tulin (none received), Vow + Solemn of Yunobo (1 received), only Vow of Sidon (2 received)
  let b = await give('totk', orig, [['Vow of Tulin, Sage of Wind'], ['Solemn Vow of Tulin, Sage of Wind'], ['Vow of Yunobo, Sage of Fire'], ['Solemn Vow of Yunobo, Sage of Fire'], ['Vow of Sidon, Sage of Water']]);
  console.log('  before:', (await keys(b)).filter(k => /SageSoul/.test(k)).join(', '));
  let r = await runDriver('totk', b, plan({ 'Progressive Vow of Yunobo': 1, 'Progressive Vow of Sidon': 2 }));
  let ks = await keys(r.bytes); console.log('  after: ', ks.filter(k => /SageSoul/.test(k)).join(', '));
  check(!has(ks, 'Obj_SageSoul_Rito') && !has(ks, 'Obj_SageSoulPlus_Rito'), 'none received -> both versions removed');
  check(has(ks, 'Obj_SageSoul_Goron') && !has(ks, 'Obj_SageSoulPlus_Goron'), '1 received -> Vow kept, Solemn removed');
  check(has(ks, 'Obj_SageSoulPlus_Zora') && !has(ks, 'Obj_SageSoul_Zora'), '2 received -> Solemn present, old Vow removed (and Solemn added since it was missing)');
  check(!r.report.changes.some(c => /remov/i.test(c)), 'removals are not in the change log');
  const again = await runDriver('totk', r.bytes, plan({ 'Progressive Vow of Yunobo': 1, 'Progressive Vow of Sidon': 2 })); check(Buffer.compare(again.bytes, r.bytes) === 0, 'idempotent');
  // removal disabled in settings: old Vow stays, Solemn still ensured
  r = await runDriver('totk', b, plan({ 'Progressive Vow of Sidon': 2 }, {}, false)); ks = await keys(r.bytes);
  check(has(ks, 'Obj_SageSoul_Zora') && has(ks, 'Obj_SageSoulPlus_Zora') && has(ks, 'Obj_SageSoul_Rito'), 'with removal switched off nothing is removed, Solemn still ensured');

  console.log('\n== Travel Medallions (TotK)');
  r = await runDriver('totk', orig, plan({ 'Travel Medallion': 3 })); ks = await keys(r.bytes);
  check(ks.filter(k => k.startsWith('Obj_WarpDLC')).length === 1 && ks.includes('Obj_WarpDLCx3'), 'received 3 -> ONE entry, quantity 3: ' + JSON.stringify(ks.filter(k => /Warp/.test(k))));
  r = await runDriver('totk', r.bytes, plan({ 'Travel Medallion': 4 }, { 'Travel Medallion': 3 })); ks = await keys(r.bytes);
  check(ks.filter(k => k.startsWith('Obj_WarpDLC')).length === 1 && ks.includes('Obj_WarpDLCx4'), 'a 4th medallion raises the same entry to 4: ' + JSON.stringify(ks.filter(k => /Warp/.test(k))));
  // save from the previous build: three separate entries
  b = await give('totk', orig, [['Travel Medallion', 'copy'], ['Travel Medallion', 'copy'], ['Travel Medallion', 'copy']]);
  console.log('  old-style entries:', JSON.stringify((await keys(b)).filter(k => /Warp/.test(k))));
  r = await runDriver('totk', b, plan({ 'Travel Medallion': 3 }, { 'Travel Medallion': 3 })); ks = await keys(r.bytes);
  check(ks.filter(k => k.startsWith('Obj_WarpDLC')).length === 1 && ks.includes('Obj_WarpDLCx3'), 'duplicate entries merged into one with the summed quantity: ' + JSON.stringify(ks.filter(k => /Warp/.test(k))));

  console.log('\n== Champion abilities stay up to date (BotW)');
  const binfo = loadItemInfo('botw', path.join(__dirname, '..', 'apworlds')); const bctx = { vendorDir: VENDOR, armorNames: binfo.armorNames, pruneArmor: true };
  const borig = fs.readFileSync(ROOT + '/BotW-APManual-main/botw-save-switch/game_data.sav');
  const bstate = async (bytes) => { const w = (await openEditor('botw')).window; loadSave(w, bytes, 'game_data.sav');
    const o = JSON.parse(w.eval(`(function(){var o={},T=tempFile,E=SavegameEditor._searchHash(2185794238)+4;for(var i=0;i<420;i++){var id=SavegameEditor._loadItemName(i);if(id==='')break;if(/HeroSoul/.test(id))o[id]=T.readU32(E+i*8);}return JSON.stringify(o)})()`)); w.close(); return o; };
  const counts = { "Progressive Daruk's Protection": 2 }; const conf = { "Daruk's Protection#1": 1, "Daruk's Protection#2": 1 };
  // received both, then the player completes Vah Rudania and the game leaves ONLY the base ability behind
  let bb = (await runDriver('botw', borig, buildPlan('botw', { "Daruk's Protection": 1 }, {}, bctx))).bytes;
  let st = await bstate(bb); console.log('  game state :', JSON.stringify(st));
  let br = await runDriver('botw', bb, buildPlan('botw', counts, { "Daruk's Protection#1": 1 }, bctx)); st = await bstate(br.bytes); console.log('  after check:', JSON.stringify(st));
  check(st.Obj_HeroSoul_Goron !== undefined && st.Obj_DLC_HeroSoul_Goron === 1, 'received 2 progressives -> "+" version restored and enabled; base kept (not removed)');
  // received only 1, but the "+" version is in the inventory
  let bp = (await runDriver('botw', borig, buildPlan('botw', counts, {}, bctx))).bytes;
  br = await runDriver('botw', bp, buildPlan('botw', { "Progressive Daruk's Protection": 1 }, { "Daruk's Protection#1": 1 }, bctx)); st = await bstate(br.bytes);
  check(st.Obj_HeroSoul_Goron !== undefined && st.Obj_DLC_HeroSoul_Goron === undefined, 'received only 1 -> "+" version removed, base kept');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('VOWS TEST FAILED', e); process.exit(2); });
