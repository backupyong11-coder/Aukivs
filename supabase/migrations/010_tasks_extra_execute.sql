-- 업무정리: 실행일 컬럼 + extra JSON (마이그레이션 008 미적용·캐시 불일치 대비)
alter table if exists public.tasks
  add column if not exists execute_date date,
  add column if not exists execute_date_raw text;

alter table if exists public.tasks
  add column if not exists extra jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tasks_extra_is_object'
  ) then
    alter table public.tasks
      add constraint tasks_extra_is_object check (jsonb_typeof(extra) = 'object');
  end if;
end $$;

create index if not exists tasks_execute_date_idx
  on public.tasks (execute_date)
  where execute_date is not null;

comment on column public.tasks.extra is '시트/API 헤더 중 DB 컬럼 없는 값 (예: 실행일 fallback)';
