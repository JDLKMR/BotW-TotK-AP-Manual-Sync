// electron-builder afterPack hook: stamps our icon + file properties onto the Windows .exe with a pure-JS PE editor.
// (electron-builder normally does this with rcedit, which needs Wine when building on Linux.)
const fs = require('fs'), path = require('path');
exports.default = async function (context) {
  if (context.electronPlatformName !== 'win32') return;
  const ResEdit = require('resedit');
  const exeName = context.packager.appInfo.productFilename + '.exe';
  const exePath = path.join(context.appOutDir, exeName);
  const exe = ResEdit.NtExecutable.from(fs.readFileSync(exePath));
  const res = ResEdit.NtExecutableResource.from(exe);
  const ico = ResEdit.Data.IconFile.from(fs.readFileSync(path.join(__dirname, '..', 'assets', 'icon.ico')));
  const group = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries)[0];
  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, group ? group.id : 1, group ? group.lang : 1033, ico.icons.map(i => i.data));
  const vi = ResEdit.Resource.VersionInfo.fromEntries(res.entries)[0];
  if (vi) {
    const v = context.packager.appInfo.version;
    vi.setStringValues({ lang: 1033, codepage: 1200 }, { FileDescription: 'BotW/TotK AP Manual Sync', ProductName: 'BotW/TotK AP Manual Sync', CompanyName: 'JD', LegalCopyright: '', OriginalFilename: exeName, InternalName: 'BotW-TotK AP Manual Sync', FileVersion: v, ProductVersion: v });
    vi.outputToResourceEntries(res.entries);
  }
  res.outputResource(exe);
  fs.writeFileSync(exePath, Buffer.from(exe.generate()));
  console.log('  • afterPack: icon + version info stamped on ' + exeName);
};
