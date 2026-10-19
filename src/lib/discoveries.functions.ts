/**
 * Server-sida spärr för fyndbilder. Webbläsaren får INTE ladda upp direkt
 * till bucketen "discoveries" (lagringsregeln för uppladdning är borttagen);
 * all uppladdning går hit. Servern rensar bort all metadata (EXIF/GPS, XMP,
 * kommentarer m.m.) ur bilden innan den sparas, oavsett vad klienten gjorde.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hasJpegMetadata, NotJpegError, stripJpegMetadata } from "./jpeg-metadata";
import { assessIdentification } from './discovery-identification';
import { getRequestHeader, setResponseHeader } from '@tanstack/react-start/server';

const MAX_BYTES = 10 * 1024 * 1024;

export const uploadDiscoveryImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => {
    if (!(data instanceof FormData)) throw new Error("Ogiltig uppladdning.");
    if (data.has('ai_confidence') || data.has('aiConfidence')) throw new Error('Säkerhetsgraden bestäms endast av servern.');
    const file = data.get('file');
    const identificationId = data.get('identificationId');
    if (typeof identificationId !== 'string' || !identificationId) {
      if (!(file instanceof Blob)) throw new Error('Bild saknas.');
      if (file.size === 0 || file.size > MAX_BYTES) throw new Error('Bilden måste vara högst 10 MB.');
    }
    const speciesId = Number(data.get('speciesId'));
    const weatherZoneId = Number(data.get('weatherZoneId'));
    if (!Number.isSafeInteger(speciesId) || speciesId <= 0 || !Number.isSafeInteger(weatherZoneId) || weatherZoneId <= 0) throw new Error('Välj art och giltig väderzon.');
    const notes = String(data.get('notes') ?? '').trim();
    const quantity = String(data.get('quantity') ?? '').trim();
    if (notes.length > 500 || quantity.length > 100) throw new Error('Anteckning eller mängd är för lång.');
    return { file: file instanceof Blob ? file : null, identificationId: typeof identificationId === 'string' ? identificationId : null, speciesId, weatherZoneId, notes, quantity };
  })
  .handler(async ({ data, context }) => {
    setResponseHeader('Cache-Control', 'no-store');
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    let identificationId = data.identificationId;
    if (!identificationId) {
    if (!data.file) throw new Error('Bild saknas.');
    let clean: Uint8Array;
    try {
      clean = stripJpegMetadata(new Uint8Array(await data.file.arrayBuffer()));
    } catch (err) {
      if (err instanceof NotJpegError) throw new Error("Bilden kunde inte läsas som JPEG.");
      throw err;
    }
    if (hasJpegMetadata(clean)) throw new Error("Bildens metadata kunde inte tas bort.");

    const path = `${context.userId}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.jpg`;
    const { error } = await supabaseAdmin.storage
      .from("discoveries")
      .upload(path, clean, { contentType: "image/jpeg", upsert: false });
    if (error) {
      console.error("Uppladdning av fyndbild misslyckades:", error.message);
      throw new Error("Kunde inte spara bilden.");
    }
    try {
      const { data: species, error: speciesError } = await context.supabase.from('species').select('id,slug,name_sv');
      if (speciesError || !species) throw new Error('Kunde inte hämta artlistan.');
      const apiKey = process.env['LOVABLE_API_KEY'];
      if (!apiKey) throw new Error('AI-tjänsten saknar servernyckel.');
      const { identifyDiscoveryImage } = await import('./discovery-ai.server');
      const result = await identifyDiscoveryImage(clean, species, apiKey, getRequestHeader('X-Lovable-AIG-Run-ID'));
      if (result.runId) setResponseHeader('X-Lovable-AIG-Run-ID', result.runId);
      const assessed = assessIdentification(result.identification, species);
      if (!assessed.accepted) {
        const { error: removeError } = await supabaseAdmin.storage.from('discoveries').remove([path]);
        if (removeError) console.error('Kunde inte städa avvisad bild:', removeError.message);
        return { status: 'rejected' as const, code: 'LOW_CONFIDENCE', confidence: result.identification.confidence, message: result.identification.species_slug === 'none' ? 'Ingen av de sex arterna kunde bekräftas. Fyndet sparades inte.' : 'Bilden kunde inte bekräftas säkert nog. Fyndet sparades inte.' };
      }
      const { data: pending, error: pendingError } = await supabaseAdmin.from('discovery_identifications').insert({ user_id: context.userId, image_path: path, species_id: assessed.species.id, confidence: result.identification.confidence }).select('id').single();
      if (pendingError || !pending) throw new Error('Kunde inte spara artbedömningen.');
      identificationId = pending.id;
      if (assessed.species.id !== data.speciesId) return { status: 'mismatch' as const, identificationId, speciesId: assessed.species.id, speciesName: assessed.species.name_sv, confidence: result.identification.confidence };
    } catch (err) {
      await supabaseAdmin.storage.from('discoveries').remove([path]);
      const { safeAiError } = await import('./discovery-ai-errors.server');
      return { status: 'error' as const, message: safeAiError(err) };
    }
    }
    const { data: committed, error: commitError } = await supabaseAdmin.rpc('commit_verified_discovery', { p_identification_id: identificationId, p_user_id: context.userId, p_species_id: data.speciesId, p_weather_zone_id: data.weatherZoneId, ...(data.notes ? { p_notes: data.notes } : {}), ...(data.quantity ? { p_quantity: data.quantity } : {}) });
    if (commitError) throw new Error(commitError.message.includes('IDENTIFICATION_EXPIRED') ? 'Artbedömningen har gått ut eller fyndet är redan sparat. Ta ett nytt foto.' : commitError.message.includes('SPECIES_MISMATCH') ? 'Bekräfta den identifierade arten innan fyndet sparas.' : 'Kunde inte registrera fyndet.');
    const row = committed?.[0];
    if (!row) throw new Error('Fyndet kunde inte bekräftas som sparat.');
    const { data: pending } = await supabaseAdmin.from('discovery_identifications').select('image_path').eq('id', identificationId).eq('user_id', context.userId).single();
    const { data: signed } = await context.supabase.storage.from('discoveries').createSignedUrl(pending?.image_path ?? '', 3600);
    return { status: 'saved' as const, result: { points_awarded: row.points_awarded, new_total_points: row.new_total_points, badge_unlocked: row.badge_unlocked, image_url: signed?.signedUrl ?? '' } };
  });
