DO $$
BEGIN
  PERFORM cron.unschedule(jobname) FROM cron.job WHERE jobname IN ('radar-links-pedir');
END $$;
SELECT cron.schedule('radar-links-pedir', '48 9-16 * * *', $cron$SELECT public.mercado_radar_links_pedir(4)$cron$);
SELECT cron.alter_job(jobid, schedule := '50 9-16 * * *') FROM cron.job WHERE jobname = 'radar-resolver-links';