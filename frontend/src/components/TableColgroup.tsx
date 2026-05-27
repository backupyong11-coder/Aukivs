"use client";

const colStyle = (px: number) => ({ width: px, minWidth: px, maxWidth: px });

export function TableColgroup(props: {
  dataKeys: string[];
  getWidth: (key: string) => number;
  leadingActionCols?: number;
  trailingActionCols?: number;
  actionWidthPx?: number;
}) {
  const {
    dataKeys,
    getWidth,
    leadingActionCols = 0,
    trailingActionCols = 0,
    actionWidthPx = 72,
  } = props;

  return (
    <colgroup>
      {Array.from({ length: leadingActionCols }, (_, i) => (
        <col key={`lead-${i}`} style={colStyle(actionWidthPx)} />
      ))}
      {dataKeys.map((key) => (
        <col key={key} style={colStyle(getWidth(key))} />
      ))}
      {Array.from({ length: trailingActionCols }, (_, i) => (
        <col key={`trail-${i}`} style={colStyle(actionWidthPx)} />
      ))}
    </colgroup>
  );
}
