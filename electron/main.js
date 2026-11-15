'use strict';
const { app, BrowserWindow, ipcMain, Tray, Menu, screen, nativeImage, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { Store } = require('./store');
const { startWinWatch } = require('./winwatch');
const weather = require('./weather');
const agenda = require('./agenda');
const briefing = require('./briefing');
const deepseek = require('./deepseek');
const secrets = require('./secrets');
const tts = require('./tts');

// 音效可能由定时器或合成事件触发，不一定挂在真实用户手势上，
// 不放开自动播放策略的话 audio.play() 会被 Chromium 拒绝。
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

const ROOT = path.join(__dirname, '..');
const SPRITE_DIR = path.join(ROOT, 'assets', 'sprites');

// 窗口比牛本体大一圈，上方留给气泡，四周留给抖动/跳跃的溢出空间
const WIN_W = 380;
const WIN_H = 420;
const MARGIN = 24;

let win = null;
let tray = null;
let store = null;
let stopWatch = null;
let lastForeground = { proc: '', full: false };
const panels = { settings: null, chat: null };
let chatAbort = null;

function defaultPosition() {
  const wa = screen.getPrimaryDisplay().workArea;
  return {
    x: wa.x + wa.width - WIN_W - MARGIN,
    y: wa.y + wa.height - WIN_H - MARGIN,
  };
}

// 位置可能因为换显示器/改分辨率而落到屏幕外，开机时校正回来
function clampToScreen(pos) {
  const areas = screen.getAllDisplays().map((d) => d.workArea);
  const visible = areas.some((a) =>
    pos.x + WIN_W > a.x + 40 && pos.x < a.x + a.width - 40 &&
    pos.y + WIN_H > a.y + 40 && pos.y < a.y + a.height - 40);
  return visible ? pos : defaultPosition();
}

function createWindow() {
  const saved = store.get('pos');
  const pos = saved ? clampToScreen(saved) : defaultPosition();

  win = new BrowserWindow({
    width: WIN_W,
    height: WIN_H,
    x: pos.x,
    y: pos.y,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    skipTaskbar: true,
    focusable: false,          // 不抢焦点，点它不会打断你正在敲的字
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.setAlwaysOnTop(true, 'screen-saver');
  // macOS：切换桌面空间、进入别的全屏应用时牛来也跟着，不被留在原来那个空间里
  if (process.platform === 'darwin') {
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }
  // 窗口是个 380x420 的实心矩形，不穿透的话会吞掉右下角一整块的鼠标点击
  // （CSS 的 pointer-events 只管网页内部，管不到操作系统这一层）。
  // 默认全窗口穿透，forward:true 让渲染层仍能收到 mousemove 做命中判定；
  // 指针真正压到牛身上时，再由渲染层通知这边接管。
  win.setIgnoreMouseEvents(true, { forward: true });

  // 透明窗口出问题时屏幕上什么都看不到，用 NIULAI_DEBUG=1 把渲染层控制台转出来
  if (process.env.NIULAI_DEBUG) {
    // Electron 36+ 把 console-message 改成了单参数对象，这里两种签名都兼容
    win.webContents.on('console-message', (a, b) => {
      const d = (a && typeof a === 'object' && 'message' in a) ? a : { message: b };
      console.log('[渲染层] %s (%s:%s)', d.message, d.sourceId || '', d.lineNumber || '');
    });
    win.webContents.on('did-fail-load', (_e, code, desc) => {
      console.log('[加载失败] %d %s', code, desc);
    });
    win.webContents.on('did-finish-load', () => setTimeout(async () => {   // 等前台监测至少吐一拍
      const probe = `(() => {
        const im = document.getElementById('pet-img');
        const r = im.getBoundingClientRect();
        return {
          api: typeof window.niulai,
          lines: typeof window.LINES,
          imgSrc: (im.getAttribute('src') || '').slice(0, 40),
          imgBox: Math.round(r.width) + 'x' + Math.round(r.height),
          bodySize: document.body.clientWidth + 'x' + document.body.clientHeight,
          watchProc: state.proc, watchStreak: state.workStreak,
          hitCenter: hitTest(r.left + r.width / 2, r.top + r.height * 0.6),
          hitCorner: hitTest(r.left + 2, r.top + 2)
        };
      })()`;
      try {
        console.log('[诊断]', JSON.stringify(await win.webContents.executeJavaScript(probe)));
      } catch (e) { console.log('[诊断失败]', e.message); }

      // NIULAI_SHOT=<路径> 时把窗口自身的渲染结果存成 PNG。
      // 直接截屏拍到的是那块区域的最前层，牛来被挡住就看不见，这个不受遮挡影响。
      if (process.env.NIULAI_SHOT) {
        setTimeout(async () => {
          try {
            const img = await win.capturePage();
            fs.writeFileSync(process.env.NIULAI_SHOT, img.toPNG());
            console.log('[窗口截图]', process.env.NIULAI_SHOT);
          } catch (e) { console.log('[截图失败]', e.message); }
        }, 500);
      }
    }, 9000));
  }

  win.loadFile(path.join(ROOT, 'src', 'index.html'));
  win.on('closed', () => { win = null; });
}

function savePosition() {
  if (!win || win.isDestroyed()) return;
  const [x, y] = win.getPosition();
  store.set('pos', { x, y });
}

function trayImage() {
  const p = path.join(ROOT, 'assets', 'tray.png');
  if (fs.existsSync(p)) {
    const img = nativeImage.createFromPath(p);
    // macOS 菜单栏图标按 18pt 画才不显小；Windows 托盘是 16px
    const px = process.platform === 'darwin' ? 18 : 16;
    if (!img.isEmpty()) return img.resize({ width: px, height: px });
  }
  return nativeImage.createEmpty();
}

function buildMenu() {
  const quietUntil = store.get('quietUntil') || 0;
  const quiet = Date.now() < quietUntil;
  return Menu.buildFromTemplate([
    {
      label: win && win.isVisible() ? '藏起来' : '把牛来叫出来',
      click: () => {
        if (!win) return;
        if (win.isVisible()) win.hide(); else win.showInactive();
        if (tray) tray.setContextMenu(buildMenu());
      },
    },
    { label: '换个心情', click: () => send('command', { type: 'mood' }) },
    { label: '叫妈妈', click: () => send('command', { type: 'mama' }) },
    { type: 'separator' },
    { label: '聊聊…', click: () => openPanel('chat') },
    { label: '明天怎么安排', click: () => fireBriefing('evening', true) },
    { label: '今天怎么安排', click: () => fireBriefing('morning', true) },
    { label: '设置…', click: () => openPanel('settings') },
    { type: 'separator' },
    {
      label: quiet ? '结束安静（还剩 ' + Math.ceil((quietUntil - Date.now()) / 60000) + ' 分钟）' : '安静一小时',
      click: () => {
        store.set('quietUntil', quiet ? 0 : Date.now() + 3600 * 1000);
        send('command', { type: 'quiet', until: store.get('quietUntil') });
        if (tray) tray.setContextMenu(buildMenu());
      },
    },
    {
      label: store.get('display') === 'body' ? '切成半身（看脸）' : '切成全身（看动作）',
      click: () => {
        const next = store.get('display') === 'body' ? 'bust' : 'body';
        store.set('display', next);
        send('command', { type: 'display', value: next });
        if (tray) tray.setContextMenu(buildMenu());
      },
    },
    { type: 'separator' },
    {
      label: '回到右下角',
      click: () => { if (win) { const p = defaultPosition(); win.setPosition(p.x, p.y); savePosition(); } },
    },
    { type: 'separator' },
    { label: '退出', click: () => { savePosition(); app.exit(0); } },
  ]);
}

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function createTray() {
  tray = new Tray(trayImage());
  tray.setToolTip('牛来');
  tray.setContextMenu(buildMenu());
  tray.on('click', () => {
    if (!win) return;
    if (win.isVisible()) win.hide(); else win.showInactive();
    tray.setContextMenu(buildMenu());
  });
}

// 单实例：第二次启动只把牛来叫出来
if (!app.requestSingleInstanceLock()) {
  app.exit(0);
} else {
  app.on('second-instance', () => { if (win) win.showInactive(); });

  app.whenReady().then(() => {
    // macOS 上没有应用菜单的话，输入框里 ⌘C / ⌘V / ⌘A 全部失效 ——
    // 设置里粘贴 API key、聊天窗口里粘贴文字都靠它。菜单栏本身不显示（LSUIElement）。
    if (process.platform === 'darwin') {
      Menu.setApplicationMenu(Menu.buildFromTemplate([
        { role: 'appMenu' },
        { role: 'editMenu' },
        { role: 'windowMenu' },
      ]));
    }
    store = new Store(app.getPath('userData'), {
      pos: null, display: 'bust', quietUntil: 0,
      apiKey: null,                              // { enc, v } —— 见 secrets.js
      model: 'deepseek-chat',
      city: null,                                // { name, lat, lon }
      cclockPath: '',                            // 空则自动探测
      leadDays: 7,
      // 只朗读聊天回复。早晚播报刻意不读 —— 那里面有你的日程，不外发。
      tts: { on: true, voice: 'zh-CN-YunxiaNeural', pitch: -20, rate: -8 },
      morning: { on: true, time: '09:00' },
      evening: { on: true, time: '18:00' },
      lastBrief: {},                             // 记住每种播报今天报过没有
      chat: [],
    });
    createWindow();
    createTray();
    setInterval(checkBriefings, 30000);
    catchUpBriefings();

    stopWatch = startWinWatch((d) => {
      const changed = d.proc !== lastForeground.proc || d.full !== lastForeground.full;
      lastForeground = d;
      send('foreground', d);   // 每 tick 都转发：久坐计时需要连续的空闲秒数
      if (!changed) return;
      // 全屏时让出图层，别糊在别人的演示/游戏上面
      if (win && !win.isDestroyed()) {
        if (d.full) win.setAlwaysOnTop(false);
        else win.setAlwaysOnTop(true, 'screen-saver');
      }
    });
  });

  app.on('window-all-closed', () => { /* 托盘常驻，不退出 */ });
  app.on('before-quit', () => { savePosition(); if (stopWatch) stopWatch(); });
}

// ---- IPC ----
ipcMain.on('drag-by', (_e, { dx, dy }) => {
  if (!win || win.isDestroyed()) return;
  const [x, y] = win.getPosition();
  win.setPosition(Math.round(x + dx), Math.round(y + dy));
});
ipcMain.on('drag-end', () => savePosition());
ipcMain.on('show-menu', () => {
  if (!win || win.isDestroyed()) return;
  // 窗口是 focusable:false（免得点牛来打断你正在敲的字），
  // 但原生弹出菜单在不可聚焦的窗口上会一弹就消失，所以开菜单期间临时放开。
  win.setFocusable(true);
  buildMenu().popup({ window: win, callback: () => { if (win && !win.isDestroyed()) win.setFocusable(false); } });
});
ipcMain.on('set-hover', (_e, over) => {
  if (!win || win.isDestroyed()) return;
  win.setIgnoreMouseEvents(!over, { forward: true });
});

ipcMain.handle('get-config', () => ({
  display: store.get('display'),
  quietUntil: store.get('quietUntil') || 0,
}));
ipcMain.handle('set-config', (_e, { k, v }) => { store.set(k, v); return true; });
ipcMain.handle('list-sprites', () => {
  try { return fs.readdirSync(SPRITE_DIR).filter((f) => f.endsWith('.png')); }
  catch (_) { return []; }
});


/* ==================== 设置 / 聊天 面板 ==================== */

function openPanel(kind) {
  const exist = panels[kind];
  // Mac 版不在程序坞里（LSUIElement），新窗口默认不会跑到最前面，得显式抢一下焦点
  if (process.platform === 'darwin') app.focus({ steal: true });
  if (exist && !exist.isDestroyed()) { exist.show(); exist.focus(); return exist; }

  const w = new BrowserWindow({
    width: kind === 'chat' ? 430 : 545,
    height: kind === 'chat' ? 590 : 680,
    minWidth: 380,
    minHeight: 420,
    title: kind === 'chat' ? '和牛来聊聊' : '牛来 · 设置',
    backgroundColor: '#FBF7F2',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload-panel.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  w.setMenuBarVisibility(false);
  w.loadFile(path.join(ROOT, 'src', kind + '.html'));
  w.once('ready-to-show', () => w.show());
  w.on('closed', () => { panels[kind] = null; });
  panels[kind] = w;
  return w;
}

ipcMain.on('panel:close', (e) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (w && !w.isDestroyed()) w.close();
});

/* ==================== 早晚播报 ==================== */

function ymd(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function hhmm(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

function currentConfig() {
  return {
    city: store.get('city'),
    cclockPath: store.get('cclockPath'),
    leadDays: store.get('leadDays'),
  };
}

async function fireBriefing(kind, manual) {
  if (!win || win.isDestroyed()) return;
  try {
    const b = await briefing.build(kind, currentConfig(), app.getPath('appData'));
    // 手动点菜单时无视免打扰 —— 是你自己要看的
    send('command', { type: 'brief', text: b.text, expr: b.expr, manual: !!manual });
  } catch (e) {
    send('command', { type: 'brief', text: '播报出岔子了：' + e.message, expr: 'sad', manual: !!manual });
  }
}

/**
 * 开机补报：到点那会儿人可能还没开电脑，定时器只在整分钟那一刻匹配，
 * 于是 9:30 才开机的话早报就永远不响 —— 对「早晚各一次」来说等于时灵时不灵。
 * 所以启动时把今天已经错过、且错过不超过 4 小时的那一档补上一次。
 * 卡 4 小时是为了别在晚上十点收到早上九点的早报；
 * 同时错过两档时只补更近的那一档，免得两条播报撞在一起。
 */
function catchUpBriefings() {
  const now = new Date();
  const today = ymd(now);
  const last = store.get('lastBrief') || {};
  let best = null;

  for (const kind of ['morning', 'evening']) {
    const c = store.get(kind);
    if (!c || !c.on || last[kind] === today) continue;
    const [h, m] = String(c.time || '').split(':').map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) continue;
    const slot = new Date(now);
    slot.setHours(h, m, 0, 0);
    const lateBy = now - slot;
    if (lateBy <= 0 || lateBy > 4 * 3600 * 1000) continue;
    if (!best || lateBy < best.lateBy) best = { kind, lateBy };
  }

  if (!best) return;
  last[best.kind] = today;
  store.set('lastBrief', last);
  setTimeout(() => fireBriefing(best.kind, false), 6000);   // 等牛来先把自己画出来
}

// 每 30 秒查一次；间隔小于一分钟才不会漏掉整分钟的那一刻
function checkBriefings() {
  if (!store) return;
  const now = new Date();
  const cur = hhmm(now);
  const today = ymd(now);
  const last = store.get('lastBrief') || {};
  for (const kind of ['morning', 'evening']) {
    const c = store.get(kind);
    if (!c || !c.on || c.time !== cur) continue;
    if (last[kind] === today) continue;      // 今天这一档报过了
    last[kind] = today;
    store.set('lastBrief', last);
    fireBriefing(kind, false);
  }
}

/* ==================== 设置面板的 IPC ==================== */

ipcMain.handle('cfg:get', () => {
  const key = secrets.open(store.get('apiKey'));
  return {
    hasKey: !!key,
    keyMask: secrets.mask(key),        // 只回遮罩，完整 key 永远不出主进程
    encAvailable: secrets.available(),
    model: store.get('model'),
    tts: store.get('tts'),
    city: store.get('city'),
    cclockPath: store.get('cclockPath'),
    cclockDetected: agenda.detectPath(app.getPath('appData')) || '',
    leadDays: store.get('leadDays'),
    morning: store.get('morning'),
    evening: store.get('evening'),
  };
});

ipcMain.handle('cfg:save', (_e, patch) => {
  for (const [k, v] of Object.entries(patch || {})) store.set(k, v);
  return true;
});

ipcMain.handle('cfg:set-key', (_e, key) => {
  store.set('apiKey', secrets.seal(String(key || '').trim()));
  return { mask: secrets.mask(String(key || '').trim()) };
});

ipcMain.handle('cfg:clear-key', () => { store.set('apiKey', null); return true; });

ipcMain.handle('cfg:test-key', async () => {
  const key = secrets.open(store.get('apiKey'));
  if (!key) return { ok: false, error: '还没保存 key。' };
  try {
    await deepseek.test(key, store.get('model'));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('cfg:search-city', async (_e, name) => {
  try {
    return { ok: true, list: await weather.searchCity(String(name || '')) };
  } catch (e) {
    return { ok: false, error: '搜不动，检查一下网络：' + e.message };
  }
});

ipcMain.handle('cfg:pick-cclock', async (e) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  const r = await dialog.showOpenDialog(w, {
    title: '选择 Cclock 的 data.json',
    defaultPath: path.join(app.getPath('appData'), 'Cclock'),
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['openFile'],
  });
  return { path: r.canceled ? '' : r.filePaths[0] };
});

ipcMain.handle('cfg:peek-agenda', () => {
  const cfg = currentConfig();
  const file = cfg.cclockPath || agenda.detectPath(app.getPath('appData'));
  const r = agenda.upcoming(file, cfg.leadDays);
  return {
    ok: r.ok,
    reason: r.reason,
    items: (r.items || []).map((t) => ({ line: agenda.line(t) })),
  };
});

ipcMain.handle('cfg:preview-briefing', async (_e, kind) => {
  try {
    const b = await briefing.build(kind === 'morning' ? 'morning' : 'evening',
      currentConfig(), app.getPath('appData'));
    return { text: b.text };
  } catch (e) {
    return { text: '出错了：' + e.message };
  }
});

/* ==================== 聊天的 IPC ==================== */

ipcMain.handle('chat:history', () => store.get('chat') || []);
ipcMain.handle('chat:clear', () => { store.set('chat', []); return true; });
ipcMain.on('chat:abort', () => { if (chatAbort) chatAbort.abort(); });

ipcMain.handle('chat:send', async (e, text) => {
  const key = secrets.open(store.get('apiKey'));
  if (!key) return { ok: false, error: '还没填 DeepSeek 的 API key —— 右键牛来 →「设置…」里填。' };

  const history = store.get('chat') || [];
  const wc = e.sender;
  chatAbort = new AbortController();

  try {
    const full = await deepseek.chat({
      apiKey: key,
      model: store.get('model'),
      history,
      message: String(text || ''),
      onDelta: (d) => { if (!wc.isDestroyed()) wc.send('chat:delta', d); },
      signal: chatAbort.signal,
    });
    const { text: clean, expr } = deepseek.extractExpr(full);
    // 只留最近 40 条，免得配置文件无限长、上下文无限贵
    store.set('chat', history.concat(
      [{ role: 'user', content: String(text || '') }, { role: 'assistant', content: clean }]
    ).slice(-40));
    if (expr) send('command', { type: 'expr', value: expr });
    return { ok: true, text: clean };
  } catch (err) {
    return { ok: false, error: err.name === 'AbortError' ? '中断了。' : err.message };
  } finally {
    chatAbort = null;
  }
});


/* ==================== 语音合成的 IPC ==================== */

ipcMain.handle('tts:config', () => store.get('tts'));

ipcMain.handle('tts:speak', async (_e, { text, override }) => {
  const cfg = Object.assign({}, store.get('tts'), override || {});
  // 试听时 override 里带着界面上还没保存的参数，这时不看开关
  if (!cfg.on && !override) return { ok: false, error: '朗读已关闭' };
  try {
    const buf = await tts.speak(text, cfg);
    return { ok: true, b64: buf.toString('base64') };
  } catch (err) {
    // 接口是微软非公开的，挂了就安静退回只显示文字，别让聊天卡住
    return { ok: false, error: err.message };
  }
});

// 牛来说话时轻轻晃一下，让声音有个着落
ipcMain.on('tts:playing', (_e, on) => send('command', { type: 'talking', on: !!on }));
