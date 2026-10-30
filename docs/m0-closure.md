# Proposed M0 closure and review convention

Status: proposed; M0 remains blocked. This is the M0-CLOSE-PR1 review packet,
not ratification. The approved design/plan remain authoritative. Human reviewers
must explicitly accept or reject the scope and exclusions below.

## Proposed acceptance claim

M0 closure would approve the exact contract/feasibility baseline and a signed,
tested five-component non-production composition for subsequent M1 development.
It would not enable a crypto profile, deployment or production inference. The
composition must identify spec, fabric, engines, ML and platform source revisions,
artifact digests, publisher evidence, consumed contract bundles and current-run
conformance/isolation reports. A fixture manifest or source checkout cannot stand
in for a published component. Fake-engine measurements cannot describe TFHE service
performance. Research measurements remain separately identified evidence.

## Required decisions and exclusions

All five repository leads review ownership and compatibility. Security reviews
trust, leakage, custody and parameter assumptions; legal reviews exact dependencies,
patent/distribution/service rights and intended use; the operational owner reviews
the measured envelope, recovery limits and retained evidence. Each role requires
an explicit identity and authority; one person may cover multiple roles only when
that authority is recorded separately. Nomination, a merge or a passing test is
not approval. Rejections and conditional decisions remain blockers until resolved.

The proposed exclusions require explicit review, not automatic acceptance:

- Real owner-to-owner transport/cache latency and durable inference are M1 work.
  Warm p95 <=5 s and cold p95 <=15 s remain proposed, unmeasured objectives.
- GPU/PBS statistics, alternate proof exports and private-witness proof claims
  remain unavailable or disabled. Public SP1 Core research is not zero knowledge.
- TFHE/SP1 distribution and service permissions stay DENY until an authorized,
  use-specific successor disposition permits them. Research approval is narrower.
- The integer circuit fixture supports exact arithmetic checks, not general model
  accuracy. Production isolation and security qualification remain later gates.

If these exclusions conflict with required M0 acceptance criteria, revise the
milestone boundary through explicit review; do not mark omitted work complete.

## Record and authentication boundary

The block below is a repository-local administrative convention, not a public
wire schema, canonical signing format or runtime API. Do not generate consumer
contracts from it. Its checker validates structure and candidate bytes only.
It always returns CONSISTENT_NOT_AUTHENTICATED, even for structurally populated
APPROVE rows. No pending record can admit M1 or activate production/profile flags.
A future public format must be authored/versioned through the existing spec stack.

A populated decision records identity, authority, intended use, HTTPS review link,
SHA-256 of exact retained evidence bytes, and SHA-256 of the exact review packet.
That packet must bind scope, contract/profile/ownership digests, relevant artifact
and composition identities, exclusions and conditions. The record's own future
hash is never a review subject. URLs and hashes do not prove authenticity: the
later platform verifier must authenticate evidence against independently configured
reviewer identities/roles, verify subject bindings, and check withdrawal/expiry.
Publication identity does not establish specialist review authority. Do not put
credentials, private keys or confidential review contents in this public record.

## Supersession and remaining gates

Preserve docs/m0-ratification.md and its frozen checker as historical evidence.
Store a successor as a new file; retain previous exact bytes. A successor names
the preceding record SHA-256 and a nonempty reason. It cannot silently change
scope or candidate pins under this convention; substantive changes require a new
review packet and invalidate affected approvals. Withdrawal must remain visible,
never overwrite accepted evidence or erase a rejection. The local checker checks
one predecessor binding, not authenticity or a complete decision history.

M0-CLOSE-PR2 supplies scoped crypto dispositions; PR3-7 supply publication and
publisher verification; PR8 authenticates reviews; PR9-10 resolve/test the exact
composition; PR11 records actual ratification; PR12-13 evaluate and publish final
acceptance. Those missing capabilities are gaps, not implemented by this packet.

Run `node tools/check-closure-record.mjs` for local consistency. The tests run in
`pnpm check` through the existing `tests/*.test.mjs` discovery. No dependency or
existing generated candidate bytes change.

## Pending review record

```closure-record
{
  "version": 1,
  "status": "PENDING_AUTHENTICATION_AND_ACCEPTANCE",
  "scope": "M0_CONTRACT_FEASIBILITY_AND_NONPRODUCTION_COMPOSITION",
  "contract_revision": "1a5b57a590487ba116913050af8041f5e5f1fb52",
  "candidate_digests": {
    "generated/manifest.json": "2df957464b4832b37624a61436786207042be1fde24dfc5c5e0d518d66882f35",
    "bindings/manifest.json": "8cc787ffa59de095ac2df92db453e8a84f57c2e0f2e57c4127bbc01c68486bc9",
    "generated/fixtures/fhe-q1-assurance.json": "267dee8330668952adf11fe00cd96d0c5a45217d17b714e4266485dfb6c48eb0",
    "docs/ownership.md": "b62be8e8f41fea699990e8dcae305197577f0702a3e0befaa73248d8eeb85128"
  },
  "production_ready": false,
  "profile_enabled": false,
  "m1_admitted": false,
  "composition_sha256": null,
  "reviews": [
    {
      "role": "Spec lead",
      "identity": null,
      "authority": null,
      "decision": "PENDING",
      "review_url": null,
      "evidence_sha256": null,
      "subject_sha256": null,
      "intended_use": null,
      "conditions": []
    },
    {
      "role": "Fabric lead",
      "identity": null,
      "authority": null,
      "decision": "PENDING",
      "review_url": null,
      "evidence_sha256": null,
      "subject_sha256": null,
      "intended_use": null,
      "conditions": []
    },
    {
      "role": "Engines lead",
      "identity": null,
      "authority": null,
      "decision": "PENDING",
      "review_url": null,
      "evidence_sha256": null,
      "subject_sha256": null,
      "intended_use": null,
      "conditions": []
    },
    {
      "role": "ML lead",
      "identity": null,
      "authority": null,
      "decision": "PENDING",
      "review_url": null,
      "evidence_sha256": null,
      "subject_sha256": null,
      "intended_use": null,
      "conditions": []
    },
    {
      "role": "Platform lead",
      "identity": null,
      "authority": null,
      "decision": "PENDING",
      "review_url": null,
      "evidence_sha256": null,
      "subject_sha256": null,
      "intended_use": null,
      "conditions": []
    },
    {
      "role": "Security reviewer",
      "identity": null,
      "authority": null,
      "decision": "PENDING",
      "review_url": null,
      "evidence_sha256": null,
      "subject_sha256": null,
      "intended_use": null,
      "conditions": []
    },
    {
      "role": "Legal reviewer",
      "identity": null,
      "authority": null,
      "decision": "PENDING",
      "review_url": null,
      "evidence_sha256": null,
      "subject_sha256": null,
      "intended_use": null,
      "conditions": []
    },
    {
      "role": "Operational owner",
      "identity": null,
      "authority": null,
      "decision": "PENDING",
      "review_url": null,
      "evidence_sha256": null,
      "subject_sha256": null,
      "intended_use": null,
      "conditions": []
    }
  ],
  "supersedes": null
}
```
