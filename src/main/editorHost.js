/*
 * Runs the unmodified Marc Robledo save editors in hidden Chromium windows and drives them with our drivers.
 * Network access is blocked for these windows (everything is local file://).
 */
const { BrowserWindow, session } = require('electron');
const fs = require('fs'); const path = require('path');

class EditorHost {
  constructor({ vendorDir, driversDir }) {
    this.vendorDir = vendorDir; this.driversDir = driversDir; this.queue = Promise.resolve();
    this.src = {};
    for (const f of ['common', 'botw', 'totk']) this.src[f] = fs.readFileSync(path.join(driversDir, f + '.driver.js'), 'utf8');
    this.n = 0;
  }
  _newSession() { // a fresh in-memory session per page: re-using one after destroying its window made the next loadFile fail
    const ses = session.fromPartition('apsync-editors-' + (++this.n));
    ses.webRequest.onBeforeRequest((d, cb) => cb({ cancel: !/^(file|devtools|data|blob):/i.test(d.url) })); // editors never touch the network
    return ses;
  }
  _enqueue(fn) { const p = this.queue.then(fn, fn); this.queue = p.catch(() => {}); return p; }
  async _withPage(game, fn) {
    const win = new BrowserWindow({ show: false, width: 1000, height: 800, webPreferences: { session: this._newSession(), sandbox: true, contextIsolation: true, nodeIntegration: false, images: false, backgroundThrottling: false } });
    try {
      const page = path.join(this.vendorDir, game === 'botw' ? 'zelda-botw' : 'zelda-totk', 'index.html');
      win.webContents.on('did-fail-load', (e, code, desc, url, isMain) => { if (process.env.APSYNC_DEBUG) console.log('did-fail-load', code, desc, url.slice(0, 90), 'main=' + isMain); });
      await win.loadFile(page);
      await new Promise(r => setTimeout(r, 300)); // let the editor's window.onload handlers finish
      await win.webContents.executeJavaScript(this.src.common + '\n' + this.src[game], true);
      return await fn(win.webContents);
    } finally {
      // close(), not destroy(): destroy() made the next page load fail
      if (!win.isDestroyed()) win.close();
    }
  }
  run(game, bytes, plan) {
    return this._enqueue(() => this._withPage(game, async (wc) => {
      const out = JSON.parse(await wc.executeJavaScript(`__apDriver.run(${JSON.stringify(Buffer.from(bytes).toString('base64'))}, ${JSON.stringify(JSON.stringify(plan))})`, true));
      if (!out.ok) throw new Error(out.error);
      return { bytes: Buffer.from(out.b64, 'base64'), report: out.report };
    }));
  }
  verify(game, bytes, checks) {
    return this._enqueue(() => this._withPage(game, async (wc) => {
      const out = JSON.parse(await wc.executeJavaScript(`__apDriver.verify(${JSON.stringify(Buffer.from(bytes).toString('base64'))}, ${JSON.stringify(JSON.stringify(checks))})`, true));
      if (!out.ok) throw new Error(out.error);
      return out.results;
    }));
  }
}
module.exports = { EditorHost };
