-- 정리 표 UI 설정(열 너비 등) — 운영 URL 공유(단일 문서, weekly_agenda 와 동일 패턴)
CREATE TABLE public.table_list_preferences (
  id text PRIMARY KEY DEFAULT 'default',
  preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT table_list_preferences_is_object CHECK (jsonb_typeof(preferences) = 'object')
);

CREATE TRIGGER table_list_preferences_set_updated_at
  BEFORE UPDATE ON public.table_list_preferences
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.table_list_preferences ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.table_list_preferences IS '7개 정리 표 UI — preferences[page_id].columnWidths';
COMMENT ON COLUMN public.table_list_preferences.preferences IS '예: {"tasks":{"columnWidths":{"업무명":140}}}';
