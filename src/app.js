'use strict';
/* 牛来 · 行为主循环 */

const $pet = document.getElementById('pet');
const $img = document.getElementById('pet-img');
const $bubble = document.getElementById('bubble');
const $text = document.getElementById('bubble-text');

const CFG = {
  BUBBLE_MS: 6000,          // 气泡停留时长
  EXPR_MS: 4000,            // 表情回归常态的时间
  IDLE_MIN: 5 * 60 * 1000,  // 随机吐槽最短间隔
  IDLE_MAX: 10 * 60 * 1000, // 随机吐槽最长间隔
  SNARK_RATE: 0.2,          // 毒舌占比
  RAGE_CLICKS: 6,           // 狂点判定：次数
  RAGE_WINDOW: 1500,        // 狂点判定：时间窗（毫秒）
  WARN_CLICKS: 3,           // 第 3 下先预警
  SULK_MS: 5000,            // 崩溃后的委屈时长
  RAGE_FALLBACK_MS: 8000,   // 音频加载失败时的兜底解锁
  SIT_SECONDS: 45 * 60,     // 久坐阈值
  PROC_COOLDOWN: 3 * 60 * 1000, // 应用切换台词的冷却
  DRAG_THRESHOLD: 4,        // 超过这个像素才算拖动，而不是点击
};

const state = {
  display: 'bust',
  expr: 'normal',
  dancing: false,       // 双击跳舞期间临时换成全身的跳舞图
  busy: false,          // 崩溃/委屈演出中，不响应点击
  quietUntil: 0,
  fullscreen: false,
  proc: '',
  workStreak: 0,        // 连续用电脑的秒数
  lastProcTalk: 0,
  lastHour: new Date().getHours(),
  clicks: [],
};

let exprTimer = null;
let bubbleTimer = null;
let idleTimer = null;
let danceTimer = null;

const audio = new Audio('../assets/sfx/mama.wav');
audio.preload = 'auto';

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const now = () => Date.now();
const muted = () => state.fullscreen || now() < state.quietUntil;

/* ---------------- 表现层 ---------------- */

function render() {
  if (state.dancing) { $img.src = window.Sprites.body('laugh', 'dance'); return; }
  $img.src = state.display === 'body'
    ? window.Sprites.body(state.expr)
    : window.Sprites.face(state.expr);
}

function setExpr(expr, holdMs) {
  state.expr = expr;
  render();
  clearTimeout(exprTimer);
  if (expr !== 'normal') {
    exprTimer = setTimeout(() => {
      if (state.busy) return;
      state.expr = 'normal';
      render();
    }, holdMs || CFG.EXPR_MS);
  }
}

function bubble(text, ms, wide) {
  $text.textContent = text;
  $bubble.classList.remove('hidden');
  $bubble.classList.toggle('wide', !!wide);
  // 重新触发弹出动画
  $text.style.animation = 'none';
  void $text.offsetWidth;
  $text.style.animation = '';
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => $bubble.classList.add('hidden'), ms || CFG.BUBBLE_MS);
}

// 说一句话 = 气泡 + 配套表情
function say(line, opts) {
  if (!line) return;
  const o = opts || {};
  if (o.auto && muted()) return;   // 自动台词受免打扰约束，点击回应不受
  bubble(line.t, o.ms);
  setExpr(line.e, o.holdMs);
}

function flash(cls, ms) {
  $pet.classList.remove('breathe');
  $pet.classList.add(cls);
  setTimeout(() => {
    $pet.classList.remove(cls);
    if (!state.busy) $pet.classList.add('breathe');
  }, ms);
}

/* ---------------- 狂点 -> 叫妈妈 ---------------- */

function rage() {
  stopDance();
  state.busy = true;
  state.clicks = [];
  clearTimeout(exprTimer);

  state.expr = 'shout';
  render();
  bubble(pick(window.LINES.mama).t, 20000);

  $pet.classList.remove('breathe', 'poke', 'dance');
  $pet.classList.add('rage');

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    $pet.classList.remove('rage');
    sulk();
  };

  audio.onended = release;
  // 音频缺失或解码失败时的兜底，避免永远卡在崩溃状态
  const guard = setTimeout(release, CFG.RAGE_FALLBACK_MS);
  audio.onerror = () => { clearTimeout(guard); release(); };

  try {
    audio.currentTime = 0;
    const p = audio.play();
    if (p && p.catch) p.catch(() => { clearTimeout(guard); release(); });
  } catch (_) {
    clearTimeout(guard);
    release();
  }
}

function sulk() {
  state.expr = 'sad';
  render();
  $pet.classList.add('sulk');
  bubble(pick(window.LINES.sulk).t, CFG.SULK_MS);
  setTimeout(() => {
    $pet.classList.remove('sulk');
    $pet.classList.add('breathe');
    state.busy = false;
    setExpr('normal');
  }, CFG.SULK_MS);
}

/* ---------------- 点击与拖动 ---------------- */

// 把点击位置换算成身体部位
function zoneAt(nx, ny) {
  if (state.display === 'body') {
    if (ny < 0.20) return 'head';
    if (ny < 0.33) return 'face';
    if (ny < 0.45) return nx > 0.3 && nx < 0.7 ? 'muzzle' : 'face';
    return 'body';
  }
  if (ny < 0.28) return 'head';
  if (ny < 0.55) return 'face';
  if (ny < 0.80) return nx > 0.28 && nx < 0.72 ? 'muzzle' : 'face';
  return 'body';
}

function onClick(ev) {
  if (state.busy) return;

  const t = now();
  state.clicks = state.clicks.filter((x) => t - x < CFG.RAGE_WINDOW);
  state.clicks.push(t);

  if (state.clicks.length >= CFG.RAGE_CLICKS) { rage(); return; }
  if (state.clicks.length === CFG.WARN_CLICKS) {
    say(pick(window.LINES.warn));
    flash('poke', 360);
    return;
  }

  const r = $img.getBoundingClientRect();
  const zone = zoneAt((ev.clientX - r.left) / r.width, (ev.clientY - r.top) / r.height);
  say(pick(window.LINES.touch[zone]));
  flash('poke', 360);
}

function stopDance() {
  clearTimeout(danceTimer);
  state.dancing = false;
  document.body.classList.toggle('bodymode', state.display === 'body');
  $pet.classList.remove('dance');
  render();
}

function dance() {
  if (state.busy) return;
  state.clicks = [];
  state.dancing = true;
  document.body.classList.add('bodymode');
  say(pick(window.LINES.dance));
  clearTimeout(danceTimer);
  $pet.classList.remove('breathe', 'poke');
  $pet.classList.add('dance');
  danceTimer = setTimeout(() => {
    stopDance();
    if (!state.busy) $pet.classList.add('breathe');
  }, 2600);
}

/* 命中判定：指针是不是真的压在牛（或气泡）上。
   按素材的 alpha 逐像素判断，牛脑袋两侧那些透明的边角不算数。
   file:// 画布可能被判定为跨源而读不出像素，那就退回矩形判定。 */
const hitTest = (function () {
  const cv = document.createElement('canvas');
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  const SAMPLE_W = 48;      // 判定用不着高分辨率，48px 宽足够且几乎不耗时
  let ready = false;

  $img.addEventListener('load', () => {
    ready = false;
    if (!$img.naturalWidth) return;
    cv.width = SAMPLE_W;
    cv.height = Math.max(1, Math.round(SAMPLE_W * $img.naturalHeight / $img.naturalWidth));
    try {
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.drawImage($img, 0, 0, cv.width, cv.height);
      ctx.getImageData(0, 0, 1, 1);      // 试读一次，确认画布没被污染
      ready = true;
    } catch (_) { ready = false; }
  });

  return function (x, y) {
    if (!$bubble.classList.contains('hidden')) {
      const b = $text.getBoundingClientRect();
      if (x >= b.left && x <= b.right && y >= b.top && y <= b.bottom) return true;
    }
    const r = $img.getBoundingClientRect();
    if (x < r.left || x > r.right || y < r.top || y > r.bottom) return false;
    if (!ready) return true;
    try {
      const px = Math.min(cv.width - 1, Math.floor((x - r.left) / r.width * cv.width));
      const py = Math.min(cv.height - 1, Math.floor((y - r.top) / r.height * cv.height));
      return ctx.getImageData(px, py, 1, 1).data[3] > 24;
    } catch (_) { return true; }
  };
})();

(function bindPointer() {
  let down = false, moved = false, sx = 0, sy = 0, lx = 0, ly = 0;
  let hovering = null;

  function setHover(over) {
    if (over === hovering) return;
    hovering = over;
    window.niulai.setHover(over);
  }

  function endDrag() {
    if (!down) return;
    down = false;
    $pet.classList.remove('dragging');
    if (moved) window.niulai.dragEnd();
    moved = false;
  }

  $pet.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    down = true; moved = false;
    sx = lx = e.screenX; sy = ly = e.screenY;
  });

  window.addEventListener('mousemove', (e) => {
    // 万一 mouseup 丢了（在穿透区域松的手、或指针跑出了窗口，事件被别的程序吃掉），
    // buttons === 0 说明按键其实早松开了。不兜这一下，牛来会永远粘在指针上。
    if (down && e.buttons === 0) endDrag();

    // 拖动期间窗口跟着指针走，命中判定会抖，直接锁定为「压着」
    setHover(down || hitTest(e.clientX, e.clientY));

    if (!down) return;
    if (!moved && Math.hypot(e.screenX - sx, e.screenY - sy) > CFG.DRAG_THRESHOLD) {
      moved = true;
      $pet.classList.add('dragging');
    }
    if (moved) {
      window.niulai.dragBy(e.screenX - lx, e.screenY - ly);
      lx = e.screenX; ly = e.screenY;
    }
  });

  // 指针整个移出窗口时不会再有 mousemove，得显式交还穿透
  document.addEventListener('mouseleave', () => { if (!down) setHover(false); });

  window.addEventListener('mouseup', (e) => {
    if (!down) return;
    const wasDrag = moved;
    endDrag();
    if (!wasDrag) onClick(e);
  });

  $pet.addEventListener('dblclick', dance);
  $pet.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    window.niulai.showMenu();
  });
})();

// 长播报看完了想立刻收掉，点一下气泡就行
$text.addEventListener('click', () => {
  clearTimeout(bubbleTimer);
  $bubble.classList.add('hidden');
});

/* ---------------- 自动行为 ---------------- */

function scheduleIdle() {
  clearTimeout(idleTimer);
  const wait = CFG.IDLE_MIN + Math.random() * (CFG.IDLE_MAX - CFG.IDLE_MIN);
  idleTimer = setTimeout(() => {
    if (!state.busy) {
      const pool = Math.random() < CFG.SNARK_RATE ? window.LINES.snark : window.LINES.idle;
      say(pick(pool), { auto: true });
    }
    scheduleIdle();
  }, wait);
}

// 整点报时
setInterval(() => {
  const h = new Date().getHours();
  if (h === state.lastHour) return;
  state.lastHour = h;
  if (state.busy) return;
  const line = window.LINES.hour[h];
  if (line) say(line, { auto: true });
}, 20000);

// 前台窗口 / 空闲时长（每 5 秒一次）
window.niulai.onForeground((d) => {
  state.fullscreen = !!d.full;

  // 久坐累计：一直在动就加，离开超过 3 分钟就清零
  const idle = typeof d.idle === 'number' ? d.idle : 999;
  if (idle < 30) state.workStreak += 5;
  else if (idle > 180) state.workStreak = 0;

  if (state.workStreak >= CFG.SIT_SECONDS) {
    state.workStreak = 0;
    if (!state.busy) say(pick(window.LINES.sit), { auto: true });
    return;
  }

  // 切换应用时的反应
  const proc = (d.proc || '').toLowerCase();
  if (proc === state.proc) return;
  state.proc = proc;
  if (state.busy) return;
  if (now() - state.lastProcTalk < CFG.PROC_COOLDOWN) return;

  const cat = window.PROC_MAP[proc];
  if (!cat) return;
  if (Math.random() > 0.5) return;   // 不是每次切换都吭声，否则太聒噪
  state.lastProcTalk = now();
  say(pick(window.LINES.proc[cat]), { auto: true });
});

// 托盘菜单指令
window.niulai.onCommand((c) => {
  if (c.type === 'mood') {
    if (state.busy) return;
    const pool = Math.random() < CFG.SNARK_RATE ? window.LINES.snark : window.LINES.idle;
    say(pick(pool));
  } else if (c.type === 'brief') {
    // 早晚播报。自动触发的受免打扰约束，从菜单点出来的不受
    if (state.busy) return;
    if (!c.manual && muted()) return;
    bubble(c.text, 22000, true);
    setExpr(c.expr || 'normal', 22000);
  } else if (c.type === 'talking') {
    // 聊天窗口在放语音，让牛来轻轻晃两下，声音才有着落
    $pet.classList.toggle('talking', !!c.on);
  } else if (c.type === 'expr') {
    // 聊天回答带回来的表情
    if (!state.busy) setExpr(c.value, 8000);
  } else if (c.type === 'mama') {
    // 菜单点播：走的是和狂点完全相同的那套演出
    if (!state.busy) rage();
  } else if (c.type === 'quiet') {
    state.quietUntil = c.until || 0;
    say({ t: state.quietUntil > now() ? '好，我闭嘴一小时。' : '我又回来啦！', e: state.quietUntil > now() ? 'sad' : 'happy' });
  } else if (c.type === 'display') {
    state.display = c.value;
    document.body.classList.toggle('bodymode', state.display === 'body');
    render();
  }
});

/* ---------------- 启动 ---------------- */

(async function boot() {
  const cfg = await window.niulai.getConfig();
  state.display = cfg.display || 'bust';
  state.quietUntil = cfg.quietUntil || 0;
  document.body.classList.toggle('bodymode', state.display === 'body');

  const placeholder = await window.Sprites.init();
  render();
  $pet.classList.add('breathe');
  scheduleIdle();

  setTimeout(() => {
    say(placeholder
      ? { t: '我先用草图站着——把设定稿放进 raw 就能换成真身。', e: 'surprise' }
      : { t: '牛来了。', e: 'happy' });
  }, 800);
})();
