import type { TableListPageId } from "@/lib/tableListView";

export type ColumnMajorGroup = {
  id: string;
  name: string;
  order: number;
};

export type ColumnMajorGroupsData = {
  groups: ColumnMajorGroup[];
  /** column field key → major group id */
  assignments: Record<string, string>;
};

export const DEFAULT_COLUMN_MAJOR_ID = "default";

export function defaultColumnMajorGroups(): ColumnMajorGroupsData {
  return {
    groups: [{ id: DEFAULT_COLUMN_MAJOR_ID, name: "기본", order: 0 }],
    assignments: {},
  };
}

function storageKey(pageId: TableListPageId) {
  return `table_list.${pageId}.columnMajorGroups`;
}

export function newMajorGroupId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `major_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function loadColumnMajorGroups(pageId: TableListPageId): ColumnMajorGroupsData {
  if (typeof window === "undefined") return defaultColumnMajorGroups();
  try {
    const raw = localStorage.getItem(storageKey(pageId));
    if (!raw) return defaultColumnMajorGroups();
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return defaultColumnMajorGroups();
    }
    const rec = parsed as Record<string, unknown>;
    const groupsRaw = rec.groups;
    const assignmentsRaw = rec.assignments;
    const groups: ColumnMajorGroup[] = [];
    if (Array.isArray(groupsRaw)) {
      for (const g of groupsRaw) {
        if (!g || typeof g !== "object" || Array.isArray(g)) continue;
        const o = g as Record<string, unknown>;
        if (typeof o.id !== "string" || typeof o.name !== "string") continue;
        groups.push({
          id: o.id,
          name: o.name.trim() || "대분류",
          order: typeof o.order === "number" ? o.order : groups.length,
        });
      }
    }
    const assignments: Record<string, string> = {};
    if (assignmentsRaw && typeof assignmentsRaw === "object" && !Array.isArray(assignmentsRaw)) {
      for (const [k, v] of Object.entries(assignmentsRaw as Record<string, unknown>)) {
        if (typeof k === "string" && typeof v === "string" && v) assignments[k] = v;
      }
    }
    if (groups.length === 0) return defaultColumnMajorGroups();
    if (!groups.some((g) => g.id === DEFAULT_COLUMN_MAJOR_ID)) {
      groups.unshift({ id: DEFAULT_COLUMN_MAJOR_ID, name: "기본", order: -1 });
    }
    return { groups: sortMajorGroups(groups), assignments };
  } catch {
    return defaultColumnMajorGroups();
  }
}

export function saveColumnMajorGroups(pageId: TableListPageId, data: ColumnMajorGroupsData) {
  try {
    localStorage.setItem(storageKey(pageId), JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

export function sortMajorGroups(groups: ColumnMajorGroup[]): ColumnMajorGroup[] {
  return [...groups].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, "ko"));
}

export function groupColumnKeysByMajor(
  allKeys: string[],
  data: ColumnMajorGroupsData,
): { major: ColumnMajorGroup; keys: string[] }[] {
  const majors = sortMajorGroups(data.groups);
  const fallbackId = majors[0]?.id ?? DEFAULT_COLUMN_MAJOR_ID;
  const buckets = new Map<string, string[]>();
  for (const m of majors) buckets.set(m.id, []);
  for (const key of allKeys) {
    const mid = data.assignments[key] ?? fallbackId;
    if (!buckets.has(mid)) buckets.set(mid, []);
    buckets.get(mid)!.push(key);
  }
  return majors.map((major) => ({
    major,
    keys: buckets.get(major.id) ?? [],
  }));
}
