"use client";
// 임시 검수 페이지 — 실거래 공유 카드가 실제로 어떻게 그려지는지 눈으로 확인한다.
//   · 국토부 API 연계 장애 기간에는 실거래 목록이 비어 카드 버튼을 볼 수 없어서,
//     같은 컴포넌트(TradeCardButton)를 **샘플 거래**로 띄워 렌더링 결과를 검수한다.
//   · 검수 후 이 폴더는 지운다(운영 화면에는 노출되지 않음).
import { useState } from "react";
import TradeCardButton from "@/components/TradeCardButton";
import ZoneRedevelopmentCheck from "@/components/ZoneRedevelopmentCheck";
import type { MolitTransaction } from "@/lib/molit";

function tx(over: Partial<MolitTransaction>): MolitTransaction {
  return {
    id: "s" + Math.random().toString(36).slice(2),
    kind: "아파트",
    name: "래미안 옥수 리버젠",
    umdNm: "옥수동",
    jibun: "123",
    areaSqm: 113.52,
    plottageSqm: null,
    floor: 14,
    buildYear: 2012,
    price: 325000,
    pyeongPrice: 9500,
    pyeongBasis: "전용",
    landPyeongPrice: null,
    dealDate: "2026-11-03",
    dealingType: "중개거래",
    canceled: false,
    canceledDate: null,
    scope: "zone",
    ...over,
  };
}

const APT: MolitTransaction[] = [
  tx({ dealDate: "2023-03-11", price: 178000, areaSqm: 84.9, floor: 8 }),
  tx({ dealDate: "2023-11-02", price: 205000, areaSqm: 113.52, floor: 11 }),
  tx({ dealDate: "2024-05-18", price: 262000, areaSqm: 113.52, floor: 15 }),
  tx({ dealDate: "2024-12-04", price: 248000, areaSqm: 113.52, floor: 9 }),
  tx({ dealDate: "2025-06-21", price: 284000, areaSqm: 113.52, floor: 17 }),
  tx({ dealDate: "2025-11-08", price: 297000, areaSqm: 113.52, floor: 12 }),
  tx({ dealDate: "2026-04-02", price: 291000, areaSqm: 113.52, floor: 5 }),
  tx({ dealDate: "2026-08-19", price: 318000, areaSqm: 113.52, floor: 19 }),
  tx({ dealDate: "2026-09-27", price: 312000, areaSqm: 113.52, floor: 7 }),
  tx({ dealDate: "2026-11-03", price: 325000, areaSqm: 113.52, floor: 14 }),
  tx({ dealDate: "2026-10-14", price: 214000, areaSqm: 84.9, floor: 6 }),
];

const VILLA: MolitTransaction[] = [
  tx({
    kind: "연립·다세대",
    name: "한아름맨션",
    umdNm: "금호동3가",
    jibun: "440-9",
    areaSqm: 59.8,
    plottageSqm: 33.1,
    floor: 3,
    buildYear: 1998,
    price: 47500,
    pyeongPrice: 2626,
    landPyeongPrice: 4740,
    dealDate: "2026-11-12",
    dealingType: "직거래",
  }),
  tx({
    kind: "연립·다세대",
    name: "한아름맨션",
    umdNm: "금호동3가",
    jibun: "440-9",
    areaSqm: 59.8,
    plottageSqm: 33.1,
    floor: 2,
    buildYear: 1998,
    price: 44000,
    pyeongPrice: 2432,
    landPyeongPrice: 4390,
    dealDate: "2025-04-08",
    dealingType: "중개거래",
  }),
  tx({
    kind: "연립·다세대",
    name: "한아름맨션",
    umdNm: "금호동3가",
    jibun: "440-9",
    areaSqm: 59.8,
    plottageSqm: 33.1,
    floor: 1,
    buildYear: 1998,
    price: 41500,
    pyeongPrice: 2293,
    landPyeongPrice: 4140,
    dealDate: "2024-02-15",
    dealingType: "중개거래",
  }),
];

export default function CardLab() {
  const [zone, setZone] = useState("금호23구역");
  return (
    <main className="mx-auto max-w-3xl space-y-4 p-4">
      <h1 className="text-lg font-bold">검수용 — 실거래 공유 카드 / 자가진단기</h1>
      <p className="text-[12px] text-slate-500">
        샘플 거래로 실제 카드 렌더러(TradeCardButton → canvas)를 그대로 띄운다. 버튼을 누르면 클립보드 복사 →
        안 되면 PNG 저장 + 미리보기.
      </p>

      <div className="rounded-xl border border-line bg-white p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-bold">아파트 (113.52㎡ · 32억 5,000만)</span>
          <TradeCardButton tx={APT[APT.length - 2]} peers={APT} zoneName={zone} />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-bold">연립·다세대 (59.8㎡ · 4억 7,500만)</span>
          <TradeCardButton tx={VILLA[0]} peers={VILLA} zoneName={zone} />
        </div>
      </div>

      <div className="rounded-xl border border-line bg-white p-3">
        <ZoneRedevelopmentCheck
          zoneName={zone}
          type="신통기획"
          stage="연번부여(2026-03-05)·후보지 신청 전"
          gu="성동구"
          kind="신속통합기획(재개발)"
          stageDates={{ prep: "2026-03-05" }}
        />
      </div>
      <div className="rounded-xl border border-line bg-white p-3">
        <ZoneRedevelopmentCheck
          zoneName="신림동 1464 가로주택"
          type="가로주택"
          stage="조합설립인가"
          gu="관악구"
          kind="가로주택정비사업"
          stageDates={{ union: "2023-05-11" }}
        />
      </div>
      <input
        className="w-full rounded border px-2 py-1 text-[12px]"
        value={zone}
        onChange={(e) => setZone(e.target.value)}
      />
    </main>
  );
}
