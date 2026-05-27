export const CONTRACT_STATUS_OPTIONS = [
  "계약완료",
  "계약진행중",
  "계약미정",
  "계약불가",
  "추후접촉",
] as const;

export type ContractStatus = (typeof CONTRACT_STATUS_OPTIONS)[number];

export function contractStatusStyle(status: string): string {
  const t = status.trim();
  if (t === "계약완료") return "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200";
  if (t === "계약진행중") return "bg-sky-100 text-sky-900 dark:bg-sky-950/60 dark:text-sky-200";
  if (t === "계약미정") return "bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200";
  if (t === "계약불가") return "bg-red-100 text-red-900 dark:bg-red-950/60 dark:text-red-200";
  if (t === "추후접촉") return "bg-violet-100 text-violet-900 dark:bg-violet-950/60 dark:text-violet-200";
  return "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
}
