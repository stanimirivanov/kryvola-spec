import * as attempts from "../attempts/model.mjs";

export const bounds = Object.freeze({ workflowEpochs: 2, runs: 2, states: 100000 });
export const disclosureKey = "tenant/job/output/recipient/0";
function candidates() {
  let s = attempts.initial();
  for (const action of [
    "workflow-authorize",
    "ensure:1",
    "launch:1",
    "launch:1",
    "complete:1-1",
    "complete:1-2",
  ]) {
    s = attempts.step(s, action).state;
  }
  return s;
}
export const initial = () => ({
  workflowEpoch: 0,
  run: 0,
  compute: candidates(),
  selectedEpoch: null,
  suspended: false,
  cancel: "NONE",
  revoked: false,
  evidence: null,
  authorization: null,
  ledger: [],
});
export const operationKey = (s) => `tenant/job/plan/stage/${s.workflowEpoch}`;
// Two immutable manifest identities may recur across recovery; operation identity must not salt them.
const output = (s) => (s.compute.selected ? `artifact/${s.compute.selected.id}` : null);
const permitted = (s) =>
  !s.suspended && !s.revoked && !["COMMITTED", "ACKNOWLEDGED"].includes(s.cancel);
export function actions() {
  return [
    "continue-as-new",
    "recover",
    "reconcile",
    "reconcile-unknown",
    "workflow-readmit",
    "cancel-request",
    "cancel-commit",
    "cancel-ack",
    "revoke",
    "verify",
    "authorize-release",
    "tick",
    "lookup",
    "select:0:1-1",
    "select:0:1-2",
    "select:1:1-1",
    "select:1:1-2",
    "release:0",
    "release:1",
  ];
}

export function step(before, action, mutation = "none") {
  const s = structuredClone(before);
  const [verb, epoch, id] = action.split(":");
  let outcome = "REJECTED";
  if (verb === "continue-as-new" && s.run + 1 < bounds.runs) {
    s.run++;
    outcome = "CONTINUED";
  } else if (verb === "recover" && s.workflowEpoch + 1 < bounds.workflowEpochs) {
    s.workflowEpoch++;
    s.suspended = true;
    s.compute = attempts.initial(); // Old operations are fenced, not revived.
    s.selectedEpoch = s.evidence = s.authorization = null;
    if (mutation === "forget-tombstone") s.cancel = "NONE";
    outcome = "RECOVERING";
  } else if (verb === "reconcile" && s.suspended) {
    s.suspended = false; // Independent, authoritative watermark reconciliation is assumed.
    outcome = "RECONCILED";
  } else if (verb === "reconcile-unknown" && s.suspended) {
    outcome = "RECOVERY_PENDING";
  } else if (
    verb === "workflow-readmit" &&
    s.workflowEpoch === 1 &&
    permitted(s) &&
    !s.compute.attempts.length
  ) {
    s.compute = candidates(); // Explicit authorized pure-compute segment after reconciliation.
    outcome = "READMITTED";
  } else if (verb === "cancel-request" && s.cancel === "NONE") {
    s.cancel = "PENDING";
    outcome = "CANCEL_PENDING";
  } else if (verb === "cancel-commit" && s.cancel === "PENDING") {
    s.cancel = "COMMITTED"; // Registry tombstone/fencing transaction precedes acknowledgement.
    outcome = "CANCEL_COMMITTED";
  } else if (
    verb === "cancel-ack" &&
    (s.cancel === "COMMITTED" || (mutation === "early-ack" && s.cancel === "PENDING"))
  ) {
    s.cancel = "ACKNOWLEDGED";
    outcome = "CANCELLED";
  } else if (verb === "revoke" && !s.revoked) {
    s.revoked = true;
    outcome = "REVOKED";
  } else if (verb === "tick") {
    s.compute = attempts.step(s.compute, "tick").state;
    outcome = "TIME_ADVANCED";
  } else if (verb === "lookup") {
    outcome = s.compute.selected ? "SELECTED" : "PENDING";
  } else if (
    verb === "select" &&
    permitted(s) &&
    (Number(epoch) === s.workflowEpoch ||
      (mutation === "stale-selection" && Number(epoch) < s.workflowEpoch))
  ) {
    const result = attempts.step(s.compute, `select:${id}`);
    s.compute = result.state;
    outcome = result.outcome;
    if (!before.compute.selected && s.compute.selected) s.selectedEpoch = Number(epoch);
  } else if (verb === "verify" && permitted(s) && s.compute.selected) {
    s.evidence = { epoch: s.workflowEpoch, output: output(s) };
    outcome = "VERIFIED";
  } else if (
    verb === "authorize-release" &&
    permitted(s) &&
    s.evidence?.output === output(s) &&
    s.evidence?.epoch === s.workflowEpoch
  ) {
    s.authorization = { epoch: s.workflowEpoch, output: output(s) };
    outcome = "RELEASE_AUTHORIZED"; // Explicit workflow decision, not a worker observation.
  } else if (
    verb === "release" &&
    s.authorization &&
    Number(epoch) === s.workflowEpoch &&
    s.authorization.epoch === s.workflowEpoch &&
    s.authorization.output === output(s) &&
    s.evidence?.output === output(s) &&
    s.evidence?.epoch === s.workflowEpoch &&
    (permitted(s) || mutation === "skip-release-barrier")
  ) {
    const key =
      mutation === "epoch-scoped-ledger" ? `${disclosureKey}/${s.workflowEpoch}` : disclosureKey;
    const prior = s.ledger.find((record) => record.key === key);
    if (prior) outcome = prior.output === output(s) ? "REPLAYED" : "DISCLOSURE_CONFLICT";
    else {
      s.ledger.push({ key, output: output(s), epoch: s.workflowEpoch });
      outcome = "GRANTED"; // Unique ledger insert and grant effect are one transaction.
    }
  }
  return { state: s, outcome };
}

export function violation(before, action, after) {
  const cancelled = (s) => ["COMMITTED", "ACKNOWLEDGED"].includes(s.cancel);
  if (
    action === "continue-as-new" &&
    (operationKey(before) !== operationKey(after) || before.workflowEpoch !== after.workflowEpoch)
  )
    return "stable-workflow-identity";
  if (before.ledger.some((record, i) => JSON.stringify(record) !== JSON.stringify(after.ledger[i])))
    return "durable-disclosure-record";
  if (after.ledger.length > 1) return "one-stable-disclosure";
  if (cancelled(before) && !cancelled(after)) return "durable-cancellation";
  if (after.cancel === "ACKNOWLEDGED" && !cancelled(before)) return "ack-after-tombstone";
  if (before.revoked && !after.revoked) return "durable-revocation";
  if (
    !before.compute.selected &&
    after.compute.selected &&
    (cancelled(before) || before.revoked || before.suspended)
  )
    return "selection-barrier";
  if (
    after.ledger.length > before.ledger.length &&
    (cancelled(before) ||
      before.revoked ||
      before.suspended ||
      !before.compute.selected ||
      before.evidence?.output !== output(before) ||
      before.evidence?.epoch !== before.workflowEpoch ||
      before.authorization?.output !== output(before) ||
      before.authorization?.epoch !== before.workflowEpoch)
  )
    return "authorized-release-barrier";
  if (
    !before.compute.selected &&
    after.compute.selected &&
    after.selectedEpoch !== before.workflowEpoch
  )
    return "current-recovery-selection";
  if (
    action === "workflow-readmit" &&
    after.compute.attempts.length > before.compute.attempts.length
  )
    return null;
  if (after.workflowEpoch === before.workflowEpoch)
    return attempts.violation(before.compute, action, after.compute);
  if (action !== "recover" || !after.suspended || after.authorization || after.compute.selected)
    return "recovery-quarantine";
  return null;
}
