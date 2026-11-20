/*
 * Breath of the Wild driver. Runs INSIDE Marc Robledo's BotW save editor page
 * (vendor/savegame-editors/zelda-botw/index.html) and uses the editor's own
 * routines (SavegameEditor._searchHash/_writeValue/_createItemRow/editItem2/save ...)
 * to apply a "plan" produced by the Node side.
 */
(function (g) {
  const H = g.__apHelpers;
  const SE = () => g.SavegameEditor;
  let caps = {};

  function loadSave(u8) {
    H.installTempFile(u8, 'game_data.sav');
    if (!SE().checkValidSavegame()) throw new Error('Not a valid BotW game_data.sav (unsupported version or wrong file).');
    if (!g.__apPreloaded) { SE().preload(); g.__apPreloaded = true; }
    SE().load();
  }

  /* ---------- name tables built from the editor's own data ---------- */
  let NAMES = null;
  function names() {
    if (NAMES) return NAMES;
    const byName = {}, byId = {}, chains = {};
    g.BOTW_Data.Translations.forEach(function (t) {
      Object.keys(t.items).forEach(function (id) {
        const raw = H.stripVersion(t.items[id]);
        byId[id] = { id, cat: t.id, name: raw };
        if (!(raw in byName)) byName[raw] = { id, cat: t.id };
        if (t.id === 'clothes') {
          const m = raw.match(/^(.*?)(?:\s*(★+))?$/);
          const base = m[1].trim(), tier = m[2] ? m[2].length : 0;
          const key = base + '|' + id.replace(/^Armor_\d+_/, '');
          (chains[key] = chains[key] || [])[tier] = id;
        }
      });
    });
    NAMES = { byName, byId, chains };
    return NAMES;
  }
  function armorChainOf(id) {
    const n = names(); const info = n.byId[id];
    if (!info || info.cat !== 'clothes') return null;
    const m = info.name.match(/^(.*?)(?:\s*(★+))?$/);
    const key = m[1].trim() + '|' + id.replace(/^Armor_\d+_/, '');
    const chain = (n.chains[key] || []).filter(Boolean);
    return { chain, tier: m[2] ? m[2].length : 0 };
  }

  /* ---------- inventory helpers (mirror what the editor's own addItem()/load() do) ---------- */
  function inventory() {
    const out = [];
    for (let i = 0; i < SE().Constants.MAX_ITEMS; i++) {
      const id = SE()._loadItemName(i);
      if (id === '') break;
      out.push({ i, id });
    }
    return out;
  }
  function firstFreeIndex() {
    let i = 0;
    while (document.getElementById('number-item' + i) || document.getElementById('select-item' + i)) i++;
    return i < SE().Constants.MAX_ITEMS ? i : -1;
  }
  function addRow(id, qty) {
    const i = firstFreeIndex();
    if (i < 0) return -1;
    const cat = SE()._getItemCategory(id);
    SE()._writeItemName(i, id);
    const row = SE()._createItemRow(i, cat);
    document.getElementById('container-' + cat).appendChild(row);
    if (['weapons', 'bows', 'shields'].includes(cat) && id.indexOf('Weapon_') === 0) {
      const itemNum = document.getElementById('container-' + cat).childElementCount - 1;
      SE().addModifierFlagsToItem(itemNum, cat.slice(0, -1), row);
    }
    g.setValue('item' + i, cat === 'clothes' ? 0 : qty);
    return i;
  }
  function hasRoom(id) {
    const cat = SE()._getItemCategory(id);
    if (!EQUIP_CATS.includes(cat) || id.indexOf('Weapon_') !== 0) return true;
    return typeof caps[cat] !== 'number' || slotUsed(cat) < caps[cat];
  }
  function setQty(i, qty) { g.setValue('item' + i, qty); }
  function getQty(i) { return g.getValue('item' + i); }
  function resolve(editorName) {
    const hit = names().byName[editorName];
    if (!hit) throw new Error('Unknown item name for the BotW editor: "' + editorName + '"');
    return hit;
  }

  /* ---------- flags ---------- */
  function readFlag(f) {
    const off = SE()._searchHash(f.hash);
    if (typeof off !== 'number') return null;
    return g.tempFile.readU32(off + 4);
  }
  const MOTORCYCLE_HASH = 3375530649; // IsGet_Obj_Motorcycle: the editor's save() rewrites this from a checkbox
  function writeFlag(f, value) {
    const off = SE()._searchHash(f.hash);
    if (typeof off !== 'number') return false;
    SE()._writeValue(off + 4, value);
    if (f.hash === MOTORCYCLE_HASH) { const cb = document.getElementById('checkbox-motorcycle'); if (cb) cb.checked = !!value; }
    return true;
  }

  const STAT_OPTS = (id) => Array.from(g.getField(id).options).map(o => o.value);
  function staminaTarget(vessels) {
    const want = 1000 + 200 * Math.min(10, vessels);
    const opts = STAT_OPTS('max-stamina');
    return opts.find(v => Math.abs(H.bitsToFloat(parseInt(v, 10)) - want) < 0.5) || null;
  }
  function currentStaminaFloat() { return H.bitsToFloat(parseInt(g.getValue('max-stamina'), 10)); }

  function evalChecks(checks) {
    return (checks || []).map(function (c) {
      if (c.t === 'flag') { const v = readFlag(c); return v !== null && v >= (c.min === undefined ? 1 : c.min); }
      if (c.t === 'hearts') return parseInt(g.getValue('max-hearts'), 10) >= c.min * 4;
      if (c.t === 'vessels') return currentStaminaFloat() >= 1000 + 200 * Math.min(10, c.min) - 0.5;
      return true;
    });
  }
  const EQUIP_CATS = ['weapons', 'bows', 'shields'];
  const EQUIP_FLAG_HASH = 2185794238; // crc32("PorchItem_EquipFlag"): per-slot "equipped" array, parallel to the item list
  const normArmor = (n) => H.stripVersion(n).replace(/\s*★+\s*$/, '').trim();

  /* The BotW editor has no "delete item", so remove an entry the way the game's own list works:
     shift names, values (quantity/dye) and equip flags of every later slot down by one and clear the last slot.
     Weapons/bows/shields also have modifier arrays indexed by their ORDER within the category, shifted the same way.
     Runs AFTER SavegameEditor.save() on the raw file, so the editor's DOM rows can't write stale data over it.
     Removes: armor not in keepNames (when given) and any entry whose id is in removeIds. */
  function pruneInventory(keepNames, removeIds) {
    const keep = keepNames ? new Set(keepNames.map(normArmor)) : null; const drop = new Set(removeIds || []);
    const T = g.tempFile; const MAX = SE().Constants.MAX_ITEMS; const O = SE().Offsets;
    const eq = SE()._searchHash(EQUIP_FLAG_HASH); const eqOff = typeof eq === 'number' ? eq + 4 : null;
    const isEquip = (id) => EQUIP_CATS.includes(SE()._getItemCategory(id)) && id.indexOf('Weapon_') === 0;
    let removed = 0;
    for (let i = 0; i < MAX; i++) {
      const id = SE()._loadItemName(i); if (id === '') break;
      const info = names().byId[id];
      const isUnreceivedArmor = keep && info && info.cat === 'clothes' && !keep.has(normArmor(info.name));
      if (!isUnreceivedArmor && !drop.has(id)) continue;
      let modCat = null, ord = 0, total = 0;
      if (isEquip(id)) {
        const cat = SE()._getItemCategory(id); modCat = cat.slice(0, -1).toUpperCase();
        for (let k = 0; k < MAX; k++) { const n = SE()._loadItemName(k); if (n === '') break; if (SE()._getItemCategory(n) === cat && isEquip(n)) { if (k < i) ord++; total++; } }
      }
      for (let j = i; j < MAX - 1; j++) {
        SE()._writeItemName(j, SE()._loadItemName(j + 1));
        T.writeU32(O.ITEMS_QUANTITY + j * 8, T.readU32(O.ITEMS_QUANTITY + (j + 1) * 8));
        if (eqOff !== null) T.writeU32(eqOff + j * 8, T.readU32(eqOff + (j + 1) * 8));
      }
      SE()._writeItemName(MAX - 1, ''); T.writeU32(O.ITEMS_QUANTITY + (MAX - 1) * 8, 0); if (eqOff !== null) T.writeU32(eqOff + (MAX - 1) * 8, 0);
      if (modCat) ['FLAGS_', 'FLAGSV_'].forEach(function (pre) {
        const base = O[pre + modCat];
        for (let k = ord; k < total - 1; k++) T.writeU32(base + k * 8, T.readU32(base + (k + 1) * 8));
        T.writeU32(base + (total - 1) * 8, 0);
      });
      removed++; i--; // the next entry now sits at this index
    }
    return removed;
  }
  function slotUsed(cat) {
    return inventory().filter(x => SE()._getItemCategory(x.id) === cat && x.id.indexOf('Weapon_') === 0).length;
  }

  let enableIds = [];
  function run(u8, plan) {
    loadSave(u8); enableIds = [];
    const report = { applied: {}, skipped: [], warnings: [], changes: [], pre: [] };
    const note = (s) => report.changes.push(s);
    caps = {};
    report.pre = evalChecks(plan.checks);

    /* flags (absolute / at-least) */
    (plan.flags || []).forEach(function (f) {
      const cur = readFlag(f);
      if (cur === null) { report.warnings.push('Flag not found in save: ' + f.name); return; }
      const want = f.value >>> 0;
      const need = f.mode === 'atLeast' ? cur < want : cur !== want;
      if (need) { writeFlag(f, want); note('flag ' + f.name + ': ' + cur + ' -> ' + want); }
      if (f.slotCat) caps[f.slotCat] = Math.max(cur, want);
    });

    /* stats */
    const st = plan.stats || {};
    if (typeof st.hearts === 'number') {
      const want = Math.min(120, Math.max(4, st.hearts * 4)); const cur = parseInt(g.getValue('max-hearts'), 10);
      if (want > cur) { g.setValue('max-hearts', String(want)); note('max hearts ' + cur / 4 + ' -> ' + want / 4); }
    }
    if (typeof st.vessels === 'number') {
      const target = staminaTarget(st.vessels);
      if (target && H.bitsToFloat(parseInt(target, 10)) > currentStaminaFloat()) {
        g.setValue('max-stamina', target); note('stamina -> ' + H.bitsToFloat(parseInt(target, 10)));
      }
    }
    if (st.rupees) {
      const cur = parseInt(g.getValue('rupees'), 10);
      g.setValue('rupees', Math.min(999999, cur + st.rupees)); note('rupees +' + st.rupees);
    }

    /* inventory additions */
    (plan.adds || []).forEach(function (a) {
      try {
        const spec = resolve(a.editorName); let done = 0; let added = false;
        const inv = inventory();
        if (a.mode === 'unique') {
          const ch = armorChainOf(spec.id);
          const ids = ch ? ch.chain : [spec.id];
          if (inv.some(x => ids.includes(x.id))) { done = a.qty; }
          else if (!hasRoom(spec.id)) report.warnings.push('No free slot for ' + a.editorName);
          else if (addRow(spec.id, a.durability || 1) >= 0) { done = a.qty; added = true; note('added ' + a.editorName); }
          else report.warnings.push('Inventory full, could not add ' + a.editorName);
        } else if (a.mode === 'stack') {
          const ex = inv.find(x => x.id === spec.id);
          if (ex) { setQty(ex.i, getQty(ex.i) + a.qty); done = a.qty; }
          else if (addRow(spec.id, a.qty) >= 0) { done = a.qty; }
          else report.warnings.push('Inventory full, could not add ' + a.editorName);
          if (done) note('+' + a.qty + ' ' + a.editorName);
        } else { // 'copy' - independent entries (weapons, shields, bows)
          for (let n = 0; n < a.qty; n++) {
            if (!hasRoom(spec.id)) { report.warnings.push('No free slot for ' + a.editorName); break; }
            if (addRow(spec.id, a.durability || 1) >= 0) done++; else { report.warnings.push('Inventory full, could not add ' + a.editorName); break; }
          }
          if (done) note('+' + done + ' ' + a.editorName);
        }
        if (done && a.enable !== undefined && (a.enable || added)) enableIds.push(spec.id); // champion ability: on when newly received, or when it had to be re-added
        report.applied[a.key] = done;
      } catch (e) { report.warnings.push(String(e.message || e)); report.applied[a.key] = 0; }
    });

    /* Master Sword (see BotW manual instructions) */
    if (plan.masterSword && plan.masterSword.stage >= 1) {
      const ms = plan.masterSword; const stage = ms.stage; const SWORD = 'Weapon_Sword_070';
      const inv = inventory(); let ex = inv.find(x => x.id === SWORD); let fresh = false;
      if (!ex && !hasRoom(SWORD)) report.warnings.push('No free weapon slot for the Master Sword');
      else if (!ex) { const i = addRow(SWORD, stage >= 4 ? 18800 : 4000); if (i >= 0) { ex = { i }; fresh = true; note('added Master Sword'); } else report.warnings.push('Inventory full, could not add Master Sword'); }
      if (ex && !fresh && ms.prevStage < 4 && stage >= 4) { setQty(ex.i, 18800); note('Master Sword durability -> 18800'); }
      const bonus = stage === 2 ? 10 : stage === 3 ? 20 : 0;
      (ms.flags || []).forEach(function (f) {
        const want = f.key === 'open_full' ? (stage >= 4 ? 1 : null) : bonus;
        if (want === null) return;
        const cur = readFlag(f);
        if (cur === null) { report.warnings.push('Flag not found in save: ' + f.name); return; }
        if (cur !== want) { writeFlag(f, want); note('flag ' + f.name + ': ' + cur + ' -> ' + want); }
      });
    }

    /* progressive armor upgrades apply to every owned armor piece (never lowers) */
    if (typeof plan.armorLevel === 'number' && plan.armorLevel > 0) {
      let n = 0;
      inventory().forEach(function (x) {
        const ch = armorChainOf(x.id);
        if (!ch || ch.chain.length < 2) return;
        const target = Math.min(plan.armorLevel, ch.chain.length - 1);
        if (target > ch.tier) { SE().editItem2(x.i, ch.chain[target]); n++; }
      });
      if (n) note('upgraded ' + n + ' armor piece(s) to level ' + plan.armorLevel);
    }

    SE().save();
    if (enableIds.length) { // champion abilities: switch the ability ON (the in-game inventory "disable" toggle is the item's equip flag)
      const eq = SE()._searchHash(EQUIP_FLAG_HASH);
      if (typeof eq !== 'number') report.warnings.push('Equip-flag array not found; could not enable champion abilities');
      else enableIds.forEach(function (id) {
        for (let i = 0; i < SE().Constants.MAX_ITEMS; i++) {
          const n = SE()._loadItemName(i); if (n === '') break;
          if (n === id) { if (!g.tempFile.readU32(eq + 4 + i * 8)) { g.tempFile.writeU32(eq + 4 + i * 8, 1); report.changes.push('enabled ' + id); } break; }
        }
      });
    }
    if (plan.pruneArmor) report.removedArmor = pruneInventory(plan.keepArmor, plan.pruneIds); // deliberately not added to report.changes
    return { ok: true, b64: H.u8ToB64(g.tempFile._u8array), report };
  }

  function verify(u8, checks) { loadSave(u8); return evalChecks(checks); }

  g.__apDriver = {
    run: function (b64, planJson) {
      try { return JSON.stringify(run(H.b64ToU8(b64), JSON.parse(planJson))); }
      catch (e) { return JSON.stringify({ ok: false, error: String(e && e.stack || e) }); }
    },
    verify: function (b64, checksJson) {
      try { return JSON.stringify({ ok: true, results: verify(H.b64ToU8(b64), JSON.parse(checksJson)) }); }
      catch (e) { return JSON.stringify({ ok: false, error: String(e && e.stack || e) }); }
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
