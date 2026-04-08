/**
 * Maps low-level fetch/parse messages to operator-facing copy.
 */
export function userFacingListError(
  context: "briefing" | "uploads" | "checklist" | "memos",
  message: string,
): string {
  const m = message.trim();
  if (/응답 형식이 올바르지 않습니다/.test(m)) {
    if (context === "uploads") {
      return "업로드 목록을 해석하지 못했습니다. 시트 데이터 형식이 예상과 다를 수 있습니다. 아래 안내와 시트 열 구성을 확인하세요.";
    }
    if (context === "briefing") {
      return "오늘 브리핑 응답을 해석하지 못했습니다. 백엔드 버전이나 시트 연결을 확인하세요.";
    }
    if (context === "memos") {
      return "메모 목록을 해석하지 못했습니다. 메모장 탭 1행에 메모내용·메모날짜·분류(또는 메모분류) 헤더가 있는지 확인하세요.";
    }
    return "목록 응답을 해석하지 못했습니다. 시트·API 형식을 확인하세요.";
  }
  if (/응답이 올바른 JSON이 아닙니다/.test(m)) {
    return "서버 응답이 JSON이 아닙니다. `/api/ops` 프록시·OPSPROXY_TARGET(기본 8001)·NEXT_PUBLIC_API_BASE_URL 을 확인하세요.";
  }
  if (/응답이 올바른 배열이 아닙니다/.test(m)) {
    return "체크리스트 응답 형식이 예상과 다릅니다. 시트 탭·열 매핑을 확인하세요.";
  }
  if (/NEXT_PUBLIC_API_BASE_URL/.test(m)) {
    return m;
  }
  if (/HTTP \d+/.test(m) && m.length < 400) {
    return `서버와 통신하지 못했습니다. (${m})`;
  }
  return m;
}
