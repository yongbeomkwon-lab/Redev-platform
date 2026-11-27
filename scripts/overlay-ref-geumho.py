#!/usr/bin/env python3
"""사용자 참고 캡처(네이버 지적편집도) 위에 리디브 구역 경계를 겹쳐 보는 도구 (2026-11-27)

참고 캡처에는 좌표가 없으므로, 화면에 함께 찍힌 지형지물(금남소공원·금동어린이공원·금호동3가 368)의
카카오 좌표와 픽셀 위치로 축척·원점을 잡는다(북쪽 고정, 약 0.753 m/px).

사용: python3 scripts/overlay-ref-geumho.py out.png
"""
from __future__ import annotations

import json
import math
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
REF = Path("/workspace/attachments/2026-11-27/1000085963-40cf37dcecae4105be7cbbe46af4e740.jpg")
ZONES = ROOT / "src" / "data" / "seoul-zones.json"

# 기준점: 금남소공원(37.54932316,127.02176938) = 캡처 (690,285)
LAT0, LNG0 = 37.54932316, 127.02176938
PX0, PY0 = 690.0, 285.0
M_PER_PX = 0.7532

COLORS = {
    "11000UQ120PS202505310983": ((0, 90, 255), "1458"),
    "sy-geumho23": ((255, 0, 0), "금호23"),
    "11000UQ120PS202411014498": ((255, 0, 200), "금호21"),
    "sd-geumnam-market": ((0, 160, 60), "금남시장"),
}


def to_px(lat, lng):
    mx = (lng - LNG0) * 111320.0 * math.cos(math.radians(LAT0)) / M_PER_PX
    my = -(lat - LAT0) * 111132.0 / M_PER_PX
    return PX0 + mx, PY0 + my


def main(out="tmp/overlay-ref.png"):
    im = Image.open(REF).convert("RGB")
    draw = ImageDraw.Draw(im, "RGBA")
    zones = {z["id"]: z for z in json.loads(ZONES.read_text(encoding="utf-8"))}
    for zid, (color, label) in COLORS.items():
        z = zones.get(zid)
        if not z:
            continue
        poly = z.get("polygon") or []
        if not poly:
            x, y = to_px(*z["center"])
            draw.ellipse([x - 5, y - 5, x + 5, y + 5], outline=color + (255,), width=3)
            continue
        pts = [to_px(p[0], p[1]) for p in poly]
        draw.polygon(pts, outline=color + (255,))
        for i in range(len(pts) - 1):
            draw.line([pts[i], pts[i + 1]], fill=color + (255,), width=4)
        cx = sum(p[0] for p in pts) / len(pts)
        cy = sum(p[1] for p in pts) / len(pts)
        draw.text((cx, cy), f"리디브 {label}", fill=(0, 0, 0))
    im.save(out)
    print("저장", out, im.size)


if __name__ == "__main__":
    main()
