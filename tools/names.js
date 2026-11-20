const fs=require('fs'); const {openEditor,loadSave}=require('./probe');
const src='/home/claude/src';
function items(p){let d=JSON.parse(fs.readFileSync(p,'utf8')); return Array.isArray(d)?d:d.data;}
(async()=>{
  // TotK
  {
    const dom=await openEditor('totk'); const w=dom.window;
    loadSave(w,fs.readFileSync(src+'/TotK-APManual-main/totk-save/progress.sav'),'progress.sav');
    const map=JSON.parse(w.eval(`(function(){
      var out={};
      function add(cat,id){ var n=_(id); (out[n]=out[n]||[]).push(cat+':'+id); }
      ['weapons','bows','shields'].forEach(function(c){Equipment.AVAILABILITY[c].forEach(function(id){add(c,id)})});
      Armor.AVAILABILITY.forEach(function(id){add('armors',id)});
      ['arrows','materials','food','devices','key'].forEach(function(c){Item.AVAILABILITY[c].forEach(function(id){add(c,id)})});
      return JSON.stringify(out);})()`));
    const its=items(src+'/TotK-APManual-main/manual_tearsofthekingdom_jd/data/items.json');
    const miss=[];
    for(const it of its){ const n=it.name; if(!(n in map)) miss.push(n); }
    console.log('TOTK names in editor:',Object.keys(map).length,'\nUnmatched apworld names:\n',miss.join(' | '));
    // show a sample of ambiguity
    const amb=Object.entries(map).filter(([n,v])=>v.length>1&&its.some(i=>i.name===n)).slice(0,30);
    console.log('AMBIG',JSON.stringify(amb));
  }
  // BotW
  {
    const dom=await openEditor('botw'); const w=dom.window;
    loadSave(w,fs.readFileSync(src+'/BotW-APManual-main/botw-save-switch/game_data.sav'),'game_data.sav');
    const map=JSON.parse(w.eval(`(function(){var out={};BOTW_Data.Translations.forEach(function(t){for(var id in t.items){var n=t.items[id];(out[n]=out[n]||[]).push(t.id+':'+id);}});return JSON.stringify(out);})()`));
    const its=items(src+'/BotW-APManual-main/manual_breathofthewild_jd/data/items.json');
    const miss=its.map(i=>i.name).filter(n=>!(n in map));
    console.log('\nBOTW names in editor:',Object.keys(map).length,'\nUnmatched apworld names:\n',miss.join(' | '));
    const amb=Object.entries(map).filter(([n,v])=>v.length>1&&its.some(i=>i.name===n)).slice(0,30);
    console.log('AMBIG',JSON.stringify(amb));
  }
  process.exit(0);
})();
