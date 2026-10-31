# M0 composition qualification ledger — pending

Status: **RECORDED_NONPRODUCTION_QUALIFICATION**. The exact five-component
composition passed live controls and cleanup. The populated ledger binds its
candidate, report, archive and component hashes. [The pending ratification
proposal](m0-ratification-proposal.md) explains the scope and remaining decisions.

Evidence is retained in the content-addressed archive committed at
fddabb4ef31715fcdb9d94854a79f867e894383d; the ledger's URL pins those immutable
bytes. This repository copy does not guarantee indefinite hosting or backup.
Publisher binaries/signatures remain separate independently pinned inputs.
M0 acceptance, M1 admission and all specialist approvals remain pending. The
historical pending ratification files are preserved unchanged.

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
# The populated ledger requires the original extracted composition directory:
node tools/check-composition-qualification.mjs LEDGER_JSON RETAINED_EVIDENCE_DIRECTORY
pnpm test:unit
pnpm check
```

Uppercase arguments are explicit local paths. The checker downloads, extracts,
signs, uploads and publishes nothing. It verifies report,
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
review/evaluation remain mandatory. Tests use synthetic negative fixtures and
extract the independently hash-pinned actual archive in temporary storage to
check its ledger and proposal bindings.

Changes to the selected composition require new qualification and a new ledger
revision; never edit historical evidence bytes to fit it. Final authenticated
ratification is M0-REL-PR4 work after the actual composition and all required
approvals exist. Legal/security and operational decisions remain pending; the
acceptance publication workflow remains disabled and undispatched.
