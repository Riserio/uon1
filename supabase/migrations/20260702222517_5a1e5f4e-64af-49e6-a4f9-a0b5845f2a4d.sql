CREATE POLICY "Auth users can view bug report anexos"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'bug-reports');

CREATE POLICY "Auth users can upload bug report anexos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'bug-reports');

CREATE POLICY "Auth users can delete bug report anexos"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'bug-reports');