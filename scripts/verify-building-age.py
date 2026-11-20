#!/usr/bin/env python3
"""노후도(건물 연식) 오버레이 검증 — 로컬/배포 공용

  사용:
    TARGET_URL=https://redev-platform-iota.vercel.app python3 scripts/verify-building-age.py

  ※ 로컬(`TARGET_URL=http://localhost:3100`)로는 건물이 칠해지지 않는다 — 이 작업 환경의
    프록시가 api.vworld.kr 를 막기 때문이다(서버 라우트가 VWORLD_UNREACHABLE). 검증은 운영 도메인으로 한다.
    TARGET_URL=http://localhost:3100 python3 scripts/verify-building-age.py

  확인 항목
    1) 지도 툴바에 `노후도` 토글이 있고, 켜면 범례가 뜨고 aria-pressed 가 true 다
    2) 서울 전체(멀리 보는) 배율에서는 '더 확대하면…' 안내가 뜨고 건물을 그리지 않는다
    3) `신림1구역`으로 이동하면 범례가 `건물 N동` 으로 바뀌고, 캔버스에 5개 구간 색이 실제로 칠해진다
       (캔버스 픽셀에서 구간 색을 세어 확인 — 단순히 '데이터를 받았다'가 아니라 '칠해졌다'를 본다)
    4) 구간별 동수 합 == 총 동수
    5) 토글을 끄면 범례가 사라지고 캔버스에서 건물 색이 사라진다
    6) 콘솔 오류 0건 (API 오류 응답이 있으면 그 내용도 함께 보여 준다)
    7) 스크린샷 downloads/redev-aging-sinrim1.png
"""
import os
import re
import sys
import time

from playwright.sync_api import sync_playwright

URL = os.environ.get("TARGET_URL", "http://localhost:3100")
ZONE_ID = os.environ.get("ZONE_ID", "")
if ZONE_ID:
    URL = f"{URL.rstrip('/')}/?zone={ZONE_ID}"
SHOT = os.environ.get("SHOT", "/workspace/downloads/redev-aging-sinrim1.png")
ZONE = os.environ.get("ZONE_NAME", "신림1구역")

# src/lib/building-age.ts 의 AGE_CLASSES 색과 같아야 한다
CLASS_COLORS = ["#b91c1c", "#ea580c", "#eab308", "#16a34a", "#94a3b8"]

failures: list[str] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail else ""))
    if not ok:
        failures.append(name)


PIXELS_JS = """
([colors]) => {
  const c = document.querySelector('.kakao-zone-canvas');
  if (!c) return { error: 'no canvas' };
  const ctx = c.getContext('2d');
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  const hex = (h) => [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)];
  const rgb = colors.map(hex);
  const per = colors.map(() => 0);
  let painted = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i+3] < 60) continue;
    painted++;
    let best = -1, bestD = 1e9;
    for (let k = 0; k < rgb.length; k++) {
      const dd = Math.abs(d[i]-rgb[k][0]) + Math.abs(d[i+1]-rgb[k][1]) + Math.abs(d[i+2]-rgb[k][2]);
      if (dd < bestD) { bestD = dd; best = k; }
    }
    if (best >= 0 && bestD <= 40) per[best]++;
  }
  return { painted, per, w: c.width, h: c.height };
}
"""


def legend(page):
    loc = page.locator("[data-testid=aging-legend]")
    if loc.count() == 0:
        return None
    return loc.first.inner_text().replace("\n", " | ")


def legend_counts(text: str | None) -> list[int]:
    if not text:
        return []
    return [int(v.replace(",", "")) for v in re.findall(r"(?<![\d,])(\d[\d,]*)", text)]


def main() -> int:
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--no-sandbox"])
        ctx = browser.new_context(viewport={"width": 1500, "height": 1000}, device_scale_factor=2)
        page = ctx.new_page()
        errors: list[str] = []
        api: list[str] = []
        page.on("pageerror", lambda e: errors.append("pageerror: " + str(e)[:200]))
        page.on(
            "console",
            lambda m: errors.append("console: " + m.text[:200]) if m.type == "error" else None,
        )
        page.on(
            "response",
            lambda r: api.append(f"{r.status} {r.url[:120]}")
            if "/api/building-age" in r.url and r.status >= 400
            else None,
        )

        page.goto(URL, wait_until="domcontentloaded")
        page.wait_for_selector(".kakao-zone-canvas", timeout=60000)
        time.sleep(2)
        check("카카오맵 로드", page.evaluate("() => !!window.kakao?.maps"))

        toggle = page.locator("[data-testid=aging-toggle]")
        check("노후도 토글 존재", toggle.count() == 1, f"{toggle.count()}개")
        check("처음엔 범례 없음", page.locator("[data-testid=aging-legend]").count() == 0)

        toggle.first.click()
        time.sleep(1.2)
        check("토글 켜짐(aria-pressed)", toggle.first.get_attribute("aria-pressed") == "true")
        far_text = legend(page)
        check("멀리 볼 때 범례 안내", bool(far_text and "더 확대" in far_text), far_text or "(범례 없음)")
        far_pix = page.evaluate(PIXELS_JS, [CLASS_COLORS])
        check(
            "멀리 볼 때는 건물을 칠하지 않음",
            far_pix.get("painted", 0) < 2000,
            f"칠해진 픽셀 {far_pix.get('painted')}",
        )

        # 신림1구역으로 이동 — 검색 후 첫 결과 클릭(사용자가 하는 그대로)
        inp = page.get_by_test_id("zone-search-input")
        inp.click()
        inp.fill(ZONE)
        page.wait_for_selector("[data-testid=zone-result]", timeout=20000)
        page.get_by_test_id("zone-result").first.click()
        time.sleep(1.5)

        # 건물 타일이 도착해 `건물 N동` 이 될 때까지
        t0 = time.time()
        text = legend(page)
        while time.time() - t0 < 90:
            text = legend(page)
            if text and re.search(r"건물\s*[\d,]+\s*동", text):
                break
            time.sleep(1.0)
        waited = round(time.time() - t0, 1)
        print(f"  (범례) {text}   [{waited}s]")

        m = re.search(r"건물\s*([\d,]+)\s*동", text or "")
        total = int(m.group(1).replace(",", "")) if m else 0
        check("건물 동수 표시", total > 0, f"{total}동 ({waited}s)")

        nums = legend_counts(text)
        # 범례 앞쪽 숫자 5개가 구간별 동수 — 합이 총계와 같아야 한다
        per_text = nums[:5] if len(nums) >= 5 else []
        check(
            "구간별 동수 합 == 총계",
            bool(per_text) and sum(per_text) == total,
            f"{per_text} → {sum(per_text) if per_text else 0} vs {total}",
        )

        pix = page.evaluate(PIXELS_JS, [CLASS_COLORS])
        per = pix.get("per") or []
        print(f"  (캔버스) 칠해진 픽셀 {pix.get('painted')} · 구간별 {per} · 캔버스 {pix.get('w')}x{pix.get('h')}")
        check("캔버스에 건물 색이 칠해짐", pix.get("painted", 0) > 20000, f"{pix.get('painted')} px")
        check(
            "30년 이상(빨강)이 실제로 보임",
            len(per) > 0 and per[0] > 500,
            f"{per[0] if per else 0} px",
        )
        painted_classes = sum(1 for v in per if v > 50) if per else 0
        check("2개 이상 구간이 함께 보임", painted_classes >= 2, f"{painted_classes}개 구간")

        page.screenshot(path=SHOT)
        print(f"  스크린샷: {SHOT}")

        toggle.first.click()
        time.sleep(1.0)
        check("토글 끄면 범례 사라짐", page.locator("[data-testid=aging-legend]").count() == 0)
        off = page.evaluate(PIXELS_JS, [CLASS_COLORS])
        check(
            "토글 끄면 건물 색 사라짐(구역 경계만 남음)",
            off.get("painted", 0) < pix.get("painted", 0) * 0.35,
            f"{off.get('painted')} px (켰을 때 {pix.get('painted')} px)",
        )

        check("콘솔 오류 0건", len(errors) == 0, "; ".join(errors[:3]))
        check("building-age API 오류 0건", len(api) == 0, "; ".join(api[:3]))
        browser.close()

    print("\n" + ("ALL PASS" if not failures else f"{len(failures)} FAILURES: {failures}"))
    return 0 if not failures else 1


if __name__ == "__main__":
    sys.exit(main())
