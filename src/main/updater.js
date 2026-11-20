/*
 * Update checker / self-updater for the two packaged builds:
 *   - Windows portable .exe  (env PORTABLE_EXECUTABLE_FILE is set by the portable launcher)
 *   - Linux AppImage         (env APPIMAGE is set by the AppImage runtime)
 * Anything else (npm start, unpacked folders) can check but not self-update.
 * Plain Node http/https only, so it can be tested without Electron.
 */
const https = require('https'), http = require('http'), fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto');
const { spawn: nodeSpawn } = require('child_process');

const REPO = 'JDLKMR/BotW-TotK-AP-Manual-Sync';
const RELEASES_PAGE = `https://github.com/${REPO}/releases/latest`;
const apiUrl = () => process.env.APSYNC_UPDATE_API || `https://api.github.com/repos/${REPO}/releases/latest`;

function request(url, { headers = {}, redirects = 6 } = {}) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https:') ? https : http;
    const req = lib.get(url, { headers: Object.assign({ 'User-Agent': 'BotW-TotK-AP-Manual-Sync', Accept: 'application/vnd.github+json' }, headers) }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume(); if (redirects <= 0) return reject(new Error('Too many redirects'));
        return resolve(request(new URL(res.headers.location, url).toString(), { headers, redirects: redirects - 1 }));
      }
      resolve(res);
    });
    req.setTimeout(20000, () => req.destroy(new Error('Request timed out')));
    req.on('error', reject);
  });
}
async function getJson(url) {
  const res = await request(url);
  const chunks = []; for await (const c of res) chunks.push(c);
  const text = Buffer.concat(chunks).toString('utf8');
  let json = null; try { json = JSON.parse(text); } catch (_) {}
  return { status: res.statusCode, json, text };
}

const parseVersion = (v) => String(v || '0').trim().replace(/^v/i, '').split(/[.+-]/).slice(0, 3).map(n => parseInt(n, 10) || 0);
function compareVersions(a, b) { const x = parseVersion(a), y = parseVersion(b); for (let i = 0; i < 3; i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d > 0 ? 1 : -1; } return 0; }

function detectKind(env = process.env, platform = process.platform) {
  if (platform === 'win32' && env.PORTABLE_EXECUTABLE_FILE) return { kind: 'win-portable', target: env.PORTABLE_EXECUTABLE_FILE };
  if (platform === 'linux' && env.APPIMAGE) return { kind: 'appimage', target: env.APPIMAGE };
  return { kind: 'other', target: null };
}
function pickAsset(release, kind) {
  const assets = (release && release.assets) || [];
  if (kind === 'win-portable') return assets.find(a => /win.*\.exe$/i.test(a.name)) || assets.find(a => /\.exe$/i.test(a.name) && !/setup|installer/i.test(a.name)) || null;
  if (kind === 'appimage') return assets.find(a => /\.AppImage$/i.test(a.name)) || null;
  return null;
}

/* -> { status: 'ok' | 'none' | 'error', latest, newer, release, message } */
async function checkLatest(currentVersion) {
  let r; try { r = await getJson(apiUrl()); } catch (e) { return { status: 'error', message: e.message }; }
  if (r.status === 404) return { status: 'none' };
  if (r.status !== 200 || !r.json) return { status: 'error', message: `GitHub answered ${r.status}${r.json && r.json.message ? ': ' + r.json.message : ''}` };
  const latest = String(r.json.tag_name || r.json.name || '').replace(/^v/i, '');
  return { status: 'ok', latest, newer: compareVersions(latest, currentVersion) > 0, release: r.json };
}

async function download(url, dest, { size, digest, onProgress } = {}) {
  const res = await request(url, { headers: { Accept: 'application/octet-stream' } });
  if (res.statusCode !== 200) { res.resume(); throw new Error(`Download failed (HTTP ${res.statusCode})`); }
  const total = size || parseInt(res.headers['content-length'] || '0', 10); const hash = crypto.createHash('sha256'); let got = 0;
  await new Promise((resolve, reject) => {
    const out = fs.createWriteStream(dest);
    res.on('data', (c) => { got += c.length; hash.update(c); if (onProgress && total) onProgress(got / total); });
    res.on('error', reject); out.on('error', reject); out.on('finish', resolve); res.pipe(out);
  });
  try {
    if (size && got !== size) throw new Error(`Downloaded ${got} bytes, expected ${size}`);
    if (digest && /^sha256:/i.test(digest) && hash.digest('hex') !== digest.slice(7).toLowerCase()) throw new Error('Checksum mismatch');
  } catch (e) { fs.rmSync(dest, { force: true }); throw e; }
  return dest;
}

function buildWinScript(newPath, oldPath) {
  return ['@echo off', 'setlocal', `set "NEW=${newPath}"`, `set "OLD=${oldPath}"`, 'set /a tries=0', ':wait', 'ping 127.0.0.1 -n 2 >nul',
    'move /Y "%NEW%" "%OLD%" >nul 2>&1', 'if errorlevel 1 (', '  set /a tries+=1', '  if %tries% LSS 90 goto wait', '  exit /b 1', ')',
    'start "" "%OLD%"', '(goto) 2>nul & del "%~f0"', ''].join('\r\n');
}

/* Swap the downloaded file in and relaunch. Returns after spawning the helper; the caller then quits the app. */
function installUpdate({ kind, target, file, spawn = nodeSpawn, tmpdir = os.tmpdir() }) {
  if (kind === 'appimage') {
    fs.chmodSync(file, 0o755);
    fs.renameSync(file, target); // replacing a running executable is fine on Linux: the old inode stays alive until we exit
    spawn('sh', ['-c', 'sleep 2; exec "$0"', target], { detached: true, stdio: 'ignore' }).unref();
    return 'relaunching';
  }
  if (kind === 'win-portable') {
    const script = path.join(tmpdir, `apsync-update-${crypto.randomBytes(4).toString('hex')}.cmd`);
    fs.writeFileSync(script, buildWinScript(file, target));
    spawn('cmd.exe', ['/c', script], { detached: true, stdio: 'ignore', windowsHide: true }).unref(); // waits for this process to exit, swaps the file, relaunches
    return 'relaunching';
  }
  throw new Error('This build cannot update itself');
}

module.exports = { REPO, RELEASES_PAGE, compareVersions, detectKind, pickAsset, checkLatest, download, installUpdate, buildWinScript };
