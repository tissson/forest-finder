# Förslag efter kartgranskningen

Inga ändringar av kartor, artprofiler eller databas görs innan godkännande. Mätresultaten finns i granskningsrapporten.

## Första prioritet: skogsdatan
- Kontrollera de faktiskt laddade rastrens täckning mot landmask och NMD; skilj saknad data från verkligt låg volym.
- Redovisa särskilt Norrlands inland och verklig arealtäckning. `forest_cover` är normaliserad virkesvolym, inte skogsandel.
- Föreslå därefter separat skogsandel, volym och datatäckningsindikator. Ingen nationell laddning utan separat godkännande och föregående säkerhetskopia.

## Väder och artpoäng
- Jämför interpolerat råväder med nuvarande närmaste-punkt-metod på undanhållna väderpunkter.
- Utvärdera jämna artspecifika temperaturkurvor och nederbördsrespons utan hårda platåer; lokala normaler kräver historiskt underlag.
- Gör tröskeln runt 0,20 mjuk både i beräkningen av kartpunkter och visningen; verifiera svarstider och mängd kartpunkter.
- Källbelägg varje artprofils ekologiska antaganden; föreslå parametrar först efter analys.

## Separat hjortronarbete
- Utgå från en versionslåst NMD-produkt med verifierad CC0-licens; inkludera öppen våtmark och skog på våtmark.
- Skilj våtmark från myr och verkligt hjortronhabitat; använd markfukt endast som redovisad proxy där bättre underlag saknas.
- Validera habitat och mogna bär separat.

## Oberoende verklighetsvalidering
- Kvalitetsgranska och frys svenska GBIF-fynd för samtliga sex arter.
- Återskapa historiskt väder för fynddatum; annars begränsa första analysen till habitat och kalla den inte dagprognosvalidering.
- Jämför fynd med slumpbakgrund och observationsansträngningsmatchad bakgrund, med geografiskt blockerad testning.
- Redovisa AUC och osäkerhetsintervall per art, antal oberoende fynd, regionala resultat och enklare baslinjer.

## Tekniska krav
- Behåll publicering först efter fullständigt väder och färdig cache.
- Alla mätningar utgår från kartans faktiska compute-formler, inte den inaktuella predictions-tabellen.
- Historiska fynd får inte utvärderas med dagens väder som om det vore samma datum.
- Presence-background-AUC är ranking mot okänd bakgrund, inte bevisad fyndsannolikhet eller skörd.
