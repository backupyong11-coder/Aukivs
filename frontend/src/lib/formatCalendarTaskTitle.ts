import type { TaskSheetRow } from "@/lib/tasks";

/** 달력 일정 패널 업무 한 줄: [분야][분류][관련] + 정리된 업무명 */
function normalizeCalendarTagInner(raw: string): string {
  let t = (raw ?? "").trim();
  if (t.startsWith("[") && t.endsWith("]")) {
    t = t.slice(1, -1).trim();
  }
  return t;
}

function uniqueOrderedCalendarTags(tag1: string, tag2: string, tag3: string): string[] {
  const candidates = [
    normalizeCalendarTagInner(tag1),
    normalizeCalendarTagInner(tag2),
    normalizeCalendarTagInner(tag3),
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of candidates) {
    if (!t) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

function stripLeadingBracketBlocks(업무명: string): string {
  let s = (업무명 ?? "").trim();
  let guard = 0;
  while (guard++ < 80) {
    const next = s.replace(/^\s*\[[^\]]*\]\s*/, "");
    if (next === s) break;
    s = next;
  }
  return s.trim();
}

/**
 * 업무명 앞에서 분류·관련 열과 겹치는 선행 단어만 제거(분야와 동일한 값은 본문 의미일 수 있어 제외).
 */
function stripLeadingBodyEchoes(
  body: string,
  분야Inner: string,
  분류Inner: string,
  관련Inner: string,
): string {
  let eff2 = 분류Inner.trim();
  if (eff2 && eff2 === 분야Inner) eff2 = "";
  let eff3 = 관련Inner.trim();
  if (eff3 && (eff3 === 분야Inner || eff3 === eff2)) eff3 = "";
  const removable = new Set([eff2, eff3].filter(Boolean));

  let s = body.trim();
  let guard = 0;
  while (guard++ < 40) {
    const m = /^(\S+)/u.exec(s);
    if (!m) break;
    if (!removable.has(m[1])) break;
    s = s.slice(m[1].length).trim();
  }
  return s;
}

export function formatCalendarTaskTitle(row: TaskSheetRow): string {
  const tag1 = row["분야"] ?? "";
  const tag2 = row["분류"] ?? "";
  const rawWorks = row["관련작품"] ?? "";
  const tag3 = rawWorks.trim() ? rawWorks : (row["관련플랫폼"] ?? "");

  const 분야Inner = normalizeCalendarTagInner(tag1);
  const 분류Inner = normalizeCalendarTagInner(tag2);
  const 관련Inner = normalizeCalendarTagInner(tag3);

  const orderedTags = uniqueOrderedCalendarTags(tag1, tag2, tag3);
  const prefix = orderedTags.map((t) => `[${t}]`).join(" ");

  let body = stripLeadingBracketBlocks(row["업무명"] ?? "");
  body = stripLeadingBodyEchoes(body, 분야Inner, 분류Inner, 관련Inner);

  if (!prefix && !body) return "";
  if (!prefix) return body;
  if (!body) return prefix;
  return `${prefix} ${body}`;
}
