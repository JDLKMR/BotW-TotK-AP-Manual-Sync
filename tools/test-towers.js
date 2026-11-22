/* Tower options + Sheikah Sensor rules (pure Node: buildPlan only, no editors). */
const assert = require('assert'); const path = require('path');
const { buildPlan, BOTW_TOWERS, TOTK_TOWERS } = require('../src/main/rules'); const T = require('../src/main/towers');
const vendorDir = path.join(__dirname, '..', 'vendor', 'savegame-editors');
const ctx = (o) => Object.assign({ vendorDir, armorNames: new Set(), pruneArmor: true, ballad: {}, towers: { unlockWarps: true, teleportTo: '' }, towerCoords: {} }, o);
const flagsOf = (p) => Object.fromEntries(p.flags.map(f => [f.name, f]));
const SENS = ['IsGet_Obj_SheikSensor', 'IsGet_Obj_SheikSensorLv2'];

/* Sheikah Sensor: 0 received -> both flags written to 0 silently; 1 -> base stays, nothing removed; 2 -> both kept on */
let f = flagsOf(buildPlan('botw', {}, {}, ctx()));
SENS.forEach(n => { assert.strictEqual(f[n].value, 0); assert.strictEqual(f[n].silent, true); });
f = flagsOf(buildPlan('botw', { 'Progressive Sheikah Sensor': 1 }, {}, ctx())); assert.strictEqual(f[SENS[0]].value, 1); assert.ok(!f[SENS[0]].silent); assert.ok(!f[SENS[1]]);
f = flagsOf(buildPlan('botw', { 'Progressive Sheikah Sensor': 2 }, {}, ctx())); SENS.forEach(n => assert.strictEqual(f[n].value, 1));
f = flagsOf(buildPlan('botw', {}, {}, ctx({ pruneArmor: false }))); assert.ok(!f[SENS[0]] && !f[SENS[1]]); // pruning off (or not connected yet): never touched
f = flagsOf(buildPlan('totk', {}, {}, ctx())); assert.ok(!Object.keys(f).some(n => /Sensor/.test(n))); // TotK unaffected
assert.ok(!buildPlan('totk', { 'Progressive Sensor': 1 }, {}, ctx()).flags.some(x => x.value === false && /Sensor/.test(x.name)));

/* Unlock Tower Warps toggle */
const have = { 'Hebra Tower': 1, 'Great Plateau Tower': 1 };
assert.ok(flagsOf(buildPlan('botw', have, {}, ctx())).MapTower_01); assert.ok(!flagsOf(buildPlan('botw', have, {}, ctx({ towers: { unlockWarps: false } }))).MapTower_01);
const haveT = { 'Lookout Landing Skyview Tower': 1 };
assert.ok(flagsOf(buildPlan('totk', haveT, {}, ctx()))['IsActivateCannon.Tower01']);
assert.ok(!flagsOf(buildPlan('totk', haveT, {}, ctx({ towers: { unlockWarps: false } })))['IsActivateCannon.Tower01']);

/* Teleport: only for received towers with known coordinates */
const coords = { '01': { x: 1, y: 2, z: 3 }, '07': { x: 4, y: 5, z: 6 } };
let p = buildPlan('botw', have, {}, ctx({ towers: { unlockWarps: true, teleportTo: '07' }, towerCoords: coords }));
assert.deepStrictEqual(p.teleport, { id: '07', tower: 'Great Plateau Tower', x: 4, y: 5, z: 6 });
assert.ok(!buildPlan('botw', {}, {}, ctx({ towers: { teleportTo: '07' }, towerCoords: coords })).teleport); // not received
assert.ok(!buildPlan('botw', have, {}, ctx({ towers: { teleportTo: '02' }, towerCoords: coords })).teleport); // no coordinates
assert.ok(!buildPlan('botw', have, {}, ctx()).teleport);

/* dropdown order + labels */
assert.deepStrictEqual(T.defs('botw').slice(0, 3).map(d => d.label), ['Great Plateau', 'Hebra', 'Tabantha']); assert.strictEqual(T.defs('botw').length, 15);
assert.deepStrictEqual(T.defs('totk').slice(0, 3).map(d => d.label), ['Lookout Landing', "Lindor's Brow", 'Pikida Stonegrove']); assert.strictEqual(T.defs('totk').length, 15);
assert.deepStrictEqual(T.receivedIds('botw', have).sort(), ['01', '07']);

/* coordinate text parsing: labelled lines, comments, thousands separators, positional fallback */
const txt = "# towers\nGreat Plateau Tower: X -1.5 Y 300.25 Z 2,000\nHebra Tower  -3600, 400.5, -1700\nbad line 1 2\n";
let c = T.parseCoordText(txt, T.defs('botw')); assert.deepStrictEqual(c['07'], { x: -1.5, y: 300.25, z: 2000 }); assert.deepStrictEqual(c['01'], { x: -3600, y: 400.5, z: -1700 });
const pos = Array.from({ length: 15 }, (_, i) => `${i}.5 ${i} -${i}`).join('\n'); c = T.parseCoordText(pos, T.defs('totk')); assert.deepStrictEqual(c['01'], { x: 0.5, y: 0, z: -0 }); assert.strictEqual(Object.keys(c).length, 15);
c = T.parseCoordText("Lindor’s Brow Skyview Tower 10 20 30\nLookout Landing Skyview Tower 1 2 3", T.defs('totk')); assert.deepStrictEqual(c['02'], { x: 10, y: 20, z: 30 }); assert.deepStrictEqual(c['01'], { x: 1, y: 2, z: 3 });

/* the shipped coordinate files cover every tower */
const dirs = [require('path').join(__dirname, '..', 'src', 'main', 'towers')];
const bc = T.loadCoords('botw', dirs), tc = T.loadCoords('totk', dirs);
assert.strictEqual(Object.keys(bc).length, 15); assert.strictEqual(Object.keys(tc).length, 15);
assert.deepStrictEqual(bc['07'], { x: -588.1401977539062, y: 175.85565185546875, z: 1715.8707275390625 });
assert.deepStrictEqual(tc['01'], { x: -244.06314086914062, y: 98.05045318603516, z: 22.00397491455078 });
assert.deepStrictEqual(tc['02'], { x: -1910.641845703125, y: 1192.6187744140625, z: 274.6148986816406 });
assert.ok(T.describe(dirs).botw.every(d => d.hasCoords) && T.describe(dirs).totk.every(d => d.hasCoords));
console.log('test-towers OK');
