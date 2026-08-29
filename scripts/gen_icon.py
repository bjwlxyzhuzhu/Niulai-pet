# -*- coding: utf-8 -*-
"""生成托盘图标和打包用的 ico。

素材还没到位时用代码画的牛头顶上；跑过 cut_sprites.py 之后，
那边会用真实的「普通」表情覆盖 assets/tray.png。
"""
import os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

FUR = (232, 134, 46, 255)
INNER = (233, 205, 169, 255)
HORN = (201, 165, 122, 255)
MUZZLE = (216, 205, 227, 255)
DARK = (43, 33, 25, 255)


def draw_head(size=512):
    im = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    s = size / 200.0

    def box(cx, cy, rx, ry):
        return [(cx - rx) * s, (cy - ry) * s, (cx + rx) * s, (cy + ry) * s]

    # 耳朵
    d.ellipse(box(42, 96, 30, 15), fill=FUR)
    d.ellipse(box(42, 96, 18, 8), fill=INNER)
    d.ellipse(box(158, 96, 30, 15), fill=FUR)
    d.ellipse(box(158, 96, 18, 8), fill=INNER)
    # 角
    d.polygon([(70 * s, 58 * s), (66 * s, 34 * s), (80 * s, 36 * s), (84 * s, 60 * s)], fill=HORN)
    d.polygon([(130 * s, 58 * s), (134 * s, 34 * s), (120 * s, 36 * s), (116 * s, 60 * s)], fill=HORN)
    # 头
    d.ellipse(box(100, 102, 66, 62), fill=FUR)
    # 口鼻
    d.ellipse(box(100, 132, 38, 28), fill=MUZZLE)
    # 眼睛
    d.ellipse(box(78, 100, 7, 6), fill=DARK)
    d.ellipse(box(122, 100, 7, 6), fill=DARK)
    # 眉毛
    d.line([64 * s, 80 * s, 92 * s, 76 * s], fill=HORN, width=int(7 * s))
    d.line([136 * s, 80 * s, 108 * s, 76 * s], fill=HORN, width=int(7 * s))
    return im


def main():
    os.makedirs(os.path.join(ROOT, 'assets'), exist_ok=True)
    os.makedirs(os.path.join(ROOT, 'build'), exist_ok=True)

    head = draw_head(512)
    tray = os.path.join(ROOT, 'assets', 'tray.png')
    if os.path.exists(tray):
        print('assets/tray.png 已存在（可能来自真实素材），跳过')
    else:
        head.resize((256, 256), Image.LANCZOS).save(tray)
        print('√ assets/tray.png')

    ico = os.path.join(ROOT, 'build', 'icon.ico')
    head.save(ico, sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    print('√ build/icon.ico')


if __name__ == '__main__':
    main()
