'use strict';
/* 把天气和日程拼成牛来会说的话。

   这一段刻意不走 DeepSeek：播报必须在没配 API key、或者网络/额度出问题时
   照样能用。而且日程内容是你的私事，不该为了措辞好听就发到别人的服务器上去。 */

const weather = require('./weather');
const agenda = require('./agenda');

async function build(kind, cfg, appDataDir) {
  const forTomorrow = kind === 'evening';
  const parts = [];
  let expr = 'normal';

  // ---- 天气 ----
  const city = cfg.city;
  if (city && city.lat !== undefined) {
    try {
      const f = await weather.forecast(city.lat, city.lon);
      const day = forTomorrow ? f.tomorrow : f.today;
      const s = weather.sentence(day, forTomorrow ? '明天' : '今天');
      if (s) {
        parts.push(s);
        if (day.rainy || day.snowy) expr = 'surprise';
      }
    } catch (e) {
      parts.push('天气没查着，网络好像不太顺。');
      expr = 'sad';
    }
  }

  // ---- 日程 ----
  const file = cfg.cclockPath || agenda.detectPath(appDataDir);
  const res = agenda.upcoming(file, cfg.leadDays);

  if (res.ok) {
    const groups = agenda.split(res.items);
    const focus = forTomorrow
      ? res.items.filter((t) => t.days === 1)
      : res.items.filter((t) => t.days === 0);

    if (focus.length) {
      const when = forTomorrow ? '明天' : '今天';
      const list = focus.map((t) => (t.time ? t.time + ' ' : '') + t.title).join('、');
      parts.push(`${when}有 ${focus.length} 件事：${list}。`);
      expr = focus.length >= 3 ? 'surprise' : expr;
    } else if (forTomorrow) {
      parts.push('明天日历上是空的，能喘口气。');
      if (expr === 'normal') expr = 'happy';
    }

    // 还没到跟前、但该动手准备的
    const prep = groups.prepare.filter((t) => !focus.includes(t));
    if (prep.length) {
      parts.push(`${prep.map(agenda.line).join('；')} —— 这个该开始准备了。`);
      expr = 'surprise';
    }
    const later = groups.later;
    if (later.length) {
      parts.push(`再往后还有：${later.map(agenda.line).join('；')}。`);
    }
  } else if (cfg.agendaEnabled !== false && file) {
    parts.push(res.reason);
  }

  if (!parts.length) {
    return { text: forTomorrow ? '明天没什么特别的，早点休息。' : '今天没什么特别的，慢慢来。', expr: 'happy' };
  }

  const head = forTomorrow ? '给你说说明天：' : '早啊，今天这样：';
  return { text: head + '\n' + parts.join('\n'), expr };
}

module.exports = { build };
