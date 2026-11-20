/*
 * Item rules: maps Archipelago item names (exact names from the two APWorlds) to save changes.
 * EVERYTHING game-specific that a human may want to tweak lives in this file.
 *
 * A plan has:
 *   flags   - absolute/at-least flag writes (idempotent, re-applied every time)
 *   stats   - hearts / stamina vessels / energy wells / rupees
 *   slots   - TotK pouch sizes (BotW slots are S32 flags, see flags with slotCat)
 *   adds    - inventory additions, ledger-based (delta vs what was already applied)
 *   masterSword (BotW), armorLevel
 *   checks  - state assertions used to detect whether a later game save descends from our write
 *   manual  - received items that have no automatic effect
 */
const fs = require('fs');
const path = require('path');

const DEFAULT_DURABILITY = 5000; // BotW fallback (in-game 50 x 100) for gear that is not in the durability CSVs
let DUR = { botw: {}, totk: {} };
try { DUR = JSON.parse(fs.readFileSync(path.join(__dirname, 'durabilities.json'), 'utf8')); } catch (_) { /* run: node tools/build-durabilities.js */ }
// In-game durability from the CSVs. BotW's save stores value x100, TotK stores it raw. Returns undefined when unknown (TotK: editor default is used).
function durability(game, editorName, fallback) {
  const v = (DUR[game] || {})[editorName];
  if (typeof v === 'number') return game === 'botw' ? Math.round(v * 100) : Math.round(v);
  return fallback;
}

/* ---------------- BotW ---------------- */
const BOTW_TOWERS = { 'Hebra Tower': '01', 'Tabantha Tower': '02', 'Gerudo Tower': '03', 'Wasteland Tower': '04', 'Woodland Tower': '05', 'Central Tower': '06', 'Great Plateau Tower': '07', 'Dueling Peaks Tower': '08', 'Lake Tower': '09', 'Eldin Tower': '10', 'Akkala Tower': '11', 'Lanayru Tower': '12', 'Hateno Tower': '13', 'Faron Tower': '14', 'Ridgeland Tower': '15' };
const BOTW_RUNES = { 'Magnesis': ['IsGet_Obj_Magnetglove'], 'Cryonis': ['IsGet_Obj_IceMaker'], 'Camera': ['IsGet_Obj_Camera'], 'Master Cycle Zero': ['IsGet_Obj_Motorcycle'] };
const BOTW_PROGRESSIVE_RUNES = { 'Progressive Remote Bomb': ['IsGet_Obj_RemoteBomb', 'IsGet_Obj_RemoteBombLv2'], 'Progressive Stasis': ['IsGet_Obj_StopTimer', 'IsGet_Obj_StopTimerLv2'], 'Progressive Sheikah Sensor': ['IsGet_Obj_SheikSensor', 'IsGet_Obj_SheikSensorLv2'] };
// AP name -> editor display name, where they differ
const BOTW_ALIASES = {
  'Barbarian Leg Wraps': 'Barbarian Wraps', 'Fierce Deity Mask': "Fierce Deity's Mask", 'Fierce Deity Armor': "Fierce Deity's Armor", 'Fierce Deity Boots': "Fierce Deity's Boots",
  'Cap of the Wind': 'Cap of Wind', 'Tunic of the Wind': 'Tunic of Wind', 'Trousers of the Wind': 'Trousers of Wind'
};
// names that are armor (category "Armor" in items.json) are filled in from items.json at load time
const BOTW_COPY = { 'Royal Broadsword': 1, 'Royal Shield': 1, 'Savage Lynel Shield': 1, 'Royal Bow': 1, 'Savage Lynel Bow': 1 }; // independent entries
const BOTW_STACK = { // AP name -> [editor name, quantity per AP item]
  'Arrows (50)': ['Arrow', 50], 'Arrows (20)': ['Arrow', 20], 'Bomb Arrows (15)': ['Bomb Arrow', 15], 'Fire Arrows (15)': ['Fire Arrow', 15], 'Ice Arrows (15)': ['Ice Arrow', 15],
  'Shock Arrows (15)': ['Shock Arrow', 15], 'Ancient Arrows (5)': ['Ancient Arrow', 5], 'Diamond': ['Diamond', 1], 'Wood Bundles (10)': ['Wood', 10],
  "Farosh's Scale": ["Farosh's Scale", 1], "Dinraal's Scale": ["Dinraal's Scale", 1], "Naydra's Scale": ["Naydra's Scale", 1]
};
const BOTW_UNIQUE = { 'Hylian Shield': ['Hylian Shield', 80000], 'Bow of Light': ['Bow of Light', 10000], 'Travel Medallion': ['Travel Medallion', 1] };
const RUPEES = { '50 Rupees': 50, '100 Rupees': 100, '200 Rupees': 200, 'Greg the Green Rupee': 1 };
// received but nothing to write to the save (gates enforced by the player / logic only)
const BOTW_MANUAL = new Set(['One-Hit Obliterator', 'Vah Medoh Controls', 'Vah Rudania Controls', 'Vah Ruta Controls', 'Vah Naboris Controls', 'Final Trial Controls',
  'Vah Medoh Cleared', 'Vah Rudania Cleared', 'Vah Ruta Cleared', 'Vah Naboris Cleared']);
// Champion abilities are key items: base item = Obj_HeroSoul_<Region>, DLC "+" upgrade = Obj_DLC_HeroSoul_<Region>.
// AP: base game item (x1) or "Progressive ..." (x2: 1st = base ability, 2nd = "+" version).
const BOTW_CHAMPIONS = { "Revali's Gale": 'Rito', "Daruk's Protection": 'Goron', "Mipha's Grace": 'Zora', "Urbosa's Fury": 'Gerudo' };

/* ---------------- TotK ---------------- */
const TOTK_TOWERS = { 'Lookout Landing Skyview Tower': '01', "Lindor's Brow Skyview Tower": '02', 'Pikida Stonegrove Skyview Tower': '03', 'Eldin Canyon Skyview Tower': '04', 'Ulri Mountain Skyview Tower': '05', 'Sahasra Slope Skyview Tower': '06', 'Upland Zorana Skyview Tower': '07', 'Hyrule Field Skyview Tower': '08', 'Gerudo Canyon Skyview Tower': '09', 'Gerudo Highlands Skyview Tower': '10', 'Rabella Wetlands Skyview Tower': '11', 'Thyphlo Ruins Skyview Tower': '12', 'Popla Foothills Skyview Tower': '13', 'Mount Lanayru Skyview Tower': '14', 'Rospro Pass Skyview Tower': '15' };
const TOTK_ABILITIES = { 'Ultrahand': 'Obj_UltraHand', 'Fuse': 'Obj_OneTouchBond', 'Ascend': 'Obj_Tooreroof', 'Recall': 'Obj_ReverseRecorder', 'Autobuild': 'Obj_AutoBuilder', 'Camera': 'Obj_Camera' };
const TOTK_VOWS = { 'Tulin': 'Wind', 'Yunobo': 'Fire', 'Sidon': 'Water', 'Riju': 'Lightning', 'Mineru': 'Spirit' };
const TOTK_ALIASES = { "Champion's Leathers": "Champion's Leather" };
const TOTK_COPY = BOTW_COPY;
const TOTK_STACK = {
  'Travel Medallion': ['Travel Medallion', 1], // ONE key-item entry whose quantity goes up (see mergeKeyIds)
  'Arrows (50)': ['Arrow', 50], 'Arrows (20)': ['Arrow', 20], 'Bomb Flower (15)': ['Bomb Flower', 15], 'Ruby (5)': ['Ruby', 5], 'Diamond (5)': ['Diamond', 5], 'Opal (10)': ['Opal', 10],
  'Topaz (5)': ['Topaz', 5], 'Sapphire (5)': ['Sapphire', 5], 'Splash Fruit (15)': ['Splash Fruit', 15], 'Fire Fruit (15)': ['Fire Fruit', 15], 'Ancient Blade (5)': ['Ancient Blade', 5], 'Wood Bundles (10)': ['Wood', 10]
};
const TOTK_UNIQUE = { 'Hylian Shield': ['Hylian Shield'] };
const TOTK_MANUAL = new Set([]); // nothing left without an automatic effect

/* ---------------- data loaders ---------------- */
const APWORLDS = {
  botw: { game: 'Manual_BreathoftheWild_JD', dir: 'BotW-APManual-main/manual_breathofthewild_jd' },
  totk: { game: 'Manual_TearsoftheKingdom_JD', dir: 'TotK-APManual-main/manual_tearsofthekingdom_jd' }
};
let BOTW_HASHES = null;
function botwHash(name, vendorDir) {
  if (!BOTW_HASHES) {
    BOTW_HASHES = {};
    const csv = fs.readFileSync(path.join(vendorDir, 'zelda-botw', 'zelda-botw.hashes.csv'), 'utf8');
    csv.split('\n').forEach(l => { const p = l.trim().split(';'); if (p.length === 3) BOTW_HASHES[p[2]] = { hash: parseInt(p[0], 10), type: p[1] }; });
  }
  const h = BOTW_HASHES[name];
  if (!h) throw new Error('BotW flag not in hash table: ' + name);
  return h;
}

/* armor item names per game (items.json "Armor" category). Supplied by caller. */
function buildPlan(game, counts, confirmed, ctx) {
  const c = (n) => counts[n] || 0;
  const delta = (n) => Math.max(0, c(n) - (confirmed[n] || 0));
  const plan = { flags: [], stats: {}, slots: {}, adds: [], checks: [], manual: [], rupeeItems: {}, armorLevel: c('Progressive Armor Upgrade') };
  const vd = ctx.vendorDir;

  if (game === 'botw') {
    const flag = (name, value, mode, extra) => { const h = botwHash(name, vd); plan.flags.push(Object.assign({ name, hash: h.hash, value, mode: mode || 'set' }, extra || {})); return h; };
    for (const [n, num] of Object.entries(BOTW_TOWERS)) if (c(n) > 0) {
      flag('MapTower_' + num, 1); flag('Location_MapTower' + num, 1, 'atLeast');
      plan.checks.push({ t: 'flag', name: 'MapTower_' + num, hash: botwHash('MapTower_' + num, vd).hash });
    }
    for (const [n, flags] of Object.entries(BOTW_RUNES)) if (c(n) > 0) flags.forEach(f => { flag(f, 1); plan.checks.push({ t: 'flag', name: f, hash: botwHash(f, vd).hash }); });
    for (const [n, flags] of Object.entries(BOTW_PROGRESSIVE_RUNES)) flags.forEach((f, i) => { if (c(n) > i) { flag(f, 1); plan.checks.push({ t: 'flag', name: f, hash: botwHash(f, vd).hash }); } });
    for (const [champ, region] of Object.entries(BOTW_CHAMPIONS)) {
      const level = Math.min(2, Math.max(c(champ) > 0 ? 1 : 0, c('Progressive ' + champ)));
      [['IsGet_Obj_HeroSoul_' + region, champ], ['IsGet_Obj_DLC_HeroSoul_' + region, champ + ' +']].forEach(([flagName, itemName], i) => {
        if (level <= i) return;
        const f = flag(flagName, 1); plan.checks.push({ t: 'flag', name: flagName, hash: f.hash });
        const key = `${champ}#${i + 1}`;
        // always ensure it is present (completing a Divine Beast can hand back a lower version); switch it on only when newly received / re-added
        plan.adds.push({ key, ledgerKey: key, editorName: itemName, mode: 'unique', qty: 1, per: 1, enable: !(confirmed[key] >= 1) });
      });
    }
    if (c('Heart Container') > 0) { plan.stats.hearts = c('Heart Container'); plan.checks.push({ t: 'hearts', min: c('Heart Container') }); }
    if (c('Stamina Vessel') > 0) { plan.stats.vessels = c('Stamina Vessel'); plan.checks.push({ t: 'vessels', min: c('Stamina Vessel') }); }
    [['Weapon Slot', 'WeaponPorchStockNum', 'weapons'], ['Bow Slot', 'BowPorchStockNum', 'bows'], ['Shield Slot', 'ShieldPorchStockNum', 'shields']].forEach(([n, f, cat]) => {
      if (c(n) > 0) { const h = flag(f, c(n), 'atLeast', { slotCat: cat }); plan.checks.push({ t: 'flag', name: f, hash: h.hash, min: c(n) }); }
    });
    const stage = Math.max(c('Progressive Master Sword'), c('Master Sword') > 0 ? 1 : 0);
    plan.masterSword = { stage, prevStage: Math.max(confirmed['Progressive Master Sword'] || 0, (confirmed['Master Sword'] || 0) > 0 ? 1 : 0), flags: [
      Object.assign({ key: 'power', name: 'MasterSword_Add_Power' }, botwHash('MasterSword_Add_Power', vd)),
      Object.assign({ key: 'beam', name: 'MasterSword_Add_BeamPower' }, botwHash('MasterSword_Add_BeamPower', vd)),
      Object.assign({ key: 'open_full', name: 'Open_MasterSword_FullPower' }, botwHash('Open_MasterSword_FullPower', vd))
    ] };
    if (stage === 0) delete plan.masterSword;
    /* things the player may have obtained in-game before receiving them are removed (silently) - see pruneInventory in the driver */
    plan.pruneIds = [];
    if (ctx.pruneArmor) {
      if (stage === 0) plan.pruneIds.push('Weapon_Sword_070'); // Master Sword (pulled in Korok Forest)
      for (const [champ, region] of Object.entries(BOTW_CHAMPIONS)) {
        const lv = Math.min(2, Math.max(c(champ) > 0 ? 1 : 0, c('Progressive ' + champ)));
        if (lv < 1) plan.pruneIds.push('Obj_HeroSoul_' + region);
        if (lv < 2) plan.pruneIds.push('Obj_DLC_HeroSoul_' + region);
      }
    }
    /* Divine Beast "Ballad of the Hero" flags follow the toggles in the app (default on) */
    if (ctx.ballad) for (const region of ['Rito', 'Goron', 'Zora', 'Gerudo']) flag('BalladOfHero' + region + '_Activated', ctx.ballad[region.toLowerCase()] === false ? 0 : 1);
    for (const n of Object.keys(counts)) {
      const d = delta(n);
      if (RUPEES[n]) { if (d) { plan.stats.rupees = (plan.stats.rupees || 0) + d * RUPEES[n]; plan.rupeeItems[n] = d; } continue; }
      if (BOTW_COPY[n] && d) plan.adds.push({ key: n, editorName: n, mode: 'copy', qty: d, per: 1, durability: durability('botw', n, DEFAULT_DURABILITY) });
      else if (BOTW_STACK[n] && d) plan.adds.push({ key: n, editorName: BOTW_STACK[n][0], mode: 'stack', qty: d * BOTW_STACK[n][1], per: BOTW_STACK[n][1] });
      else if (BOTW_UNIQUE[n] && d) plan.adds.push({ key: n, editorName: BOTW_UNIQUE[n][0], mode: 'unique', qty: d, per: 1, durability: durability('botw', BOTW_UNIQUE[n][0], BOTW_UNIQUE[n][1]) });
      else if (ctx.armorNames.has(n) && d) plan.adds.push({ key: n, editorName: BOTW_ALIASES[n] || n, mode: 'unique', qty: d, per: 1 });
    }
  } else {
    const flag = (name, value, also) => plan.flags.push({ name, value, also: also || [] });
    for (const [n, num] of Object.entries(TOTK_TOWERS)) if (c(n) > 0) {
      ['IsVisitLocation.Tower' + num, 'IsOpenCannon.Tower' + num, 'IsActivateCannon.Tower' + num].forEach(f => { flag(f, true); });
      plan.checks.push({ t: 'flag', name: 'IsActivateCannon.Tower' + num });
    }
    for (const [n, id] of Object.entries(TOTK_ABILITIES)) if (c(n) > 0) { flag('IsGet.' + id, true, ['IsGetAnyway.' + id]); plan.checks.push({ t: 'flag', name: 'IsGet.' + id }); }
    ['Obj_SheikSensor', 'Obj_SheikSensorLv2'].forEach((id, i) => { if (c('Progressive Sensor') > i) { flag('IsGet.' + id, true, ['IsGetAnyway.' + id]); plan.checks.push({ t: 'flag', name: 'IsGet.' + id }); } });
    if (c('Earthwake Manual') > 0) { flag('IsGet.Obj_HiddenScroll_00', true, ['IsGetAnyway.Obj_HiddenScroll_00']); plan.checks.push({ t: 'flag', name: 'IsGet.Obj_HiddenScroll_00' }); }
    if (c('Progressive Master Sword') >= 1) { flag('HaveMasterSword', true); plan.checks.push({ t: 'flag', name: 'HaveMasterSword' }); }
    if (c('Progressive Master Sword') >= 2) { flag('IsMasterSwordTrueForm', true); plan.checks.push({ t: 'flag', name: 'IsMasterSwordTrueForm' }); }
    if (c('Heart Container') > 0) { plan.stats.hearts = c('Heart Container'); plan.checks.push({ t: 'hearts', min: c('Heart Container') }); }
    if (c('Stamina Vessel') > 0) { plan.stats.vessels = c('Stamina Vessel'); plan.checks.push({ t: 'vessels', min: c('Stamina Vessel') }); }
    if (c('Energy Well') > 0) { plan.stats.wells = c('Energy Well'); plan.checks.push({ t: 'wells', min: c('Energy Well') }); }
    [['Weapon Slot', 'weapons', 'pouch-size-swords'], ['Bow Slot', 'bows', 'pouch-size-bows'], ['Shield Slot', 'shields', 'pouch-size-shields']].forEach(([n, k, field]) => {
      if (c(n) > 0) { plan.slots[k] = c(n); plan.checks.push({ t: 'slots', field, min: c(n) }); }
    });
    /* Sage's Vows are state-based: the inventory must hold exactly the latest received version (Vow, or Solemn Vow once both progressives are received) */
    plan.vows = Object.entries(TOTK_VOWS).map(([sage, el]) => ({ level: Math.min(2, c('Progressive Vow of ' + sage)), names: [`Vow of ${sage}, Sage of ${el}`, `Solemn Vow of ${sage}, Sage of ${el}`], prune: !!ctx.pruneArmor }));
    plan.mergeKeyIds = ['Obj_WarpDLC']; // duplicate Travel Medallion entries (older builds) are merged into one stack
    for (const n of Object.keys(counts)) {
      const d = delta(n);
      if (RUPEES[n]) { if (d) { plan.stats.rupees = (plan.stats.rupees || 0) + d * RUPEES[n]; plan.rupeeItems[n] = d; } continue; }
      if (/^Progressive Vow of /.test(n)) continue; // handled by plan.vows
      if (n === 'Earthwake Manual' && d) plan.adds.push({ key: n, editorName: n, id: 'Obj_HiddenScroll_00', cat: 'key', mode: 'unique', qty: d, per: 1 }); // key item the editor has a name for but no list entry
      else if (TOTK_COPY[n] && d) plan.adds.push({ key: n, editorName: n, mode: 'copy', qty: d, per: 1, durability: durability('totk', n) });
      else if (TOTK_STACK[n] && d) plan.adds.push({ key: n, editorName: TOTK_STACK[n][0], mode: 'stack', qty: d * TOTK_STACK[n][1], per: TOTK_STACK[n][1] });
      else if (TOTK_UNIQUE[n] && d) plan.adds.push({ key: n, editorName: TOTK_UNIQUE[n][0], mode: 'unique', qty: d, per: 1, durability: durability('totk', TOTK_UNIQUE[n][0]) });
      else if (ctx.armorNames.has(n) && d) plan.adds.push({ key: n, editorName: TOTK_ALIASES[n] || n, mode: 'unique', qty: d, per: 1 });
    }
  }

  /* armor the player is allowed to own = armor received in the multiworld (silent pruning of everything else) */
  if (ctx.pruneArmor) {
    const alias = game === 'botw' ? BOTW_ALIASES : TOTK_ALIASES;
    plan.pruneArmor = true;
    plan.keepArmor = Object.keys(counts).filter(n => counts[n] > 0 && ctx.armorNames.has(n)).map(n => alias[n] || n);
  }

  const manualSet = game === 'botw' ? BOTW_MANUAL : TOTK_MANUAL;
  for (const n of Object.keys(counts)) if (manualSet.has(n)) plan.manual.push(n);
  return plan;
}

function loadItemInfo(game, apworldsRoot) {
  const p = path.join(apworldsRoot, APWORLDS[game].dir, 'data', 'items.json');
  let d = JSON.parse(fs.readFileSync(p, 'utf8')); if (!Array.isArray(d)) d = d.data;
  const armorNames = new Set(d.filter(i => (i.category || []).includes('Armor')).map(i => i.name));
  // progression per the APWorld itself: items sent from the host console (/send, !getitem) arrive with the server's progression flag UNSET
  const progNames = new Set(d.filter(i => i.progression === true || i.progression_skip_balancing === true).map(i => i.name));
  return { armorNames, progNames, allNames: d.map(i => i.name) };
}

module.exports = { buildPlan, loadItemInfo, APWORLDS, BOTW_MANUAL, TOTK_MANUAL, DEFAULT_DURABILITY };
