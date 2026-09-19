# Artunika, täta prognoskartor

## Orsak som rättas
- Blåbär blir tomt eftersom artens säsong slutade 15 september och den efterföljande säsongsfaktorn sänker alla värden under kartans 0,35-tröskel.
- Arterna använder i dag nästan samma formel; endast ett litet hashvärde skiljer dem åt. Därför blir kartbilderna i praktiken lika.
- Vid låg zoom används 8 km-block trots att databasen har 2 km-celler. Det skapar det synliga, regelbundna prickmönstret.

## Databas
- Lägg till artprofiler med separata preferenser för fukt och skogstäthet för varje art.
- Beräkna varje arts poäng från dess egen profil, fuktighet och skogstäckning i stället för samma generella formel.
- Korrigera blåbärssäsongen så aktuella blåbärsvärden inte stryps direkt efter 15 september.
- Generera MVT-punkter från samtliga aktiva 2×2 km-celler även vid Sverigevy, i stället för grova 8 km-block.
- Filtrera låga poäng i tile-funktionen innan de skickas, vilket håller tile-storleken nere trots högre täthet.

## Karta
- Behåll den kalibrerade värmekartan, men låt den nu arbeta med det täta 2 km-underlaget och de artunika poängen.
- Behåll strikt tröskel, mjuka kanter och befintlig klickfunktion.

## Verifiering
- Jämför Blåbär, Lingon, Kantarell och Trattkantarell i samma kartvy och bekräfta tydligt olika mönster.
- Kontrollera att Blåbär ger synliga resultat.
- Kontrollera zoom 5, 9 och 12 utan regelbundet prickmönster, tile-fel eller trasig popup.
