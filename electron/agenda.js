'use strict';
/* 日程：读 Cclock（桌面时钟悬浮窗）的待办数据。

   只读，绝不写回 —— 那是另一个程序的数据，牛来没有资格改它。
   Cclock 落盘用的是「写临时文件 + 原子重命名」，所以我们每次重新读整个文件，
   读到的要么是改动前的完整版本，要么是改动后的完整版本，不会读到写了一半的内容。

   Cclock 的待办结构里没有「提前几天准备」这种字段，
   所以「需要提前准备」是这里根据剩余天数推断出来的。 */

const fs = require('fs');
const path = require('path');

function candidatePaths(appDataDir) {
  return [
    path.join(appDataDir, 'Cclock', 'data.json'),
    path.join(appDataDir, '桌面时钟', 'data.json'),   // Cclock 改名前的旧目录
  ];
}

/** 自动探测 Cclock 的数据文件；找不到返回 null */
function detectPath(appDataDir) {
  return candidatePaths(appDataDir).find((p) => fs.existsSync(p)) || null;
}

function ymd(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function dayOffset(dateStr, todayStr) {
  // 只比日期不比时间，用 UTC 构造避免夏令时/时区把天数算歪
  const a = Date.parse(dateStr + 'T00:00:00Z');
  const b = Date.parse(todayStr + 'T00:00:00Z');
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((a - b) / 86400000);
}

/**
 * 读出未来 leadDays 天内、尚未完成、且带日期的待办。
 * 返回 { ok, reason?, path, items: [{ title, date, time, days }] }
 * days: 0=今天, 1=明天, 2=后天 ...
 */
function upcoming(filePath, leadDays) {
  if (!filePath) {
    return { ok: false, reason: '没找到 Cclock 的数据文件，可能是还没装或没用过。', items: [] };
  }
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    return { ok: false, reason: '读不了 Cclock 的数据文件：' + e.code, path: filePath, items: [] };
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch (_) {
    return { ok: false, reason: 'Cclock 的数据文件解析失败。', path: filePath, items: [] };
  }

  const todayStr = ymd(new Date());
  const span = Math.max(1, leadDays || 7);
  const items = (Array.isArray(data.todos) ? data.todos : [])
    .filter((t) => t && typeof t.title === 'string' && t.date && !t.done)
    .map((t) => ({
      title: String(t.title),
      date: t.date,
      time: typeof t.time === 'string' ? t.time : null,
      days: dayOffset(t.date, todayStr),
    }))
    .filter((t) => t.days !== null && t.days >= 0 && t.days <= span)
    .sort((a, b) => (a.days - b.days) || String(a.time || '99:99').localeCompare(b.time || '99:99'));

  return { ok: true, path: filePath, items };
}

const DAY_WORD = ['今天', '明天', '后天'];

function whenWord(days) {
  return DAY_WORD[days] || `${days} 天后`;
}

/** 把一条日程说成一句话 */
function line(item) {
  const t = item.time ? item.time + ' ' : '';
  return `${whenWord(item.days)} ${t}${item.title}`;
}

/**
 * 挑出「该提前准备」的：3 天内的都算，越近越急。
 * 今天和明天的单独拎出来，因为那已经不是准备、是马上要发生了。
 */
function split(items) {
  return {
    imminent: items.filter((t) => t.days <= 1),
    prepare: items.filter((t) => t.days >= 2 && t.days <= 3),
    later: items.filter((t) => t.days > 3),
  };
}

module.exports = { detectPath, candidatePaths, upcoming, line, whenWord, split };
