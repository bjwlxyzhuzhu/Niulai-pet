'use strict';
/* macOS 版的前台应用 + 空闲时长观察器，接口与 winwatch 完全一致：
   每 5 秒回调一次 { proc, full, idle }。

   用的都是系统自带命令，不需要申请「辅助功能」或「自动化」权限：
     · lsappinfo front / info   —— 取前台应用的 Bundle ID
     · ioreg -c IOHIDSystem     —— 取 HIDIdleTime（距上次键鼠输入的纳秒数）
   AppleScript 的 System Events 也能取前台应用，但首次调用会弹授权框，所以不用。

   隐私边界和 Windows 版一致：只要应用标识和空闲秒数，不碰窗口标题。

   为什么用 Bundle ID 而不是应用名：应用名会被系统本地化（访达 / 终端），
   而 VS Code 的可执行文件名干脆叫 Electron。Bundle ID 稳定得多。
   这里把它翻译成 Windows 上的进程名，渲染层的 PROC_MAP 就一份不用改。 */

const { execFile } = require('child_process');

// Bundle ID（小写）-> Windows 进程名（PROC_MAP 的键）
const BUNDLE_TO_PROC = {
  'com.microsoft.vscode': 'code',
  'com.todesktop.230313mzl4w4u92': 'cursor',
  'com.apple.dt.xcode': 'devenv',
  'com.jetbrains.intellij': 'idea64',
  'com.jetbrains.intellij.ce': 'idea64',
  'com.jetbrains.pycharm': 'pycharm64',
  'com.jetbrains.pycharm.ce': 'pycharm64',
  'com.jetbrains.webstorm': 'webstorm64',
  'com.jetbrains.goland': 'goland64',
  'com.jetbrains.clion': 'clion64',
  'com.sublimetext.4': 'sublime_text',
  'com.google.chrome': 'chrome',
  'com.apple.safari': 'chrome',
  'com.microsoft.edgemac': 'msedge',
  'org.mozilla.firefox': 'firefox',
  'com.microsoft.excel': 'excel',
  'com.apple.iwork.numbers': 'excel',
  'com.microsoft.word': 'winword',
  'com.apple.iwork.pages': 'winword',
  'com.kingsoft.wpsoffice.mac': 'wps',
  'com.microsoft.powerpoint': 'powerpnt',
  'com.apple.iwork.keynote': 'powerpnt',
  'com.tencent.xinwechat': 'wechat',
  'com.tencent.qq': 'qq',
  'com.alibaba.dingtalkmac': 'dingtalk',
  'com.electron.lark': 'feishu',
  'com.bytedance.lark': 'feishu',
  'ru.keepcoder.telegram': 'telegram',
  'com.tinyspeck.slackmacgap': 'slack',
  'com.adobe.photoshop': 'photoshop',
  'com.adobe.illustrator': 'illustrator',
  'com.figma.desktop': 'figma',
  'com.apple.finalcut': 'premiere',
  'com.adobe.premierepro': 'premiere',
  'com.netease.163music': 'cloudmusic',
  'com.tencent.qqmusicmac': 'qqmusic',
  'com.spotify.client': 'spotify',
  'com.apple.music': 'spotify',
  'com.valvesoftware.steam': 'steam',
  'com.apple.terminal': 'cmd',
  'com.googlecode.iterm2': 'wt',
  'dev.warp.warp-stable': 'wt',
  'com.apple.mail': 'outlook',
  'com.microsoft.outlook': 'outlook',
  'com.apple.preview': 'acrobat',
  'com.adobe.acrobat.pro': 'acrobat',
  'abnerworks.typora': 'typora',
  'md.obsidian': 'obsidian',
  'notion.id': 'notion',
  'com.obsproject.obs-studio': 'obs64',
  'com.apple.finder': 'explorer',
};

function run(cmd, args) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 3000, maxBuffer: 4 * 1024 * 1024 }, (err, out) => {
      resolve(err ? '' : String(out));
    });
  });
}

/** lsappinfo front 的输出形如 "ASN:0x0-0x1d01d:" */
function parseASN(out) {
  const m = /ASN:0x[0-9a-f]+-0x[0-9a-f]+:?/i.exec(out || '');
  return m ? m[0] : null;
}

/** lsappinfo info -only bundleid 的输出形如 "CFBundleIdentifier"="com.google.Chrome" */
function parseBundleId(out) {
  const m = /"CFBundleIdentifier"\s*=\s*"([^"]+)"/.exec(out || '');
  return m ? m[1] : '';
}

/** ioreg 输出里的 "HIDIdleTime" = 123456789（纳秒）-> 秒 */
function parseIdle(out) {
  const m = /"HIDIdleTime"\s*=\s*(\d+)/.exec(out || '');
  return m ? Math.floor(Number(m[1]) / 1e9) : 999;
}

function toProc(bundleId) {
  const id = String(bundleId || '').toLowerCase();
  if (!id) return '';
  return BUNDLE_TO_PROC[id] || id.split('.').pop();
}

async function sample() {
  const front = parseASN(await run('/usr/bin/lsappinfo', ['front']));
  const bundle = front
    ? parseBundleId(await run('/usr/bin/lsappinfo', ['info', '-only', 'bundleid', front]))
    : '';
  const idle = parseIdle(await run('/usr/sbin/ioreg', ['-c', 'IOHIDSystem', '-d', '4']));
  // macOS 的全屏是独立的桌面空间，判断代价大且不可靠，这里不做；
  // 免打扰在 Mac 上只剩「安静一小时」这一个手动开关。
  return { proc: toProc(bundle), full: false, idle };
}

function startMacWatch(onUpdate) {
  let stopped = false;
  let timer = null;
  const tick = async () => {
    if (stopped) return;
    try { onUpdate(await sample()); } catch (_) { /* 取不到就跳过这一拍 */ }
    if (!stopped) timer = setTimeout(tick, 5000);
  };
  tick();
  return () => { stopped = true; clearTimeout(timer); };
}

module.exports = { startMacWatch, parseASN, parseBundleId, parseIdle, toProc };
