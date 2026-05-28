alter table if exists public.tasks
  add column if not exists execute_date date,
  add column if not exists execute_date_raw text;

