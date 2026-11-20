const { app, BrowserWindow, Tray, Menu, ipcMain, dialog, shell, nativeImage } = require('electron');
const path = require('path'); const fs = require('fs');
const { JsonStore, DEFAULT_SETTINGS } = require('./store');
const { EditorHost } = require('./editorHost');
const { SyncManager } = require('./syncEngine');
const updater = require('./updater');

const ROOT = path.join(__dirname, '..', '..');
if (!app.requestSingleInstanceLock()) { app.quit(); return; }

let win, tray, mgr, settings, ledger, quitting = false, paused = false, updating = false;
const logBuf = [];
const dirs = {
  vendorDir: path.join(ROOT, 'vendor', 'savegame-editors'), apworldsRoot: path.join(ROOT, 'apworlds'),
  driversDir: path.join(ROOT, 'src', 'drivers'), backupRoot: null, dataDir: null
};
const APP_TITLE = 'BotW/TotK AP Manual Sync';
const icon = () => nativeImage.createFromPath(path.join(ROOT, 'assets', 'icon.png')); // square, as window/tray/installer icons must be
const send = (ch, payload) => { if (win && !win.isDestroyed()) win.webContents.send(ch, payload); };

function createWindow(show) {
  win = new BrowserWindow({ width: 980, height: 820, minWidth: 760, minHeight: 600, show, title: APP_TITLE, icon: icon(), backgroundColor: '#14161a',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  win.loadFile(path.join(ROOT, 'src', 'renderer', 'index.html'));
  win.on('minimize', (e) => { if (settings.data.minimizeToTray) { e.preventDefault(); win.hide(); } });
  win.on('close', (e) => { if (!quitting && settings.data.closeToTray) { e.preventDefault(); win.hide(); } });
}
function showWindow() { if (!win || win.isDestroyed()) createWindow(true); else { win.show(); win.restore(); win.focus(); } }

/* ---- Check for Updates (tray) ---- */
async function checkForUpdates() {
  if (updating) return;
  const parent = win && !win.isDestroyed() && win.isVisible() ? win : null;
  const box = (o) => {
    o = Object.assign({ type: 'info', title: APP_TITLE, noLink: true }, o);
    if (process.env.APSYNC_DIALOG_AUTO) { console.log('DIALOG:', o.message, '|', String(o.detail || '').replace(/\n/g, ' / ')); return Promise.resolve({ response: 0 }); } // test hook
    return parent ? dialog.showMessageBox(parent, o) : dialog.showMessageBox(o);
  };
  const cur = app.getVersion();
  const r = await updater.checkLatest(cur);
  if (r.status === 'error') return box({ type: 'warning', message: "Couldn't check for updates", detail: `${r.message}\n\nCurrent version: ${cur}` });
  if (r.status === 'none') return box({ message: 'No releases found yet', detail: `Current version: ${cur}\nLatest version: none published yet` });
  const info = `Current version: ${cur}\nLatest version: ${r.latest}`;
  if (!r.newer) return box({ message: "You're up to date", detail: info });
  const how = updater.detectKind(); const asset = updater.pickAsset(r.release, how.kind);
  if (!asset) {
    const why = how.kind === 'other' ? "This build can't update itself (it isn't the portable .exe or the AppImage)." : 'The latest release has no download for this build.';
    const { response } = await box({ message: 'A new version is available', detail: `${info}\n\n${why}`, buttons: ['Open Release Page', 'Close'], defaultId: 0, cancelId: 1 });
    if (response === 0) shell.openExternal(r.release.html_url || updater.RELEASES_PAGE);
    return;
  }
  const { response } = await box({ message: 'A new version is available', detail: info, buttons: ['Update Now', 'Later'], defaultId: 0, cancelId: 1 });
  if (response !== 0) return;
  updating = true;
  const dest = how.target + '.update';
  try {
    await updater.download(asset.browser_download_url, dest, { size: asset.size, digest: asset.digest, onProgress: (p) => {
      if (tray) tray.setToolTip(`${APP_TITLE} - downloading update ${Math.round(p * 100)}%`);
      if (win && !win.isDestroyed()) win.setProgressBar(p);
    } });
    updater.installUpdate({ kind: how.kind, target: how.target, file: dest });
    quitting = true; app.quit(); // the helper relaunches the new version once we are gone
  } catch (e) {
    updating = false; if (tray) tray.setToolTip(APP_TITLE); if (win && !win.isDestroyed()) win.setProgressBar(-1);
    try { require('fs').rmSync(dest, { force: true }); } catch (_) {}
    box({ type: 'warning', message: 'Update failed', detail: `${e.message}\n\nCurrent version: ${cur}\nLatest version: ${r.latest}` });
  }
}

function buildTray() {
  tray = new Tray(icon().resize({ width: 24, height: 24 }));
  tray.setToolTip(APP_TITLE);
  const rebuild = () => tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show Window', click: showWindow },
    { label: paused ? 'Resume Syncing' : 'Pause Syncing', click: () => { paused = !paused; mgr.setPaused(paused); rebuild(); send('paused', paused); } },
    { label: 'Check for Updates', click: () => { checkForUpdates().catch(e => console.error('update check failed', e)); } },
    { type: 'separator' },
    { label: 'Quit', click: () => { quitting = true; app.quit(); } }
  ]));
  rebuild();
  tray.on('click', () => (win && win.isVisible() ? win.hide() : showWindow()));
}

function applyLoginItem() { try { app.setLoginItemSettings({ openAtLogin: !!settings.data.launchAtLogin, args: ['--hidden'] }); } catch (_) {} }

app.whenReady().then(() => {
  Menu.setApplicationMenu(null); app.setAppUserModelId('dev.jd.botw-totk-ap-manual-sync');
  const ud = app.getPath('userData');
  // the app used to be called "AP Zelda Save Sync": carry its settings, ledger and backups over once
  try {
    const oldDir = path.join(app.getPath('appData'), 'AP Zelda Save Sync');
    if (oldDir !== ud && fs.existsSync(oldDir) && !fs.existsSync(path.join(ud, 'settings.json'))) {
      fs.mkdirSync(ud, { recursive: true });
      for (const f of ['settings.json', 'ledger.json', 'backups', 'datapackages']) if (fs.existsSync(path.join(oldDir, f))) fs.cpSync(path.join(oldDir, f), path.join(ud, f), { recursive: true });
    }
  } catch (_) { /* start fresh */ }
  dirs.backupRoot = path.join(ud, 'backups'); dirs.dataDir = path.join(ud, 'datapackages');
  settings = new JsonStore(path.join(ud, 'settings.json'), DEFAULT_SETTINGS);
  ledger = new JsonStore(path.join(ud, 'ledger.json'), { botw: {}, totk: {} });
  const host = new EditorHost(dirs);
  mgr = new SyncManager({ settings, ledgerStore: ledger, host: { run: (g, b, p) => host.run(g, b, p), verify: (g, b, c) => host.verify(g, b, c) }, dirs });
  mgr.on('log', (e) => { logBuf.push(e); if (logBuf.length > 600) logBuf.shift(); send('log', e); });
  mgr.on('status', (s) => send('status', s));

  const hidden = process.argv.includes('--hidden') || settings.data.startMinimized;
  createWindow(!hidden); buildTray(); applyLoginItem(); mgr.start();
  if (process.env.APSYNC_RUN_UPDATE_CHECK) { // dev/test hook
    checkForUpdates().then(() => { if (!updating) { quitting = true; app.exit(0); } }, e => { console.log('UPDATE CHECK FAILED', e.message); app.exit(1); });
  }
  if (process.env.APSYNC_SELFTEST) { // dev/test hook: prove the (packaged) editor host works: APSYNC_SELFTEST=botw|totk APSYNC_SELFTEST_SAVE=<path to a save>
    (async () => { try { const t = Date.now(); const r = await host.verify(process.env.APSYNC_SELFTEST, fs.readFileSync(process.env.APSYNC_SELFTEST_SAVE), []); console.log('SELFTEST OK', JSON.stringify(r), (Date.now() - t) + 'ms'); } catch (e) { console.log('SELFTEST FAILED', e.message); } quitting = true; app.exit(0); })();
  }
  if (process.env.APSYNC_SCREENSHOT) { // dev/test hook
    win.webContents.once('did-finish-load', () => setTimeout(async () => { fs.writeFileSync(process.env.APSYNC_SCREENSHOT, (await win.webContents.capturePage()).toPNG()); quitting = true; app.quit(); }, 1500));
  }

  ipcMain.handle('settings:get', () => settings.data);
  ipcMain.handle('settings:save', (_e, data) => {
    const g = data.games; Object.assign(settings.data, data); settings.data.games = g; settings.save(); applyLoginItem(); mgr.start(); return true;
  });
  ipcMain.handle('status:get', () => mgr.statuses());
  ipcMain.handle('log:get', () => logBuf);
  ipcMain.handle('paused:get', () => paused);
  ipcMain.handle('apply-now', async (_e, key) => { await mgr.applyNow(key); });
  ipcMain.handle('pick-dir', async () => { const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'] }); return r.canceled ? null : r.filePaths[0]; });
  ipcMain.handle('open-backups', () => { fs.mkdirSync(dirs.backupRoot, { recursive: true }); return shell.openPath(dirs.backupRoot); });
  ipcMain.handle('pause', (_e, p) => { paused = !!p; mgr.setPaused(paused); send('paused', paused); return paused; });
});
app.on('second-instance', showWindow);
app.on('before-quit', () => { quitting = true; if (mgr) mgr.stop(); });
app.on('window-all-closed', () => { /* stay alive in the tray */ });
