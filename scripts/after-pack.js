'use strict';
/* 打包完成、开始压缩安装包之前，先等主程序真的能被打开。

   为什么需要这一步：electron-builder 刚写完并签名完那个 210MB 的主程序，
   下一步就用 7za 去压缩整个目录。而这个体量的、刚落地的已签名 exe
   通常正被杀毒软件扫描占着，7za 读不到就直接失败：

     WARNING: The process cannot access the file because it is being used by another process.
     .\Niulai.exe
     ⨯ 7za.exe process failed 1

   这个失败是随机的 —— 同样的配置有时能过、有时连着几次都过不去。
   实测：构建结束后手动跑 7za 压同一个文件完全正常，所以不是持续占用，
   是签名刚写完、杀软立刻开扫，而 7z 紧接着就来读，撞在了一起。

   所以这里不是"等锁释放"，而是主动把整个 exe 完整读一遍，
   逼杀软在我们这一步把扫描做完；等 7z 再来读时已经是扫过的干净状态。 */

const fs = require('fs');
const path = require('path');

const MAX_WAIT_MS = 120000;
const STEP_MS = 1500;

/**
 * 判断文件是不是真的没被别人占着。
 *
 * 注意不能用 fs.openSync(p, 'r+') —— Node 是以共享模式打开的，
 * 别的进程正抓着这个文件时它照样成功，所以那个判据是无效的
 * （实测：钩子里 open 成功，紧接着 7za 就报「被另一个进程占用」）。
 *
 * 重命名不一样：只要有别的进程持有句柄且没允许删除共享，rename 就会失败。
 * 所以拿「改个名再改回来」当探针。
 */
function isFree(p) {
  const probe = p + '.locktest';
  try {
    fs.renameSync(p, probe);
    fs.renameSync(probe, p);
    return true;
  } catch (_) {
    // 万一改过去了却没改回来，尽力补救，别把构建产物弄丢
    try { if (fs.existsSync(probe)) fs.renameSync(probe, p); } catch (_e) { /* 尽力而为 */ }
    return false;
  }
}

/* macOS：ad-hoc 签名。
   electron-builder 改写了 Info.plist、换了可执行文件名，Electron 原带的签名已经失效；
   没有开发者证书时它会直接跳过签名，Apple 芯片上的系统会把这样的 app 判成「已损坏」。
   用 "-" 作身份做一次 ad-hoc 签名就能变成「无法验证开发者」，用户可以手动放行。 */
function adhocSignMac(context) {
  const { execFileSync } = require('child_process');
  const app = path.join(context.appOutDir, context.packager.appInfo.productFilename + '.app');
  if (!fs.existsSync(app)) return;
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
  execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' });
  console.log('  • 已对 ' + path.basename(app) + ' 做 ad-hoc 签名并校验通过');
}

exports.default = async function afterPack(context) {
  if (context.electronPlatformName === 'darwin') return adhocSignMac(context);
  const name = (context.packager.executableName || context.packager.appInfo.productFilename) + '.exe';
  const exe = path.join(context.appOutDir, name);
  if (!fs.existsSync(exe)) return;

  const t0 = Date.now();

  // 先整个读一遍，把扫描逼到这一步来做
  await new Promise((resolve, reject) => {
    const rs = fs.createReadStream(exe, { highWaterMark: 4 * 1024 * 1024 });
    rs.on('data', () => { /* 只为触发扫描，内容本身不要 */ });
    rs.on('end', resolve);
    rs.on('error', reject);
  });

  // 再等到确实没人占着为止
  while (!isFree(exe)) {
    if (Date.now() - t0 > MAX_WAIT_MS) {
      console.log(`  • ${name} 等了 ${MAX_WAIT_MS / 1000} 秒仍被占用，继续往下走`);
      return;
    }
    await new Promise((r) => setTimeout(r, STEP_MS));
  }
  console.log(`  • ${name} 已就绪（${Math.round((Date.now() - t0) / 1000)} 秒）`);
};
