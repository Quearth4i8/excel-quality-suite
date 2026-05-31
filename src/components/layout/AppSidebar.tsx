import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Database,
  LineChart,
  Target,
  Users,
  Ruler,
  FileText,
  Shield,
} from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { Button } from "@/components/ui/button";

const items = [
  { to: "/", label: "Tableau de bord", icon: LayoutDashboard },
  { to: "/data", label: "Données", icon: Database },
  { to: "/spc", label: "Cartes SPC", icon: LineChart },
  { to: "/capability", label: "Capabilité Process", icon: Target },
  { to: "/msa", label: "MSA (R&R)", icon: Users },
  { to: "/uncertainty", label: "Incertitude", icon: Ruler },
  { to: "/reports", label: "Rapports", icon: FileText },
];

const adminItem = { to: "/admin", label: "Administration", icon: Shield };

export const AppSidebar = ({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) => {
  const { user, signOut, role } = useAuth();

  const email = user?.email ?? "";
  const initial = email ? email.trim().charAt(0).toUpperCase() : "?";

  return (
    <aside
      className={`fixed left-0 top-0 z-20 h-screen bg-sidebar text-sidebar-foreground flex flex-col border-r border-sidebar-border transition-all duration-300 ease-out ${
        open ? "w-64" : "w-16"
      }`}
    >
      {/* Brand */}
      <div className={`flex items-center border-b border-sidebar-border ${open ? "gap-3 px-4 py-4" : "justify-center px-2 py-4"}`}>
        <img
          src="/logo.png"
          alt="CrimpControl"
          className="shrink-0 object-contain drop-shadow-lg"
          style={{ width: open ? 52 : 44, height: open ? 52 : 44, transition: "width 0.3s, height 0.3s" }}
        />
        {open && (
          <div className="overflow-hidden">
            <div className="text-base font-bold text-sidebar-accent-foreground tracking-tight whitespace-nowrap">CrimpControl</div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {items.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              `flex items-center rounded-md text-sm transition-colors ${
                open ? "gap-3 px-3 py-2.5" : "justify-center px-2 py-2.5"
              } ${
                isActive
                  ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-md"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              }`
            }
            onClick={() => {
              if (window.matchMedia("(max-width: 767px)").matches) onOpenChange(false);
            }}
            title={label}
          >
            <Icon className="w-4 h-4 shrink-0" />
            <span className={`overflow-hidden whitespace-nowrap transition-all duration-300 ${open ? "opacity-100 max-w-[200px]" : "opacity-0 max-w-0"}`}>
              {label}
            </span>
          </NavLink>
        ))}
        {role === 'admin' && (
          <NavLink
            to={adminItem.to}
            className={({ isActive }) =>
              `flex items-center rounded-md text-sm transition-colors ${
                open ? "gap-3 px-3 py-2.5" : "justify-center px-2 py-2.5"
              } ${
                isActive
                  ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-md"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              }`
            }
            onClick={() => {
              if (window.matchMedia("(max-width: 767px)").matches) onOpenChange(false);
            }}
            title={adminItem.label}
          >
            <adminItem.icon className="w-4 h-4 shrink-0" />
            <span className={`overflow-hidden whitespace-nowrap transition-all duration-300 ${open ? "opacity-100 max-w-[200px]" : "opacity-0 max-w-0"}`}>
              {adminItem.label}
            </span>
          </NavLink>
        )}
      </nav>

      {/* Footer user */}
      <div className={`border-t border-sidebar-border ${open ? "px-3 py-4" : "px-2 py-4"}`}>
        <div className={`flex items-center rounded-md bg-sidebar-accent ${open ? "gap-3 px-2 py-2" : "justify-center px-1 py-2"}`}>
          <div className="w-9 h-9 rounded-full bg-sidebar-primary flex items-center justify-center text-sidebar-primary-foreground text-sm font-semibold shrink-0">
            {initial}
          </div>
          {open && (
            <>
              <div className="flex-1 min-w-0 overflow-hidden">
                <div className="text-sm font-medium text-sidebar-accent-foreground truncate">{email || "Utilisateur"}</div>
                <div className="text-xs text-sidebar-foreground/70">Connecté</div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => signOut()} title="Se déconnecter">
                Sortir
              </Button>
            </>
          )}
        </div>
        <div
          className={`text-[10px] text-sidebar-foreground/50 text-center mt-3 h-4 overflow-hidden transition-opacity duration-300 ${
            open ? "opacity-100" : "opacity-0"
          }`}
        >
          © 2026 CrimpControl · v1.0.0
        </div>
      </div>
    </aside>
  );
};
