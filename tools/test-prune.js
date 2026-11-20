const fs = require('fs'), path = require('path');
const { buildPlan, loadItemInfo } = require('../src/main/rules');
const { runDriver } = require('./jsdomHost'); const { openEditor, loadSave } = require('./probe');
const ROOT = process.env.APWORLD_REPOS || '/home/claude/src', VENDOR = path.join(__dirname, '..', 'vendor', 'savegame-editors');
const SAVES = { botw: ROOT + '/BotW-APManual-main/botw-save-switch/game_data.sav', totk: ROOT + '/TotK-APManual-main/totk-save/progress.sav' };
async function inventory(game, bytes) {
  const dom = await openEditor(game); const w = dom.window; loadSave(w, bytes, game === 'botw' ? 'game_data.sav' : 'progress.sav');
  const r = JSON.parse(w.eval(game === 'botw' ? `(function(){var o=[],T=tempFile,E=SavegameEditor._searchHash(2185794238)+4;for(var i=0;i<420;i++){var id=SavegameEditor._loadItemName(i);if(id==='')break;o.push(id+'|q='+T.readU32(SavegameEditor.Offsets.ITEMS_QUANTITY+i*8)+'|eq='+T.readU32(E+i*8));}return JSON.stringify(o)})()`
    : `JSON.stringify(SavegameEditor.pouches.armors.items.map(function(a){return a.id}))`)); w.close(); return r;
}
(async () => {
  let fail = 0;
  for (const game of ['botw', 'totk']) {
    const info = loadItemInfo(game, path.join(__dirname, '..', 'apworlds'));
    const armor = [...info.armorNames].slice(0, 4); const ctx = (prune, keep) => ({ vendorDir: VENDOR, armorNames: info.armorNames, pruneArmor: prune });
    const orig = fs.readFileSync(SAVES[game]);
    // 1) give 4 armor pieces + a filler weapon AFTER them, equip the last item (BotW) to test equip-flag shifting
    const counts = {}; armor.forEach(a => counts[a] = 1); counts['Royal Broadsword'] = 1; counts['Arrows (50)'] = 1;
    const withArmor = (await runDriver(game, orig, buildPlan(game, counts, {}, ctx(false)))).bytes;
    console.log(`\n== ${game}: armor given: ${armor.join(', ')}`);
    const before = await inventory(game, withArmor);
    console.log('  before:', before.slice(-8).join(' ; '));
    // 2) player "obtained" all 4, but only the first was received -> the other 3 must disappear, silently
    const keepCounts = { [armor[0]]: 1, 'Royal Broadsword': 1, 'Arrows (50)': 1 };
    const confirmed = Object.assign({}, keepCounts);
    const res = await runDriver(game, withArmor, buildPlan(game, keepCounts, confirmed, ctx(true)));
    const after = await inventory(game, res.bytes);
    console.log('  after: ', after.slice(-8).join(' ; '));
    console.log('  removed:', res.report.removedArmor, '| appears in change log:', res.report.changes.some(c => /armor|remov/i.test(c)));
    const armorLeft = game === 'botw' ? after.filter(x => /^Armor_/.test(x)) : after;
    const ok = res.report.removedArmor === 3 && armorLeft.length === 1 && after.length === before.length - 3 && !res.report.changes.some(c => /remov/i.test(c));
    // non-armor entries keep order and values
    if (game === 'botw') { const strip = (a) => a.filter(x => !/^Armor_/.test(x)); if (JSON.stringify(strip(before)) !== JSON.stringify(strip(after))) { console.log('  NON-ARMOR ENTRIES CHANGED'); fail++; } }
    // 3) nothing received at all -> every armor piece goes
    const none = await runDriver(game, withArmor, buildPlan(game, {}, {}, ctx(true)));
    const left = await inventory(game, none.bytes); const armorLeft2 = game === 'botw' ? left.filter(x => /^Armor_/.test(x)) : left;
    console.log('  with nothing received, armor left:', armorLeft2.length, '(removed ' + none.report.removedArmor + ')');
    // 4) second run is a no-op
    const again = await runDriver(game, res.bytes, buildPlan(game, keepCounts, confirmed, ctx(true)));
    console.log('  idempotent:', Buffer.compare(again.bytes, res.bytes) === 0, '| result', ok ? 'PASS' : 'FAIL');
    if (!ok || armorLeft2.length !== (game === 'totk' ? 1 : 0)) { if (!ok) fail++; }
  }
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('PRUNE TEST FAILED', e); process.exit(2); });
