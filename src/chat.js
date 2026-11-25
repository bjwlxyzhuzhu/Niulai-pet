'use strict';

const P = window.panel;
const $log = document.getElementById('log');
const $input = document.getElementById('input');
const $send = document.getElementById('send');

let ttsOn = true;
let audio = null;       // 同一时刻只让一段语音在响
let streaming = null;   // 正在接收的那个气泡元素
let streamBuf = '';
let busy = false;

// 回答末尾会带一个 [表情:xx] 标记给桌宠用。流式过程中它会一个字一个字冒出来，
// 所以渲染前先把结尾处「已经成形或正在成形」的标记抹掉。
function stripTag(t) {
  return t.replace(/\n*\[(表?(情?(\s*[:：][^\]]*)?)?)?\]?\s*$/, '');
}

function atBottom() {
  return $log.scrollHeight - $log.scrollTop - $log.clientHeight < 60;
}

function scroll(force) {
  if (force || atBottom()) $log.scrollTop = $log.scrollHeight;
}

function bubble(kind, text) {
  const d = document.createElement('div');
  d.className = 'msg ' + kind;
  d.textContent = text || '';
  // 牛来说的话都能点一下重听
  if (kind === 'cow') {
    d.title = '点一下重听';
    d.addEventListener('click', () => { if (d.textContent) play(d.textContent); });
  }
  $log.appendChild(d);
  scroll(true);
  return d;
}

/* 朗读。合成走主进程，这里只负责放。
   接口是微软非公开的，失败就安静算了 —— 文字已经在眼前，不该为了没声音弹个错误。 */
async function play(text) {
  if (!ttsOn || !text) return;
  stopAudio();
  const r = await P.speak(text);
  if (!ttsOn) return;
  if (!r.ok) {
    if (await window.localSpeak(text, () => P.ttsPlaying(false))) P.ttsPlaying(true);
    else $speak.title = '没有可用的语音：Edge 朗读连不上，系统也没装中文语音';
    return;
  }
  try {
    audio = new Audio('data:audio/mpeg;base64,' + r.b64);
    audio.addEventListener('ended', () => { P.ttsPlaying(false); audio = null; });
    audio.addEventListener('error', () => { P.ttsPlaying(false); audio = null; });
    P.ttsPlaying(true);
    await audio.play();
  } catch (_) {
    P.ttsPlaying(false);
    audio = null;
  }
}

function stopAudio() {
  if (window.speechSynthesis && speechSynthesis.speaking) { speechSynthesis.cancel(); P.ttsPlaying(false); }
  if (!audio) return;
  try { audio.pause(); } catch (_) { /* 已经停了 */ }
  audio = null;
  P.ttsPlaying(false);
}

function showEmpty() {
  const d = document.createElement('div');
  d.className = 'empty';
  d.textContent = '还没聊过。\n它知道自己是一只牛，别的不太懂。';
  $log.appendChild(d);
}

function clearEmpty() {
  const e = $log.querySelector('.empty');
  if (e) e.remove();
}

async function load() {
  const h = await P.history();
  if (!h.length) { showEmpty(); return; }
  h.forEach((m) => bubble(m.role === 'user' ? 'me' : 'cow', m.content));
  scroll(true);
}

async function send() {
  const text = $input.value.trim();
  if (!text || busy) return;

  clearEmpty();
  $input.value = '';
  $input.style.height = '40px';
  bubble('me', text);

  busy = true;
  $send.disabled = true;
  streamBuf = '';
  streaming = bubble('cow', '');
  streaming.classList.add('typing');

  const r = await P.send(text);

  streaming.classList.remove('typing');
  if (!r.ok) {
    // 一个字都没吐出来就失败了，空气泡留着没意义
    if (!streaming.textContent) streaming.remove();
    bubble('err', r.error);
  } else {
    // 用主进程摘干净的版本盖一遍，保证标记不残留
    streaming.textContent = r.text || '（它没说话）';
    play(streaming.textContent);
  }
  streaming = null;
  busy = false;
  $send.disabled = false;
  $input.focus();
}

P.onDelta((piece) => {
  if (!streaming) return;
  streamBuf += piece;
  streaming.textContent = stripTag(streamBuf);
  scroll(false);
});

$send.addEventListener('click', send);

$input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
});

// 输入框随内容长高，到 120px 封顶
$input.addEventListener('input', () => {
  $input.style.height = '40px';
  $input.style.height = Math.min(120, $input.scrollHeight) + 'px';
});

const $speak = document.getElementById('speak');
$speak.addEventListener('click', async () => {
  ttsOn = !ttsOn;
  if (!ttsOn) stopAudio();
  paintSpeakBtn();
  // 落盘，下次开窗口还记得。音色那些参数原样带回去，别被覆盖掉
  const c = (await P.ttsConfig()) || {};
  c.on = ttsOn;
  await P.saveSettings({ tts: c });
});

function paintSpeakBtn() {
  $speak.textContent = ttsOn ? '🔊 朗读' : '🔇 静音';
  $speak.classList.toggle('primary', ttsOn);
}

document.getElementById('clear').addEventListener('click', async () => {
  await P.clearHistory();
  $log.innerHTML = '';
  showEmpty();
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { stopAudio(); P.close(); }
});

(async () => {
  const c = await P.ttsConfig();
  ttsOn = !!(c && c.on);
  paintSpeakBtn();
})();

load();
$input.focus();
