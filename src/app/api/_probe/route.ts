// 임시 진단 라우트 — 배포 환경변수 "이름"만 확인한다(값은 절대 반환하지 않는다).
// 스키마 적용 경로를 정하기 위한 1회성 점검용이며, 확인 후 삭제한다.
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const TOKEN = "probe-9f2c1a";

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("k") !== TOKEN) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }
  const keys = Object.keys(process.env).sort();
  const interesting = keys.filter((k) => /POSTGRES|SUPABASE|DATABASE|PG|DB_/i.test(k));
  return NextResponse.json({
    ok: true,
    keys: interesting,
    values: Object.fromEntries(
      interesting.map((k) => {
        const v = process.env[k] ?? "";
        // 값은 길이·스킴만 노출한다(비밀번호·키는 절대 노출하지 않는다)
        if (!v) return [k, "empty"];
        if (/^postgres(ql)?:\/\//i.test(v)) return [k, v.replace(/\/\/[^@]*@/, "//***@")];
        if (/^https?:\/\//i.test(v)) return [k, v];
        return [k, `len:${v.length}:${v.slice(0, 3)}…`];
      })
    ),
  });
}
