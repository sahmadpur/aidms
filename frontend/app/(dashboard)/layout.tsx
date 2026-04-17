import Sidebar from "@/components/Sidebar";
import LanguageSwitcher from "@/components/LanguageSwitcher";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-surface">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-10 bg-surface-card border-b border-edge-soft flex items-center justify-end px-5 flex-shrink-0">
          <LanguageSwitcher />
        </header>
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
