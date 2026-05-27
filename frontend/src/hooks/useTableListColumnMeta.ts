"use client";

import { useColumnLabels } from "@/hooks/useColumnLabels";
import { useColumnMajorGroups } from "@/hooks/useColumnMajorGroups";
import type { useTableColumnVisibility } from "@/hooks/useTableColumnVisibility";
import type { TableListPageId } from "@/lib/tableListView";

/** 7개 정리 표 공통: 열 표시 이름 + 대분류 */
export function useTableListColumnMeta(pageId: TableListPageId) {
  const colLabels = useColumnLabels(pageId);
  const colMajors = useColumnMajorGroups(pageId);

  const columnVisibilityFor = (
    allKeys: string[],
    colVis: ReturnType<typeof useTableColumnVisibility>,
    columnLabel?: (key: string) => string,
  ) => ({
    allKeys,
    hiddenColumns: colVis.hiddenColumns,
    onSetVisible: colVis.setColumnVisible,
    onShowAllColumns: colVis.showAllColumns,
    columnLabel: columnLabel ?? colLabels.getLabel,
    majorGroups: {
      majors: colMajors.majors,
      majorForKey: colMajors.getMajorIdForColumn,
      majorName: colMajors.getMajorName,
      onSetColumnMajor: colMajors.setColumnMajor,
      onAddMajor: colMajors.addMajor,
      onRenameMajor: colMajors.renameMajor,
      onDeleteMajor: colMajors.deleteMajor,
      groupKeys: colMajors.groupKeys,
    },
  });

  return { colLabels, colMajors, columnVisibilityFor };
}
