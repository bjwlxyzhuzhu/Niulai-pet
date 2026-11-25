'use strict';
/* 端到端测试底座：启动真实程序（开发版或安装包），用 DevTools 协议驱动。无第三方依赖，Node >= 22。 */
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function check(name, ok, info) {
  results.push(!!ok);
  if (!ok && process.env.GITHUB_ACTIONS) console.log('::error title=e2e::' + name + ' ' + JSON.stringify(info));
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (info === undefined ? '' : '  ' + JSON.stringify(info)));
}
async function launch(extra, dir) {
  const bin = process.argv[2];            // 传了就测该可执行文件，没传测源码
  const port = 9300 + Math.floor(Math.random() * 500);
  dir = dir || fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-'));
  const exe = bin ? path.resolve(bin) : require('electron');
  const args = [...(bin ? [] : ['.']), '--remote-debugging-port=' + port, '--user-data-dir=' + dir, '--use-mock-keychain', ...(extra || [])];
  const child = spawn(exe, args, { stdio: 'ignore' });
  const targets = async () => {
    try { return (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).filter((t) => t.type === 'page'); } catch { return []; }
  };
  async function page(match) {
    for (let i = 0; i < 60; i++) {
      const t = (await targets()).find((x) => x.url.includes(match));
      if (t) return attach(t);
      await sleep(500);
    }
    throw new Error('窗口没出现: ' + match + ' 现有: ' + (await targets()).map((t) => t.url).join(' '));
  }
  async function attach(t) {
    const ws = new WebSocket(t.webSocketDebuggerUrl);
    await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
    let id = 0; const wait = new Map(), errors = [];
    ws.onmessage = (m) => {
      const d = JSON.parse(m.data);
      if (d.id) { wait.get(d.id)(d); wait.delete(d.id); }
      else if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
    };
    const send = (method, params) => new Promise((r, j) => {
      const n = ++id; const t = setTimeout(() => j(new Error('CDP 超时 ' + method)), 40000);
      wait.set(n, (d) => { clearTimeout(t); r(d); });
      ws.send(JSON.stringify({ id: n, method, params: params || {} }));
    });
    await send('Runtime.enable');
    return {
      errors, send,
      ev: async (expression) => {
        const d = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
        if (d.result.exceptionDetails) throw new Error(d.result.exceptionDetails.exception?.description || 'eval 失败');
        return d.result.result.value;
      },
      mouse: (type, x, y, o) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, ...o }),
      shot: async (name) => {
        const d = await send('Page.captureScreenshot', { format: 'png' });
        const out = process.env.E2E_SHOTS; if (!out) return;
        fs.mkdirSync(out, { recursive: true }); fs.writeFileSync(path.join(out, name + '.png'), Buffer.from(d.result.data, 'base64'));
      },
    };
  }
  return { child, dir, page, kill: async () => { child.kill(); await sleep(1500); } };
}
function finish() {
  const bad = results.filter((x) => !x).length, sum = `${results.length - bad}/${results.length} 通过 (${process.platform} ${process.arch})`;
  console.log((process.env.GITHUB_ACTIONS ? '::notice title=e2e::' : '') + sum);
  process.exit(bad ? 1 : 0);
}
module.exports = { launch, check, finish, sleep };
