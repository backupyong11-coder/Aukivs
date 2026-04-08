"""AI API 연동 예외 (HTTP 매핑은 main에서 처리)."""


class AIConfigurationError(Exception):
    """API 키·모델 등 환경 설정 문제."""


class AIAPIError(Exception):
    """원격 AI 호출 실패·HTTP 오류·빈 응답."""


class AIParseError(Exception):
    """모델 응답 JSON 해석·스키마 불일치."""
