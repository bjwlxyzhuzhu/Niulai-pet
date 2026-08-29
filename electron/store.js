'use strict';
const fs = require('fs');
const path = require('path');

// 极简 JSON 配置存储：位置、心情、安静模式截止时间、显示模式
class Store {
  constructor(dir, defaults) {
    this.file = path.join(dir, 'niulai-config.json');
    this.data = Object.assign({}, defaults);
    try {
      const raw = fs.readFileSync(this.file, 'utf8');
      Object.assign(this.data, JSON.parse(raw));
    } catch (_) { /* 首次启动或文件损坏，用默认值 */ }
  }
  get(key) { return this.data[key]; }
  set(key, value) {
    this.data[key] = value;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2), 'utf8');
    } catch (e) { console.error('[store] 写入失败', e.message); }
  }
}

module.exports = { Store };
