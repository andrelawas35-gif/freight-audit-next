export function PortalPlaceholder({ icon, title, description }: { icon: 'settings' | 'help'; title: string; description: string }) {
  return <div className="portal-placeholder"><div className="portal-placeholder-icon" aria-hidden="true">{icon === 'settings' ? <svg viewBox="0 0 24 24"><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" /></svg> : <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><path d="M9.1 9a3 3 0 1 1 4.8 2.4c-1.2.8-1.9 1.3-1.9 2.6M12 18h.01" /></svg>}</div><h1>{title}</h1><p>{description}</p></div>;
}
