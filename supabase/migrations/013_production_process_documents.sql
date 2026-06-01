-- 제작공정 대시보드 JSON — single shared document for ops app.

CREATE TABLE IF NOT EXISTS public.production_process_documents (
  id text PRIMARY KEY DEFAULT 'default',
  profile jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT production_process_profile_is_object CHECK (jsonb_typeof(profile) = 'object')
);

CREATE TRIGGER production_process_documents_set_updated_at
  BEFORE UPDATE ON public.production_process_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.production_process_documents ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.production_process_documents IS '제작공정 파이프라인(JSON v1). id=default 단일 문서.';
COMMENT ON COLUMN public.production_process_documents.profile IS 'ProductionProcessProfile — frontend productionProcessStorage.ts';
