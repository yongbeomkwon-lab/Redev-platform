// ─────────────────────────────────────────────────────────────────────────────
// 추정 감평 순위 — 공시가격 기반 순위·분위 계산 (순수 함수)
//
//   · 서버(`appraisal-server.ts`)가 브이월드 NED 속성 API 로 모은 **공시가격 항목**
//     (`AppraisalItem`)을, 화면(`ZoneAppraisalRank.tsx`)이 보정률을 곱해 순위·분위로 바꾼다.
//   · 보정률은 사용자가 슬라이더로 바꾸므로 **순위·분위 계산은 화면에서** 한다(서버 왕복 없음).
//     서버도 같은 함수를 쓸 수 있게 node 의존성 없는 순수 모듈로 둔다.
//   · 순위는 **경쟁 순위**(같은 금액은 같은 순위, 다음 순위는 건너뜀)다 — 공시가격이 같은 호가
//     흔해서 1,2,2,4 식으로 매기지 않으면 "내가 42위"가 실제보다 좋게/나쁘게 보인다.
//   · 분위는 **상위에서 몇 %** 인지로만 말한다(상위 10%·25%·50%·75%) — 감정평가 실무의
//     분위 표기와 같고, "몇 등"보다 오해가 적다.
// ─────────────────────────────────────────────────────────────────────────────

/** 공시가격 항목의 종류 — 공동주택(호별) · 개별주택 · 토지(개별공시지가×면적) */
export type AppraisalKind = "apart" | "house" | "land";

/** 공시가격 한 건 — 호 하나 또는 필지 하나 */
export type AppraisalItem = {
  /** 19자리 필지고유번호 */
  pnu: string;
  kind: AppraisalKind;
  /** 지번 (예: 방배동 467-19) — 같은 필지의 호는 모두 같은 지번을 쓴다 */
  jibun: string;
  /** 지번 전체 주소 (예: 서울특별시 서초구 방배동 467-19) */
  addr: string | null;
  /** 공동주택 단지명(아파트) */
  complexNm: string | null;
  /** 동 (예: 101) */
  dongNm: string | null;
  /** 호 (예: 502) */
  hoNm: string | null;
  /** 공시가격(원) — 호별 공시가격 / 개별주택가격 / 공시지가×면적 */
  price: number;
  /** 기준연도 (예: 2026) */
  year: number;
  /** 전용면적·대지면적(㎡) — 응답에 없으면 null */
  areaSqm: number | null;
  /** ㎡당 개별공시지가(원/㎡) — 토지 항목만 */
  landPricePerSqm: number | null;
};

/** 보정률을 적용해 순위를 매긴 항목 */
export type RankedItem = AppraisalItem & {
  /** 1부터 — 같은 금액은 같은 순위 */
  rank: number;
  /** 상위 몇 % 인지 (소수 3자리 — 2,770건 중 1위 = 0.036%, 화면은 '0.1% 미만'으로 쓴다) */
  pctFromTop: number;
  /** 추정 감정가 = 공시가격 × 보정률 (원) */
  estimated: number;
};

/** 분위 구간 — 상위 10% / 상위 10~25% / 25~50% / 50~75% / 하위 25% */
export type RankBucketKey = "top10" | "top25" | "mid" | "low25" | "bottom";

export type RankBucket = {
  key: RankBucketKey;
  label: string;
  /** 이 구간에 든 건수 */
  count: number;
  /** 이 구간의 최고·최저 추정 감정가(원) */
  max: number;
  min: number;
  /** 전체에서 차지하는 비율(%) */
  pct: number;
};

export type RankSummary = {
  /** 전체 건수 */
  count: number;
  /** 최고 추정 감정가 */
  max: number;
  /** 상위 10% 지점의 추정 감정가 */
  top10: number;
  /** 상위 25% 지점(3분위) */
  top25: number;
  /** 중위(50%) */
  median: number;
  /** 하위 25% 지점(1분위) */
  low25: number;
  /** 최저 */
  min: number;
  /** 5구간 분포 */
  buckets: RankBucket[];
  /** 합계(추정 감정가 총액) */
  total: number;
};

const BUCKET_LABEL: Record<RankBucketKey, string> = {
  top10: "상위 10%",
  top25: "상위 10~25%",
  mid: "상위 25~50%",
  low25: "상위 50~75%",
  bottom: "하위 25%",
};

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

/** 0.036% 처럼 작은 값이 0 으로 뭉게지지 않게 소수 3자리까지 */
function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

/**
 * 공시가격 목록에 보정률을 곱해 **내림차순 순위**를 매긴다.
 *   · 같은 금액은 같은 순위(경쟁 순위) — 다음 순위는 그만큼 건너뛴다.
 *   · 금액은 반올림한 값으로 비교한다(1원 차이로 순위가 갈리지 않게).
 */
export function rankItems(items: AppraisalItem[], multiplier: number): RankedItem[] {
  const m = Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1;
  const sorted = items
    .filter((it) => Number.isFinite(it.price) && it.price > 0)
    .map((it) => ({ ...it, estimated: Math.round(it.price * m) }))
    .sort((a, b) => b.estimated - a.estimated || a.jibun.localeCompare(b.jibun, "ko"));
  const count = sorted.length;
  const ranked: RankedItem[] = [];
  let rank = 0;
  let prev: number | null = null;
  for (let i = 0; i < sorted.length; i++) {
    const it = sorted[i];
    if (prev == null || it.estimated !== prev) rank = i + 1;
    prev = it.estimated;
    ranked.push({
      ...it,
      rank,
      pctFromTop: count > 0 ? round3((rank / count) * 100) : 0,
    });
  }
  return ranked;
}

/** 내림차순 배열에서 상위 p(0~1) 지점의 값 — 없으면 0 */
function valueAt(sorted: { estimated: number }[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))));
  return sorted[idx].estimated;
}

/** 순위 목록에서 분위 요약(최고·상위10%·25%·중위·하위25%·최저 + 5구간 분포)을 낸다 */
export function summarizeRank(ranked: RankedItem[]): RankSummary {
  const n = ranked.length;
  if (n === 0) {
    return {
      count: 0,
      max: 0,
      top10: 0,
      top25: 0,
      median: 0,
      low25: 0,
      min: 0,
      buckets: [],
      total: 0,
    };
  }
  // 구간 경계 — 경쟁 순위라 같은 순위가 여러 건이면 그 순위까지 한 구간에 담는다
  const cut = (p: number) => Math.max(1, Math.ceil(p * n));
  const bounds: { key: RankBucketKey; from: number; to: number }[] = [
    { key: "top10", from: 1, to: cut(0.1) },
    { key: "top25", from: cut(0.1) + 1, to: cut(0.25) },
    { key: "mid", from: cut(0.25) + 1, to: cut(0.5) },
    { key: "low25", from: cut(0.5) + 1, to: cut(0.75) },
    { key: "bottom", from: cut(0.75) + 1, to: n },
  ];
  const buckets: RankBucket[] = [];
  let total = 0;
  for (const it of ranked) total += it.estimated;
  for (const b of bounds) {
    const rows = ranked.filter((r) => r.rank >= b.from && r.rank <= b.to);
    if (rows.length === 0) continue;
    buckets.push({
      key: b.key,
      label: BUCKET_LABEL[b.key],
      count: rows.length,
      max: rows[0].estimated,
      min: rows[rows.length - 1].estimated,
      pct: round1((rows.length / n) * 100),
    });
  }
  return {
    count: n,
    max: ranked[0].estimated,
    top10: valueAt(ranked, 0.1),
    top25: valueAt(ranked, 0.25),
    median: valueAt(ranked, 0.5),
    low25: valueAt(ranked, 0.75),
    min: ranked[n - 1].estimated,
    buckets,
    total,
  };
}

/**
 * 금액 하나가 구역 안에서 몇 위인지 — 순위 목록은 내림차순이어야 한다.
 *   · 그 금액보다 **높은** 건수 + 1 = 경쟁 순위(같은 금액이 있으면 그 순위를 그대로 쓴다).
 */
export function rankOfAmount(
  ranked: RankedItem[],
  amount: number
): { rank: number; count: number; pctFromTop: number; higher: number; equal: number } | null {
  const n = ranked.length;
  if (n === 0 || !Number.isFinite(amount) || amount <= 0) return null;
  let higher = 0;
  let equal = 0;
  for (const r of ranked) {
    if (r.estimated > amount) higher++;
    else if (r.estimated === amount) equal++;
  }
  const rank = higher + 1;
  return {
    rank,
    count: n,
    pctFromTop: round3((rank / n) * 100),
    higher,
    equal,
  };
}

/** '방배동 467-19', '467-19', '467' 처럼 지번 일부로 항목을 찾는다 */
export function matchJibun(ranked: RankedItem[], query: string): RankedItem[] {
  const q = query.trim().replace(/\s+/g, " ");
  if (!q) return [];
  const compact = q.replace(/\s+/g, "");
  return ranked.filter((r) => {
    const jibun = r.jibun.replace(/\s+/g, "");
    if (jibun.includes(compact)) return true;
    if ((r.addr ?? "").replace(/\s+/g, "").includes(compact)) return true;
    const ho = `${r.dongNm ?? ""}${r.hoNm ?? ""}`;
    if (ho && ho.includes(compact)) return true;
    return false;
  });
}

/** 금액 문자열('9억 8,000만', '980000000', '9.8억')을 원 단위로 — 숫자만 넣어도 된다 */
export function parseAmount(raw: string): number | null {
  // 쉼표·공백은 먼저 띄운다 — '9억 8,000만' 의 '8,000만' 이 걸리게
  const text = raw.replace(/[\s,]/g, "");
  if (!text) return null;
  const eok = /(\d+(?:\.\d+)?)억/.exec(text);
  const man = /(\d+(?:\.\d+)?)만/.exec(text);
  if (eok || man) {
    const e = eok ? Number(eok[1]) : 0;
    const m = man ? Number(man[1]) : 0;
    const value = e * 1e8 + m * 1e4;
    return Number.isFinite(value) && value > 0 ? Math.round(value) : null;
  }
  const digits = text.replace(/[^\d.]/g, "");
  if (!digits) return null;
  const value = Number(digits);
  return Number.isFinite(value) && value > 0 ? Math.round(value) : null;
}

/** 화면 표기 — 1억 이상은 '9.80억', 1만 이상은 '9,800만', 그 아래는 원 */
export function wonLabel(v: number): string {
  if (!Number.isFinite(v) || v <= 0) return "—";
  if (v >= 1e8) return `${(v / 1e8).toFixed(2)}억`;
  if (v >= 1e4) return `${Math.round(v / 1e4).toLocaleString("ko-KR")}만`;
  return `${Math.round(v).toLocaleString("ko-KR")}원`;
}

/** 원 단위 전체 금액(툴팁·보조설명용) */
export function wonFull(v: number): string {
  if (!Number.isFinite(v) || v <= 0) return "—";
  return `${Math.round(v).toLocaleString("ko-KR")}원`;
}
