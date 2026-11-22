#!/usr/bin/env python3
"""🔥 개발압력 **생활권 동심원** 검수 — 지도에 원이 대로를 비켜 그려지는지 확인한다.

  ① 데이터: `/data/dev-pressure-areas.json` 의 모든 생활권이
     · 반경 24~110m 이고
     · 가장 가까운 대로 「도로 끝까지 여유(clearM)」가 0 이상인지(원이 대로 회랑과 겹치지 않는지)
  ② 화면: 카카오 지도를 신길동(37.4987, 126.9090)으로 옮겨
     · 동심원이 그려지고, 배지가 그 원의 한가운데 있는지(오차 2px 이내)
     · 배지를 누르면 카드에 「생활권 (추정)」·「구역계가 아니」가 나오는지
  ③ 구 데이터(점선 폴리곤)가 지도에 남아 있지 않은지 — `dev-block-layer` 가 없어야 한다.

  python3 scripts/verify-dev-pressure-areas.py                       # 배포본
  URL=http://localhost:3100/ python3 scripts/verify-dev-pressure-areas.py
"""
import json
import os
import sys
import time
import urllib.request

from playwright.sync_api import sync_playwright

URL = os.environ.get("URL", "https://redev-platform-iota.vercel.app/")
SHOTS = os.environ.get("SHOTS", "/workspace/downloads")
ID = "dp-99-72"


def check_data() -> list[str]:
    errs: list[str] = []
    # 로컬 검수는 http_proxy 환경변수·localhost 해석에 걸리지 않게 프록시 없이 127.0.0.1 로 직접 받는다
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    data_url = URL.rstrip("/").replace("//localhost:", "//127.0.0.1:") + "/data/dev-pressure-areas.json"
    with opener.open(data_url, timeout=30) as r:
        d = json.load(r)
    areas = d["areas"]
    if not areas:
        return ["생활권 데이터가 비어 있습니다"]
    for a in areas:
        if not (24 <= a["radiusM"] <= 110):
            errs.append(f"{a['id']} 반경 {a['radiusM']}m 가 24~110m 밖")
        if a.get("road") and a["road"]["clearM"] < 0:
            errs.append(f"{a['id']} 대로 침범 {a['road']['clearM']}m")
    print(f"· 데이터: 생활권 {len(areas)}곳 · 제외 {len(d.get('excluded') or [])}곳")
    return errs


def check_screen() -> list[str]:
    errs: list[str] = []
    with sync_playwright() as p:
        b = p.chromium.launch(args=["--no-sandbox"])
        ctx = b.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=1.5)
        page = ctx.new_page()
        page.on("pageerror", lambda e: errs.append(f"pageerror: {str(e)[:120]}"))
        page.goto(URL + ("&" if "?" in URL else "?") + "diag=1", wait_until="domcontentloaded")
        page.wait_for_selector(".kakao-zone-canvas", timeout=45000)
        time.sleep(3)
        page.click('[data-testid="dev-pressure-toggle"]')
        time.sleep(1.5)
        page.evaluate(
            "() => { const m=window.__redevDiag.map(); m.setLevel(3); m.setCenter(new kakao.maps.LatLng(37.4987,126.9090)); }"
        )
        time.sleep(2.5)
        if page.query_selector('[data-testid="dev-block-layer"]'):
            errs.append("점선 구역경계(dev-block-layer)가 아직 지도에 있습니다")
        n = page.eval_on_selector_all('[data-testid="dev-area-circle"]', "els => els.length")
        print(f"· 화면: 동심원 {n}개")
        if n == 0:
            errs.append("동심원이 하나도 그려지지 않았습니다")
        # 배지가 원 한가운데인지
        off = page.evaluate(
            """() => {
              const pin = document.querySelector('[data-testid="dev-pressure-pin"][data-hotspot-id="%s"]');
              if (!pin) return null;
              const c = document.querySelector('[data-testid="dev-area-circle"][data-area-id="%s"]');
              if (!c) return null;
              const a = pin.getBoundingClientRect(), b = c.getBoundingClientRect();
              return Math.hypot((a.left+a.width/2)-(b.left+b.width/2), (a.top+a.height/2)-(b.top+b.height/2));
            }""" % (ID, ID)
        )
        print(f"· 배지-원 중심 오차: {off if off is None else round(off, 1)}px")
        if off is not None and off > 2:
            errs.append(f"배지가 원 중심에서 {off:.1f}px 벗어남")
        page.click(f'[data-testid="dev-pressure-pin"][data-hotspot-id="{ID}"]')
        time.sleep(1.0)
        card = page.inner_text('[data-testid="dev-pressure-card"]')
        for needle in ("생활권 (추정)", "구역계가 아니"):
            if needle not in card:
                errs.append(f"카드에 「{needle}」 안내가 없습니다")
        os.makedirs(SHOTS, exist_ok=True)
        page.screenshot(path=os.path.join(SHOTS, "redev_devpressure_verify.png"))
        print(f"· 캡처: {os.path.join(SHOTS, 'redev_devpressure_verify.png')}")
        ctx.close()
        b.close()
    return errs


def main() -> int:
    errs = check_data() + check_screen()
    if errs:
        print("✗ 문제:", *errs, sep="\n  - ")
        return 1
    print("✓ 개발압력 생활권 동심원 — 데이터·화면 모두 통과")
    return 0


if __name__ == "__main__":
    sys.exit(main())
