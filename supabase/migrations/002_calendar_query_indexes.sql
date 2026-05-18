-- 캘린더·플랫폼 lookup 쿼리 보강 (001_initial_schema.sql 에 없는 인덱스만)
-- Supabase SQL Editor 에서 실행. 이미 동일 이름 인덱스가 있으면 IF NOT EXISTS 로 스킵됩니다.

-- [실행 권장] 캘린더 upload_rows 날짜 범위 필터
CREATE INDEX IF NOT EXISTS upload_rows_upload_date_idx
  ON public.upload_rows (upload_date)
  WHERE upload_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS upload_rows_launch_date_idx
  ON public.upload_rows (launch_date)
  WHERE launch_date IS NOT NULL;

-- [실행 권장] 플랫폼정리 lookup 정렬 (last_updated_at.desc)
CREATE INDEX IF NOT EXISTS platform_rows_last_updated_at_idx
  ON public.platform_rows (last_updated_at DESC NULLS LAST)
  WHERE last_updated_at IS NOT NULL;

-- [선택] works 목록 정렬이 느릴 때만
-- CREATE INDEX IF NOT EXISTS works_title_lower_idx ON public.works (lower(title));

-- [실행 불필요 — 001 에 이미 있음]
-- tasks_due_date_idx, memos_memo_at_idx, upload_rows_work_title_idx 등
