/**
 * Server-sida spärr för fyndbilder. Webbläsaren får INTE ladda upp direkt
 * till bucketen "discoveries" (lagringsregeln för uppladdning är borttagen);
 * all uppladdning går hit. Servern rensar bort all metadata (EXIF/GPS, XMP,
 * kommentarer m.m.) ur bilden innan den sparas, oavsett vad klienten gjorde.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hasJpegMetadata, NotJpegError, stripJpegMetadata } from "./jpeg-metadata";

const MAX_BYTES = 10 * 1024 * 1024;

export const uploadDiscoveryImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => {
    if (!(data instanceof FormData)) throw new Error("Ogiltig uppladdning.");
    const file = data.get("file");
    if (!(file instanceof File) && !(file instanceof Blob)) throw new Error("Bild saknas.");
    if (file.size === 0 || file.size > MAX_BYTES) throw new Error("Bilden måste vara högst 10 MB.");
    return { file };
  })
  .handler(async ({ data, context }) => {
    let clean: Uint8Array;
    try {
      clean = stripJpegMetadata(new Uint8Array(await data.file.arrayBuffer()));
    } catch (err) {
      if (err instanceof NotJpegError) throw new Error("Bilden kunde inte läsas som JPEG.");
      throw err;
    }
    if (hasJpegMetadata(clean)) throw new Error("Bildens metadata kunde inte tas bort.");

    const path = `${context.userId}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.jpg`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.storage
      .from("discoveries")
      .upload(path, clean, { contentType: "image/jpeg", upsert: false });
    if (error) {
      console.error("Uppladdning av fyndbild misslyckades:", error.message);
      throw new Error("Kunde inte spara bilden.");
    }
    return { path };
  });
