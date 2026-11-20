const fs = require('fs'), path = require('path');
const { buildPlan, loadItemInfo } = require('../src/main/rules'); const { runDriver } = require('./jsdomHost'); const { openEditor, loadSave } = require('./probe');
const ROOT = process.env.APWORLD_REPOS || '/home/claude/src', VENDOR = path.join(__dirname, '..', 'vendor/savegame-editors');
(async () => {
  const counts = { 'Royal Broadsword': 1, 'Royal Shield': 1, 'Savage Lynel Shield': 1, 'Royal Bow': 1, 'Savage Lynel Bow': 1, 'Hylian Shield': 1, 'Weapon Slot': 12, 'Bow Slot': 8, 'Shield Slot': 8 };
  // TotK
  let info = loadItemInfo('totk', path.join(__dirname, '..', 'apworlds'));
  let res = await runDriver('totk', fs.readFileSync(ROOT + '/TotK-APManual-main/totk-save/progress.sav'), buildPlan('totk', counts, {}, { vendorDir: VENDOR, armorNames: info.armorNames }));
  let w = (await openEditor('totk')).window; loadSave(w, res.bytes, 'progress.sav');
  console.log('TotK  ', w.eval(`JSON.stringify(['weapons','bows','shields'].reduce(function(o,c){SavegameEditor.pouches[c].items.forEach(function(i){o[_(i.id)]=i.durability});return o},{}))`)); w.close();
  // BotW
  info = loadItemInfo('botw', path.join(__dirname, '..', 'apworlds'));
  res = await runDriver('botw', fs.readFileSync(ROOT + '/BotW-APManual-main/botw-save-switch/game_data.sav'), buildPlan('botw', counts, {}, { vendorDir: VENDOR, armorNames: info.armorNames }));
  w = (await openEditor('botw')).window; loadSave(w, res.bytes, 'game_data.sav');
  console.log('BotW  ', w.eval(`(function(){var o={};for(var i=0;i<420;i++){var id=SavegameEditor._loadItemName(i);if(id==='')break;if(/^Weapon_/.test(id)&&!/Weapon_Sword_002|Weapon_Bow_002|Shield_002$/.test(id)||i===8)o[id]=tempFile.readU32(SavegameEditor.Offsets.ITEMS_QUANTITY+i*8);}return JSON.stringify(o)})()`)); w.close();
  process.exit(0);
})();
