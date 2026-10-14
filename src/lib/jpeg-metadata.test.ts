import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { hasJpegMetadata, NotJpegError, stripJpegMetadata } from "./jpeg-metadata";

const withGps = new Uint8Array(readFileSync(new URL("./__fixtures__/gps.jpg", import.meta.url)));
const text = (b: Uint8Array) => Buffer.from(b).toString("latin1");

describe("server-sida metadata-spärr för fyndbilder", () => {
  it("testbilden innehåller verkligen GPS-EXIF före rensning", () => {
    expect(hasJpegMetadata(withGps)).toBe(true);
    expect(text(withGps)).toContain("Exif\u0000\u0000");
  });
  it("tar bort EXIF/GPS och kommentarer", () => {
    const clean = stripJpegMetadata(withGps);
    expect(hasJpegMetadata(clean)).toBe(false);
    expect(text(clean)).not.toContain("Exif");
    expect(text(clean)).not.toContain("TestKamera");
    expect(text(clean)).not.toContain("hemlig kommentar");
  });
  it("behåller bilddatan oförändrad (slutar med samma bytes)", () => {
    const clean = stripJpegMetadata(withGps);
    expect(Buffer.from(clean.subarray(-200)).equals(Buffer.from(withGps.subarray(-200)))).toBe(true);
  });
  it("vägrar filer som inte är JPEG", () => {
    expect(() => stripJpegMetadata(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0]))).toThrow(NotJpegError);
  });
});
