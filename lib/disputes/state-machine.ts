/*
  lib/disputes/state-machine.ts — Canonical dispute state machine (ADR 0005).

  Allowed transitions:
    pending_review → filed | closed
    filed          → carrier_responded | closed
    carrier_responded → won | dismissed | partial | closed
    won            → closed
    dismissed      → closed
    partial        → won | appealed | closed
    appealed       → carrier_responded | closed
    closed         → (terminal)
*/

// Canonical dispute statuses (ADR 0005)
export const DISPUTE_STATUSES = [
  'pending_review',
  'filed',
  'carrier_responded',
  'won',
  'dismissed',
  'partial',
  'appealed',
  'closed',
] as const;
export type DisputeStatus = (typeof DISPUTE_STATUSES)[number];

// Valid transitions map — every status maps to its allowed next statuses
export const VALID_TRANSITIONS: Record<DisputeStatus, DisputeStatus[]> = {
  pending_review: ['filed', 'closed'],
  filed: ['carrier_responded', 'closed'],
  carrier_responded: ['won', 'dismissed', 'partial', 'closed'],
  won: ['closed'],
  dismissed: ['closed'],
  partial: ['won', 'appealed', 'closed'],
  appealed: ['carrier_responded', 'closed'],
  closed: [],
};

/**
 * Validate a status transition. Throws if invalid.
 * Returns the new status on success.
 */
export function validateTransition(
  currentStatus: DisputeStatus,
  newStatus: DisputeStatus,
): DisputeStatus {
  const allowed = VALID_TRANSITIONS[currentStatus];
  if (!allowed || !allowed.includes(newStatus)) {
    throw new Error(
      `Invalid dispute transition: ${currentStatus} → ${newStatus}. ` +
        `Allowed: ${allowed?.join(', ') ?? 'none'}`,
    );
  }
  return newStatus;
}

/**
 * Get available next statuses for a dispute.
 */
export function availableTransitions(currentStatus: string): DisputeStatus[] {
  return VALID_TRANSITIONS[currentStatus as DisputeStatus] ?? [];
}
