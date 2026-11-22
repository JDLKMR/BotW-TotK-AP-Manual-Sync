const $ = (id) => document.getElementById(id);
const GAMES = [
  { key: 'botw', title: 'Breath of the Wild', icon: 'botw.png', file: 'game_data.sav', apGame: 'Manual_BreathoftheWild_JD' },
  { key: 'totk', title: 'Tears of the Kingdom', icon: 'totk.png', file: 'progress.sav', apGame: 'Manual_TearsoftheKingdom_JD' }
];
const TIP = 'The game stores its saves in several numbered folders, one for each save slot. One of these folders (usually "1") stores the save that is overwritten when the game is manually saved. Be sure to use this one. Network drives, UNC paths (\\\\...\\...), and mounted SSH/SFTP shares are supported.';
const BALLAD = [['rito', 'Rito', 'Vah Medoh'], ['goron', 'Goron', 'Vah Rudania'], ['zora', 'Zora', 'Vah Ruta'], ['gerudo', 'Gerudo', 'Vah Naboris']];
const BALLAD_TIP = 'These flags are enabled by default to allow access to DLC shrines. However, they must be temporarily disabled before entering their respective Divine Beast so it loads in its proper state.';
function balladBlock() {
  return `<div class="ballad"><div class="ballad-head"><span class="lbl">Champions' Ballad/Divine Beast flags<span class="tip" title="${BALLAD_TIP}">i</span></span>
      <label class="chk"><input type="checkbox" id="botw-ballad-all"> All</label></div>
    <div class="ballad-grid">${BALLAD.map(b => `<label class="chk" title="BalladOfHero${b[1]}_Activated"><input type="checkbox" id="botw-ballad-${b[0]}"> ${b[1]} <span class="muted">(${b[2]})</span></label>`).join('')}</div></div>`;
}
const TOWER_UI = {
  botw: { title: 'Sheikah Towers', verb: 'climb', tp: "Updates your coordinates to the chosen tower's base, should you wish to more fully observe logic and climb it instead of warping to the top." },
  totk: { title: 'Skyview Towers', verb: 'open', tp: "Updates your coordinates to outside the chosen tower, should you wish to more fully observe logic and open it instead of warping into it." }
};
const warpTip = (k) => `Unlocks a tower's warp point immediately upon receiving that tower. Note that logic expects what would be needed to ${TOWER_UI[k].verb} it, including temperature considerations.`;
const attr = (t) => String(t).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
function towerBlock(k) {
  return `<div class="ballad towers"><div class="ballad-head"><span class="lbl">${TOWER_UI[k].title}</span></div>
    <div class="tower-row"><label class="chk"><input type="checkbox" id="${k}-warps"> Unlock Tower Warps<span class="tip" title="${attr(warpTip(k))}">i</span></label>
      <label class="tower-sel"><span>Teleport to Tower<span class="tip" title="${attr(TOWER_UI[k].tp)}">i</span></span><select id="${k}-tp"></select></label></div></div>`;
}
let towerDefs = { botw: [], totk: [] }, towerRecv = { botw: [], totk: [] }, towerSig = {};
/* "Teleport to Tower": every tower by name, only the ones received so far (and with known coordinates) can be picked; the rest are greyed out */
function renderTowerSelect(k) {
  const sel = $(k + '-tp'); if (!sel) return;
  const have = new Set(towerRecv[k]), sig = JSON.stringify([towerDefs[k].map(d => [d.id, d.hasCoords, have.has(d.id)])]);
  if (towerSig[k] === sig) return; towerSig[k] = sig;
  const keep = sel.value;
  sel.innerHTML = '<option value="">None</option>' + towerDefs[k].map(d => `<option value="${d.id}"${have.has(d.id) && d.hasCoords ? '' : ' disabled'}>${esc(d.label)}</option>`).join('');
  sel.value = keep && !(sel.querySelector(`option[value="${keep}"]`) || {}).disabled ? keep : '';
}
function fillGameOpts(games) {
  BALLAD.forEach(b => { $('botw-ballad-' + b[0]).checked = !(games.botw.ballad && games.botw.ballad[b[0]] === false); }); syncBalladAll();
  ['botw', 'totk'].forEach(k => { const t = games[k].towers || {}; $(k + '-warps').checked = t.unlockWarps !== false; renderTowerSelect(k); $(k + '-tp').value = t.teleportTo || ''; });
}
/* these options go to the settings right away (no Apply button), so the next in-game save picks them up */
function pushGameOpts() {
  const o = { botw: { ballad: Object.fromEntries(BALLAD.map(b => [b[0], $('botw-ballad-' + b[0]).checked])) } };
  ['botw', 'totk'].forEach(k => { o[k] = Object.assign(o[k] || {}, { towers: { unlockWarps: $(k + '-warps').checked, teleportTo: $(k + '-tp').value } }); });
  settings.games.botw.ballad = o.botw.ballad; ['botw', 'totk'].forEach(k => { settings.games[k].towers = o[k].towers; });
  return window.api.saveGameOpts(o);
}
function syncBalladAll() {
  const boxes = BALLAD.map(b => $('botw-ballad-' + b[0])), all = $('botw-ballad-all'), n = boxes.filter(x => x.checked).length;
  all.checked = n === boxes.length; all.indeterminate = n > 0 && n < boxes.length;
}
let settings;

function gameCard(g) {
  const d = document.createElement('section'); d.className = 'card'; d.id = 'card-' + g.key;
  d.innerHTML = `
    <div class="gamehead"><h2><img class="gameicon" src="${g.icon}" alt="">${g.title}</h2><label class="chk"><input type="checkbox" id="${g.key}-enabled"> Enabled</label></div>
    <div class="grid2">
      <label><span>Slot name <span class="muted">(game: ${g.apGame})</span></span><input id="${g.key}-slot" placeholder="Your slot name in the room"></label>
      <label><span>Save folder<span class="tip" title="${TIP.replace(/"/g, '&quot;')}">i</span></span>
        <div class="pathrow"><input id="${g.key}-dir" placeholder="…/${g.file === 'game_data.sav' ? '0/1' : '1'}  (folder containing ${g.file})"><button id="${g.key}-browse" type="button">Browse…</button></div></label>
    </div>
${g.key === 'botw' ? towerBlock('botw') + balladBlock() : towerBlock('totk')}
    <div class="status" id="${g.key}-status"><span><i class="dot"></i>Not running</span></div>
    <div class="actions" style="margin:0"><button id="${g.key}-apply" type="button">Apply Now</button><button id="${g.key}-backups" type="button" class="ghost">Open Backups</button></div>`;
  return d;
}
function fill() {
  $('server').value = settings.server; $('port').value = settings.port; $('password').value = settings.password;
  ['minimizeToTray', 'closeToTray', 'startMinimized', 'launchAtLogin'].forEach(k => $(k).checked = !!settings[k]);
  GAMES.forEach(g => { const c = settings.games[g.key]; $(g.key + '-enabled').checked = c.enabled; $(g.key + '-slot').value = c.slot; $(g.key + '-dir').value = c.saveDir; });
  fillGameOpts(settings.games);
}
function collect() {
  const s = { server: $('server').value.trim(), port: parseInt($('port').value, 10) || 38281, password: $('password').value, games: {} };
  ['minimizeToTray', 'closeToTray', 'startMinimized', 'launchAtLogin'].forEach(k => s[k] = $(k).checked);
  GAMES.forEach(g => s.games[g.key] = { enabled: $(g.key + '-enabled').checked, slot: $(g.key + '-slot').value.trim(), saveDir: $(g.key + '-dir').value.trim() });
  s.games.botw.ballad = Object.fromEntries(BALLAD.map(b => [b[0], $('botw-ballad-' + b[0]).checked]));
  GAMES.forEach(g => { s.games[g.key].towers = { unlockWarps: $(g.key + '-warps').checked, teleportTo: $(g.key + '-tp').value }; });
  return Object.assign({}, settings, s, { games: s.games });
}
function renderStatus(st) {
  const el = $(st.key + '-status'); if (!el) return;
  towerRecv[st.key] = st.towers || []; renderTowerSelect(st.key);
  const apTxt = { connected: 'Connected to Archipelago', connecting: 'Connecting…', error: 'Connection error', stopped: 'Not connected' }[st.ap] || st.ap;
  const saveTxt = { ok: 'Save file found', missing: 'Save file NOT found at location', unset: 'Set a save folder', unknown: '…' }[st.save] || st.save;
  const n = st.pendingItems;
  const waitTxt = n > 0 ? `${n} new ${n === 1 ? 'item' : 'items'} (${st.pendingProgression || 0} progression)! Save in-game, then reload` : 'Pending changes! Save in-game, then reload';
  const wait = st.awaitingSave ? `<span class="badge wait">${waitTxt}</span>` : (st.items ? '<span class="badge ok">Up to date</span>' : '');
  el.innerHTML = `<span><i class="dot ${st.ap}"></i>${apTxt}${st.apDetail && st.ap !== 'connected' ? ' <span class="muted">(' + esc(st.apDetail) + ')</span>' : ''}</span>
    <span>${esc(saveTxt)}</span><span>${st.items} items received${st.startItems ? ' (' + st.startItems + ' starting)' : ''}${st.pendingItems ? ', ' + st.pendingItems + ' not yet in save' : ''}</span>${wait}
    ${st.busy ? '<span class="badge">Working…</span>' : ''}${st.lastApply ? `<span class="muted">last write ${new Date(st.lastApply).toLocaleString()}</span>` : ''}`;
}
const esc = (s) => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
function addLog(e) {
  const box = $('log'); const d = document.createElement('div'); d.className = 'l-' + e.level;
  d.innerHTML = `<span class="t">${new Date(e.t).toLocaleTimeString()} ${e.game ? '[' + e.game.toUpperCase() + '] ' : ''}</span>${esc(e.msg)}`;
  const stick = box.scrollTop + box.clientHeight >= box.scrollHeight - 30; box.appendChild(d); if (stick) box.scrollTop = box.scrollHeight;
}
(async function init() {
  GAMES.forEach(g => $('games').appendChild(gameCard(g)));
  settings = await window.api.getSettings(); towerDefs = await window.api.getTowers(); fill();
  GAMES.forEach(g => {
    $(g.key + '-browse').onclick = async () => { const p = await window.api.pickDir(); if (p) $(g.key + '-dir').value = p; };
    $(g.key + '-apply').onclick = () => window.api.applyNow(g.key);
    $(g.key + '-backups').onclick = () => window.api.openBackups();
  });
  BALLAD.forEach(b => { $('botw-ballad-' + b[0]).onchange = () => { syncBalladAll(); pushGameOpts(); }; });
  $('botw-ballad-all').onchange = (e) => { BALLAD.forEach(b => { $('botw-ballad-' + b[0]).checked = e.target.checked; }); syncBalladAll(); pushGameOpts(); };
  GAMES.forEach(g => { $(g.key + '-warps').onchange = pushGameOpts; $(g.key + '-tp').onchange = pushGameOpts; });
  window.api.on('settings:changed', (s) => { settings = s; fill(); }); // launch arguments applied by a second launch
  window.api.on('opts:changed', (games) => { Object.assign(settings.games.botw, { towers: games.botw.towers }); Object.assign(settings.games.totk, { towers: games.totk.towers }); fillGameOpts(settings.games); }); // a teleport request was used up
  $('saveBtn').onclick = async () => { settings = collect(); await window.api.saveSettings(settings); $('saved').textContent = 'Saved ' + new Date().toLocaleTimeString(); };
  $('clearLog').onclick = () => { $('log').innerHTML = ''; };
  const setPause = (p) => { $('pauseBtn').textContent = p ? 'Resume Syncing' : 'Pause Syncing'; $('pauseBtn').dataset.p = p ? '1' : ''; };
  $('pauseBtn').onclick = () => window.api.setPaused(!$('pauseBtn').dataset.p);
  window.api.on('paused', setPause); setPause(await window.api.getPaused());
  (await window.api.getLog()).forEach(addLog); window.api.on('log', addLog);
  (await window.api.getStatuses()).forEach(renderStatus); window.api.on('status', renderStatus);
})();
