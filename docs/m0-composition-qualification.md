# M0 composition qualification ledger — pending

Status: **PENDING_QUALIFICATION**. No actual five-component set or successful live
composition report has been supplied. Spec, ML and Platform publications remain
missing from the inspected release inventory. Existing Fabric/Engines publications
match Platform's embedded pins, so M0-REL-PR2 was skipped. This record supplies no
approval, ratification, acceptance or M1 admission.

M0-REL-PR3 provides the administrative ledger/checker and synthetic test coverage.
Recording actual qualification remains blocked on independently selected published
artifacts, operator inputs, a successful live run and durable evidence retention.
The null fields in m0-composition-qualification.json deliberately avoid invented
sources, hashes, measurements or cleanup outcomes. A passing pending consistency
check does not close this operational blocker.

## Procedure and boundaries

Follow Platform's docs/m0-release-qualification.md at the exact selected release
source. Its existing candidate assembler and composition qualifier verify the
publishers, clean driver checkout, exact installed wheels, compatibility pins,
fresh live controls and cleanup. Do not replace those checks with this ledger.
No Spec source imports Platform implementation and no public schema is introduced.

After an authorized successful run, propose a reviewed ledger update with status
RECORDED_NONPRODUCTION_QUALIFICATION. Copy the five components exactly from
report.json, its candidate_sha256 and input_lock_sha256, and cleanup_verified=true.
Set report_sha256 to the hash of the original report bytes. evidence contains
archive_sha256 for evidence.tar and an operator-selected durable HTTPS reference
ending in #sha256=THE_ARCHIVE_SHA256. Use an immutable/version-addressed location;
latest/main/master references and credentials/query strings are rejected. This
syntactic guard cannot establish server immutability, availability or retention.

All three production_ready/m0_accepted/m1_admitted flags remain false. Keep the
original pending records and unsigned candidate/lock unchanged. Retain original
publisher binaries, signatures and independent trust separately; evidence.tar does
not embed them. Do not store credentials or confidential review material here.

From the Spec repository root:

```sh
# Checked-in pending ledger consistency only; no evidence is read:
node tools/check-composition-qualification.mjs
# Populated ledger requires the original extracted composition directory:
node tools/check-composition-qualification.mjs LEDGER_JSON RETAINED_EVIDENCE_DIRECTORY
pnpm test:unit
pnpm check
```

Uppercase arguments are explicit local paths. No command downloads, extracts,
executes artifacts, signs, uploads or publishes. The checker verifies report,
archive, candidate, lock and all retained subject hashes; component/source and
cleanup claims must agree. It rejects symlinks in the evidence tree, unsafe paths,
missing files and oversized inputs. A nonzero result is failure. Pending records
exit zero with evidence_checked=false; populated consistent records return
recorded status with authenticated=false. Neither is an acceptance gate.

The archive is hashed as an opaque retained object, not extracted or compared
member-by-member to the directory. HTTPS locations are not fetched. JSON fields
are administrative consistency inputs, not a canonical signing protocol. This
checker does not authenticate publishers/reviewers, rerun live controls or prove
host observations trustworthy. Platform's independent re-verification and final
review/evaluation remain mandatory. Tests use fabricated temporary evidence only.

Changes to the selected composition require new qualification and a new ledger
revision; never edit historical evidence bytes to fit it. Final authenticated
ratification is M0-REL-PR4 work after the actual composition and all required
approvals exist. Legal/security and operational decisions remain pending; the
acceptance publication workflow remains disabled and undispatched.
