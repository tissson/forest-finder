import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { supabase } from "@/lib/supabase";
import { lovable } from "@/integrations/lovable/index";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Logga in – Svamp- & Bärprognos" },
      {
        name: "description",
        content:
          "Logga in för att registrera dina svamp- och bärfynd, samla poäng och låsa upp utmärkelser.",
      },
      { property: "og:title", content: "Logga in – Svamp- & Bärprognos" },
      {
        property: "og:description",
        content: "Skapa konto eller logga in för att spara dina fynd i Svamp- & Bärprognos.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        toast.success("Konto skapat", {
          description: "Kolla mejlen och bekräfta adressen för att logga in.",
        });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/" });
      }
    } catch (error) {
      toast.error("Det gick inte", {
        description: error instanceof Error ? error.message : "Försök igen.",
      });
    } finally {
      setBusy(false);
    }
  };

  const handleGoogle = async () => {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error("Google-inloggning misslyckades");
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/" });
  };

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-xl">
        <h1 className="mb-1 text-lg font-semibold">
          {mode === "signin" ? "Logga in" : "Skapa konto"}
        </h1>
        <p className="mb-5 text-sm text-muted-foreground">
          Behövs för att spara fynd, poäng och utmärkelser.
        </p>

        <button
          type="button"
          onClick={handleGoogle}
          className="mb-4 w-full rounded-lg border border-border px-4 py-2.5 text-sm font-medium hover:bg-muted"
        >
          Fortsätt med Google
        </button>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="E-post"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Lösenord"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {busy ? "Vänta…" : mode === "signin" ? "Logga in" : "Skapa konto"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="mt-4 w-full text-center text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          {mode === "signin" ? "Har du inget konto? Skapa ett" : "Har du redan konto? Logga in"}
        </button>
      </div>
    </main>
  );
}
