#!/usr/bin/env python3
"""운영 배포본 구역 뱃지 검증 스크린샷 — 최초 화면 + 동네 줌.

  본 화면을 위/아래로 붙이고 머리글을 넣어 한 장으로 저장한다.
  출력: /workspace/downloads/리디브_구역뱃지_2026-11-21.png
  실행: python3 scripts/shot-zone-tags.py [URL]
"""
import sys
import time

from PIL import Image, ImageDraw, ImageFont
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else "https://redev-platform-iota.vercel.app/"
OUT = "/workspace/downloads/리디브_구역뱃지_2026-11-21.png"
TMP1 = "/workspace/downloads/tmp_deploy_initial.png"
TMP2 = "/workspace/downloads/tmp_deploy_zoom.png"
FONT = "/usr/share/fonts/pickle-hwp/NotoSansCJKkr-Regular.otf"

OVERLAP_JS = """() => {
  const els = [...document.querySelectorAll('.zone-tag')].filter(e => e.style.visibility !== 'hidden');
  const boxes = els.map(e => { const r = e.getBoundingClientRect(); return {n: e.textContent, x0: r.x, y0: r.y, x1: r.x + r.width, y1: r.y + r.height}; });
  let overlaps = 0;
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    if (Math.min(a.x1,b.x1) - Math.max(a.x0,b.x0) > 0 && Math.min(a.y1,b.y1) - Math.max(a.y0,b.y0) > 0) overlaps++;
  }
  return {count: boxes.length, overlaps, names: boxes.map(b => b.n)};
}"""

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    ctx = b.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=1)
    page = ctx.new_page()
    errs = []
    page.on("pageerror", lambda e: errs.append(str(e)[:160]))
    page.goto(URL, wait_until="domcontentloaded")
    page.wait_for_selector(".zone-tag", timeout=60000)
    time.sleep(5)
    first = page.evaluate(OVERLAP_JS)
    print("최초 화면 이름표", first["count"], "겹침", first["overlaps"])
    print("표본:", " / ".join(first["names"][:8]))
    page.screenshot(path=TMP1)

    # 동네 줌 — 신림1구역(사용자 상담 구역)
    page.fill('input[placeholder^="구역명"]', "신림1")
    time.sleep(1.0)
    page.click("ul li button")
    time.sleep(4.5)
    second = page.evaluate(OVERLAP_JS)
    print("동네 줌 이름표", second["count"], "겹침", second["overlaps"])
    print("표본:", " / ".join(second["names"][:8]))
    page.screenshot(path=TMP2)
    print("page errors:", errs[:3] if errs else "none")
    b.close()

# 두 화면을 한 장으로 — 머리글 + 구분선
top = Image.open(TMP1)
bottom = Image.open(TMP2)
W = top.width
HEAD = 54
GAP = 12
H = HEAD + top.height + GAP + bottom.height
canvas = Image.new("RGB", (W, H), "white")
canvas.paste(top, (0, HEAD))
canvas.paste(bottom, (0, HEAD + top.height + GAP))
draw = ImageDraw.Draw(canvas)
try:
    f_title = ImageFont.truetype(FONT, 20)
    f_sub = ImageFont.truetype(FONT, 14)
except OSError:
    f_title = f_sub = ImageFont.load_default()
draw.text((16, 10), "리디브 — 지도 기본 구역 이름표(구역명 · 사업유형)", font=f_title, fill="#0f172a")
draw.text(
    (16, 34),
    "위: 최초 화면(서울 전경)  /  아래: 신림1구역 동네 줌 — 마우스를 올리지 않아도 이름표가 겹침 없이 표시",
    font=f_sub,
    fill="#475569",
)
canvas.save(OUT)
print("saved", OUT, canvas.size)
