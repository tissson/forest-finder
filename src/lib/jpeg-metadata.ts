/**
 * Tar bort ALL metadata ur en JPEG på byte-nivå (ingen omkodning, ren JS –
 * fungerar i serverns körmiljö). Behåller bara de segment som behövs för att
 * rita bilden. Borttaget: APP1–APP15 (EXIF inkl. GPS, XMP, ICC, IPTC m.fl.)
 * och COM (kommentarer). APP0 behålls bara om det är en ren JFIF-header.
 *
 * Kastar fel för allt som inte är en giltig JPEG – servern tar då inte emot
 * filen alls, i stället för att spara något den inte kunnat rensa.
 */
export class NotJpegError extends Error {}

export function stripJpegMetadata(input: Uint8Array): Uint8Array {
  if (input.length < 4 || input[0] !== 0xff || input[1] !== 0xd8) {
    throw new NotJpegError("Filen är inte en JPEG-bild.");
  }
  const out: number[] = [0xff, 0xd8];
  const chunks: Uint8Array[] = [];
  let i = 2;
  while (i < input.length) {
    if (input[i] !== 0xff) throw new NotJpegError("Trasig JPEG (segment saknas).");
    // Fyllnadsbytes 0xFF får förekomma före en markör.
    while (i < input.length && input[i] === 0xff) i += 1;
    const marker = input[i];
    i += 1;
    if (marker === undefined) throw new NotJpegError("Trasig JPEG (oväntat slut).");
    if (marker === 0xd9) {
      out.push(0xff, 0xd9);
      break;
    }
    // Fristående markörer utan längd.
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      out.push(0xff, marker);
      continue;
    }
    if (i + 1 >= input.length) throw new NotJpegError("Trasig JPEG (längd saknas).");
    const len = (input[i]! << 8) | input[i + 1]!;
    if (len < 2 || i + len > input.length) throw new NotJpegError("Trasig JPEG (fel segmentlängd).");
    const segment = input.subarray(i, i + len);
    const isApp = marker >= 0xe0 && marker <= 0xef;
    const isJfif =
      marker === 0xe0 && len >= 7 &&
      segment[2] === 0x4a && segment[3] === 0x46 && segment[4] === 0x49 && segment[5] === 0x46 && segment[6] === 0x00;
    const drop = (isApp && !isJfif) || marker === 0xfe;
    if (!drop) {
      out.push(0xff, marker);
      for (const b of segment) out.push(b);
    }
    i += len;
    if (marker === 0xda) {
      // Start of scan: resten är bilddata (fram till och med EOI) – kopiera oförändrat.
      chunks.push(Uint8Array.from(out), input.subarray(i));
      out.length = 0;
      break;
    }
  }
  const parts = chunks.length ? chunks : [Uint8Array.from(out)];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const result = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    result.set(p, o);
    o += p.length;
  }
  return result;
}

/** Sant om bytesen innehåller ett EXIF- eller XMP-segment (för kontroll/test). */
export function hasJpegMetadata(bytes: Uint8Array): boolean {
  let i = 2;
  while (i + 4 < bytes.length && bytes[i] === 0xff) {
    const marker = bytes[i + 1]!;
    if (marker === 0xda || marker === 0xd9) return false;
    const len = (bytes[i + 2]! << 8) | bytes[i + 3]!;
    if ((marker >= 0xe1 && marker <= 0xef) || marker === 0xfe) return true;
    i += 2 + len;
  }
  return false;
}
