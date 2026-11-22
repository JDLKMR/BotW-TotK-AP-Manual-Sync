/* Launch-argument parsing (pure Node). */
const assert = require('assert'); const cli = require('../src/main/cli');
let r = cli.parseArgs(['app', '--server', 'archipelago.gg:12345', '--botw-slot', 'Link', '--totk-slot=Zelda', '--password', 'p w', '--enable-botw', 'true', '--enable-totk', 'FALSE']);
assert.deepStrictEqual(r.errors, []);
assert.deepStrictEqual(r.values, { server: 'archipelago.gg', port: 12345, botwSlot: 'Link', totkSlot: 'Zelda', password: 'p w', enableBotw: true, enableTotk: false });
r = cli.parseArgs(['--server', 'wss://ap.example.com']); assert.deepStrictEqual(r.values, { server: 'wss://ap.example.com' });
r = cli.parseArgs(['--server', '[::1]:5000']); assert.deepStrictEqual(r.values, { server: '[::1]', port: 5000 });
r = cli.parseArgs(['--password', '-abc', '--hidden', 'junk']); assert.deepStrictEqual(r.values, { password: '-abc' });
r = cli.parseArgs(['--enable-botw', 'maybe', '--server', 'h:99999', '--botw-slot']); assert.strictEqual(r.errors.length, 3); assert.deepStrictEqual(r.values, {});
r = cli.parseArgs(['--password', '--enable-botw', 'true']); assert.strictEqual(r.errors.length, 1); assert.strictEqual(r.values.enableBotw, true);
const data = { server: 'a', port: 1, password: '', games: { botw: { slot: '', enabled: false }, totk: { slot: '', enabled: true } } };
const notes = cli.applyToSettings(data, cli.parseArgs(['--server', 'x:2', '--botw-slot', 'B', '--enable-botw', 'true', '--enable-totk', 'false', '--password', 'secret']).values);
assert.strictEqual(data.server, 'x'); assert.strictEqual(data.port, 2); assert.strictEqual(data.password, 'secret'); assert.strictEqual(data.games.botw.slot, 'B');
assert.strictEqual(data.games.botw.enabled, true); assert.strictEqual(data.games.totk.enabled, false); assert.ok(!notes.join(' ').includes('secret'));
console.log('test-cli OK');
