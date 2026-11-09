CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_primary text := new.raw_user_meta_data ->> 'primary_position'; v_secondary text := new.raw_user_meta_data ->> 'secondary_position';
BEGIN
 IF v_primary NOT IN ('Goleiro','Pivô','Ala','Fixo') THEN v_primary := NULL; END IF;
 IF v_secondary NOT IN ('Goleiro','Pivô','Ala','Fixo') OR v_secondary = v_primary THEN v_secondary := NULL; END IF;
 INSERT INTO public.profiles (id,name,primary_position,secondary_position) VALUES (new.id,coalesce(nullif(new.raw_user_meta_data ->> 'name',''),split_part(new.email,'@',1)),v_primary,v_secondary);
 RETURN new;
END;
$$;