/*
 * Tears of the Kingdom driver. Runs INSIDE Marc Robledo's TotK save editor page
 * (vendor/savegame-editors/zelda-totk/index.html). Uses the editor's own Variable /
 * Pouch / SavegameEditor.addItem / upgradeArmor / save code to apply a "plan".
 */
(function (g) {
  const H = g.__apHelpers;
  const SE = () => g.SavegameEditor;

  function loadSave(u8) {
    H.installTempFile(u8, 'progress.sav');
    if (!SE().checkValidSavegame()) throw new Error('Not a valid TotK progress.sav (unsupported version or wrong file).');
    if (!g.__apPreloaded) { SE().preload(); g.__apPreloaded = true; }
    SE().load();
  }
  function reload() { SE().load(); }

  /* ---------- names from the editor's own locale/availability tables ---------- */
  let NAMES = null;
  function names() {
    if (NAMES) return NAMES;
    const byName = {};
    function add(cat, id) { const n = H.stripVersion(g._(id)); if (!(n in byName)) byName[n] = { id, cat }; }
    ['weapons', 'bows', 'shields'].forEach(c => g.Equipment.AVAILABILITY[c].forEach(id => add(c, id)));
    g.Armor.AVAILABILITY.forEach(id => add('armors', id));
    ['arrows', 'materials', 'food', 'devices', 'key'].forEach(c => g.Item.AVAILABILITY[c].forEach(id => add(c, id)));
    NAMES = { byName };
    return NAMES;
  }
  function resolve(editorName) {
    const hit = names().byName[editorName];
    if (!hit) throw new Error('Unknown item name for the TotK editor: "' + editorName + '"');
    return hit;
  }

  /* ---------- flags ---------- */
  function flagVar(name) { return new g.Variable(name, 'Bool'); }
  function readFlag(name) { try { return flagVar(name).value ? 1 : 0; } catch (e) { return null; } }
  function writeFlag(name, v) { const x = flagVar(name); x.value = !!v; x.save(); }

  const opts = (id) => Array.from(g.getField(id).options).map(o => o.value);
  function staminaTarget(vessels) {
    const want = 1000 + 200 * Math.min(10, vessels);
    return opts('max-stamina').find(v => Math.abs(H.bitsToFloat(parseInt(v, 10)) - want) < 0.5) || null;
  }
  const curStamina = () => H.bitsToFloat(parseInt(g.getValue('max-stamina'), 10));
  const EQUIP_VALID = { weapons: 'Pouch.Weapon.ValidNum', bows: 'Pouch.Bow.ValidNum', shields: 'Pouch.Shield.ValidNum' };

  function capacityLeft(cat) {
    const p = SE().pouches[cat];
    let cap = p.maxSize;
    if (EQUIP_VALID[cat]) cap = Math.min(cap, SE().readU32Array(EQUIP_VALID[cat], 0));
    return cap - p.items.length;
  }
  /* Pouch.remove is what the editor's own _removeItem uses; the DOM row only exists for items the page has rendered.
     The editor won't empty a pouch; a fresh game has no armor, so allow it. */
  function removeFromPouch(pouch, item) {
    let gone = pouch.remove(item);
    if (!gone && pouch.items.length === 1 && pouch.items[0] === item) gone = pouch.items.splice(0, 1)[0];
    if (gone && gone._htmlRow && gone._htmlRow.parentNode) gone._htmlRow.parentNode.removeChild(gone._htmlRow);
    return !!gone;
  }
  function appendNew(cat, id, qty, durability) {
    const p = SE().pouches[cat];
    const data = qty ? { id, quantity: qty } : { id };
    if (durability && EQUIP_VALID[cat]) data.durability = durability; // Equipment falls back to the editor default (70) otherwise
    const it = p.add(data);
    document.getElementById('container-' + cat).appendChild(g.Pouch.updateItemRow(it));
    SE().fixItemAvailabilityFlag(it);
    if (cat === 'arrows') {
      const eq = new g.Variable('Pouch.Arrow.EquipIndex', 'IntArray');
      if (eq.value[0] === -1) { eq.value[0] = 0; eq.save(); }
    }
    return it;
  }

  function evalChecks(checks) {
    return (checks || []).map(function (c) {
      if (c.t === 'flag') return readFlag(c.name) === 1;
      if (c.t === 'hearts') return parseInt(g.getValue('max-hearts'), 10) >= c.min * 4;
      if (c.t === 'vessels') return curStamina() >= 1000 + 200 * Math.min(10, c.min) - 0.5;
      if (c.t === 'wells') return parseFloat(g.getValue('max-battery')) >= Math.max(3000, c.min * 1000);
      if (c.t === 'slots') return parseInt(g.getValue(c.field), 10) >= c.min;
      return true;
    });
  }

  function run(u8, plan) {
    loadSave(u8);
    const report = { applied: {}, skipped: [], warnings: [], changes: [], pre: [] };
    const note = (s) => report.changes.push(s);
    report.pre = evalChecks(plan.checks);

    /* ---- pass 1: flags, stats, slots ---- */
    (plan.flags || []).forEach(function (f) {
      const names2 = [f.name].concat(f.also || []);
      names2.forEach(function (nm) {
        const cur = readFlag(nm);
        if (cur === null) { if (nm === f.name) report.warnings.push('Flag not found in save: ' + nm); return; }
        if (cur !== (f.value ? 1 : 0)) { writeFlag(nm, f.value); note('flag ' + nm + ' -> ' + !!f.value); }
      });
    });
    const st = plan.stats || {};
    if (typeof st.hearts === 'number') {
      const want = Math.min(160, Math.max(4, st.hearts * 4)); const cur = parseInt(g.getValue('max-hearts'), 10);
      if (want > cur) { g.setValue('max-hearts', String(want)); note('max hearts ' + cur / 4 + ' -> ' + want / 4); }
    }
    if (typeof st.vessels === 'number') {
      const t = staminaTarget(st.vessels);
      if (t && H.bitsToFloat(parseInt(t, 10)) > curStamina() + 0.5) { g.setValue('max-stamina', t); note('stamina -> ' + H.bitsToFloat(parseInt(t, 10))); }
    }
    if (typeof st.wells === 'number') {
      const want = Math.min(48000, Math.max(3000, st.wells * 1000)); const cur = parseFloat(g.getValue('max-battery'));
      if (want > cur) { g.setValue('max-battery', String(want)); note('battery ' + cur + ' -> ' + want); }
    }
    if (st.rupees) {
      const cur = parseInt(g.getValue('rupees'), 10);
      g.setValue('rupees', Math.min(999999, cur + st.rupees)); note('rupees +' + st.rupees);
    }
    const sl = plan.slots || {};
    [['weapons', 'pouch-size-swords'], ['bows', 'pouch-size-bows'], ['shields', 'pouch-size-shields']].forEach(function (p) {
      if (typeof sl[p[0]] !== 'number') return;
      const cur = parseInt(g.getValue(p[1]), 10);
      if (sl[p[0]] > cur) { g.setValue(p[1], sl[p[0]]); note(p[0] + ' slots ' + cur + ' -> ' + sl[p[0]]); }
    });
    SE().save();
    reload(); // pouch capacities are read from the file at load time

    /* ---- pass 2: inventory ---- */
    (plan.adds || []).forEach(function (a) {
      try {
        const spec = a.id ? { id: a.id, cat: a.cat } : resolve(a.editorName); const cat = spec.cat; const pouch = SE().pouches[cat]; let done = 0;
        if (a.mode === 'stack') {
          const ex = pouch.findItemById(spec.id);
          if (ex) { ex.quantity += a.qty; g.Pouch.updateItemRow(ex); done = a.qty; }
          else if (capacityLeft(cat) > 0) { appendNew(cat, spec.id, a.qty); done = a.qty; }
          else report.warnings.push('No free ' + cat + ' slot for ' + a.editorName);
          if (done) note('+' + a.qty + ' ' + a.editorName);
        } else if (a.mode === 'unique') {
          const chain = cat === 'armors' ? armorIds(spec.id) : [spec.id];
          if (pouch.items.some(x => chain.includes(x.id))) done = a.qty;
          else if (capacityLeft(cat) > 0) { appendNew(cat, spec.id, a.keyQty || 0, a.durability); done = a.qty; note('added ' + a.editorName); }
          else report.warnings.push('No free ' + cat + ' slot for ' + a.editorName);
        } else { // copy
          for (let n = 0; n < a.qty; n++) {
            if (capacityLeft(cat) > 0) { appendNew(cat, spec.id, 0, a.durability); done++; }
            else { report.warnings.push('No free ' + cat + ' slot for ' + a.editorName); break; }
          }
          if (done) note('+' + done + ' ' + a.editorName);
        }
        report.applied[a.key] = done;
      } catch (e) { report.warnings.push(String(e.message || e)); report.applied[a.key] = 0; }
    });

    /* progressive armor upgrades -> every owned armor piece (never lowers) */
    if (typeof plan.armorLevel === 'number' && plan.armorLevel > 0) {
      let n = 0;
      SE().pouches.armors.items.forEach(function (armor) {
        const info = g.Armor.INFO[armor.id]; if (!info) return;
        while (g.Armor.INFO[armor.id].level < plan.armorLevel && g.Armor.INFO[armor.id].upgradeable) { if (!SE().upgradeArmor(armor)) break; n++; }
      });
      if (n) note('armor upgrade steps applied: ' + n + ' (level ' + plan.armorLevel + ')');
    }
    /* Sage's Vows: the key pouch must hold exactly the latest received version (Vow, or the Solemn Vow once both progressives are received) */
    (plan.vows || []).forEach(function (v) {
      try {
        const ids = v.names.map(n => resolve(n).id); const pouch = SE().pouches.key;
        const want = v.level >= 2 ? 1 : v.level === 1 ? 0 : -1;
        if (want >= 0 && !pouch.items.some(i => i.id === ids[want])) {
          if (capacityLeft('key') > 0) { appendNew('key', ids[want], 0); note('added ' + v.names[want]); } else report.warnings.push('No free key item slot for ' + v.names[want]);
        }
        if (v.prune) pouch.items.slice().forEach(function (it) { if (ids.includes(it.id) && ids[want] !== it.id) removeFromPouch(pouch, it); }); // silent
      } catch (e) { report.warnings.push(String(e.message || e)); }
    });
    /* stackable key items (Travel Medallion) must be ONE entry: merge duplicates left by older builds */
    (plan.mergeKeyIds || []).forEach(function (id) {
      const pouch = SE().pouches.key; const dups = pouch.items.filter(i => i.id === id);
      if (dups.length > 1) { dups[0].quantity = dups.reduce((n, i) => n + (i.quantity || 1), 0); g.Pouch.updateItemRow(dups[0]); dups.slice(1).forEach(d => removeFromPouch(pouch, d)); }
    });

    /* armor not received in the multiworld is removed silently (not reported in report.changes) */
    if (plan.pruneArmor) {
      const keep = new Set((plan.keepArmor || []).map(n => H.stripVersion(n))); let removed = 0;
      SE().pouches.armors.items.slice().forEach(function (armor) {
        const info = g.Armor.INFO[armor.id];
        if (keep.has(H.stripVersion(g._(info ? info.base : armor.id)))) return;
        if (removeFromPouch(SE().pouches.armors, armor)) removed++;
      });
      report.removedArmor = removed;
    }
    SE().save();
    return { ok: true, b64: H.u8ToB64(g.tempFile._u8array), report };
  }
  function armorIds(id) {
    const info = g.Armor.INFO[id]; if (!info) return [id];
    return Object.keys(g.Armor.INFO).filter(k => g.Armor.INFO[k].base === info.base);
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
