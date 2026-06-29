'use client';

import type { ComplianceData } from '@/lib/portal/data-loader';
import { ComplianceKpiRow } from './compliance-kpi-row';
import { CoverageGapFeed } from './coverage-gap-feed';
import { WarehouseScorecard } from './warehouse-scorecard';
import { GatewayReadinessPanel } from './gateway-readiness-panel';
import { AttestationPanel } from './attestation-panel';

export function ComplianceTabShell({
  complianceData,
  clientId,
}: {
  complianceData: ComplianceData;
  clientId: string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Governance KPIs */}
      <ComplianceKpiRow data={complianceData} />

      {/* Coverage Gaps + Warehouse Scorecard */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 12,
        }}
      >
        <CoverageGapFeed
          insuranceExposure={complianceData.insuranceExposure}
          scopeExclusions={complianceData.scopeExclusions}
        />
        <WarehouseScorecard data={complianceData} />
      </div>

      {/* Gateway Readiness */}
      <GatewayReadinessPanel
        gatewayReadiness={complianceData.gatewayReadiness}
        ruleSuggestions={complianceData.ruleSuggestions}
      />

      {/* Attestation */}
      <AttestationPanel clientId={clientId} />
    </div>
  );
}
