'use strict';
/* 素材解析层
   真实素材由 scripts/cut_sprites.py 从三张设定稿切出，落在 assets/sprites/。
   素材还没到位时，这里用纯代码画的占位牛顶上，保证程序随时能跑。 */

window.FACES = ['normal', 'happy', 'laugh', 'angry', 'surprise', 'sad', 'smirk', 'shout'];
window.POSES = ['idle', 'walk', 'wave', 'dance', 'point', 'shout'];

// 表情 -> 动作的兜底映射：全身模式下没有那么多姿势，就近取
window.FACE_TO_POSE = {
  normal: 'idle', happy: 'idle', laugh: 'dance', angry: 'point',
  surprise: 'wave', sad: 'idle', smirk: 'point', shout: 'shout',
};

const C = {
  fur: '#E8862E',
  furLight: '#EFAA5E',
  furDark: '#C96F22',
  inner: '#E9CDA9',
  muzzle: '#D8CDE3',
  muzzleDark: '#BFB4CE',
  horn: '#C9A57A',
  dark: '#2B2119',
};

/* ---- 占位牛：按表情参数画一张 SVG ---- */
const EXPR = {
  //        眉毛形态      眼睛形态     嘴巴形态
  normal:   { brow: 'flat',  eye: 'slit',  mouth: 'line' },
  happy:    { brow: 'flat',  eye: 'slit',  mouth: 'smile' },
  laugh:    { brow: 'up',    eye: 'arc',   mouth: 'open' },
  angry:    { brow: 'angry', eye: 'sharp', mouth: 'frown' },
  surprise: { brow: 'up',    eye: 'wide',  mouth: 'o' },
  sad:      { brow: 'sad',   eye: 'droop', mouth: 'frown' },
  smirk:    { brow: 'one',   eye: 'slit',  mouth: 'smirk' },
  shout:    { brow: 'angry', eye: 'shut',  mouth: 'wide' },
};

function brows(kind) {
  const s = `fill="none" stroke="${C.horn}" stroke-width="7" stroke-linecap="round"`;
  switch (kind) {
    case 'angry': return `<path d="M62 66 L92 76" ${s}/><path d="M138 66 L108 76"  ${s}/>`;
    case 'sad':   return `<path d="M62 76 L92 66" ${s}/><path d="M138 76 L108 66" ${s}/>`;
    case 'up':    return `<path d="M62 62 Q77 56 92 62" ${s}/><path d="M138 62 Q123 56 108 62" ${s}/>`;
    case 'one':   return `<path d="M62 72 Q77 68 92 72" ${s}/><path d="M138 60 Q123 54 108 60" ${s}/>`;
    default:      return `<path d="M62 70 Q77 66 92 70" ${s}/><path d="M138 70 Q123 66 108 70" ${s}/>`;
  }
}

function eyes(kind) {
  const d = C.dark;
  switch (kind) {
    case 'wide':
      return `<ellipse cx="78" cy="90" rx="11" ry="12" fill="#fff" stroke="${d}" stroke-width="2"/>
              <ellipse cx="122" cy="90" rx="11" ry="12" fill="#fff" stroke="${d}" stroke-width="2"/>
              <circle cx="78" cy="91" r="6" fill="${d}"/><circle cx="122" cy="91" r="6" fill="${d}"/>`;
    case 'arc':
      return `<path d="M68 92 Q78 82 88 92" fill="none" stroke="${d}" stroke-width="4" stroke-linecap="round"/>
              <path d="M112 92 Q122 82 132 92" fill="none" stroke="${d}" stroke-width="4" stroke-linecap="round"/>`;
    case 'shut':
      return `<path d="M68 86 Q78 96 88 86" fill="none" stroke="${d}" stroke-width="4" stroke-linecap="round"/>
              <path d="M112 86 Q122 96 132 86" fill="none" stroke="${d}" stroke-width="4" stroke-linecap="round"/>`;
    case 'sharp':
      return `<path d="M69 86 L88 92 L69 95 Z" fill="${d}"/><path d="M131 86 L112 92 L131 95 Z" fill="${d}"/>`;
    case 'droop':
      return `<ellipse cx="78" cy="93" rx="6" ry="5" fill="${d}"/><ellipse cx="122" cy="93" rx="6" ry="5" fill="${d}"/>
              <path d="M70 85 L86 88" stroke="${C.furDark}" stroke-width="3" stroke-linecap="round"/>
              <path d="M130 85 L114 88" stroke="${C.furDark}" stroke-width="3" stroke-linecap="round"/>`;
    default: // slit
      return `<ellipse cx="78" cy="90" rx="6" ry="5" fill="${d}"/><ellipse cx="122" cy="90" rx="6" ry="5" fill="${d}"/>`;
  }
}

function mouth(kind) {
  const s = `fill="none" stroke="${C.muzzleDark}" stroke-width="3.5" stroke-linecap="round"`;
  switch (kind) {
    case 'smile': return `<path d="M84 126 Q100 136 116 126" ${s}/>`;
    case 'frown': return `<path d="M84 132 Q100 122 116 132" ${s}/>`;
    case 'smirk': return `<path d="M82 130 Q100 138 118 124" ${s}/>`;
    case 'o':     return `<ellipse cx="100" cy="128" rx="9" ry="11" fill="#7A4A55"/>`;
    case 'open':  return `<ellipse cx="100" cy="128" rx="20" ry="14" fill="#7A4A55"/>
                          <ellipse cx="100" cy="136" rx="12" ry="7" fill="#C97F8C"/>`;
    case 'wide':  return `<ellipse cx="100" cy="129" rx="17" ry="18" fill="#6F414C"/>
                          <ellipse cx="100" cy="140" rx="10" ry="7" fill="#C97F8C"/>`;
    default:      return `<path d="M86 128 L114 128" ${s}/>`;
  }
}

function bustSVG(expr) {
  const e = EXPR[expr] || EXPR.normal;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
    <ellipse cx="100" cy="196" rx="86" ry="30" fill="${C.fur}"/>
    <ellipse cx="42" cy="86" rx="26" ry="15" fill="${C.fur}" transform="rotate(-18 42 86)"/>
    <ellipse cx="42" cy="86" rx="16" ry="8" fill="${C.inner}" transform="rotate(-18 42 86)"/>
    <ellipse cx="158" cy="86" rx="26" ry="15" fill="${C.fur}" transform="rotate(18 158 86)"/>
    <ellipse cx="158" cy="86" rx="16" ry="8" fill="${C.inner}" transform="rotate(18 158 86)"/>
    <path d="M70 46 Q66 30 78 30 Q82 38 82 50 Z" fill="${C.horn}"/>
    <path d="M130 46 Q134 30 122 30 Q118 38 118 50 Z" fill="${C.horn}"/>
    <ellipse cx="100" cy="92" rx="62" ry="58" fill="${C.fur}"/>
    <ellipse cx="100" cy="122" rx="36" ry="27" fill="${C.muzzle}"/>
    <ellipse cx="90" cy="114" rx="4" ry="5" fill="${C.muzzleDark}"/>
    <ellipse cx="110" cy="114" rx="4" ry="5" fill="${C.muzzleDark}"/>
    ${brows(e.brow)}${eyes(e.eye)}${mouth(e.mouth)}
  </svg>`;
}

function bodySVG(expr) {
  const e = EXPR[expr] || EXPR.normal;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 320">
    <ellipse cx="100" cy="230" rx="62" ry="78" fill="${C.fur}"/>
    <ellipse cx="46" cy="215" rx="17" ry="45" fill="${C.fur}"/>
    <ellipse cx="154" cy="215" rx="17" ry="45" fill="${C.fur}"/>
    <ellipse cx="46" cy="252" rx="13" ry="12" fill="${C.muzzle}"/>
    <ellipse cx="154" cy="252" rx="13" ry="12" fill="${C.muzzle}"/>
    <ellipse cx="76" cy="296" rx="21" ry="16" fill="${C.fur}"/>
    <ellipse cx="124" cy="296" rx="21" ry="16" fill="${C.fur}"/>
    <ellipse cx="76" cy="303" rx="19" ry="10" fill="${C.muzzle}"/>
    <ellipse cx="124" cy="303" rx="19" ry="10" fill="${C.muzzle}"/>
    <g transform="translate(0,-14) scale(0.86) translate(16,16)">
      <ellipse cx="42" cy="86" rx="26" ry="15" fill="${C.fur}" transform="rotate(-18 42 86)"/>
      <ellipse cx="42" cy="86" rx="16" ry="8" fill="${C.inner}" transform="rotate(-18 42 86)"/>
      <ellipse cx="158" cy="86" rx="26" ry="15" fill="${C.fur}" transform="rotate(18 158 86)"/>
      <ellipse cx="158" cy="86" rx="16" ry="8" fill="${C.inner}" transform="rotate(18 158 86)"/>
      <path d="M70 46 Q66 30 78 30 Q82 38 82 50 Z" fill="${C.horn}"/>
      <path d="M130 46 Q134 30 122 30 Q118 38 118 50 Z" fill="${C.horn}"/>
      <ellipse cx="100" cy="92" rx="62" ry="58" fill="${C.fur}"/>
      <ellipse cx="100" cy="122" rx="36" ry="27" fill="${C.muzzle}"/>
      <ellipse cx="90" cy="114" rx="4" ry="5" fill="${C.muzzleDark}"/>
      <ellipse cx="110" cy="114" rx="4" ry="5" fill="${C.muzzleDark}"/>
      ${brows(e.brow)}${eyes(e.eye)}${mouth(e.mouth)}
    </g>
  </svg>`;
}

function svgURI(svg) {
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.replace(/\s+/g, ' '));
}

/* ---- 对外接口 ---- */
window.Sprites = {
  available: new Set(),
  usingPlaceholder: true,

  async init() {
    let files = [];
    try { files = await window.niulai.listSprites(); } catch (_) { files = []; }
    this.available = new Set(files);
    // 只要真实的「普通」表情在，就认为素材已到位
    this.usingPlaceholder = !this.available.has('face_normal.png');
    return this.usingPlaceholder;
  },

  face(expr) {
    const f = 'face_' + expr + '.png';
    if (this.available.has(f)) return '../assets/sprites/' + f;
    return svgURI(bustSVG(expr));
  },

  body(expr, pose) {
    const p = pose || window.FACE_TO_POSE[expr] || 'idle';
    const f = 'body_' + p + '.png';
    if (this.available.has(f)) return '../assets/sprites/' + f;
    return svgURI(bodySVG(expr));
  },
};
