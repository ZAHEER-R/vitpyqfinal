DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF to_regclass('public.friend_requests') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'friend_requests') THEN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.friend_requests';
    END IF;
    IF to_regclass('public.user_notifications') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'user_notifications') THEN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.user_notifications';
    END IF;
    IF to_regclass('public.profiles') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'profiles') THEN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles';
    END IF;
    IF to_regclass('public.user_state') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'user_state') THEN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.user_state';
    END IF;
    IF to_regclass('public.reports') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'reports') THEN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.reports';
    END IF;
  END IF;
END;
$$;

ALTER TABLE public.user_notifications REPLICA IDENTITY FULL;
