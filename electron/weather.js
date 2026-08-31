'use strict';
/* 天气：Open-Meteo。免费、无需 API key、不需要注册。
   两个接口都在主进程里调，渲染层不碰网络。 */

const GEO_API = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_API = 'https://api.open-meteo.com/v1/forecast';

// WMO 天气代码 -> 中文。Open-Meteo 返回的是数字代码，没有现成的中文描述。
const WMO = {
  0: '晴', 1: '大部晴朗', 2: '多云', 3: '阴',
  45: '有雾', 48: '雾凇',
  51: '毛毛雨', 53: '毛毛雨', 55: '较大毛毛雨',
  56: '冻毛毛雨', 57: '冻毛毛雨',
  61: '小雨', 63: '中雨', 65: '大雨',
  66: '冻雨', 67: '冻雨',
  71: '小雪', 73: '中雪', 75: '大雪', 77: '米雪',
  80: '阵雨', 81: '阵雨', 82: '强阵雨',
  85: '阵雪', 86: '强阵雪',
  95: '雷阵雨', 96: '雷阵雨伴冰雹', 99: '雷阵雨伴冰雹',
};

const RAINY = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99]);
const SNOWY = new Set([71, 73, 75, 77, 85, 86]);

function describe(code) {
  return WMO[code] || '说不好的天气';
}

async function getJSON(url, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs || 10000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function searchOnce(name) {
  const url = `${GEO_API}?name=${encodeURIComponent(name)}&count=10&language=zh&format=json`;
  const data = await getJSON(url);
  return (data.results || []).map((r) => ({
    name: r.name,
    lat: r.latitude,
    lon: r.longitude,
    pop: r.population || 0,
    // 地名是否就是它所属地级市的名字 —— 地级市驻地会自我匹配，同名村镇不会。
    // 人口字段在国内很多条目上是 0，光靠人口排不出来，得靠这个补。
    seat: !!(r.admin2 && (r.admin2 === r.name || r.admin2.startsWith(r.name))),
    // 拼一个能区分同名地点的说明，比如「宝鸡市 · 陕西 · 中国」
    detail: [r.admin2, r.admin1, r.country].filter(Boolean).join(' · '),
  }));
}

/**
 * 城市名 -> 候选地点列表，供设置界面挑选。
 *
 * Open-Meteo 的索引里「宝鸡」和「宝鸡市」是两条不同的记录：
 * 只搜「宝鸡」会命中广西钦州下面一个同名村子，地级市根本不出现。
 * 所以这里把带「市」和不带「市」的写法都搜一遍再合并去重。
 *
 * 排序先看是不是地级市驻地、再看人口：国内很多条目的人口字段是 0
 * （「宝鸡」和「宝鸡市」两条都是 0），光靠人口分不出胜负。
 */
async function searchCity(name) {
  const q = String(name || '').trim();
  if (!q) return [];

  const variants = new Set([q]);
  if (/[一-龥]$/.test(q)) {
    if (/[市县区]$/.test(q)) variants.add(q.slice(0, -1));
    else variants.add(q + '市');
  }

  const lists = await Promise.all([...variants].map((v) => searchOnce(v).catch(() => [])));

  const seen = new Map();
  for (const list of lists) {
    for (const r of list) {
      const key = r.lat.toFixed(3) + ',' + r.lon.toFixed(3);
      if (!seen.has(key)) seen.set(key, r);
    }
  }
  return [...seen.values()]
    .sort((a, b) => (Number(b.seat) - Number(a.seat)) || (b.pop - a.pop))
    .slice(0, 10);
}

/**
 * 取今明两天的预报。
 * 返回 { today, tomorrow }，每项 { date, code, text, max, min, pop, rainy, snowy }
 */
async function forecast(lat, lon) {
  const url = `${FORECAST_API}?latitude=${lat}&longitude=${lon}`
    + '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max'
    + '&timezone=auto&forecast_days=2';
  const d = await getJSON(url);
  const daily = d.daily || {};
  const pick = (i) => {
    if (!daily.time || daily.time[i] === undefined) return null;
    const code = daily.weather_code[i];
    return {
      date: daily.time[i],
      code,
      text: describe(code),
      max: Math.round(daily.temperature_2m_max[i]),
      min: Math.round(daily.temperature_2m_min[i]),
      pop: daily.precipitation_probability_max ? daily.precipitation_probability_max[i] : null,
      rainy: RAINY.has(code),
      snowy: SNOWY.has(code),
    };
  };
  return { today: pick(0), tomorrow: pick(1) };
}

/** 把一天的预报说成一句人话，带上该带伞该加衣这类建议 */
function sentence(day, label) {
  if (!day) return null;
  const bits = [`${label}${day.text}，${day.min}~${day.max}℃`];
  const tips = [];
  if (day.snowy) tips.push('会下雪，路上小心');
  else if (day.rainy || (day.pop !== null && day.pop >= 60)) tips.push('记得带伞');
  if (day.min <= 5) tips.push('挺冷的，多穿点');
  else if (day.max - day.min >= 12) tips.push('温差大，加件外套');
  else if (day.max >= 33) tips.push('挺热的，别中暑');
  if (tips.length) bits.push(tips.join('，'));
  return bits.join('。') + '。';
}

module.exports = { searchCity, forecast, sentence, describe };
