"""Google Sheets 연동 관련 예외 (HTTP 매핑은 main에서 처리)."""


class SheetsConfigurationError(Exception):
    """환경 변수, URL, 파일 경로 등 설정 문제."""


class SheetsFetchError(Exception):
    """인증·API 호출·응답 처리 실패."""


class SheetsParseError(Exception):
    """시트 행을 도메인 모델로 변환할 수 없을 때."""


class SheetsNotFoundError(Exception):
    """시트에서 요청한 id(행)를 찾지 못했을 때."""


class SheetsInvalidStateError(Exception):
    """상태 전이·비즈니스 규칙상 작업을 진행할 수 없을 때."""
