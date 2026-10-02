import { createFileRoute } from "@tanstack/react-router";

// TILLFÄLLIG: används bara för att visa felsidan i webbläsaren. Tas bort direkt.
export const Route = createFileRoute("/zz-felsidetest")({
  component: () => {
    throw new Error("Avsiktligt testfel");
  },
});
