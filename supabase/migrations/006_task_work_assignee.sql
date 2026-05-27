-- 업무정리: status + assignee → work_assignee (API 키: 업무담당)

ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS work_assignee text;

UPDATE public.tasks
SET work_assignee = COALESCE(
  NULLIF(trim(work_assignee), ''),
  NULLIF(trim(status), ''),
  NULLIF(trim(assignee), '')
);

ALTER TABLE public.tasks DROP COLUMN IF EXISTS status;
ALTER TABLE public.tasks DROP COLUMN IF EXISTS assignee;

CREATE INDEX IF NOT EXISTS tasks_work_assignee_idx ON public.tasks (work_assignee)
  WHERE work_assignee IS NOT NULL AND length(trim(work_assignee)) > 0;

COMMENT ON COLUMN public.tasks.work_assignee IS '업무담당 (직원 이름 등; 구 status·assignee 통합)';
