import ZoneExplorer from "@/components/ZoneExplorer";

// 메인 = 지도 탐색. 히어로·소개 섹션 없이 지도가 화면을 가득 채운다(네이버지도 방식).
//   무료/유료 안내는 지도 위 패널과 구역 상세 안에 이미 들어가 있다.
export default function Home() {
  return <ZoneExplorer />;
}
