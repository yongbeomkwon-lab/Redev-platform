#!/usr/bin/env python3
"""오른쪽 드로어 UI 확인 — 효창공원앞역 인근(서울시 고시 구역) 상세를 열고 캡처."""
import os
import sys
import time

from playwright.sync_api import sync_playwright

NAME = sys.argv[1] if len(sys.argv) > 1 else "효창공원앞"
OUT = sys.argv[2] if len(sys.argv) > 2 else "/workspace/downloads/redev-kakao-hyochang-detail.png"

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    ctx = b.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=1)
    page = ctx.new_page()
    page.on("pageerror", lambda e: print("PAGEERROR", str(e)[:300]))
    page.goto(os.environ.get("TARGET_URL", "http://localhost:3100/"), wait_until="domcontentloaded")
    page.wait_for_selector(".kakao-zone-canvas", timeout=30000)
    time.sleep(3.5)
    page.fill('input[placeholder^="구역명"]', NAME)
    time.sleep(0.8)
    # 검색 결과 첫 항목
    page.click('ul li button')
    time.sleep(2.5)
    aside = page.query_selector("aside")
    aside.screenshot(path=OUT)
    print("saved", OUT)
    # 드로어 안에서 넘치는 요소가 있는지
    over = page.evaluate(
        """() => {
      const a = document.querySelector('aside');
      const out = [];
      for (const el of a.querySelectorAll('*')) {
        if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX === 'visible') {
          out.push([el.tagName, (el.className || '').toString().slice(0, 50), el.scrollWidth, el.clientWidth]);
        }
      }
      return out.slice(0, 12);
    }"""
    )
    print("overflowing elements:", over)
    # 라벨이 한 글자씩 쌓이는지(높이가 글자수에 비례해 커진 dt) 검사
    labels = page.evaluate(
        """() => {
      const a = document.querySelector('aside');
      const rows = [];
      for (const dt of a.querySelectorAll('dt')) {
        const r = dt.getBoundingClientRect();
        const lines = Math.round(r.height / 16);
        if (lines >= 2) rows.push([dt.textContent, Math.round(r.width), Math.round(r.height)]);
      }
      return rows;
    }"""
    )
    print("wrapped dt labels:", labels)
    page.screenshot(path=OUT.replace(".png", "-full.png"))
    ctx.close()
    b.close()
