/* Save-file access: stat / read / safe overwrite with rolling backups. Plain fs => works with UNC paths, mapped drives and SSHFS mounts. */
const fs = require('fs'); const fsp = fs.promises; const path = require('path');
function resolveSavePath(dirOrFile, fileName) {
  let p = String(dirOrFile || '').trim().replace(/^"|"$/g, '');
  if (!p) return null;
  if (/\.sav$/i.test(p)) p = path.dirname(p);
  return path.join(p, fileName);
}
async function statSave(file) { try { const s = await fsp.stat(file); return { mtimeMs: s.mtimeMs, size: s.size }; } catch (_) { return null; } }
const sameStat = (a, b) => !!a && !!b && a.mtimeMs === b.mtimeMs && a.size === b.size;
async function backup(file, backupDir, keep) {
  await fsp.mkdir(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  await fsp.copyFile(file, path.join(backupDir, `${stamp}-${path.basename(file)}`));
  const all = (await fsp.readdir(backupDir)).filter(f => f.endsWith(path.basename(file))).sort();
  for (const f of all.slice(0, Math.max(0, all.length - keep))) await fsp.unlink(path.join(backupDir, f)).catch(() => {});
}
async function overwrite(file, bytes) {
  const tmp = file + '.apsync.tmp';
  let lastErr;
  for (let i = 0; i < 5; i++) {
    try { await fsp.writeFile(tmp, bytes); await fsp.rename(tmp, file); return 'rename'; }
    catch (e) { lastErr = e; await fsp.unlink(tmp).catch(() => {}); await new Promise(r => setTimeout(r, 400)); }
  }
  try { await fsp.writeFile(file, bytes); return 'direct'; } catch (e) { throw lastErr || e; } // some network shares refuse renames
}
module.exports = { resolveSavePath, statSave, sameStat, backup, overwrite };
