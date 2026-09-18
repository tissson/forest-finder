import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState } from "react";
import { toast } from "sonner";
import { Camera, Layers3, LogIn, LogOut, X } from "lucide-react";

import { DiagnosticPanel } from "@/components/DiagnosticPanel";
import { LayerSelector } from "@/components/LayerSelector";
import { CameraCapture } from "@/components/CameraCapture";
import { LogDiscoveryModal } from "@/components/LogDiscoveryModal";
import { DiscoverySuccessModal } from "@/components/DiscoverySuccessModal";
import { MapSearch } from "@/components/MapSearch";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { supabase, onAuthStateChange } from "@/lib/supabase";
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
  const navigate = useNavigate();
  const [mounted, setMounted] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [layer, setLayer] = useState<LayerSelection | null>({ type: "moisture" });
  const [count, setCount] = useState<number | null>(null);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [layerSheetOpen, setLayerSheetOpen] = useState(false);
  const [pending, setPending] = useState<{
    file: File;
    weatherZoneId: number | null;
  } | null>(null);
  const [success, setSuccess] = useState<DiscoveryUploadResult | null>(null);
  const [focusTarget, setFocusTarget] = useState<{ center: [number, number]; key: number } | null>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(Boolean(data.session)));
    return onAuthStateChange((session) => setSignedIn(Boolean(session)));
  }, []);


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
              focusTarget={focusTarget}
            />
          </Suspense>
        ) : (
          <MapFallback />
        )}
      </div>

      <header className="pointer-events-none absolute inset-x-0 top-0 z-10 p-3 sm:p-5">
        <div className="pointer-events-auto mx-auto flex max-w-3xl items-center gap-2">
          <div className="hidden shrink-0 rounded-2xl border border-border/70 bg-card/90 px-4 py-3 text-sm font-semibold text-card-foreground shadow-xl backdrop-blur-xl sm:block">
            Svamp & Bär
          </div>
          <MapSearch
            onSelect={(place) => setFocusTarget({ center: place.center, key: Date.now() })}
          />
          {count !== null && (
            <span className="hidden shrink-0 rounded-2xl border border-border/70 bg-card/90 px-3 py-3 text-xs font-medium text-muted-foreground shadow-xl backdrop-blur-xl sm:block">
              {count} rutor
            </span>
          )}
          <Button
            type="button"
            size="icon"
            variant="outline"
            aria-label={signedIn ? "Logga ut" : "Logga in"}
            onClick={() => {
              if (signedIn) {
                void supabase.auth.signOut();
                toast.success("Utloggad");
              } else {
                navigate({ to: "/auth" });
              }
            }}
            className="h-12 w-12 shrink-0 rounded-2xl border-border/70 bg-card/90 shadow-xl backdrop-blur-xl"
          >
            {signedIn ? <LogOut /> : <LogIn />}
          </Button>
        </div>
      </header>

      <div className="pointer-events-none absolute inset-x-0 bottom-5 z-10 hidden px-5 md:block">
        <div className="pointer-events-auto mx-auto max-w-3xl pr-20">
          <LayerSelector value={layer} onChange={setLayer} />
        </div>
      </div>

      <div className="absolute left-3 top-20 z-10 hidden max-w-md lg:block">
        <DiagnosticPanel />
      </div>

      <nav aria-label="Huvudmeny" className="mobile-bottom-bar md:hidden">
        <Button
          type="button"
          variant="ghost"
          onClick={() => setLayerSheetOpen(true)}
          aria-label="Välj kartlager"
          className="mobile-nav-action"
        >
          <Layers3 className="h-5 w-5" />
          <span>Lager</span>
        </Button>
        <Button
          type="button"
          onClick={() => {
            if (!signedIn) {
              toast.info("Logga in först", { description: "Du behöver ett konto för att spara fynd." });
              navigate({ to: "/auth" });
              return;
            }
            setCaptureOpen(true);
          }}
          aria-label="Registrera fynd"
          size="icon"
          className="mobile-camera-action"
        >
          <Camera className="h-7 w-7" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            if (signedIn) {
              void supabase.auth.signOut();
              toast.success("Utloggad");
            } else {
              navigate({ to: "/auth" });
            }
          }}
          aria-label={signedIn ? "Logga ut" : "Logga in"}
          className="mobile-nav-action"
        >
          {signedIn ? <LogOut className="h-5 w-5" /> : <LogIn className="h-5 w-5" />}
          <span>{signedIn ? "Logga ut" : "Logga in"}</span>
        </Button>
      </nav>

      <Button
        type="button"
        onClick={() => {
          if (!signedIn) {
            toast.info("Logga in först", { description: "Du behöver ett konto för att spara fynd." });
            navigate({ to: "/auth" });
            return;
          }
          setCaptureOpen(true);
        }}
        aria-label="Logga ett fynd"
        size="icon"
        className="absolute bottom-5 right-6 z-20 hidden h-16 w-16 rounded-2xl bg-accent text-accent-foreground shadow-xl transition-transform active:scale-95 md:inline-flex"
      >
        <Camera className="h-7 w-7" />
      </Button>

      <Sheet open={layerSheetOpen} onOpenChange={setLayerSheetOpen}>
        <SheetContent side="bottom" className="max-h-[78dvh] overflow-y-auto rounded-t-2xl border-border/70 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3">
          <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border" aria-hidden="true" />
          <SheetHeader className="mb-4 text-left">
            <SheetTitle>Välj kartlager</SheetTitle>
            <SheetDescription>Visa fuktighet eller prognosen för en art.</SheetDescription>
          </SheetHeader>
          <LayerSelector
            value={layer}
            onChange={(selection) => {
              setLayer(selection);
              setLayerSheetOpen(false);
            }}
            className="border-0 bg-transparent p-0 shadow-none backdrop-blur-none"
          />
        </SheetContent>
      </Sheet>


      {captureOpen && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-foreground/60 p-4 sm:items-center">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold">Nytt fynd</h2>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => setCaptureOpen(false)}
                aria-label="Stäng"
                className="rounded-xl text-muted-foreground"
              >
                <X className="h-5 w-5" />
              </Button>
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
