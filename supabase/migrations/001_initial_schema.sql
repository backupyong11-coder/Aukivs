-- WorkSheet Ops: initial Supabase schema (P0 + P1)
-- P0: tasks, upload_rows, platform_rows
-- P1: memos, works
--
-- Access model: backend uses SUPABASE_SERVICE_ROLE_KEY (bypasses RLS).
-- No policies for anon/authenticated → direct client access is denied by default.

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- updated_at helper
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- P0: tasks (Google Sheets tab: 업무정리 / GOOGLE_TASKS_TAB)
-- Checklist API may read the same tab; legacy_id uses task-row-{sheet_row}.
-- ---------------------------------------------------------------------------
CREATE TABLE public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id text UNIQUE,
  sheet_row int,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  date_group text,
  priority text,
  completed boolean NOT NULL DEFAULT false,
  due_date date,
  due_date_raw text,
  domain text,
  category text,
  quantification_minutes text,
  title text NOT NULL,
  quantification text,
  quantification_type text,
  time_raw text,
  time_converted text,
  platform text,
  detail_value text,
  detail_unit text,
  related_work text,
  difficulty text,
  fatigue text,
  status text,
  assignee text,
  memo text,

  CONSTRAINT tasks_sheet_row_positive CHECK (sheet_row IS NULL OR sheet_row >= 2),
  CONSTRAINT tasks_title_not_blank CHECK (length(trim(title)) > 0)
);

CREATE INDEX tasks_completed_idx ON public.tasks (completed);
CREATE INDEX tasks_due_date_idx ON public.tasks (due_date) WHERE due_date IS NOT NULL;
CREATE INDEX tasks_title_idx ON public.tasks (title);

CREATE TRIGGER tasks_set_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.tasks IS '업무정리 탭 (GOOGLE_TASKS_TAB). Checklist when same tab shares this table.';
COMMENT ON COLUMN public.tasks.legacy_id IS 'e.g. task-row-5; checklist sheet-row-N may map here on migrate';

-- ---------------------------------------------------------------------------
-- P0: upload_rows (Google Sheets tab: 업로드정리 / GOOGLE_UPLOAD_ROWS_TAB)
-- ---------------------------------------------------------------------------
CREATE TABLE public.upload_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id text UNIQUE,
  sheet_row int,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  completed boolean NOT NULL DEFAULT false,
  upload_date date,
  upload_date_raw text,
  platform_name text,
  work_title text NOT NULL,
  uploaded_episodes int,
  remaining_episodes int,
  upload_status text,
  upload_cycle text,
  upload_weekday text,
  upload_method text,
  launch_date date,
  launch_date_raw text,
  last_upload_date date,
  last_upload_date_raw text,
  next_upload_date date,
  next_upload_date_raw text,
  manuscript_ready text,
  upload_link text,
  last_upload_episode text,
  note text,

  CONSTRAINT upload_rows_sheet_row_positive CHECK (sheet_row IS NULL OR sheet_row >= 2),
  CONSTRAINT upload_rows_work_title_not_blank CHECK (length(trim(work_title)) > 0)
);

CREATE INDEX upload_rows_work_title_idx ON public.upload_rows (work_title);
CREATE INDEX upload_rows_completed_idx ON public.upload_rows (completed);
CREATE INDEX upload_rows_next_upload_date_idx ON public.upload_rows (next_upload_date)
  WHERE next_upload_date IS NOT NULL;
CREATE INDEX upload_rows_platform_name_idx ON public.upload_rows (platform_name)
  WHERE platform_name IS NOT NULL AND length(trim(platform_name)) > 0;

CREATE TRIGGER upload_rows_set_updated_at
  BEFORE UPDATE ON public.upload_rows
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.upload_rows ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.upload_rows IS '업로드정리 탭 (GOOGLE_UPLOAD_ROWS_TAB)';
COMMENT ON COLUMN public.upload_rows.legacy_id IS 'e.g. upload-row-7';

-- ---------------------------------------------------------------------------
-- P0: platform_rows (Google Sheets tab: 플랫폼정리 — env GOOGLE_PLATFORM_TAB)
-- Core columns for filters/stats; remaining sheet headers → extra jsonb.
-- ---------------------------------------------------------------------------
CREATE TABLE public.platform_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id text UNIQUE,
  sheet_row int,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  company_name text NOT NULL,
  category text,
  announcement_date text,
  subsidy_program boolean NOT NULL DEFAULT false,
  contract_general text,
  blocked boolean NOT NULL DEFAULT false,
  scheduled boolean NOT NULL DEFAULT false,
  in_progress boolean NOT NULL DEFAULT false,
  done boolean NOT NULL DEFAULT false,
  contract_status text,
  meeting text,
  current_stage text,
  last_updated_at timestamptz,
  last_updated_at_raw text,
  last_situation text,
  waiting_reason text,
  next_action text,
  platform_name text,
  priority text,
  note text,
  extra jsonb NOT NULL DEFAULT '{}'::jsonb,

  CONSTRAINT platform_rows_sheet_row_positive CHECK (sheet_row IS NULL OR sheet_row >= 2),
  CONSTRAINT platform_rows_company_name_not_blank CHECK (length(trim(company_name)) > 0),
  CONSTRAINT platform_rows_extra_is_object CHECK (jsonb_typeof(extra) = 'object')
);

CREATE INDEX platform_rows_company_name_idx ON public.platform_rows (company_name);
CREATE INDEX platform_rows_platform_name_idx ON public.platform_rows (platform_name)
  WHERE platform_name IS NOT NULL AND length(trim(platform_name)) > 0;
CREATE INDEX platform_rows_contract_status_idx ON public.platform_rows (contract_status)
  WHERE contract_status IS NOT NULL;
-- Optional: uncomment if you query inside extra frequently
-- CREATE INDEX platform_rows_extra_gin_idx ON public.platform_rows USING gin (extra);

CREATE TRIGGER platform_rows_set_updated_at
  BEFORE UPDATE ON public.platform_rows
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.platform_rows ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.platform_rows IS '플랫폼정리 탭; wide sheet columns stored in extra';
COMMENT ON COLUMN public.platform_rows.legacy_id IS 'e.g. platform-row-12';
COMMENT ON COLUMN public.platform_rows.extra IS 'All non-core sheet headers as {"header": "value"}';

-- ---------------------------------------------------------------------------
-- P1: memos (Google Sheets tab: 메모장 / GOOGLE_MEMO_TAB)
-- ---------------------------------------------------------------------------
CREATE TABLE public.memos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id text UNIQUE,
  sheet_row int,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  content text NOT NULL,
  memo_at timestamptz NOT NULL,
  memo_at_raw text,
  category text,

  CONSTRAINT memos_sheet_row_positive CHECK (sheet_row IS NULL OR sheet_row >= 2),
  CONSTRAINT memos_content_not_blank CHECK (length(trim(content)) > 0)
);

CREATE INDEX memos_memo_at_idx ON public.memos (memo_at DESC);
CREATE INDEX memos_category_idx ON public.memos (category) WHERE category IS NOT NULL;

CREATE TRIGGER memos_set_updated_at
  BEFORE UPDATE ON public.memos
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.memos ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.memos IS '메모장 탭 (GOOGLE_MEMO_TAB)';
COMMENT ON COLUMN public.memos.legacy_id IS 'e.g. memo-row-3 (migration convention)';

-- ---------------------------------------------------------------------------
-- P1: works (Google Sheets tab: 작품정리 / GOOGLE_WORKS_TAB)
-- Documented A~X columns + extra for additional headers.
-- ---------------------------------------------------------------------------
CREATE TABLE public.works (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id text UNIQUE,
  sheet_row int,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  production_done boolean NOT NULL DEFAULT false,
  title text NOT NULL,
  writer text,
  artist text,
  category text,
  format text,
  current_status text,
  sites_to_upload text,
  launched_sites text,
  pending_sites text,
  contracted_sites text,
  episode_info text,
  synopsis text,
  characters text,
  copyright text,
  uci text,
  tags text,
  assets_note text,
  staff text,
  age_rating text,
  first_supply_schedule text,
  serialization_weekday text,
  active_site_count int,
  active_sites text,
  extra jsonb NOT NULL DEFAULT '{}'::jsonb,

  CONSTRAINT works_sheet_row_positive CHECK (sheet_row IS NULL OR sheet_row >= 2),
  CONSTRAINT works_title_unique UNIQUE (title),
  CONSTRAINT works_title_not_blank CHECK (length(trim(title)) > 0),
  CONSTRAINT works_extra_is_object CHECK (jsonb_typeof(extra) = 'object')
);

CREATE INDEX works_title_idx ON public.works (title);
CREATE INDEX works_current_status_idx ON public.works (current_status)
  WHERE current_status IS NOT NULL;

CREATE TRIGGER works_set_updated_at
  BEFORE UPDATE ON public.works
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.works ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.works IS '작품정리 마스터 (GOOGLE_WORKS_TAB)';
COMMENT ON COLUMN public.works.legacy_id IS 'e.g. work-row-10 (migration convention)';
COMMENT ON COLUMN public.works.extra IS 'Headers not mapped to dedicated columns';
