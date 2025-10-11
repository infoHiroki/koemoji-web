#!/usr/bin/env python3
"""
KoeMoji-Go Web アイコン生成スクリプト
モダンなグラデーションデザインでアイコンを生成
"""

from PIL import Image, ImageDraw
import math

def create_gradient(width, height):
    """紫から青へのグラデーションを作成"""
    img = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # グラデーションカラー (紫 #764ba2 から 青 #667eea)
    start_color = (118, 75, 162)  # #764ba2
    end_color = (102, 126, 234)   # #667eea

    for y in range(height):
        ratio = y / height
        r = int(start_color[0] * (1 - ratio) + end_color[0] * ratio)
        g = int(start_color[1] * (1 - ratio) + end_color[1] * ratio)
        b = int(start_color[2] * (1 - ratio) + end_color[2] * ratio)
        draw.rectangle([(0, y), (width, y + 1)], fill=(r, g, b, 255))

    return img

def create_icon(size):
    """モダンなマイクアイコンを生成"""
    # グラデーション背景（円形）
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # グラデーション円を描画
    gradient = create_gradient(size, size)
    mask = Image.new('L', (size, size), 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.ellipse([(0, 0), (size, size)], fill=255)

    # グラデーションを円形にマスク
    img.paste(gradient, (0, 0), mask)

    # 中心位置
    center_x = size // 2
    center_y = size // 2

    # マイクのサイズを計算
    if size <= 16:
        # 小さいアイコンはシンプルに
        mic_radius = size * 0.25
        draw.ellipse(
            [(center_x - mic_radius, center_y - mic_radius),
             (center_x + mic_radius, center_y + mic_radius)],
            fill=(255, 255, 255, 255)
        )
    else:
        # 大きいアイコンは詳細に
        mic_height = size * 0.35
        mic_width = size * 0.18
        mic_top = center_y - mic_height * 0.5

        # 白いマイク本体（楕円）
        mic_left = center_x - mic_width / 2
        mic_right = center_x + mic_width / 2
        mic_bottom = mic_top + mic_height

        draw.ellipse(
            [(mic_left, mic_top), (mic_right, mic_bottom)],
            fill=(255, 255, 255, 255)
        )

        # マイクスタンド（縦線）
        stand_width = max(3, size // 30)
        stand_height = size * 0.15
        stand_top = mic_bottom - size * 0.02
        stand_bottom = stand_top + stand_height

        draw.rectangle(
            [(center_x - stand_width/2, stand_top), (center_x + stand_width/2, stand_bottom)],
            fill=(255, 255, 255, 255)
        )

        # マイクベース（横線）
        base_width = size * 0.22
        base_height = max(3, size // 30)

        draw.rectangle(
            [(center_x - base_width/2, stand_bottom - base_height/2),
             (center_x + base_width/2, stand_bottom + base_height/2)],
            fill=(255, 255, 255, 255)
        )

        # 音波（3本の曲線）を追加
        if size >= 48:
            wave_spacing = size * 0.06
            wave_thickness = max(2, size // 35)

            for i in range(3):
                distance = wave_spacing * (i + 1)
                wave_radius = size * 0.08 * (i + 1)
                alpha = int(255 * (1 - i * 0.3))

                # 右側の波（円弧）
                draw.arc(
                    [(mic_right - wave_radius + distance, center_y - wave_radius),
                     (mic_right + wave_radius + distance, center_y + wave_radius)],
                    start=-30, end=30,
                    fill=(255, 255, 255, alpha),
                    width=wave_thickness
                )

    return img

# 各サイズのアイコンを生成
sizes = [16, 48, 128]

for size in sizes:
    icon = create_icon(size)
    icon.save(f'icons/icon-{size}.png', 'PNG')
    print(f'✓ icon-{size}.png を生成しました')

print('\n🎉 すべてのアイコンの生成が完了しました！')
