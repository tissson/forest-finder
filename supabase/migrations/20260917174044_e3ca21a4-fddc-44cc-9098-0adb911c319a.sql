drop policy if exists "Läs egna fyndbilder" on storage.objects;
create policy "Läs egna fyndbilder" on storage.objects for select to authenticated
using (bucket_id = 'discoveries' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Ladda upp egna fyndbilder" on storage.objects;
create policy "Ladda upp egna fyndbilder" on storage.objects for insert to authenticated
with check (bucket_id = 'discoveries' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Radera egna fyndbilder" on storage.objects;
create policy "Radera egna fyndbilder" on storage.objects for delete to authenticated
using (bucket_id = 'discoveries' and (storage.foldername(name))[1] = auth.uid()::text);