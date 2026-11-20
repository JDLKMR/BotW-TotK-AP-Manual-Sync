const fs=require('fs'); const {openEditor,loadSave}=require('./probe');
const src='/home/claude/src';
(async()=>{
  const dom=await openEditor('botw'); const w=dom.window;
  loadSave(w,fs.readFileSync(src+'/BotW-APManual-main/botw-save-switch/game_data.sav'),'game_data.sav');
  const rows=JSON.parse(w.eval(`(function(){var o=[];BOTW_Data.Translations.forEach(function(t){for(var id in t.items)o.push([t.id,id,t.items[id]]);});return JSON.stringify(o);})()`));
  const q=process.argv.slice(2);
  for(const s of q){ const k=s.toLowerCase(); console.log('##',s); rows.filter(r=>r[2].toLowerCase().includes(k)||r[1].toLowerCase().includes(k)).slice(0,14).forEach(r=>console.log('  ',r.join(' | '))); }
  console.log('categories',[...new Set(rows.map(r=>r[0]))].join(','));
  process.exit(0);
})();
