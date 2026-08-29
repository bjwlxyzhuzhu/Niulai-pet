# -*- coding: utf-8 -*-
"""合成一张仿设定稿，用来验证 cut_sprites.py 的抠图与切格逻辑。

刻意复刻了真实设定稿里几个会坑人的特征：
  · 米色背景、顶部标题横条、一排色卡（都不该被当成角色切出来）
  · 每个角色底下有一行图注（也不该被切出来）
  · 角色脚下有柔和的地面投影（必须被抹掉）
  · 角色身上有深色眼睛和张开的嘴（绝不能被当成背景挖穿）
"""
import os
import sys
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'tmp_test', 'raw')

BG = (244, 240, 233)
FUR = (232, 134, 46)
MUZZLE = (216, 205, 227)
HORN = (201, 165, 122)
DARK = (30, 24, 18)

W, H = 1456, 1080
COLS, ROWS = 4, 2


def blob(d, cx, cy, r, open_mouth):
    d.ellipse([cx - r * 1.5, cy - r * 0.42, cx + r * 1.5, cy + r * 0.42], fill=FUR)   # 耳朵横条
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=FUR)                              # 头
    d.ellipse([cx - r * 0.58, cy + r * 0.18, cx + r * 0.58, cy + r * 0.72], fill=MUZZLE)
    d.ellipse([cx - r * 0.42, cy - r * 0.22, cx - r * 0.2, cy - r * 0.02], fill=DARK)  # 左眼
    d.ellipse([cx + r * 0.2, cy - r * 0.22, cx + r * 0.42, cy - r * 0.02], fill=DARK)  # 右眼
    if open_mouth:
        d.ellipse([cx - r * 0.3, cy + r * 0.3, cx + r * 0.3, cy + r * 0.62], fill=(110, 65, 76))


def main():
    os.makedirs(OUT, exist_ok=True)
    img = Image.new('RGB', (W, H), BG)

    # 地面投影单独画一层再模糊，模拟真实渲染图的柔和阴影
    shadow = Image.new('L', (W, H), 0)
    sd = ImageDraw.Draw(shadow)
    cw, ch = W // COLS, int(H * 0.36)
    top = int(H * 0.20)
    for r in range(ROWS):
        for c in range(COLS):
            cx = c * cw + cw // 2
            cy = top + r * ch + ch // 2
            sd.ellipse([cx - 110, cy + 108, cx + 110, cy + 150], fill=70)
    shadow = shadow.filter(ImageFilter.GaussianBlur(22))
    img = Image.composite(Image.new('RGB', (W, H), (190, 184, 174)), img, shadow)

    d = ImageDraw.Draw(img)
    d.rectangle([60, 40, 900, 92], fill=(60, 46, 34))            # 标题横条
    for i in range(5):                                            # 色卡
        d.rectangle([60 + i * 62, 116, 108 + i * 62, 164],
                    fill=[(232, 134, 46), (239, 176, 92), (233, 205, 169),
                          (214, 204, 224), (191, 182, 203)][i])

    for r in range(ROWS):
        for c in range(COLS):
            i = r * COLS + c
            cx = c * cw + cw // 2
            cy = top + r * ch + ch // 2
            blob(d, cx, cy, 105, open_mouth=(i in (2, 7)))
            d.rectangle([cx - 46, cy + 176, cx + 46, cy + 200], fill=(60, 46, 34))  # 图注

    p = os.path.join(OUT, 'A_表情.png')
    img.save(p)
    print('√ 测试图 -> %s' % p)
    return 0


if __name__ == '__main__':
    sys.exit(main())
