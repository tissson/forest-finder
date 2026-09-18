# 100-meters prognosceller

## Ändringar
- Ersätt den nuvarande grova polygonstorleken med en geografiskt beräknad 100 × 100 m-cell kring varje koordinatpunkt.
- Filtrera bort alla prognoser med `score < 0.3` innan de når kartan och använd dessutom datastyrd opacitet: 0 under tröskeln, 0.7 från tröskeln och uppåt.
- Behåll ett enda skarpt `fill`-lager utan kantlinje eller mjuka effekter.
- Använd färgordningen ljusgul → varm orange → intensiv rosa → djup lila för stigande värden från 0.3 till 1.0.
- Verifiera i koden att inga heatmap- eller circle-lager finns, och kontrollera den faktiska mobilvyn.

## Teknisk detalj
Varje cells halvhöjd beräknas som 50 meter i latitudgrader. Halvbredden beräknas separat vid punktens latitud, så att cellen förblir cirka 100 meter bred även i norra Sverige.
