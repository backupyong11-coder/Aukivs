"""
운영 API — 로컬: 포트 8001 권장.
  python -m uvicorn main:app --reload --host 127.0.0.1 --port 8001
Railway/Render: --host 0.0.0.0 --port $PORT
프론트(Vercel 등)는 `OPSPROXY_TARGET` 으로 이 서버 URL을 넣고 `/api/ops` 로 프록시합니다.
"""

from __future__ import annotations

import os
from typing import Any

from fastapi import Body, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from config import load_settings
from schemas import (
    BriefingTodayResponse,
    MemoAppendRequest,
    MemoAppendResponse,
    MemoItem,
    ChecklistCompleteRequest,
    ChecklistCompleteResponse,
    ChecklistCreateRequest,
    ChecklistDeleteRequest,
    ChecklistDeleteResponse,
    ChecklistItem,
    ChecklistSuggestRequest,
    ChecklistSuggestResponse,
    ChecklistUpdateRequest,
    ChecklistUpdateResponse,
    MasterTabItemsResponse,
    UploadCreateRequest,
    UploadDeleteRequest,
    UploadDeleteResponse,
    UploadItem,
    UploadListResponse,
    UploadSuggestPrioritizeResponse,
    UploadSuggestRequest,
    UploadSuggestReviewResponse,
    UploadNextEpisodeRequest,
    UploadNextEpisodeResponse,
    UploadUpdateRequest,
    UploadUpdateResponse,
)
from services.briefing_aggregate import aggregate_briefing_today
from services.ai_checklist_suggest import suggest_checklist_ai
from services.ai_uploads_suggest import suggest_uploads_ai
from services.ai_errors import AIAPIError, AIConfigurationError, AIParseError
from services.google_checklist_sheets import (
    complete_checklist_items_by_ids,
    create_checklist_item_in_sheet,
    delete_checklist_row_by_id,
    fetch_checklist_for_briefing,
    fetch_checklist_from_google_sheets,
    update_checklist_item_in_sheet,
)
from services.google_master_sheets import fetch_master_tab_keyed_rows
from services.google_memo_sheets import (
    append_memo_row_to_google_sheets,
    fetch_memos_from_google_sheets,
)
from services.google_uploads_sheets import (
    advance_upload_next_episode,
    create_upload_item_in_sheet,
    delete_upload_row_by_id,
    fetch_upload_list_from_google_sheets,
    fetch_uploads_for_briefing,
    fetch_uploads_from_google_sheets,
    update_upload_item_in_sheet,
)
from services.google_tasks_sheets import (
    fetch_tasks,
    create_task,
    update_task,
    delete_task,
)
from services.google_upload_rows_sheets import (
    fetch_upload_rows,
    create_upload_row,
    update_upload_row,
    delete_upload_row,
)
from services.google_platform_rows_sheets import (
    fetch_platforms,
    update_platform,
)
from services.sheets_errors import (
    SheetsConfigurationError,
    SheetsFetchError,
    SheetsInvalidStateError,
    SheetsNotFoundError,
    SheetsParseError,
)

app = FastAPI(title="Operations Assistant API")

_cors_default = ["http://localhost:3000", "http://127.0.0.1:3000"]
_cors_extra_raw = (os.getenv("BACKEND_CORS_ORIGINS") or "").strip()
_cors_extra = (
    [x.strip() for x in _cors_extra_raw.split(",") if x.strip()]
    if _cors_extra_raw
    else []
)
# 배포 URL을 추가해도 로컬 개발 출처는 유지(쉼표로 구분해 Vercel 도메인 등 추가).
_cors_origins = list(dict.fromkeys([*_cors_default, *_cors_extra]))
_cors_regex = (os.getenv("BACKEND_CORS_ORIGIN_REGEX") or "").strip() or None

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_origin_regex=_cors_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/platform-master", response_model=MasterTabItemsResponse)
def get_platform_master() -> MasterTabItemsResponse:
    """플랫폼마스터 탭 전체(헤더 1행 = 키)."""
    settings = load_settings()
    try:
        items = fetch_master_tab_keyed_rows(settings, settings.google_platform_tab)
        return MasterTabItemsResponse(items=items)
    except SheetsConfigurationError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except SheetsFetchError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e


@app.get("/works-master", response_model=MasterTabItemsResponse)
def get_works_master() -> MasterTabItemsResponse:
    """작품마스터 탭 전체(헤더 1행 = 키)."""
    settings = load_settings()
    try:
        items = fetch_master_tab_keyed_rows(settings, settings.google_works_tab)
        return MasterTabItemsResponse(items=items)
    except SheetsConfigurationError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except SheetsFetchError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e


@app.get("/health")
def health() -> dict[str, str]:
    """배포 확인용: 실행 중 프로세스가 최신 번들인지 구분."""
    return {"status": "ok", "bundle": "worksheet-ops-cloud-deploy-v1"}


@app.get("/checklist", response_model=list[ChecklistItem])
def get_checklist() -> list[ChecklistItem]:
    settings = load_settings()
    try:
        return fetch_checklist_from_google_sheets(settings)
    except SheetsConfigurationError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except SheetsFetchError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
    except SheetsParseError:
        return []
    except Exception:
        return []


@app.post("/checklist/create", response_model=ChecklistItem)
def post_checklist_create(body: ChecklistCreateRequest) -> ChecklistItem:
    settings = load_settings()
    try:
        return create_checklist_item_in_sheet(settings, body.title, body.note)
    except SheetsConfigurationError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except SheetsParseError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except SheetsFetchError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e


@app.post("/ai/checklist/suggest", response_model=ChecklistSuggestResponse)
def post_ai_checklist_suggest(body: ChecklistSuggestRequest) -> ChecklistSuggestResponse:
    settings = load_settings()
    try:
        return suggest_checklist_ai(settings, body.mode, body.prompt)
    except SheetsConfigurationError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except SheetsFetchError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
    except AIConfigurationError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except AIAPIError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
    except AIParseError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@app.post(
    "/ai/uploads/suggest",
    response_model=UploadSuggestPrioritizeResponse | UploadSuggestReviewResponse,
)
def post_ai_uploads_suggest(
    body: UploadSuggestRequest,
) -> UploadSuggestPrioritizeResponse | UploadSuggestReviewResponse:
    settings = load_settings()
    try:
        return suggest_uploads_ai(settings, body.mode, body.prompt)
    except SheetsConfigurationError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except SheetsParseError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except SheetsFetchError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
    except AIConfigurationError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except AIAPIError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
    except AIParseError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@app.post("/checklist/complete", response_model=ChecklistCompleteResponse)
def post_checklist_complete(body: ChecklistCompleteRequest) -> ChecklistCompleteResponse:
    settings = load_settings()
    try:
        n = complete_checklist_items_by_ids(settings, body.ids)
        return ChecklistCompleteResponse(completed=n)
    except SheetsConfigurationError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except SheetsParseError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except SheetsNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except SheetsFetchError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e


@app.post("/checklist/update", response_model=ChecklistUpdateResponse)
def post_checklist_update(body: ChecklistUpdateRequest) -> ChecklistUpdateResponse:
    settings = load_settings()
    try:
        update_checklist_item_in_sheet(
            settings,
            body.id,
            body.title,
            body.note,
        )
        return ChecklistUpdateResponse()
    except SheetsConfigurationError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except SheetsParseError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except SheetsNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except SheetsFetchError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e


@app.post("/checklist/delete", response_model=ChecklistDeleteResponse)
def post_checklist_delete(body: ChecklistDeleteRequest) -> ChecklistDeleteResponse:
    settings = load_settings()
    try:
        delete_checklist_row_by_id(settings, body.id)
        return ChecklistDeleteResponse()
    except SheetsConfigurationError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except SheetsParseError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except SheetsNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except SheetsFetchError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e


@app.get("/uploads", response_model=UploadListResponse)
def get_uploads() -> UploadListResponse:
    settings = load_settings()
    try:
        return fetch_upload_list_from_google_sheets(settings)
    except SheetsConfigurationError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except SheetsFetchError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
    except SheetsParseError:
        return UploadListResponse(items=[], issues=[])
    except Exception:
        return UploadListResponse(items=[], issues=[])


@app.post("/uploads/create", response_model=UploadItem)
def post_uploads_create(body: UploadCreateRequest) -> UploadItem:
    settings = load_settings()
    try:
        return create_upload_item_in_sheet(
            settings,
            title=body.title,
            file_name=body.file_name,
            uploaded_at=body.uploaded_at,
            note=body.note,
            status=body.status,
        )
    except SheetsConfigurationError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except SheetsParseError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except SheetsFetchError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e


# 업로드 delete/update/next-episode: body.id 는 A열 값 하나만 전달. 동일 id 다행 시 시트 매핑은 한 행만 조작.
@app.post("/uploads/delete", response_model=UploadDeleteResponse)
def post_uploads_delete(body: UploadDeleteRequest) -> UploadDeleteResponse:
    settings = load_settings()
    try:
        delete_upload_row_by_id(settings, body.id)
        return UploadDeleteResponse()
    except SheetsConfigurationError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except SheetsParseError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except SheetsNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except SheetsFetchError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e


@app.post("/uploads/update", response_model=UploadUpdateResponse)
def post_uploads_update(body: UploadUpdateRequest) -> UploadUpdateResponse:
    settings = load_settings()
    patch = body.model_dump(exclude_unset=True)
    item_id = str(patch.pop("id"))
    try:
        update_upload_item_in_sheet(settings, item_id, patch)
        return UploadUpdateResponse()
    except SheetsConfigurationError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except SheetsParseError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except SheetsNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except SheetsFetchError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e


@app.post("/uploads/next-episode", response_model=UploadNextEpisodeResponse)
def post_uploads_next_episode(body: UploadNextEpisodeRequest) -> UploadNextEpisodeResponse:
    settings = load_settings()
    try:
        advance_upload_next_episode(settings, body.id)
        return UploadNextEpisodeResponse()
    except SheetsConfigurationError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except SheetsParseError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except SheetsInvalidStateError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except SheetsNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except SheetsFetchError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e


@app.get("/memos", response_model=list[MemoItem])
def get_memos() -> list[MemoItem]:
    settings = load_settings()
    try:
        return fetch_memos_from_google_sheets(settings)
    except SheetsConfigurationError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except SheetsFetchError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
    except SheetsParseError:
        return []
    except Exception:
        return []


@app.post("/memos/append", response_model=MemoAppendResponse)
def post_memos_append(body: MemoAppendRequest) -> MemoAppendResponse:
    settings = load_settings()
    try:
        append_memo_row_to_google_sheets(
            settings,
            content=body.content,
            category=body.category,
        )
        return MemoAppendResponse()
    except SheetsConfigurationError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except SheetsParseError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except SheetsFetchError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e


@app.get("/briefing/today", response_model=BriefingTodayResponse)
def get_briefing_today() -> BriefingTodayResponse:
    """
    운영 관제판: 시트 일부 셀 비움·파싱·API 읽기 실패로 HTTP 502 를 내지 않는다.
    (설정 누락은 503 유지)
    """
    settings = load_settings()
    checklist_rows: list = []
    cl_warnings: list[str] = []
    upload_rows: list = []
    up_warnings: list[str] = []
    try:
        checklist_rows, cl_warnings = fetch_checklist_for_briefing(settings)
    except SheetsConfigurationError as e:
        raise HTTPException(status_code=503, detail=f"[브리핑] {e}") from e
    except (SheetsFetchError, SheetsParseError, Exception):
        checklist_rows, cl_warnings = [], []
        cl_warnings = [
            "[브리핑] 체크리스트 시트를 읽지 못해 집계에서 제외했습니다. "
            "(시트·권한·네트워크를 확인하세요.)"
        ]
    try:
        upload_rows, up_warnings = fetch_uploads_for_briefing(settings)
    except SheetsConfigurationError as e:
        raise HTTPException(status_code=503, detail=f"[브리핑] {e}") from e
    except (SheetsFetchError, SheetsParseError, Exception):
        upload_rows, up_warnings = [], []
        up_warnings = [
            "[브리핑] 업로드 시트를 읽지 못해 집계에서 제외했습니다. "
            "(시트·권한·네트워크를 확인하세요.)"
        ]
    merged_warnings = [*cl_warnings, *up_warnings]
    return aggregate_briefing_today(
        checklist_rows,
        upload_rows,
        warnings=merged_warnings,
    )


# ── 업무정리 탭 ─────────────────────────────────────────────────────
@app.get("/tasks")
def get_tasks():
    settings = load_settings()
    try:
        return fetch_tasks(settings)
    except SheetsConfigurationError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except SheetsFetchError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
    except Exception:
        return []


@app.post("/tasks/create")
def post_tasks_create(body: dict[str, Any] = Body(...)):
    settings = load_settings()
    try:
        return create_task(settings, body)
    except SheetsConfigurationError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except SheetsParseError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except SheetsFetchError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e


@app.post("/tasks/update")
def post_tasks_update(body: dict[str, Any] = Body(...)):
    settings = load_settings()
    task_id = str(body.pop("id", "")).strip()
    if not task_id:
        raise HTTPException(status_code=400, detail="[파싱] id가 없습니다.")
    try:
        update_task(settings, task_id, body)
        return {"updated": True}
    except SheetsConfigurationError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except SheetsNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except SheetsFetchError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e


@app.post("/tasks/delete")
def post_tasks_delete(body: dict[str, Any] = Body(...)):
    settings = load_settings()
    task_id = str(body.get("id", "")).strip()
    if not task_id:
        raise HTTPException(status_code=400, detail="[파싱] id가 없습니다.")
    try:
        delete_task(settings, task_id)
        return {"deleted": True}
    except SheetsConfigurationError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except SheetsNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except SheetsFetchError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e


# ── 업로드정리 탭 ────────────────────────────────────────────────────
@app.get("/upload-rows")
def get_upload_rows():
    settings = load_settings()
    try:
        return fetch_upload_rows(settings)
    except SheetsConfigurationError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except SheetsFetchError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
    except Exception:
        return []


@app.post("/upload-rows/create")
def post_upload_rows_create(body: dict[str, Any] = Body(...)):
    settings = load_settings()
    try:
        return create_upload_row(settings, body)
    except SheetsConfigurationError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except SheetsParseError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except SheetsFetchError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e


@app.post("/upload-rows/update")
def post_upload_rows_update(body: dict[str, Any] = Body(...)):
    settings = load_settings()
    row_id = str(body.pop("id", "")).strip()
    if not row_id:
        raise HTTPException(status_code=400, detail="[파싱] id가 없습니다.")
    try:
        update_upload_row(settings, row_id, body)
        return {"updated": True}
    except SheetsConfigurationError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except SheetsNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except SheetsFetchError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e


@app.post("/upload-rows/delete")
def post_upload_rows_delete(body: dict[str, Any] = Body(...)):
    settings = load_settings()
    row_id = str(body.get("id", "")).strip()
    if not row_id:
        raise HTTPException(status_code=400, detail="[파싱] id가 없습니다.")
    try:
        delete_upload_row(settings, row_id)
        return {"deleted": True}
    except SheetsConfigurationError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except SheetsNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except SheetsFetchError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e


# ── 플랫폼정리 탭 ────────────────────────────────────────────────────
@app.get("/platform-rows")
def get_platform_rows():
    settings = load_settings()
    try:
        return fetch_platforms(settings)
    except SheetsConfigurationError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except SheetsFetchError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
    except Exception:
        return []


@app.post("/platform-rows/update")
def post_platform_rows_update(body: dict):
    settings = load_settings()
    platform_id = str(body.pop("id", "")).strip()
    if not platform_id:
        raise HTTPException(status_code=400, detail="[파싱] id가 없습니다.")
    try:
        update_platform(settings, platform_id, body)
        return {"updated": True}
    except SheetsConfigurationError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except SheetsNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except SheetsFetchError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e


# ── 대시보드 통계 ────────────────────────────────────────────────────
@app.get("/stats")
def get_stats():
    from datetime import date as _date
    settings = load_settings()

    def is_true(v) -> bool:
        return v is True or str(v).strip().upper() == "TRUE"

    def safe_int(v) -> int:
        try:
            return int(float(str(v))) if v not in (None, "", "-") else 0
        except Exception:
            return 0

    today = _date.today().isoformat()  # e.g. "2026-04-13"

    # 업무정리
    try:
        tasks = fetch_tasks(settings)
    except Exception:
        tasks = []

    today_done = sum(1 for t in tasks if is_true(t.get("완료")) and str(t.get("마감일", ""))[:10] == today)
    today_todo = sum(1 for t in tasks if not is_true(t.get("완료")) and str(t.get("마감일", ""))[:10] == today)
    total_done = sum(1 for t in tasks if is_true(t.get("완료")))

    # 업로드정리
    try:
        upload_rows = fetch_upload_rows(settings)
    except Exception:
        upload_rows = []

    uploaded_eps  = sum(safe_int(r.get("업로드화수")) for r in upload_rows if is_true(r.get("완료")))
    remaining_eps = sum(safe_int(r.get("남은업로드화수")) for r in upload_rows if not is_true(r.get("완료")))

    # 플랫폼정리
    try:
        platforms = fetch_platforms(settings)
    except Exception:
        platforms = []

    contracts_done = sum(1 for p in platforms if str(p.get("계약", "")).strip() == "계약완료")
    sign_pending   = sum(1 for p in platforms if str(p.get("계약", "")).strip() == "사인만 남음")
    meetings       = sum(1 for p in platforms if "미팅예정" in str(p.get("미팅", "")))

    subsidy         = [p for p in platforms if is_true(p.get("지원사업"))]
    subsidy_planned = sum(1 for p in subsidy if is_true(p.get("예정")))
    subsidy_waiting = sum(1 for p in subsidy if is_true(p.get("진행중")))
    subsidy_done    = sum(1 for p in subsidy if is_true(p.get("완료")))

    return {
        "today_done":         today_done,
        "today_todo":         today_todo,
        "total_done_tasks":   total_done,
        "uploaded_episodes":  uploaded_eps,
        "remaining_episodes": remaining_eps,
        "contracts_done":     contracts_done,
        "sign_pending":       sign_pending,
        "meetings":           meetings,
        "subsidy_total":      len(subsidy),
        "subsidy_planned":    subsidy_planned,
        "subsidy_waiting":    subsidy_waiting,
        "subsidy_done":       subsidy_done,
    }
