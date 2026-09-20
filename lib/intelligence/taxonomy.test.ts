import { describe, expect, it } from 'vitest';
import {
  defaultGatewayTagForRule,
  gatewayTagToFields,
  validateGatewayTag,
} from './taxonomy';

describe('gateway taxonomy', () => {
  it('requires rule suggestions for preventable findings', () => {
    expect(() => validateGatewayTag({
      gatewayPreventability: 'PREVENTABLE_BY_GATEWAY',
      gatewayCategory: 'DIM_WEIGHT_PADDING',
      gatewayRuleSuggestion: null,
      gatewayEstimatedSavings: 10,
      gatewayConfidence: 0.8,
      gatewaySignalSource: 'RULE_DEFAULT',
    })).toThrow(/require a gateway rule suggestion/i);
  });

  it('maps dim weight findings to preventable gateway intelligence', () => {
    const tag = defaultGatewayTagForRule('DIM_WEIGHT_TRAP', 42.5);

    expect(tag.gatewayPreventability).toBe('PREVENTABLE_BY_GATEWAY');
    expect(tag.gatewayCategory).toBe('DIM_WEIGHT_PADDING');
    expect(tag.gatewayEstimatedSavings).toBe(42.5);
    expect(tag.gatewayRuleSuggestion).toContain('package cube');
  });

  it('maps SLA findings to non-preventable by default', () => {
    const tag = defaultGatewayTagForRule('SLA_FAILURE', 18);

    expect(tag.gatewayPreventability).toBe('NON_PREVENTABLE_BY_GATEWAY');
    expect(tag.gatewayCategory).toBe('LATE_SHIPMENT_RISK');
    expect(tag.gatewayEstimatedSavings).toBe(0);
    expect(tag.gatewayRuleSuggestion).toBeNull();
  });

  it('serializes gateway tags to Audit Results field names', () => {
    const fields = gatewayTagToFields(defaultGatewayTagForRule('TPL_GHOST_SHIPMENT', 100));

    expect(fields['Gateway preventability']).toBe('PREVENTABLE_BY_GATEWAY');
    expect(fields['Gateway category']).toBe('THREE_PL_PICK_PACK_ERROR');
    expect(fields['Gateway estimated savings']).toBe(100);
  });
});
