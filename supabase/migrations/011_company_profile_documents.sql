-- 회사(오키브스) 대시보드 JSON — single shared document for ops app.

CREATE TABLE IF NOT EXISTS public.company_profile_documents (
  id text PRIMARY KEY DEFAULT 'default',
  profile jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT company_profile_is_object CHECK (jsonb_typeof(profile) = 'object')
);

CREATE TRIGGER company_profile_documents_set_updated_at
  BEFORE UPDATE ON public.company_profile_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.company_profile_documents ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.company_profile_documents IS '회사 정보 대시보드(JSON v1). id=default 단일 문서.';
COMMENT ON COLUMN public.company_profile_documents.profile IS 'CompanyProfile — frontend companyStorage.ts';
