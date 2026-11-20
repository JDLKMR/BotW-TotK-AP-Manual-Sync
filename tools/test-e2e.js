const fs = require('fs'), path = require('path');
const { buildPlan, loadItemInfo, APWORLDS } = require('../src/main/rules');
const { runDriver, verifyDriver } = require('./jsdomHost');
const ROOT = process.env.APWORLD_REPOS || '/home/claude/src', VENDOR = path.join(__dirname, '..', 'vendor', 'savegame-editors');
const SAVES = { botw: ROOT + '/BotW-APManual-main/botw-save-switch/game_data.sav', totk: ROOT + '/TotK-APManual-main/totk-save/progress.sav' };
(async () => {
  let bad = 0;
  for (const game of ['botw', 'totk']) {
    const info = loadItemInfo(game, ROOT);
    // counts: everything in the pool at full count (as in items.json), to stress every rule
    let d = JSON.parse(fs.readFileSync(path.join(ROOT, APWORLDS[game].dir, 'data/items.json'), 'utf8')); if (!Array.isArray(d)) d = d.data;
    const counts = {}; d.forEach(i => counts[i.name] = Math.min(parseInt(i.count || 1, 10), process.env.FULL ? 999 : 3));
    const plan = buildPlan(game, counts, {}, { vendorDir: VENDOR, armorNames: info.armorNames });
    const bytes = fs.readFileSync(SAVES[game]);
    const res = await runDriver(game, bytes, plan);
    console.log(`\n===== ${game.toUpperCase()}  changes=${res.report.changes.length} warnings=${res.report.warnings.length} manual=${plan.manual.length}`);
    res.report.warnings.slice(0, 40).forEach(w => console.log('  WARN', w));
    console.log('  sample changes:', res.report.changes.slice(0, 6));
    console.log('  pre-check (false = would be discriminating):', res.report.pre.filter(x => !x).length + '/' + res.report.pre.length);
    const post = await verifyDriver(game, res.bytes, plan.checks);
    console.log('  post-checks all true:', post.every(Boolean), post.filter(x=>!x).length ? JSON.stringify(plan.checks.filter((c,i)=>!post[i])) : '');
    // second run must be a no-op for state-based things (idempotent) and add nothing when ledger is current
    const confirmed = {}; for (const a of plan.adds) confirmed[a.ledgerKey || a.key] = (confirmed[a.ledgerKey || a.key] || 0) + Math.floor((res.report.applied[a.key] || 0) / a.per);
    Object.assign(confirmed, plan.rupeeItems && Object.fromEntries(Object.entries(plan.rupeeItems)));
    for (const k of Object.keys(counts)) if (!(k in confirmed)) confirmed[k] = counts[k];
    const plan2 = buildPlan(game, counts, confirmed, { vendorDir: VENDOR, armorNames: info.armorNames });
    const res2 = await runDriver(game, res.bytes, plan2);
    console.log('  second run changes:', res2.report.changes.length, res2.report.changes.slice(0, 4), 'bytes identical:', Buffer.compare(res.bytes, res2.bytes) === 0);
    fs.writeFileSync(`/tmp/out-${game}.sav`, res.bytes);
    if (res.report.warnings.some(w => /Unknown item|not in hash|not found/.test(w))) bad++;
  }
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error('TEST FAILED', e); process.exit(2); });
