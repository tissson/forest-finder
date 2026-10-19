# Discovery AI
- [ ] Complete seven sourced Wikimedia photo tests: four clean positives and one mixed-berry rejection reported; clean bilberry, cloudberry and fly agaric blocked by Wikimedia HTTP 429 (Retry-After 600s).
- [x] Move identification and discovery registration to the metadata-stripping server function; reject none and low confidence (nine tests pass).
- [x] Revoke authenticated execution of both registration RPCs and direct discovery INSERT; effective grants verified false.
- [ ] Verify signed-in upload, mismatch confirmation, one-time registration and saved-photo readback — blocked: no auth users; session minting cannot sign in.
- [ ] Obtain approval of permanent confidence threshold — waits for complete photo trial and Patrik's decision; 0.70 remains provisional.