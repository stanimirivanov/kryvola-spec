// Executable specification only. One pure operation; no scheduler or wall-clock I/O.
export const bounds = Object.freeze({ epochs: 2, executions: 2, deadline: 3, states: 100000 });
export const initial = () => ({ now: 0, attempts: [], executions: [], selected: null });
const current = (s) => s.attempts.at(-1);
const live = (s, a) => a && !a.retired && a.until !== null && s.now < a.until;

export function actions(s) {
  return [
    "workflow-authorize",
    "worker-authorize",
    "tick",
    "lookup",
    ...s.attempts.flatMap((a) => [
      `ensure:${a.epoch}`,
      `renew:${a.epoch}`,
      `launch:${a.epoch}`,
      `ack:${a.epoch}`,
    ]),
    ...s.executions.flatMap((e) => [`complete:${e.id}`, `select:${e.id}`]),
  ];
}

// Each step is atomic at the named authority; launch and ack are separate Ray effects.
export function step(before, action, mutation = "none") {
  const s = structuredClone(before);
  const [verb, argument] = action.split(":");
  const epoch = Number(argument);
  const a = s.attempts.find((a) => a.epoch === epoch);
  const e = s.executions.find((e) => e.id === argument);
  let outcome = "REJECTED";
  if (verb === "workflow-authorize" || verb === "worker-authorize") {
    if (
      verb === "workflow-authorize" &&
      !s.selected &&
      s.now < bounds.deadline &&
      s.attempts.length < bounds.epochs &&
      (!current(s) || current(s).retired)
    ) {
      const next = s.attempts.length + 1;
      s.attempts.push({ epoch: next, fence: next, until: null, retired: false, intent: false });
      outcome = "AUTHORIZED";
    }
  } else if (verb === "tick" && s.now < bounds.deadline) {
    s.now++;
    for (const attempt of s.attempts) {
      if (attempt.until !== null && s.now >= attempt.until) attempt.retired = true;
    }
    outcome = "TIME_ADVANCED";
  } else if (verb === "lookup") {
    outcome = s.selected ? "SELECTED" : "PENDING";
  } else if (verb === "ensure" && a) {
    if (s.selected) outcome = "SELECTED";
    else if (a.retired && mutation !== "reacquire-retired") outcome = "ATTEMPT_EXPIRED";
    else if (a === current(s) && s.now < bounds.deadline) {
      if (a.until === null || (a.retired && mutation === "reacquire-retired")) {
        a.until = s.now + 1;
        a.retired = false;
        a.intent = true; // SQL commits intent before any external dispatch.
      }
      outcome = "ENSURED";
    }
  } else if (verb === "renew" && a === current(s) && live(s, a) && !s.selected) {
    a.until = Math.min(bounds.deadline, s.now + 2);
    outcome = "RENEWED";
  } else if (verb === "launch" && a?.intent && live(s, a) && !s.selected) {
    const count = s.executions.filter((e) => e.epoch === epoch).length;
    if (count < bounds.executions) {
      s.executions.push({ id: `${epoch}-${count + 1}`, epoch, fence: a.fence, done: false });
      // No acknowledgement yet: retry may launch another physical execution.
      outcome = "LAUNCHED";
    }
  } else if (verb === "ack" && a?.intent && s.executions.some((e) => e.epoch === epoch)) {
    a.intent = false;
    outcome = "ACKNOWLEDGED";
  } else if (verb === "complete" && e && !e.done) {
    e.done = true; // Immutable, execution-specific finalized output is now available.
    outcome = "COMPLETED";
  } else if (verb === "select" && e?.done) {
    if (s.selected) {
      outcome = s.selected.id === e.id ? "SELECTED" : "CONFLICT";
    } else if (
      mutation === "unfenced-selection" ||
      (mutation === "ignore-fence" && live(s, current(s))) ||
      (e.epoch === current(s)?.epoch && e.fence === current(s)?.fence && live(s, current(s)))
    ) {
      s.selected = { id: e.id, epoch: e.epoch, fence: e.fence };
      outcome = "SELECTED"; // SQL CAS and completion outbox commit as one abstract step.
    }
  }
  return { state: s, outcome };
}

// Safety predicates are independent of the transition guards (including mutant guards).
export function violation(before, action, after) {
  if (after.attempts.length > before.attempts.length && action !== "workflow-authorize") {
    return "workflow-authority";
  }
  if (before.attempts.some((a, i) => a.retired && !after.attempts[i].retired)) {
    return "irreversible-retirement";
  }
  if (before.selected && JSON.stringify(before.selected) !== JSON.stringify(after.selected)) {
    return "immutable-selection";
  }
  if (!before.selected && after.selected) {
    const e = before.executions.find((e) => e.id === after.selected.id);
    const a = current(before);
    if (!e?.done || e.epoch !== a?.epoch || e.fence !== a?.fence || !live(before, a)) {
      return "current-live-fence";
    }
  }
  for (const e of after.executions) {
    const a = after.attempts.find((a) => a.epoch === e.epoch);
    if (!a || e.fence !== a.fence) return "authorized-execution";
  }
  return null;
}
