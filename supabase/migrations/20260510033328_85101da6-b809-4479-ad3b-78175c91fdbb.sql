CREATE OR REPLACE FUNCTION public.notify_joint_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_name text;
  v_aid text;
BEGIN
  SELECT COALESCE(display_name, full_name, email, 'Someone'), averia_id
    INTO v_name, v_aid
    FROM public.profiles WHERE user_id = NEW.from_user LIMIT 1;
  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (
    NEW.to_user,
    'joint_request',
    'Joint Brain Request',
    COALESCE(v_name,'Someone') || ' [' || COALESCE(v_aid,'') || '] wants to link brains.',
    jsonb_build_object('request_id', NEW.id, 'from_user', NEW.from_user, 'averia_id', v_aid)
  );
  RETURN NEW;
END;
$function$;