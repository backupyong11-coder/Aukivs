export function safeInt(v: unknown): number {
  try {
    const s = String(v ?? "").trim();
    if (!s || s === "-") return 0;
    return Math.floor(parseFloat(s)) || 0;
  } catch {
    return 0;
  }
}
