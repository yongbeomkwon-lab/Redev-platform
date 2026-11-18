import time
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b=p.chromium.launch(args=["--no-sandbox"]); pg=b.new_context(viewport={"width":1440,"height":940}).new_page()
    errs=[]; pg.on("console", lambda m: errs.append(m.type+":"+m.text[:120]))
    pg.goto("http://localhost:3100/?diag=1", wait_until="domcontentloaded")
    pg.wait_for_selector(".kakao-zone-canvas", timeout=120000); time.sleep(4)
    print("초기 level", pg.evaluate("()=>window.__redevDiag.map().getLevel()"))
    box=pg.locator("input[placeholder*='구역명']").first
    box.click(); box.fill("사당동 419"); time.sleep(1.6)
    print("결과:", pg.locator("text=사당동 419").count())
    pg.get_by_text("(가칭)사당동 419 일대 민간도심복합", exact=True).first.click(timeout=8000)
    for i in range(6):
        time.sleep(1)
        print(i, "level", pg.evaluate("()=>window.__redevDiag.map().getLevel()"),
              "center", pg.evaluate("()=>{const c=window.__redevDiag.map().getCenter();return [c.getLat().toFixed(4),c.getLng().toFixed(4)]}"))
    print("errs", [e for e in errs if e.startswith("error")][:3])
    pg.screenshot(path="/workspace/gis-work/sadang/dbg_fit.png")
    b.close()
