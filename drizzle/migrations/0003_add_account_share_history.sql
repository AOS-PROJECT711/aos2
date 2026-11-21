CREATE TABLE public.share_ownership (
  share_id uuid PRIMARY KEY REFERENCES public.shares(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.share_ownership TO service_role;
ALTER TABLE public.share_ownership ENABLE ROW LEVEL SECURITY;
CREATE INDEX share_ownership_owner_idx ON public.share_ownership(owner_id);
COMMENT ON TABLE public.share_ownership IS 'Private owner mapping for user-managed shares; read and written only by authenticated server functions using service_role.';

CREATE TABLE public.received_share_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  code text NOT NULL CHECK (code ~ '^[A-Z0-9]{6}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, code)
);
GRANT SELECT, INSERT, DELETE ON public.received_share_history TO authenticated;
GRANT ALL ON public.received_share_history TO service_role;
ALTER TABLE public.received_share_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users can view own received share history"
  ON public.received_share_history FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "users can save own received share history"
  ON public.received_share_history FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users can remove own received share history"
  ON public.received_share_history FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
COMMENT ON TABLE public.received_share_history IS 'Signed-in users own only their saved received share codes.';