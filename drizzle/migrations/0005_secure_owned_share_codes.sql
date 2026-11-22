CREATE TABLE public.share_code_ownership (
  code text PRIMARY KEY CHECK (code ~ '^[A-Z0-9]{6}$'),
  owner_id uuid NOT NULL,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.share_code_ownership TO service_role;
ALTER TABLE public.share_code_ownership ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.share_code_ownership IS 'Private account ownership for share codes; read and written only by authenticated server functions using service_role.';