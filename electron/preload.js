'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('niulai', {
  // 主进程 -> 渲染层
  onForeground: (fn) => ipcRenderer.on('foreground', (_e, d) => fn(d)),
  onCommand: (fn) => ipcRenderer.on('command', (_e, d) => fn(d)),

  // 渲染层 -> 主进程
  dragBy: (dx, dy) => ipcRenderer.send('drag-by', { dx, dy }),
  dragEnd: () => ipcRenderer.send('drag-end'),
  showMenu: () => ipcRenderer.send('show-menu'),
  setHover: (over) => ipcRenderer.send('set-hover', over),
  getConfig: () => ipcRenderer.invoke('get-config'),
  setConfig: (k, v) => ipcRenderer.invoke('set-config', { k, v }),
  listSprites: () => ipcRenderer.invoke('list-sprites'),
});
