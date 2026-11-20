// Test-only host: runs a driver inside the real editor page using jsdom (production uses Electron BrowserWindows).
const fs = require('fs'), path = require('path');
const { openEditor } = require('./probe');
const SRC = path.join(__dirname, '..', 'src', 'drivers');
async function runDriver(game, bytes, plan) {
  const dom = await openEditor(game);
  const w = dom.window;
  w.eval(fs.readFileSync(path.join(SRC, 'common.driver.js'), 'utf8'));
  w.eval(fs.readFileSync(path.join(SRC, game + '.driver.js'), 'utf8'));
  w.__in = Buffer.from(bytes).toString('base64'); w.__plan = JSON.stringify(plan);
  const res = JSON.parse(w.eval('__apDriver.run(__in, __plan)'));
  w.close();
  if (!res.ok) throw new Error(res.error);
  res.bytes = Buffer.from(res.b64, 'base64'); delete res.b64;
  return res;
}
async function verifyDriver(game, bytes, checks) {
  const dom = await openEditor(game); const w = dom.window;
  w.eval(fs.readFileSync(path.join(SRC, 'common.driver.js'), 'utf8'));
  w.eval(fs.readFileSync(path.join(SRC, game + '.driver.js'), 'utf8'));
  w.__in = Buffer.from(bytes).toString('base64'); w.__chk = JSON.stringify(checks);
  const res = JSON.parse(w.eval('__apDriver.verify(__in, __chk)')); w.close();
  if (!res.ok) throw new Error(res.error); return res.results;
}
module.exports = { runDriver, verifyDriver };
