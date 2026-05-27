-- 열 속성「대분류」(텍스트) — 7개 정리 화면 공통
ALTER TABLE public.platform_rows
  ADD COLUMN IF NOT EXISTS major_category text;

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS major_category text;

ALTER TABLE public.upload_rows
  ADD COLUMN IF NOT EXISTS major_category text;

COMMENT ON COLUMN public.platform_rows.major_category IS '시트/API 헤더: 대분류';
COMMENT ON COLUMN public.tasks.major_category IS '시트/API 헤더: 대분류';
COMMENT ON COLUMN public.upload_rows.major_category IS '시트/API 헤더: 대분류';
