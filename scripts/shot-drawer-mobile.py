#!/usr/bin/env python3
"""좁은 화면(모바일) 드로어 확인 — 효창공원앞역 인근 상세."""
import time

from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    page = ctx.new_page()
    page.goto("http://localhost:3100/", wait_until="domcontentloaded")
    page.wait_for_selector(".kakao-zone-canvas", timeout=30000)
    time.sleep(3.5)
    page.fill('input[placeholder^="구역명"]', "효창공원앞")
    time.sleep(0.8)
    page.click("ul li button")
    time.sleep(2.5)
    page.screenshot(path="/workspace/downloads/redev-kakao-hyochang-mobile.png")
    over = page.evaluate(
        """() => {
      const a = document.querySelector('aside');
      if (!a) return ['no aside'];
      const out = [];
      for (const el of a.querySelectorAll('*')) {
        if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX === 'visible') out.push([el.tagName, el.scrollWidth, el.clientWidth]);
      }
      return out.slice(0, 8);
    }"""
    )
    print("mobile overflow:", over)
    ctx.close()
    b.close()
