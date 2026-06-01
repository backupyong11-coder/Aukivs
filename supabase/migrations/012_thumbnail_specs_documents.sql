-- 썸네일 규격 대시보드 JSON — single shared document for ops app.

CREATE TABLE IF NOT EXISTS public.thumbnail_specs_documents (
  id text PRIMARY KEY DEFAULT 'default',
  profile jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT thumbnail_specs_profile_is_object CHECK (jsonb_typeof(profile) = 'object')
);

CREATE TRIGGER thumbnail_specs_documents_set_updated_at
  BEFORE UPDATE ON public.thumbnail_specs_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.thumbnail_specs_documents ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.thumbnail_specs_documents IS '플랫폼별 썸네일 규격(JSON v1). id=default 단일 문서.';
COMMENT ON COLUMN public.thumbnail_specs_documents.profile IS 'ThumbnailSpecsProfile — frontend thumbnailSpecsStorage.ts';
