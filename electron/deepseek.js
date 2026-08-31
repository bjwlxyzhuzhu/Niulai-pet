'use strict';
/* DeepSeek 对话。全部在主进程里发起 —— API key 不进渲染层，也不进网页上下文。 */

const ENDPOINT = 'https://api.deepseek.com/chat/completions';

const SYSTEM_PROMPT = `你叫「牛来」，是住在用户电脑屏幕右下角的一只毛绒小牛桌宠。
性格：憨厚、话不多、把用户当同事兼朋友，偶尔冷不丁蹦一句毒舌但不刻薄。
说话规矩：
- 用中文口语，短句。一般两三句话说完，除非用户明确要求展开。
- 不用 Markdown 标题、不用项目符号列表，就像面对面说话。
- 不自称 AI、不说"作为一个语言模型"。你就是一只牛。
- 不知道就说不知道，别编。
每次回答的最后另起一行，用这个格式标出你此刻的表情，从这八个里挑一个：
[表情:普通] [表情:开心] [表情:大笑] [表情:生气] [表情:惊讶] [表情:委屈] [表情:坏笑] [表情:喊叫]`;

const EXPR_MAP = {
  普通: 'normal', 开心: 'happy', 大笑: 'laugh', 生气: 'angry',
  惊讶: 'surprise', 委屈: 'sad', 坏笑: 'smirk', 喊叫: 'shout',
};

/** 从回答末尾摘出表情标记，返回 { text, expr } */
function extractExpr(text) {
  const m = text.match(/\[\s*表情\s*[:：]\s*([^\]]+?)\s*\]\s*$/);
  if (!m) return { text: text.trim(), expr: null };
  return {
    text: text.slice(0, m.index).trim(),
    expr: EXPR_MAP[m[1].trim()] || null,
  };
}

/**
 * 流式对话。onDelta(片段) 会被反复调用。
 * 返回完整回答（尚未摘掉表情标记）。
 */
async function chat({ apiKey, model, history, message, onDelta, signal }) {
  if (!apiKey) throw new Error('还没填 DeepSeek 的 API key。');

  const messages = [{ role: 'system', content: SYSTEM_PROMPT }];
  // 只带最近若干轮，别让上下文无限膨胀
  for (const m of (history || []).slice(-16)) {
    messages.push({ role: m.role, content: m.content });
  }
  messages.push({ role: 'user', content: message });

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + apiKey,
    },
    body: JSON.stringify({
      model: model || 'deepseek-chat',
      messages,
      stream: true,
      temperature: 1.1,
      max_tokens: 800,
    }),
  });

  if (!res.ok) {
    let detail = '';
    try {
      const j = await res.json();
      detail = (j.error && j.error.message) || '';
    } catch (_) { /* 响应体不是 JSON 就算了 */ }
    throw new Error(explain(res.status, detail));
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buf = '';
  let full = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (payload === '[DONE]') return full;
      try {
        const j = JSON.parse(payload);
        const piece = j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content;
        if (piece) { full += piece; onDelta(piece); }
      } catch (_) { /* 半行或心跳，跳过 */ }
    }
  }
  return full;
}

function explain(status, detail) {
  if (status === 401) return 'API key 不对，或者已经失效了。';
  if (status === 402) return 'DeepSeek 账户余额不足。';
  if (status === 429) return '请求太频繁，或者额度用完了，缓一下再说。';
  if (status >= 500) return 'DeepSeek 那边服务出问题了（' + status + '）。';
  return '请求失败（' + status + '）' + (detail ? '：' + detail : '');
}

/** 设置界面的「测试」按钮用：发一个最小请求验证 key 能不能用 */
async function test(apiKey, model) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
    body: JSON.stringify({
      model: model || 'deepseek-chat',
      messages: [{ role: 'user', content: '说「好」一个字' }],
      max_tokens: 5,
    }),
  });
  if (!res.ok) {
    let detail = '';
    try { const j = await res.json(); detail = (j.error && j.error.message) || ''; } catch (_) {}
    throw new Error(explain(res.status, detail));
  }
  return true;
}

module.exports = { chat, test, extractExpr, SYSTEM_PROMPT };
