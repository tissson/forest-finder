import { useState } from "react";
import { MapPin, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const SWEDISH_PLACES = [
  { name: "Stockholm", center: [18.0686, 59.3293] as [number, number] },
  { name: "Göteborg", center: [11.9746, 57.7089] as [number, number] },
  { name: "Malmö", center: [13.0038, 55.605] as [number, number] },
  { name: "Uppsala", center: [17.6389, 59.8586] as [number, number] },
  { name: "Örebro", center: [15.2134, 59.2753] as [number, number] },
  { name: "Västerås", center: [16.5448, 59.6099] as [number, number] },
  { name: "Linköping", center: [15.6214, 58.4108] as [number, number] },
  { name: "Jönköping", center: [14.1618, 57.7826] as [number, number] },
  { name: "Karlstad", center: [13.5036, 59.3793] as [number, number] },
  { name: "Falun", center: [15.6355, 60.6065] as [number, number] },
  { name: "Sundsvall", center: [17.3069, 62.3908] as [number, number] },
  { name: "Umeå", center: [20.263, 63.8258] as [number, number] },
  { name: "Luleå", center: [22.1547, 65.5848] as [number, number] },
  { name: "Kiruna", center: [20.2253, 67.8558] as [number, number] },
];

interface MapSearchProps {
  onSelect: (place: { name: string; center: [number, number] }) => void;
}

export function MapSearch({ onSelect }: MapSearchProps) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLocaleLowerCase("sv");
  const matches = normalizedQuery
    ? SWEDISH_PLACES.filter((place) => place.name.toLocaleLowerCase("sv").includes(normalizedQuery)).slice(0, 4)
    : [];

  const choose = (place: (typeof SWEDISH_PLACES)[number]) => {
    setQuery(place.name);
    onSelect(place);
  };

  return (
    <div className="relative w-full">
      <form
        className="flex h-12 items-center gap-1 rounded-2xl border border-border/70 bg-card/90 p-1.5 shadow-xl backdrop-blur-xl"
        onSubmit={(event) => {
          event.preventDefault();
          const place = matches[0];
          if (place) choose(place);
        }}
      >
        <Search className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Sök plats i Sverige"
          aria-label="Sök plats i Sverige"
          className="h-9 border-0 bg-transparent px-2 shadow-none focus-visible:ring-0"
        />
        <Button type="submit" size="icon" variant="ghost" aria-label="Visa plats" className="rounded-xl">
          <MapPin />
        </Button>
      </form>

      {matches.length > 0 && query !== matches[0]?.name && (
        <div className="absolute inset-x-0 top-14 overflow-hidden rounded-2xl border border-border/70 bg-card/95 p-1.5 shadow-xl backdrop-blur-xl">
          {matches.map((place) => (
            <Button
              key={place.name}
              type="button"
              variant="ghost"
              onClick={() => choose(place)}
              className="w-full justify-start rounded-xl text-foreground"
            >
              <MapPin className="text-primary" />
              {place.name}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}