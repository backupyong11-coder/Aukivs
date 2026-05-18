-- =============================================================================
-- Supabase SQL Editor — 실행 권장 인덱스 (3개)
-- =============================================================================
-- 대상: 챗봇·메모·캘린더·플랫폼 메뉴 최적화 후 쿼리 보강
-- 안전: CREATE INDEX IF NOT EXISTS — 이미 있으면 스킵
-- RLS/테이블/컬럼 변경 없음
--
-- 사용법:
--   1) Supabase Dashboard → SQL Editor → New query
--   2) 아래 [실행 권장] 블록만 통째로 붙여넣고 Run
--   3) 성공 메시지 확인 (이미 존재해도 오류 없이 완료)
-- =============================================================================

-- ---------- [실행 권장] 아래 3개만 실행 ----------

-- 1) 캘린더: upload_rows 업로드일 범위 (upload_date.gte / .lte)
CREATE INDEX IF NOT EXISTS upload_rows_upload_date_idx
  ON public.upload_rows (upload_date)
  WHERE upload_date IS NOT NULL;

-- 2) 캘린더: upload_rows 런칭일 범위 (launch_date.gte / .lte)
CREATE INDEX IF NOT EXISTS upload_rows_launch_date_idx
  ON public.upload_rows (launch_date)
  WHERE launch_date IS NOT NULL;

-- 3) 플랫폼: /platform-rows/lookup 정렬 (last_updated_at DESC)
CREATE INDEX IF NOT EXISTS platform_rows_last_updated_at_idx
  ON public.platform_rows (last_updated_at DESC NULLS LAST)
  WHERE last_updated_at IS NOT NULL;

-- ---------- [실행 불필요] 001_initial_schema.sql 에 이미 있음 ----------
-- tasks_due_date_idx          → tasks.due_date (캘린더 업무 마감일)
-- memos_memo_at_idx           → memos.memo_at DESC (메모·캘린더 메모)
-- upload_rows_work_title_idx  → upload_rows.work_title
-- platform_rows_company_name_idx, platform_rows_platform_name_idx

-- ---------- [선택] 느릴 때만 ----------
-- CREATE INDEX IF NOT EXISTS works_title_lower_idx ON public.works (lower(title));
