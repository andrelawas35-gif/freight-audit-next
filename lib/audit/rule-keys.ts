/*
  lib/audit/rule-keys.ts — metadata for the editable rulebook keys.

  Kept in a plain module (not a 'use server' file) so it can be imported by
  both client components and server actions.

  Grouped into the parcel/LTL carrier rules and the 3PL fulfillment rules.
  `serviceScoped` rows use the rulebook's service_level column as a sub-key
  (a shipping service level for carriers, or a storage tier for 3PL storage).
  `options` constrains a text value to a fixed set in the editor.
*/

export type RuleKeyMeta = {
  label: string;
  type: 'num' | 'bool' | 'text';
  group: 'carrier' | '3pl';
  serviceScoped?: boolean;
  serviceLabel?: string;   // what the service_level field means for this key
  options?: string[];      // for type 'text': allowed values
  unit?: string;
};

export const RULE_KEYS: Record<string, RuleKeyMeta> = {
  // ── Parcel / LTL carrier rules ──
  dim_divisor:           { label: 'Dim divisor (in³/lb)',      type: 'num',  group: 'carrier' },
  residential_surcharge: { label: 'Residential surcharge ($)', type: 'num',  group: 'carrier' },
  residential_waived:    { label: 'Residential waived',        type: 'bool', group: 'carrier' },
  guarantee_enabled:     { label: 'Service guarantee enabled', type: 'bool', group: 'carrier' },
  sla_transit_days:      { label: 'SLA transit days',          type: 'num',  group: 'carrier', serviceScoped: true, serviceLabel: 'Service level' },

  // ── 3PL fulfillment rules ──
  pricing_model:         { label: '3PL: pricing model',                 type: 'text', group: '3pl', options: ['fixed_rate', 'cost_plus', 'blanket'] },
  pick_base_fee:         { label: '3PL: base pick fee ($/order)',       type: 'num', group: '3pl' },
  pick_additional_fee:   { label: '3PL: additional pick fee ($/unit)',  type: 'num', group: '3pl' },
  packaging_fee:         { label: '3PL: packaging material fee ($)',    type: 'num', group: '3pl' },
  freight_markup_pct:    { label: '3PL: freight markup (%)',            type: 'num', group: '3pl' },
  storage_rate:          { label: '3PL: storage rate ($/period)',       type: 'num', group: '3pl', serviceScoped: true, serviceLabel: 'Storage tier (Pallet/Bin/Shelf)' },
  storage_billing_method:{ label: '3PL: storage billing method',        type: 'text', group: '3pl', options: ['snapshot', 'daily_average', 'cubic_foot'] },
};
