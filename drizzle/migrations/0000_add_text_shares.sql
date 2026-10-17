CREATE TABLE public.text_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash text NOT NULL UNIQUE,
  content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 50000),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.text_shares TO service_role;
REVOKE ALL ON public.text_shares FROM anon, authenticated;
ALTER TABLE public.text_shares ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.text_shares IS 'Code-protected text sharing. Only server functions may create or read text after validating a share code.';