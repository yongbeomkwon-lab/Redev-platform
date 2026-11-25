// ─────────────────────────────────────────────────────────────────────────────
// 구역 동의율(consentRate) — 값·기준일·비고를 한 곳에서 다룬다
//
//   · 동의율은 **모든 구역의 필수 정보**라 상세 패널·관리자 화면·오버라이드가 모두 같은 규칙을 쓴다.
//   · 값이 없으면 화면은 '미공개'로 보여 준다 — 0%(동의 없음)와 '모르는 값'은 다르다.
//   · 관리자 구역(public.custom_zones)에는 동의율 컬럼이 없다. 그래서 저장할 때는 note 끝에
//     표식 한 줄(`⟦동의율⟧{...}`)을 붙여 함께 보관하고, 읽을 때 떼어 낸다(화면·DB 양쪽 호환).
//     note 에 이 표식이 없으면 note 는 그대로 화면에 보인다.
//
//   leaflet·React 를 쓰지 않는 순수 모듈.
// ─────────────────────────────────────────────────────────────────────────────

/** 저장 표식 — note 안에서 이 줄 뒤의 JSON 만 동의율로 읽는다 */
export const CONSENT_MARK = "⟦동의율⟧";

export type ConsentInfo = {
  /** 동의율 % — null/undefined 는 미공개 */
  rate?: number | null;
  /** 기준일 — "YYYY-MM-DD" 또는 "YYYY-MM"(월까지만 아는 경우) */
  date?: string;
  /** 비고 — 진행 경과·출처 등 한두 줄 */
  note?: string;
};

/**
 * 여러 모양의 값 → 0~100 사이 숫자(아니면 null).
 *   · 60 · "60" · "60%" · "60.5 %" · "약 60%"
 *   · 1보다 작은 소수(0.6)는 비율 표기로 보고 100을 곱한다(관리자 입력 실수 방지)
 */
export function parseConsentRate(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" && Number.isFinite(v)) return clampRate(v);
  if (typeof v !== "string") return null;
  const m = v.replace(/\s/g, "").match(/(-?\d+(?:\.\d+)?)/);
  if (!m) return null;
  return clampRate(Number(m[1]));
}

function clampRate(n: number): number | null {
  if (!Number.isFinite(n)) return null;
  const pct = n > 0 && n < 1 ? n * 100 : n;
  if (pct < 0 || pct > 100) return null;
  return Math.round(pct * 10) / 10;
}

/** "2026-11-25" → "2026.11.25", "2026-11" → "2026.11", 그 밖의 문자열은 그대로 */
export function formatConsentDate(d?: string | null): string | null {
  if (!d) return null;
  const s = d.trim();
  const m = s.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
  if (!m) return s;
  return m[3] ? `${m[1]}.${m[2]}.${m[3]}` : `${m[1]}.${m[2]}`;
}

/** 화면에 쓰는 "60%" 문구 — 소수는 한 자리까지만 */
export function formatConsentRate(rate?: number | null): string | null {
  if (rate === null || rate === undefined || !Number.isFinite(rate)) return null;
  const n = Math.round(rate * 10) / 10;
  return `${Number.isInteger(n) ? n.toFixed(0) : n.toFixed(1)}%`;
}

/** 값이 있는지(0%도 값이다) */
export function hasConsent(c: ConsentInfo | null | undefined): c is ConsentInfo & { rate: number } {
  return !!c && typeof c.rate === "number" && Number.isFinite(c.rate);
}

/**
 * note + 동의율 → 저장용 note.
 *   · 동의율이 없으면 note 를 그대로 돌려준다(기존 표식이 있으면 지운다 — 값이 지워졌으므로).
 */
export function packConsentNote(note: string | undefined, c: ConsentInfo | undefined): string {
  const base = stripConsentMark(note ?? "").trim();
  if (!c || !hasConsent(c)) return base;
  const payload = {
    rate: c.rate,
    ...(c.date?.trim() ? { date: c.date.trim() } : {}),
    ...(c.note?.trim() ? { note: c.note.trim() } : {}),
  };
  return `${base}${base ? "\n\n" : ""}${CONSENT_MARK}${JSON.stringify(payload)}`;
}

/** 저장용 note → (표식을 뗀 note, 동의율). 표식이 깨져 있으면 note 만 돌려준다 */
export function unpackConsentNote(note: string | undefined): { note: string; consent: ConsentInfo } {
  const raw = note ?? "";
  if (!raw.includes(CONSENT_MARK)) return { note: raw, consent: {} };
  const idx = raw.lastIndexOf(CONSENT_MARK);
  const head = stripConsentMark(raw.slice(0, idx)).trim();
  const tail = raw.slice(idx + CONSENT_MARK.length).trim();
  try {
    const parsed = JSON.parse(tail) as Record<string, unknown>;
    const rate = parseConsentRate(parsed.rate);
    return {
      note: head,
      consent: {
        ...(rate !== null ? { rate } : {}),
        ...(typeof parsed.date === "string" && parsed.date.trim() ? { date: parsed.date.trim() } : {}),
        ...(typeof parsed.note === "string" && parsed.note.trim() ? { note: parsed.note.trim() } : {}),
      },
    };
  } catch {
    return { note: raw, consent: {} };
  }
}

function stripConsentMark(text: string): string {
  const i = text.indexOf(CONSENT_MARK);
  return i === -1 ? text : text.slice(0, i);
}
