// ─────────────────────────────────────────────────────────────────────────────
// 토지거래허가구역(토허제) 참고 안내 — 구역 상세 패널 상단 배지의 판단 근거
//
//  ⚠️ 이 파일은 **확정 법적 판정을 하지 않는다.** 화면에도 그렇게 밝힌다.
//     개별 필지가 실제 허가구역에 드는지는 지정 고시·지형도면(토지e음)과 관할 구청에서
//     최종 확인해야 한다. 여기서는 "지정 대상 자치구·사업유형"이라는 공개된 기준으로
//     상담 전에 미리 알아 둘 만한 구역을 표시만 한다.
//
//  근거(2026-11 확인, 출처 링크는 아래 LINKS):
//   · 강남 3구(강남·서초·송파)·용산구 **아파트 용도**: 2025.10.1.~2026.12.31. 재지정
//     (서울시 2025-09-17 제15차 도시계획위원회)
//   · 영등포구 전역 **아파트**: 10·15 부동산 안정화대책으로 2025.10.20.~2026.12.31. 지정
//   · 압구정·여의도·목동·성수 주요 재건축(재개발) 지구 약 4.6㎢: 2027.4.26.까지 재지정
//     (서울시 2026-04-01 제5차 도시계획위원회 — 압구정 아파트지구·여의도 아파트지구·
//      목동 택지개발 아파트 단지·성수전략정비구역 1~4구역)
//   · 신속통합기획 주택재개발 후보지·공공재개발 후보지, 모아타운(지목 '도로') 등은
//     사업구역 단위로 **개별 지정**된다 → 구역별 확인이 필요하다.
// ─────────────────────────────────────────────────────────────────────────────

export type LandPermitLevel = "designated" | "check";

export type LandPermitInfo = {
  level: LandPermitLevel;
  /** 배지 문구 — 예: "강남구 아파트 용도 지정" */
  badge: string;
  /** 한 줄 요약 */
  summary: string;
  /** 세부 근거(불릿) */
  details: string[];
  /** 근거 자료 링크 */
  links: { label: string; url: string }[];
};

/** 화면 하단에 항상 붙는 문구 — 확정 판정이 아님을 밝힌다 */
export const LAND_PERMIT_DISCLAIMER =
  "지정 대상 자치구·사업유형 기준 참고 안내입니다. 확정 법적 판정이 아니므로 계약 전 관할 구청(또는 토지e음)에서 최종 확인하세요.";

const LINKS = {
  seoulReassign2025: {
    label: "서울시 — 강남 3구·용산구 토지거래허가구역 재지정(2025-09-17)",
    url: "https://www.seoul.go.kr/news/news_report.do?nttNo=443217&tr_code=snews",
  },
  seoulReassign2026: {
    label: "서울시 — 압구정·여의도·목동·성수 토지거래허가구역 1년 연장(2026-04-01)",
    url: "https://www.seoul.go.kr/news/news_report.do?nttNo=455446&srchCtgry=465",
  },
  seoulStatus: {
    label: "서울부동산정보광장 — 토지거래허가구역 지정현황",
    url: "https://land.seoul.go.kr/land/other/appointStatusSeoul.do",
  },
  eum: {
    label: "토지e음 — 필지별 허가구역 조회",
    url: "https://www.eum.go.kr",
  },
};

/** 자치구 전역(아파트 용도) 지정 — 기간은 공개된 지정 기간 */
const GU_APT_DESIGNATED: Record<string, { from: string; to: string; note: string }> = {
  강남구: { from: "2025.10.1", to: "2026.12.31", note: "서울시 재지정(2025-09-17)" },
  서초구: { from: "2025.10.1", to: "2026.12.31", note: "서울시 재지정(2025-09-17)" },
  송파구: { from: "2025.10.1", to: "2026.12.31", note: "서울시 재지정(2025-09-17)" },
  용산구: { from: "2025.10.1", to: "2026.12.31", note: "서울시 재지정(2025-09-17)" },
  영등포구: { from: "2025.10.20", to: "2026.12.31", note: "10·15 부동산 안정화대책" },
};

/** 지구·단지 단위 재건축(재개발) 지정 — 이름에 이 낱말이 들어가면 해당 */
const BLOCKS: { gu: string; keywords: string[]; label: string; period: string; note: string }[] = [
  {
    gu: "강남구",
    keywords: ["압구정"],
    label: "압구정 아파트지구",
    period: "2027.4.26.까지",
    note: "주요 재건축 단지 재지정(2026-04-01)",
  },
  {
    gu: "영등포구",
    keywords: ["여의도"],
    label: "여의도 아파트지구",
    period: "2027.4.26.까지",
    note: "주요 재건축 단지 재지정(2026-04-01)",
  },
  {
    gu: "양천구",
    keywords: ["목동"],
    label: "목동 택지개발 아파트 단지",
    period: "2027.4.26.까지",
    note: "주요 재건축 단지 재지정(2026-04-01)",
  },
  {
    gu: "성동구",
    keywords: ["성수"],
    label: "성수전략정비구역 1~4구역",
    period: "2027.4.26.까지",
    note: "주요 재정비구역 재지정(2026-04-01)",
  },
];

/** 사업구역 단위로 개별 지정되는 사업유형 — 지정 여부는 구역마다 다르다 */
const POLICY_TYPES = ["신통기획", "모아타운", "모아타운통합기획"];
const POLICY_KIND_WORDS = ["공공재개발", "신속통합기획", "모아타운"];

/**
 * 구역 하나의 토허제 참고 안내를 고른다.
 *   · 지구·단지 단위 지정 → designated (가장 구체적)
 *   · 자치구 전역 아파트 지정 → designated
 *   · 신통기획·모아타운·공공재개발 사업구역 → check (개별 확인 필요)
 *   · 그 밖 → null (배지를 띄우지 않는다 — 근거 없는 안내를 만들지 않는다)
 */
export function landPermitNotice({
  gu,
  names,
  type,
  kind,
  flagged,
}: {
  gu?: string;
  /** 구역 이름·별칭 — 지구·단지 이름 매칭에 쓴다 */
  names?: string[];
  /** 지도 사업유형(신통기획·모아타운 등) */
  type?: string;
  /** 서울시 사업유형 소분류(예: 공공재개발 후보지) */
  kind?: string;
  /** 구역 데이터에 토허제 적용(true)으로 표시돼 있는지 */
  flagged?: boolean;
}): LandPermitInfo | null {
  const district = (gu ?? "").trim();
  const text = (names ?? []).join(" ");
  const key = `${district} ${type ?? ""} ${kind ?? ""}`;

  // 1) 지구·단지 단위 지정 (압구정·여의도·목동·성수)
  const block = BLOCKS.find(
    (b) => b.gu === district && b.keywords.some((w) => text.includes(w))
  );
  if (block) {
    const guInfo = GU_APT_DESIGNATED[district];
    return {
      level: "designated",
      badge: block.label,
      summary: `${block.label} — 토지거래허가구역 ${block.period}`,
      details: [
        `${block.note}. 이 지구·단지의 아파트(주택) 거래는 관할 구청장 허가 대상입니다.`,
        "주거지역 6㎡(상업지역 15㎡) 초과 지분 거래부터 허가가 필요하고, 허가 후 2년 실거주 의무가 붙습니다.",
        ...(guInfo
          ? [`같은 자치구의 아파트 용도도 ${guInfo.from}~${guInfo.to} 전역 지정되어 있습니다(${guInfo.note}).`]
          : []),
      ],
      links: [LINKS.seoulReassign2026, LINKS.seoulStatus, LINKS.eum],
    };
  }

  // 2) 자치구 전역(아파트 용도) 지정
  const guInfo = GU_APT_DESIGNATED[district];
  if (guInfo) {
    return {
      level: "designated",
      badge: `${district} 아파트 용도 지정`,
      summary: `${district} 아파트 용도 — 토지거래허가구역 ${guInfo.from}~${guInfo.to}`,
      details: [
        `${guInfo.note}에 따른 지정입니다. 아파트 용도 거래가 대상이며, 주거지역 6㎡(상업지역 15㎡) 초과 지분 거래부터 구청장 허가가 필요합니다.`,
        "허가를 받으면 2년간 실거주용으로만 사용해야 하고, 그 기간 매매·임대가 제한됩니다.",
        "아파트 외 용도(근린생활시설 등)는 별도 기준이니 필지 단위로 확인하세요.",
      ],
      links: [LINKS.seoulReassign2025, LINKS.seoulStatus, LINKS.eum],
    };
  }

  // 3) 신통기획·모아타운·공공재개발 — 사업구역 단위 개별 지정
  const policyHit =
    POLICY_TYPES.includes(type ?? "") || POLICY_KIND_WORDS.some((w) => key.includes(w));
  if (policyHit) {
    return {
      level: "check",
      badge: "사업구역 단위 지정 대상",
      summary: "신속통합기획·모아타운·공공재개발 구역은 사업구역 단위로 토허제가 지정됩니다",
      details: [
        "후보지 선정·구역 지정 시점에 해당 사업구역(또는 지목 '도로')이 토지거래허가구역으로 묶이는 경우가 많습니다.",
        "이 구역의 실제 지정 여부·기간은 서울시 고시와 관할 구청에서 확인해야 합니다(모아타운은 지목 '도로'만 대상인 경우가 있습니다).",
        "지정되어 있으면 주거지역 6㎡ 초과 지분 거래부터 구청장 허가가 필요합니다.",
      ],
      links: [LINKS.seoulReassign2026, LINKS.seoulStatus, LINKS.eum],
    };
  }

  // 4) 구역 데이터가 이미 '토허제 적용'으로 표시돼 있으면 그 사실만 알린다
  if (flagged) {
    return {
      level: "designated",
      badge: "토허제 적용 표시",
      summary: "이 구역은 데이터에 토지거래허가구역 적용으로 표시돼 있습니다",
      details: [
        "구역·물건 데이터에 토허제 적용으로 입력된 값입니다. 지정 기간·대상 용도는 관할 구청 고시로 확인하세요.",
      ],
      links: [LINKS.seoulStatus, LINKS.eum],
    };
  }

  return null;
}
