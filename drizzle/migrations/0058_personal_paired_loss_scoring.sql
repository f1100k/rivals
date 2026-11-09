ALTER TABLE public.loss_shield_owners ADD COLUMN paired_losses boolean NOT NULL DEFAULT true, ADD COLUMN pending_loss boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.loss_shield_owners.armed IS 'DEPRECATED: automatic paired-loss rule replaces manual one-use shield';
CREATE OR REPLACE FUNCTION public.set_loss_shield(p_armed boolean) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN RAISE EXCEPTION 'A proteção pessoal agora é automática.'; END $$;
REVOKE ALL ON FUNCTION public.set_loss_shield(boolean) FROM PUBLIC,anon;
DO $migration$
DECLARE definition text; old_block text; new_block text;
BEGIN
SELECT pg_get_functiondef('public.finalize_match_gk(uuid,integer,integer)'::regprocedure) INTO definition;
definition := replace(definition,'v_before integer; v_after integer; v_shield boolean; v_new integer;', 'v_before integer; v_after integer; v_shield boolean; v_new integer; v_owner public.loss_shield_owners%ROWTYPE;');
old_block := $old$      IF r.team <> winner AND v_total < 0 THEN
        UPDATE public.loss_shield_owners SET armed = false, updated_at = now()
          WHERE user_id = r.user_id AND armed RETURNING true INTO v_shield;
        IF v_shield THEN
          INSERT INTO public.mod_actions(actor_id, action, target_user, target_match, reason)
            VALUES(r.user_id, 'protecao_pessoal_usada', r.user_id, p_match, format('perda de %s MMR anulada', -v_total));
          v_total := 0; v_elo := 0;
        END IF;
        v_shield := NULL;
      END IF;$old$;
new_block := $new$      SELECT * INTO v_owner FROM public.loss_shield_owners WHERE user_id = r.user_id AND paired_losses FOR UPDATE;
      IF FOUND THEN
        IF r.team = winner THEN
          UPDATE public.loss_shield_owners SET pending_loss = false, armed = false, updated_at = now() WHERE user_id = r.user_id;
          IF v_owner.pending_loss THEN
            INSERT INTO public.mod_actions(actor_id, action, target_user, target_match, reason)
              VALUES(r.user_id, 'protecao_pessoal_sequencia_reiniciada', r.user_id, p_match, 'Vitória interrompeu a sequência de derrotas.');
          END IF;
        ELSE
          v_total := CASE WHEN v_owner.pending_loss THEN -17 ELSE 0 END;
          v_elo := v_total;
          UPDATE public.loss_shield_owners SET pending_loss = NOT v_owner.pending_loss, armed = false, updated_at = now() WHERE user_id = r.user_id;
          INSERT INTO public.mod_actions(actor_id, action, target_user, target_match, reason)
            VALUES(r.user_id, CASE WHEN v_owner.pending_loss THEN 'protecao_pessoal_par_descontado' ELSE 'protecao_pessoal_usada' END, r.user_id, p_match,
              CASE WHEN v_owner.pending_loss THEN 'Segunda derrota seguida: desconto de até 17 MMR, respeitando o piso zero; novo par iniciado.' ELSE 'Primeira derrota do par: derrota registrada sem desconto de MMR.' END);
        END IF;
      END IF;$new$;
IF position(old_block IN definition)=0 THEN RAISE EXCEPTION 'Finalizador divergente; alteração interrompida.'; END IF;
definition := replace(definition,old_block,new_block);
EXECUTE definition;
END $migration$;
REVOKE ALL ON FUNCTION public.finalize_match_gk(uuid,integer,integer) FROM PUBLIC,anon,authenticated;