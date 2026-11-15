/** 만원 단위 정수를 "6억 3,500만원" 형태로 */
export function formatMan(m: number | undefined | null): string {
  if (m === undefined || m === null) return "-";
  const eok = Math.floor(m / 10000);
  const man = m % 10000;
  if (eok <= 0) return man.toLocaleString() + "만원";
  return man === 0 ? eok + "억" : eok + "억 " + man.toLocaleString() + "만원";
}

/** 부동산 표기: 64,000 (만원) */
export function man(n: number | undefined | null): string {
  if (n === undefined || n === null) return "-";
  return n.toLocaleString();
}

export function pct(n: number): string {
  return n.toFixed(1) + "%";
}
