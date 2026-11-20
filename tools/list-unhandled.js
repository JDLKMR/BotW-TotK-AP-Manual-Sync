// Lists every APWorld item that currently produces NO save change.
const fs = require('fs'), path = require('path');
const { buildPlan, loadItemInfo, APWORLDS } = require('../src/main/rules');
const ROOT = process.env.APWORLD_REPOS || '/home/claude/src', VENDOR = path.join(__dirname, '..', 'vendor/savegame-editors');
for (const game of ['botw', 'totk']) {
  const info = loadItemInfo(game, path.join(__dirname, '..', 'apworlds'));
  let d = JSON.parse(fs.readFileSync(path.join(ROOT, APWORLDS[game].dir, 'data/items.json'), 'utf8')); d = Array.isArray(d) ? d : d.data;
  const un = [];
  for (const it of d) {
    let any = false;
    for (const n of [1, 2, 3, 4]) {
      const p = buildPlan(game, { [it.name]: n }, {}, { vendorDir: VENDOR, armorNames: info.armorNames, pruneArmor: false });
      if (p.flags.length || p.adds.length || Object.keys(p.stats).length || Object.keys(p.slots).length || p.masterSword || p.armorLevel) { any = true; break; }
    }
    if (!any) un.push(`${it.name} (x${it.count || 1}${it.category ? ', ' + [].concat(it.category).join('/') : ''})`);
  }
  console.log(`\n${game.toUpperCase()} - ${un.length} of ${d.length} item names have no automatic effect:`); un.forEach(x => console.log('  - ' + x));
}
