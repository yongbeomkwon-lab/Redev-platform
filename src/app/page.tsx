import Link from "next/link";
import ZoneExplorer from "@/components/ZoneExplorer";

export default function Home() {
  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-gradient-to-br from-blue-700 via-blue-600 to-indigo-600 p-8 text-white shadow">
        <h1 className="text-2xl font-extrabold leading-tight sm:text-3xl">
          서울 재개발, 숫자로 확인하고
          <br />
          검증된 매물로 잡는다
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-blue-100">
          구역 실거래가·사업단계는 <b>무료 공개</b>. 중개사 매물 등록은 <b>유료 구좌·건당</b>,
          검증 매물 상세(초기투자금·예상분담금·중개사 직통)는 <b>유료 열람권</b> 구조입니다.
        </p>
        <div className="mt-4 flex flex-wrap gap-2 text-sm font-semibold">
          <Link href="/listings" className="rounded-lg bg-white px-4 py-2 text-blue-700 hover:bg-blue-50">
            검증 매물 보기
          </Link>
          <Link href="/register" className="rounded-lg bg-blue-500/40 px-4 py-2 ring-1 ring-white/40 hover:bg-blue-500/60">
            중개사 매물 등록 →
          </Link>
        </div>
      </section>

      <ZoneExplorer />
    </div>
  );
}
