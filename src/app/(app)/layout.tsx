import { AppShell } from "@/components/app-shell";
import { SiteShell } from "@/components/site-shell";

// Every route in this group needs a signed-in user; AppShell handles that.
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <SiteShell>
      <AppShell>{children}</AppShell>
    </SiteShell>
  );
}
