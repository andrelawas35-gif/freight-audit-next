/*
  lib/format.ts — number + date formatting.

  Extracted from your components.jsx.
  Import anywhere: import { fmtUSD, fmtDate } from '@/lib/format';
*/

export const fmtUSD = (n: number, cents = false) =>
  '$' +
  Number(n).toLocaleString('en-US', {
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  });

export const fmtK = (n: number) =>
  '$' + (n / 1000).toLocaleString('en-US', { maximumFractionDigits: 1 }) + 'K';

export const fmtPct = (n: number) => Math.round(n * 100) + '%';

export const fmtDate = (iso: string | undefined) => {
  if (!iso) return '—';
  const x = new Date(iso + 'T00:00:00');
  return x.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

export const fmtDateFull = (iso: string | undefined) => {
  if (!iso) return '—';
  const x = new Date(iso + 'T00:00:00');
  return x.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

export const daysUntil = (iso: string | undefined) => {
  if (!iso) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(iso + 'T00:00:00');
  return Math.round((target.getTime() - today.getTime()) / 86400000);
};

export const daysAgo = (iso: string | undefined) => {
  const d = daysUntil(iso);
  return d !== null ? -d : null;
};

export const STAGES = ['Open', 'In review', 'Submitted', 'Escalated', 'Won', 'Closed'];

export type Confidence = 'high' | 'medium' | 'borderline';

export function confidenceFromVariancePct(pct: number): Confidence {
  if (pct > 0.20) return 'high';
  if (pct > 0.10) return 'medium';
  return 'borderline';
}