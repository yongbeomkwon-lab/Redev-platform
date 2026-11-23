import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "현금청산 판례 리포트 — 리디브(redev)",
  description:
    "재개발·재건축 현금청산 판례만 모았습니다 — 분양신청 미신청·철회, 다물권자(1+1·대표조합원), 권리산정기준일 이후 지분, 감정평가 기준일·개발이익, 수용·명도까지 대법원 판결 원문 기준으로 정리합니다.",
};

// ─────────────────────────────────────────────────────────────────────────────
// /cases — 현금청산 판례 리포트 (2026-11-21 신설 → 2026-11-23 현금청산 전용으로 개편)
//   · 다루는 범위를 '현금청산' 하나로 좁혔다(사용자: "현금청산 관련된 것만 있으면 됨").
//   · 카드의 사건번호·선고일·법원·판시는 국가법령정보센터·대법원 판례속보·케이스노트의
//     판결문으로 하나씩 대조한 것만 적는다. 확인되지 않은 사건은 넣지 않는다.
//   · 각 카드는 요지(사실관계) → 핵심 법리(조문) → 중개 실무 체크포인트 순서다.
// ─────────────────────────────────────────────────────────────────────────────

type Issue = { no: string; title: string; desc: string; anchor: string };

const ISSUES: Issue[] = [
  {
    no: "01",
    title: "분양신청 미신청·철회와 청산금 발생 시점",
    desc: "분양신청을 안 했거나 철회했을 때 청산금 지급의무가 언제 생기는지 — 그 날이 감정 기준일이자 지연이자의 기산점이 됩니다.",
    anchor: "#case-1",
  },
  {
    no: "02",
    title: "다물권자(1+1)·대표조합원 미선정",
    desc: "조합설립인가 후 한 사람이 가진 여러 물건을 나눠 사면 입주권이 몇 개인지, 대표조합원을 세우지 않으면 어떻게 되는지.",
    anchor: "#case-2",
  },
  {
    no: "03",
    title: "권리산정기준일 이후 지분 쪼개기·신축",
    desc: "필지 분할, 다세대 전환, 상속·분할협의로 소유자가 늘어난 경우 분양대상 자격이 인정되는지.",
    anchor: "#case-3",
  },
  {
    no: "04",
    title: "감정평가 기준일·개발이익·지연이자",
    desc: "청산금은 어느 날짜의, 어떤 가격으로 계산하는지 — 재개발과 재건축의 개발이익 취급이 다릅니다.",
    anchor: "#case-4",
  },
  {
    no: "05",
    title: "수용·명도·지연가산금",
    desc: "협의가 깨진 뒤 조합이 쓸 수 있는 절차(수용재결·매도청구)와, 그 절차를 늦게 밟았을 때 조합이 지는 가산금.",
    anchor: "#more",
  },
];

type CaseCard = {
  id: string;
  no: string;
  issue: string;
  title: string;
  court: string;
  decided: string;
  caseNo: string;
  caseName: string;
  appeal?: string;
  facts: string[];
  law: { text: string; cite?: string }[];
  checks: string[];
  result: string;
  source: { label: string; href: string };
};

const CASES: CaseCard[] = [
  {
    id: "case-1",
    no: "01",
    issue: "분양신청 철회 · 청산금 발생 시점",
    title: "분양신청을 마감 뒤에 철회했다면, 청산금은 언제 생기나",
    court: "대법원",
    decided: "2014. 8. 26.",
    caseNo: "2013두4293",
    caseName: "손실보상금등청구",
    appeal: "원심 서울고법 2013. 1. 24. 선고 2012누19436",
    facts: [
      "주택재개발정비사업 구역에서 원고들은 분양신청을 했다가 분양신청기간이 끝난 뒤에 철회하고, 조합에 수용재결을 신청해 달라고 요구했습니다.",
      "조합은 보상 협의기간(2010. 3. 12.~4. 15.)을 두고 협의가 결렬되자 2010. 11. 19. 서울특별시 지방토지수용위원회에 수용재결을 신청했고, 2011. 1. 14. 수용재결이 났습니다. 당시까지 분양계약 체결기간은 정해지지 않았습니다(2012년 3월 예정).",
      "원심은 조합이 재결신청을 늦게 했다며 145일·157일분 지연 가산금을 인정했지만, 대법원은 이 부분을 파기해 원심으로 돌려보냈습니다(현금청산대상자 지위 자체는 인정).",
    ],
    law: [
      {
        text: "구 도시정비법 제47조 제2호의 '분양신청을 철회한 자'는 분양신청기간 안에 신청했다가 그 기간이 끝나기 전에 철회한 사람을 말합니다. 기간이 끝난 뒤 임의로 철회한 사람은 원칙적으로 여기에 들어가지 않습니다.",
        cite: "구 도시정비법 제47조 제2호",
      },
      {
        text: "다만 정관이나 관리처분계획이 '분양계약 체결기간'을 정해 두고, 그 기간 안에 분양계약을 맺지 않으면 현금으로 청산한다고 정했다면 — 그 기간에 계약을 맺지 않거나, 철회 의사를 명백히 밝히고 조합이 이에 동의한 경우에도 현금청산대상자가 됩니다.",
        cite: "대법원 2011. 7. 28. 선고 2008다91364 판결",
      },
      {
        text: "이렇게 '추가로' 현금청산대상자가 된 사람의 청산금 지급의무는 '분양계약 체결기간 종료일 다음 날'에 생깁니다. 그 기간이 오기 전에 수용재결이 끝났다면, 조합의 재결신청이 늦었다는 이유의 가산금은 생길 여지가 없습니다.",
        cite: "대법원 2013. 1. 24. 선고 2011두22778 판결",
      },
    ],
    checks: [
      "철회 시점을 먼저 본다 — 분양신청기간 안의 철회인지, 마감 뒤의 철회인지. 마감 뒤 철회는 철회서만으로 청산대상이 되지 않을 수 있고, 정관·관리처분계획의 '분양계약 체결기간' 조항이 열쇠입니다.",
      "철회나 미체결 뒤 조합이 동의·확인한 기록(공문·통지·회의록)이 있는지 확인합니다. 구두 철회만으로는 다툼이 생깁니다.",
      "청산금 발생일이 '분양신청 마감 다음 날'인지 '분양계약 체결기간 종료 다음 날'인지에 따라 지연이자·가산금 계산이 달라집니다. 매수 전 상담에서 이 날짜를 특정해 두세요.",
      "계약서에 '분양신청을 하지 않으면 현금청산'이라는 특약만 보고 판단하지 말고, 조합 정관의 청산 조항까지 확인합니다.",
    ],
    result: "파기환송(지연 가산금 부분) · 현금청산대상자 지위는 인정",
    source: { label: "판결문 (케이스노트)", href: "https://casenote.kr/대법원/2013두4293" },
  },
  {
    id: "case-2",
    no: "02",
    issue: "다물권자 · 대표조합원 미선정",
    title: "다물권자에게서 나눠 산 물건, 입주권은 하나 — 대표조합원을 안 세우면 전원 청산",
    court: "대법원",
    decided: "2023. 2. 23.",
    caseNo: "2020두36724",
    caseName: "아파트수분양권확인등",
    facts: [
      "재개발 조합설립인가 당시 구역 안의 여러 주택을 한 사람이 갖고 있었는데, 그 뒤 원고 등 여러 사람에게 양도해 분양신청기간이 끝날 무렵에는 여러 명이 나눠 소유하게 됐습니다.",
      "조합은 이들이 대표조합원을 세우지 않고 각자 단독 명의로 분양신청을 했다는 이유로, 전원을 현금청산대상자로 정하는 관리처분계획을 세웠습니다.",
      "대법원은 이들이 원칙적으로 '1인의 조합원'으로서 '1인의 분양대상자' 지위를 갖는다고 보면서도, 대표조합원을 세우지 않은 채 각자 신청한 것은 적법한 분양신청이 아니라며 전원 현금청산대상자로 본 원심을 확정했습니다.",
    ],
    law: [
      {
        text: "구 도시정비법 제19조 제1항 제3호(현행 제39조 제1항 제3호)는 '조합설립인가 후 1인의 토지등소유자로부터 소유권을 양수해 수인이 소유하게 된 때' 그 수인을 대표하는 1인을 조합원으로 봅니다.",
        cite: "구 도시정비법 제19조 제1항 제3호 → 현행 제39조 제1항 제3호",
      },
      {
        text: "같은 조 제2호(1세대)와 함께 2009년 개정으로 들어온 이 규정은 투기세력 유입을 막고 기존 조합원의 재산권을 지키려는 취지입니다. 그래서 양수인 전원이 1인의 조합원, 곧 1인의 분양대상자 지위를 갖습니다.",
        cite: "구 도시정비법 제48조 제2항 제6호 → 현행 제76조 제1항 제6호",
      },
      {
        text: "다만 그 지위를 행사하는 방법은 정해져 있습니다. 대표조합원을 세우지 않고 각자 단독 명의로 신청서를 내고 다른 사람의 신청서를 붙이지도 않았다면 적법한 분양신청이 아니고, 분양신청기간이 지난 뒤 소송 중에 대표조합원을 세워도 달라지지 않습니다.",
      },
    ],
    checks: [
      "조합설립인가일 전 취득인지 후 취득인지가 첫 갈림길입니다. 인가 후 1인 다물권자에게서 사면 '입주권 1개를 여럿이 지분으로 나눠 갖는' 구조가 됩니다.",
      "매수 전 매도인이 구역 안에 여러 필지·주택을 가진 사람인지, 조합설립인가일이 언제인지, 분양신청을 어떤 방식으로 하는 구역인지 확인합니다.",
      "여럿이 함께 사거나 지분으로 살 때는 '대표조합원 선임 및 분양신청' 특약과 선임 합의서를 계약 단계에서 준비하세요. 이 사건은 그 서류가 없어 전원이 청산대상이 됐습니다.",
      "1세대 다물권자는 결론이 다를 수 있습니다 — 제2호와 제3호가 겹쳐 적용되는 경우(대법원 2023. 6. 29. 선고 2022두56586)와 이혼·성인 자녀 분가 예외를 함께 봅니다.",
    ],
    result: "상고기각 — 원고 전원 현금청산대상자로 확정",
    source: { label: "판례속보 (대법원)", href: "https://www.scourt.go.kr/portal/news/NewsViewAction.work?gubun=4&seqnum=9091" },
  },
  {
    id: "case-3",
    no: "03",
    issue: "권리산정기준일 · 지분 쪼개기",
    title: "권리산정기준일 전에 상속이 열렸다면, 그 뒤 등기해도 단독 분양대상",
    court: "대법원",
    decided: "2025. 5. 29.",
    caseNo: "2024두31185",
    caseName: "조합원지위확인",
    facts: [
      "서울 은평구 주택재개발 구역 안 토지 770㎡의 소유자가 1980년 사망했고, 상속인 6명이 2005년 상속재산분할협의에 따라 상속등기를 마쳤습니다. 원고들은 그 상속인들에게서 지분을 사거나 전전 양수했습니다.",
      "조합은 원고들을 1인의 분양대상자로 묶어 주택 1채만 분양하는 관리처분계획을 세웠고, 원고들은 자기 지분이 단독분양 기준(90㎡)을 넘는다며 소송을 냈습니다.",
      "1심은 기준일 현재 등기가 없었다며 청구를 기각했지만, 항소심은 기준일 전에 상속이 열린 상속인에게서 산 원고 2명을 각각 단독 분양대상자로 인정했습니다. 대법원이 이를 확정했습니다.",
    ],
    law: [
      {
        text: "구 서울특별시 도시정비조례 제27조 제2항 제3호 단서는 2003. 12. 30.(권리산정기준일) 전부터 공유지분으로 소유한 토지의 지분면적이 90㎡ 이상이면 단독 분양대상자로 봅니다.",
        cite: "구 서울시 도시정비조례 제27조 제2항 제3호 단서",
      },
      {
        text: "상속은 사망과 동시에 열리고(민법 제997조), 상속인은 그때 포괄적으로 권리의무를 승계하며(제1005조), 분할의 효력은 상속개시 때로 소급합니다(제1015조). 상속에 의한 부동산 취득은 등기가 필요 없습니다(제187조). 그래서 기준일 전에 상속이 열렸다면 등기가 기준일 뒤에 됐어도 '기준일 전부터 소유한 자'에 해당합니다.",
      },
      {
        text: "상속재산분할협의로 90㎡ 이상을 갖게 된 경우도, 그 협의가 오로지 '지분 쪼개기' 목적이어서 권리남용·신의칙 위반이라고 볼 특별한 사정이 없으면 마찬가지입니다. 다만 그 특별한 사정은 사업시행자가 증명해야 하고, 기준일 뒤 분할협의로 분양받을 주택 수가 늘었다면 목적을 사실상 추정할 수 있습니다.",
      },
    ],
    checks: [
      "권리산정기준일이 언제인지(조례·고시) 먼저 확인하고, 그 전후의 취득·분할·전환 이력을 등기부와 건축물대장으로 맞춰 봅니다.",
      "상속 건은 사망일(상속개시일)과 등기 접수일을 구분해서 봅니다. 등기일만 보고 '기준일 이후 취득'이라 단정하면 이 판결과 반대 결론이 납니다.",
      "지분면적 기준은 지자체 조례마다 다릅니다(서울 90㎡, 시기별 조례 개정 이력도 확인). 무주택 요건 등 다른 요건도 함께 봐야 합니다.",
      "기준일 이후 지분을 추가로 산 경우(이 사건 원고 2명)는 단독분양이 인정되지 않았습니다 — 매수 시점과 매수 전 지분면적을 구분해 설명해야 합니다.",
    ],
    result: "상고기각 — 원고 2명 단독 분양대상자 확정",
    source: { label: "판결 기사 (법률신문)", href: "https://www.lawtimes.co.kr/news/articleView.html?idxno=209252" },
  },
  {
    id: "case-4",
    no: "04",
    issue: "감정평가 기준일 · 개발이익",
    title: "투기과열지구에서 조합원이 못 되면, 청산금은 '산 날' 가격에 개발이익까지",
    court: "대법원",
    decided: "2025. 8. 14.",
    caseNo: "2022다228230",
    caseName: "소유권이전등기",
    facts: [
      "서초구 재건축 구역입니다. 1992년 취득한 사람이 조합원이 됐고 2013년 조합설립인가, 2017. 8. 3. 투기과열지구 지정, 2018. 12. 3. 관리처분계획인가가 이어졌습니다.",
      "이 부동산에 채권자 가압류가 붙어 강제경매가 개시됐고, 피고가 2020. 6. 26. 매수해 매각대금을 완납했습니다. 그중 1/2 지분은 1세대 1주택 예외가 적용되는 전 소유자 지분, 나머지 1/2은 이혼 재산분할로 취득한 전 배우자 지분이었습니다.",
      "조합은 조합원 자격이 없는 피고를 상대로 매도청구를 했고, 원심은 투기과열지구 지정 전 거래사례로 개발이익을 뺀 감정액을 매매대금으로 삼았습니다. 대법원은 기준시점과 개발이익을 다시 보라고 파기환송했습니다.",
    ],
    law: [
      {
        text: "투기과열지구에서 재건축사업의 건축물·토지를 조합설립인가 후 양수한 사람은 조합원이 될 수 없고, 조합은 제73조를 준용해 손실보상(매도청구)을 합니다. 상속·이혼으로 인한 양도는 제외되고, 양도인이 10년 소유·5년 거주 1세대 1주택자면 예외가 인정됩니다.",
        cite: "구 도시정비법 제39조 제2항·제3항, 시행령 제37조 제1항",
      },
      {
        text: "이때 손실보상의무가 생기는 시기와 가액 평가 기준시점은 모두 '그가 부동산을 양수한 날'이고, 매도청구로 매매계약 성립이 의제되는 날도 같은 날입니다.",
      },
      {
        text: "매매대금은 그때의 시가, 곧 재건축사업이 시행되는 것을 전제로 평가한 가격 — 재건축으로 생길 것으로 예상되는 개발이익이 포함된 가격입니다. 개발이익을 빼고 감정한 원심은 그대로 둘 수 없습니다.",
        cite: "대법원 2014. 12. 11. 선고 2014다41698 판결",
      },
    ],
    checks: [
      "투기과열지구 지정일·조합설립인가일·취득일 세 날짜를 나란히 놓고 봅니다. 경매로 낙찰받은 경우도 매각대금 완납일이 취득일이 됩니다.",
      "취득 경로를 봅니다 — 매매·경매는 원칙적으로 대상, 상속·이혼 재산분할은 제외. 지분이 나뉘어 있으면 지분마다 예외 요건을 따로 따집니다(이 사건은 1/2만 매도청구 인정).",
      "양도인이 1세대 1주택자로서 10년 이상 소유·5년 이상 거주했는지 확인합니다. 이 요건이 맞으면 조합원 지위가 승계됩니다.",
      "청산금은 '산 날' 가격이 기준입니다. 그 뒤 시세가 올라도 반영되지 않으니, 경매 낙찰가·매수 직전 시세와 청산금을 견줘 손실 가능성을 설명해 주세요.",
      "재개발은 토지보상법 보상평가라 개발이익을 빼고, 재건축은 시가라 개발이익을 넣습니다 — 같은 '현금청산'인데 금액 수준이 다른 이유입니다.",
    ],
    result: "파기환송(매매대금 산정 부분) — 기준시점은 양수일, 개발이익 포함",
    source: { label: "판결 전문 (케이스노트)", href: "https://casenote.kr/대법원/2022다228230" },
  },
];

type MoreCase = {
  no: string;
  issue: string;
  cite: string;
  name: string;
  body: string;
  href: string;
};

const MORE: MoreCase[] = [
  {
    no: "05",
    issue: "수용 · 지연가산금",
    cite: "대법원 2015. 12. 23. 선고 2015두50535 판결 [손실보상금]",
    name: "협의가 깨지면 별도 손실보상 협의 없이 바로 수용재결을 청구할 수 있다",
    body:
      "재개발 현금청산대상자는 청산금 협의가 성립하지 않으면 토지보상법상 손실보상 협의를 따로 거칠 필요 없이 조합에 수용재결 신청을 청구할 수 있습니다. 현금청산기간 만료 전에 청구했더라도 협의 성립 가능성이 없음이 명백하면 유효하고, 이 경우 60일은 청구일이 아니라 현금청산기간 만료일부터 계산합니다. 조합이 그 안에 재결을 신청하지 않으면 지연 가산금을 물어야 합니다.",
    href: "https://casenote.kr/대법원/2015두50535",
  },
  {
    no: "06",
    issue: "지연이자 · 명도",
    cite: "대법원 2020. 9. 3. 선고 2018두48922 판결 [청산금이자지급청구]",
    name: "150일을 넘겨 지급했어도, 소유자가 계속 점유하다 넘겼다면 지체책임은 없다",
    body:
      "청산금 150일 이행기간을 넘겼는지의 지체책임은 '종전자산을 언제 출자했는지'와 '실제로 돈을 준 시점'을 견줘 판단합니다. 소유자가 조합원으로 있으면서 종전자산을 계속 점유하다가 청산금을 받은 뒤에 넘겼다면 늦게 줬어도 지연이자는 없고, 점유를 먼저 넘겼는데 150일을 넘겨 지급했다면 정관 비율(없으면 연 5%)의 지연이자가 붙습니다. 관리처분계획 인가·고시만으로는 조합이 현금청산대상자의 부동산 인도를 청구할 수 없고 협의나 수용 절차를 거쳐야 한다는 점도 함께 확인됩니다(명도 분쟁의 출발점).",
    href: "https://casenote.kr/대법원/2018두48922",
  },
  {
    no: "07",
    issue: "감정 기준일 (구법)",
    cite: "대법원 2010. 12. 23. 선고 2010다73215 판결 [소유권이전등기절차이행등]",
    name: "재건축 조합은 매도청구로 소유권을 넘겨받고, 기준시점은 분양신청 마감 다음 날",
    body:
      "재건축조합은 현금청산 조항(구 제47조)만으로는 소유권이전을 청구할 수 없고, 현금청산대상자를 조합탈퇴자에 준하는 신분으로 보아 매도청구 규정을 준용해 청구합니다. 청산금 지급의무 발생일·가액 평가 기준시점·매매 성립 의제일을 모두 '분양신청기간 종료일 다음 날'로 봤습니다. 다만 현행 도시정비법 제73조 아래에서는 같은 기준일을 '매도청구서(소장 부본) 송달일'로 보는 하급심이 나와 판단이 갈리고 있고, 이 쟁점의 대법원 판단은 아직 나오지 않았습니다(2026년 11월 기준).",
    href: "https://casenote.kr/대법원/2010다73215",
  },
  {
    no: "08",
    issue: "1세대 다물권",
    cite: "대법원 2023. 6. 29. 선고 2022두56586 판결 [관리처분계획일부무효확인등]",
    name: "1세대 다물권자에게서 나눠 사도, 대표 1인을 조합원으로 본다",
    body:
      "1세대에 속한 여러 명의 토지등소유자에게서 각각 구역 안 부동산의 일부를 양수한 경우에는 '1세대' 규정과 '조합설립인가 후 1인으로부터 양수' 규정이 겹쳐 적용되어, 원칙적으로 그 전원을 대표하는 1인을 조합원으로 봐야 합니다. 이혼·성인 자녀 분가 예외가 있어 1인 다물권자와 똑같이 다루면 안 되는 경우도 있습니다.",
    href: "https://casenote.kr/대법원/2022두56586",
  },
];

const HOW = [
  {
    k: "근거",
    t: "판결문 원문 기준",
    d: "사건번호·법원·선고일을 적고, 보도 요약이 아니라 판결 이유에 적힌 문구를 근거로 삼습니다. 확인되지 않은 사건은 싣지 않습니다.",
  },
  {
    k: "순서",
    t: "요지 → 법리 → 실무",
    d: "무엇이 문제였고(사실관계) → 어떤 조문으로 판단했고(법리) → 매물·상담에서 무엇을 확인해야 하는지(실무) 순서로 정리합니다.",
  },
  {
    k: "한계",
    t: "사례 하나는 정답이 아님",
    d: "같은 쟁점도 구역·시점·조례·증거에 따라 결론이 달라집니다. 조문도 개정 전후가 섞여 있으니 사건마다 적용 법령을 확인하세요.",
  },
];

export default function CasesPage() {
  return (
    <div className="mx-auto w-full max-w-[980px] px-4 py-10 sm:px-6 sm:py-14">
      {/* ── 머리 ─────────────────────────────────────────────────────────── */}
      <p className="text-[11px] font-bold tracking-[0.14em] text-brand">
        REDEV · CASH LIQUIDATION CASE REPORT
      </p>
      <h1 className="mt-2 text-[26px] font-extrabold leading-[1.28] tracking-[-0.035em] text-ink sm:text-[32px]">
        재개발·재건축
        <br className="sm:hidden" /> 현금청산 판례 리포트
      </h1>
      <p className="mt-3 max-w-[660px] text-[14px] leading-[1.75] text-slate-600">
        분양신청을 놓쳐서, 다물권자 물건을 나눠 사서, 권리산정기준일 뒤에 지분을 갖게 돼서 —
        결국 새 아파트 대신 돈으로 정산받는 자리. 상담에서 가장 자주 나오는 다섯 가지 쟁점을
        대법원 판결 원문으로 확인해 정리했습니다. 판례가 어디서 갈렸는지, 계약 전에 무엇을
        확인해야 하는지까지 적었습니다.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-2 text-[11px] font-semibold">
        <span className="rounded-full bg-brand-tint px-2.5 py-1 text-brand">2026. 11. 23. 발행</span>
        <span className="rounded-full border border-line bg-white px-2.5 py-1 text-slate-600">
          대법원 판결 8건
        </span>
        <span className="rounded-full border border-line bg-white px-2.5 py-1 text-slate-600">
          판결문 원문 기준
        </span>
        <span className="rounded-full border border-line bg-white px-2.5 py-1 text-slate-600">
          매주 월요일 업데이트
        </span>
      </div>

      {/* ── 3줄 요약 ─────────────────────────────────────────────────────── */}
      <section className="mt-8 overflow-hidden rounded-xl border border-brand/20 bg-white">
        <div className="flex items-center justify-between border-b border-line px-4 py-3 sm:px-5">
          <h2 className="text-[13px] font-bold text-ink">먼저 이것만</h2>
          <span className="text-[11px] font-medium text-slate-500">현금청산의 뼈대 3가지</span>
        </div>
        <ol className="divide-y divide-line">
          <li className="flex gap-3 px-4 py-3.5 sm:px-5">
            <span className="text-[11px] font-extrabold text-brand">01</span>
            <p className="text-[12.5px] leading-[1.7] text-slate-700">
              <b className="font-bold text-ink">언제</b> — 청산금은 '현금청산대상자가 된 날'의
              가격으로 계산합니다. 그 뒤 집값이 올라도 반영되지 않습니다.
            </p>
          </li>
          <li className="flex gap-3 px-4 py-3.5 sm:px-5">
            <span className="text-[11px] font-extrabold text-brand">02</span>
            <p className="text-[12.5px] leading-[1.7] text-slate-700">
              <b className="font-bold text-ink">몇 개</b> — 조합설립인가 뒤 다물권자에게서 물건을
              나눠 사면 입주권은 1개, 대표조합원을 세우지 않으면 전원 청산으로 갈 수 있습니다.
            </p>
          </li>
          <li className="flex gap-3 px-4 py-3.5 sm:px-5">
            <span className="text-[11px] font-extrabold text-brand">03</span>
            <p className="text-[12.5px] leading-[1.7] text-slate-700">
              <b className="font-bold text-ink">얼마</b> — 재개발은 개발이익을 뺀 보상평가,
              재건축은 개발이익을 넣은 시가. 같은 청산인데 금액이 다릅니다.
            </p>
          </li>
        </ol>
      </section>

      {/* ── 쟁점 지도 ────────────────────────────────────────────────────── */}
      <h2 className="mt-10 text-[13px] font-bold tracking-[-0.01em] text-ink">다루는 쟁점</h2>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {ISSUES.map((t) => (
          <li key={t.no} className="rounded-xl border border-line bg-white">
            <Link href={t.anchor} className="block p-4 transition-colors hover:bg-slate-50">
              <div className="flex items-baseline gap-2">
                <span className="text-[11px] font-extrabold text-brand">{t.no}</span>
                <h3 className="text-[13.5px] font-bold tracking-[-0.02em] text-ink">{t.title}</h3>
              </div>
              <p className="mt-1.5 text-[12px] leading-[1.7] text-slate-600">{t.desc}</p>
            </Link>
          </li>
        ))}
      </ul>

      {/* ── 판례 카드 ────────────────────────────────────────────────────── */}
      <div className="mt-12 flex items-end justify-between gap-3 border-b border-line pb-2">
        <h2 className="text-[15px] font-bold tracking-[-0.02em] text-ink">이번 호 판례</h2>
        <p className="text-[11px] font-medium text-slate-500">4건 · 원문 대조 완료</p>
      </div>

      {CASES.map((c) => (
        <article
          key={c.id}
          id={c.id}
          className="mt-5 scroll-mt-20 overflow-hidden rounded-xl border border-line bg-white"
        >
          <header className="border-b border-line bg-brand-tint px-4 py-3.5 sm:px-5">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="rounded bg-brand px-1.5 py-0.5 text-[10px] font-bold text-white">
                {c.no}
              </span>
              <span className="text-[11px] font-bold text-brand">{c.issue}</span>
              <span className="ml-auto text-[11px] font-medium text-slate-500">
                {c.court} {c.decided} 선고
              </span>
            </div>
            <h3 className="mt-2 text-[15.5px] font-bold leading-[1.45] tracking-[-0.02em] text-ink sm:text-[17px]">
              {c.title}
            </h3>
            <p className="mt-1.5 text-[11.5px] font-medium leading-relaxed text-slate-600">
              {c.caseNo} [{c.caseName}]
              {c.appeal && <span className="text-slate-500"> · {c.appeal}</span>}
            </p>
          </header>

          <div className="divide-y divide-line">
            <section className="grid gap-1.5 px-4 py-3.5 sm:grid-cols-[70px_1fr] sm:gap-3 sm:px-5">
              <h4 className="text-[11px] font-bold text-slate-400">요지</h4>
              <div className="space-y-1.5">
                {c.facts.map((f, i) => (
                  <p key={i} className="text-[12.5px] leading-[1.75] text-slate-700">
                    {f}
                  </p>
                ))}
              </div>
            </section>

            <section className="grid gap-1.5 px-4 py-3.5 sm:grid-cols-[70px_1fr] sm:gap-3 sm:px-5">
              <h4 className="text-[11px] font-bold text-slate-400">핵심 법리</h4>
              <ol className="space-y-2">
                {c.law.map((l, i) => (
                  <li key={i} className="text-[12.5px] leading-[1.75] text-slate-700">
                    <span className="mr-1 text-[11px] font-extrabold text-brand">{i + 1}</span>
                    {l.text}
                    {l.cite && (
                      <span className="mt-0.5 block text-[11px] font-medium text-slate-500">
                        {l.cite}
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            </section>

            <section className="grid gap-1.5 px-4 py-3.5 sm:grid-cols-[70px_1fr] sm:gap-3 sm:px-5">
              <h4 className="text-[11px] font-bold text-brand">실무 체크</h4>
              <ul className="space-y-1.5">
                {c.checks.map((k, i) => (
                  <li key={i} className="flex gap-2 text-[12.5px] leading-[1.75] text-slate-700">
                    <span aria-hidden className="mt-[7px] h-[5px] w-[5px] shrink-0 rounded-full bg-brand/60" />
                    <span>{k}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-slate-50 px-4 py-2.5 sm:px-5">
            <p className="text-[11.5px] font-semibold text-slate-600">{c.result}</p>
            <a
              href={c.source.href}
              target="_blank"
              rel="noreferrer"
              className="text-[11.5px] font-semibold text-brand underline decoration-brand/30 underline-offset-2 hover:decoration-brand"
            >
              {c.source.label} ↗
            </a>
          </footer>
        </article>
      ))}

      {/* ── 함께 읽는 판례 ───────────────────────────────────────────────── */}
      <div id="more" className="mt-12 scroll-mt-20 flex items-end justify-between gap-3 border-b border-line pb-2">
        <h2 className="text-[15px] font-bold tracking-[-0.02em] text-ink">함께 읽는 판례</h2>
        <p className="text-[11px] font-medium text-slate-500">쟁점별 보충 4건</p>
      </div>
      <ul className="mt-4 space-y-2.5">
        {MORE.map((m) => (
          <li key={m.no} className="rounded-xl border border-line bg-white px-4 py-4 sm:px-5">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-[11px] font-extrabold text-brand">{m.no}</span>
              <span className="rounded border border-line bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                {m.issue}
              </span>
            </div>
            <h3 className="mt-1.5 text-[13.5px] font-bold leading-[1.5] tracking-[-0.02em] text-ink">
              {m.name}
            </h3>
            <p className="mt-1 text-[11px] font-medium text-slate-500">{m.cite}</p>
            <p className="mt-2 text-[12.5px] leading-[1.75] text-slate-700">{m.body}</p>
            <a
              href={m.href}
              target="_blank"
              rel="noreferrer"
              className="mt-1.5 inline-block text-[11.5px] font-semibold text-brand underline decoration-brand/30 underline-offset-2 hover:decoration-brand"
            >
              판결문 보기 ↗
            </a>
          </li>
        ))}
      </ul>

      {/* ── 읽는 방법 ────────────────────────────────────────────────────── */}
      <h2 className="mt-12 text-[13px] font-bold tracking-[-0.01em] text-ink">이렇게 정리합니다</h2>
      <dl className="mt-3 divide-y divide-line rounded-xl border border-line bg-white">
        {HOW.map((h) => (
          <div key={h.k} className="grid gap-1 px-4 py-3.5 sm:grid-cols-[88px_1fr] sm:gap-3">
            <dt className="text-[11px] font-bold text-slate-400">{h.k}</dt>
            <dd>
              <p className="text-[13px] font-bold text-ink">{h.t}</p>
              <p className="mt-0.5 text-[12px] leading-[1.7] text-slate-600">{h.d}</p>
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-8 flex flex-col gap-3 rounded-xl border border-line bg-white px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[12px] leading-relaxed text-slate-600">
          리포트에서 다뤘으면 하는 판례·쟁점이 있으면 알려 주세요. 상담에서 자주 나온 순서대로
          올리겠습니다.
        </p>
        <Link
          href="/"
          className="shrink-0 rounded-md bg-brand px-3 py-1.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-brand-deep"
        >
          지도에서 구역 보기
        </Link>
      </div>

      <p className="mt-6 text-[11px] leading-relaxed text-slate-400">
        리디브의 판례 리포트는 공개된 판결문을 정리한 참고자료이며 법률 자문이 아닙니다. 판결 내용은
        사건마다 적용 법령(개정 전후)과 사실관계가 달라 그대로 적용할 수 없고, 개별 사안의 결론은
        계약·소송 전에 변호사 등 전문가의 확인을 받으세요. 사건번호·선고일은 국가법령정보센터·대법원
        판례속보·케이스노트의 판결문과 대조했습니다.
      </p>
    </div>
  );
}
