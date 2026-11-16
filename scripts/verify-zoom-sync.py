#!/usr/bin/env python3
"""휠 줌 중 구역 경계(canvas)와 카카오 지도(타일·네이티브 오버레이)의 어긋남을 **매 프레임** 측정한다.

카카오맵은 레벨이 바뀌면 이전 레벨 타일을 약 250ms 동안 CSS width/height 로 확대·축소하고,
카카오 자신의 Polygon·라벨도 같은 애니메이션을 따라 움직인다. 우리 canvas 는 그 배율(k)을
읽어 함께 확대·축소해야 경계가 지도에서 떨어지지 않는다.

측정 방법
  · 지도 중앙에 고정 사각형을 카카오 네이티브 Polygon(빨강)으로 하나 그린다 — 카카오가
    타일과 같은 애니메이션으로 그리는 "지도 위의 기준 도형"이다.
  · 같은 좌표를 우리 canvas 가 어디에 그리는지(draw() 와 같은 식, __redevDiag.view())와 비교한다.
  · 차이가 0px 에 가까우면 경계가 지도에 붙어 있다는 뜻이다.

사용법 (개발 서버 3100 이 떠 있어야 한다)
    export LD_LIBRARY_PATH=/workspace/.tooling/libs/extracted/usr/lib/x86_64-linux-gnu
    python3 scripts/verify-zoom-sync.py
"""
import json
import time

from playwright.sync_api import sync_playwright

URL = "http://localhost:3100/"
SHOT_DIR = "/workspace/projects/redev-platform/tmp"

SETUP = r"""
() => {
  const m = window.__redevDiag.map();
  const k = window.kakao;
  const LAT = 37.4842, LNG = 126.9295, dLat = 0.0012, dLng = 0.0015;
  const rect = [
    new k.maps.LatLng(LAT - dLat, LNG - dLng),
    new k.maps.LatLng(LAT - dLat, LNG + dLng),
    new k.maps.LatLng(LAT + dLat, LNG + dLng),
    new k.maps.LatLng(LAT + dLat, LNG - dLng),
  ];
  const pg = new k.maps.Polygon({ path: rect, strokeWeight: 3, strokeColor: '#ff0000', strokeOpacity: 1,
                                  fillColor: '#ff0000', fillOpacity: 0.05, zIndex: 1 });
  pg.setMap(m);
  const R = { LAT, LNG, dLat, dLng };
  const merc = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * (Math.PI / 180)) / 2));
  const el = document.querySelector('.kakao-map-wrap > div');

  window.__measure = () => {
    const v = window.__redevDiag.view();
    if (!v) return null;
    const cont = el.getBoundingClientRect();
    const toPx = (lat, lng) => [v.p0x + (lng - v.cLng) * v.pxPerLng, v.p0y + (merc(lat) - v.m0) * v.pxPerMerc];
    const a = toPx(R.LAT - R.dLat, R.LNG - R.dLng);
    const b = toPx(R.LAT + R.dLat, R.LNG + R.dLng);
    const cb = [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])];
    let poly = null;
    for (const s of el.querySelectorAll('svg')) for (const p of s.querySelectorAll('path')) {
      if (getComputedStyle(p).stroke === 'rgb(255, 0, 0)') {
        const r = p.getBoundingClientRect();
        poly = [r.x - cont.x, r.y - cont.y, r.width, r.height];
      }
    }
    if (!poly) return null;
    const dx = (cb[0] + cb[2] / 2) - (poly[0] + poly[2] / 2);
    const dy = (cb[1] + cb[3] / 2) - (poly[1] + poly[3] / 2);
    return {
      level: m.getLevel(),
      centerPx: Math.round(Math.hypot(dx, dy) * 10) / 10,
      sizePx: Math.round(Math.max(Math.abs(cb[2] - poly[2]), Math.abs(cb[3] - poly[3])) * 10) / 10,
      box: cb[2],
    };
  };

  window.__frames = [];
  window.__recording = false;
  // 측정은 그 프레임의 rAF 콜백이 모두 끝난 뒤(setTimeout 0)에 한다.
  // 그래야 canvas 가 그 프레임에 이미 다시 그려진 상태(viewRef)와 카카오 SVG 가 같은 순간을 가리킨다.
  const tick = () => {
    if (window.__recording) {
      setTimeout(() => {
        if (!window.__recording) return;
        const r = window.__measure();
        if (r) window.__frames.push(r);
      }, 0);
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return true;
}
"""


def start_rec(page):
    page.evaluate("() => { window.__frames = []; window.__recording = true; }")


def stop_rec(page):
    return page.evaluate("() => { window.__recording = false; return window.__frames; }")


def report(label, frames):
    if not frames:
        print(f"### {label}: 프레임 없음")
        return
    worst_c = max(f["centerPx"] for f in frames)
    worst_s = max(f["sizePx"] for f in frames)
    within = sum(1 for f in frames if f["centerPx"] <= 2 and f["sizePx"] <= 2)
    print(f"### {label}: {len(frames)}프레임  중심오차 최대 {worst_c}px · 크기오차 최대 {worst_s}px "
          f"· 2px 이내 {within}/{len(frames)}프레임 ({100 * within / len(frames):.0f}%)")
    ordered = sorted(frames, key=lambda f: -max(f["centerPx"], f["sizePx"]))[:3]
    for f in ordered:
        print(f"    최악 L={f['level']} 중심={f['centerPx']}px 크기={f['sizePx']}px (도형폭 {f['box']:.0f}px)")


def scenario(page, name, act):
    start_rec(page)
    act()
    time.sleep(0.9)
    report(name, stop_rec(page))
    time.sleep(0.6)


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--no-sandbox"])
        ctx = browser.new_context(viewport={"width": 1000, "height": 950}, device_scale_factor=1)
        page = ctx.new_page()
        page.goto(URL, wait_until="domcontentloaded")
        page.wait_for_selector(".kakao-zone-canvas", timeout=30000)
        time.sleep(3.5)
        page.evaluate(
            "() => { const m = window.__redevDiag.map();"
            " m.setCenter(new kakao.maps.LatLng(37.4842, 126.9295)); m.setLevel(6); }"
        )
        time.sleep(1.6)
        page.evaluate(SETUP)
        time.sleep(0.4)
        print("기준(정지):", json.dumps(page.evaluate("() => window.__measure()"), ensure_ascii=False))

        box = page.query_selector(".kakao-map-wrap > div").bounding_box()
        cx, cy = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2

        def hover():
            page.mouse.move(cx, cy)
            time.sleep(0.25)

        scenario(page, "휠 줌인 (1단계)", lambda: (hover(), page.mouse.wheel(0, -110)))
        scenario(page, "휠 줌아웃 (1단계)", lambda: (hover(), page.mouse.wheel(0, 110)))

        def burst():
            hover()
            for _ in range(3):
                page.mouse.wheel(0, -110)
                time.sleep(0.12)

        scenario(page, "연속 휠 줌인 (3단계)", burst)
        scenario(page, "확대 버튼", lambda: page.click('button[aria-label="확대"]'))
        scenario(page, "축소 버튼", lambda: page.click('button[aria-label="축소"]'))

        page.click('button[title^="스카이뷰"]')
        time.sleep(2.5)
        scenario(page, "스카이뷰에서 휠 줌인", lambda: (hover(), page.mouse.wheel(0, -110)))
        page.click('button[title^="스카이뷰"]')
        time.sleep(1.5)

        # ── 화면 크기 변경(relayout) 후에도 지도·경계가 맞는지 ─────────────────
        print("### 화면 크기 변경 후 정렬 (map.relayout)")
        for size in [(1440, 900), (1100, 760), (390, 844), (1440, 900)]:
            page.set_viewport_size({"width": size[0], "height": size[1]})
            time.sleep(1.0)
            chk = page.evaluate(
                """() => {
                  const m = window.__redevDiag.map();
                  const el = document.querySelector('.kakao-map-wrap > div');
                  const canvas = document.querySelector('.kakao-zone-canvas');
                  const cont = el.getBoundingClientRect();
                  const cr = canvas.getBoundingClientRect();
                  const v = window.__redevDiag.view();
                  const c = m.getCenter();
                  const pc = m.getProjection().containerPointFromCoords(new kakao.maps.LatLng(c.getLat(), c.getLng()));
                  return {
                    mapBox: [Math.round(cont.width), Math.round(cont.height)],
                    canvasBox: [Math.round(cr.width), Math.round(cr.height)],
                    viewW: Math.round(v.W), viewH: Math.round(v.H),
                    centerDelta: Math.round(Math.hypot(pc.x - v.W / 2, pc.y - v.H / 2) * 10) / 10,
                    measure: window.__measure(),
                  };
                }"""
            )
            print(f"    {size[0]}x{size[1]} → 지도 {chk['mapBox']} · canvas {chk['canvasBox']} · view {chk['viewW']}x{chk['viewH']}"
                  f" · 중심어긋남 {chk['centerDelta']}px · 경계오차 {chk['measure']['centerPx']}px")

        # 육안 확인용: 줌 직후 연속 스크린샷
        page.evaluate(
            "() => { const m = window.__redevDiag.map();"
            " m.setCenter(new kakao.maps.LatLng(37.4842, 126.9295)); m.setLevel(6); }"
        )
        time.sleep(1.8)
        hover()
        page.mouse.wheel(0, -110)
        for i in range(3):
            page.screenshot(path=f"{SHOT_DIR}/after_zoom_{i}.png", clip=box)
        time.sleep(1.0)
        page.screenshot(path=f"{SHOT_DIR}/after_zoom_3.png", clip=box)
        print("스크린샷:", f"{SHOT_DIR}/after_zoom_0..3.png")
        ctx.close()
        browser.close()


if __name__ == "__main__":
    main()
