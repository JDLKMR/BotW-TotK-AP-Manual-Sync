const fs = require('fs'), path = require('path');
const { buildPlan, loadItemInfo } = require('../src/main/rules'); const { runDriver } = require('./jsdomHost'); const { openEditor, loadSave } = require('./probe');
const ROOT = process.env.APWORLD_REPOS || '/home/claude/src', VENDOR = path.join(__dirname, '..', 'vendor/savegame-editors');
let fail = 0; const check = (c, m) => { console.log((c ? '  PASS ' : '  FAIL ') + m); if (!c) fail++; };
const crc = (s) => { let t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0 } let c = 0xFFFFFFFF; for (const ch of Buffer.from(s)) c = t[(c ^ ch) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0 };
async function botwState(bytes, setEq) {
  const w = (await openEditor('botw')).window; loadSave(w, bytes, 'game_data.sav');
  const out = JSON.parse(w.eval(`(function(){var o={},T=tempFile,E=SavegameEditor._searchHash(2185794238)+4;
    for(var i=0;i<420;i++){var id=SavegameEditor._loadItemName(i);if(id==='')break;if(/HeroSoul/.test(id)){ ${setEq ? `if(${JSON.stringify(setEq)}[id]!==undefined)T.writeU32(E+i*8,${JSON.stringify(setEq)}[id]);` : ''} o[id]=T.readU32(E+i*8);}}
    var f={};['IsGet_Obj_HeroSoul_Rito','IsGet_Obj_HeroSoul_Goron','IsGet_Obj_DLC_HeroSoul_Goron','IsGet_Obj_HeroSoul_Gerudo'].forEach(function(n){var h=${JSON.stringify(Object.fromEntries(['IsGet_Obj_HeroSoul_Rito', 'IsGet_Obj_HeroSoul_Goron', 'IsGet_Obj_DLC_HeroSoul_Goron', 'IsGet_Obj_HeroSoul_Gerudo'].map(n => [n, crc(n)])))}[n];var off=SavegameEditor._searchHash(h);f[n]=typeof off==='number'?T.readU32(off+4):'missing'});
    return JSON.stringify({items:o,flags:f,bytes:Array.from(tempFile._u8array)})})()`)); w.close();
  return { items: out.items, flags: out.flags, bytes: Buffer.from(out.bytes) };
}
(async () => {
  console.log('== BotW champion abilities');
  let info = loadItemInfo('botw', path.join(__dirname, '..', 'apworlds')); const ctx = { vendorDir: VENDOR, armorNames: info.armorNames };
  const orig = fs.readFileSync(ROOT + '/BotW-APManual-main/botw-save-switch/game_data.sav');
  const counts = { "Revali's Gale": 1, "Progressive Daruk's Protection": 2, "Mipha's Grace": 1 };
  let res = await runDriver('botw', orig, buildPlan('botw', counts, {}, ctx)); let st = await botwState(res.bytes);
  console.log('  items(equip flag):', JSON.stringify(st.items), 'flags:', JSON.stringify(st.flags));
  check(st.items.Obj_HeroSoul_Rito === 1 && st.items.Obj_HeroSoul_Goron === 1 && st.items.Obj_DLC_HeroSoul_Goron === 1 && st.items.Obj_HeroSoul_Zora === 1, 'base + "+" items added and enabled as received');
  check(!('Obj_HeroSoul_Gerudo' in st.items) && st.flags.IsGet_Obj_HeroSoul_Gerudo === 0, 'Urbosa (not received) untouched');
  check(st.flags.IsGet_Obj_HeroSoul_Rito === 1 && st.flags.IsGet_Obj_DLC_HeroSoul_Goron === 1, 'IsGet flags set');
  // the player cleared the beast early and disabled the ability; receiving it must enable it
  const disabled = await botwState(res.bytes, { Obj_HeroSoul_Rito: 0 });
  res = await runDriver('botw', disabled.bytes, buildPlan('botw', counts, {}, ctx)); st = await botwState(res.bytes);
  check(st.items.Obj_HeroSoul_Rito === 1, 'ability the player had disabled is enabled when received');
  // once confirmed, a player-disabled ability stays disabled
  const conf = { "Revali's Gale#1": 1, "Daruk's Protection#1": 1, "Daruk's Protection#2": 1, "Mipha's Grace#1": 1 };
  const off = await botwState(res.bytes, { Obj_HeroSoul_Rito: 0 });
  res = await runDriver('botw', off.bytes, buildPlan('botw', counts, conf, ctx)); st = await botwState(res.bytes);
  check(st.items.Obj_HeroSoul_Rito === 0, 'later player-disable is left alone');

  console.log('\n== TotK Earthwake Manual');
  info = loadItemInfo('totk', path.join(__dirname, '..', 'apworlds'));
  const tres = await runDriver('totk', fs.readFileSync(ROOT + '/TotK-APManual-main/totk-save/progress.sav'), buildPlan('totk', { 'Earthwake Manual': 1 }, {}, { vendorDir: VENDOR, armorNames: info.armorNames }));
  console.log('  warnings:', tres.report.warnings, 'changes:', tres.report.changes);
  const w = (await openEditor('totk')).window; loadSave(w, tres.bytes, 'progress.sav');
  const t = JSON.parse(w.eval(`JSON.stringify({inKey: SavegameEditor.pouches.key.items.filter(function(i){return i.id==='Obj_HiddenScroll_00'}).map(function(i){return i.id+' x'+i.quantity+' ('+_(i.id)+')'}), isGet:new Variable('IsGet.Obj_HiddenScroll_00','Bool').value, anyway:new Variable('IsGetAnyway.Obj_HiddenScroll_00','Bool').value})`)); w.close();
  console.log('  ', JSON.stringify(t));
  check(t.inKey.length === 1 && t.isGet && t.anyway, 'key item added once and IsGet/IsGetAnyway set');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CHAMP TEST FAILED', e); process.exit(2); });
