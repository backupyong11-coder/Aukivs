-- 업무정리: 담당자 열 분리 (업무담당/인물담당 ≠ 담당자)

ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS task_manager text;

CREATE INDEX IF NOT EXISTS tasks_task_manager_idx ON public.tasks (task_manager)
  WHERE task_manager IS NOT NULL AND length(trim(task_manager)) > 0;

COMMENT ON COLUMN public.tasks.work_assignee IS '업무담당·인물담당 (임직원)';
COMMENT ON COLUMN public.tasks.task_manager IS '담당자 (업무정리 담당자 열)';
