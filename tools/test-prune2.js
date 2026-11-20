const fs = require('fs'), path = require('path');
const { buildPlan, loadItemInfo } = require('../src/main/rules'); const { runDriver } = require('./jsdomHost'); const { openEditor, loadSave } = require('./probe');
const ROOT = process.env.APWORLD_REPOS || '/home/claude/src', VENDOR = path.join(__dirname, '..', 'vendor/savegame-editors');
let fail = 0; const check = (c, m) => { console.log((c ? '  PASS ' : '  FAIL ') + m); if (!c) fail++; };
async function inspect(bytes, poke) {
  const w = (await openEditor('botw')).window; loadSave(w, bytes, 'game_data.sav');
  const r = JSON.parse(w.eval(`(function(){var T=tempFile,O=SavegameEditor.Offsets,E=SavegameEditor._searchHash(2185794238)+4,items=[],ord=0,ordOf={};
    for(var i=0;i<420;i++){var id=SavegameEditor._loadItemName(i);if(id==='')break;var w=SavegameEditor._getItemCategory(id)==='weapons'&&id.indexOf('Weapon_')===0;if(w){ordOf[id]=ord++;}items.push(id)}
    ${poke ? poke : ''}
    var mods=[];for(var k=0;k<4;k++)mods.push(T.readU32(O.FLAGS_WEAPON+k*8)+'/'+T.readU32(O.FLAGSV_WEAPON+k*8));
    return JSON.stringify({items:items,ordOf:ordOf,mods:mods,bytes:Array.from(T._u8array)})})()`)); w.close(); r.bytes = Buffer.from(r.bytes); return r;
}
(async () => {
  const info = loadItemInfo('botw', path.join(__dirname, '..', 'apworlds')); const ctx = { vendorDir: VENDOR, armorNames: info.armorNames, pruneArmor: true };
  const orig = fs.readFileSync(ROOT + '/BotW-APManual-main/botw-save-switch/game_data.sav');
  // give: Master Sword (stage 1) + 2 champion abilities, then a Royal Broadsword stored AFTER the sword
  let counts = { 'Progressive Master Sword': 1, "Revali's Gale": 1, "Progressive Mipha's Grace": 2, 'Weapon Slot': 12 };
  let res = await runDriver('botw', orig, buildPlan('botw', counts, {}, Object.assign({}, ctx, { pruneArmor: false })));
  counts['Royal Broadsword'] = 1;
  res = await runDriver('botw', res.bytes, buildPlan('botw', counts, { 'Progressive Master Sword': 1, "Revali's Gale": 1, "Progressive Mipha's Grace": 2, "Revali's Gale#1": 1, "Mipha's Grace#1": 1, "Mipha's Grace#2": 1 }, Object.assign({}, ctx, { pruneArmor: false })));
  // modifier on the Royal Broadsword (the weapon after the Master Sword)
  let st = await inspect(res.bytes, 'T.writeU32(O.FLAGS_WEAPON+ordOf["Weapon_Sword_024"]*8,0x1234);T.writeU32(O.FLAGSV_WEAPON+ordOf["Weapon_Sword_024"]*8,77);');
  st = await inspect(st.bytes);
  const has = (s, id) => s.items.includes(id);
  console.log('  before:', st.items.filter(i => /Sword|HeroSoul/.test(i)).join(', '), '| weapon ordinals', JSON.stringify(st.ordOf), '| mods', st.mods.join(' '));
  check(has(st, 'Weapon_Sword_070') && has(st, 'Obj_HeroSoul_Rito') && has(st, 'Obj_DLC_HeroSoul_Zora'), 'setup: sword + champion items present');
  // 1) nothing received -> sword + all champion items removed, Royal Broadsword keeps its modifier at its new ordinal
  const keepRoyal = { 'Royal Broadsword': 1 };
  let out = await runDriver('botw', st.bytes, buildPlan('botw', keepRoyal, { 'Royal Broadsword': 1 }, ctx));
  let after = await inspect(out.bytes);
  console.log('  after :', after.items.filter(i => /Sword|HeroSoul/.test(i)).join(', '), '| weapon ordinals', JSON.stringify(after.ordOf), '| mods', after.mods.join(' '));
  check(!has(after, 'Weapon_Sword_070') && !after.items.some(i => /HeroSoul/.test(i)), 'Master Sword and champion abilities removed when not received');
  const ordR = after.ordOf['Weapon_Sword_024']; check(after.mods[ordR] === '4660/77', `Royal Broadsword modifier followed it to ordinal ${ordR} (${after.mods[ordR]})`);
  check(after.mods[2] === '0/0', 'freed last modifier slot cleared');
  check(!out.report.changes.some(c => /remov|sword|champion|heroSoul/i.test(c)), 'nothing in the change log');
  // 2) received ones are kept
  out = await runDriver('botw', st.bytes, buildPlan('botw', counts, { 'Progressive Master Sword': 1, "Revali's Gale": 1, "Progressive Mipha's Grace": 2, 'Royal Broadsword': 1, "Revali's Gale#1": 1, "Mipha's Grace#1": 1, "Mipha's Grace#2": 1 }, ctx));
  after = await inspect(out.bytes);
  check(has(after, 'Weapon_Sword_070') && has(after, 'Obj_HeroSoul_Rito') && has(after, 'Obj_DLC_HeroSoul_Zora') && after.mods[after.ordOf['Weapon_Sword_024']] === '4660/77', 'received sword/abilities kept, modifiers untouched');
  // 3) idempotent
  const again = await runDriver('botw', out.bytes, buildPlan('botw', counts, {}, ctx)); void again;
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('PRUNE2 FAILED', e); process.exit(2); });
