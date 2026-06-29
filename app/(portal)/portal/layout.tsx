import { auth } from '@/auth';
import { PortalShell } from '@/components/portal/portal-shell';

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const name = session?.user?.name || session?.user?.email || 'Account';

  return <PortalShell companyName={name}>{children}</PortalShell>;
}
