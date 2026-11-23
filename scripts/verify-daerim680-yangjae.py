#!/usr/bin/env python3
"""대림동 680 고시 경계 · 양재2동 2구역 / 양재동 397-1 필지정합 경계 — 배포본 검수 + 스크린샷

  TARGET_URL=https://redev-platform-iota.vercel.app python3 scripts/verify-daerim680-yangjae.py

  확인
    1) 배포본의 zones.geojson 에 세 구역이 실린 그대로인가
       (daerim-680 = 고시도면·Polygon·76,753㎡ / yangjae-397-1·yangjae2-2 = 필지정합·boundaryApprox 없음)
    2) 검색과 `?zone=` 상세 패널이 각 구역을 제대로 보여 주는가
    3) 지도에 경계가 그려지는가(canvas draw) · 콘솔 오류 0건
    4) 스크린샷 2장 — downloads/redev_daerim680.png · downloads/redev_yangjae_fixed.png
"""
import json
import os
import time

from playwright.sync_api import sync_playwright

BASE = os.environ.get("TARGET_URL", "https://redev-platform-iota.vercel.app").rstrip("/")
OUT_DAERIM = "/workspace/downloads/redev_daerim680.png"
OUT_YANGJAE = "/workspace/downloads/redev_yangjae_fixed.png"
OUT_YANGJAE2 = "/workspace/downloads/redev_yangjae2_2_fixed.png"
failures: list[str] = []


def check(name, ok, detail=""):
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail else ""))
    if not ok:
        failures.append(name)


def search(page, q):
    inp = page.get_by_test_id("zone-search-input")
    inp.click()
    inp.fill("")
    inp.fill(q)
    time.sleep(1.2)


def enable_cadastral(page):
    """지적편집도(필지 경계·지번) 오버레이를 켠다 — 필지정합 경계를 눈으로 대조하기 위해."""
    try:
        btn = page.locator("button:has-text('지적편집도')").first
        if btn.get_attribute("aria-pressed") != "true":
            btn.click(timeout=5000)
            time.sleep(2.5)
            print("지적편집도 on")
    except Exception as exc:  # noqa: BLE001 — 없으면 지도만으로 검수
        print("지적편집도 토글 실패:", str(exc)[:80])


def zoom_steps(page, n: int):
    """앱의 확대(+)·축소(−) 버튼을 누른다 — 지도 인스턴스를 직접 만지지 않고 화면 배율을 바꾼다."""
    key = "확대" if n > 0 else "축소"
    btn = page.locator(f"button[aria-label='{key}']").first
    for _ in range(abs(n)):
        btn.click(timeout=5000)
        time.sleep(2.2)
    print(f"지도 {key} {abs(n)}단계")



def panel_text(page):
    aside = page.query_selector("aside")
    return aside.inner_text() if aside else page.locator("body").inner_text()


def scroll_panel_to(page, needle):
    """드로어를 '경계 도형' 줄이 보이게 스크롤 — 스크린샷에 근거가 남게."""
    page.evaluate(
        """(needle) => {
             const aside = document.querySelector('aside');
             if (!aside) return;
             const el = [...aside.querySelectorAll('dt,dd,p,span')].find((n) => n.textContent.trim().startsWith(needle));
             if (el) el.scrollIntoView({ block: 'center' });
           }""",
        needle,
    )
    time.sleep(0.8)


def fetch_zones(page):
    return page.evaluate(
        """async () => {
             const r = await fetch('/data/zones.geojson?verify=' + Date.now(), { cache: 'no-store' });
             const d = await r.json();
             const pick = (id) => {
               const f = (d.features || []).find((x) => x.properties.id === id);
               if (!f) return null;
               const g = f.geometry || {};
               return {
                 geomType: g.type || null,
                 verts: g.type === 'Polygon' ? g.coordinates[0].length - 1 : g.type === 'MultiPolygon' ? g.coordinates[0][0].length - 1 : 0,
                 props: f.properties,
               };
             };
             return { count: (d.features || []).length, daerim: pick('daerim-680'), z397: pick('yangjae-397-1'), yj22: pick('yangjae2-2') };
           }"""
    )


def run():
    with sync_playwright() as p:
        b = p.chromium.launch(args=["--no-sandbox"])
        ctx = b.new_context(viewport={"width": 1440, "height": 1000}, device_scale_factor=2)
        page = ctx.new_page()
        errs: list[str] = []
        page.on("pageerror", lambda e: errs.append("pageerror: " + str(e)[:200]))
        page.on("console", lambda m: errs.append("console: " + m.text[:160]) if m.type == "error" else None)

        # ── 1) 배포본 데이터 ────────────────────────────────────────────────
        page.goto(f"{BASE}/?diag=1", wait_until="domcontentloaded")
        page.wait_for_selector(".kakao-zone-canvas", timeout=90000)
        time.sleep(4)
        data = fetch_zones(page)
        check("배포본 구역 수 2,440곳 유지", data["count"] == 2440, str(data["count"]))
        d = data["daerim"] or {}
        check(
            "daerim-680 = 고시도면 Polygon 250정점 · 76,753㎡ · asOf 2026-11-23",
            d.get("geomType") == "Polygon"
            and d["props"].get("geom") == "고시도면"
            and round(d["props"].get("area") or 0) == 76753
            and d["props"].get("asOf") == "2026-11-23"
            and d.get("verts") == 250,
            f"{d.get('geomType')} {d.get('verts')}정점 geom={d['props'].get('geom')} area={d['props'].get('area')}",
        )
        note = d["props"].get("note") or ""
        check(
            "daerim-680 최신 고시 3건 문구 반영",
            "제2026-639호" in note and "권리산정기준일 2026-08-24" in note and "2026-11-24~2028-01-28" in note,
        )
        for key, name, area, verts in (("z397", "yangjae-397-1", 41005, 39), ("yj22", "yangjae2-2", 56162, 37)):
            z = data[key] or {}
            check(
                f"{name} = 필지정합 Polygon {verts}정점 · {area:,}㎡ 유지 · boundaryApprox 없음",
                z.get("geomType") == "Polygon"
                and z["props"].get("geom") == "필지정합"
                and z["props"].get("boundaryApprox") is False
                and round(z["props"].get("area") or 0) == area
                and z.get("verts") == verts,
                f"{z.get('geomType')} {z.get('verts')}정점 geom={z['props'].get('geom')} approx={z['props'].get('boundaryApprox')} area={z['props'].get('area')}",
            )
            check(
                f"{name} boundaryNote 에 필지정합 계측 면적 기재",
                ("41,100" in (z["props"].get("boundaryNote") or "")) if key == "z397" else ("56,684" in (z["props"].get("boundaryNote") or "")),
            )

        # ── 2) 대림동 680 — 검색·패널·지도 ───────────────────────────────────
        search(page, "대림동 680")
        body = page.locator("body").inner_text()
        check("검색 '대림동 680' 결과 노출", "대림동 680 일대" in body)
        page.keyboard.press("Escape")

        page.goto(f"{BASE}/?diag=1&zone=daerim-680", wait_until="domcontentloaded")
        page.wait_for_selector(".kakao-zone-canvas", timeout=90000)
        time.sleep(4)
        txt = panel_text(page)
        check("daerim-680 상세 패널 열림", "대림동 680 일대" in txt)
        check("상세 패널 — 고시 지형도면 경계 표기", "고시 지형도면에서 옮긴 경계" in txt)
        check("상세 패널 — 구역면적 76,753㎡", "76,753㎡" in txt)
        check("상세 패널 — '구역계 미고시' 배지 아님", "구역계 미고시" not in txt)
        check("상세 패널 — 토지거래허가구역 문구(2026-11-24~2028-01-28)", "2026-11-24~2028-01-28" in txt)
        enable_cadastral(page)  # 지적편집도를 먼저 켜고, 배율은 그 뒤에 앱 버튼으로
        zoom_steps(page, +2)
        scroll_panel_to(page, "경계 도형")
        page.screenshot(path=OUT_DAERIM)

        # ── 3) 양재동 397-1 · 양재2동 2구역 ─────────────────────────────────
        for zid, name, area_txt, note_txt in (
            ("yangjae-397-1", "양재동 397-1 일대(모아통합기획)", "41,005㎡", "연속지적도 필지선에 맞춰 다시 조립한 경계"),
            ("yangjae2-2", "양재2동 2구역", "56,162㎡", "연속지적도 필지선에 맞춰 다시 조립한 경계"),
        ):
            page.goto(f"{BASE}/?diag=1&zone={zid}", wait_until="domcontentloaded")
            page.wait_for_selector(".kakao-zone-canvas", timeout=90000)
            time.sleep(4)
            t = panel_text(page)
            check(f"{zid} 상세 패널 — 구역명·면적·필지정합 표기", name in t and area_txt in t and note_txt in t)
            check(
                f"{zid} 상세 패널 — 계측 면적·필지정합 설명",
                ("41,100" in t and "필지" in t) if zid == "yangjae-397-1" else ("56,684" in t and "필지" in t),
            )

        search(page, "양재동 397-1")
        body = page.locator("body").inner_text()
        check("검색 '양재동 397-1' 결과 노출", "양재동 397-1 일대" in body)
        page.keyboard.press("Escape")
        search(page, "양재2동 2구역")
        body = page.locator("body").inner_text()
        check("검색 '양재2동 2구역' 결과 노출", "양재2동 2구역" in body)
        page.keyboard.press("Escape")

        # 양재동 397-1(모아통합기획) — 필지정합 경계가 필지선을 따라가는지 확대해서 본다
        page.goto(f"{BASE}/?diag=1&zone=yangjae-397-1", wait_until="domcontentloaded")
        page.wait_for_selector(".kakao-zone-canvas", timeout=90000)
        time.sleep(4)
        enable_cadastral(page)
        zoom_steps(page, +2)
        scroll_panel_to(page, "경계 도형")
        page.screenshot(path=OUT_YANGJAE)

        # 양재2동 2구역도 같은 조건으로 한 장 더 (두 구역을 한 화면에 담으면 경계가 작아져 따로 남긴다)
        page.goto(f"{BASE}/?diag=1&zone=yangjae2-2", wait_until="domcontentloaded")
        page.wait_for_selector(".kakao-zone-canvas", timeout=90000)
        time.sleep(4)
        enable_cadastral(page)
        zoom_steps(page, +2)
        scroll_panel_to(page, "경계 도형")
        page.screenshot(path=OUT_YANGJAE2)

        # 지도에 실제로 그려졌는지 — 캔버스 드로우 횟수
        draws = page.evaluate("() => (window.__redevDiag && window.__redevDiag.draws ? window.__redevDiag.draws() : -1)")
        check("지도 캔버스 드로우 발생", isinstance(draws, int) and draws > 0, str(draws))

        real = [e for e in errs if "favicon" not in e and "ResizeObserver" not in e]
        check("콘솔 오류 0", len(real) == 0, str(real[:3]))
        print("saved", OUT_DAERIM, OUT_YANGJAE, OUT_YANGJAE2)
        ctx.close()
        b.close()
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(run())
