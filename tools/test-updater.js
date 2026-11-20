const http = require('http'), fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto');
const U = require('../src/main/updater');
let fail = 0; const check = (c, m) => { console.log((c ? '  PASS ' : '  FAIL ') + m); if (!c) fail++; };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'apsync-upd-'));
const payload = crypto.randomBytes(300000); const sha = crypto.createHash('sha256').update(payload).digest('hex');
let mode = 'newer';
const srv = http.createServer((req, res) => {
  const base = `http://127.0.0.1:${srv.address().port}`;
  if (req.url === '/api') {
    if (mode === 'none') { res.statusCode = 404; return res.end('{"message":"Not Found"}'); }
    if (mode === 'ratelimit') { res.statusCode = 403; return res.end('{"message":"API rate limit exceeded"}'); }
    const tag = mode === 'same' ? 'v0.1.0' : 'v0.2.0';
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ tag_name: tag, assets: [
      { name: 'BotW-TotK-AP-Manual-Sync-0.2.0-linux.AppImage', browser_download_url: base + '/redirect/linux', size: payload.length, digest: 'sha256:' + (mode === 'badsum' ? '0'.repeat(64) : sha) },
      { name: 'BotW-TotK-AP-Manual-Sync-0.2.0-win.exe', browser_download_url: base + '/redirect/win', size: payload.length },
      { name: 'source.zip', browser_download_url: base + '/x', size: 1 }] }));
  }
  if (req.url.startsWith('/redirect/')) { res.statusCode = 302; res.setHeader('Location', '/file'); return res.end(); } // GitHub redirects asset downloads
  if (req.url === '/file') { res.setHeader('Content-Length', payload.length); return res.end(payload); }
  res.statusCode = 404; res.end();
});
srv.listen(0, async () => {
  process.env.APSYNC_UPDATE_API = `http://127.0.0.1:${srv.address().port}/api`;
  console.log('== version logic');
  check(U.compareVersions('0.2.0', '0.1.0') === 1 && U.compareVersions('v0.1.0', '0.1.0') === 0 && U.compareVersions('0.1.0', '0.10.0') === -1 && U.compareVersions('1.0.0', '0.99.9') === 1, 'compareVersions (incl. v-prefix and 0.10 > 0.9 style ordering)');
  console.log('\n== which build is running');
  check(U.detectKind({ APPIMAGE: '/home/u/App.AppImage' }, 'linux').kind === 'appimage', 'AppImage detected on Linux');
  check(U.detectKind({ PORTABLE_EXECUTABLE_FILE: 'C:\\x\\App.exe' }, 'win32').kind === 'win-portable', 'portable exe detected on Windows');
  check(U.detectKind({}, 'linux').kind === 'other' && U.detectKind({ APPIMAGE: '/x' }, 'win32').kind === 'other', 'npm start / other builds cannot self-update');

  console.log('\n== checking the "repo"');
  let r = await U.checkLatest('0.1.0'); check(r.status === 'ok' && r.latest === '0.2.0' && r.newer, `newer release found (${r.latest})`);
  check(U.pickAsset(r.release, 'appimage').name.endsWith('.AppImage') && U.pickAsset(r.release, 'win-portable').name.endsWith('-win.exe') && U.pickAsset(r.release, 'other') === null, 'right asset chosen per build type');
  mode = 'same'; r = await U.checkLatest('0.1.0'); check(r.status === 'ok' && !r.newer, 'same version -> not newer');
  mode = 'none'; r = await U.checkLatest('0.1.0'); check(r.status === 'none', 'repo/releases not there yet (404) -> "none"');
  mode = 'ratelimit'; r = await U.checkLatest('0.1.0'); check(r.status === 'error' && /rate limit/i.test(r.message), 'API error surfaced: ' + r.message);

  console.log('\n== download + install (AppImage)');
  mode = 'newer'; r = await U.checkLatest('0.1.0'); const asset = U.pickAsset(r.release, 'appimage');
  const target = path.join(tmp, 'App.AppImage'); fs.writeFileSync(target, 'old build'); fs.chmodSync(target, 0o755);
  let prog = 0; const dl = await U.download(asset.browser_download_url, target + '.update', { size: asset.size, digest: asset.digest, onProgress: p => { prog = p; } });
  check(fs.statSync(dl).size === payload.length && prog === 1, 'downloaded through a redirect, size + sha256 verified, progress reached 100%');
  const calls = []; U.installUpdate({ kind: 'appimage', target, file: dl, spawn: (...a) => { calls.push(a); return { unref() {} }; } });
  check(Buffer.compare(fs.readFileSync(target), payload) === 0 && !fs.existsSync(dl) && (fs.statSync(target).mode & 0o111) !== 0, 'AppImage replaced in place, still executable, temp file gone');
  check(calls.length === 1 && calls[0][0] === 'sh' && calls[0][1].includes(target) && calls[0][2].detached, 'relaunch helper spawned detached for: ' + calls[0][1][calls[0][1].length - 1]);
  mode = 'badsum'; r = await U.checkLatest('0.1.0'); const bad = U.pickAsset(r.release, 'appimage'); const t2 = path.join(tmp, 'bad.update');
  let threw = false; try { await U.download(bad.browser_download_url, t2, { size: bad.size, digest: bad.digest }); } catch (e) { threw = /Checksum/.test(e.message); }
  check(threw && !fs.existsSync(t2), 'checksum mismatch -> rejected and the file is deleted');

  console.log('\n== Windows swap script (generated only; cmd.exe is not runnable here)');
  const w = U.buildWinScript('C:\\Apps\\Sync.exe.update', 'C:\\Apps\\Sync.exe');
  check(/move \/Y "%NEW%" "%OLD%"/.test(w) && /start "" "%OLD%"/.test(w) && w.includes('set "NEW=C:\\Apps\\Sync.exe.update"') && w.includes('\r\n'), 'script waits for the old exe to unlock, swaps, relaunches, deletes itself');
  const wcalls = []; const wf = path.join(tmp, 'new.exe'); fs.writeFileSync(wf, 'x');
  U.installUpdate({ kind: 'win-portable', target: 'C:\\Apps\\Sync.exe', file: wf, tmpdir: tmp, spawn: (...a) => { wcalls.push(a); return { unref() {} }; } });
  check(wcalls[0][0] === 'cmd.exe' && wcalls[0][1][0] === '/c' && fs.existsSync(wcalls[0][1][1]), 'cmd.exe spawned detached with the script');
  srv.close(); console.log(fail ? `\n${fail} FAILED` : '\nALL PASS'); process.exit(fail ? 1 : 0);
});
