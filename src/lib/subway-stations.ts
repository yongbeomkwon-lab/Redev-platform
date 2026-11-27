// 수도권 지하철역 검색 — 역 이름으로 지도 위치를 찾는 작은 모듈
//
//  ▶ 데이터: public/data/subway-stations.json (574개 역, `python3 scripts/build-subway-dataset.py`)
//    · 지도 레이어(SubwayLayer)가 같은 파일을 쓰지만, 검색은 지도 렌더와 무관하게
//      한 번만 받아 두면 되므로 모듈 캐시를 따로 둔다(지도가 Leaflet 폴백이어도 검색은 그대로 동작).
//  ▶ '역' 꼬리 처리: 사람은 '사당역'·'사당' 둘 다 입력한다. 데이터의 역명에는 '역'이 없으므로
//    검색어에서 끝의 '역'을 떼고 비교한다(단, 실제 이름이 '역'으로 끝나는 역은 그대로도 맞춘다).
//  ▶ 노선 표기: 노선 배지 색은 subway-lines.geojson 과 같은 값(공식 노선색)을 쓴다.
export type SubwayStation = {
  name: string;
  lat: number;
  lng: number;
  /** 노선 id 목록 — "2", "7", "sinbundang", "gyeongui" … */
  lines: string[];
  transfer: boolean;
};

export type SubwayLineMeta = { name: string; badge: string; color: string };

/** 노선 id → 이름·배지·색 (public/data/subway-lines.geojson 의 properties 와 동일) */
export const SUBWAY_LINES: Record<string, SubwayLineMeta> = {
  "1": { name: "1호선", badge: "1", color: "#0052A4" },
  "2": { name: "2호선", badge: "2", color: "#00A84D" },
  "3": { name: "3호선", badge: "3", color: "#EF7C1C" },
  "4": { name: "4호선", badge: "4", color: "#00A5DE" },
  "5": { name: "5호선", badge: "5", color: "#996CAC" },
  "6": { name: "6호선", badge: "6", color: "#CD7C2F" },
  "7": { name: "7호선", badge: "7", color: "#747F00" },
  "8": { name: "8호선", badge: "8", color: "#E6186C" },
  "9": { name: "9호선", badge: "9", color: "#BDB092" },
  sinbundang: { name: "신분당선", badge: "신분당", color: "#D4003B" },
  silim: { name: "신림선", badge: "신림", color: "#6789CA" },
  ui: { name: "우이신설선", badge: "우이", color: "#B7C452" },
  gyeongui: { name: "경의중앙선", badge: "경의", color: "#77C4A3" },
  suin: { name: "수인분당선", badge: "수인", color: "#F5A200" },
  airport: { name: "공항철도", badge: "공항", color: "#0090D2" },
  gtxa: { name: "GTX-A", badge: "A", color: "#9A6292" },
  gyeongchun: { name: "경춘선", badge: "경춘", color: "#0C8E72" },
  gyeonggang: { name: "경강선", badge: "경강", color: "#0054A6" },
  seohae: { name: "서해선", badge: "서해", color: "#8FC31F" },
  gimpo: { name: "김포골드라인", badge: "김포", color: "#957326" },
};

/** 역의 노선 이름 — "2호선·7호선" (모르는 id 는 그대로) */
export function lineNames(st: Pick<SubwayStation, "lines">): string {
  return st.lines.map((id) => SUBWAY_LINES[id]?.name ?? id).join("·");
}

let cache: Promise<SubwayStation[]> | null = null;

/** 역 목록(574개) 한 번만 받아 캐시한다 */
export function loadSubwayStations(): Promise<SubwayStation[]> {
  if (cache) return cache;
  cache = (async () => {
    const res = await fetch("/data/subway-stations.json");
    if (!res.ok) throw new Error("지하철역 데이터를 불러오지 못했습니다");
    const list = (await res.json()) as SubwayStation[];
    return Array.isArray(list) ? list.filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng)) : [];
  })();
  return cache;
}

/** 검색어 다듬기 — 띄어쓰기 제거 + 끝의 '역' 제거('사당역' → '사당') + 영문 소문자 통일 */
function norm(term: string): string {
  return term.replace(/\s+/g, "").replace(/역$/, "").toLowerCase();
}

/**
 * 역 이름 검색 — 정확히 같은 이름 → 이름이 검색어로 시작 → 이름에 포함 순으로 정렬한다.
 *   · '건대' → 건대입구 / '사당' → 사당 / '효창공원' → 효창공원앞
 *   · 환승역(노선 2개 이상)을 같은 순위에서 먼저 보여준다(지도에서 기준점으로 쓰기 좋다).
 */
export function searchStations(stations: SubwayStation[], query: string, limit = 5): SubwayStation[] {
  const raw = query.trim();
  if (!raw) return [];
  const flat = norm(raw);
  const plain = raw.replace(/\s+/g, "").toLowerCase();
  if (!flat && !plain) return [];
  const rank = (s: SubwayStation) => {
    const n = s.name.replace(/\s+/g, "").toLowerCase();
    if (n === plain || n === flat) return 0;
    if (flat && n.startsWith(flat)) return 1;
    if (flat && n.includes(flat)) return 2;
    return 9;
  };
  const hits = stations
    .map((s) => ({ s, r: rank(s) }))
    .filter((x) => x.r < 9)
    .sort(
      (a, b) =>
        a.r - b.r ||
        Number(b.s.transfer) - Number(a.s.transfer) ||
        b.s.lines.length - a.s.lines.length ||
        a.s.name.localeCompare(b.s.name, "ko")
    );
  // '앞에서 시작하는 역'이 있으면 '중간에 들어 있는 역'(국회의**사당**역)은 뺀다 — 오타처럼 섞이지 않게
  const strong = hits.some((x) => x.r <= 1);
  return hits
    .filter((x) => !(strong && x.r === 2))
    .slice(0, limit)
    .map((x) => x.s);
}
