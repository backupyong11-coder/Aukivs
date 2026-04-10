from typing import Annotated, Any, Literal, Union

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class MasterTabItemsResponse(BaseModel):
    """GET /platform-master, GET /works-master: 1행 헤더 기준 행 단위 dict 목록."""

    model_config = ConfigDict(extra="forbid")

    items: list[dict[str, Any]] = Field(default_factory=list)


class ChecklistItem(BaseModel):
    id: str = Field(..., description="항목 식별자 (시트 행 기준 sheet-row-N)")
    title: str = Field(..., description="업무명(B열)")
    note: str | None = Field(None, description="부가 설명(레거시·생성 API 호환, 시트 신규 구조에서는 미사용)")
    due_date: str | None = Field(
        default=None,
        description="마감일(A열) 문자열, 비어 있으면 null",
    )


class UploadItem(BaseModel):
    id: str = Field(..., description="항목 식별자")
    title: str = Field(..., description="표시 제목")
    file_name: str = Field(..., description="파일 이름")
    uploaded_at: str = Field(..., description="업로드 시각(표시용 ISO 형식 문자열)")
    note: str | None = Field(None, description="부가 설명")
    status: str | None = Field(
        None,
        description="상태(F열). 시트에 없거나 비어 있으면 null",
    )


class UploadRowSkippedIssue(BaseModel):
    """GET /uploads: 필수 값 누락 등으로 목록에서 제외된 행."""

    kind: Literal["row_skipped"] = "row_skipped"
    sheet_row: int = Field(..., ge=2, description="시트 상 1-based 행 번호")
    message: str


class UploadDuplicateIdIssue(BaseModel):
    """GET /uploads: 동일 A열 id가 둘 이상의 유효 행에 존재 (조회는 uid로 구분, 액션은 id 단일 기준)."""

    kind: Literal["duplicate_id"] = "duplicate_id"
    id: str
    sheet_rows: list[int] = Field(..., min_length=2)
    message: str


UploadListIssue = Annotated[
    Union[UploadRowSkippedIssue, UploadDuplicateIdIssue],
    Field(discriminator="kind"),
]


class UploadListItem(UploadItem):
    """GET /uploads 목록 항목. 시트 행까지 반영한 uid로 UI 키 충돌 방지."""

    uid: str


class UploadListResponse(BaseModel):
    """업로드 탭 조회: 정상 행 + 제외/중복 메타(issues)."""

    items: list[UploadListItem]
    issues: list[UploadListIssue] = Field(default_factory=list)


class UploadUpdateRequest(BaseModel):
    """D·E·F열만 요청에 포함된 필드에 한해 갱신합니다. A·B·C는 변경하지 않습니다."""

    model_config = ConfigDict(extra="forbid")

    id: str
    status: str | None = None
    note: str | None = None
    uploaded_at: str | None = None

    @field_validator("id")
    @classmethod
    def strip_id(cls, v: str) -> str:
        s = str(v).strip()
        if not s:
            raise ValueError("[파싱] id가 비어 있습니다.")
        return s

    @field_validator("status", "note", mode="before")
    @classmethod
    def optional_blank_to_none(cls, v: object) -> object:
        if v is None:
            return None
        if isinstance(v, str):
            t = v.strip()
            return t if t else None
        return v

    @field_validator("uploaded_at", mode="before")
    @classmethod
    def strip_uploaded_at(cls, v: object) -> object:
        if v is None:
            return None
        if isinstance(v, str):
            s = v.strip()
            return s if s else None
        return v

    @model_validator(mode="after")
    def at_least_one_field_and_uploaded_at_rule(self):
        if not self.model_fields_set & {"status", "note", "uploaded_at"}:
            raise ValueError("[파싱] 수정할 필드가 하나도 없습니다.")
        if "uploaded_at" in self.model_fields_set:
            if not self.uploaded_at:
                raise ValueError(
                    "[파싱] uploaded_at을(를) 비울 수 없습니다. "
                    "ISO 8601 형식 문자열을 넣거나 필드를 생략하세요."
                )
        return self


class UploadUpdateResponse(BaseModel):
    updated: bool = True


class UploadNextEpisodeRequest(BaseModel):
    """다음 회차(1차): status·uploaded_at만 시트에서 한 단계 진행합니다."""

    model_config = ConfigDict(extra="forbid")

    id: str

    @field_validator("id")
    @classmethod
    def strip_id(cls, v: str) -> str:
        s = str(v).strip()
        if not s:
            raise ValueError("[파싱] id가 비어 있습니다.")
        return s


class UploadNextEpisodeResponse(BaseModel):
    advanced: bool = True


class UploadDeleteRequest(BaseModel):
    """id에 해당하는 데이터 행을 시트에서 통째로 삭제합니다."""

    id: str

    @field_validator("id")
    @classmethod
    def strip_id(cls, v: str) -> str:
        s = str(v).strip()
        if not s:
            raise ValueError("[파싱] id가 비어 있습니다.")
        return s


class UploadDeleteResponse(BaseModel):
    deleted: bool = True


class UploadCreateRequest(BaseModel):
    """업로드 탭에 행 1개 추가. id는 서버에서 UUID로 생성합니다."""

    model_config = ConfigDict(extra="forbid")

    title: str
    file_name: str | None = None
    uploaded_at: str | None = None
    note: str | None = None
    status: str | None = None

    @field_validator("title")
    @classmethod
    def strip_title(cls, v: str) -> str:
        s = str(v).strip()
        if not s:
            raise ValueError("[파싱] title이 비어 있습니다.")
        return s

    @field_validator("file_name", "uploaded_at", "note", "status", mode="before")
    @classmethod
    def optional_blank_to_none(cls, v: object) -> object:
        if v is None:
            return None
        if isinstance(v, str):
            t = v.strip()
            return t if t else None
        return v


class BriefingSummary(BaseModel):
    today_checklist_count: int = Field(..., ge=0, description="오늘 처리 대상 체크리스트 수")
    overdue_checklist_count: int = Field(..., ge=0, description="민감·지연 위험이 있는 체크리스트 수")
    today_upload_count: int = Field(..., ge=0, description="오늘 업로드된 파일 수")
    overdue_upload_count: int = Field(..., ge=0, description="오늘 이전 업로드 중 후속 확인 대상 수")


class UrgentItem(BaseModel):
    """브리핑 긴급 후보 1건. uid는 시트 행·시각까지 포함한 고유 식별자."""

    uid: str
    id: str
    source: Literal["checklist", "upload"]
    title: str
    note: str | None = None
    uploaded_at: str | None = Field(
        None, description="source=upload 일 때 원본 D열 시각(없으면 null)"
    )


class BriefingTodayResponse(BaseModel):
    briefing_text: str
    summary: BriefingSummary
    urgent_items: list[UrgentItem]
    warnings: list[str] = Field(
        default_factory=list,
        description="집계에서 제외한 행 등 운영 경고(시트명·행·열·사유)",
    )


class ChecklistCompleteRequest(BaseModel):
    ids: list[str]

    @field_validator("ids")
    @classmethod
    def clean_ids(cls, v: list[str]) -> list[str]:
        if not v:
            raise ValueError("[파싱] id 배열이 비어 있습니다.")
        cleaned = [str(x).strip() for x in v if str(x).strip()]
        if not cleaned:
            raise ValueError("[파싱] 유효한 id가 없습니다.")
        return list(dict.fromkeys(cleaned))


class ChecklistCompleteResponse(BaseModel):
    completed: int = Field(..., ge=0)


class ChecklistUpdateRequest(BaseModel):
    """B열(업무명)만 갱신합니다. A·C~F는 변경하지 않습니다. note는 호환용으로 무시될 수 있습니다."""

    id: str
    title: str
    note: str | None = None

    @field_validator("id")
    @classmethod
    def strip_id(cls, v: str) -> str:
        s = str(v).strip()
        if not s:
            raise ValueError("[파싱] id가 비어 있습니다.")
        return s

    @field_validator("title")
    @classmethod
    def strip_title(cls, v: str) -> str:
        t = str(v).strip()
        if not t:
            raise ValueError("[파싱] title은 비울 수 없습니다.")
        return t


class ChecklistUpdateResponse(BaseModel):
    updated: bool = True


class ChecklistDeleteRequest(BaseModel):
    """활성(미완료) 행만 id로 찾아 해당 행 전체를 삭제합니다."""

    id: str

    @field_validator("id")
    @classmethod
    def strip_id(cls, v: str) -> str:
        s = str(v).strip()
        if not s:
            raise ValueError("[파싱] id가 비어 있습니다.")
        return s


class ChecklistDeleteResponse(BaseModel):
    deleted: bool = True


class ChecklistCreateRequest(BaseModel):
    """새 행을 A:F 맨 아래에 추가합니다. id는 응답에서 sheet-row-N으로 돌려줍니다."""

    model_config = ConfigDict(extra="forbid")

    title: str
    note: str | None = None

    @field_validator("title")
    @classmethod
    def strip_title(cls, v: str) -> str:
        t = str(v).strip()
        if not t:
            raise ValueError("[파싱] title은 비울 수 없습니다.")
        return t

    @field_validator("note", mode="before")
    @classmethod
    def note_blank_to_none(cls, v: object) -> object:
        if v is None:
            return None
        if isinstance(v, str):
            s = v.strip()
            return s if s else None
        return v


class ChecklistSuggestRequest(BaseModel):
    """AI 제안 전용. 시트에는 저장하지 않습니다."""

    model_config = ConfigDict(extra="forbid")

    mode: Literal["prioritize", "draft"]
    prompt: str | None = None

    @field_validator("prompt", mode="before")
    @classmethod
    def blank_prompt_none(cls, v: object) -> object:
        if v is None:
            return None
        if isinstance(v, str):
            s = v.strip()
            return s if s else None
        return v


class ChecklistSuggestItemOut(BaseModel):
    """prioritize: reason·priority 사용 / draft: note 사용."""

    title: str
    reason: str | None = None
    priority: int | None = Field(None, ge=1)
    note: str | None = None


class ChecklistSuggestResponse(BaseModel):
    mode: Literal["prioritize", "draft"]
    summary: str
    items: list[ChecklistSuggestItemOut]


class UploadSuggestRequest(BaseModel):
    """업로드 AI 제안 전용. 시트에는 저장하지 않습니다."""

    model_config = ConfigDict(extra="forbid")

    mode: Literal["prioritize", "review"]
    prompt: str | None = None

    @field_validator("prompt", mode="before")
    @classmethod
    def blank_prompt_none(cls, v: object) -> object:
        if v is None:
            return None
        if isinstance(v, str):
            s = v.strip()
            return s if s else None
        return v


class UploadSuggestPrioritizeItemOut(BaseModel):
    id: str
    title: str
    reason: str
    priority: int = Field(..., ge=1)
    suggested_action: str


class UploadSuggestReviewItemOut(BaseModel):
    id: str
    title: str
    issue: str
    suggestion: str


class UploadSuggestPrioritizeResponse(BaseModel):
    mode: Literal["prioritize"] = "prioritize"
    summary: str
    items: list[UploadSuggestPrioritizeItemOut]


class UploadSuggestReviewResponse(BaseModel):
    mode: Literal["review"] = "review"
    summary: str
    items: list[UploadSuggestReviewItemOut]


class MemoItem(BaseModel):
    """메모장 탭 한 행(헤더 제외). 시트 행 번호는 표시·참고용."""

    sheet_row: int = Field(..., ge=2, description="스프레드시트 상 1-based 행 번호")
    content: str = Field(..., description="메모내용 열")
    memo_date: str = Field(
        "",
        description="메모날짜 열(비어 있으면 빈 문자열)",
    )
    category: str | None = Field(None, description="메모분류·분류 열(비어 있으면 null)")


class MemoAppendRequest(BaseModel):
    """메모 한 건을 탭 맨 아래에 추가합니다. 시각은 서버(서울)에서 넣습니다."""

    model_config = ConfigDict(extra="forbid")

    content: str
    category: str | None = Field(
        None,
        description="메모분류(비우면 시트에 빈 칸)",
    )

    @field_validator("content")
    @classmethod
    def strip_content(cls, v: str) -> str:
        s = str(v).strip()
        if not s:
            raise ValueError("[파싱] 메모 내용이 비어 있습니다.")
        return s

    @field_validator("category", mode="before")
    @classmethod
    def blank_category_none(cls, v: object) -> object:
        if v is None:
            return None
        if isinstance(v, str):
            t = v.strip()
            return t if t else None
        return v


class MemoAppendResponse(BaseModel):
    appended: bool = True
