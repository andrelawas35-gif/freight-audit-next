/*
  lib/templates.ts — dispute filing body templates by rule.

  Your design's FilingTemplateModal called FA.templateFor(rule, carrier).
  Until you build the Dispute Templates Airtable table (mentioned in
  CLAUDE.md as a manual step), these live here as a fallback.

  Once that table exists, swap this for a fetchRecords('Dispute Templates', ...)
  call filtered by rule + carrier link.
*/

export type Template = { name: string; body: string };

const TEMPLATES: Record<string, Template> = {
  DIM_WEIGHT_TRAP: {
    name: 'Dim-weight overcharge dispute',
    body: `To Whom It May Concern,

We are disputing a dimensional weight charge on tracking number {pro} (Invoice {invoice}).

Our warehouse management system recorded actual package dimensions that differ materially from the dimensions used to calculate the billed charge. Based on our records, the correct dimensional weight should result in a charge approximately {recover} lower than billed.

Service level: {svc}

We request a review and adjustment of this charge. Supporting documentation (warehouse dimension records) is available upon request.

Thank you for your prompt attention to this matter.`,
  },
  PHANTOM_ACCESSORIAL: {
    name: 'Residential surcharge dispute — commercial address',
    body: `To Whom It May Concern,

We are disputing a residential delivery surcharge applied to tracking number {pro} (Invoice {invoice}).

This shipment was delivered to a commercial business address, verified via address classification lookup. Residential delivery surcharges should not apply to commercial destinations.

We request removal of this surcharge, totaling {recover}, and a corrected invoice.

Thank you for your prompt attention to this matter.`,
  },
  DUPLICATE_TRACKING: {
    name: 'Duplicate billing dispute',
    body: `To Whom It May Concern,

We have identified a duplicate charge for tracking number {pro}. This shipment was billed on Invoice {invoice} and also appears on a separate invoice for the same shipment.

We request a refund of the duplicate charge, totaling {recover}, which represents 100% of the duplicated amount.

Please confirm receipt and provide a timeline for credit issuance.

Thank you for your prompt attention to this matter.`,
  },
  SLA_FAILURE: {
    name: 'Service guarantee refund request',
    body: `To Whom It May Concern,

We are requesting a service guarantee refund for tracking number {pro} (Invoice {invoice}).

This shipment was tendered as {svc} service, which carries a money-back transit guarantee. The shipment was delivered {days_late} day(s) beyond the guaranteed transit time.

Per your service guarantee policy, we request a full refund of the shipping charges, totaling {recover}.

Thank you for your prompt attention to this matter.`,
  },
  LTL_SLA_FAILURE: {
    name: 'LTL guaranteed service refund request',
    body: `To Whom It May Concern,

We are requesting a refund under your guaranteed service program for shipment PRO {pro} (Invoice {invoice}).

This shipment was tendered under a guaranteed delivery service ({svc}) and was delivered {days_late} business day(s) beyond the guaranteed transit time.

Per the guaranteed service terms, we request a refund of {recover}.

Please confirm receipt of this claim and provide your claim reference number.

Thank you for your prompt attention to this matter.`,
  },
};

const DEFAULT_TEMPLATE: Template = {
  name: 'General billing dispute',
  body: `To Whom It May Concern,

We are disputing a charge on tracking number {pro} (Invoice {invoice}).

Based on our audit, the billed amount of this charge appears to be incorrect. We are requesting a review and adjustment of {recover}.

Thank you for your prompt attention to this matter.`,
};

export function templateFor(rule: string): Template {
  return TEMPLATES[rule] || DEFAULT_TEMPLATE;
}
