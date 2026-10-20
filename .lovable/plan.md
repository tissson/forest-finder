# Nästa steg efter den fördjupade kartgranskningen

Publicerade kartor och värden lämnas oförändrade tills respektive införande är godkänt. Nationell omladdning ingår inte i detta förslag.

## 1. Datakvalitet först
- Gör en begränsad NMD/markfuktpilot i norr och söder med verifierad produktversion, klasslista, licens och landmask.
- Redovisa faktisk skogsandel, volym och saknad data separat. Jämtlands kontrollerade volymraster är nästan helt NoData.
- Mät hur många rutor som påverkas av att markfuktens klass 4 (öppet vatten) nu räknas som våt mark. Föreslå rättning med separata mark-/vatten-/täckningsandelar; jämför även den kontinuerliga markfuktprodukten.
- Redovisa pilotens före/efter och gränskontroll innan någon nationell laddning begärs.

## 2. Väderinterpolering
- Förbered IDW4 för råtemperatur och rånederbörd. Läsprovet gav 18,03 % lägre temperaturfel och cirka 19,5 % lägre nederbördsfel mot undanhållna Open-Meteo-punkter, inte mot oberoende stationer.
- Jämför gamla/nya artpoäng, svarstider och cache/live-likhet. Inför först efter redovisat resultat och klartecken.
- Behåll publicering först efter fullständig väderdag, omräkning och cache.

## 3. Artkurvor och mjuk karttröskel
- Experimentera utanför den publicerade kartan med jämn artspecifik temperatur och nederbördsrespons utan hård mättnad.
- Lokala nederbördsnormaler kräver historiskt underlag. Inga exakta artoptima presenteras som källbelagda utan stöd eller kalibrering.
- Separera mjuk visning kring 0,20 från förändrad ekologisk poäng; kontrollera även källfiltreringen och prestanda.
- Presentera parametrar och jämförelser för beslut innan införande.

## 4. Separat hjortronpilot
- Använd versionslåst NMD som våtmarkskontext, kompletterad med myr-/torvunderlag; våtmark är inte automatiskt hjortronmyr.
- Tillåt relevanta öppna och skogbevuxna myrar. Använd korrekt markfukt som märkt proxy, aldrig öppet vatten som markhabitat.
- Validera habitat och mogna bär separat. Nuvarande habitatpilot gav ungefär slumpnivå för hjortron.

## 5. Oberoende verklighetsvalidering
- Utöka och frys kvalitetsgranskade GBIF-urval för alla sex arter; behåll licenser och kvalitetsvarningar.
- Matcha väder till verkliga fynddatum. Bärplantor är inte bevis för mogna bär.
- Använd geografiskt/tidsmässigt separata testdata och observationsansträngningsmatchad bakgrund; redovisa AUC, osäkerhet och regionala resultat mot baslinjer.
- Den lilla habitatpiloten är inte bevis för dagens fyndprognos eller kalibrerad sannolikhet.

## Tekniska spärrar
- Alla experiment är fristående läsningar, utanför appens exekutionsväg.
- Nationell omladdning kräver separat uttryckligt godkännande, verifierad backup och täcknings-/gräns-/före–efterkontroller.
