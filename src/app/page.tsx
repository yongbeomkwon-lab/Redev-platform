import { Suspense } from "react";
import ZoneExplorer from "@/components/ZoneExplorer";

// 메인 = 지도 탐색. 히어로·소개 섹션 없이 지도가 화면을 가득 채운다(네이버지도 방식).
//   무료/유료 안내는 지도 위 패널과 구역 상세 안에 이미 들어가 있다.
//
//   · ZoneExplorer 는 `useSearchParams()` 로 `?zone=`·`?my=` 를 읽는다(2026-11-27 — 클라이언트
//     이동에서 `window.location` 이 이전 주소를 가리켜 마지막 화면이 덮어쓰던 버그 수정).
//   · 정적으로 미리 만들어 두는 화면에서 그 훅을 쓰려면 Suspense 로 감싸야 한다.
//     첫 화면이 잠깐 비지 않도록, 예전 로딩 화면과 같은 자리표시자를 보여 준다.
function MapShellFallback() {
  return (
    <div className="flex h-[calc(100dvh-52px)] items-center justify-center bg-slate-100 text-sm text-slate-500">
      데이터를 불러오는 중…
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<MapShellFallback />}>
      <ZoneExplorer />
    </Suspense>
  );
}
