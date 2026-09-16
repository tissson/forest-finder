import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState } from "react";
import { toast } from "sonner";
import { Camera, X } from "lucide-react";

import { DiagnosticPanel } from "@/components/DiagnosticPanel";
import { LayerSelector } from "@/components/LayerSelector";
import { CameraCapture } from "@/components/CameraCapture";
import { LogDiscoveryModal } from "@/components/LogDiscoveryModal";
import { DiscoverySuccessModal } from "@/components/DiscoverySuccessModal";
import {
  ApiError,
  PremiumRequiredError,
  type DiscoveryUploadResult,
  type LayerSelection,
} from "@/lib/api";

const MapView = lazy(() =>
  import("@/components/Map").then((m) => ({ default: m.Map })),
);

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Svamp- & Bärprognos – hitta bästa platserna" },
      {
        name: "description",
        content:
          "Prognoskarta för svamp och bär i Sverige baserad på väder och biotop. Logga dina fynd anonymt i 5x5 km-rutor.",
      },
      { property: "og:title", content: "Svamp- & Bärprognos" },
      {
        property: "og:description",
        content:
          "Prognoskarta för svamp och bär baserad på väder och biotop – integritetssäkrad med 5x5 km-rutor.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const [mounted, setMounted] = useState(false);
  const [layer, setLayer] = useState<LayerSelection | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [pending, setPending] = useState<{
    file: File;
    weatherZoneId: number | null;
  } | null>(null);
  const [success, setSuccess] = useState<DiscoveryUploadResult | null>(null);

  useEffect(() => setMounted(true), []);

  const handleError = (error: ApiError) => {
    if (error instanceof PremiumRequiredError) {
      toast.error("Premium krävs", {
        description: error.message || "Det här lagret ingår i premium.",
      });
      return;
    }
    toast.error("Kunde inte hämta kartdata", { description: error.message });
  };

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-background">
      <div className="absolute inset-0">
        {mounted ? (
          <Suspense fallback={<MapFallback />}>
            <MapView
              layer={layer}
              onError={handleError}
              onFeatureCountChange={setCount}
            />
          </Suspense>
        ) : (
          <MapFallback />
        )}
      </div>

      <DiagnosticPanel />


      <header className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col gap-3 p-4">
        <div className="pointer-events-auto flex items-center gap-2">
          <span className="rounded-full bg-card/90 px-3 py-1.5 text-sm font-semibold tracking-tight text-card-foreground shadow-lg backdrop-blur">
            🍄 Svamp- & Bärprognos
          </span>
          {count !== null && (
            <span className="rounded-full bg-card/80 px-3 py-1.5 text-xs text-muted-foreground shadow backdrop-blur">
              {count} rutor
            </span>
          )}
        </div>
        <div className="pointer-events-auto max-w-xs">
          <LayerSelector value={layer} onChange={setLayer} className="shadow-xl backdrop-blur" />
        </div>
      </header>

      <button
        type="button"
        onClick={() => setCaptureOpen(true)}
        aria-label="Logga ett fynd"
        className="absolute bottom-7 right-5 z-20 flex h-16 w-16 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-2xl transition-transform active:scale-95"
      >
        <Camera className="h-7 w-7" />
      </button>

      {captureOpen && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 p-4 sm:items-center">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold">Nytt fynd</h2>
              <button
                type="button"
                onClick={() => setCaptureOpen(false)}
                aria-label="Stäng"
                className="rounded-md p-1 text-muted-foreground hover:bg-muted"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <CameraCapture
              onReady={(result) => {
                setPending(result);
                setCaptureOpen(false);
              }}
            />
          </div>
        </div>
      )}

      <LogDiscoveryModal
        isOpen={pending !== null}
        file={pending?.file ?? null}
        weatherZoneId={pending?.weatherZoneId ?? null}
        onClose={() => setPending(null)}
        onSuccess={(result) => {
          setPending(null);
          setSuccess(result);
        }}
      />

      <DiscoverySuccessModal
        isOpen={success !== null}
        result={success}
        onClose={() => setSuccess(null)}
      />
    </main>
  );
}

function MapFallback() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-muted text-sm text-muted-foreground">
      Laddar karta…
    </div>
  );
}
