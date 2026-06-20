/*
  lib/audit/rule-keys.ts — metadata for the editable rulebook keys.

  Kept in a plain module (not a 'use server' file) so it can be imported by
  both client components and server actions.
*/

export const RULE_KEYS: Record<
  string,
  { label: string; type: 'num' | 'bool'; serviceScoped?: boolean }
> = {
  dim_divisor:           { label: 'Dim divisor (in³/lb)',      type: 'num' },
  residential_surcharge: { label: 'Residential surcharge ($)', type: 'num' },
  residential_waived:    { label: 'Residential waived',        type: 'bool' },
  guarantee_enabled:     { label: 'Service guarantee enabled', type: 'bool' },
  sla_transit_days:      { label: 'SLA transit days',          type: 'num', serviceScoped: true },
};
