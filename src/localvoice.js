'use strict';
/* Edge 朗读不可用时的退路：系统自带的中文语音，压低音高。没有中文语音就返回 false。 */
window.localSpeak = async function (text, onEnd) {
  const s = window.speechSynthesis;
  if (!s) return false;
  let v = s.getVoices();
  if (!v.length) {
    await new Promise((r) => { s.onvoiceschanged = r; setTimeout(r, 1500); });
    v = s.getVoices();
  }
  const zh = v.filter((x) => /^(zh|cmn)/i.test(x.lang) && x.localService);
  if (!zh.length) return false;
  const u = new SpeechSynthesisUtterance(text);
  u.voice = zh.find((x) => /kangkang|yunxi|yunjian/i.test(x.name)) || zh.find((x) => /cn/i.test(x.lang)) || zh[0];
  u.lang = u.voice.lang; u.pitch = 0.6; u.rate = 0.95;
  u.onend = u.onerror = () => onEnd && onEnd();
  s.cancel(); s.speak(u);
  return true;
};
