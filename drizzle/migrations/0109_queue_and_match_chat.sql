CREATE TABLE public.queue_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid REFERENCES public.matches(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 300),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.queue_chat_messages TO authenticated;
GRANT ALL ON public.queue_chat_messages TO service_role;
ALTER TABLE public.queue_chat_messages ENABLE ROW LEVEL SECURITY;

CREATE INDEX queue_chat_match_idx ON public.queue_chat_messages (match_id, created_at DESC) WHERE match_id IS NOT NULL;
CREATE INDEX queue_chat_lobby_idx ON public.queue_chat_messages (created_at DESC) WHERE match_id IS NULL;
CREATE INDEX queue_chat_user_idx ON public.queue_chat_messages (user_id, created_at DESC);

-- Lobby room (match_id null): players currently in the queue + staff. Match room: that match's players + staff.
CREATE OR REPLACE FUNCTION public.can_read_queue_chat(p_match uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND (
    public.is_staff(auth.uid())
    OR (p_match IS NULL AND EXISTS (SELECT 1 FROM queue q WHERE q.user_id = auth.uid() AND q.position IS NOT NULL))
    OR (p_match IS NOT NULL AND EXISTS (SELECT 1 FROM match_players mp WHERE mp.match_id = p_match AND mp.user_id = auth.uid()))
  )
$$;
REVOKE ALL ON FUNCTION public.can_read_queue_chat(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_queue_chat(uuid) TO authenticated;

CREATE POLICY "chat readable by room members" ON public.queue_chat_messages
  FOR SELECT TO authenticated USING (public.can_read_queue_chat(match_id));

CREATE OR REPLACE FUNCTION public.get_queue_chat(p_match uuid DEFAULT NULL)
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v json;
BEGIN
  IF NOT public.can_read_queue_chat(p_match) THEN RETURN '[]'::json; END IF;
  SELECT coalesce(json_agg(x ORDER BY x."createdAt"), '[]'::json) INTO v FROM (
    SELECT c.id, c.user_id AS "userId", c.body, c.created_at AS "createdAt",
           p.name, p.avatar_url AS "avatarUrl", (c.user_id = auth.uid()) AS "isMe"
    FROM queue_chat_messages c JOIN profiles p ON p.id = c.user_id
    WHERE (p_match IS NULL AND c.match_id IS NULL AND c.created_at > now() - interval '3 hours')
       OR (p_match IS NOT NULL AND c.match_id = p_match)
    ORDER BY c.created_at DESC LIMIT 60
  ) x;
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION public.get_queue_chat(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_queue_chat(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.send_queue_chat(p_match uuid, p_body text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_body text := btrim(coalesce(p_body, '')); v_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Entre na sua conta para usar o chat.'; END IF;
  IF char_length(v_body) = 0 THEN RAISE EXCEPTION 'Escreva uma mensagem.'; END IF;
  IF char_length(v_body) > 300 THEN RAISE EXCEPTION 'A mensagem pode ter no máximo 300 caracteres.'; END IF;
  IF EXISTS (SELECT 1 FROM profiles WHERE id = v_uid AND banned_until > now())
     OR EXISTS (SELECT 1 FROM player_report_state WHERE target_id = v_uid AND banned_until > now()) THEN
    RAISE EXCEPTION 'Você está suspenso e não pode usar o chat.';
  END IF;
  IF NOT public.can_read_queue_chat(p_match) THEN
    RAISE EXCEPTION 'Você não está nesta sala de chat.';
  END IF;
  IF EXISTS (SELECT 1 FROM queue_chat_messages WHERE user_id = v_uid AND created_at > now() - interval '1 second') THEN
    RAISE EXCEPTION 'Calma! Espere um segundo para mandar outra mensagem.';
  END IF;
  INSERT INTO queue_chat_messages(match_id, user_id, body) VALUES (p_match, v_uid, v_body) RETURNING id INTO v_id;
  DELETE FROM queue_chat_messages WHERE match_id IS NULL AND created_at < now() - interval '1 day';
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.send_queue_chat(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_queue_chat(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_queue_chat_message(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r queue_chat_messages;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN RAISE EXCEPTION 'Apenas staff pode apagar mensagens.'; END IF;
  DELETE FROM queue_chat_messages WHERE id = p_id RETURNING * INTO r;
  IF r.id IS NOT NULL THEN
    INSERT INTO mod_actions(actor_id, action, target_user, target_match, reason)
    VALUES (auth.uid(), 'chat_mensagem_apagada', r.user_id, r.match_id, left(r.body, 300));
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.delete_queue_chat_message(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_queue_chat_message(uuid) TO authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE public.queue_chat_messages;