'use strict';

const $ = (id) => document.getElementById(id);
const P = window.panel;

let cfg = null;

function note(el, text, kind) {
  el.textContent = text || '';
  el.className = 'note ' + (kind || 'dim');
}

/* 设置项即改即存：这个窗口没有"保存"按钮，关掉就是关掉 */
function autosave(el, key, read) {
  const commit = () => P.saveSettings({ [key]: read() });
  el.addEventListener('change', commit);
}

async function load() {
  cfg = await P.getSettings();

  $('key-state').textContent = cfg.hasKey ? '已设置 ' + cfg.keyMask : '未设置';
  $('model').value = cfg.model || 'deepseek-chat';
  if (!cfg.encAvailable) {
    note($('key-note'), '这台机器上系统加密不可用，key 只能明文存放。请自行斟酌。', 'bad');
  }

  if (cfg.city) {
    $('city-input').value = cfg.city.name;
    note($('city-note'), `当前：${cfg.city.name}（${cfg.city.lat.toFixed(2)}, ${cfg.city.lon.toFixed(2)}）`, 'ok');
  } else {
    note($('city-note'), '还没设城市，天气播报不会出现。', 'dim');
  }

  const t = cfg.tts || {};
  $('tts-on').checked = !!t.on;
  $('tts-voice').value = t.voice || 'zh-CN-YunxiaNeural';
  $('tts-pitch').value = t.pitch === undefined ? -20 : t.pitch;
  $('tts-rate').value = t.rate === undefined ? -8 : t.rate;

  $('cclock-path').value = cfg.cclockPath || '';
  $('cclock-path').placeholder = cfg.cclockDetected || '没自动探测到';
  $('lead-days').value = cfg.leadDays;
  $('morning-on').checked = !!cfg.morning.on;
  $('morning-time').value = cfg.morning.time;
  $('evening-on').checked = !!cfg.evening.on;
  $('evening-time').value = cfg.evening.time;
}

/* ---- API key ---- */
$('key-save').addEventListener('click', async () => {
  const v = $('apikey').value.trim();
  if (!v) { note($('key-note'), '先把 key 填进去。', 'bad'); return; }
  const r = await P.setApiKey(v);
  $('apikey').value = '';
  $('key-state').textContent = '已设置 ' + r.mask;
  note($('key-note'), '存好了。可以点「测试连接」验一下。', 'ok');
});

$('key-clear').addEventListener('click', async () => {
  await P.clearApiKey();
  $('apikey').value = '';
  $('key-state').textContent = '未设置';
  note($('key-note'), '已清除。', 'dim');
});

$('key-test').addEventListener('click', async () => {
  const btn = $('key-test');
  btn.disabled = true;
  note($('key-note'), '正在连…', 'dim');
  const r = await P.testKey();
  note($('key-note'), r.ok ? '通了，可以聊了。' : r.error, r.ok ? 'ok' : 'bad');
  btn.disabled = false;
});

autosave($('model'), 'model', () => $('model').value);

/* ---- 声音 ---- */
function ttsPatch() {
  return {
    on: $('tts-on').checked,
    voice: $('tts-voice').value,
    pitch: parseInt($('tts-pitch').value, 10) || 0,
    rate: parseInt($('tts-rate').value, 10) || 0,
  };
}
['tts-on', 'tts-voice', 'tts-pitch', 'tts-rate'].forEach((id) => {
  $(id).addEventListener('change', () => P.saveSettings({ tts: ttsPatch() }));
});

let trying = null;
$('tts-try').addEventListener('click', async () => {
  const btn = $('tts-try');
  btn.disabled = true;
  note($('tts-note'), '合成中…', 'dim');
  // 试听用界面上当前的值，不必先保存
  const r = await P.speak('哞——我是牛来。又加班啊，我陪你。', ttsPatch());
  btn.disabled = false;
  if (!r.ok) { note($('tts-note'), '出不了声：' + r.error, 'bad'); return; }
  note($('tts-note'), '正在放…', 'ok');
  try {
    if (trying) trying.pause();
    trying = new Audio('data:audio/mpeg;base64,' + r.b64);
    trying.addEventListener('ended', () => note($('tts-note'), '', 'dim'));
    await trying.play();
  } catch (e) { note($('tts-note'), '放不出来：' + e.message, 'bad'); }
});

/* ---- 城市 ---- */
async function doSearch() {
  const name = $('city-input').value.trim();
  if (!name) return;
  const box = $('city-list');
  note($('city-note'), '搜索中…', 'dim');
  const r = await P.searchCity(name);
  if (!r.ok) { note($('city-note'), r.error, 'bad'); return; }
  if (!r.list.length) { note($('city-note'), '没搜到这个地方，换个写法试试。', 'bad'); box.hidden = true; return; }

  box.innerHTML = '';
  r.list.forEach((c) => {
    const d = document.createElement('div');
    d.textContent = c.name;
    const s = document.createElement('small');
    s.textContent = c.detail;
    d.appendChild(s);
    d.addEventListener('click', async () => {
      await P.saveSettings({ city: { name: c.name, lat: c.lat, lon: c.lon } });
      $('city-input').value = c.name;
      box.hidden = true;
      note($('city-note'), `已选定：${c.name} · ${c.detail}`, 'ok');
    });
    box.appendChild(d);
  });
  box.hidden = false;
  note($('city-note'), '点一条选中。', 'dim');
}

$('city-search').addEventListener('click', doSearch);
$('city-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });

/* ---- 日程 ---- */
autosave($('cclock-path'), 'cclockPath', () => $('cclock-path').value.trim());
autosave($('lead-days'), 'leadDays', () => parseInt($('lead-days').value, 10) || 7);

$('cclock-pick').addEventListener('click', async () => {
  const r = await P.pickCclock();
  if (r.path) {
    $('cclock-path').value = r.path;
    await P.saveSettings({ cclockPath: r.path });
    note($('agenda-note'), '已指定。', 'ok');
  }
});

$('agenda-peek').addEventListener('click', async () => {
  const r = await P.peekAgenda();
  if (!r.ok) { note($('agenda-note'), r.reason, 'bad'); return; }
  if (!r.items.length) {
    note($('agenda-note'), `读到了文件，但这 ${$('lead-days').value} 天内没有带日期的未完成待办。`, 'dim');
    return;
  }
  note($('agenda-note'), '读到 ' + r.items.length + ' 条：' + r.items.map((t) => t.line).join('；'), 'ok');
});

/* ---- 播报 ---- */
autosave($('morning-on'), 'morning', () => ({ on: $('morning-on').checked, time: $('morning-time').value }));
autosave($('morning-time'), 'morning', () => ({ on: $('morning-on').checked, time: $('morning-time').value }));
autosave($('evening-on'), 'evening', () => ({ on: $('evening-on').checked, time: $('evening-time').value }));
autosave($('evening-time'), 'evening', () => ({ on: $('evening-on').checked, time: $('evening-time').value }));

async function preview(kind) {
  const box = $('preview');
  box.hidden = false;
  box.textContent = '正在查…';
  const r = await P.previewBriefing(kind);
  box.textContent = r.text;
}
$('preview-morning').addEventListener('click', () => preview('morning'));
$('preview-evening').addEventListener('click', () => preview('evening'));

$('close').addEventListener('click', () => P.close());

load();
