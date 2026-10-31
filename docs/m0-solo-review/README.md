# Owner review package — approval pending

Read [the agentic report](agentic-review.json), [the exact subject](solo-subject.json)
and [the qualified proposal](../m0-ratification-proposal.md). This package requests
one owner decision under [ADR 0004](../adr/0004-solo-owner-agentic-review.md).
It contains no approval, ratification, signed admitted candidate or acceptance
artifact. A merge, passing CI or instruction to prepare this package is not approval.

## What you would approve

The exact tested fake-engine non-production composition is suitable as an M0
technical baseline for subsequent development, subject to the listed exclusions,
limitations and residual risks. The review found no unresolved technical blocker
within that narrow scope. It does not grant production, deployment, M1 admission,
TFHE/SP1 distribution/service permission, legal clearance or cryptographic assurance.
The resulting gate establishes eligibility for a later solo ratification record.

Compatibility checks passed; security, dependency/licensing and operations are
LIMITATION findings, not universal passes. The report distinguishes live evidence
previously obtained from the binding/signature re-verification performed now.
Original reports are retained in the ledger's immutable evidence archive. The
selected qualified artifacts have not been upgraded to the new governance code.

The subject's intended_use preserves the original qualification-time string ending
"approvals pending". This is intentional hash preservation, not a request to keep
your eventual decision ambiguous. Your explicit comment is the decision channel.

## How to make your decision

1. Review the two JSON files and listed risks. Confirm the five component identities
   against the populated qualification ledger and the original retained reports.
2. Check the PR diff and verification. If you require changes, request them instead
   of posting approval. New subject/report bytes require renewed hashes and review.
3. Obtain the exact head SHA of this package PR (replace PR_NUMBER):

   ```sh
   gh pr view PR_NUMBER --repo stanimirivanov/kryvola-spec --json headRefOid
   ```
4. When satisfied, personally post the exact owner approval comment supplied in
   this PR's description. It binds subject/report hashes and that head SHA. Do not
   substitute a generic Approve review (GitHub forbids reviewing your own PR),
   merge, thumbs-up or request for an agent to approve under your account.
5. Tell the agent the comment URL. It will pin the comment ID in a separate local
   operator policy and run the existing live GitHub/qualification verifier. It
   must not edit this PR to insert its own future commit SHA or comment ID.

A comment is optional: you may reject, request changes or defer. To withdraw an
approval, post KRYVOLA_SOLO_OWNER_WITHDRAW and keep its original approval ID in the
independent revoked_comment_ids list. Deleting a withdrawal can hide it from API
history, so maintain revocations independently. Changed PR heads invalidate approval.

## Operator handoff — no signing keys

operator-policy.pending.json is deliberately invalid for approval verification:
pull_request, reviewed_revision and approval_comment_id are null. Independently
confirm the owner login/repository, both hashes, intended use and proposed trust
expiry before adopting it as operator policy. The proposed expiry is
2026-11-07T23:59:59Z; it is a limited validation window, not an approval assertion.
Never derive identity/key authority automatically from incoming evidence.

The local request directory contains the original composition/ directory and
byte-for-byte copies of solo-subject.json and agentic-review.json. Original publisher
assets remain separate. After the owner posts approval, fill the three null policy
fields in a local copy, then run from Platform with the merged verifier:

```sh
uv run --locked --extra conformance python tools/solo_m0_review.py --request REQUEST --assets VERIFIED_ASSETS --policy OPERATOR_POLICY
```

The uppercase paths identify the local request, five original asset directories
and independently adopted policy. Use executable workspace temporary storage if
the host disallows Cosign execution under /tmp. Missing/pending approval must
produce SOLO_OWNER_REVIEW_REJECTED and exit 2. Success is eligible-for-ratification
only; no acceptance artifact is prepared or published by this process.
