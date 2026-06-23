'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { fmtUSD } from '@/lib/format';

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  auditResults?: any[];
  disputes?: any[];
}

export function CommandPalette({ open, onClose, auditResults = [], disputes = [] }: CommandPaletteProps) {
  const [q, setQ] = useState('');
  const [hi, setHi] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Focus input automatically on open
  useEffect(() => {
    if (open) {
      setQ('');
      setHi(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  // Global escape key close handling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  // Aggregate global searchable items
  const items = useMemo(() => {
    const lq = q.trim().toLowerCase();
    const out: any[] = [];

    // Search Audit Results
    auditResults.forEach(r => {
      const hay = `${r.id} ${r['Invoice number'] || r.invoice} ${r['Carrier SCAC'] || r.carrier}`.toLowerCase();
      if (!lq || hay.includes(lq)) {
        out.push({
          group: 'Audit Findings',
          label: `Invoice: ${r['Invoice number'] || '—'}`,
          meta: `${r['Carrier SCAC'] || '—'} · Variance: ${fmtUSD(r['Variance'] || r.recover || 0)}`,
          action: () => { router.push('/queue'); onClose(); }
        });
      }
    });

    // Search Disputes
    disputes.forEach(d => {
      const hay = `${d.id} ${d['Invoice'] || d.invoice} ${d['Status'] || d.stage}`.toLowerCase();
      if (!lq || hay.includes(lq)) {
        out.push({
          group: 'Disputes Pipeline',
          label: `Dispute ID: ${d.id.slice(0, 8)} · ${d['Invoice'] || '—'}`,
          meta: `${d['Status'] || 'Open'} · Amount: ${fmtUSD(d['Disputed amount'] || d.amount || 0)}`,
          action: () => { router.push('/disputes'); onClose(); }
        });
      }
    });

    return out.slice(0, 10); // Limit to top 10 rows for clean Bloomberg look
  }, [q, auditResults, disputes, router, onClose]);

  if (!open) return null;

  return (
    <div 
      onClick={onClose}
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        zIndex: 1000, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(3px)',
        display: 'grid', placeItems: 'start center', padding: '12vh 16px'
      }}
    >
      <div 
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 540, background: 'var(--surface)',
          border: '1px solid var(--line-strong)', borderRadius: 10,
          boxShadow: 'var(--shadow-xl)', overflow: 'hidden'
        }}
      >
        {/* Search Header input bar */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid var(--line)' }}>
          <span style={{ fontSize: 13, marginRight: 8, color: 'var(--ink-faint)' }}>🔍</span>
          <input
            ref={inputRef}
            type="text"
            placeholder="Search invoices, PRO tracking, carriers, rules..."
            value={q}
            onChange={e => { setQ(e.target.value); setHi(0); }}
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              color: 'var(--ink)', fontSize: 13, fontFamily: 'var(--font)'
            }}
          />
          <span style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--ink-faint)', background: 'var(--surface-sunk)', padding: '2px 5px', borderRadius: 4 }}>ESC</span>
        </div>

        {/* Results Container */}
        <div style={{ maxHeight: 320, overflowY: 'auto', padding: 4 }}>
          {items.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--ink-faint)', fontSize: 12 }}>No matching records found.</div>
          ) : (
            items.map((item, index) => (
              <div
                key={index}
                onClick={item.action}
                onMouseEnter={() => setHi(index)}
                style={{
                  display: 'flex', flexDirection: 'column', padding: '6px 10px',
                  borderRadius: 6, cursor: 'pointer',
                  background: hi === index ? 'var(--row-hover)' : 'transparent'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)' }}>{item.label}</span>
                  <span style={{ fontSize: 10, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{item.group}</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }} className="mono">{item.meta}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}