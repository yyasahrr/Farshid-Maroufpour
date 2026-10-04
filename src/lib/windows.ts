/**
 * Pure scheduling geometry shared by the slot builder and the visit planner.
 * Lives in its own module so planner tests can run without the DB import chain.
 */
export function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}
