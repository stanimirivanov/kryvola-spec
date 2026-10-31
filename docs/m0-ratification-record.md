# Successor ratification record consistency

M0-REL-PR4.1 adds an administrative checker only. Actual composition qualification,
reviewer decisions and ratification remain pending. No approved record is seeded.

Run from Spec with explicit local paths:

```sh
node tools/check-approved-ratification.mjs RECORD_JSON EVIDENCE_DIRECTORY
```

The record has exactly version=1, status (PROPOSED_SUCCESSOR or RECORDED_SUCCESSOR),
scope (the existing M0 closure scope), predecessor_sha256, proposal_revision,
ledger_sha256, ratification_sha256, packet_sha256, reviews and four false flags:
production_ready, profile_enabled, m0_accepted and m1_admitted. PROPOSED_SUCCESSOR
has empty reviews. RECORDED_SUCCESSOR requires all eight role references, each
containing role, decision_sha256 and bundle_sha256. Neither status authenticates.

predecessor_sha256 binds the entire exact docs/m0-ratification-decision.md bytes.
The existing pending checker also checks frozen history. Never edit predecessor
files or reuse the pending null-composition packet for an actual composition.

The evidence directory contains ledger.json, composition/ (the original retained
composition directory), ratification.json, review-packet.json, legal.json,
admitted-candidate.json and generated/manifest.json. Recorded outcomes additionally
require reviews/ROLE-SLUG.json and reviews/ROLE-SLUG.sigstore.json. Paths are bounded,
regular non-symlink files through the existing evidence reader. The composition
ledger must be populated and pass its retained-byte checks, not merely be pending.

Ratification and packet shapes follow Platform docs/m0-acceptance.md. The packet
binds exactly its nine mandatory subjects: candidate.json, admitted-candidate.json,
selection.json, model.json, measurement.json, ratification.json,
composition-report.json, legal.json and generated/manifest.json. Additional review
subjects require a reviewed extension to this checker. Payload status
RATIFIED_FOR_M0_NONPRODUCTION in a proposal is proposed future content, never a
claim that ratification has happened. Proposed legal text likewise grants no rights.

proposal_revision identifies the immutable proposal/payload commit, not the future
commit recording signatures. The admitted candidate references that revision.
The final record references packet and decision hashes but is not itself a packet
subject. Freeze proposal bytes, then admitted candidate bytes, then packet, then
signed decisions, then final record. This avoids self-referential hashes.
Verification of the Git revision's actual contents and independent policy binding
belongs to PR4.2; this checker validates revision syntax and cross-file equality.

Exit zero means CONSISTENT_NOT_AUTHENTICATED, always with authenticated=false and
M0/M1/production flags false. Exit one returns SUCCESSOR_RECORD_REJECTED. No default
record, clock override, network, signing or writes are provided. Signature bundles
are hashed as opaque bytes. Identity authority, decision timestamps, revocation,
cryptographic verification, full candidate semantics and acceptance remain existing
Platform responsibilities and PR4.2 integration work. The archive remains subject
to the documented composition-ledger limitations. This is not a public wire schema
or canonical signing format and introduces no dependency.

Tests use synthetic observations and deliberately non-signature bundles. Run
`node --test tests/approved-ratification.test.mjs` and the existing `pnpm check`.
