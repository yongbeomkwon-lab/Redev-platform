// ─────────────────────────────────────────────────────────────────────────────
// molit-error — 국토부 실거래 오픈API 실패를 **누구 책임인지**까지 구분해 문구로 만든다
//
//  2026-11-28 확인(성동구 금호동3가 외 전 구역):
//    · 같은 인증키로 호출한 **건축물대장 API(BldRgstHubService)는 resultCode 00 정상**.
//    · RTMS(실거래가) 계열 — RTMSDataSvcAptTradeDev · RTMSDataSvcSHTrade · RTMSDataSvcRHTrade2
//      · RTMSDataSvcAptRent — 는 **모든 달·모든 자치구에서 returnReasonCode 04(HTTP_ERROR)**.
//    · 잘못된 파라미터(LAWD_CD=99999, DEAL_YMD=2025, 파라미터 누락)로 불러도 04가 그대로 온다
//      → 게이트웨이가 파라미터 검증(10)까지 가지 못하고 **기관(RTMS) 연계 단계에서 실패**한다는 뜻.
//    · 등록되지 않은 서비스키는 30(SERVICE_KEY_IS_NOT_REGISTERED_ERROR)로 따로 구분되어 오므로
//      **이 키는 해당 서비스에 정상 등록**돼 있다.
//  ⇒ 우리 코드·키·요청 형식 문제가 아니라 공공데이터포털 ↔ 국토부 RTMS 연계 장애다.
//    화면은 이때 '키를 넣어라 / 다시 시도'가 아니라 **그 사실과 공식 조회 링크**를 보여줘야 한다.
// ─────────────────────────────────────────────────────────────────────────────

export type MolitFail = { code?: string; message?: string } | undefined;

/** 게이트웨이 코드 04·05 — 기관 연계 실패(외부 장애)로 보는 코드 */
const LINK_FAIL = new Set(["04", "05"]);

export function isUpstreamOutage(code?: string | null): boolean {
  return !!code && LINK_FAIL.has(code.trim());
}

/**
 * 실패 문구 — 화면에 그대로 넣어도 되는 한 줄.
 *   · 04/05: 외부 연계 장애라고 분명히 말한다(우리 설정을 고치라고 하지 않는다).
 *   · 그 밖의 코드는 기존대로 코드·메시지를 붙인다.
 */
export function molitFailMessage(fail?: MolitFail): {
  reason: "upstream_outage" | "upstream_failed";
  message: string;
} {
  const code = fail?.code?.trim();
  const upstream = fail?.message?.trim();
  if (isUpstreamOutage(code)) {
    return {
      reason: "upstream_outage",
      message:
        `국토부 실거래 오픈API 연계가 지금 끊겨 있습니다 (공공데이터포털 코드 ${code} = 기관 응답 처리 실패). ` +
        "우리 인증키·요청 형식 문제가 아니라 국토부 쪽 연계 장애입니다 — 복구되면 자동으로 다시 표시됩니다. " +
        "지금은 실거래가 공개시스템에서 같은 법정동 거래를 바로 볼 수 있습니다.",
    };
  }
  return {
    reason: "upstream_failed",
    message: `국토부 실거래 API가 응답하지 않았습니다${code ? ` (${code} ${upstream ?? ""})` : ""}. 잠시 뒤 다시 시도해 주세요.`,
  };
}

/** 실거래가 공개시스템 — 시도/시군구/동 이름으로 바로 검색되는 주소(사람이 쓰는 화면) */
export const RTMS_PUBLIC_URL = "https://rt.molit.go.kr/pt/xls/xls.do?mobileAt=";
