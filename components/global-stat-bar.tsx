import { fetchRecords } from '@/lib/airtable';
import { StatBar } from '@/components/ui/primitives';
import { fmtUSD } from '@/lib/format';
import { Dispute } from '@/lib/types';

export default async function GlobalStatBar() {
  let disputes: Dispute[] = [];
  
  try {
    // We only fetch the 3 fields needed for global math to keep this lightning fast
    disputes = await fetchRecords('Disputes', {
      maxRecords: 1000,
      fields: ['Status', 'Disputed amount', 'Recovery amount']
    }) as Dispute[];
  } catch (err) {
    console.error('Failed to fetch global stats:', err);
  }

  let activeCount = 0;
  let activeExposure = 0;
  let totalRecovered = 0;

  disputes.forEach(d => {
    const status = d['Status'] || 'Open';
    const disputed = d['Disputed amount'] || 0;
    const recovered = d['Recovery amount'] || 0;

    if (status === 'Won') {
      totalRecovered += recovered;
    } else if (status !== 'Closed') {
      // Anything not Won or Closed is active pipeline
      activeCount += 1;
      activeExposure += (disputed - recovered);
    }
  });

  return (
    <StatBar items={[
      { label: 'Total Recovered (All Time)', value: fmtUSD(totalRecovered), tone: 'var(--green-ink)' },
      { label: 'Active Pipeline Exposure', value: fmtUSD(activeExposure), tone: 'var(--amber-ink)' },
      { label: 'Active Disputes', value: activeCount, tone: 'var(--ink)' }
    ]} />
  );
}