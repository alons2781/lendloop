import { AppHeader } from "@/components/app-header";
import { Home as HomeContent } from "@/components/home";
import { NavProvider } from "@/components/nav-context";

export default function Page() {
  return (
    <NavProvider>
      <div className="flex min-h-screen flex-col">
        <AppHeader />

        <main className="flex-1">
          <HomeContent />
        </main>

        <footer className="border-t border-stone-200 py-6 text-center text-sm text-stone-500">
          &copy; LendLoop
        </footer>
      </div>
    </NavProvider>
  );
}
