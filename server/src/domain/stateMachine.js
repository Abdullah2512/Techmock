import { SESSION_STATUS as S } from './constants.js';

// Valid session transitions. `submitted -> in_progress` is the rollback taken when
// evaluation fails so the user can retry; completed and cancelled are terminal.
export const TRANSITIONS = {
  [S.CREATED]: [S.IN_PROGRESS, S.SUBMITTED, S.CANCELLED],
  [S.IN_PROGRESS]: [S.SUBMITTED, S.CANCELLED],
  [S.SUBMITTED]: [S.COMPLETED, S.IN_PROGRESS],
  [S.COMPLETED]: [],
  [S.CANCELLED]: [],
};

export function canTransition(from, to) {
  return (TRANSITIONS[from] ?? []).includes(to);
}

/** Statuses from which `to` is reachable; used for atomic compare-and-set updates. */
export function statusesAllowing(to) {
  return Object.keys(TRANSITIONS).filter((from) => TRANSITIONS[from].includes(to));
}
