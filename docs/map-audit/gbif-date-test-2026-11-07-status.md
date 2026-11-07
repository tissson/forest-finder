# GBIF datumtest — korta intervall, 7 november 2026

## Verifierat resultat kl. 17:18 UTC

| Art | Fynd | Klara med 20 kontroller | Väntar | Bortfall | CSV-rader |
|---|---:|---:|---:|---:|---:|
| Trattkantarell | 653 | **653** | 0 | 0 | **13 713** |
| Hjortron | 739 | **99** | 640 | 0 | **2 079** |

- `gbif-date-test-2026-11-07.csv`: komplett trattkantarellfil, samma nio kolumner som tidigare.
- `gbif-date-test-2026-11-07-hjortron.csv`: separat delresultat, inte komplett.
- `gbif-date-test-2026-11-07-legacy.csv`: ursprungliga 42 fynd × 21 = 882 rader, byte-oförändrad; SHA256 `e2daf8d3a834135debef07f5ad0b0436f7ecc44009ffc276e7c7647464527525`.
- Ursprunglig metadata och status är bevarade som `*-legacy-metadata.json` och `*-legacy-status.md`.
- Alla 27 ursprungliga platsfiler finns kvar och deras lagrade kontrollsummor stämmer. De återanvänds när de täcker hela det nya intervallet; gamla kontrollurval blandas inte in i den nya filen.
- `gbif-date-test-2026-11-07-metadata.json`: aktuella antal, metod, kontrollsummor, separata väntande poster.
- `gbif-date-test-2026-11-07-verification.json`: oberoende kontrollresultat och budgettider.

## Anrop och väntetid

**606 nya, sekventiella HTTP-anrop**, konservativ vikt **3 995**, **0 fel och 0 HTTP 429**. Tidigare 27 anrop har vikt 3 861; sammanlagd redovisad vikt **7 856**. Vikten är vår försiktiga avrundning `ceil(antal inkluderade dagar / 14)`, inte en förbrukningsmätare från leverantören.

Försiktiga budgetar: 450/minut, 4 000/timme och 8 000/rullande dygn. Första körningen pausade efter 539 anrop; den andra färdigställde trattkantarell först och fortsatte med hjortron tills timbudgeten krävde paus.

Återstår **587 plats/år-anrop**, vikt **3 572**, för **640 hjortronfynd**. Tidigaste nästa anrop enligt sparad timbudget: **7 november 18:09:49 UTC**. Dygnsbudgeten medger bara ett mindre antal innan nästa paus. De tidigare långa anropen lämnar dygnsfönstret **8 november 09:35–09:44 UTC**. Om hämtningen återupptas då och delad adress inte begränsas av annan trafik, uppskattas resten bli klart cirka **8 november 10:00 UTC** (cirka 10–20 minuters aktiv hämtning; ingen garanti).

**Ingen automatisk hämtning fortsätter efter detta svar.** Körningen kan återupptas utan att göra om färdiga anrop:

```sh
python3 scripts/map-audit/gbif_date_test.py --max-locations 2000 --run-seconds 540
```

Varje anrop sparas atomiskt i `gbif-date-weather-checkpoints/era5_<lat>_<lon>_<år>_<start>_<slut>.json.gz`. `requests.json` redovisar alla försök före sändning, och `next-run.json` anger tidigaste fortsättning. Vid HTTP 429 sparas även `cooldown.json`; scriptet väntar enligt `Retry-After` (sekunder eller HTTP-datum), fortsätter om väntan ryms i körbudgeten, annars sparar det pausen för nästa körning. Saknas huvudet används en försiktig timmes paus.

## Metod och kontroll

Bara Open-Meteo-arkivet, `models=era5`, `timezone=Europe/Stockholm`, `precipitation_sum` och `temperature_2m_mean`. Varje fynd bidrar intervallet datum −40 till +30 dagar inklusive ändpunkter (**71 dagar**); samma avrundade plats och fyndår samlas i en enda förfrågan från tidigaste start till senaste slut. Samma plats/år kan återanvändas för båda arterna; inga särskilda hjortronförfrågningar startade före att alla trattkantarellförfrågningar var färdiga.

Koordinater avrundas till 0,1° med decimal half-up. CSV behåller ursprungliga fyndkoordinater. Kontroller: 20 unika dagar från **samma år**, samma plats och faktisk datumskillnad **4–30 dagar**, fast seed **20261107**, separat deterministiskt urval per GBIF-nyckel. Full tiodagarshistorik krävs. Nederbörd är summan av dagen och föregående sex/nio dagar; temperaturen gäller måldagen. Inga saknade värden fylls med noll.

Alla **15 792 exporterade rader** verifierades separat mot sparade dagsarrayer: plats, art, år, datumfönster, 20 unika kontroller, tiodagarshistorik, nederbörd, temperatur och dagnummer. **0 avvikelser**. Nio regeltester passerar. De fyra decemberfynd som tidigare låg utanför den långa förfrågans slutdatum är nu kompletta; inget bortfall föreligger i den färdiga trattkantarellfilen.

Ingen databasanslutning, ändring av appen, profil, tröskel, kolumn, funktion eller cache gjordes.

Väderkälla: Open-Meteo / ERA5, CC BY 4.0, https://open-meteo.com/. GBIF-källor/licenser finns kvar i ursprungsfilen. Anropsvikter: https://open-meteo.com/en/pricing ; gränser: https://open-meteo.com/en/terms .
