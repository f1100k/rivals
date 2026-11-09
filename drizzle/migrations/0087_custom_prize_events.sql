CREATE TABLE public.prize_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL,first_amount numeric NOT NULL DEFAULT 100,second_amount numeric NOT NULL DEFAULT 50,third_amount numeric NOT NULL DEFAULT 30,created_by uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),CHECK(first_amount>=0 AND second_amount>=0 AND third_amount>=0));
GRANT SELECT ON public.prize_events TO authenticated; GRANT ALL ON public.prize_events TO service_role;
ALTER TABLE public.prize_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY prize_events_admin ON public.prize_events FOR SELECT TO authenticated USING(public.has_role(auth.uid(),'admin'));
ALTER TABLE public.prize_payouts ADD COLUMN event_id uuid REFERENCES public.prize_events(id);
ALTER TABLE public.prize_payouts ADD COLUMN event_name text;
CREATE FUNCTION public.admin_save_prize_event(p_id uuid,p_name text,p_first numeric,p_second numeric,p_third numeric) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id uuid;
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Sem permissão.'; END IF;
 IF length(trim(p_name)) NOT BETWEEN 2 AND 100 OR p_first IS NULL OR p_second IS NULL OR p_third IS NULL OR LEAST(p_first,p_second,p_third)<0 OR GREATEST(p_first,p_second,p_third)>1000000 THEN RAISE EXCEPTION 'Evento ou valor inválido.'; END IF;
 IF p_id IS NULL THEN INSERT INTO public.prize_events(name,first_amount,second_amount,third_amount,created_by) VALUES(trim(p_name),round(p_first,2),round(p_second,2),round(p_third,2),auth.uid()) RETURNING id INTO v_id;
 ELSE UPDATE public.prize_events SET name=trim(p_name),first_amount=round(p_first,2),second_amount=round(p_second,2),third_amount=round(p_third,2) WHERE id=p_id RETURNING id INTO v_id; END IF;
 IF v_id IS NULL THEN RAISE EXCEPTION 'Evento indisponível.'; END IF;
 INSERT INTO public.mod_actions(actor_id,action,reason) VALUES(auth.uid(),'premio_evento_editado',p_name); RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.admin_save_prize_event(uuid,text,numeric,numeric,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_save_prize_event(uuid,text,numeric,numeric,numeric) TO authenticated,service_role;
CREATE FUNCTION public.mark_event_prize_paid(p_event uuid,p_user uuid,p_place integer,p_note text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e public.prize_events; amount numeric; rating integer;
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Sem permissão.'; END IF;
 SELECT * INTO e FROM public.prize_events WHERE id=p_event;
 IF NOT FOUND OR p_place NOT BETWEEN 1 AND 3 THEN RAISE EXCEPTION 'Evento ou posição inválidos.'; END IF;
 SELECT p.rating INTO rating FROM public.profiles p WHERE id=p_user AND NOT is_ghost;
 IF rating IS NULL THEN RAISE EXCEPTION 'Jogador indisponível.'; END IF;
 PERFORM 1 FROM public.prize_events WHERE id=p_event FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.prize_payouts WHERE event_id=p_event AND place=p_place) THEN RAISE EXCEPTION 'Este prêmio já foi registrado neste evento.'; END IF;
 amount:=CASE p_place WHEN 1 THEN e.first_amount WHEN 2 THEN e.second_amount ELSE e.third_amount END;
 INSERT INTO public.prize_payouts(user_id,place,amount,rating,note,paid_by,event_id,event_name) VALUES(p_user,p_place,amount,rating,nullif(trim(p_note),''),auth.uid(),e.id,e.name);
 INSERT INTO public.mod_actions(actor_id,action,target_user,reason) VALUES(auth.uid(),'premio_pago',p_user,e.name||' · '||p_place||'º · R$ '||amount); RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.mark_event_prize_paid(uuid,uuid,integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mark_event_prize_paid(uuid,uuid,integer,text) TO authenticated,service_role;