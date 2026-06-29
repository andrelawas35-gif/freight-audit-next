'use client';

/**
 * Define Clause Modal — client provides operational definition for an unmapped clause.
 * Maps to known PolicyCondition keys or proposes a new one.
 */

import { useState, useTransition } from 'react';
import type { UnmappedClauseRow } from '@/lib/intelligence/policy-service';
import { defineClauseAction } from './actions';

const KNOWN_CONDITION_KEYS = [
  { key: 'declaredValueGte', label: 'Declared value ≥ $X' },
  { key: 'declaredValueGt', label: 'Declared value > $X' },
  { key: 'declaredValueLte', label: 'Declared value ≤ $X' },
  { key: 'insuredValueLtDeclared', label: 'Insured value < declared value' },
  { key: 'carrierIn', label: 'Carrier must be in list' },
  { key: 'carrierNotIn', label: 'Carrier must NOT be in list' },
  { key: 'serviceIn', label: 'Service level in list' },
  { key: 'serviceNotIn', label: 'Service level NOT in list' },
  { key: 'shipperVertical', label: 'Shipper vertical' },
  { key: 'commodityType', label: 'Commodity type' },
  { key: 'commodityIn', label: 'Commodity in list' },
  { key: 'destinationCountryIn', label: 'Destination country in list' },
  { key: 'destinationZipIn', label: 'Destination ZIP in list' },
  { key: 'destinationRiskTierIn', label: 'Destination risk tier' },
  { key: 'signatureRequiredAbove', label: 'Signature above $X' },
  { key: 'signatureTypeIn', label: 'Signature type in list' },
  { key: 'documentationRequired', label: 'Documentation required' },
  { key: 'packageTypeIn', label: 'Package type in list' },
  { key: 'temperatureControlRequired', label: 'Temperature control required' },
  { key: 'temperatureMax', label: 'Maximum temperature' },
] as const;

type Props = {
  clause: UnmappedClauseRow;
  onClose: () => void;
  onSuccess: (id: string) => void;
  onError: (message: string) => void;
};

export function DefineClauseModal({ clause, onClose, onSuccess, onError }: Props) {
  const [isPending, startTransition] = useTransition();
  const [selectedKey, setSelectedKey] = useState('');
  const [value, setValue] = useState('');
  const [reasoning, setReasoning] = useState('');
  const [fieldType, setFieldType] = useState<'number' | 'string' | 'boolean' | 'array'>('string');

  const handleSubmit = () => {
    if (!selectedKey.trim()) {
      onError('Please select a condition key.');
      return;
    }

    let parsedValue: unknown = value;
    if (fieldType === 'number') {
      parsedValue = parseFloat(value);
      if (isNaN(parsedValue as number)) {
        onError('Please enter a valid number.');
        return;
      }
    } else if (fieldType === 'boolean') {
      parsedValue = value.toLowerCase() === 'true';
    } else if (fieldType === 'array') {
      parsedValue = value.split(',').map(s => s.trim()).filter(Boolean);
    }

    const conditionJson: Record<string, unknown> = {};
    conditionJson[selectedKey] = parsedValue;

    startTransition(async () => {
      const result = await defineClauseAction({
        scopeExclusionId: clause.id,
        clauseText: clause.clauseText,
        ruleKey: `client_defined_${selectedKey}_${Date.now()}`,
        conditionJson,
        reasoning: reasoning || `Client-defined rule for: ${clause.clauseText.slice(0, 100)}`,
      });

      if (result.success) {
        onSuccess(clause.id);
      } else {
        onError(result.error);
      }
    });
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 100,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(4px)',
        }}
      />

      {/* Modal */}
      <div style={{
        position: 'relative',
        background: '#1a1a2e',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 12,
        padding: 24,
        width: '100%',
        maxWidth: 520,
        maxHeight: '90vh',
        overflow: 'auto',
      }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 14, color: 'var(--ink-1)' }}>
          Define enforcement rule
        </h2>

        {/* Clause preview */}
        <div style={{
          background: 'rgba(255,255,255,0.04)',
          borderRadius: 8,
          padding: 12,
          marginBottom: 18,
          fontSize: 12.5,
          color: 'var(--ink-1)',
          fontStyle: 'italic',
          lineHeight: 1.5,
        }}>
          &ldquo;{clause.clauseText}&rdquo;
        </div>

        {/* Condition key selector */}
        <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          What does this clause control?
        </label>
        <select
          value={selectedKey}
          onChange={e => {
            setSelectedKey(e.target.value);
            // Auto-detect field type
            const key = KNOWN_CONDITION_KEYS.find(k => k.key === e.target.value);
            if (key) {
              if (key.key === 'temperatureControlRequired' || key.key === 'insuredValueLtDeclared') {
                setFieldType('boolean');
              } else if (key.key.includes('Value') || key.key.includes('Above') || key.key === 'temperatureMax') {
                setFieldType('number');
              } else if (key.key.endsWith('In') || key.key === 'documentationRequired') {
                setFieldType('array');
              } else {
                setFieldType('string');
              }
            }
          }}
          style={{
            width: '100%',
            padding: '8px 12px',
            borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.1)',
            background: 'rgba(255,255,255,0.05)',
            color: '#EDEDEF',
            fontSize: 13,
            marginBottom: 14,
            outline: 'none',
          }}
        >
          <option value="">Select a condition...</option>
          {KNOWN_CONDITION_KEYS.map(k => (
            <option key={k.key} value={k.key}>{k.label}</option>
          ))}
        </select>

        {/* Value input */}
        <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {fieldType === 'array' ? 'Values (comma-separated)' : fieldType === 'boolean' ? 'Value (true/false)' : 'Value'}
        </label>
        {fieldType === 'boolean' ? (
          <select
            value={value}
            onChange={e => setValue(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.1)',
              background: 'rgba(255,255,255,0.05)',
              color: '#EDEDEF',
              fontSize: 13,
              marginBottom: 14,
              outline: 'none',
            }}
          >
            <option value="">Select...</option>
            <option value="true">True (required)</option>
            <option value="false">False (not required)</option>
          </select>
        ) : (
          <input
            type={fieldType === 'number' ? 'number' : 'text'}
            value={value}
            onChange={e => setValue(e.target.value)}
            placeholder={
              fieldType === 'number' ? 'e.g. 10000' :
              fieldType === 'array' ? 'e.g. UPS, FedEx' :
              'e.g. jewelry'
            }
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.1)',
              background: 'rgba(255,255,255,0.05)',
              color: '#EDEDEF',
              fontSize: 13,
              marginBottom: 14,
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        )}

        {/* Reasoning */}
        <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Business justification (optional)
        </label>
        <textarea
          value={reasoning}
          onChange={e => setReasoning(e.target.value)}
          placeholder="Why should this clause be enforced this way?"
          rows={2}
          style={{
            width: '100%',
            padding: '8px 12px',
            borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.1)',
            background: 'rgba(255,255,255,0.05)',
            color: '#EDEDEF',
            fontSize: 13,
            marginBottom: 18,
            outline: 'none',
            resize: 'vertical',
            fontFamily: 'inherit',
          }}
        />

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            disabled={isPending}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.1)',
              background: 'transparent',
              color: 'var(--ink-2)',
              fontSize: 12.5,
              fontWeight: 500,
              cursor: isPending ? 'not-allowed' : 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isPending || !selectedKey || (!value && fieldType !== 'boolean')}
            style={{
              padding: '8px 20px',
              borderRadius: 8,
              border: 'none',
              background: selectedKey ? '#5E6AD2' : 'rgba(94,106,210,0.3)',
              color: '#fff',
              fontSize: 12.5,
              fontWeight: 600,
              cursor: isPending || !selectedKey ? 'not-allowed' : 'pointer',
              opacity: isPending ? 0.7 : 1,
            }}
          >
            {isPending ? 'Creating...' : 'Create draft rule'}
          </button>
        </div>
      </div>
    </div>
  );
}
