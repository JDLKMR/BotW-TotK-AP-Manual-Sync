// Spawns the real Electron app against a fake GitHub server. Usage: node tools/test-updater-electron.js <path-to-electron-binary>
const http = require('http'), fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto'), { spawn } = require('child_process');
const ELECTRON = process.argv[2]; const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'apsync-ue-'));
const payload = crypto.randomBytes(200000); let tag = 'v0.2.0', none = false;
const srv = http.createServer((req, res) => {
  const base = `http://127.0.0.1:${srv.address().port}`;
  if (req.url === '/api') { if (none) { res.statusCode = 404; return res.end('{}'); } return res.end(JSON.stringify({ tag_name: tag, html_url: base + '/page', assets: [{ name: 'BotW-TotK-AP-Manual-Sync-0.2.0-linux.AppImage', browser_download_url: base + '/dl', size: payload.length, digest: 'sha256:' + crypto.createHash('sha256').update(payload).digest('hex') }] })); }
  if (req.url === '/dl') { res.statusCode = 302; res.setHeader('Location', '/file'); return res.end(); }
  if (req.url === '/file') return res.end(payload);
  res.statusCode = 404; res.end();
});
const run = (extraEnv) => new Promise((resolve) => {
  const p = spawn('xvfb-run', ['-a', ELECTRON, '--no-sandbox', '--disable-gpu', '--user-data-dir=' + fs.mkdtempSync(path.join(tmp, 'ud-')), path.join(__dirname, '..')], { env: Object.assign({}, process.env, { APSYNC_UPDATE_API: `http://127.0.0.1:${srv.address().port}/api`, APSYNC_DIALOG_AUTO: '1', APSYNC_RUN_UPDATE_CHECK: '1' }, extraEnv) });
  let out = ''; p.stdout.on('data', d => out += d); p.stderr.on('data', d => out += d);
  const t = setTimeout(() => p.kill('SIGKILL'), 60000); p.on('close', () => { clearTimeout(t); resolve(out.split('\n').filter(l => /DIALOG|UPDATE/.test(l)).join('\n')); });
});
let fail = 0; const check = (c, m) => { console.log((c ? '  PASS ' : '  FAIL ') + m); if (!c) fail++; };
srv.listen(0, async () => {
  const appimage = path.join(tmp, 'Sync.AppImage'); fs.writeFileSync(appimage, 'old build');
  console.log('== newer release, running as an AppImage'); let out = await run({ APPIMAGE: appimage }); console.log(out.split('\n').map(l => '    ' + l).join('\n'));
  check(/A new version is available \| Current version: 0\.1\.0 \/ Latest version: 0\.2\.0/.test(out), 'dialog shows current (0.1.0) and latest (0.2.0) versions');
  await new Promise(r => setTimeout(r, 500));
  check(fs.existsSync(appimage) && Buffer.compare(fs.readFileSync(appimage), payload) === 0 && !fs.existsSync(appimage + '.update'), 'the AppImage file was downloaded, verified and swapped in');
  console.log('\n== same version'); tag = 'v0.1.0'; out = await run({ APPIMAGE: appimage }); check(/up to date \| Current version: 0\.1\.0 \/ Latest version: 0\.1\.0/.test(out), 'says up to date with both versions: ' + out.trim());
  console.log('\n== repo has no releases yet'); none = true; out = await run({ APPIMAGE: appimage }); check(/No releases found yet \| Current version: 0\.1\.0/.test(out), 'says none published: ' + out.trim());
  console.log('\n== newer release, but running from source (npm start)'); none = false; tag = 'v0.2.0'; out = await run({}); check(/can't update itself/.test(out), 'offers the release page instead of self-updating');
  srv.close(); console.log(fail ? `\n${fail} FAILED` : '\nALL PASS'); process.exit(fail ? 1 : 0);
});
