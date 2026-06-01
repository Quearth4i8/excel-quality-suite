import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { SectionCard } from "@/components/dashboard/SectionCard";
import { Button } from "@/components/ui/button";
import { useAppStore, appActions } from "@/store/app-store";
import { parseExcelFile } from "@/lib/excel";
import {
  Upload, FileSpreadsheet, Trash2, Eye, Wand2,
  Layers, CheckCircle2, Play, TableProperties, BarChart2, Users, ChevronLeft,
} from "lucide-react";
import { detectSheet } from "@/lib/auto-detect";
import { DEMO_SUBGROUPS, DEMO_MSA } from "@/lib/demo-data";
import { toast } from "sonner";
import { notificationActions } from "@/lib/notifications";
import { MappingWizard } from "@/components/wizard/MappingWizard";
import { ManualDataTable } from "@/components/data/ManualDataTable";
import { SpecsPanel } from "@/components/specs/SpecsPanel";
import { MSASpecsPanel } from "@/components/specs/MSASpecsPanel";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

interface DataPageProps {
  mode: "spc" | "msa";
}

const DataPage = ({ mode }: DataPageProps) => {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const files = useAppStore((s) => s.files);
  const activeFileIndex = useAppStore((s) => s.activeFileIndex);
  const activeSheetIndex = useAppStore((s) => s.activeSheetIndex);
  const mergedSheet = useAppStore((s) => s.mergedSheet);
  const mapping = useAppStore((s) => s.mapping);
  const [isDragging, setIsDragging] = useState(false);
  const [showMerged, setShowMerged] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);

  const isSpc = mode === "spc";

  const isFileOfMode = (f: (typeof files)[number]) => {
    if (f.uploadMode) return f.uploadMode === mode;
    return f.sheets.some((s) => {
      const k = detectSheet(s).kind;
      return isSpc ? k === "spc" || k === "spc-card" : k === "msa" || k === "msa-rr";
    });
  };

  const modeFileIndices = files.reduce<number[]>((acc, f, i) => {
    if (isFileOfMode(f)) acc.push(i);
    return acc;
  }, []);

  const activeFile = activeFileIndex !== null ? files[activeFileIndex] : null;
  const activeSheet = activeFile && activeSheetIndex !== null ? activeFile.sheets[activeSheetIndex] : null;
  const displaySheet = showMerged && mergedSheet ? mergedSheet : activeSheet;

  const processFiles = async (list: FileList | null) => {
    if (!list) return;
    let imported = 0;
    for (const f of Array.from(list)) {
      try {
        const parsed = await parseExcelFile(f);
        parsed.uploadMode = mode;
        appActions.addFile(parsed);
        imported++;
      } catch (err: any) {
        toast.error("Erreur d'import", { description: err.message });
        notificationActions.add({ type: "error", title: `Erreur d'import : ${f.name}`, message: err.message });
      }
    }
    if (imported > 0) {
      const det = (appActions as any)._lastDetection as any;
      const parts: string[] = [];
      if (det?.spcCard) parts.push("Carte SPC");
      if (det?.msaRR) parts.push("MSA R&R");
      if (det?.spc) parts.push(`SPC : ${det.spc.measures} colonne(s)`);
      if (det?.msa) parts.push("MSA : Pièce/Opérateur détectés");

      const desc = parts.length
        ? `Mappage automatique — ${parts.join(" · ")}`
        : "Aucune structure reconnue — utilisez l'assistant de mappage.";

      if (parts.length) {
        toast.success(`${imported} fichier(s) importé(s)`, { description: desc });
        notificationActions.add({ type: "success", title: `${imported} fichier(s) importé(s)`, message: desc });
      } else {
        toast.warning(`${imported} fichier(s) importé(s)`, { description: desc });
        notificationActions.add({ type: "warning", title: `${imported} fichier(s) importé(s)`, message: desc });
      }
    }
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => processFiles(e.target.files);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    processFiles(e.dataTransfer.files);
  };

  const loadDemoData = () => {
    if (isSpc) {
      const spcRows = DEMO_SUBGROUPS.map((g, i) => {
        const row: Record<string, any> = { Subgroup: i + 1 };
        g.forEach((v, j) => { row[`M${j + 1}`] = v; });
        return row;
      });
      appActions.addFile({
        name: "demo-spc.xlsx",
        sheets: [{ name: "SPC_Demo", headers: ["Subgroup", "M1", "M2", "M3", "M4", "M5"], rows: spcRows, matrix: [] }],
        importedAt: new Date().toISOString(),
        uploadMode: "spc",
      });
      appActions.setMapping({ measureCols: ["M1", "M2", "M3", "M4", "M5"], validated: true });
      appActions.setSpecs({ subgroupSize: 5 });
      toast.success("Données SPC de démonstration chargées");
    } else {
      appActions.addFile({
        name: "demo-msa.xlsx",
        sheets: [{
          name: "MSA_Demo",
          headers: ["Part", "Operator", "Trial", "Measurement"],
          rows: DEMO_MSA.map((e) => ({ Part: e.part, Operator: e.operator, Trial: e.trial, Measurement: e.value })),
          matrix: [],
        }],
        importedAt: new Date().toISOString(),
        uploadMode: "msa",
      });
      toast.success("Données MSA de démonstration chargées");
    }
    notificationActions.add({ type: "info", title: "Données de démonstration chargées", message: `${isSpc ? "SPC" : "MSA"} prêt pour test.` });
  };

  return (
    <AppLayout
      title={isSpc ? "Données SPC" : "Données MSA (R&R)"}
      subtitle={isSpc
        ? "Importation et saisie des données de contrôle statistique"
        : "Importation et saisie des données pour l'analyse R&R"}
    >
      {/* Back link */}
      <div className="mb-4">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 -ml-2 text-muted-foreground"
          onClick={() => navigate("/data")}
        >
          <ChevronLeft className="w-4 h-4" />
          Données
        </Button>
      </div>

      {/* ── Import methods ── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 mb-5">

        {/* File import */}
        <SectionCard className="lg:col-span-3 flex flex-col">
          <div
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={`relative rounded-xl border-2 border-dashed p-10 text-center cursor-pointer transition-all ${
              isDragging
                ? "border-primary bg-primary/10 scale-[1.01]"
                : "border-border hover:border-primary/50 hover:bg-primary/5"
            }`}
          >
            <div className="flex flex-col items-center gap-3 pointer-events-none">
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-colors ${
                isDragging ? "bg-primary/20" : "bg-muted"
              }`}>
                <Upload className={`w-7 h-7 ${isDragging ? "text-primary" : "text-muted-foreground"}`} />
              </div>
              <div>
                <p className="font-semibold text-foreground">
                  {isDragging ? "Déposez vos fichiers…" : "Glisser-déposer ou cliquer pour importer"}
                </p>
                <p className="text-sm text-muted-foreground mt-1">Sélection multiple supportée</p>
              </div>
              <div className="flex items-center gap-1.5">
                {[".xlsx", ".xls", ".csv"].map((ext) => (
                  <span key={ext} className="px-2 py-0.5 rounded-md bg-muted text-xs font-mono text-muted-foreground">
                    {ext}
                  </span>
                ))}
              </div>
            </div>
            <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" multiple onChange={handleUpload} className="hidden" />
          </div>

          {/* Actions */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button onClick={() => setWizardOpen(true)} size="sm" className="gap-2">
              <Wand2 className="w-3.5 h-3.5" />
              Assistant de mappage
            </Button>
            <Button onClick={loadDemoData} variant="outline" size="sm" className="gap-2">
              <Play className="w-3.5 h-3.5" />
              Données de démo
            </Button>
            {modeFileIndices.length > 1 && (
              <Button
                variant={showMerged ? "default" : "outline"}
                size="sm"
                onClick={() => setShowMerged((v) => !v)}
                className="gap-2"
              >
                <Layers className="w-3.5 h-3.5" />
                {showMerged ? "Vue fusionnée" : "Voir la fusion"}
              </Button>
            )}
            {mapping.validated && (
              <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-success font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" /> Mappage validé
              </span>
            )}
          </div>

          {/* Format hint */}
          <div className="mt-3 pt-3 border-t border-border">
            {isSpc ? (
              <span className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">SPC</span> — Sous-groupe · Mesure1 · Mesure2…
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">MSA</span> — Pièce · Opérateur · Essai · Valeur
              </span>
            )}
          </div>
        </SectionCard>

        {/* Manual entry */}
        <SectionCard className="lg:col-span-2">
          <div className="h-full flex flex-col items-center justify-center text-center py-4 gap-4 min-h-[200px]">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${isSpc ? "bg-blue-500/10" : "bg-violet-500/10"}`}>
              {isSpc
                ? <BarChart2 className="w-7 h-7 text-blue-500" />
                : <Users className="w-7 h-7 text-violet-500" />
              }
            </div>
            <div>
              <p className="font-semibold text-foreground">Saisie manuelle</p>
              <p className="text-sm text-muted-foreground mt-1.5 max-w-[220px] mx-auto leading-relaxed">
                {isSpc
                  ? "Créez un tableau SPC (sous-groupes & mesures) sans fichier Excel"
                  : "Créez un tableau MSA (Pièce · Opérateur · Essai · Valeur) sans fichier Excel"
                }
              </p>
            </div>
            <Button onClick={() => setManualOpen(true)} variant="outline" className="gap-2">
              <TableProperties className="w-4 h-4" />
              Ouvrir l'éditeur
            </Button>
          </div>
        </SectionCard>
      </div>

      {/* ── File list (filtered by mode) ── */}
      {modeFileIndices.length > 0 && (
        <SectionCard
          title={
            <span className="flex items-center justify-between w-full pr-1">
              <span>Fichiers {isSpc ? "SPC" : "MSA"} ({modeFileIndices.length})</span>
              {modeFileIndices.length > 1 && mergedSheet && (
                <span className="text-xs font-normal text-muted-foreground flex items-center gap-1">
                  <Layers className="w-3.5 h-3.5 text-primary" />
                  Fusion : {mergedSheet.rows.length} lignes · {mergedSheet.headers.length} colonnes
                </span>
              )}
            </span>
          }
          className="mb-5"
        >
          <div className="space-y-2">
            {modeFileIndices.map((origIdx) => {
              const f = files[origIdx];
              const totalRows = f.sheets.reduce((acc, s) => acc + s.rows.length, 0);
              const isActive = origIdx === activeFileIndex;
              return (
                <div
                  key={origIdx}
                  className={`flex items-center gap-3 p-3 rounded-lg border transition-colors cursor-default ${
                    isActive ? "border-primary/40 bg-primary/5" : "border-border hover:bg-muted/40"
                  }`}
                >
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                    isActive ? "bg-primary/15" : "bg-muted"
                  }`}>
                    <FileSpreadsheet className={`w-[18px] h-[18px] ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{f.name}</span>
                      {isActive && (
                        <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-primary/15 text-primary font-semibold">
                          Actif
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {f.sheets.length} feuille(s) · {totalRows} ligne(s)
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0"
                      onClick={() => { appActions.setActiveFile(origIdx); setShowMerged(false); setPreviewOpen(true); }}
                      title="Prévisualiser"
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => appActions.removeFile(origIdx)}
                      title="Supprimer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </SectionCard>
      )}

      {/* ── Specs ── */}
      <div className="mb-5">
        {isSpc ? <SpecsPanel kindFilter="spc" /> : <MSASpecsPanel />}
      </div>

      {/* ── Preview dialog ── */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] p-0 gap-0">
          <DialogHeader className="px-6 pt-6 pb-3 pr-14 flex flex-row items-center justify-between space-y-0">
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-primary" />
              {showMerged && mergedSheet
                ? `Fusion globale (${files.length} fichiers)`
                : `Prévisualisation : ${activeFile?.name}`}
            </DialogTitle>
            {!showMerged && activeFile && (
              <Select value={String(activeSheetIndex)} onValueChange={(v) => appActions.setActiveSheet(Number(v))}>
                <SelectTrigger className="w-48 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {activeFile.sheets.map((s, i) => (
                    <SelectItem key={i} value={String(i)}>{s.name} ({s.rows.length} lignes)</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </DialogHeader>
          <ScrollArea className="max-h-[calc(85vh-80px)] px-6 pb-6">
            {displaySheet ? (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card z-10">
                  <tr className="text-muted-foreground border-b border-border">
                    <th className="px-3 py-2 text-left font-medium w-12">#</th>
                    {displaySheet.headers.map((h, i) => (
                      <th key={i} className="px-3 py-2 text-left font-medium whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displaySheet.rows.slice(0, 200).map((r, i) => (
                    <tr key={i} className="border-b border-border/50 hover:bg-muted/30">
                      <td className="px-3 py-1.5 text-muted-foreground">{i + 1}</td>
                      {displaySheet.headers.map((h, j) => (
                        <td key={j} className="px-3 py-1.5 tabular-nums">{r[h] ?? "-"}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="text-sm text-muted-foreground text-center py-8">Aucune donnée à afficher</div>
            )}
            {displaySheet && displaySheet.rows.length > 200 && (
              <div className="text-xs text-muted-foreground text-center py-3">
                Affichage des 200 premières lignes sur {displaySheet.rows.length}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <MappingWizard open={wizardOpen} onOpenChange={setWizardOpen} />
      <ManualDataTable open={manualOpen} onOpenChange={setManualOpen} mode={mode} />
    </AppLayout>
  );
};

export default DataPage;
