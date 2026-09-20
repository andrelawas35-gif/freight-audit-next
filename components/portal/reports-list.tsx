'use client';

type Report = { key: string; month: string; recovered: number; disputes: number; winRate: number; invoices: number };
const usd = (value: number) => '$' + Math.round(value).toLocaleString('en-US');

function downloadCsv(report: Report) {
  const csv = `Month,Recovered,Disputes,Win Rate,Invoices\n"${report.month}",${report.recovered},${report.disputes},${report.winRate}%,${report.invoices}\n`;
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = `aurelian-report-${report.key}.csv`; anchor.click();
  URL.revokeObjectURL(url);
}

export function ReportsList({ reports }: { reports: Report[] }) {
  return <div className="portal-page-stack">
    <div className="portal-page-header"><div><h1>Reports</h1><p>Monthly recovery summaries and audit performance.</p></div></div>
    <div className="portal-report-list">
      {reports.map((report) => <article className="portal-report-card" key={report.key}>
        <div><h2>{report.month}</h2><div className="portal-report-stats"><ReportStat label="Recovered" value={usd(report.recovered)} color="#4ade80" /><ReportStat label="Disputes" value={String(report.disputes)} /><ReportStat label="Win rate" value={`${report.winRate}%`} /><ReportStat label="Invoices" value={String(report.invoices)} /></div></div>
        <div className="portal-report-actions"><button className="portal-ghost-button" onClick={() => window.print()}>PDF</button><button className="portal-ghost-button" onClick={() => downloadCsv(report)}>CSV</button></div>
      </article>)}
      {reports.length === 0 ? <div className="portal-empty-state"><strong>No reports yet</strong><span>Monthly summaries appear after invoices and disputes are processed.</span></div> : null}
    </div>
  </div>;
}

function ReportStat({ label, value, color = '#EDEDEF' }: { label: string; value: string; color?: string }) {
  return <div><span>{label}</span><strong style={{ color }}>{value}</strong></div>;
}
