# -*- coding: utf-8 -*-
"""
把三张设定稿切成桌宠用的透明 PNG。

用法：
    python scripts/cut_sprites.py              # 处理 raw/ 下全部图
    python scripts/cut_sprites.py --tol 36     # 背景容差调大（毛边残留多时）
    python scripts/cut_sprites.py --debug      # 额外输出检测预览图

难点有两个：
  · 毛绒边缘是渐变过渡的，单一阈值不是留白边就是啃掉绒毛；
  · 角色身上的淡紫色口鼻、灰紫色蹄子，颜色离米色背景很近（通道最大差约 35），
    纯按颜色阈值判定会把它们挖成半透明的洞。

解法是「先连通性、后羽化」：
  1) 候选背景 = 贴近背景色的像素 + 近中性灰的地面投影；
  2) 只有与画面外部连通的候选区才算真背景 —— 被绒毛包住的浅色区域因此得以保全；
  3) 只在真背景边界外侧几个像素的一圈里做 alpha 渐变，留住绒毛的蓬松感。
"""

import argparse
import os
import sys
from collections import Counter

from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW_DIR = os.path.join(ROOT, 'raw')
OUT_DIR = os.path.join(ROOT, 'assets', 'sprites')

# 各张设定稿按「阅读顺序」对应的输出文件名
LAYOUTS = [
    (('三视图', 'view', '3view'),
     ['view_front', 'view_side', 'view_back']),
    (('表情', 'face', 'expr'),
     ['face_normal', 'face_happy', 'face_laugh', 'face_angry',
      'face_surprise', 'face_sad', 'face_smirk', 'face_shout']),
    (('动作', 'body', 'pose', 'action'),
     ['body_idle', 'body_walk', 'body_wave', 'body_dance',
      'body_point', 'body_shout']),
]


def layout_for(filename):
    low = filename.lower()
    for keys, names in LAYOUTS:
        if any(k.lower() in low for k in keys):
            return names
    return None


def background_color(img):
    """取四条边上出现最多的颜色作为背景色。"""
    w, h = img.size
    px = img.load()
    samples = Counter()
    step = max(1, min(w, h) // 200)
    for x in range(0, w, step):
        samples[px[x, 0]] += 1
        samples[px[x, h - 1]] += 1
    for y in range(0, h, step):
        samples[px[0, y]] += 1
        samples[px[w - 1, y]] += 1
    return samples.most_common(1)[0][0]


def distance_map(img, bg):
    """每个像素到背景色的通道最大差，返回 L 模式图。"""
    solid = Image.new('RGB', img.size, bg)
    diff = ImageChops.difference(img, solid)
    r, g, b = diff.split()
    return ImageChops.lighter(ImageChops.lighter(r, g), b)


def neutral_map(img):
    """每个像素的「彩度」= max(RGB) - min(RGB)。地面阴影是近中性灰，靠这个identify。"""
    r, g, b = img.split()
    hi = ImageChops.lighter(ImageChops.lighter(r, g), b)
    lo = ImageChops.darker(ImageChops.darker(r, g), b)
    return ImageChops.subtract(hi, lo)


def connected_to_border(mask):
    """从画面外围漫水，只保留与外部连通的那部分掩膜。

    这一步是整个抠图的关键。角色身上有些颜色离米色背景很近
    （淡紫色的口鼻、灰紫色的蹄子，通道最大差只有 35 左右），
    单纯按颜色阈值判定必然把它们挖成半透明的洞。
    但它们被橙色绒毛包着，跟画面外部并不连通 —— 靠连通性就能保住。
    """
    w, h = mask.size
    canvas = Image.new('L', (w + 2, h + 2), 255)   # 外围加一圈"背景"，保证四周连通
    canvas.paste(mask, (1, 1))
    ImageDraw.floodfill(canvas, (0, 0), 128, thresh=10)
    return canvas.crop((1, 1, w + 1, h + 1)).point(lambda v: 255 if v == 128 else 0)


def build_alpha(img, bg, tol_in, feather, edge, shadow_chroma, shadow_lift):
    """返回 alpha 通道（L 模式）：0=背景，255=主体，中间=边缘羽化。"""
    dist = distance_map(img, bg)
    chroma = neutral_map(img)
    gray = img.convert('L')
    bg_lum = int(round(0.299 * bg[0] + 0.587 * bg[1] + 0.114 * bg[2]))

    # 1) 候选背景 = 颜色贴近背景色的，加上近中性灰的地面投影
    near = dist.point(lambda v: 255 if v <= tol_in else 0)
    low_chroma = chroma.point(lambda v: 255 if v < shadow_chroma else 0)
    bright = gray.point(lambda v: 255 if v > bg_lum * shadow_lift else 0)
    shadow = ImageChops.multiply(low_chroma, bright)
    candidate = ImageChops.lighter(near, shadow)

    # 2) 分两种情况定背景：
    #    · 颜色确实等于背景色的（near），无条件透明 —— 否则两腿之间那块被围住的
    #      背景会留成白色三角；
    #    · 靠"近中性灰"猜出来的地面投影，必须与画面外部连通才算，
    #      免得把角色身上灰紫色的蹄子、鼻头一起抹掉。
    outside = connected_to_border(candidate)
    bg_mask = ImageChops.lighter(near, outside)
    alpha = ImageChops.invert(bg_mask)

    # 3) 羽化：只在真背景外侧 edge 像素的一圈里，按颜色距离做渐变，
    #    这样毛绒的蓬松边缘得以保留，而内部的浅色区域不受影响
    grow = bg_mask.filter(ImageFilter.MaxFilter(edge * 2 + 1))
    band = ImageChops.subtract(grow, bg_mask)
    span = max(1, feather)
    ramp = dist.point(lambda v: 0 if v <= tol_in else (255 if v >= tol_in + span
                                                      else int((v - tol_in) * 255 / span)))
    feathered = ImageChops.darker(alpha, ramp)
    return Image.composite(feathered, alpha, band)


def bands(values, threshold, min_run, gap_tol):
    """把一维投影切成若干连续区间。"""
    out = []
    start = None
    gap = 0
    for i, v in enumerate(values):
        if v > threshold:
            if start is None:
                start = i
            gap = 0
        elif start is not None:
            gap += 1
            if gap > gap_tol:
                if i - gap - start >= min_run:
                    out.append((start, i - gap))
                start = None
                gap = 0
    if start is not None and len(values) - start >= min_run:
        out.append((start, len(values)))
    return out


def split_row(px, w, y0, y1):
    """把一整行切成若干格。

    表情设定稿里，相邻半身像的肩膀在水平方向连成一整条带，整行投影找不到任何空隙。
    但脑袋始终是分开的 —— 所以改用行高上半段做投影定出切割线，
    每一格再按切割线在整行高度上取全宽，交给 tight_box 去收紧。
    """
    bh = y1 - y0
    if bh <= 0:
        return []

    def projection(ya, yb):
        counts = [0] * w
        for x in range(w):
            c = 0
            for y in range(ya, yb, 2):     # 隔行采样，够用且快一倍
                if px[x, y] > 40:
                    c += 1
            counts[x] = c * 2
        return counts

    gap = max(2, int(w * 0.006))
    full = bands(projection(y0, y1), bh * 0.01, int(w * 0.04), gap)
    head_bottom = y0 + max(1, int(bh * 0.55))
    head = bands(projection(y0, head_bottom), (head_bottom - y0) * 0.01, int(w * 0.03), gap)

    use = head if len(head) > len(full) else full
    if len(use) <= 1:
        return ([(0, y0, w, y1)] if use else []), [0, w]

    cuts = [0]
    for i in range(len(use) - 1):
        cuts.append((use[i][1] + use[i + 1][0]) // 2)   # 相邻两块的空隙中点
    cuts.append(w)
    return [(cuts[i], y0, cuts[i + 1], y1) for i in range(len(use))], cuts


def detect_cells(alpha):
    """按行列投影找出每个角色所在的格子，自动过滤标题文字和色卡。"""
    w, h = alpha.size
    px = alpha.load()

    row_counts = [0] * h
    for y in range(h):
        c = 0
        for x in range(0, w, 2):
            if px[x, y] > 40:
                c += 1
        row_counts[y] = c * 2

    # 阈值不能太松：零星几个残留像素就会把标题和角色连成一片。
    # 再按「够高」筛一道 —— 标题、色卡、图注都矮，会被这一刀滤掉。
    row_bands = bands(row_counts, w * 0.01, int(h * 0.12), int(h * 0.012))

    rows = [(y0, y1) + (split_row(px, w, y0, y1),) for (y0, y1) in row_bands]

    # 设定稿是规整网格，列位置在各行之间是对齐的。
    # 某一行如果因为相邻角色挨在一起而少切了几格（比如两颗头的耳朵碰上了），
    # 就直接套用切得最全的那一行的列线。
    ncols = max((len(r[2][0]) for r in rows), default=0)
    ref_cuts = next((r[2][1] for r in rows if len(r[2][0]) == ncols), None)

    cells = []
    for (y0, y1, (row_cells, _cuts)) in rows:
        if len(row_cells) < ncols and ref_cuts:
            row_cells = [(ref_cuts[i], y0, ref_cuts[i + 1], y1) for i in range(ncols)]
        cells.extend(row_cells)
    return cells


def tight_box(rgba, box, pad):
    """在格子里再收紧到实际像素范围，并留一点边距。"""
    sub = rgba.crop(box)
    bbox = sub.split()[3].point(lambda v: 255 if v > 8 else 0).getbbox()
    if not bbox:
        return None
    x0 = box[0] + bbox[0] - pad
    y0 = box[1] + bbox[1] - pad
    x1 = box[0] + bbox[2] + pad
    y1 = box[1] + bbox[3] + pad
    return (max(0, x0), max(0, y0), min(rgba.width, x1), min(rgba.height, y1))


def process(path, args):
    name = os.path.basename(path)
    img = Image.open(path).convert('RGB')
    bg = background_color(img)
    print('  背景色 RGB%s  尺寸 %dx%d' % (str(bg), img.width, img.height))

    alpha = build_alpha(img, bg, args.tol, args.feather, args.edge,
                        args.shadow_chroma, args.shadow_lift)
    alpha = alpha.filter(ImageFilter.SMOOTH)      # 轻微柔化，压掉阶梯感

    rgba = img.convert('RGBA')
    rgba.putalpha(alpha)

    cells = detect_cells(alpha)
    names = layout_for(name)
    print('  检测到 %d 个格子' % len(cells))

    if args.debug:
        prev = img.copy()
        d = ImageDraw.Draw(prev)
        for i, c in enumerate(cells):
            d.rectangle(c, outline=(255, 0, 128), width=4)
            d.text((c[0] + 8, c[1] + 8), str(i), fill=(255, 0, 128))
        p = os.path.join(OUT_DIR, '_debug_' + os.path.splitext(name)[0] + '.png')
        prev.save(p)
        print('  预览图 -> %s' % p)

    if names and len(cells) != len(names):
        print('  ! 格子数与预期 %d 不符，改用序号命名。' % len(names))
        print('    加 --debug 看预览图，再用 --tol / --gap 调参。')
        names = None
    if not names:
        names = ['%s_%02d' % (os.path.splitext(name)[0], i) for i in range(len(cells))]

    saved = []
    for cell, out_name in zip(cells, names):
        box = tight_box(rgba, cell, args.pad)
        if not box:
            continue
        piece = rgba.crop(box)
        out = os.path.join(OUT_DIR, out_name + '.png')
        piece.save(out)
        saved.append('%s (%dx%d)' % (out_name, piece.width, piece.height))
    for s in saved:
        print('    √ ' + s)
    return len(saved)


def make_tray_icon():
    """有了正面表情就拿它做托盘图标。"""
    src = os.path.join(OUT_DIR, 'face_normal.png')
    if not os.path.exists(src):
        return
    im = Image.open(src).convert('RGBA')
    side = max(im.size)
    canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    canvas.paste(im, ((side - im.width) // 2, (side - im.height) // 2), im)
    canvas.resize((256, 256), Image.LANCZOS).save(os.path.join(ROOT, 'assets', 'tray.png'))
    print('  √ 托盘图标 assets/tray.png')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--tol', type=int, default=30, help='背景硬核心容差，越大抠得越狠')
    ap.add_argument('--feather', type=int, default=34, help='羽化的颜色跨度')
    ap.add_argument('--edge', type=int, default=3, help='羽化带的像素宽度')
    ap.add_argument('--shadow-chroma', type=int, default=14, help='地面投影的彩度上限')
    ap.add_argument('--shadow-lift', type=float, default=0.72, help='地面投影的亮度下限（相对背景）')
    ap.add_argument('--pad', type=int, default=4, help='切片四周留白像素')
    ap.add_argument('--debug', action='store_true', help='输出格子检测预览图')
    args = ap.parse_args()

    if not os.path.isdir(RAW_DIR):
        print('找不到 raw/ 目录：%s' % RAW_DIR)
        return 1
    files = sorted(f for f in os.listdir(RAW_DIR)
                   if f.lower().endswith(('.png', '.jpg', '.jpeg', '.webp')))
    if not files:
        print('raw/ 里没有图片。请把三张设定稿放进 %s' % RAW_DIR)
        return 1

    os.makedirs(OUT_DIR, exist_ok=True)
    total = 0
    for f in files:
        print('[%s]' % f)
        total += process(os.path.join(RAW_DIR, f), args)
    make_tray_icon()
    print('\n完成，共导出 %d 张切片 -> %s' % (total, OUT_DIR))
    return 0


if __name__ == '__main__':
    sys.exit(main())
