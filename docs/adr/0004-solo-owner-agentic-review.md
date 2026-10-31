# ADR 0004: solo-owner governance with agentic review

Status: adopted governance direction, 31 October 2026, following the project owner's
explicit instruction to simplify the process. **Actual M0 owner approval is pending.**
This decision changes the review process; it does not approve the candidate.

## Decision and scope

For the solo-developed fake-only non-production M0 baseline, use one consolidated
agentic report and one explicit owner approval. The report covers all five
repositories and compatibility, security boundaries, dependency/licensing concerns
and operational limitations. Record findings, unresolved blockers, residual risks,
limitations and exact reviewed subjects. An unresolved technical blocker rejects
the gate; documented limitations require the owner's explicit decision.

SOLO_OWNER_AGENTIC_V1 is a separate versioned administrative path. It supersedes
ADR 0003's proposed eight-role ceremony only for this scope. Preserve ADR 0003,
closure records, pending ratification, proposal payloads, signed historical bytes
and the original eight-role verifiers. Never synthesize eight approvals under the
owner's identity or reinterpret old signatures under the new policy.

The new path retains publisher signature verification, exact source/artifact pins,
clean/installed-byte qualification evidence, live negative controls and cleanup.
It does not require reviewer keys, eight decision files or a signed admitted
candidate. The tested unsigned candidate remains UNQUALIFIED/disabled with legal
UNRESOLVED. Agentic review is not independent specialist certification, legal
clearance or cryptographic parameter approval. TFHE/SP1 distribution and commercial
service permissions stay DENY; no production profile or deployment is authorized.

## Subject, agentic report and owner decision

The local v2 solo-subject.json binds governance, scope, intended use, tested candidate,
composition report, selection and proposed exclusions. production_ready and
profile_enabled stay false. Composition hashes bind the retained model, synthetic
measurement, component identities, reports and all retained subject bytes.

The v1 agentic-review.json names its reviewer and exact subject digest, lists all
five repositories, and has PASS/LIMITATION plus a summary for each review domain,
empty blockers and nonempty residual_risks/limitations. Preserve the distinction
between tool evidence and the agent's judgment. Do not claim tests that were not
run. The owner must see the report and its limitations before approving it.

An independent operator policy pins both hashes, intended use, composition,
selection, owner GitHub login, review PR/revision, exact approval comment ID and
trust expiry and a current revoked-comment ID list. Policy is never enrolled from incoming review files. Ownership of
credentials and expected GitHub identity remains the operator's responsibility.

The owner's explicit PR **comment** is the approval channel: GitHub does not let
an author approve their own PR using an approving review. The gate reads the live
PR and comments via authenticated GitHub CLI. Generic merges, passing CI, thumbs-up,
PR authorship and a request to implement work supply no candidate approval.
The approving comment must bind the exact subject and report digests, intended
use and reviewed PR revision using this body:

```text
KRYVOLA_SOLO_OWNER_APPROVAL_V1
subject_sha256=EXACT_SUBJECT_SHA256
agentic_review_sha256=EXACT_REPORT_SHA256
intended_use=EXACT_INTENDED_USE
reviewed_revision=EXACT_REVIEWED_COMMIT
```

The latest owner comment beginning KRYVOLA_SOLO_OWNER_ controls the decision.
A later KRYVOLA_SOLO_OWNER_WITHDRAW comment invalidates the earlier approval;
deleting the approval or changing its body, a changed PR head, missing evidence
or expiry fails closed. Keep withdrawal IDs in independent policy: deleting a
withdrawal can hide it from the API and cannot be detected from surviving comments alone.
Ordinary unrelated comments are ignored. The agent must never post the owner's
approval for an instruction merely to implement or review work.

No approval comment, public key, owner-approval policy or positive approval record
is seeded by this ADR. The owner posts approval only after reviewing a concrete
pack; tools cannot establish whether a human or agent used that GitHub account.

## Transition and verification

Platform tools/solo_m0_review.py is the companion v2 gate. It reuses the existing
composition/publisher verification, rather than weakening or modifying historical
approval semantics. It returns eligibility for M0 ratification only after the
actual owner comment and qualified evidence verify. It does not emit an acceptance
artifact, admit M1, activate profiles or change persistent state. An eventual
solo-governance ratification is a new record explicitly citing this ADR and the
review result, not an edit to the historical proposal or eight-role successor.

The existing eight-role acceptance publisher remains incompatible with this v2
path and disabled. Supporting future acceptance publication requires a separate
explicitly authorized versioned change; it must not translate solo approval into
legacy specialist/legal assertions. Changing subjects requires a new report and
renewed approval. Existing qualified artifact versions remain reproducible inputs;
this governance implementation does not retroactively change tested driver bytes.
