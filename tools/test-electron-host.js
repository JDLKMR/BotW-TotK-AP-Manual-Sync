// Run with:  electron --no-sandbox tools/test-electron-host.js   (inside xvfb on headless Linux)
const { app } = require('electron'); const fs = require('fs'); const path = require('path');
const { EditorHost } = require('../src/main/editorHost'); const { buildPlan, loadItemInfo, APWORLDS } = require('../src/main/rules');
const ROOT = path.join(__dirname, '..'); const SRC = '/home/claude/src';
const SAVES = { botw: SRC + '/BotW-APManual-main/botw-save-switch/game_data.sav', totk: SRC + '/TotK-APManual-main/totk-save/progress.sav' };
app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  const host = new EditorHost({ vendorDir: path.join(ROOT, 'vendor/savegame-editors'), driversDir: path.join(ROOT, 'src/drivers') });
  let ok = true;
  for (const game of ['botw', 'totk']) {
    const info = loadItemInfo(game, path.join(ROOT, 'apworlds'));
    let d = JSON.parse(fs.readFileSync(path.join(ROOT, 'apworlds', APWORLDS[game].dir, 'data/items.json'), 'utf8')); d = Array.isArray(d) ? d : d.data;
    const counts = {}; d.forEach(i => counts[i.name] = Math.min(parseInt(i.count || 1, 10), 3));
    const plan = buildPlan(game, counts, {}, { vendorDir: path.join(ROOT, 'vendor/savegame-editors'), armorNames: info.armorNames });
    const t0 = Date.now(); const bytes = fs.readFileSync(SAVES[game]);
    const res = await host.run(game, bytes, plan);
    const post = await host.verify(game, res.bytes, plan.checks);
    // compare against the jsdom result produced earlier (same code, different engine)
    const ref = fs.existsSync(`/tmp/out-${game}.sav`) ? fs.readFileSync(`/tmp/out-${game}.sav`) : null;
    console.log(`[electron] ${game}: ${Date.now() - t0}ms changes=${res.report.changes.length} warnings=${res.report.warnings.length} checks_ok=${post.every(Boolean)} size ${bytes.length}->${res.bytes.length}`,
      ref ? `identical_to_jsdom_run=${Buffer.compare(ref, res.bytes) === 0}` : '');
    if (!post.every(Boolean)) ok = false;
  }
  app.exit(ok ? 0 : 1);
});
