import type { ReactNode } from "react";
import { AppHeader } from "./app-header";

/** Header, content area and footer shared by the landing page and the app. */
export function SiteShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader />
      <main className="flex-1">{children}</main>
      <footer className="border-t border-stone-200 py-6 text-center text-sm text-stone-500">
        &copy; LendLoop
      </footer>
    </div>
  );
}
