-- Create storage bucket for app configuration images (logos and login backgrounds)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'app-config',
  'app-config',
  true,
  5242880, -- 5MB limit
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Create RLS policies for app-config bucket
CREATE POLICY "Allow authenticated users to upload app config images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'app-config');

CREATE POLICY "Allow authenticated users to update app config images"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'app-config');

CREATE POLICY "Allow public read access to app config images"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'app-config');

CREATE POLICY "Allow authenticated users to delete app config images"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'app-config');