CREATE TABLE public.text_groups (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 code_hash text NOT NULL UNIQUE,
 owner_hash text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 ended_at timestamptz
);
GRANT ALL ON public.text_groups TO service_role;
ALTER TABLE public.text_groups ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.text_group_members (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 group_id uuid NOT NULL REFERENCES public.text_groups(id) ON DELETE CASCADE,
 token_hash text NOT NULL UNIQUE,
 name text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.text_group_members TO service_role;
ALTER TABLE public.text_group_members ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.text_group_files (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 group_id uuid NOT NULL REFERENCES public.text_groups(id) ON DELETE CASCADE,
 member_id uuid NOT NULL REFERENCES public.text_group_members(id) ON DELETE CASCADE,
 file_path text NOT NULL UNIQUE,
 file_name text NOT NULL,
 file_size bigint NOT NULL,
 mime_type text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.text_group_files TO service_role;
ALTER TABLE public.text_group_files ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.text_group_messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 group_id uuid NOT NULL REFERENCES public.text_groups(id) ON DELETE CASCADE,
 member_id uuid NOT NULL REFERENCES public.text_group_members(id) ON DELETE CASCADE,
 content text NOT NULL DEFAULT '',
 file_id uuid UNIQUE REFERENCES public.text_group_files(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.text_group_messages TO service_role;
ALTER TABLE public.text_group_messages ENABLE ROW LEVEL SECURITY;
CREATE INDEX text_group_messages_history ON public.text_group_messages(group_id, created_at DESC);
CREATE INDEX text_group_files_group ON public.text_group_files(group_id);
CREATE OR REPLACE FUNCTION public.validate_text_group_entry() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
 PERFORM id FROM public.text_groups WHERE id = NEW.group_id AND ended_at IS NULL FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'This text group has ended'; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER text_group_members_active BEFORE INSERT ON public.text_group_members FOR EACH ROW EXECUTE FUNCTION public.validate_text_group_entry();
CREATE TRIGGER text_group_files_active BEFORE INSERT ON public.text_group_files FOR EACH ROW EXECUTE FUNCTION public.validate_text_group_entry();
CREATE TRIGGER text_group_messages_active BEFORE INSERT ON public.text_group_messages FOR EACH ROW EXECUTE FUNCTION public.validate_text_group_entry();
COMMENT ON TABLE public.text_shares IS 'DEPRECATED: Text tab now uses connected text_groups; retained for older deployed text sharing clients.';