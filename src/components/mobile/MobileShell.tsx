"use client";
// ─────────────────────────────────────────────────────────────────────────────
// MobileShell — 폰 전용 앱 껍데기 (2026-11-28)
//
//   · 아래 고정 탭(홈·지도·검색·법령·판례·내 정보)을 모든 화면에 깔고,
//     홈(`/`)에서는 그 위에 모바일 홈 대시보드를 덮는다.
//   · 지도는 홈 뒤에 그대로 살아 있다 — 탭을 오갈 때 지도가 다시 그려지지 않고,
//     마지막으로 보던 구역·화면이 그대로 남는다(앱처럼 즉시 전환).
//   · **딥링크 우선**: `?zone=`·`?my=`·`?q=`·`?layer=`·`?admin=` 로 들어오면
//     홈을 띄우지 않고 곧바로 지도(해당 구역·도구가 열린 상태)로 간다.
//     공유 링크(`/?zone=…`)의 기존 동작을 폰에서도 깨지 않게 하는 규칙이다.
//   · 데스크톱(md 이상)에서는 아무것도 그리지 않는다 — PC 화면은 지금 그대로.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import MobileHome from "./MobileHome";
import MobileTabBar, { type MobileTab } from "./MobileTabBar";
import MobileMeSheet from "./MobileMeSheet";
import { requestMapLayer, type MapLayerRequest } from "@/lib/map-layer";

export default function MobileShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/";
  const router = useRouter();

  /** 지도 위에 홈 대시보드를 덮었는지 */
  const [homeOpen, setHomeOpen] = useState(false);
  const [meOpen, setMeOpen] = useState(false);
  /** 폰 폭(768px 미만)인가 — 데스크톱에서는 홈·탭 바를 아예 마운트하지 않는다 */
  const [narrow, setNarrow] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setNarrow(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // 경로가 바뀔 때마다 홈 표시를 다시 판단한다.
  useEffect(() => {
    const search = typeof window === "undefined" ? "" : window.location.search;
    const sp = new URLSearchParams(search);
    const deep =
      sp.has("zone") || sp.has("my") || sp.has("q") || sp.has("layer") || sp.get("admin") === "1";
    if (pathname !== "/" || deep) {
      setHomeOpen(false);
    } else {
      setHomeOpen(true);
    }
    setMeOpen(false);
  }, [pathname]);

  /** 지도 탭의 검색창을 연다 — 화면이 아직 없으면 잠깐 기다렸다 다시 찾는다 */
  const focusMapSearch = useCallback(() => {
    let tries = 0;
    const tick = () => {
      const el = document.getElementById("zone-search-input") as HTMLInputElement | null;
      if (el) {
        el.focus();
        el.scrollIntoView({ block: "nearest" });
        return;
      }
      if (tries++ < 12) window.setTimeout(tick, 80);
    };
    window.setTimeout(tick, 60);
  }, []);

  const goMap = useCallback(() => {
    setMeOpen(false);
    setHomeOpen(false);
    if (pathname !== "/") router.push("/");
  }, [pathname, router]);

  const goHome = useCallback(() => {
    setMeOpen(false);
    if (pathname !== "/") {
      // 다른 화면에서 홈으로 — 주소를 `/` 로 되돌리고 홈을 연다
      router.push("/");
      setHomeOpen(true);
      return;
    }
    // 지도에서 `?zone=` 으로 들어와 있던 주소는 지운다 — 홈을 새로고침해도 지도가 아니라 홈이 뜨게.
    if (typeof window !== "undefined" && window.location.search) router.push("/");
    setHomeOpen(true);
  }, [pathname, router]);

  const openPath = useCallback(
    (href: string) => {
      setMeOpen(false);
      setHomeOpen(false);
      router.push(href);
    },
    [router]
  );

  /** 홈 퀵메뉴 → 지도를 열고 그 도구(경매·공매 핀 / 구역 그리기)를 켠다 */
  const openLayer = useCallback(
    (layer: MapLayerRequest) => {
      setHomeOpen(false);
      if (pathname !== "/") router.push("/");
      requestMapLayer(layer);
    },
    [pathname, router]
  );

  /** 홈 검색에서 구역을 골랐다 — 지도를 그 구역으로 열고 홈을 닫는다 */
  const openZone = useCallback(
    (id: string) => {
      setHomeOpen(false);
      router.push(`/?zone=${encodeURIComponent(id)}`);
    },
    [router]
  );

  /** 홈 검색에서 주소·역 이름을 넘겼다 — 지도 검색이 주소 판정·역 핀까지 처리한다 */
  const submitSearch = useCallback(
    (q: string) => {
      setHomeOpen(false);
      router.push(`/?q=${encodeURIComponent(q)}`);
    },
    [router]
  );

  const onTab = useCallback(
    (tab: MobileTab) => {
      if (tab === "home") return goHome();
      if (tab === "map") return goMap();
      if (tab === "search") {
        setMeOpen(false);
        setHomeOpen(false);
        if (pathname !== "/") router.push("/");
        focusMapSearch();
        return;
      }
      if (tab === "laws") {
        setMeOpen(false);
        return router.push("/laws");
      }
      // 내 정보 — 시트
      setMeOpen(true);
    },
    [focusMapSearch, goHome, goMap, pathname, router]
  );

  const active: MobileTab | null = homeOpen
    ? "home"
    : pathname === "/"
      ? "map"
      : pathname.startsWith("/laws") || pathname.startsWith("/cases")
        ? "laws"
        : null;

  return (
    <>
      {children}

      {pathname === "/" && homeOpen && narrow && (
        <MobileHome
          onOpenMap={goMap}
          onOpenPath={openPath}
          onOpenLayer={openLayer}
          onOpenZone={openZone}
          onSearchSubmit={submitSearch}
        />
      )}

      <MobileTabBar active={active} onSelect={onTab} />
      <MobileMeSheet open={meOpen} onClose={() => setMeOpen(false)} onNavigate={openPath} />
    </>
  );
}
