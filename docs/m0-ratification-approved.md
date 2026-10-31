# M0 ratification — reviewed non-production baseline

Decision: **RATIFIED_FOR_M0_NONPRODUCTION**, under SOLO_OWNER_AGENTIC_V1.
This is the actual successor decision for M0-REL-PR4.4, not a proposed eight-role
approval. It records the owner's explicit approval of the exact qualified fake-only
baseline and the agentic report, including their exclusions and residual risks.

The owner decision is [comment 6547394306 on Spec PR #54](https://github.com/stanimirivanov/kryvola-spec/pull/54#issuecomment-6547394306),
by stanimirivanov, binding reviewed commit
597e09474381c2b66f1c091f751c25458fe724e8. The [record](m0-ratification-approved.json)
binds the original [owner comment](m0-ratification-approved.approval.json),
[verification result](m0-ratification-approved.verification.json),
[agentic review](m0-solo-review/agentic-review.json), exact subject and predecessor.
The owner has accepted this scoped baseline for subsequent M1 development. This
record is not a runtime admission token, deployment permission or signed acceptance
publication. No additional eight-role signing ceremony is required for this path.

## Exact scope and evidence

- Candidate: bbfafdfc85f0bf41f90b6cd520f0fac5fb44eabcbf59507e411db1fb5f9fbf01.
- Composition: 3085d512c596513c29f701ad1f90543e3114ee65eae6c7e588d05ce37cc6a909.
- Subject: 348f32c09322ee0da99fd7cf941f98778ccd0e8bbdb3bbb33f6ebc8d11917fce.
- Agentic report: d9028c74a69c50f9fd74f76e2a870810211da45547901051a72d697d1e9d00eb.

The [ledger](m0-composition-qualification.json) and its retained archive identify
all five published artifacts, the fixed preview.10 contract and original live
reports/cleanup. The owner approved the report's compatibility PASS and explicitly
limited security, dependency/licensing and operations conclusions. Synthetic
model/measurement placeholders remain synthetic; this is not actual crypto
performance, general model accuracy, production security or service SLO evidence.
TFHE/SP1 distribution/commercial-service permissions remain DENY. No legal clearance
or parameter certification is inferred, and the unsigned candidate stays disabled
with its original legal UNRESOLVED field. The historical intended_use string ending
"approvals pending" is retained as exact reviewed bytes, not current decision state.

## Verification and history

The record pins the exact Platform verifier commit and independent operator-policy
snapshot digest used for the actual live GitHub/publisher/composition verification.
That policy snapshot was valid at verified_at and expires at its recorded UTC
valid_until. This is a historical verification event, not perpetual authentication.
Current use requires the live gate and fresh independent revocation/expiry policy.

Platform compatibility fix PR #45 was reported open by the GitHub API during this
work. Verification used its exact tested commit
4d302833b5b013c3aaf171ccd91b116af102eb05. Merge that fix before relying on main's
verifier on this host; its CRLF/gh compatibility changes do not alter reviewed
subject or report bytes. This record does not claim that pending dependency merged.

The pending ratification, closure convention, proposal payload, ADR 0003 and pending
policy template are preserved unchanged as history. ADR 0004 explicitly authorizes
the separate solo-owner process. The new record has m0_ratified=true; acceptance,
M1 runtime admission, production/profile and deployment flags remain false.

```sh
node tools/check-solo-ratification.mjs
pnpm check
```

The local checker returns CONSISTENT_HISTORICAL_SOLO_RATIFICATION with
authenticated=false. It checks identities, exact file hashes, scope and temporal
relationships; it does not contact GitHub or rerun qualification/signatures. The
public result snapshot is evidence, not a signed attestation or public wire schema.
The independent operator policy and publisher binaries remain outside this record.

Withdrawal or substantive changes require a visible successor and updated current
policy; never erase the original owner comment or rewrite historical signed bytes.
Reverting this documentation alone does not revoke the GitHub approval. No acceptance
artifact was prepared, signed or published, and no publisher workflow was dispatched.
