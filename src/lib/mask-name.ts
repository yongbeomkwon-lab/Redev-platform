// ─────────────────────────────────────────────────────────────────────────────
// 개인정보 마스킹 — 사람 이름만 가리고, 법인·상호는 그대로 둔다.
//
//   · 경매 현황조사서에는 임차인·채무자(소유자)의 실명이 그대로 적혀 오는 경우가 있다.
//     화면에 실명이 뜨면 안 되므로 **수집 데이터와 화면 두 곳**에서 같은 규칙으로 가린다
//     (`scripts/fetch-auction-details.py` 의 `mask_person_name` 과 같은 규칙 — 한쪽을 고치면 함께 고친다).
//   · 한글 2자        → `김O`            (김철 → 김O)
//   · 한글 3자 이상    → 첫 글자 + O + 끝 글자 (서미경 → 서O경, 남궁민수 → 남OO수)
//   · 영문/외국인명    → 첫 글자 + `***`   (2자 이하는 첫 글자 + `*`: ZHENG AI → Z*** A*)
//   · 괄호 표기        → 각각 가린다        (ZHENG AI(정애) → Z*** A*(정O))
//   · 법인·상호        → 원문 유지         ((주)기업건설 · 주식회사 ○○ · ㈜○○)
//   · 이미 가려진 표기(`서O경`·`김O`·`Z***`)는 다시 가려도 그대로다(멱등).
// ─────────────────────────────────────────────────────────────────────────────

/** 법인·상호 표기 — 개인정보가 아니므로 가리지 않는다 */
const CORPORATE = /(\(주\)|㈜|주식회사|유한회사|합자회사|합명회사|유한책임회사|재단법인|사단법인|법인)/;

/** 역할어 — 이 말 바로 뒤에 오는 한글 이름은 실명으로 보고 가린다 */
const ROLE_WORDS = [
  "채무자",
  "소유자",
  "공유자",
  "임차인",
  "세대주",
  "배우자",
  "동거인",
  "학원장",
  "팀장",
  "이해관계인",
  "대표",
  "명의자",
];

/** 역할어 뒤에 와도 이름이 아닌 말 — 이 말들은 건드리지 않는다 */
const NOT_NAMES = new Set([
  "지분",
  "란에",
  "등재",
  "명의",
  "점유",
  "관계",
  "소유",
  "기재",
  "표시",
  "경우",
  "당시",
  "세대",
  "주택",
  "건물",
  "부동산",
  "토지",
  "대지",
  "매각",
  "경매",
  "현황",
  "조사",
  "본건",
  "이건",
  "기타",
  "제시",
  "일부",
  "전부",
  "해당",
  "직원",
  "안내",
  "동거",
  "배우",
  "가족",
  "세대주",
  "내용",
  "사항",
  "주소",
  "호수",
  "면적",
  "번호",
  "사람",
  "폐문부재",
  "폐문",
]);

/** `○○○ 지분` 앞에 와도 이름이 아닌 말 */
const NOT_SHARE = new Set([
  "매각", "공유", "채무", "소유", "임차", "매수", "매도", "전체", "일부", "해당",
  "본건", "기타", "제시", "토지", "대지", "건물", "지분", "잔여", "나머지", "위",
  "채무자", "소유자", "공유자", "임차인", "매수인", "매도인", "각자", "등",
]);

/** `기재된·등재된` 뒤에 붙는 이름 */
const LISTED_SRC = String.raw`(기재된|등재된|기재한|등재한)(\s+)([가-힣]{2,4}?)(?=\s*(?:의|은|는|이|를|가|[,.()]|$))`;

/** `고근수 지분` 처럼 지분 표시에 붙은 이름 */
const SHARE_SRC = String.raw`(^|[^가-힣])([가-힣]{2,4})(\s*)지분`;

/** 한 토큰(공백으로 나뉜 이름 한 덩어리)을 가린다 — 이미 가려진 표기는 그대로 둔다 */
function maskToken(token: string): string {
  const core = token.replace(/[.,·]+$/, "");
  const tail = token.slice(core.length);
  if (!core) return token;

  // 한글 이름 — 전부 한글로 된 토큰만 (서미경 · 김철 · 남궁민수)
  if (/^[가-힣]+$/.test(core)) {
    const chars = [...core];
    if (chars.length < 2) return token;
    if (chars.length === 2) return `${chars[0]}O${tail}`;
    return `${chars[0]}${"O".repeat(chars.length - 2)}${chars[chars.length - 1]}${tail}`;
  }

  // 이미 가려진 한글 표기 (서O경 · 김O)
  if (/^[가-힣]O+$/.test(core) || /^[가-힣]O+[가-힣]$/.test(core)) return token;

  // 영문 이름 — 첫 글자 + *** (2자 이하는 첫 글자 + *)
  if (/^[A-Za-z]+$/.test(core)) {
    if (core.length < 2) return token;
    return `${core[0]}${core.length === 2 ? "*" : "***"}${tail}`;
  }

  // 그 밖의 표기(이미 `*` 로 가려진 이름 등)는 그대로 둔다
  return token;
}

/**
 * 사람 이름 하나를 가린다. 법인·상호는 원문 그대로 돌려준다.
 *   `서미경` → `서O경` · `김철` → `김O` · `ZHENG AI(정애)` → `Z*** A*(정O)`
 *   `(주)기업건설` → `(주)기업건설`
 */
export function maskPersonName(raw: string | null | undefined): string {
  const name = (raw ?? "").trim();
  if (!name) return "";
  if (CORPORATE.test(name)) return name;

  // `ZHENG AI(정애)` 처럼 괄호 표기가 붙은 이름 — 괄호 안팎을 각각 가린다
  const paren = name.match(/^(.*?)\s*\(([^()]*)\)\s*$/);
  if (paren && paren[1].trim()) {
    return `${maskPersonName(paren[1])}(${maskPersonName(paren[2])})`;
  }

  return name
    .split(/\s+/)
    .map((tok) => maskToken(tok))
    .join(" ");
}

/** 이미 가려진 이름인가 — 본문 치환에서 두 번 가리지 않으려고 쓴다 */
export function isMaskedName(name: string): boolean {
  const core = name.trim().replace(/[.,·]+$/, "");
  if (!core) return true;
  if (/^[가-힣]O+$/.test(core) || /^[가-힣]O+[가-힣]$/.test(core)) return true;
  if (/\*/.test(core)) return true;
  return false;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 자유 문장(점유관계·현황조사서 본문) 안의 사람 이름을 가린다.
 *   ① 이름 후보를 먼저 모은다 — 역할어(채무자·소유자·공유자·임차인·세대주·배우자 …) 뒤,
 *      `기재된·등재된` 뒤, `지분` 앞에 오는 한글 이름 + 넘겨받은 이름(임차인 이름).
 *   ② 모은 이름이 나오는 자리를 **원문에서 한 번에** 찾아 가린다
 *      — `채무자 겸 소유자 심배관의 배우자 심수진` → `채무자 겸 소유자 심O관의 배우자 심O진`
 *      한 번 가린 글자를 다시 훑지 않으므로 `심O관` 이 `심OO` 로 망가지지 않는다.
 *   이름이 아닌 말(지분·란에·등재·폐문부재 등)은 건드리지 않는다.
 */
export function maskNamesInText(text: string | null | undefined, names: (string | null | undefined)[] = []): string {
  const src = text ?? "";
  if (!src) return src;

  // ① 이름 후보 모으기 — 원문에서 문맥으로 찾는다
  const role = ROLE_WORDS.map(escapeRe).join("|");
  const roleSrc = String.raw`(^|[^가-힣])((?:${role})(?:\s*겸\s*(?:${role}))?\s+)([가-힣]{2,4}?)(?=\s*(?:의|를|가|은|는|이(?:라는|며|고|\s)|으로|으로부터|로부터|라고|와|과|[,.()]|$))`;
  const found = new Set<string>();
  for (const m of src.matchAll(new RegExp(roleSrc, "g"))) {
    if (!NOT_NAMES.has(m[3])) found.add(m[3]);
  }
  for (const m of src.matchAll(new RegExp(LISTED_SRC, "g"))) {
    if (!NOT_NAMES.has(m[3])) found.add(m[3]);
  }
  for (const m of src.matchAll(new RegExp(SHARE_SRC, "g"))) {
    if (!NOT_SHARE.has(m[2])) found.add(m[2]);
  }
  for (const raw of names) {
    const n = (raw ?? "").trim();
    if (n.length >= 2 && !CORPORATE.test(n) && !isMaskedName(n)) found.add(n);
  }

  // ② 원문에서 그 이름들이 나오는 자리를 모두 찾는다 — 낱말 앞이 한글이 아닌 곳만
  const marks: { start: number; end: number; text: string }[] = [];
  for (const name of [...found].sort((a, b) => b.length - a.length)) {
    const re = new RegExp(String.raw`(?<![가-힣])${escapeRe(name)}`, "g");
    for (const m of src.matchAll(re)) {
      const start = m.index ?? 0;
      marks.push({ start, end: start + name.length, text: maskPersonName(name) });
    }
  }

  // ③ 뒤에서부터 바꾼다 — 앞쪽 위치가 밀리지 않고, 겹치는 자리는 한 번만 바뀐다
  marks.sort((a, b) => b.start - a.start || b.end - a.end);
  let out = src;
  let leftBound = Number.POSITIVE_INFINITY;
  for (const mark of marks) {
    if (mark.end > leftBound) continue; // 이미 바꾼 자리와 겹친다
    out = out.slice(0, mark.start) + mark.text + out.slice(mark.end);
    leftBound = mark.start;
  }
  return out;
}

/** 임차인 목록에서 본문 치환에 쓸 이름 배열을 만든다 */
export function tenantNamesOf(tenants: { name?: string }[] | undefined | null): string[] {
  return (tenants ?? []).map((t) => (t.name ?? "").trim()).filter(Boolean);
}
