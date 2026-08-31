'use strict';
/* 设置窗口和聊天窗口共用的桥。
   注意这里没有任何一个接口能把完整的 API key 取回渲染层 —— 只能写入、只能拿遮罩。 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('panel', {
  // --- 设置 ---
  getSettings: () => ipcRenderer.invoke('cfg:get'),
  saveSettings: (patch) => ipcRenderer.invoke('cfg:save', patch),
  setApiKey: (key) => ipcRenderer.invoke('cfg:set-key', key),
  clearApiKey: () => ipcRenderer.invoke('cfg:clear-key'),
  testKey: () => ipcRenderer.invoke('cfg:test-key'),
  searchCity: (name) => ipcRenderer.invoke('cfg:search-city', name),
  pickCclock: () => ipcRenderer.invoke('cfg:pick-cclock'),
  peekAgenda: () => ipcRenderer.invoke('cfg:peek-agenda'),
  previewBriefing: (kind) => ipcRenderer.invoke('cfg:preview-briefing', kind),

  // --- 聊天 ---
  history: () => ipcRenderer.invoke('chat:history'),
  clearHistory: () => ipcRenderer.invoke('chat:clear'),
  send: (text) => ipcRenderer.invoke('chat:send', text),
  abort: () => ipcRenderer.send('chat:abort'),
  onDelta: (fn) => ipcRenderer.on('chat:delta', (_e, d) => fn(d)),

  // --- 语音 ---
  ttsConfig: () => ipcRenderer.invoke('tts:config'),
  speak: (text, override) => ipcRenderer.invoke('tts:speak', { text, override }),
  ttsPlaying: (on) => ipcRenderer.send('tts:playing', on),

  // --- 通用 ---
  close: () => ipcRenderer.send('panel:close'),
});
