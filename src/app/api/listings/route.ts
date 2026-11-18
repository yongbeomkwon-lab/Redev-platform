// ─────────────────────────────────────────────────────────────────────────────
// /api/listings — 중개사 매물의 **공용 DB**(Supabase `public.listings`) 입구
//
//   GET    전체 매물 (created_at 내림차순)
//            → { ok:true, source:"supabase"|"static", items: Listing[] }
//            DB 가 설정되지 않은 로컬 dev 에서는 { ok:true, source:"static", items:[] } 로 답한다.
//   POST   매물 1건 upsert(id 기준) → { ok:true, item: Listing }
//            본문은 화면의 Listing 과 같은 camelCase JSON. 변환은 lib/db-mapping.
//   DELETE ?id=<매물 id> → { ok:true, deleted:id }
//
//   · 비밀 키(SUPABASE_SERVICE_ROLE_KEY)는 이 서버 파일 안에서만 읽는다 — 브라우저로 나가지 않는다.
//   · DB 가 죽어도 화면은 살아 있어야 하므로, 실패는 200 + source:"static" + message 로 알린다
//     (POST/DELETE 는 저장이 안 된 것이므로 5xx + ok:false 로 분명히 알린다).
// ─────────────────────────────────────────────────────────────────────────────
import { NextResponse } from "next/server";
import type { Listing } from "@/lib/types";
import { listingFromRow, listingToRow } from "@/lib/db-mapping";
import { sbDelete, sbSelect, sbUpsert, supabaseConfigured } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const STATIC_EMPTY = { ok: true as const, source: "static" as const, items: [] as Listing[] };

export async function GET() {
  if (!supabaseConfigured()) return NextResponse.json(STATIC_EMPTY);

  const res = await sbSelect<Record<string, unknown>>("listings", "select=*&order=created_at.desc");
  if (!res.ok) {
    return NextResponse.json({
      ...STATIC_EMPTY,
      message: `매물 DB 조회 실패 — ${res.message}`,
    });
  }
  const items = res.rows
    .map((row) => listingFromRow(row))
    .filter((l): l is Listing => l !== null);
  return NextResponse.json({ ok: true, source: "supabase", count: items.length, items });
}

/** 본문 → 매물 1건(저장 가능한 최소 조건 확인) */
function readListing(body: unknown): Listing | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const zoneId = typeof b.zoneId === "string" ? b.zoneId.trim() : "";
  const id = typeof b.id === "string" ? b.id.trim() : "";
  const salePrice = typeof b.salePrice === "number" ? b.salePrice : Number(b.salePrice);
  if (!zoneId || !id || !Number.isFinite(salePrice)) return null;
  return {
    ...(b as unknown as Listing),
    id,
    zoneId,
    salePrice,
    brokerName: typeof b.brokerName === "string" && b.brokerName.trim() ? b.brokerName : "미기재",
    brokerAgency: typeof b.brokerAgency === "string" && b.brokerAgency.trim() ? b.brokerAgency : "미기재",
    brokerPhone: typeof b.brokerPhone === "string" && b.brokerPhone.trim() ? b.brokerPhone : "문의 요청 시 안내",
    unitType: typeof b.unitType === "string" && b.unitType.trim() ? b.unitType : "일반매물",
    verified: b.verified === true,
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
  const listing = readListing(body);
  if (!listing) {
    return NextResponse.json(
      { ok: false, reason: "bad_listing", message: "구역(zoneId)·매물 id·매매가(salePrice)가 필요합니다." },
      { status: 400 }
    );
  }

  const res = await sbUpsert<Record<string, unknown>>("listings", [listingToRow(listing)]);
  if (!res.ok) {
    return NextResponse.json(
      {
        ok: false,
        source: "static",
        reason: "db_error",
        message: `매물 DB 저장 실패 — ${res.message}`,
      },
      { status: 503 }
    );
  }
  const saved = res.rows.map((row) => listingFromRow(row)).find((l): l is Listing => l !== null) ?? listing;
  return NextResponse.json({ ok: true, source: "supabase", item: saved });
}

export async function DELETE(req: Request) {
  const id = (new URL(req.url).searchParams.get("id") ?? "").trim();
  if (!id) {
    return NextResponse.json({ ok: false, reason: "bad_request", message: "삭제할 매물 id 가 필요합니다." }, { status: 400 });
  }
  if (!supabaseConfigured()) {
    // DB 가 없으면 지울 원격 행도 없다 — 화면은 localStorage 만 지우면 된다
    return NextResponse.json({ ok: true, source: "static", deleted: id, shared: false });
  }
  const res = await sbDelete<Record<string, unknown>>("listings", `id=eq.${encodeURIComponent(id)}`);
  if (!res.ok) {
    return NextResponse.json(
      { ok: false, source: "static", reason: "db_error", message: `매물 DB 삭제 실패 — ${res.message}` },
      { status: 503 }
    );
  }
  return NextResponse.json({ ok: true, source: "supabase", deleted: id, rows: res.rows.length, shared: true });
}
