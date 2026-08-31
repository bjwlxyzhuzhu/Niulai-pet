'use strict';
/* 语音合成：走微软 Edge 浏览器「朗读」功能背后的那个免费接口。

   为什么是它：这台机器上 SAPI、OneCore、WinRT 三套系统语音库全是空的，
   系统自带的语音合成根本用不了；而离线方案（Piper）要多背 82MB，
   中文还只有一个女声音色，凑不出「男童」。
   Edge 这个接口零嵌入体积、不要 key，而且 zh-CN-YunxiaNeural 本身
   就是微软定位的男童音，再把音高压下去就是要的那个「低沉」。

   代价要清楚：这是 Edge 朗读用的非公开接口，微软改了就会失效 ——
   所以所有失败路径都必须安静降级成「只显示文字」，绝不能让聊天卡住。

   隐私：只有你在聊天窗口里收到的回复文本会送到这里合成。
   早晚播报（含日程）刻意不朗读，一个字都不外发。 */

const crypto = require('crypto');
const WebSocket = require('ws');

const TRUSTED_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const WSS = 'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1';

// 服务端会校验这个版本号，写旧了直接 403（实测 130 已经被拒）。
// 接口哪天又收紧了，先来这里对着 edge-tts 的 constants.py 更新版本号。
const CHROMIUM_VERSION = '143.0.3650.75';
const CHROMIUM_MAJOR = CHROMIUM_VERSION.split('.')[0];
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) '
  + `Chrome/${CHROMIUM_MAJOR}.0.0.0 Safari/537.36 Edg/${CHROMIUM_MAJOR}.0.0.0`;
const WIN_EPOCH = 11644473600;      // 1601-01-01 到 1970-01-01 的秒数

// 接口要求带一个按当前时间算出来的校验串，每 5 分钟变一次
function gecToken(skewSec) {
  let ticks = Math.floor(Date.now() / 1000) + (skewSec || 0) + WIN_EPOCH;
  ticks -= ticks % 300;
  const ns = BigInt(ticks) * 10000000n;
  return crypto.createHash('sha256')
    .update(ns.toString() + TRUSTED_TOKEN, 'ascii')
    .digest('hex').toUpperCase();
}

function stamp() {
  return new Date().toString().replace(/GMT.*$/, 'GMT+0000 (Coordinated Universal Time)');
}

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function buildSSML(text, opt) {
  const voice = opt.voice || 'zh-CN-YunxiaNeural';
  const pitch = opt.pitch === undefined ? -18 : opt.pitch;   // 负数压低，做「低沉」
  const rate = opt.rate === undefined ? -8 : opt.rate;       // 稍慢一点，憨厚
  const sign = (n) => (n >= 0 ? '+' : '') + n + '%';
  return `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='zh-CN'>`
    + `<voice name='${voice}'>`
    + `<prosody pitch='${sign(pitch)}' rate='${sign(rate)}' volume='+0%'>${esc(text)}</prosody>`
    + `</voice></speak>`;
}

/**
 * 合成一段文本，resolve 成 mp3 的 Buffer。
 * 任何失败都 reject，调用方负责安静降级。
 */
function synthesize(text, opt) {
  const o = opt || {};
  const clean = String(text || '').trim();
  if (!clean) return Promise.reject(new Error('没有可朗读的内容'));
  // 别把超长回答整段送出去，也免得合成等太久
  const payload = clean.length > 600 ? clean.slice(0, 600) : clean;

  return new Promise((resolve, reject) => {
    const url = `${WSS}?TrustedClientToken=${TRUSTED_TOKEN}`
      + `&Sec-MS-GEC=${gecToken(o.skew)}&Sec-MS-GEC-Version=1-${CHROMIUM_VERSION}`;

    let ws;
    try {
      ws = new WebSocket(url, {
        headers: {
          Pragma: 'no-cache',
          'Cache-Control': 'no-cache',
          Origin: 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
          'Sec-WebSocket-Version': '13',
          'Accept-Encoding': 'gzip, deflate, br, zstd',
          'Accept-Language': 'en-US,en;q=0.9',
          'User-Agent': UA,
        },
        handshakeTimeout: 10000,
      });
    } catch (e) { return reject(e); }

    const chunks = [];
    let settled = false;
    const finish = (err, buf) => {
      if (settled) return;
      settled = true;
      clearTimeout(guard);
      try { ws.close(); } catch (_) { /* 已经关了 */ }
      err ? reject(err) : resolve(buf);
    };
    const guard = setTimeout(() => finish(new Error('语音合成超时')), 20000);

    ws.on('open', () => {
      ws.send(
        `X-Timestamp:${stamp()}\r\n`
        + 'Content-Type:application/json; charset=utf-8\r\n'
        + 'Path:speech.config\r\n\r\n'
        + '{"context":{"synthesis":{"audio":{"metadataoptions":{'
        + '"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},'
        + '"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}'
      );
      ws.send(
        `X-RequestId:${crypto.randomBytes(16).toString('hex')}\r\n`
        + 'Content-Type:application/ssml+xml\r\n'
        + `X-Timestamp:${stamp()}Z\r\n`
        + 'Path:ssml\r\n\r\n'
        + buildSSML(payload, o)
      );
    });

    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        // 二进制帧：前两字节是大端的头部长度，头里写明 Path:audio 才是音频
        const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
        if (buf.length < 2) return;
        const headLen = buf.readUInt16BE(0);
        const head = buf.slice(2, 2 + headLen).toString('utf8');
        if (head.includes('Path:audio')) chunks.push(buf.slice(2 + headLen));
        return;
      }
      const text = data.toString();
      if (text.includes('Path:turn.end')) {
        if (!chunks.length) return finish(new Error('接口没有返回音频'));
        finish(null, Buffer.concat(chunks));
      }
    });

    ws.on('error', (e) => finish(e));
    ws.on('close', (code) => {
      if (settled) return;
      if (chunks.length) return finish(null, Buffer.concat(chunks));
      finish(new Error('连接被关闭（' + code + '）'));
    });
  });
}

/**
 * 带一次时钟纠偏的重试：接口的校验串和时间绑定，
 * 本机时钟偏几分钟就会被拒。第一次失败时退回上一个 5 分钟窗口再试一次。
 */
async function speak(text, opt) {
  try {
    return await synthesize(text, opt);
  } catch (e) {
    return await synthesize(text, Object.assign({}, opt, { skew: -300 }));
  }
}

module.exports = { speak, synthesize, buildSSML };
