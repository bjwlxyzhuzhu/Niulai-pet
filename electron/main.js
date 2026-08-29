'use strict';
const { app, BrowserWindow, ipcMain, Tray, Menu, screen, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { Store } = require('./store');
const { startWinWatch } = require('./winwatch');

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
    if (!img.isEmpty()) return img.resize({ width: 16, height: 16 });
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
    store = new Store(app.getPath('userData'), {
      pos: null, display: 'bust', quietUntil: 0,
    });
    createWindow();
    createTray();

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
