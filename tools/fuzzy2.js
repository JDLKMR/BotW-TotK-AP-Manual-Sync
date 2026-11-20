const fs=require('fs'); const {openEditor,loadSave}=require('./probe');
const src='/home/claude/src';
(async()=>{
  const dom=await openEditor('totk'); const w=dom.window;
  loadSave(w,fs.readFileSync(src+'/TotK-APManual-main/totk-save/progress.sav'),'progress.sav');
  const rows=JSON.parse(w.eval(`(function(){var o=[];function add(c,id){o.push([c,id,_(id)]);}
    ['weapons','bows','shields'].forEach(function(c){Equipment.AVAILABILITY[c].forEach(function(id){add(c,id)})});
    Armor.AVAILABILITY.forEach(function(id){add('armors',id)});
    ['arrows','materials','food','devices','key'].forEach(function(c){Item.AVAILABILITY[c].forEach(function(id){add(c,id)})});
    return JSON.stringify(o);})()`));
  for(const s of process.argv.slice(2)){ const k=s.toLowerCase(); console.log('##',s); rows.filter(r=>r[2].toLowerCase().includes(k)||r[1].toLowerCase().includes(k)).slice(0,10).forEach(r=>console.log('  ',r.join(' | '))); }
  // armor info sample + upgrade chains
  console.log(w.eval(`JSON.stringify(Object.entries(Armor.INFO).slice(0,4))`));
  console.log('Armor.INFO key for Hylian Hood chain:', w.eval(`JSON.stringify(Object.entries(Armor.INFO).filter(function(e){return /Armor_001_Head/.test(e[0])||e[1].base==='Armor_001_Head'}))`));
  console.log('abilities in key:', rows.filter(r=>/Obj_/.test(r[1])&&r[0]==='key').map(r=>r[1]+'='+r[2]).slice(0,40).join(', '));
  process.exit(0);
})();
