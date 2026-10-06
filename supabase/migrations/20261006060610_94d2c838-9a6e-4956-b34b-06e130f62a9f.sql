ALTER TABLE public.shares DROP CONSTRAINT IF EXISTS shares_code_key;
ALTER TABLE public.shares ADD COLUMN expires_at timestamptz;
CREATE INDEX IF NOT EXISTS shares_code_idx ON public.shares (code);
DROP POLICY IF EXISTS "anyone can read shares" ON public.shares;
CREATE POLICY "anyone can read unexpired shares" ON public.shares FOR SELECT TO anon, authenticated USING (expires_at IS NULL OR expires_at > now());