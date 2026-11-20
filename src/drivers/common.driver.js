/*
 * Shared helpers injected into a save-editor page before the game-specific driver.
 * Runs INSIDE the editor page (Chromium in Electron, jsdom in tests) - not in Node.
 */
(function (g) {
  const H = {};
  H.b64ToU8 = function (b64) {
    const bin = atob(b64); const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8;
  };
  H.u8ToB64 = function (u8) {
    let s = ''; const CH = 0x8000;
    for (let i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
    return btoa(s);
  };
  // Float32 bit pattern <-> number (the editors store stamina as raw float bits in a UInt)
  H.bitsToFloat = function (bits) { const dv = new DataView(new ArrayBuffer(4)); dv.setUint32(0, bits >>> 0); return dv.getFloat32(0); };
  // Feed raw bytes to the editor exactly the way its own "example savegame" loader does
  H.installTempFile = function (u8, fileName) {
    g.tempFile = new g.MarcFile(u8.length);
    g.tempFile.fileName = fileName;
    g.tempFile._u8array = u8;
    g.tempFile._dataView = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  };
  H.stripVersion = function (n) { return String(n).replace(/\s*\(v[\d.*]+\)\s*$/i, '').trim(); };
  g.__apHelpers = H;
})(typeof window !== 'undefined' ? window : globalThis);
