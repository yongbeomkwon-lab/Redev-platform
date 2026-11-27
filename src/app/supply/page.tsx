import type { Metadata } from "next";
import SupplyForecast from "@/components/SupplyForecast";

// ─────────────────────────────────────────────────────────────────────────────
// /supply — 연도별·자치구별 예상 입주물량 (2026-11-27 신설)
//   · 데이터: public/data/supply-forecast.json (서울 열린데이터광장 OA-22856 ·
//     정비사업 정보몽땅 사업개요 · SH 주택관리현황을 구역 단위로 붙인 집계)
//   · 지도(/ )와 분리한 읽기 전용 화면 — 필터·차트·표·구역 목록은 클라이언트에서 돈다.
// ─────────────────────────────────────────────────────────────────────────────

export const metadata: Metadata = {
  title: "연도별 예상 입주물량 — 리디브(redev)",
  description:
    "서울 정비사업 2,400여 구역의 계획 세대수와 예상 입주연도를 자치구·연도별로 정리했습니다. 2026~2031년 자치구별 입주물량과 주요 단지, 2032년 이후 물량까지 한눈에 봅니다.",
};

export default function SupplyPage() {
  return <SupplyForecast />;
}
