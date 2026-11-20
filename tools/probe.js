// Probe: load an editor page in jsdom, load a save, print values
const {JSDOM, ResourceLoader, VirtualConsole} = require('jsdom');
const fs = require('fs'), path = require('path');
async function openEditor(game, savePath) {
  const dir = path.join(__dirname, '..', 'vendor', 'savegame-editors', game === 'botw' ? 'zelda-botw' : 'zelda-totk');
  let html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  html = html.replace('https://unpkg.com/fflate@0.8.0', './lib/fflate.min.js');
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => console.error('[jsdomError]', e.message.slice(0, 200)));
  vc.on('error', e => console.error('[err]', String(e).slice(0,200)));
  const dom = new JSDOM(html, {
    url: 'file://' + dir + '/index.html', runScripts: 'dangerously', resources: 'usable',
    pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) { const mem={}; Object.defineProperty(w,'localStorage',{value:{getItem:k=>mem[k]??null,setItem:(k,v)=>{mem[k]=String(v)},removeItem:k=>{delete mem[k]}}});  w.matchMedia = w.matchMedia || (() => ({matches:false,addListener(){},removeListener(){}})); w.scrollTo = () => {}; w.Element.prototype.scrollIntoView = function(){}; }
  });
  await new Promise(r => dom.window.addEventListener('load', r));
  await new Promise(r => setTimeout(r, 500));
  return dom;
}
module.exports = { openEditor };

function loadSave(w, bytes, fileName) {
  const b64 = Buffer.from(bytes).toString('base64');
  return w.eval(`(function(){
    var bin = atob(${JSON.stringify(b64)}); var u8 = new Uint8Array(bin.length);
    for (var i=0;i<bin.length;i++) u8[i]=bin.charCodeAt(i);
    tempFile = new MarcFile(u8.length); tempFile.fileName=${JSON.stringify(fileName)};
    tempFile._u8array = u8; tempFile._dataView = new DataView(u8.buffer);
    if (!SavegameEditor.checkValidSavegame()) return 'INVALID';
    if (SavegameEditor.preload && !window.__preloaded) { SavegameEditor.preload(); window.__preloaded = true; }
    SavegameEditor.load();
    return 'OK';
  })()`);
}
module.exports.loadSave = loadSave;
if (require.main === module) (async () => {
  const [game, sav] = process.argv.slice(2);
  const dom = await openEditor(game, sav);
  const w = dom.window;
  console.log('load:', loadSave(w, fs.readFileSync(sav), game==='botw'?'game_data.sav':'progress.sav'));
  const g = id => { try { return w.eval(`getValue(${JSON.stringify(id)})`); } catch(e){ return 'ERR '+e.message; } };
  for (const id of ['max-hearts','max-stamina','max-battery','rupees']) console.log(id, g(id));
  if (game==='totk') for (const id of ['pouch-size-swords','pouch-size-bows','pouch-size-shields']) console.log(id, g(id));
  process.exit(0);
})();
