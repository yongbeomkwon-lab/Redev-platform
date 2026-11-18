// ─────────────────────────────────────────────────────────────────────────────
// /api/custom-zones — 관리자 모드에서 지도에 직접 그린 구역의 **공용 DB**
//                    (Supabase `public.custom_zones`) 입구
//
//   GET    전체 구역 (updated_at 내림차순)
//            → { ok:true, source:"supabase"|"static", items: CustomZone[] }
//   POST   구역 1건 upsert(id 기준) → { ok:true, item }
//   DELETE ?id=<구역 id> → { ok:true, deleted:id }
//
//   URL 의 `?admin=1` 화면에서 저장·삭제할 때 이 라우트를 부른다. 저장에 성공하면
//   다른 기기·다른 방문자의 관리자 화면에도 같은 구역이 보인다(지도 그리기는 관리자 모드에만 그려진다).
// ─────────────────────────────────────────────────────────────────────────────
import { NextResponse } from "next/server";
import type { ZoneRecord } from "@/lib/db-mapping";
import { zoneFromRow, zoneToRow } from "@/lib/db-mapping";
import { sbDelete, sbSelect, sbUpsert, supabaseConfigured } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const STATIC_EMPTY = { ok: true as const, source: "static" as const, items: [] as ZoneRecord[] };

export async function GET() {
  if (!supabaseConfigured()) return NextResponse.json(STATIC_EMPTY);

  const res = await sbSelect<Record<string, unknown>>("custom_zones", "select=*&order=updated_at.desc");
  if (!res.ok) {
    return NextResponse.json({ ...STATIC_EMPTY, message: `구역 DB 조회 실패 — ${res.message}` });
  }
  const items = res.rows.map((row) => zoneFromRow(row)).filter((z): z is ZoneRecord => z !== null);
  return NextResponse.json({ ok: true, source: "supabase", count: items.length, items });
}

function readZone(body: unknown): ZoneRecord | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const id = typeof b.id === "string" ? b.id.trim() : "";
  const name = typeof b.name === "string" ? b.name.trim() : "";
  const ring = Array.isArray(b.ring)
    ? (b.ring as unknown[]).filter(
        (p): p is [number, number] =>
          Array.isArray(p) &&
          p.length === 2 &&
          Number.isFinite(p[0] as number) &&
          Number.isFinite(p[1] as number) &&
          Math.abs(p[0] as number) <= 90 &&
          Math.abs(p[1] as number) <= 180
      )
    : [];
  if (!id || !name || ring.length < 3) return null;
  const areaSqm = typeof b.areaSqm === "number" && b.areaSqm > 0 ? b.areaSqm : 0;
  const now = new Date().toISOString();
  return {
    id,
    name,
    type: typeof b.type === "string" && b.type ? b.type : "기타",
    stage: typeof b.stage === "string" && b.stage ? b.stage : "추진준비",
    gu: typeof b.gu === "string" ? b.gu : "",
    note: typeof b.note === "string" ? b.note : "",
    ring,
    areaSqm,
    ...(typeof b.replacesZoneId === "string" && b.replacesZoneId ? { replacesZoneId: b.replacesZoneId } : {}),
    ...(typeof b.replacesName === "string" && b.replacesName ? { replacesName: b.replacesName } : {}),
    ...(typeof b.replacesArea === "number" && Number.isFinite(b.replacesArea) ? { replacesArea: b.replacesArea } : {}),
    createdAt: typeof b.createdAt === "string" && b.createdAt ? b.createdAt : now,
    updatedAt: typeof b.updatedAt === "string" && b.updatedAt ? b.updatedAt : now,
  };
}

export async function POST(req: Request) {
  if (!supabaseConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        source: "static",
        reason: "db_unset",
        message: "DB 환경변수가 없어 저장하지 못했습니다 — 이 브라우저에만 보관됩니다.",
      },
      { status: 503 }
    );
  }
  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, reason: "bad_json", message: "JSON 본문을 읽지 못했습니다." }, { status: 400 });
  }
  const zone = readZone(body);
  if (!zone) {
    return NextResponse.json(
      { ok: false, reason: "bad_zone", message: "구역 id·이름·경계(3점 이상)가 필요합니다." },
      { status: 400 }
    );
  }

  const res = await sbUpsert<Record<string, unknown>>("custom_zones", [zoneToRow(zone)]);
  if (!res.ok) {
    return NextResponse.json(
      { ok: false, source: "static", reason: "db_error", message: `구역 DB 저장 실패 — ${res.message}` },
      { status: 503 }
    );
  }
  const saved = res.rows.map((row) => zoneFromRow(row)).find((z): z is ZoneRecord => z !== null) ?? zone;
  // replacesArea 는 DB 컬럼이 없다 — 보낸 값을 그대로 돌려줘 화면이 잃지 않게 한다
  return NextResponse.json({
    ok: true,
    source: "supabase",
    item: { ...saved, ...(zone.replacesArea ? { replacesArea: zone.replacesArea } : {}) },
  });
}

export async function DELETE(req: Request) {
  const id = (new URL(req.url).searchParams.get("id") ?? "").trim();
  if (!id) {
    return NextResponse.json({ ok: false, reason: "bad_request", message: "삭제할 구역 id 가 필요합니다." }, { status: 400 });
  }
  if (!supabaseConfigured()) {
    return NextResponse.json({ ok: true, source: "static", deleted: id, shared: false });
  }
  const res = await sbDelete<Record<string, unknown>>("custom_zones", `id=eq.${encodeURIComponent(id)}`);
  if (!res.ok) {
    return NextResponse.json(
      { ok: false, source: "static", reason: "db_error", message: `구역 DB 삭제 실패 — ${res.message}` },
      { status: 503 }
    );
  }
  return NextResponse.json({ ok: true, source: "supabase", deleted: id, rows: res.rows.length, shared: true });
}
