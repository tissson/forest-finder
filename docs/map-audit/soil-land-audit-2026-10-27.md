# Markfuktgranskning 27 oktober 2026 — steg 3–5 klara

**Stopp efter steg 5.** Endast tre nya granskningskolumner skrivna; inga befintliga värden, funktioner, tiles, cacher eller publicerad dag ändrade. Backup och steg 1–2 gäller.

## Återupptagbar beräkning
Vid start: 32 GiB ledigt, inga tidigare temporära raster kvar. Alla 21 län hämtades och uppackades; 6,2 GiB, 26 GiB återstår. Ingen annan produkt/version hämtades. En sorterad riksmosaik med 255 som käll-nodata; varje pixel räknas en gång. På exakt inpassad 2 m-grid reduceras 1000×1000 pixlar till varje 2 km-ruta, med klass 1/2/3 = 15/45/70, klass 4 endast vatten; 0/4/5/255 utesluts från landmedel. Fraction-nämnare: alltid 1 000 000 pixlar. Detta är exakt pixelmedel, motsvarande inpassad GDAL average, men alla tre mått räknas från en klassläsning.

775 radfiler sparades atomiskt i projektet; etappernas slut 12/162/312/462/612/775. Beräkningstid cirka 30 min. Tre slutraster återlästes innan import. Oberoende GDAL average över Blekinge/Skåne matchade 325 markrutor: maxskillnad 4,04×10⁻¹⁴, 0 NULL-avvikelser.

## Import och NULL
54 batchar via befintlig load_soil_land_audit, **106 272 aktiva rutor uppdaterade**. Alla tre importerade mått återlästes för samtliga rutor: 0 avvikelser mot raster vid 10⁻¹² tolerans. 103 739 landvärden och 2 533 NULL. Vatten/giltighetsandel för alla 106 272, inklusive noll utan täckning. 485 rutor har gammalt värde men NULL landfukt; 0 tvärtom. Inaktiva rutor skrivs inte av RPC:n.

## Länsgränser
Blekinge/Skåne: 400 kontrollrutor, 325 med mark; max 1,11×10⁻¹⁶, medel 2,21×10⁻¹⁷, 0 avvikelser över 10⁻¹², 0 NULL-avvikelser; 733 284 gemensamma giltiga pixlar utan konflikt.
Stockholm/Uppsala: 150/150 med mark, max 5,55×10⁻¹⁷, medel 2,33×10⁻¹⁷, 0 avvikelser och NULL-avvikelser; 365 275 gemensamma giltiga pixlar utan konflikt.
Den oberoende referensen läser alla län som berör respektive klipp. En första två-länsreferens i Blekinge saknade grannlän och underkändes; med alla berörda källor matchar allt. Importen ändrades inte.

## a. soil_wetness − soil_wetness_land
Band låg <5 %, medel 5–<20 %, hög ≥20 % vatten av hela cellen. Endast jämförbara 103 739 landrutor; 2 533 NULL uteslutna från differensmått.

| water_band   |     n |     mean |       min |       p10 |      p50 |      p90 |      max |
|:-------------|------:|---------:|----------:|----------:|---------:|---------:|---------:|
| low <5%      | 72397 | 0.007191 | -0.000450 | -0.000042 | 0.002920 | 0.021516 | 0.792000 |
| medium 5-20% | 20408 | 0.071481 |  0.013788 |  0.037621 | 0.063548 | 0.117111 | 0.781393 |
| high >20%    | 10934 | 0.288260 |  0.062325 |  0.149397 | 0.239468 | 0.513126 | 0.800000 |

### De 20 största absoluta skillnaderna

|            id |   center_lat |   center_lon |   soil_wetness |   soil_wetness_land |   soil_water_fraction |   soil_valid_fraction |    delta |
|--------------:|-------------:|-------------:|---------------:|--------------------:|----------------------:|----------------------:|---------:|
| 167867.000000 |    68.362036 |    19.158109 |       0.950000 |            0.150000 |              0.999946 |              1.000000 | 0.800000 |
| 321097.000000 |    55.407868 |    13.657526 |       0.950000 |            0.150000 |              0.474952 |              0.474980 | 0.800000 |
| 340510.000000 |    58.145490 |    14.541354 |       0.950000 |            0.150000 |              0.999931 |              1.000000 | 0.800000 |
| 379905.000000 |    61.816971 |    16.727188 |       0.950000 |            0.150000 |              0.999884 |              1.000000 | 0.800000 |
| 414950.000000 |    57.672046 |    18.303457 |       0.950000 |            0.150000 |              0.354013 |              0.354124 | 0.800000 |
| 337432.000000 |    63.387695 |    14.259686 |       0.950000 |            0.150000 |              0.999348 |              1.000000 | 0.800000 |
| 316182.000000 |    63.913452 |    12.941167 |       0.950000 |            0.150000 |              0.999875 |              1.000000 | 0.800000 |
|  95725.000000 |    65.525110 |    14.762053 |       0.950000 |            0.150000 |              0.499993 |              0.500000 | 0.800000 |
|  46494.000000 |    62.108842 |    12.412820 |       0.950000 |            0.150000 |              0.999325 |              1.000000 | 0.800000 |
| 145093.000000 |    57.161795 |    16.901473 |       0.949000 |            0.150000 |              0.472091 |              0.472629 | 0.799000 |
| 305459.000000 |    62.109553 |    12.451103 |       0.949000 |            0.150000 |              0.999275 |              1.000000 | 0.799000 |
| 281336.000000 |    58.080907 |    11.523059 |       0.949000 |            0.150258 |              0.987472 |              0.988637 | 0.798742 |
| 437208.000000 |    64.400875 |    20.460460 |       0.949000 |            0.150366 |              0.998361 |              1.000000 | 0.798634 |
| 135073.000000 |    61.889226 |    16.693203 |       0.949000 |            0.150657 |              0.998173 |              1.000000 | 0.798343 |
| 346168.000000 |    65.471278 |    14.762543 |       0.948000 |            0.150000 |              0.498663 |              0.499663 | 0.798000 |
| 432763.000000 |    68.767952 |    21.169808 |       0.948000 |            0.150000 |              0.440451 |              0.441330 | 0.798000 |
| 378583.000000 |    61.907634 |    16.656142 |       0.948000 |            0.150000 |              0.997832 |              1.000000 | 0.798000 |
| 346166.000000 |    65.435389 |    14.762868 |       0.948000 |            0.150000 |              0.499000 |              0.500000 | 0.798000 |
| 432760.000000 |    68.714452 |    21.154973 |       0.948000 |            0.150600 |              0.499000 |              0.500000 | 0.797400 |
| 286652.000000 |    58.070081 |    11.795531 |       0.948000 |            0.151338 |              0.997421 |              1.000000 | 0.796662 |

Lågt vatten av HELA cellen kan ändå ge stor effekt om giltig SLU-yta är mycket liten. Små negativa differenser nära noll kan också påverkas av gamla laddarens avrundning.

## b. I och kring sjöarna
Rutcentrum i rektanglar: Vänern 58,3–59,5°N / 12,2–14,3°E; Vättern 57,7–58,95 / 14,0–15,2; Mälaren 59,15–59,7 / 15,7–18,1. Inte exakta sjöpolygoner: omfattar omgivande land, inte sjörena vattenandelar. Individuella rutor i lake-cells CSV.

| lake    |    n |   old_mean |   land_mean |   water_mean |   delta_mean |   null_land |
|:--------|-----:|-----------:|------------:|-------------:|-------------:|------------:|
| Mälaren | 1545 |   0.270682 |    0.230612 |     0.054761 |     0.040070 |           0 |
| Vänern  | 2573 |   0.324319 |    0.263230 |     0.086803 |     0.060846 |           1 |
| Vättern | 1880 |   0.304553 |    0.238706 |     0.091519 |     0.061353 |          13 |

## c. Artpoäng för 24 oktober
106 272 aktiva rutor per art/variant, även under tröskeln. Nuvarande compute_prediction_tile-formel med oförändrade skogs-/trädslags-/säsongstermer; endast soil_wetness ersatt i SELECT av soil_wetness_land. NULL ger enbart väder. Simulering, inte produktionsändring.

| Art            | gt02              | gt05              | gt07            | p10             | p90             | mean            |
|:---------------|:------------------|:------------------|:----------------|:----------------|:----------------|:----------------|
| Blåbär         | 91.3176 → 90.3785 | 20.8484 → 18.5627 | 0.0000 → 0.0000 | 0.2171 → 0.2051 | 0.5483 → 0.5438 | 0.3810 → 0.3703 |
| Hjortron       | 24.3592 → 24.0148 | 0.0160 → 0.0094   | 0.0000 → 0.0000 | 0.0886 → 0.0882 | 0.2514 → 0.2504 | 0.1534 → 0.1523 |
| Kantarell      | 88.0062 → 87.2902 | 21.6953 → 18.7829 | 4.7595 → 3.0808 | 0.1800 → 0.1727 | 0.6014 → 0.5713 | 0.4091 → 0.3982 |
| Karl Johan     | 82.8421 → 81.9924 | 20.8634 → 18.2447 | 4.5449 → 3.2407 | 0.1458 → 0.1414 | 0.5820 → 0.5498 | 0.3746 → 0.3632 |
| Lingon         | 93.0490 → 92.3084 | 20.3064 → 18.7632 | 0.0000 → 0.0000 | 0.2423 → 0.2316 | 0.5369 → 0.5340 | 0.3923 → 0.3845 |
| Trattkantarell | 63.3252 → 62.7098 | 2.2951 → 1.2092   | 0.2108 → 0.0047 | 0.1264 → 0.1259 | 0.4241 → 0.4217 | 0.2699 → 0.2653 |

### Medel per latitudband [N,N+1), nu → land

|   latitude | Blåbär          | Hjortron        | Kantarell       | Karl Johan      | Lingon          | Trattkantarell   |
|-----------:|:----------------|:----------------|:----------------|:----------------|:----------------|:-----------------|
|         55 | 0.3627 → 0.3571 | 0.1535 → 0.1530 | 0.2916 → 0.2799 | 0.2838 → 0.2707 | 0.3926 → 0.3970 | 0.1798 → 0.1756  |
|         56 | 0.4809 → 0.4741 | 0.1523 → 0.1515 | 0.4752 → 0.4583 | 0.4425 → 0.4235 | 0.4593 → 0.4670 | 0.2801 → 0.2739  |
|         57 | 0.4505 → 0.4409 | 0.1459 → 0.1440 | 0.4972 → 0.4840 | 0.4676 → 0.4540 | 0.4295 → 0.4243 | 0.3172 → 0.3102  |
|         58 | 0.4321 → 0.4226 | 0.1582 → 0.1558 | 0.4629 → 0.4464 | 0.4446 → 0.4276 | 0.4177 → 0.4143 | 0.2895 → 0.2800  |
|         59 | 0.4396 → 0.4340 | 0.1549 → 0.1503 | 0.5102 → 0.4885 | 0.4947 → 0.4730 | 0.3938 → 0.3977 | 0.3257 → 0.3098  |
|         60 | 0.4582 → 0.4500 | 0.1407 → 0.1391 | 0.5211 → 0.5065 | 0.4998 → 0.4844 | 0.4322 → 0.4316 | 0.3328 → 0.3254  |
|         61 | 0.4508 → 0.4414 | 0.1583 → 0.1577 | 0.4832 → 0.4718 | 0.4434 → 0.4311 | 0.4368 → 0.4324 | 0.2896 → 0.2854  |
|         62 | 0.4273 → 0.4143 | 0.1457 → 0.1454 | 0.4225 → 0.4104 | 0.3846 → 0.3714 | 0.4548 → 0.4483 | 0.2817 → 0.2787  |
|         63 | 0.4088 → 0.3946 | 0.1446 → 0.1440 | 0.4112 → 0.4003 | 0.3685 → 0.3569 | 0.4583 → 0.4486 | 0.2814 → 0.2788  |
|         64 | 0.3587 → 0.3454 | 0.1572 → 0.1570 | 0.3775 → 0.3693 | 0.3273 → 0.3185 | 0.4097 → 0.3963 | 0.2567 → 0.2550  |
|         65 | 0.3119 → 0.2979 | 0.1576 → 0.1575 | 0.3542 → 0.3494 | 0.3091 → 0.3044 | 0.3504 → 0.3304 | 0.2484 → 0.2477  |
|         66 | 0.2751 → 0.2632 | 0.1572 → 0.1572 | 0.3140 → 0.3109 | 0.2687 → 0.2658 | 0.3088 → 0.2904 | 0.2337 → 0.2334  |
|         67 | 0.2361 → 0.2250 | 0.1669 → 0.1669 | 0.2497 → 0.2448 | 0.2093 → 0.2043 | 0.2755 → 0.2616 | 0.1801 → 0.1793  |
|         68 | 0.1618 → 0.1516 | 0.1555 → 0.1553 | 0.1686 → 0.1653 | 0.1501 → 0.1470 | 0.1888 → 0.1741 | 0.1388 → 0.1381  |
|         69 | 0.1083 → 0.1065 | 0.1110 → 0.1110 | 0.1267 → 0.1266 | 0.1253 → 0.1252 | 0.1150 → 0.1120 | 0.1250 → 0.1250  |

## Oförändrat, verifierat före/efter
- Befintliga skogs/NMD/markfuktvärden MD5: 2a8931608e66f6cdf4c01321d4f91f11 båda gångerna.
- 672 artcacher MD5: 941353984a48c617df9af665f98fc3fc båda gångerna.
- 112 fuktcacher MD5: 22a29f35f11ec62307e34bcfecf0f8f4 båda gångerna.
- Publicerad dag 2026-10-27, UTC 03:00:00.0481 båda gångerna. Nattjobbet publicerade redan före arbetet; skillnaden mot föregående rapports 26 oktober gjordes inte här.
- Fem klassregeltester passerade. Ingen publicering, profil-/tröskeländring eller cacheåtgärd.

## Exakta återanvändbara filer
Beständigt:
- scripts/map-audit/resume_soil_land.py och check_soil_land_boundaries.py.
- docs/map-audit/soil-land-checkpoints/row_0000.npz–row_0774.npz (775 färdiga), manifest.json, COMPLETE.json.
- Samma katalog: soil_wetness_land_2km.tif, soil_water_fraction_2km.tif, soil_valid_fraction_2km.tif (alla färdiga och återlästa; SHA-256 i COMPLETE.json).
- docs/map-audit/soil-land-import-2026-10-27.json, soil-land-boundaries-2026-10-27.json, soil-land-gdal-reference-2026-10-27.json.
- soil-land-differences-2026-10-27.csv, soil-land-top20-2026-10-27.csv, soil-land-lake-cells-2026-10-27.csv, soil-land-lakes-summary-2026-10-27.csv.
- soil-land-species-2026-10-27.csv/.sql och soil-land-latitude-2026-10-27.csv/.sql, SELECT för väderdag 24 oktober.

Temporärt kvar: /tmp/soil-land/raw/{01,03,04,05,06,07,08,09,10,12,13,14,17,18,19,20,21,22,23,24,25}/ med TIFF och .ok; source.vrt, feed.xml, urls.txt, batches/000.json–053.json, active.json, readback.json, land_lut.vrt, gdal-reference.tif, etapploggar och check/boundary_check.py. Dessa kan försvinna vid omstart; färdiga reducerade data och rapporter ligger i projektet och behöver inte räknas om. Inga jobb kör vidare. Produktionsinförande kräver separat godkännande.
