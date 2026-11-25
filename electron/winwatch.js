'use strict';
const { spawn } = require('child_process');
const path = require('path');

// 常驻一个 PowerShell 子进程持续吐 JSON，避免每次轮询都重新 Add-Type 编译（那要 500ms+）
function startWinWatch(onUpdate) {
  // 打包后本文件位于 app.asar 内。Electron 自己能透明读取 asar，但外部的
  // powershell.exe 不能，所以脚本在 electron-builder.yml 里被 asarUnpack 解包出来，
  // 这里把路径改写到解包目录。开发态没有 app.asar，replace 不命中，原样返回。
  const script = path.join(__dirname, 'winwatch.ps1').replace('app.asar', 'app.asar.unpacked');
  let child = null;
  let stopped = false;
  let buf = '';

  function launch() {
    if (stopped) return;
    child = spawn('powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-ParentPid', String(process.pid)],
      { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      buf += chunk;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line) continue;
        try { onUpdate(JSON.parse(line)); } catch (_) { /* 忽略脏行 */ }
      }
    });
    child.on('exit', () => { if (!stopped) setTimeout(launch, 5000); });
    child.on('error', (e) => console.error('[winwatch] 启动失败:', e.message));
  }

  launch();
  return () => { stopped = true; if (child) try { child.kill(); } catch (_) {} };
}

// macOS 没有 PowerShell，换成系统命令实现的同接口版本（见 macwatch.js）
function startWatch(onUpdate) {
  if (process.platform === 'darwin') return require('./macwatch').startMacWatch(onUpdate);
  return startWinWatch(onUpdate);
}

module.exports = { startWinWatch: startWatch };
