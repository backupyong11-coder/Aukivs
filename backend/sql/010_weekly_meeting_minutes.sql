-- 주간 회의록 (주간 아젠다 페이지의 "주간 회의록" 탭 / 캘린더 월요일 표시)
-- Supabase SQL Editor에서 한 번 실행해 주세요.

create table if not exists public.weekly_meeting_minutes (
    week_start date primary key,
    title text not null default '',
    content text not null default '',
    attendees jsonb not null default '[]'::jsonb,
    decisions jsonb not null default '[]'::jsonb,
    action_items jsonb not null default '[]'::jsonb,
    status text not null default 'draft',
    tags jsonb not null default '[]'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists weekly_meeting_minutes_week_start_desc_idx
    on public.weekly_meeting_minutes (week_start desc);

-- RLS는 비활성 또는 service_role 전용 정책으로 (다른 테이블과 동일 패턴)
alter table public.weekly_meeting_minutes enable row level security;

drop policy if exists "service_role full access" on public.weekly_meeting_minutes;
create policy "service_role full access"
    on public.weekly_meeting_minutes
    as permissive
    for all
    to public
    using (true)
    with check (true);
