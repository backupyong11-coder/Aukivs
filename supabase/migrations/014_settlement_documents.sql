-- 정산 대시보드 JSON — single shared document for ops app.

CREATE TABLE IF NOT EXISTS public.settlement_documents (
  id text PRIMARY KEY DEFAULT 'default',
  profile jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT settlement_profile_is_object CHECK (jsonb_typeof(profile) = 'object')
);

CREATE TRIGGER settlement_documents_set_updated_at
  BEFORE UPDATE ON public.settlement_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.settlement_documents ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.settlement_documents IS '플랫폼 정산 방법·월별 체크(JSON v1). id=default 단일 문서.';
COMMENT ON COLUMN public.settlement_documents.profile IS 'SettlementProfile — frontend settlementStorage.ts';
