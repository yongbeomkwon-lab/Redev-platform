#!/usr/bin/env python3
"""구역 경계 내 실거래가 필터링 검증 (로컬/배포 공용)

  사용:
    MODE=prod scripts/with-dev.sh python3 scripts/verify-zone-tx.py
    TARGET_URL=https://redev-platform-iota.vercel.app/python3 scripts/verify-zone-tx.py

  확인 항목
    1) 한남3·4·5구역을 각각 눌렀을 때 '구역 내' 건수·목록이 서로 다르다
    2) '구역 내'가 기본 탭이고 '법정동 전체'로 한 번에 전환된다(전체 ⊃ 구역 내, 배지 유지)
    3) 구역이 걸치는 법정동이 2개 이상이면 라벨에 모두 나온다(한남5 → 동빙고동·서빙고동·주성동 …)
    4) 구역 내 0건이어도 크래시 없이 안내 + [법정동 전체 보기] 버튼이 뜬다(한남3구역)
    5) 단독·다가구 탭은 '구역 내'에서 지번 마스킹 안내로 대체된다
    6) 경계 도형이 없는 구역(사당21)은 토글 없이 법정동 전체만 보여준다
    7) 비교 스크린샷 downloads/redev-hannam-zone-tx.png
    8) 콘솔 오류 0건
"""
import os
import re
import sys
import time

from playwright.sync_api import sync_playwright

URL = os.environ.get("TARGET_URL", "http://localhost:3100/?diag=1")
SHOT_COMPARE = "/workspace/downloads/redev-hannam-zone-tx.png"
SHOT_DIR = "/workspace/downloads"

ZONES = ["한남3구역", "한남4구역", "한남5구역"]

failures: list[str] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail else ""))
    if not ok:
        failures.append(name)


def pick_zone(page, name: str) -> None:
    inp = page.get_by_test_id("zone-search-input")
    inp.click()
    inp.fill(name)
    page.wait_for_selector("[data-testid=zone-result]", timeout=20000)
    page.get_by_test_id("zone-result").first.click()
    page.wait_for_selector("[data-testid=zone-tx]", timeout=30000)


def wait_ready(page) -> None:
    """국토부 조회가 끝나 '구역 내 / 법정동 전체' 탭이 뜰 때까지"""
    page.wait_for_selector("[data-testid=tx-mode-zone]", timeout=120000)


def wait_geo_done(page, timeout=150) -> float:
    """지번 좌표 판정(진행 표시)이 끝날 때까지"""
    t0 = time.time()
    while time.time() - t0 < timeout:
        if page.locator("[data-testid=tx-geo-progress]").count() == 0:
            return time.time() - t0
        time.sleep(0.4)
    print("  (경고) 경계 판정 대기 시간 초과")
    return time.time() - t0


def state(page) -> dict:
    tx = page.locator("[data-testid=zone-tx]").first
    z = tx.locator("[data-testid=tx-mode-zone]")
    d = tx.locator("[data-testid=tx-mode-dong]")
    rows = tx.locator("[data-testid=tx-rows] > li")
    return {
        "text": tx.inner_text(),
        "zone_label": z.first.inner_text().replace("\n", " ") if z.count() else None,
        "dong_label": d.first.inner_text().replace("\n", " ") if d.count() else None,
        "zone_active": bool(z.count() and "bg-blue-900" in (z.first.get_attribute("class") or "")),
        "dong_active": bool(d.count() and "bg-blue-900" in (d.first.get_attribute("class") or "")),
        "rows": [t.replace("\n", " | ") for t in rows.all_inner_texts()],
        "empty": tx.locator("[data-testid=tx-zone-empty]").count() > 0,
    }


def num(label: str | None) -> int | None:
    if not label:
        return None
    m = re.search(r"(\d+)\s*$", label.strip())
    return int(m.group(1)) if m else None


def addrs(rows: list[str], k: int = 3) -> list[str]:
    """행 텍스트에서 '동 지번'만 뽑는다 — 가격·날짜가 겹쳐도 필지로 비교한다"""
    out = []
    for r in rows[:k]:
        m = re.search(r"([가-힣]{2,6}동)\s+([0-9]+(?:-[0-9]+)?)", r)
        out.append(f"{m.group(1)} {m.group(2)}" if m else r[:40])
    return out


def shot(page, path: str) -> None:
    tx = page.locator("[data-testid=zone-tx]").first
    tx.scroll_into_view_if_needed()
    time.sleep(0.4)
    tx.screenshot(path=path)


def run() -> int:
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--no-sandbox"])
        ctx = browser.new_context(viewport={"width": 1500, "height": 1000}, device_scale_factor=2)
        page = ctx.new_page()
        console_errors: list[str] = []
        page.on("pageerror", lambda e: console_errors.append("pageerror: " + str(e)[:200]))
        page.on(
            "console",
            lambda m: console_errors.append("console: " + m.text[:200]) if m.type == "error" else None,
        )
        page.goto(URL, wait_until="domcontentloaded")
        page.wait_for_selector(".kakao-zone-canvas", timeout=60000)
        time.sleep(2)
        check("카카오맵 · services 로드", page.evaluate("() => !!window.kakao?.maps?.services"))

        states: dict[str, dict] = {}
        for name in ZONES:
            print(f"── {name}")
            pick_zone(page, name)
            wait_ready(page)
            took = wait_geo_done(page)
            st = state(page)
            states[name] = st
            print(f"    구역 내 {st['zone_label']} / 법정동 {st['dong_label']} · 판정 {took:.1f}s · 행 {len(st['rows'])}")
            for r in st["rows"][:4]:
                print(f"      · {r[:112]}")
            check(f"{name} '구역 내' 탭 기본", st["zone_active"] and not st["dong_active"])
            check(f"{name} 두 탭 라벨", st["zone_label"] is not None and st["dong_label"] is not None,
                  f"{st['zone_label']} / {st['dong_label']}")
            shot(page, f"{SHOT_DIR}/redev-tx-{name}.png")

        z3, z4, z5 = (states[z] for z in ZONES)
        n3, n4, n5 = (num(s["zone_label"]) for s in (z3, z4, z5))
        t3, t4, t5 = (num(s["dong_label"]) for s in (z3, z4, z5))
        print(f"\n구역 내 건수: 한남3={n3} 한남4={n4} 한남5={n5}  /  법정동 전체: {t3}/{t4}/{t5}")
        check("세 구역 '구역 내' 건수가 서로 다르다", len({n3, n4, n5}) >= 2, f"{n3}/{n4}/{n5}")
        check("구역 내 ⊂ 법정동 전체", all(a is not None and b is not None and a <= b for a, b in
                                            ((n3, t3), (n4, t4), (n5, t5))), f"{n3}≤{t3}, {n4}≤{t4}, {n5}≤{t5}")

        a3, a4, a5 = addrs(z3["rows"]), addrs(z4["rows"]), addrs(z5["rows"])
        print(f"  한남3 상위: {a3}\n  한남4 상위: {a4}\n  한남5 상위: {a5}")
        check("한남4·한남5 상위 거래가 겹치지 않는다", not set(a4) & set(a5), f"겹침={set(a4) & set(a5)}")
        check("한남4 '구역 내' 표시 없음(전부 구역 안)", "구역 내" not in " ".join(z4["rows"]))
        m5 = re.search(r"([가-힣·]+)\s*·\s*6개월", z5["text"])
        m3 = re.search(r"([가-힣·]+)\s*·\s*6개월", z3["text"])
        print(f"  구역이 걸치는 법정동: 한남3={m3.group(1) if m3 else None} · 한남5={m5.group(1) if m5 else None}")
        check("한남3 걸치는 법정동 = 한남동·보광동", bool(m3) and "한남동" in m3.group(1) and "보광동" in m3.group(1))
        check("한남5 걸치는 법정동 3개 이상", bool(m5) and len(m5.group(1).split("·")) >= 3, m5.group(1) if m5 else None)

        # ── 한남3: 구역 내 0건 → 안내 + 버튼 ──────────────────────────────────
        check("한남3 구역 내 0건 안내", z3["empty"] and "구역 경계 안에서" in z3["text"])
        check("한남3 [법정동 전체 보기] 버튼", "전체 보기" in z3["text"] and "한남동·보광동 전체 보기" in z3["text"])
        pick_zone(page, "한남3구역")
        wait_ready(page)
        wait_geo_done(page)
        if page.locator("[data-testid=tx-show-all]").count():
            page.get_by_test_id("tx-show-all").first.click()
            time.sleep(0.8)
            after = state(page)
            check("빈 상태 버튼으로 법정동 전체 전환", after["dong_active"] and num(after["dong_label"]) not in (None, 0),
                  after["dong_label"])
            shot(page, f"{SHOT_DIR}/redev-tx-hannam3-dong-all.png")
        else:
            check("빈 상태 버튼으로 법정동 전체 전환", False, "tx-show-all 버튼 없음")

        # ── 단독·다가구 탭 (구역 내) ─────────────────────────────────────────
        pick_zone(page, "한남4구역")
        wait_ready(page)
        wait_geo_done(page)
        page.locator("[data-testid=zone-tx]").first.get_by_role(
            "button", name=re.compile(r"^단독·다가구")
        ).first.click()
        time.sleep(0.6)
        solo = state(page)
        check(
            "구역 내 + 단독·다가구 → 지번 마스킹 안내",
            "지번을 `1**`처럼 가려서" in solo["text"],
            solo["text"][:120].replace("\n", " "),
        )
        page.locator("[data-testid=zone-tx]").first.get_by_role(
            "button", name=re.compile(r"^전체")
        ).first.click()
        time.sleep(0.4)
        page.get_by_test_id("tx-mode-dong").first.click()
        time.sleep(0.8)
        dong_all = state(page)
        check("법정동 전체에서 '구역 내' 배지 유지", "구역 내" in " ".join(dong_all["rows"]))
        shot(page, f"{SHOT_DIR}/redev-tx-hannam4-dong-all.png")

        # ── 경계 미고시 구역 ─────────────────────────────────────────────────
        pick_zone(page, "사당21구역")
        time.sleep(1.0)
        page.wait_for_selector("[data-testid=zone-tx]", timeout=30000)
        t0 = time.time()
        while time.time() - t0 < 60 and "불러오는 중" in page.locator("[data-testid=zone-tx]").first.inner_text():
            time.sleep(0.5)
        nob = state(page)
        check("경계 미고시 구역 — 토글 없음", nob["zone_label"] is None and nob["dong_label"] is None)
        check("경계 미고시 구역 — 안내 문구", "경계 도형이 없어" in nob["text"], nob["text"][:160].replace("\n", " "))
        shot(page, f"{SHOT_DIR}/redev-tx-sadang21.png")

        # ── 다른 구역 스모크 (경계 정밀 도형·큰 동) ──────────────────────────
        for name in ["신림1구역", "상도23구역"]:
            pick_zone(page, name)
            wait_ready(page)
            took = wait_geo_done(page)
            st = state(page)
            zc = num(st["zone_label"])
            print(f"── {name}: {st['zone_label']} / {st['dong_label']} · 판정 {took:.1f}s")
            check(f"{name} 구역 내 거래 있음", bool(zc), f"구역 내 {zc}건, 판정 {took:.1f}s")

        # ── 비교 이미지 (2열 × 2행, 열마다 자연 높이로 쌓기) ─────────────────
        try:
            from PIL import Image, ImageDraw

            cols = [
                [("한남3구역 · 구역 내 0건", f"{SHOT_DIR}/redev-tx-한남3구역.png"),
                 ("한남5구역 · 구역 내 9건", f"{SHOT_DIR}/redev-tx-한남5구역.png")],
                [("한남4구역 · 구역 내 5건", f"{SHOT_DIR}/redev-tx-한남4구역.png"),
                 ("한남3구역 · 법정동 전체 66건", f"{SHOT_DIR}/redev-tx-hannam3-dong-all.png")],
            ]
            MAXH = 1560
            pad, head = 18, 36
            loaded = []
            for col in cols:
                items = []
                for lab, path in col:
                    if not os.path.exists(path):
                        continue
                    im = Image.open(path).convert("RGB")
                    if im.height > MAXH:  # 위쪽(헤더 + 최근 거래)만 잘라 읽기 쉽게
                        im = im.crop((0, 0, im.width, MAXH))
                    items.append((lab, im))
                loaded.append(items)
            w = max(im.width for col in loaded for _, im in col) + pad * 2
            col_h = [sum(head + im.height + pad for _, im in col) + pad for col in loaded]
            canvas = Image.new("RGB", (w * len(loaded), max(col_h)), (241, 245, 249))
            draw = ImageDraw.Draw(canvas)
            for ci, col in enumerate(loaded):
                y = pad
                for lab, im in col:
                    x = ci * w + pad
                    draw.text((x + 6, y + 10), lab, fill=(15, 23, 42))
                    y += head
                    canvas.paste(im, (x, y))
                    y += im.height + pad
            canvas.save(SHOT_COMPARE)
            print("비교 스크린샷:", SHOT_COMPARE, canvas.size)
        except Exception as e:  # noqa: BLE001
            print("비교 이미지 합성 실패:", e)

        check("콘솔 오류 없음", not console_errors, "; ".join(console_errors[:3]))
        ctx.close()
        browser.close()

    print("\n실패:", failures if failures else "없음")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(run())
