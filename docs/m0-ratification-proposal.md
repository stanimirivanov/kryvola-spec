# M0 ratification proposal — awaiting decisions

Status: **PROPOSED, NOT RATIFIED**. The adjacent JSON freezes proposed future
ratification payload bytes for review. Its evaluator-required
RATIFIED_FOR_M0_NONPRODUCTION value is proposed content, not a statement that any
reviewer approved it. The empty conditions list proposes unconditional closure;
it does not erase future conditions or grant legal/security permission.

## Exact tested subjects

- Tested candidate SHA-256: bbfafdfc85f0bf41f90b6cd520f0fac5fb44eabcbf59507e411db1fb5f9fbf01.
- Composition report SHA-256: 3085d512c596513c29f701ad1f90543e3114ee65eae6c7e588d05ce37cc6a909.
- Evidence archive SHA-256: e78910cc4c43bff31ac2ce6ff6834859b676e12d1e0596433ecc6f16ddde83c4.
- Spec publisher: 12f20a9324d2e8069c16a2ab41f10999e14d2d55; consumed contract source
  1a5b57a590487ba116913050af8041f5e5f1fb52, preview.10.
- Fabric source: f02281ffa78decb6acd032c102359bf758f92a3a.
- Engines source: f8023959081fa6a1e8169b41ef427630a5da72f3, existing fake archive.
- ML source: 68f949516b450a77eb30229ac2d1f92e6e4ad740.
- Platform source: b9993e98ef534039f8f8bbdd5346aa6363a9d7ed.

The [qualification ledger](m0-composition-qualification.json) records exact artifact
identities and an immutable evidence-commit URL. The archive contains original
candidate/lock/selection/model/measurement, four live reports, observation journal
and composition report, with no publisher binaries or raw credential-bearing logs.
Retained JSON/archive bytes are verifier-owned evidence: do not reformat them.
The source wheel imports and driver archive were checked against this exact set;
live service, replay, network, isolation and admission controls passed and the
owned fixtures were removed. This is host-trusted non-production evidence.

Publication runs: [Spec](https://github.com/stanimirivanov/kryvola-spec/actions/runs/41176386895),
[ML](https://github.com/stanimirivanov/kryvola-ml/actions/runs/41176105193),
[Platform](https://github.com/stanimirivanov/kryvola-platform/actions/runs/41176388833).
Platform passed after one readiness retry; ML signed after one transparency-log
conflict retry. These outcomes do not establish specialist review authority.

## Pending inputs and signing order

All eight reviewer decisions remain pending. No legal.json with an approved
parameter disposition, admitted candidate, final review packet or signatures is
created by this proposal. Reviewers still need the exact dependency/parameter
bindings, proposed exclusions and operational disposition. TFHE/SP1 permissions
remain denied. Synthetic model/measurement inputs retain SYNTHETIC_FIXTURE/NONE
labels; they are not actual inference, SLO or cryptographic security measurements.

Merge this PR with a merge commit preserving the initial evidence commit. Do not
squash or rebase it: that can orphan the commit used by the ledger URL. If a
different merge strategy is required, establish a retained immutable reference
and update the ledger before freezing the proposal. Repository retention and
backups remain operator responsibilities.

After this proposal is merged, independently select the immutable commit containing
these proposal and ledger bytes as proposal_revision. Use that revision in the
admitted candidate, then fix the final packet and collect the eight decisions.
Never embed this file's own future commit hash, packet hash or signatures in the
payload. The later recorded successor references the proposal revision and exact
pending predecessor without changing historical evidence. If proposed subjects
change, freeze a new revision and renew affected decisions.

Structural proposal tests and ledger checks can run now. The full PR4.1 successor
checker additionally needs the final legal/admitted-candidate/packet inputs, which
remain pending; the PR4.2 authenticated gate needs actual decisions and independent
trust. Their absence is an explicit blocker, not a successful ratification check.
No production profile, M0 acceptance or M1 admission is enabled. No acceptance
artifact is prepared, signed or published.
