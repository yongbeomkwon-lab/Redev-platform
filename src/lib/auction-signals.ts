// ─────────────────────────────────────────────────────────────────────────────
// 경매 물건 자동 분석 — **권리분석 뱃지 · 예상 P(수익분석) · 종합의견**
//
//   · 화면(`AuctionPanel`)과 사전 생성 배치(`scripts/gen-auction-opinions.mjs`)가 **같은 규칙**을 쓴다.
//     규칙을 한 곳에만 두어, 목록의 뱃지와 종합의견의 근거가 어긋나지 않게 한다.
//   · 이 파일은 **타입만 가져온다**(`import type`). 배치가 이 파일 하나만 tsc 로 컴파일해
//     Node 에서 그대로 돌릴 수 있게 하려는 것이다 — 런타임 의존성을 만들지 않는다.
//   · 없는 값을 지어내지 않는다. 판단 근거가 되는 값(전입일·경매개시일·말소기준권리 등)이
//     수집되지 않았으면 뱃지를 붙이지 않고 '확인 필요'로 남긴다.
//   · 사람 이름은 쓰지 않는다. 임차인은 **명수·전입일·보증금**만 다루고, 자유 문장을 옮겨 적지 않는다.
// ─────────────────────────────────────────────────────────────────────────────
import type { AuctionDetail } from "./auction-details";
import type { AuctionItem } from "./auctions";

/* ────────────────────────────── 날짜·금액 도우미 ────────────────────────────── */

/** `2021.06.21` · `2021-6-21` · `2021년 6월 21일` · `20210621` → UTC ms */
export function parseAuctionDate(v: string | null | undefined): number | null {
  const t = (v ?? "").trim();
  if (!t) return null;
  const dotted = t.match(/(\d{4})\s*[./\-년]\s*(\d{1,2})\s*[./\-월]\s*(\d{1,2})/);
  if (dotted) {
    const y = Number(dotted[1]);
    const m = Number(dotted[2]);
    const d = Number(dotted[3]);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) return Date.UTC(y, m - 1, d);
  }
  const compact = t.match(/^(\d{4})(\d{2})(\d{2})/);
  if (compact) return Date.UTC(Number(compact[1]), Number(compact[2]) - 1, Number(compact[3]));
  return null;
}

/** UTC ms → `2021.06.21` */
export function dotDate(ms: number | null | undefined): string {
  if (ms == null) return "-";
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}.${p(d.getUTCMonth() + 1)}.${p(d.getUTCDate())}`;
}

/** 오늘(로컬) 자정의 UTC ms — D-day 계산은 `parseAuctionDate`(UTC)와 같은 축을 쓴다 */
function todayMs(ctx?: AuctionSignalContext): number {
  const fixed = parseAuctionDate(ctx?.today);
  if (fixed != null) return fixed;
  const now = new Date();
  return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
}

/** 원 → `2억 3,000만원` (없으면 `-`) */
export function wonText(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v) || v <= 0) return "-";
  const man = Math.round(v / 10000);
  const eok = Math.floor(man / 10000);
  const rest = man % 10000;
  if (eok <= 0) return `${rest.toLocaleString()}만원`;
  return rest === 0 ? `${eok}억원` : `${eok}억 ${rest.toLocaleString()}만원`;
}

/** `3,000,000` · `20,000,000원` → 3000000 · `미상`/빈값 → null */
export function parseMoney(v: string | null | undefined): number | null {
  const t = (v ?? "").replace(/\s/g, "");
  if (!/\d/.test(t)) return null;
  const m = t.match(/(\d[\d,]*)/);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/* ────────────────────────────── 뱃지 ────────────────────────────── */

export type SignalBadgeTone = "risk" | "warn" | "good" | "info";

export type AuctionBadge = {
  key: string;
  label: string;
  tone: SignalBadgeTone;
  /** 왜 이 뱃지가 붙었는지 — 근거 값(숫자·날짜·문서명) */
  note: string;
};

export type AuctionSignalContext = {
  /** 구역 추진단계(서울시 표기) — 예: `사업시행인가` */
  zoneStage?: string;
  /** 구역 사업유형 — 예: `일반재개발` */
  zoneType?: string;
  /** 기준일 `YYYY-MM-DD` — 배치에서 생성 시점을 고정할 때 쓴다 */
  today?: string;
};

const TONE_ORDER: Record<SignalBadgeTone, number> = { risk: 0, warn: 1, good: 2, info: 3 };

/** 주거 물건인가 — 재개발 권리가액(P) 계산은 주거에만 의미가 있다 */
export function isResidentialUsage(usage: string | null | undefined): boolean {
  const u = usage || "";
  if (/상가|근린|업무|판매|숙박|위락|공장|창고|대지|임야|전답|자동차|중기|기타/.test(u)) return false;
  return /주택|아파트|다세대|다가구|연립|빌라|오피스텔|주상복합|도시형/.test(u);
}

/** 구역 단계가 이미 권리가액 산정 시점을 지났는가(준공·입주·착공·분양) */
export function stagePassedPricing(stage: string | null | undefined): boolean {
  return /준공|입주|착공|시공|분양|매각|해산/.test(stage || "");
}

/** 감정가 대비 최저가 비율(%) — 목록 값이 없으면 계산 */
export function minimumRateOf(item: Pick<AuctionItem, "appraised" | "minimum" | "minimumRate">): number | null {
  if (item.minimumRate != null && item.minimumRate > 0) return item.minimumRate;
  if (item.appraised && item.minimum && item.appraised > 0) {
    return Math.round((item.minimum / item.appraised) * 100);
  }
  return null;
}

/** 임차인 보증금 합계(확인된 값만) */
export function knownDepositTotal(detail: AuctionDetail | undefined): { total: number; known: number; count: number } {
  const tenants = detail?.tenants ?? [];
  let total = 0;
  let known = 0;
  for (const t of tenants) {
    const v = parseMoney(t.deposit);
    if (v != null) {
      total += v;
      known += 1;
    }
  }
  return { total, known, count: tenants.length };
}

/**
 * 임차인 대항력 판정 — **수집된 날짜만으로 말할 수 있는 범위**에서 세 갈래로 나눈다.
 *   · `senior`  : 전입일 < 말소기준권리일 → 대항력 있는 임차인(보증금 인수 위험)
 *   · `absent`  : 전입일 > 경매개시일 → 말소기준권리(≤개시일)보다 뒤에 전입 → 대항력 없음
 *   · `unknown` : 그 사이(전입일 ≤ 개시일)이거나 날짜가 없어 원문 확인이 필요
 *   말소기준권리일은 경매개시결정 등기일과 같거나 앞선다(근저당·가압류가 개시의 기초).
 *   그래서 '전입 > 개시일'은 대항력 없음이 확정되고, 그 반대는 확정할 수 없다.
 *   점유·인도 여부는 이 데이터로 알 수 없으므로 `absent` 도 현황조사서 확인을 함께 적는다.
 */
export type TenantPriority = {
  state: "senior" | "absent" | "unknown" | "none";
  count: number;
  /** senior 로 판정된 임차인의 확인된 보증금 합계 */
  deposit: number;
  note: string;
};

export function tenantPriority(detail: AuctionDetail | undefined): TenantPriority {
  const tenants = detail?.tenants ?? [];
  if (tenants.length === 0) return { state: "none", count: 0, deposit: 0, note: "현황조사서 임차인 기재 없음" };

  const earliest = parseAuctionDate(detail?.specification?.earliestRight);
  const commence = parseAuctionDate(detail?.commenceDate);
  let senior = 0;
  let absent = 0;
  let unknown = 0;
  let deposit = 0;

  for (const t of tenants) {
    const moved = parseAuctionDate(t.movedIn);
    if (moved == null) {
      unknown += 1;
      continue;
    }
    if (earliest != null) {
      if (moved < earliest) {
        senior += 1;
        deposit += parseMoney(t.deposit) ?? 0;
      } else absent += 1;
      continue;
    }
    if (commence != null) {
      if (moved > commence) absent += 1;
      else unknown += 1;
      continue;
    }
    unknown += 1;
  }

  if (senior > 0) {
    return {
      state: "senior",
      count: senior,
      deposit,
      note: `전입일이 말소기준권리(${detail?.specification?.earliestRight ?? "-"})보다 앞선 임차인 ${senior}명`,
    };
  }
  if (absent === tenants.length) {
    return {
      state: "absent",
      count: tenants.length,
      deposit: 0,
      note: `임차인 ${tenants.length}명 모두 경매개시일(${detail?.commenceDate ?? "-"}) 이후 전입 — 말소기준권리보다 뒤`,
    };
  }
  return {
    state: "unknown",
    count: tenants.length,
    deposit: 0,
    note: earliest == null
      ? `임차인 ${tenants.length}명 — 말소기준권리 일자가 수집되지 않아 전입일만으로는 판정 불가`
      : `임차인 ${tenants.length}명 — 전입일이 말소기준권리와 비슷해 원문 확인 필요`,
  };
}

/** 뱃지에 쓰는 본문 모음 — 법원 비고·명세서·현황조사서·감정평가요항표 */
function corpusOf(item: Pick<AuctionItem, "note">, detail: AuctionDetail | undefined): string {
  const parts: string[] = [item.note || "", detail?.note || ""];
  const spec = detail?.specification;
  if (spec) parts.push(spec.extra || "", spec.nonExtinguishedRights || "");
  const occ = detail?.occupancy;
  if (occ) parts.push(occ.detail || "", occ.property || "", occ.etc || "");
  for (const a of detail?.appraisalSummary ?? []) parts.push(a.text || "");
  return parts.join("\n");
}

/**
 * 권리분석 뱃지 — 목록·상세 위쪽에 붙는 위험/특이사항.
 *   위험(risk) → 주의(warn) → 안전(good) → 정보(info) 순으로 정렬해 돌려준다.
 */
export function auctionBadges(
  item: AuctionItem,
  detail: AuctionDetail | undefined,
  ctx: AuctionSignalContext = {}
): AuctionBadge[] {
  const out: AuctionBadge[] = [];
  const add = (key: string, label: string, tone: SignalBadgeTone, note: string) => {
    if (!out.some((b) => b.key === key)) out.push({ key, label, tone, note });
  };

  const tenants = detail?.tenants ?? [];
  const priority = tenantPriority(detail);
  const spec = detail?.specification;
  const note = item.note || "";
  const corpus = corpusOf(item, detail);
  const rate = minimumRateOf(item);
  const fail = item.failCount ?? 0;
  const today = todayMs(ctx);
  const saleMs = parseAuctionDate(item.saleDate);
  const daysLeft = saleMs != null ? Math.round((saleMs - today) / 86400000) : null;
  const residential = isResidentialUsage(item.usage);

  /* ── 위험 ───────────────────────────────────────────────────────── */
  if ((spec?.nonExtinguishedRights || "").trim()) {
    add("rights-assumed", "인수 권리 있음", "risk", "매각물건명세서에 매각으로 소멸되지 않는 권리가 적혀 있습니다.");
  }
  if (priority.state === "senior") {
    add(
      "tenant-senior",
      "선순위 임차인(인수 위험)",
      "risk",
      `${priority.note}${priority.deposit > 0 ? ` · 보증금 ${wonText(priority.deposit)} 인수 가능` : ""}`
    );
  }
  if (/유치권/.test(corpus)) {
    add("lien", "유치권 주의", "risk", "법원 문서에 유치권 관련 기재가 있습니다 — 인도·소송 리스크.");
  }
  if (/위반\s*건축물|위반건축물|위반면적/.test(corpus)) {
    add("violation", "위반건축물", "risk", "건축물대장 위반건축물 표기 — 시정명령·이행강제금 가능.");
  }

  /* ── 주의 ───────────────────────────────────────────────────────── */
  if (/지분\s*매각|지분\s*경매|지분에\s*관한/.test(note)) {
    add("share", "지분물건", "warn", "공유지분 매각 — 공유자 우선매수신고(1회)로 낙찰이 취소될 수 있습니다.");
  }
  if (/법정지상권/.test(corpus)) {
    add("legal-superficies", "법정지상권 주의", "warn", "법정지상권 성립 여부 확인 — 건물 철거·지료 분쟁 소지.");
  }
  if (spec?.hasSuperficies === true) {
    add("superficies", "지상권 있음", "warn", "매각물건명세서에 지상권 기재 — 인수 여부 확인.");
  }
  if (/제시외/.test(corpus)) {
    add("outer-building", "제시외 건물", "warn", "제시외 건물 포함 — 철거·소유권 분쟁 소지, 명세서로 범위 확인.");
  }
  if (/토지별도등기|별도등기/.test(note)) {
    add("separate-reg", "토지별도등기", "warn", "건물과 토지 등기가 별도 — 등기부 확인.");
  }
  if (/재매각/.test(note)) {
    add("resale", "재매각", "warn", "재매각 물건 — 직전 매각 불성립 사유 확인.");
  }
  if (/항고|소송|이의신청|매각불허가/.test(note)) {
    add("appeal", "항고·소송", "warn", "항고·소송 관련 기재 — 매각 확정까지 기간이 걸릴 수 있습니다.");
  }
  if (priority.state === "unknown") {
    add(
      "tenant-check",
      tenants.length > 0 ? `임차인 ${tenants.length}명 · 대항력 확인` : "임차인 확인 필요",
      "warn",
      priority.note
    );
  }

  /* ── 안전 ───────────────────────────────────────────────────────── */
  if (priority.state === "absent") {
    add("tenant-subordinate", "대항력 없음(소멸)", "good", `${priority.note} · 점유·인도는 현황조사서 확인`);
  }
  if (spec && !(spec.nonExtinguishedRights || "").trim() && (spec.earliestRight || spec.writtenDate)) {
    add("rights-clear", "인수 권리 없음", "good", "매각물건명세서에 매각으로 소멸되지 않는 권리가 없습니다.");
  }
  if (rate != null && rate >= 25 && rate <= 60) {
    add("low-entry", "저가 출발", "good", `최저가가 감정가의 ${rate}% — 감정가 대비 크게 낮습니다.`);
  }
  if (priority.state === "none" && (detail?.occupancy?.examinedAt || detail?.occupancy?.relation)) {
    add("no-tenant", "임차인 없음", "good", "현황조사서에 임차인 기재가 없습니다 — 명도 부담이 적습니다.");
  }

  /* ── 정보 ───────────────────────────────────────────────────────── */
  if (/일괄\s*매각|일괄매수/.test(note)) {
    add("bulk", "일괄매각", "info", "여러 필지·호실을 한꺼번에 매각합니다 — 금액은 전체 기준.");
  }
  if (fail >= 2) {
    add("fail", `유찰 ${fail}회`, "info", `최저가가 감정가의 ${rate ?? "-"}%까지 내려왔습니다.`);
  }
  if (item.zoneName) {
    add(
      "dev-zone",
      "정비구역 내",
      "info",
      `${item.zoneName}${ctx.zoneStage ? ` · ${ctx.zoneStage}` : ""} — 재개발 권리가액·비례율을 함께 보세요.`
    );
  }
  if (!residential) {
    add("non-residential", "주거 외 물건", "info", "상가·근린·대지 등 — 재개발 권리가액 계산은 적용되지 않습니다.");
  }
  if (tenants.length > 0 && detail?.dividendDeadline) {
    const dl = parseAuctionDate(detail.dividendDeadline);
    if (dl != null && dl < today) {
      add(
        "dividend-passed",
        "배당요구 종기 지남",
        "info",
        `${dotDate(dl)} 종기 — 임차인이 배당요구를 했는지 원문에서 확인하세요.`
      );
    }
  }
  if (daysLeft != null && daysLeft >= 0 && daysLeft <= 7) {
    add("sale-soon", "매각 임박", "info", `${daysLeft === 0 ? "오늘" : `D-${daysLeft}`} — 명세서·현황조사서 확인 시간이 짧습니다.`);
  }
  if (/농지취득|농지\s*매매/.test(note)) {
    add("farmland", "농지취득자격", "info", "농지취득자격증명이 필요할 수 있습니다.");
  }

  return out.sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone]);
}

/* ────────────────────────────── 예상 P (수익분석) ────────────────────────────── */

/**
 * 예상 P 계산 가정 — **모두 화면에서 사용자가 바꿀 수 있는 값**이고, 기본값도 함께 보여 준다.
 *   · 보정률(adjustment)  : 법원 감정가 → 조합 종전자산 추정 배수. 기본 1.25(실무 관행 가정치)
 *   · 비례율(ratioPct)    : 종전자산 대비 권리가액 비율. 기본 100%
 *   · 평당분양가(pricePerPyMan): 예상 일반분양가(만원/평). 기본 4,000만원
 *   · 낙찰가(bid)         : 사용자가 정한 예상 입찰가. 기본 최저매각가격
 */
export type PremiumAssumptions = {
  bid: number;
  adjustment: number;
  ratioPct: number;
  pricePerPyMan: number;
  /** 취득 부대비용 비율(%) — 취득세·등기·법무 등. 기본 4.6% */
  costRatePct: number;
  /** 인수하는 임차인 보증금(원) — 있으면 총 투자금에 더한다 */
  assumedDeposit: number;
};

export type PremiumEstimate = {
  /** 기준액(법원 감정가) */
  base: number;
  /** 예상 종전자산 = 감정가 × 보정률 */
  priorAsset: number;
  /** 예상 권리가액 = 종전자산 × 비례율 */
  entitlement: number;
  /** 예상 P = 권리가액 − 낙찰가 */
  premium: number;
  /** 낙찰가 대비 P 비율(%) */
  premiumRatePct: number | null;
  /** 취득 부대비용(원) */
  cost: number;
  /** 총 투자금 = 낙찰가 + 부대비용 + 인수 보증금 */
  totalInvest: number;
  /** 현재 전용면적 기준 예상 분양가(원) — 전용 평을 모르면 null */
  saleEstimate: number | null;
  /** 예상 분담금 = 예상 분양가 − 권리가액 (음수면 환급) */
  contribution: number | null;
  /** 권리가액으로 확보 가능한 분양면적(평) — 평당 분양가를 알 때 */
  affordablePy: number | null;
};

export function defaultPremiumAssumptions(
  item: Pick<AuctionItem, "minimum" | "appraised">,
  detail: AuctionDetail | undefined,
  overrides: Partial<PremiumAssumptions> = {}
): PremiumAssumptions {
  const priority = tenantPriority(detail);
  return {
    bid: overrides.bid ?? item.minimum ?? item.appraised ?? 0,
    adjustment: overrides.adjustment ?? 1.25,
    ratioPct: overrides.ratioPct ?? 100,
    pricePerPyMan: overrides.pricePerPyMan ?? 4000,
    costRatePct: overrides.costRatePct ?? 4.6,
    assumedDeposit: overrides.assumedDeposit ?? (priority.state === "senior" ? priority.deposit : 0),
  };
}

export function estimatePremium(params: {
  base: number;
  exclusivePy?: number | null;
  assumptions: PremiumAssumptions;
}): PremiumEstimate {
  const a = params.assumptions;
  const base = Math.max(0, params.base || 0);
  const bid = Math.max(0, a.bid || 0);
  const priorAsset = Math.round(base * (a.adjustment || 1));
  const entitlement = Math.round(priorAsset * ((a.ratioPct || 0) / 100));
  const premium = entitlement - bid;
  const premiumRatePct = bid > 0 ? Math.round((premium / bid) * 1000) / 10 : null;
  const cost = Math.round(bid * ((a.costRatePct || 0) / 100));
  const totalInvest = bid + cost + Math.max(0, a.assumedDeposit || 0);
  const py = params.exclusivePy != null && params.exclusivePy > 0 ? params.exclusivePy : null;
  const saleEstimate = py != null ? Math.round(py * (a.pricePerPyMan || 0) * 10000) : null;
  const contribution = saleEstimate != null ? saleEstimate - entitlement : null;
  const affordablePy = a.pricePerPyMan > 0 ? Math.round((entitlement / (a.pricePerPyMan * 10000)) * 10) / 10 : null;
  return {
    base,
    priorAsset,
    entitlement,
    premium,
    premiumRatePct,
    cost,
    totalInvest,
    saleEstimate,
    contribution,
    affordablePy,
  };
}

/* ────────────────────────────── 종합의견 ────────────────────────────── */

export type AuctionVerdict = "매력" | "검토" | "주의";

export type AuctionBuildingFacts = {
  /** 사용승인일 `2013-09-02` */
  approval?: string;
  /** 구조 — 예: `철근콘크리트구조` */
  structure?: string;
  /** 층 — 예: `지하1층/지상4층` */
  floors?: string;
};

export type AuctionOpinion = {
  score: number;
  verdict: AuctionVerdict;
  headline: string;
  merits: string[];
  risks: string[];
  summary: string;
  building: AuctionBuildingFacts;
};

function decodeEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/** 감정평가요항표에서 **건물 사실만** 뽑는다 — 사람 이름·소유자 문장은 옮기지 않는다 */
export function buildingFacts(detail: AuctionDetail | undefined): AuctionBuildingFacts {
  const text = decodeEntities((detail?.appraisalSummary ?? []).map((a) => a.text || "").join("\n"));
  const out: AuctionBuildingFacts = {};
  if (!text.trim()) return out;

  const approval = text.match(/사용승인일\s*[:：]?\s*(\d{4})\s*[-.년]\s*(\d{1,2})\s*[-.월]\s*(\d{1,2})/);
  if (approval) {
    const p = (n: string) => n.padStart(2, "0");
    out.approval = `${approval[1]}-${p(approval[2])}-${p(approval[3])}`;
  }
  const structure = text.match(/(철골철근콘크리트|철근콘크리트|경량철골|철골|시멘트벽돌|벽돌|조적|목조|콘크리트)[^,.\n]{0,6}구조/);
  if (structure) out.structure = structure[0].replace(/\s+/g, "");
  const floors = text.match(/지하\s*(\d+)\s*층\s*\/\s*지상\s*(\d+)\s*층/) || text.match(/지상\s*(\d+)\s*층/);
  if (floors && floors.length >= 3) out.floors = `지하${floors[1]}층/지상${floors[2]}층`;
  else if (floors && floors.length === 2) out.floors = `지상${floors[1]}층`;
  return out;
}

/** 구역 단계가 점수에 주는 가중치 — 재개발 투자 관점(권리가액 산정 여지) */
function stageWeight(stage: string | undefined): number {
  const s = stage || "";
  if (!s) return 0;
  if (/준공|입주|해산/.test(s)) return -6;
  if (/착공|시공|분양/.test(s)) return -3;
  if (/관리처분|사업시행|건축심의|기획완료/.test(s)) return 4;
  if (/조합설립|구역지정|추진위|위원회심의|관리계획/.test(s)) return 2;
  if (/후보지|대상지|연번|사전검토|입안제안|공람/.test(s)) return 1;
  return 0;
}

/**
 * 종합의견 — 규칙 기반 참고 점수와 매력/주의 요약.
 *   · 점수는 `50`에서 출발해 가격·권리·구역 단계를 더하고 빼는 **참고 지표**다(투자 권유 아님).
 *   · 문장에는 숫자·날짜·구역명만 들어간다. 사람 이름·자유 문장은 넣지 않는다.
 */
export function buildOpinion(
  item: AuctionItem,
  detail: AuctionDetail | undefined,
  ctx: AuctionSignalContext = {}
): AuctionOpinion {
  const badges = auctionBadges(item, detail, ctx);
  const has = (key: string) => badges.some((b) => b.key === key);
  const rate = minimumRateOf(item);
  const fail = item.failCount ?? 0;
  const tenants = detail?.tenants ?? [];
  const priority = tenantPriority(detail);
  const residential = isResidentialUsage(item.usage);
  const zone = item.zoneName || "";
  const stage = ctx.zoneStage || "";
  const surveyed = !!(detail?.occupancy?.examinedAt || detail?.occupancy?.relation);
  const facts = buildingFacts(detail);
  const landSqm = detail?.area?.landSqm ?? null;
  const landPy =
    detail?.area?.landPy ?? (landSqm != null && landSqm > 0 ? Math.round((landSqm / 3.305785) * 10) / 10 : null);
  const perPy = item.minimum && landPy ? Math.round(item.minimum / landPy) : null;
  const photos = (detail?.photos ?? []).length;

  let score = 50;
  if (rate != null) {
    if (rate < 20) score -= 4; // 극단적 저가는 그만한 사유가 있다는 신호로 본다
    else if (rate <= 40) score += 10;
    else if (rate <= 50) score += 14;
    else if (rate <= 60) score += 12;
    else if (rate <= 70) score += 10;
    else if (rate <= 80) score += 6;
    else if (rate <= 90) score += 2;
    else score -= 3;
  }
  if (fail === 1) score += 1;
  else if (fail === 2) score += 2;
  else if (fail === 3) score += 1;
  else if (fail >= 4) score -= 2;
  if (tenants.length > 0) score -= 6;
  if (has("tenant-senior")) score -= 22;
  if (has("tenant-subordinate")) score += 6;
  if (has("rights-assumed")) score -= 25;
  if (has("lien")) score -= 18;
  if (has("legal-superficies")) score -= 12;
  if (has("share")) score -= 12;
  if (has("violation")) score -= 6;
  if (has("outer-building")) score -= 4;
  if (zone) score += 6;
  score += stageWeight(stage);
  if (landPy != null) score += 3;
  if (!residential) score -= 2;
  const saleMs = parseAuctionDate(item.saleDate);
  if (saleMs != null) {
    const left = Math.round((saleMs - todayMs(ctx)) / 86400000);
    if (left >= 0 && left <= 7) score -= 3;
  }
  score = Math.max(5, Math.min(95, score));
  const verdict: AuctionVerdict = score >= 66 ? "매력" : score >= 48 ? "검토" : "주의";

  /* ── 매력 ── */
  const merits: string[] = [];
  if (rate != null && rate <= 90) {
    merits.push(`감정가 대비 최저가 ${rate}% — 감정가보다 ${100 - rate}% 낮은 출발입니다.`);
  }
  if (zone) {
    merits.push(
      `정비구역(${zone}${stage ? ` · ${stage}` : ""}) 안 — 권리가액·분양권 확보를 함께 볼 수 있습니다.`
    );
  }
  if (priority.state === "none" && surveyed) {
    merits.push("현황조사서상 임차인 기재가 없어 명도 부담이 적습니다.");
  }
  if (has("tenant-subordinate")) {
    merits.push("임차인이 말소기준권리보다 뒤에 전입 — 보증금 인수 위험이 낮습니다.");
  }
  if (landPy != null && perPy != null) {
    merits.push(`대지권 ${landPy}평 · 최저가 기준 대지 평단가 ${wonText(perPy)}/평입니다.`);
  }
  if (!residential) {
    const dep = knownDepositTotal(detail);
    if (dep.total > 0) {
      merits.push(`임차인 보증금 ${wonText(dep.total)} 기재 — 수익률 계산의 근거가 있습니다.`);
    }
  }
  if (photos >= 3) {
    merits.push(`현장 사진 ${photos}장과 감정평가요항이 수집돼 현황 파악이 쉽습니다.`);
  }

  /* ── 주의 ── */
  const risks: string[] = [];
  if (has("rights-assumed")) {
    risks.push("매각물건명세서에 '매각으로 소멸되지 않는 권리'가 있어 인수 범위를 확인해야 합니다.");
  }
  if (has("tenant-senior")) {
    risks.push(
      `선순위 임차인 ${priority.count}명${priority.deposit > 0 ? `(보증금 ${wonText(priority.deposit)})` : ""} — 보증금을 인수할 수 있습니다.`
    );
  } else if (has("tenant-check") && tenants.length > 0) {
    risks.push(
      `임차인 ${tenants.length}명이 기재돼 있고 말소기준권리 일자가 수집되지 않아 대항력은 원문 확인이 필요합니다.`
    );
  }
  if (has("share")) risks.push("지분물건 — 공유자 우선매수신고(1회)로 낙찰이 취소될 수 있습니다.");
  if (has("violation")) risks.push("위반건축물 표기 — 시정명령·이행강제금이 나올 수 있습니다.");
  if (has("lien")) risks.push("유치권 관련 기재 — 인도·소송 리스크를 확인해야 합니다.");
  if (has("legal-superficies")) risks.push("법정지상권 성립 여지 — 건물 철거·지료 분쟁 소지가 있습니다.");
  if (has("outer-building")) risks.push("제시외 건물 포함 — 철거·소유권 분쟁 소지가 있습니다.");
  if (!residential) {
    risks.push("주거 외 물건이라 재개발 권리가액(P) 계산이 적용되지 않습니다 — 임대차·권리금으로 봐야 합니다.");
  }
  if (stagePassedPricing(stage)) {
    risks.push(`구역이 '${stage}' 단계 — 권리가액 산정 시점을 지나 시세 기준으로 봐야 합니다.`);
  }
  if (fail >= 3) {
    risks.push(`유찰 ${fail}회 — 추가 하락 가능성과 경쟁 구도를 함께 봐야 합니다.`);
  }
  if (rate != null && rate < 25) {
    risks.push(`최저가가 감정가의 ${rate}%까지 떨어졌습니다 — 권리·명도·건물 상태처럼 가격이 낮은 이유를 먼저 확인하세요.`);
  }
  if (has("dividend-passed")) {
    risks.push("배당요구 종기가 지나 임차인이 배당을 받지 못할 수 있습니다 — 배당요구 여부를 확인하세요.");
  }
  if (risks.length === 0) {
    risks.push("수집된 자료에서는 두드러진 위험 뱃지가 없습니다 — 명세서 본문으로 최선순위만 확인하세요.");
  }
  if (merits.length === 0) {
    merits.push("가격 메리트는 크지 않습니다 — 입찰가를 낮게 잡거나 다음 기일을 기다리는 편이 낫습니다.");
  }

  /* ── 한 줄 요약 · 종합 ── */
  const headlineParts: string[] = [item.usage || "물건"];
  if (rate != null) headlineParts.push(`최저가 감정가의 ${rate}%`);
  if (fail > 0) headlineParts.push(`유찰 ${fail}회`);
  if (has("tenant-senior")) headlineParts.push("선순위 임차인");
  else if (tenants.length > 0) headlineParts.push(`임차인 ${tenants.length}명`);
  if (has("share")) headlineParts.push("지분");
  if (has("violation")) headlineParts.push("위반건축물");
  const headline = headlineParts.join(" · ");

  const priceSentence =
    item.appraised && item.minimum
      ? `감정가 ${wonText(item.appraised)}·최저가 ${wonText(item.minimum)}${rate != null ? `(${rate}%)` : ""}${fail > 0 ? `, 유찰 ${fail}회` : " 신건"}입니다.`
      : "감정가·최저가가 수집되지 않았습니다.";

  const buildingSentence = facts.approval || facts.floors
    ? `${[facts.structure, facts.floors, facts.approval ? `사용승인 ${facts.approval}` : ""].filter(Boolean).join(" · ")}.`
    : "";

  const rightSentence =
    priority.state === "senior"
      ? `임차인 ${priority.count}명이 말소기준권리보다 앞서 전입해 보증금 인수 위험이 있습니다.`
      : priority.state === "absent"
        ? `임차인 ${tenants.length}명은 모두 경매개시일 이후 전입해 대항력이 없을 것으로 보입니다(점유·인도는 원문 확인).`
        : priority.state === "unknown"
          ? `임차인 ${tenants.length}명이 기재돼 있으나 말소기준권리 일자가 없어 대항력은 원문으로 확인해야 합니다.`
          : surveyed
            ? "현황조사서에 임차인 기재가 없습니다."
            : "현황조사서·매각물건명세서가 아직 수집되지 않았습니다.";

  const verdictSentence =
    verdict === "매력"
      ? "가격 메리트가 권리 리스크보다 큰 편이라 검토 가치가 있습니다."
      : verdict === "검토"
        ? "가격과 권리가 엇갈려 매각물건명세서를 본 뒤 판단할 물건입니다."
        : "권리 리스크가 커 입찰 전 명세서·현황조사서 확인이 필수입니다.";

  const summary = [`${item.address || item.jibun || "소재지 미상"}.`, priceSentence, buildingSentence, rightSentence, verdictSentence]
    .filter(Boolean)
    .join(" ");

  return { score, verdict, headline, merits, risks, summary, building: facts };
}
