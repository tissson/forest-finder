# Wikimedia identification trial — 2026-10-19

Model: `google/gemini-3.8-flash`, Lovable AI Gateway chat completions (zero retention surface).
Actual calls used `identifyDiscoveryImage` from the application after `stripJpegMetadata`; no supplied species or filename reached the model. Outputs were streamed and validated locally. The compatible adapter uses JSON mode for Gemini, not an enforced upstream schema; invalid or unknown outputs cannot register discoveries.

| Intended subject | Model output | Confidence | Wikimedia source |
|---|---|---:|---|
| Kantarell | kantarell | 0.99 | https://commons.wikimedia.org/wiki/File:Chanterelle_Cantharellus_cibarius.jpg |
| Trattkantarell | trattkantarell | 0.98 | https://commons.wikimedia.org/wiki/File:Trompetenpfifferling_Craterellus_tubaeformis.jpg |
| Blåbär alongside odon (mixed comparison, not a clean positive test) | none | 0.95 | https://commons.wikimedia.org/wiki/File:Vaccinium_myrtillus_vs_Vaccinium_uliginosum.JPG |
| Lingon | lingon | 0.98 | https://commons.wikimedia.org/wiki/File:Vaccinium_vitis-idaea_004.JPG |
| Karl Johan | karl-johan | 0.98 | https://commons.wikimedia.org/wiki/File:B._edulis.jpg |
| Hjortron | NOT TESTED | — | Planned: https://commons.wikimedia.org/wiki/File:Rubus_chamaemorus_close-up.JPG |
| Other mushroom: flugsvamp | NOT TESTED | — | Planned: https://commons.wikimedia.org/wiki/File:Amanita_muscaria_fly_agaric.jpg |

Remaining downloads returned Wikimedia HTTP 429 with Retry-After: 600 seconds; some attempts returned HTTP 403. No artificial photo or substituted model was used. The mixed bilberry picture was visibly inspected and is not counted as a successful bilberry test. A clean bilberry photo is still required.

Actual usage (input/output tokens): kantarell 1370/147; trattkantarell 1348/188; lingon 1332/96; Karl Johan 1332/198; mixed berries 1332/798. Catalog rates: $0.75/million input and $3.75/million output. Approximate cost range for these calls: $0.00136–$0.00399 each, before currency conversion.

## Access checks after migration

| Function | authenticated EXECUTE | anon EXECUTE | service_role EXECUTE |
|---|---|---|---|
| log_species_discovery(bigint,bigint,text,double precision,text,text) | false | false | true |
| commit_verified_discovery(uuid,uuid,bigint,bigint,text,text) | false | false | true |

Direct authenticated INSERT into user_discoveries and discovery_identifications: false. Confirmation consumes a server-owned identification exactly once, checks ownership, expiry and selected species, and uses stored confidence. No discovery row is created for `none`, even confidence 1.00.

Nine automated tests pass (five identification rejection/threshold rules, four metadata rules). Latest automatic build: OK. Browser check: signed-out camera navigation opens /auth without page errors.

## Unverified / approval gate

No auth accounts exist, and session minting returned that there is nobody to sign in as. Signed-in upload, mismatch confirmation, final saved-photo readback and one-time registration have NOT been verified end-to-end.

0.70 is provisional, not approved as permanent. Seven selected photographs cannot calibrate a probability or establish food safety; confidence is the model's self-assessment. Clean bilberry, cloudberry and other-mushroom tests remain outstanding.