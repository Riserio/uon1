
DO $$
DECLARE
  r RECORD;
  base_slug TEXT;
  final_slug TEXT;
  counter INT;
BEGIN
  FOR r IN SELECT id, nome FROM public.corretoras WHERE slug IS NULL OR slug = '' LOOP
    base_slug := lower(
      regexp_replace(
        regexp_replace(
          translate(r.nome,
            'ÀÁÂÃÄÅàáâãäåÈÉÊËèéêëÌÍÎÏìíîïÒÓÔÕÖòóôõöÙÚÛÜùúûüÇçÑñ',
            'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'),
          '[^a-zA-Z0-9]+', '-', 'g'),
        '^-|-$', '', 'g'));
    IF base_slug = '' THEN base_slug := 'associacao'; END IF;
    final_slug := base_slug;
    counter := 1;
    WHILE EXISTS (SELECT 1 FROM public.corretoras WHERE slug = final_slug AND id != r.id) LOOP
      counter := counter + 1;
      final_slug := base_slug || '-' || counter;
    END LOOP;
    UPDATE public.corretoras SET slug = final_slug WHERE id = r.id;
  END LOOP;
END $$;
