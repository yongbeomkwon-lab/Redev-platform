"use client";
// ─────────────────────────────────────────────────────────────────────────────
// PwaRegister — 서비스 워커 등록 (2026-11-28)
//   · '/sw.js' 는 아무것도 캐시하지 않는다(public/sw.js 주석 참고).
//   · 프로덕션 빌드에서만 등록한다 — 개발 서버(3100)에서는 화면이 곧바로 바뀌어야 한다.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect } from "react";

export default function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const onLoad = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
    };
    if (document.readyState === "complete") onLoad();
    else window.addEventListener("load", onLoad, { once: true });
    return () => window.removeEventListener("load", onLoad);
  }, []);

  return null;
}
