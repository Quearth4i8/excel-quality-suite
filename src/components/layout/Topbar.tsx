import { useMemo, useState } from "react";
import { Bell, HelpCircle, RefreshCw, Calendar, PanelLeft, Trash2, Check, X, BookOpen, Mail, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { notificationActions, useNotificationStore, type AppNotification, type NotificationType } from "@/lib/notifications";
import { cn } from "@/lib/utils";
import { appActions, useAppStore } from "@/store/app-store";
import { Link } from "react-router-dom";

export const Topbar = ({
  title,
  subtitle,
  sidebarOpen,
  onToggleSidebar,
}: {
  title: string;
  subtitle?: string;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}) => {
  const files = useAppStore((s) => s.files);
  const activeFileIndex = useAppStore((s) => s.activeFileIndex);
  const activeSheetIndex = useAppStore((s) => s.activeSheetIndex);
  const mergedSheet = useAppStore((s) => s.mergedSheet);
  const mappingValidated = useAppStore((s) => s.mapping.validated);

  const activeFile = activeFileIndex !== null ? files[activeFileIndex] : null;
  const activeSheet = activeFile && activeSheetIndex !== null ? activeFile.sheets[activeSheetIndex] : null;

  const summary = useMemo(() => {
    if (files.length === 0) return "Aucune donnée";
    if (!activeFile) return `${files.length} fichier(s)`;
    const sheet = activeSheet ? ` · ${activeSheet.name}` : "";
    return `${activeFile.name}${sheet}`;
  }, [activeFile, activeSheet, files.length]);

  return (
    <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b border-border px-3 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <Button
          variant="outline"
          size="icon"
          className="shrink-0 h-9 w-9"
          onClick={onToggleSidebar}
          aria-label={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
        >
          <PanelLeft className="w-4 h-4" />
        </Button>
        <div className="min-w-0">
          <h1 className="text-lg sm:text-2xl font-bold text-foreground tracking-tight truncate">{title}</h1>
          {subtitle && <p className="hidden sm:block text-sm text-muted-foreground mt-0.5 truncate">{subtitle}</p>}
        </div>
      </div>
      <div className="flex items-center gap-1 sm:gap-3">
        <DataStatusPopover
          filesCount={files.length}
          summary={summary}
          activeFileName={activeFile?.name ?? null}
          activeSheetName={activeSheet?.name ?? null}
          activeSheetRows={activeSheet?.rows?.length ?? null}
          mergedRows={mergedSheet?.rows?.length ?? null}
          mergedCols={mergedSheet?.headers?.length ?? null}
          mappingValidated={mappingValidated}
        />
        <Button variant="default" size="sm" className="gap-2 hidden sm:inline-flex" onClick={() => window.location.reload()}>
          <RefreshCw className="w-4 h-4" />
          Actualiser
        </Button>
        <Button variant="default" size="icon" className="sm:hidden h-9 w-9" title="Actualiser" onClick={() => window.location.reload()}>
          <RefreshCw className="w-4 h-4" />
        </Button>
        <NotificationBell />
        <HelpDialog />
      </div>
    </header>
  );
};

const DataStatusPopover = ({
  filesCount,
  summary,
  activeFileName,
  activeSheetName,
  activeSheetRows,
  mergedRows,
  mergedCols,
  mappingValidated,
}: {
  filesCount: number;
  summary: string;
  activeFileName: string | null;
  activeSheetName: string | null;
  activeSheetRows: number | null;
  mergedRows: number | null;
  mergedCols: number | null;
  mappingValidated: boolean;
}) => {
  const files = useAppStore((s) => s.files);
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="hidden sm:flex items-center gap-2 px-2 sm:px-3 py-2 rounded-md border border-border bg-card text-xs sm:text-sm text-muted-foreground hover:bg-muted transition-colors">
          <Calendar className="w-4 h-4 shrink-0" />
          <span className="font-medium text-foreground/80 hidden md:inline">Données en cours</span>
          <span className="text-muted-foreground truncate max-w-[120px] sm:max-w-[220px]">{summary}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-96" align="start">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold">Données chargées</div>
            <div className="text-xs text-muted-foreground">{filesCount} fichier(s)</div>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/data" onClick={() => setOpen(false)}>
              <Button variant="outline" size="sm" className="h-8">
                Ouvrir
              </Button>
            </Link>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-destructive hover:text-destructive"
              disabled={filesCount === 0}
              onClick={() => {
                appActions.clearFiles();
                setOpen(false);
              }}
            >
              <Trash2 className="w-3.5 h-3.5 mr-1" />
              Effacer
            </Button>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          <div className="rounded-md border border-border p-3">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Actif</div>
            {activeFileName ? (
              <div className="text-sm">
                <div className="font-medium truncate">{activeFileName}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {activeSheetName ? (
                    <span>
                      {activeSheetName}
                      {typeof activeSheetRows === "number" ? ` · ${activeSheetRows} ligne(s)` : ""}
                    </span>
                  ) : (
                    <span>Aucune feuille sélectionnée</span>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">Aucun fichier actif</div>
            )}
          </div>

          <div className="rounded-md border border-border p-3">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Fusion</div>
            {typeof mergedRows === "number" && typeof mergedCols === "number" ? (
              <div className="text-sm">
                <span className="font-medium">{mergedRows}</span> lignes · <span className="font-medium">{mergedCols}</span> colonnes
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">Aucune fusion disponible</div>
            )}
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Mappage</span>
            {mappingValidated ? (
              <span className="text-success font-medium">Validé</span>
            ) : (
              <span className="text-muted-foreground">Non validé</span>
            )}
          </div>

          {filesCount > 0 && (
            <div className="pt-2 border-t border-border">
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Fichiers</div>
              <ScrollArea className="max-h-40">
                <div className="space-y-1">
                  {files.map((f, i) => (
                    <button
                      key={`${f.name}-${i}`}
                      className="w-full text-left text-sm px-2 py-1.5 rounded hover:bg-muted transition-colors"
                      onClick={() => {
                        appActions.setActiveFile(i);
                        setOpen(false);
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-medium">{f.name}</span>
                        <span className="text-xs text-muted-foreground shrink-0">{f.sheets.length} feuille(s)</span>
                      </div>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

const typeIcon: Record<NotificationType, { bg: string; icon: React.ReactNode }> = {
  info: { bg: "bg-primary/10 text-primary", icon: <Bell className="w-3.5 h-3.5" /> },
  success: { bg: "bg-success/10 text-success", icon: <Check className="w-3.5 h-3.5" /> },
  warning: { bg: "bg-warning/10 text-warning", icon: <Bell className="w-3.5 h-3.5" /> },
  error: { bg: "bg-destructive/10 text-destructive", icon: <X className="w-3.5 h-3.5" /> },
};

const NotificationBell = () => {
  const items = useNotificationStore((s) => s.items);
  const unread = items.filter((it) => !it.read).length;
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="relative w-9 h-9 rounded-md border border-border bg-card flex items-center justify-center hover:bg-muted transition-colors">
          <Bell className="w-4 h-4 text-muted-foreground" />
          {unread > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-destructive text-destructive-foreground text-[10px] flex items-center justify-center font-semibold">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="font-semibold text-sm">Notifications</div>
          <div className="flex items-center gap-1">
            {unread > 0 && (
              <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={() => notificationActions.markAllRead()}>
                <Check className="w-3 h-3 mr-1" /> Lire tout
              </Button>
            )}
            {items.length > 0 && (
              <Button variant="ghost" size="sm" className="h-7 text-xs px-2 text-destructive hover:text-destructive" onClick={() => notificationActions.clearAll()}>
                <Trash2 className="w-3 h-3 mr-1" /> Effacer
              </Button>
            )}
          </div>
        </div>
        <ScrollArea className="max-h-72">
          {items.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              Aucune notification
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {items.map((n) => (
                <NotificationRow key={n.id} n={n} />
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
};

const NotificationRow = ({ n }: { n: AppNotification }) => {
  const style = typeIcon[n.type];
  return (
    <div
      className={cn(
        "flex items-start gap-3 px-4 py-3 hover:bg-muted/40 transition-colors cursor-pointer",
        !n.read && "bg-accent/20"
      )}
      onClick={() => notificationActions.markRead(n.id)}
    >
      <div className={cn("mt-0.5 w-7 h-7 rounded-full flex items-center justify-center shrink-0", style.bg)}>
        {style.icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{n.title}</div>
        {n.message && <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{n.message}</div>}
        <div className="text-[10px] text-muted-foreground mt-1">
          {new Date(n.createdAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>
      <button
        className="mt-0.5 text-muted-foreground hover:text-destructive transition-colors"
        onClick={(e) => {
          e.stopPropagation();
          notificationActions.dismiss(n.id);
        }}
        aria-label="Supprimer"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};

const HelpDialog = () => {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="w-9 h-9 rounded-md border border-border bg-card flex items-center justify-center hover:bg-muted transition-colors">
          <HelpCircle className="w-4 h-4 text-muted-foreground" />
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HelpCircle className="w-5 h-5 text-primary" />
            Aide & Support
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-5 py-2">
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-foreground">Raccourcis clavier</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="flex items-center justify-between px-3 py-2 rounded-md bg-muted/50">
                <span className="text-muted-foreground">Navigation</span>
                <kbd className="px-1.5 py-0.5 rounded bg-muted text-xs font-mono border">Alt + ←/→</kbd>
              </div>
              <div className="flex items-center justify-between px-3 py-2 rounded-md bg-muted/50">
                <span className="text-muted-foreground">Actualiser</span>
                <kbd className="px-1.5 py-0.5 rounded bg-muted text-xs font-mono border">Ctrl + R</kbd>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-foreground">Modules disponibles</h3>
            <ul className="space-y-1.5 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">
                <BookOpen className="w-3.5 h-3.5 text-primary" />
                SPC — Contrôle statistique des processus
              </li>
              <li className="flex items-center gap-2">
                <BookOpen className="w-3.5 h-3.5 text-success" />
                MSA — Analyse du système de mesure
              </li>
              <li className="flex items-center gap-2">
                <BookOpen className="w-3.5 h-3.5 text-orange-500" />
                Capabilité — Analyse de capabilité process
              </li>
              <li className="flex items-center gap-2">
                <BookOpen className="w-3.5 h-3.5 text-purple-500" />
                Incertitude — Calcul d'incertitude de mesure
              </li>
            </ul>
          </div>

          <div className="pt-2 border-t border-border">
            <a
              href="mailto:support@excelqualitysuite.com"
              className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
            >
              <Mail className="w-4 h-4" />
              Contacter le support
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
