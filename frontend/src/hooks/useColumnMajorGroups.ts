"use client";

import { useCallback, useMemo, useState } from "react";
import {
  DEFAULT_COLUMN_MAJOR_ID,
  groupColumnKeysByMajor,
  loadColumnMajorGroups,
  newMajorGroupId,
  saveColumnMajorGroups,
  sortMajorGroups,
  type ColumnMajorGroup,
  type ColumnMajorGroupsData,
} from "@/lib/tableColumnMajorGroups";
import type { TableListPageId } from "@/lib/tableListView";

export function useColumnMajorGroups(pageId: TableListPageId) {
  const [data, setData] = useState<ColumnMajorGroupsData>(() => loadColumnMajorGroups(pageId));

  const persist = useCallback(
    (next: ColumnMajorGroupsData) => {
      const normalized: ColumnMajorGroupsData = {
        groups: sortMajorGroups(next.groups),
        assignments: { ...next.assignments },
      };
      setData(normalized);
      saveColumnMajorGroups(pageId, normalized);
    },
    [pageId],
  );

  const majors = useMemo(() => sortMajorGroups(data.groups), [data.groups]);

  const getMajorIdForColumn = useCallback(
    (field: string) => data.assignments[field] ?? DEFAULT_COLUMN_MAJOR_ID,
    [data.assignments],
  );

  const getMajorName = useCallback(
    (majorId: string) => majors.find((m) => m.id === majorId)?.name ?? "기본",
    [majors],
  );

  const setColumnMajor = useCallback(
    (field: string, majorId: string) => {
      if (!majors.some((m) => m.id === majorId)) return;
      const assignments = { ...data.assignments };
      if (majorId === DEFAULT_COLUMN_MAJOR_ID) {
        delete assignments[field];
      } else {
        assignments[field] = majorId;
      }
      persist({ ...data, assignments });
    },
    [data, majors, persist],
  );

  const addMajor = useCallback(
    (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return null;
      const maxOrder = majors.reduce((m, g) => Math.max(m, g.order), -1);
      const group: ColumnMajorGroup = {
        id: newMajorGroupId(),
        name: trimmed,
        order: maxOrder + 1,
      };
      persist({ ...data, groups: [...data.groups, group] });
      return group.id;
    },
    [data, majors, persist],
  );

  const renameMajor = useCallback(
    (majorId: string) => {
      const current = majors.find((m) => m.id === majorId);
      if (!current) return;
      const next = window.prompt("대분류 이름", current.name);
      if (next === null) return;
      const trimmed = next.trim();
      if (!trimmed) return;
      persist({
        ...data,
        groups: data.groups.map((g) => (g.id === majorId ? { ...g, name: trimmed } : g)),
      });
    },
    [data, majors, persist],
  );

  const deleteMajor = useCallback(
    (majorId: string) => {
      if (majorId === DEFAULT_COLUMN_MAJOR_ID) {
        window.alert("「기본」 대분류는 삭제할 수 없습니다.");
        return;
      }
      const major = majors.find((m) => m.id === majorId);
      if (!major) return;
      const assigned = Object.values(data.assignments).filter((id) => id === majorId).length;
      if (
        assigned > 0 &&
        !window.confirm(
          `「${major.name}」에 속한 열 ${assigned}개가 「기본」으로 이동합니다. 삭제할까요?`,
        )
      ) {
        return;
      }
      const assignments = { ...data.assignments };
      for (const [key, id] of Object.entries(assignments)) {
        if (id === majorId) delete assignments[key];
      }
      persist({
        groups: data.groups.filter((g) => g.id !== majorId),
        assignments,
      });
    },
    [data, majors, persist],
  );

  const groupKeys = useCallback(
    (allKeys: string[]) => groupColumnKeysByMajor(allKeys, data),
    [data],
  );

  const pickMajorForColumn = useCallback(
    (field: string) => {
      const currentId = getMajorIdForColumn(field);
      const lines = majors
        .map((m, i) => `${i + 1}. ${m.name}${m.id === currentId ? " ← 현재" : ""}`)
        .join("\n");
      const raw = window.prompt(`「${field}」 대분류\n\n${lines}\n\n번호 입력:`);
      if (raw === null || !raw.trim()) return;
      const idx = Number.parseInt(raw.trim(), 10) - 1;
      if (Number.isNaN(idx) || idx < 0 || idx >= majors.length) {
        window.alert("올바른 번호를 입력하세요.");
        return;
      }
      setColumnMajor(field, majors[idx]!.id);
    },
    [getMajorIdForColumn, majors, setColumnMajor],
  );

  return {
    majors,
    getMajorIdForColumn,
    getMajorName,
    setColumnMajor,
    addMajor,
    renameMajor,
    deleteMajor,
    groupKeys,
    pickMajorForColumn,
  };
}
