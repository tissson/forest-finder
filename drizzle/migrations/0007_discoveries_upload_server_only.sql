-- Fyndbilder får bara laddas upp via servern (som rensar EXIF/GPS).
-- Inloggade användare kan fortfarande läsa och radera sina egna bilder.
DROP POLICY IF EXISTS "Ladda upp egna fyndbilder" ON storage.objects;