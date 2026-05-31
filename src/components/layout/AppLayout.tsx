import { ReactNode, useEffect, useState } from "react";
import { AppSidebar } from "./AppSidebar";
import { Topbar } from "./Topbar";

export const AppLayout = ({ children, title, subtitle }: { children: ReactNode; title: string; subtitle?: string }) => {
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem("ui.sidebar.open");
      if (raw === "true") return true;
      if (raw === "false") return false;
    } catch {}
    return typeof window !== "undefined" ? window.matchMedia("(min-width: 768px)").matches : false;
  });

  useEffect(() => {
    try {
      localStorage.setItem("ui.sidebar.open", String(sidebarOpen));
    } catch {}
  }, [sidebarOpen]);

  return (
    <div className="min-h-screen bg-background">
      <AppSidebar open={sidebarOpen} onOpenChange={setSidebarOpen} />
      <main className={`min-h-screen flex flex-col min-w-0 transition-[padding-left] duration-300 ${sidebarOpen ? "md:pl-64" : "md:pl-16"}`}>
        <Topbar
          title={title}
          subtitle={subtitle}
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen((v) => !v)}
        />
        <div className="flex-1 px-6 py-5 animate-fade-in">{children}</div>
      </main>
    </div>
  );
};
