// ─────────────────────────────────────────────────────────────────────────────
// 매물 표시 문구 — 거래형태·층·방향·입주가능일·중개사무소 같은 **표시·광고 명시사항**과
// 부동산포스 양식의 건물·거래 항목(공급면적·현관구조·난방방식·엘리베이터·융자금·위반건축물)을
// 카드·목록·등록 미리보기가 같은 말로 쓰게 하는 순수 함수 모음.
//
//  · 값이 없으면 빈 문자열을 돌려준다 — 화면은 그 줄을 그리지 않는다(값을 지어내지 않는다).
//  · 매매는 기존 호칭(매매가·기보증금·초기투자금), 전세·월세는 그 거래에 맞는 말을 쓴다.
//    (전세보증금에 '기보증금'이나 '초기투자금'을 붙이면 실무에서 뜻이 달라진다.)
// ─────────────────────────────────────────────────────────────────────────────
import type { Listing } from "@/lib/types";
import { calcInitialInvestment, listingDeposit, listingTradeType } from "@/lib/types";
import { formatMan } from "@/lib/format";

/** 기준 금액의 이름 — 매매가 / 전세보증금 / 보증금 */
export function priceLabel(l: Listing): string {
  const t = listingTradeType(l);
  if (t === "전세") return "전세보증금";
  if (t === "월세") return "보증금";
  return "매매가";
}

/**
 * 가격 한 줄 — 예: `매매 7억 8,000만원`, `전세 4억 9,000만원`, `보증금 1억 / 월 600만원`
 *   · 목록 카드의 큰 금액 자리에 쓴다.
 */
export function priceHeadline(l: Listing): string {
  const t = listingTradeType(l);
  if (t === "전세") return `전세 ${formatMan(l.salePrice)}`;
  if (t === "월세") {
    const rent = l.monthlyRent && l.monthlyRent > 0 ? formatMan(l.monthlyRent) : "월세 미기재";
    return `보증금 ${formatMan(l.salePrice)} / ${rent}`;
  }
  return formatMan(l.salePrice);
}

/** 기보증금 줄 — 매매에서만 뜻이 있다(전세·월세는 deposit 을 쓰지 않는다) */
export function depositLine(l: Listing): string {
  if (listingTradeType(l) !== "매매") return "";
  const d = listingDeposit(l);
  return d > 0 ? `기보증금 ${formatMan(d)}` : "";
}

/** 처음 드는 돈의 이름 — 매매는 초기투자금, 전세·월세는 보증금 */
export function upfrontLabel(l: Listing): string {
  return listingTradeType(l) === "매매" ? "초기투자금" : "보증금";
}

/** 처음 드는 돈의 금액(만원) */
export function upfrontValue(l: Listing): number {
  return listingTradeType(l) === "매매" ? calcInitialInvestment(l) : Math.max(0, Math.round(l.salePrice));
}

/** 해당층 / 총층수 — 예: `3층 / 5층`, `반지하 / 5층` */
export function floorText(l: Listing): string {
  const floor = (l.floor ?? "").trim();
  const total = (l.totalFloors ?? "").trim();
  const withUnit = (v: string) => (/^\d+$/.test(v) ? `${v}층` : v);
  if (!floor && !total) return "";
  if (!total) return `${withUnit(floor)}`;
  if (!floor) return `총 ${withUnit(total)}`;
  return `${withUnit(floor)} / ${withUnit(total)}`;
}

/** 방 수 / 욕실 수 — 예: `방 3 · 욕실 1` */
export function roomsBathsText(l: Listing): string {
  const parts: string[] = [];
  if (typeof l.rooms === "number" && l.rooms > 0) parts.push(`방 ${l.rooms}`);
  if (typeof l.baths === "number" && l.baths > 0) parts.push(`욕실 ${l.baths}`);
  return parts.join(" · ");
}

/** 입주가능일 — `즉시입주` / `협의` / `2026-12-31` / `2026-12-31 즉시` */
export function moveInText(l: Listing): string {
  const v = (l.moveIn ?? "").trim();
  if (!v) return "";
  if (v === "즉시입주" || v === "협의") return v;
  return `입주 ${v}`;
}

/** 주차 — 입력 그대로 (예: `세대당 1대`, `가능(2대)`, `불가`) */
export function parkingText(l: Listing): string {
  const v = (l.parking ?? "").trim();
  if (!v) return "";
  if (/^\d+$/.test(v)) return `주차 ${v}대`;
  if (/^(가능|불가|있음|없음)/.test(v)) return v.startsWith("주차") ? v : `주차 ${v}`;
  return `주차 ${v}`;
}

/** 사용승인일 — `승인 1995-08-10` */
export function approvalText(l: Listing): string {
  const v = (l.approvalDate ?? "").trim();
  if (!v) return "";
  return `승인 ${v}`;
}

/** 관리비 — `관리비 5만원` */
export function maintenanceText(l: Listing): string {
  const v = (l.maintenanceFee ?? "").trim();
  if (!v) return "";
  if (v === "없음") return "관리비 없음";
  return v.startsWith("관리비") ? v : `관리비 ${v}`;
}

/** 공급면적 — `공급 49.5㎡` (전용면적과 짝을 이룬다) */
export function supplyAreaText(l: Listing): string {
  const v = l.supplyAreaSqm;
  if (typeof v !== "number" || !(v > 0)) return "";
  return `공급 ${v.toLocaleString()}㎡`;
}

/**
 * 융자금 — 세 상태를 구분한다(부동산포스 '표시안함 / 융자금없음 / 금액').
 *   · undefined = 표시 안 함 → 빈 문자열(그 줄을 그리지 않는다)
 *   · 0 = 융자금 없음
 *   · 1 이상 = 금액
 */
export function mortgageText(l: Listing): string {
  const v = l.mortgage;
  if (typeof v !== "number" || !Number.isFinite(v)) return "";
  if (v === 0) return "융자금 없음";
  return `융자금 ${formatMan(v)}`;
}

/** 기월세 — 매매에서 승계하는 임차인의 월세 */
export function tenantRentText(l: Listing): string {
  const v = l.tenantMonthlyRent;
  if (typeof v !== "number" || !(v > 0)) return "";
  return `기월세 ${formatMan(v)}`;
}

/** 이주비 — `이주비 1억 (무이자)` */
export function relocationText(l: Listing): string {
  const v = l.relocationCost;
  if (typeof v !== "number" || !(v > 0)) return "";
  return `이주비 ${formatMan(v)} (${l.relocationCostFree === false ? "유이자" : "무이자"})`;
}

/** 위반건축물 — 값이 없으면 빈 문자열(확인하지 않은 것을 '없음'으로 단정하지 않는다) */
export function violationText(l: Listing): string {
  const v = (l.violation ?? "").trim();
  if (!v) return "";
  if (v === "해당 없음" || v === "해당없음") return "위반건축물 없음";
  if (v.startsWith("위반")) return v.endsWith("있음") ? "위반건축물 있음" : v;
  if (v === "확인 필요") return "위반건축물 확인 필요";
  return v;
}

/** 대지면적 — `대지 312.4㎡` (대지지분과 다른 값임을 이름으로 구분한다) */
export function platAreaText(l: Listing): string {
  const v = l.platAreaSqm;
  if (typeof v !== "number" || !(v > 0)) return "";
  return `대지 ${v.toLocaleString()}㎡`;
}

/**
 * 소재지 — 카드에 그대로 쓰는 주소.
 *   · 비공개(`addressHidden`)면 번지를 떼고 `서울특별시 동작구 상도동`까지만 보여 준다.
 *   · 주소가 없으면(예전에 등록된 매물) 빈 문자열 — 구역명만 보인다.
 */
export function addressText(l: Listing): string {
  const addr = (l.address ?? "").trim();
  if (!addr) return "";
  if (!l.addressHidden) return addr;
  return addr
    .replace(/\s*산?\d+(-\d+)?\s*$/, "")
    .replace(/\s*번지\s*$/, "")
    .trim();
}

/**
 * 건물·거래 상세 한 줄 — 부동산포스 양식 항목 가운데 법정 명시사항이 아닌 것들.
 *   · 카드에서는 명시사항 줄 아래 한 줄로 붙는다(값이 있는 것만).
 *   · 순서: 공급면적 → 현관구조 → 난방방식 → 엘리베이터 → 융자금 → 기월세 → 이주비 → 위반건축물
 */
export function detailItems(l: Listing): string[] {
  const items = [
    supplyAreaText(l),
    (l.entranceType ?? "").trim(),
    (l.heating ?? "").trim(),
    /^(있음|없음)$/.test((l.elevator ?? "").trim()) ? `엘리베이터 ${(l.elevator ?? "").trim()}` : (l.elevator ?? "").trim(),
    mortgageText(l),
    tenantRentText(l),
    relocationText(l),
    violationText(l),
  ];
  return items.filter((v) => v.length > 0);
}

/** 상세 설명 — 저장된 글을 그대로(앞뒤 공백만 정리) */
export function descriptionText(l: Listing): string {
  return (l.description ?? "").trim();
}

/** 목록 카드에 붙는 명시사항 한 줄들 — 값이 있는 것만(순서: 거래→면적→층→방→방향→입주→주차→승인→관리비) */
export function specItems(l: Listing): string[] {
  const t = listingTradeType(l);
  const items = [
    t,
    floorText(l),
    roomsBathsText(l),
    (l.direction ?? "").trim(),
    moveInText(l),
    parkingText(l),
    approvalText(l),
    maintenanceText(l),
    platAreaText(l),
  ];
  return items.filter((v) => v.length > 0);
}

/**
 * 중개사무소 법정 표시 — 사무소명·등록번호 / 대표자·소속공인중개사·연락처 / 소재지.
 *   · 공인중개사법상 매물 광고에는 중개사무소 명칭·등록번호·대표자·소속공인중개사·연락처를 밝혀야 한다.
 *   · 값이 없는 줄은 빼고 돌려준다(예전 매물은 사무소명·중개사명만 있다).
 */
export function brokerLegalLines(l: Listing): string[] {
  const agency = (l.brokerAgency ?? "").trim();
  const license = (l.brokerLicense ?? "").trim();
  const ceo = (l.brokerCeo ?? "").trim();
  const broker = (l.brokerName ?? "").trim();
  const phone = (l.brokerPhone ?? "").trim();
  const address = (l.brokerAddress ?? "").trim();
  // '권용범 중개사'처럼 직함이 이미 들어 있으면 그대로, 이름만 있으면 '소속공인중개사'를 붙인다
  const brokerTitle = /중개사|공인중개사/.test(broker) ? broker : broker ? `소속공인중개사 ${broker}` : "";

  const head = [agency, license ? `등록번호 ${license}` : ""].filter(Boolean).join(" · ");
  const people = [
    ceo ? `대표 ${ceo}` : "",
    brokerTitle,
    phone && phone !== "문의 요청 시 안내" ? phone : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const lines = [head, people, address ? `사무소 소재지 ${address}` : ""].filter((s) => s.length > 0);
  return lines;
}

/**
 * 매물 상세(구역 패널·목록)의 명시사항 묶음 — 라벨/값 쌍.
 *   · `specItems` 를 라벨과 함께 보여 줄 때 쓴다(층·방향처럼 이름이 필요한 값).
 */
export function specPairs(l: Listing): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  const push = (label: string, value: string) => {
    if (value) rows.push({ label, value });
  };
  push("거래형태", listingTradeType(l));
  push("해당층/총층수", floorText(l));
  push("방/욕실", roomsBathsText(l));
  push("방향", (l.direction ?? "").trim());
  push("입주가능일", moveInText(l));
  push("주차", parkingText(l));
  push("사용승인일", (l.approvalDate ?? "").trim());
  push("관리비", (l.maintenanceFee ?? "").trim());
  push("대지면적", platAreaText(l).replace(/^대지\s*/, ""));
  push("공급면적", supplyAreaText(l).replace(/^공급\s*/, ""));
  push("현관구조", (l.entranceType ?? "").trim());
  push("난방방식", (l.heating ?? "").trim());
  push("엘리베이터", (l.elevator ?? "").trim());
  push("융자금", mortgageText(l).replace(/^융자금\s*/, ""));
  push("기월세", tenantRentText(l).replace(/^기월세\s*/, ""));
  push("이주비", relocationText(l).replace(/^이주비\s*/, ""));
  push("위반건축물", violationText(l).replace(/^위반건축물\s*/, ""));
  push("건물명", (l.buildingName ?? "").trim());
  return rows;
}
