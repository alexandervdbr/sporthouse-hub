-- DO NOT RUN THIS until 0025 is applied AND the app has been confirmed
-- working end-to-end against it (Wachtwoorden loads, add/edit/delete all
-- round-trip correctly through get_credentials()/upsert_credential()/
-- delete_credential()). This is the point of no return for the old
-- plaintext column — once dropped, only password_encrypted remains.
--
-- Sanity-check first that every row actually got encrypted (should return
-- zero rows — if not, the Vault secret wasn't set before 0025 ran, or ran
-- after some rows were inserted without it; re-run 0025's backfill step
-- for any row this returns):
--   select id, platform from credentials where password_encrypted is null;

alter table credentials drop column if exists password;
