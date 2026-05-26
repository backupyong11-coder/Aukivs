-- Weekly Agenda: workbook JSON (v2) — single shared document for demo ops app.
-- Backend uses service_role; no anon policies.

CREATE TABLE public.weekly_agenda_documents (
  id text PRIMARY KEY DEFAULT 'default',
  workbook jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT weekly_agenda_workbook_is_object CHECK (jsonb_typeof(workbook) = 'object')
);

CREATE TRIGGER weekly_agenda_documents_set_updated_at
  BEFORE UPDATE ON public.weekly_agenda_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.weekly_agenda_documents ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.weekly_agenda_documents IS '주간 아젠다 워크북(JSON v2). id=default 단일 문서.';
COMMENT ON COLUMN public.weekly_agenda_documents.workbook IS 'WeeklyAgendaWorkbook — frontend weeklyAgendaStorage.ts';
