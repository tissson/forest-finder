# Species source audit

Read-only repository audit; recommendations only. Sources distinguish habitat/plant occurrence from fruitbody or berry yield. Quotes below were available in retrieved source text; Artfakta ecology was not accessible, so no ecological claims are attributed to unseen Artfakta content.

## Bottom line: constants are not validated

**No reviewed source justifies the model's normalized 0–1 optima or tolerances.** Existing values are heuristic, not measured ecological optima, probabilities, or confidence intervals.

| Species | Moisture optimum | Moisture tolerance | Forest optimum |
|---|---:|---:|---:|
| Kantarell | .72 | .25 | .72 |
| Trattkantarell | .82 | .20 | .82 |
| Blåbär | .52 | .28 | .68 |
| Lingon | .38 | .20 | .58 |
| Karl Johan | .68 | .22 | .78 |
| Hjortron | .88 | .16 | .35 |

Confirmed in `supabase/migrations/20260919072044_d3bb6320-21d8-4aee-8680-417197db5d74.sql:12–20`. A normalized encoding does not become an ecological measurement by division by 100. Forest cover is documented in migration `20260930070240_ddeecc95-dcc0-4dbc-a5bc-5188af58c8ec.sql:56` as timber volume / 200, not crown cover: do not translate a published crown-cover result directly into this variable.

## Per-species source table

Source labels link to full URLs and exact supporting quotes below. Qualitative interpretations are explicitly weaker than fitted response curves.

| Species / taxon | Habitat and tree associations | Soil / wetness: supported interpretation and limits | Seasonal / temperature evidence | Supported model direction, not numerical replacement |
|---|---|---|---|---|
| Kantarell — *Cantharellus cibarius* | Deciduous and conifer forest, including mountain birch forest [S1]. Mycorrhizal tree dependence supported at general edible-mushroom level by SLU [S4]; no exclusive spruce association established here. | SLU describes desiccation sensitivity and suitable moisture/light at forest edges [S4]. This supports moisture availability, **not** peatland preference, saturation optimum, pH cutoff, or .72. | June–July through late autumn until subzero conditions dominate [S1]; antecedent moisture and temperature matter generally [S4]. No species-specific °C optimum established. | Include broad forest/host contexts and edge structure; do not equate more timber with better habitat or assign exact tree weights from these sources. |
| Trattkantarell — *Craterellus tubaeformis* | Mossy conifer forest with pine and spruce; also beech forest in southern Sweden [S2]. | Mossy habitat is supported; treating it as a specific groundwater class or establishing .82 > kantarell .72 is **not** justified by that description. No numeric wetness tolerance established. | September–October especially, from Swedish forestry guidance [S3], descriptive rather than a fitted phenology study. No °C optimum established. | Add pine/spruce and southern beech habitat rather than a universal dense-spruce requirement; a moss/moist-forest prior is a hypothesis, not a calibrated curve. |
| Blåbär — *Vaccinium myrtillus* | Conifer and deciduous forest, heath [S5]. SLU field/remote-sensing research supports a canopy-structure effect [S7]; trees are habitat associates, not obligatory ectomycorrhizal hosts of the plant. | Broad forest/heath occurrence supported; no measured soil-water or pH optimum extracted. A mesic/acid-soil prior may be ecologically plausible but needs a direct habitat source or fitting before becoming a rule. | July–September harvest described by secondary guidance [S5], not a scientific nationwide fixed window; no quantitative temperature optimum established. | Model crown cover/light separately from timber volume. SLU reports roughly 50% crown cover for greatest berry availability in its study [S7]; this is **not** forest_optimum=.50, nor a universal optimum for ris occurrence. |
| Lingon — *Vaccinium vitis-idaea* | Pine forest, heath, mire and rocky ground [S6]; SLU finds greatest berry availability in more open forest and clearcuts [S7]. No obligate tree-host requirement. | Includes dry/open-looking settings but also mire: do not hard-exclude wet areas from a simplistic dry-species label. No exact soil-water optimum or tolerance supported. | No scientifically quantified species-specific seasonal/temperature curve verified in this audit. | Reduce reliance on dense timber as a positive proxy; allow open habitat/clearcuts for fruit yield. The relative light preference versus blåbär is supported, exact .58 versus .68 is not. |
| Karl Johan — *Boletus edulis* | Both conifer and deciduous forest [S8]; gran association and edges described in Swedish forestry guidance [S3]. SLU identifies kantarell/Karl Johan as often occurring at suitable forest edges [S4]. Do not merge other stensopp species into this taxon. | Moisture and desiccation effects supported generally by SLU [S4]; no support here for a saturated-soil optimum, exact pH, .68, or .22 width. | SLU supports weather, especially moisture and temperature in preceding weeks, as drivers [S4], but not a numerical thermal optimum or fixed national dates. | Host/forest-type and edge features defensible; exclusive spruce, maximum-density assumptions, and exact numerical response need fitting. |
| Hjortron — *Rubus chamaemorus* | Mire habitat directly supported by SLU cultivation account [S9] and Swedish Botanical Society material illustrating hjortron on the bog plane [S10]. Not an obligate tree-associated species; open mire habitat must be eligible. | Prioritise peat-mire context over generic wetland. Acidic, moist, sunny bog habitat also described by regional Swedish visitor information [S11], a lower-authority source. Microtopography matters: wet mire context does not mean every flooded hollow is optimal. No basis for .88/.16. | SLU reports flowering frost damage and insufficient pollination [S9]; this supports phenophase-aware risk, not an exact damaging °C threshold. Regional July–August ripening [S11] is descriptive, not a nationwide scientific window. | Add mire/peat evidence and openness, retain wet habitats, and separate occupancy from pollination/frost-dependent berry yield. Simply increasing moisture optimum cannot recover missing habitat. |

## Source register: URLs and supporting quotes

- **S1 — Svampguiden, specialist Swedish secondary source, Kantarell.** https://svampguiden.com/sv/art/3213-chanterelle — “Växer i löv- och barrskog”; “Finns även i fjällbjörkskogen”; “Dyker upp redan i juni–juli, och säsongen sträcker sig långt in på senhösten tills minusgraderna tar överhanden.”
- **S2 — Svampguiden, Trattkantarell.** https://www.svampguiden.com/sv/art/3217-trattkantarell — “Växer i mossig barrskog med tall och gran över hela landet. I södra sverige växer den i bokskog.”
- **S3 — Skogssällskapet, Swedish forestry guidance (not a primary ecological study).** https://www.skogssallskapet.se/kunskapsbank/artiklar/2010-09-15-7-sakra-och-goda-svampar.html — Karljohan: “Den växer nära gran och ofta i skogsbryn, längs stigar och vid vägkanten.” Trattkantarell: “växer framför allt i september och oktober i barrskog och bland mossa.”
- **S4 — SLU, mycology professor Anders Dahlberg.** https://www.slu.se/nyheter/2025/07/svampar/ — “Nästan alla våra matsvampar är mykorrhizasvampar – de lever i symbios med trädens rotsystem”; “särskilt fukt och temperatur veckorna före svampsäsongen”; “Det är känsligt för uttorkning”; “Vissa arter, som kantarell och Karl Johan, trivs ofta i kanter där fukt- och ljusförhållanden är lämpliga.” General mechanisms, not six fitted species response curves.
- **S5 — Skogsskafferiet, secondary foraging guidance, Blåbär.** https://www.skogsskafferiet.se/blabar — “Barr- och lövskog, hed.” “Bären plockas från juli och ända fram till september”. Use habitat/harvest descriptions only, not unrelated health claims on the page.
- **S6 — Skogsskafferiet, Lingon.** https://www.skogsskafferiet.se/lingon — “Tallskog, hed, myr, hällmark.”
- **S7 — SLU research communication, field berry observations plus remote sensing.** https://internt.slu.se/nyheter-originalen/2021/12/laserskanning-kartlagger-platser-dar-bartillgangen-bor-kunna-vara-god/ — “Vi har använt Riksskogstaxeringens blåbärs- och lingondata från hela Sverige”; “mest blåbär kan hittas i skogar med en krontäckningsgrad på cirka 50 procent, medan lingontillgången är bäst i glesare skogar och på hyggen med öppen krontäckning.” The approximately 50% is a reported empirical result for berry availability and that predictor, not a proposed normalized model constant.
- **S8 — Svampguiden, Karljohan.** https://www.svampguiden.com/sv/art/245630-karljohan — “Växer i barr- och lövskog över hela Europa.”
- **S9 — SLU-issued press release hosted by Mynewsdesk.** https://www.mynewsdesk.com/se/sveriges_lantbruksuniversitet__slu/pressreleases/hjortron-blommar-paa-alnarps-myrar-73894 — “Att odla hjortron på befintlig myrmark”; “Frost under blomningen”; “Problem med otillräcklig pollinering”. Historical cultivation/research communication; no universal quantitative frost threshold supplied.
- **S10 — Svenska Botaniska Föreningen, mire teaching material.** https://svenskbotanik.se/wp-content/uploads/2024/05/myrmarker-230523.pdf — “Mosse: Får bara nederbördsvatten, näringsfattig”; “Mosseplan med tuvor och höljor”; “Hjortron”. The latter are slide labels/images, not a fitted habitat study or proof of an exclusive bog requirement.
- **S11 — Visit Umeå, regional tourism source, supplementary only.** https://visitumea.se/en/hjortron — “The plants like moist soil, acidic conditions and lots of sunshine”; “ripen from mid-July to mid-August”. Do not treat this regional description as scientific parameter calibration.

### Artfakta availability limitation

SLU Artfakta species records found: hjortron https://artfakta.se/taxa/223136 and lingon https://artfakta.se/taxa/221160 . Retrieved text contained application/browser boilerplate rather than ecology. These are identification/discovery links only, **not** verified supporting ecology quotations. Remaining species evidence therefore uses accessible SLU and Swedish specialist sources; a complete primary-source account of pH, tree host lists and quantitative phenology remains a research gap.

## Hjortron: wetland is not synonymous with peat mire

Naturvårdsverket: https://www.naturvardsverket.se/amnesomraden/vatmark/vad-ar-vatmark/ — “Exempel på våtmarker är mossar, kärr och fukthedar.” Its wetland groups include “Myrar”, “Strandvåtmarker” and “Övriga våtmarker”. Thus a wetland flag alone cannot identify the peat-mire habitat represented by hjortron sources.

NMD documentation to match against the actual dataset/version before implementing: https://www.naturvardsverket.se/contentassets/37e8b38528774982b5840554f02a1f81/produktbeskrivning-nmd-2018-basskikt-v2-2.pdf (class definitions in Appendix 2), and https://geodata.naturvardsverket.se/nedladdning/marktacke/NMD2023/Basskikt_v0_x/NMD2023_Produktbeskrivning_Basskikt_NMD2023_v01.pdf . Do not silently substitute class codes across versions. Combine NMD context with independently documented peat/mire or soil data, wetness, openness and local validation; neither all wetland nor all peat is necessarily productive hjortron habitat. Include wooded mire as a possible context rather than an absolute open-only exclusion.

## Confirmed product-semantic error — official legend checked 2026-10-20

The official [SLU product description, page 2](https://www.skogsstyrelsen.se/globalassets/sjalvservice/karttjanster/geodatatjanster/produktbeskrivningar/markfuktighetskarta-slu---produktbeskrivning.pdf) has now been downloaded and read directly. It defines **1=dry–mesic, 2=mesic–moist, 3=moist–wet, 4=open water**. It does not define class 5 as wet ground. The text is retained in `soil-class-source-2026-10-20.txt`.

Therefore the conditional concern below about discarding wet class 5 is **not a confirmed defect** and must not guide a replacement mapping. The confirmed error is **4→95 representing open water as high soil wetness**; 15/45/70/95 are custom scores, not official continuous estimates. No production mapping or data has been changed. Class 3 already includes wet ground. Before reload, exclude open water from soil averaging, retain valid-ground and water fractions, and verify padding/NoData for every source product. Prefer the separately documented continuous 0–100 product if its actual coverage and encoding pass inspection.

### Earlier conditional warning — superseded by the official legend above

`scripts/load-slu-rasters.sh:61–63` says class 5 = blöt but sets:

```text
SOIL_LUT="0:255,1:15,2:45,3:70,4:95,5:255,255:255"
```

Lines 123–140 document/map 255 to nodata and average with `-srcnodata 255`; line 141 averages to 2 km. **Under this class interpretation, class-5 wet habitat is discarded**, not represented as high wetness. Mixed cells average only retained pixels, potentially biasing them drier; all-excluded cells become nodata and are omitted from emitted rows (lines 149–151). This can remove an important candidate hjortron habitat stratum. The SQL prediction paths found also fall back to weather moisture when `soil_wetness IS NULL`; fallback is not evidence that the ground is unsuitable or adequately represented. Do not assert all existing database cells are affected without inspecting provenance/reloads.

**Important: verify the exact raster legend before changing the LUT.** SLU's current catalogue describes its classified map as THREE classes: “blöt-fuktig, fuktig-frisk och frisk-torr”, plus a separate 0–100 product: https://www.slu.se/miljoanalys/statistik-och-miljodata/miljodatakatalogen/slu-markfuktighetskartor/ . SLU's field wetness classification uses FIVE: “torr, frisk, frisk-fuktig, fuktig och blöt”: https://www.slu.se/om-slu/organisation/institutioner/mark-miljo/miljoanalys/markinfo/standort/markfuktighet/ . A field classification and a raster class code are not interchangeable. The script comment is evidence of intended mapping, not independent proof of feed semantics. Inspect actual feed/raster metadata and class frequencies, and distinguish real water/non-land/nodata from valid wet ground. Do not blindly change `5:255` to `5:100` on unverified data.

## Recommended decisions

### Supported now (conceptual/data-quality changes, no code changed)

1. Label all current optima/tolerances unvalidated heuristics; remove claims that scores are calibrated probabilities or sourced ecological optima.
2. Verify feed legend, retain valid blöt habitat separately from nodata, carry coverage/valid-pixel fractions, and re-ingest/recompute only after confirmation. Do not turn nodata into dry/zero habitat. Preserve wet-area proportions rather than only a 2-km mean.
3. For hjortron, permit open and wooded mire context; add peat/mire evidence rather than an indiscriminate NMD-wetland boost. Avoid making a nonzero timber-volume optimum a prerequisite for treeless mire.
4. Add explicit forest/host contexts for fungi without universal exclusive-spruce rules; represent light/canopy/edge structure separately from timber volume. Support relatively more open lingon fruit habitat than blåbär fruit habitat, not an exact difference in forest scores.
5. Separate static occupancy/habitat from annual fruiting/berry yield and ripeness. SLU supports antecedent mushroom weather, and hjortron flowering frost/pollination risk, but not arbitrary universal °C cutoffs.

### Requires data fitting or further direct evidence

- **All** replacement numerical moisture and forest optima, tolerance widths, tree weights, interaction strengths, weather/soil blend weights (including existing 0.6/0.4), lag lengths, season dates and temperature response curves.
- Establish predictor units and meaning first: ordinal wetness classes, a continuous wetness estimate, weather moisture, timber volume, and crown cover are different variables. Their arbitrary normalized averages have no direct scientific optimum.
- Fit species-specific, potentially nonlinear responses to representative field presence/absence or abundance data; if using opportunistic records, account for observation effort/detection and sampling bias, and do not mistake non-records for absences.
- Validate by spatially separated regions and held-out years; stratify hjortron evaluation by mire type and wetness/coverage, and distinguish plant cover from berry counts. Report uncertainty and compare against a transparent heuristic baseline before claiming improvement.

This source review is retained as an audit document outside the application execution path. Production profiles and loaders have not been modified.
