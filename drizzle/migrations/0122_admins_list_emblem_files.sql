CREATE POLICY "Admins veem arquivos de emblemas" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'emblems' AND public.has_role(auth.uid(), 'admin'));