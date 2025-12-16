export function period16to15(periodMonth: string) {
  const m = (periodMonth ?? "").trim();
  if (!/^\d{4}-\d{2}$/.test(m)) throw new Error("対象月は YYYY-MM で入力してください");

  const [y, mm] = m.split("-").map(Number);

  const start = `${y}-${String(mm).padStart(2, "0")}-16`;

  const ny = mm === 12 ? y + 1 : y;
  const nmm = mm === 12 ? 1 : mm + 1;
  const end = `${ny}-${String(nmm).padStart(2, "0")}-15`;

  return { start, end, label: `${start}〜${end}` };
}
