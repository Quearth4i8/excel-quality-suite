import { useMemo, useState } from "react";
import { useAppStore, appActions, DEFAULT_SPECS } from "@/store/app-store";
import type { ProjectSpecs } from "@/store/app-store";
import { SectionCard } from "@/components/dashboard/SectionCard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Target, FileSpreadsheet } from "lucide-react";
import { computeXbarR } from "@/lib/spc-engine";
import { detectSheet } from "@/lib/auto-detect";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ComputedLimit = ({
  label,
  value,
  formula,
  color,
}: {
  label: string;
  value: number | null;
  formula: string;
  color: string;
}) => (
  <div className="rounded-md p-3 border border-border bg-card">
    <div className="flex items-baseline justify-between">
      <div className={`text-xs font-semibold uppercase tracking-wider ${color}`}>{label}</div>
      <div className="text-[9px] text-muted-foreground">{formula}</div>
    </div>
    <div className={`text-lg font-bold tabular-nums mt-1 ${color}`}>
      {value !== null ? value.toFixed(4) : "—"}
    </div>
  </div>
);

export const SpecsPanel = ({ kindFilter }: { kindFilter?: "spc" | "msa" } = {}) => {
  const allFiles = useAppStore((s) => s.files);
  const files = useMemo(() => {
    if (!kindFilter) return allFiles;
    return allFiles.filter((f) =>
      f.sheets.some((sh) => {
        const k = detectSheet(sh).kind;
        if (kindFilter === "spc") return k === "spc" || k === "spc-card";
        if (kindFilter === "msa") return k === "msa" || k === "msa-rr";
        return false;
      })
    );
  }, [allFiles, kindFilter]);
  const activeFileIndex = useAppStore((s) => s.activeFileIndex);
  const fileSpecs = useAppStore((s) => s.fileSpecs);
  const globalSpecs = useAppStore((s) => s.specs);
  const mapping = useAppStore((s) => s.mapping);
  const sheet = useAppStore(() => appActions.getAnalysisSheet());

  // Which file's specs we're editing (null = fallback to active file)
  const [editFileNameState, setEditFileNameState] = useState<string | null>(null);

  const activeFileName = activeFileIndex !== null ? files[activeFileIndex]?.name ?? null : null;

  // Resolve: explicit selection (if file still exists) → active file → null
  const editFileName = (editFileNameState && files.some(f => f.name === editFileNameState))
    ? editFileNameState
    : activeFileName;

  // Get specs for the editing file, falling back to global
  const specs: ProjectSpecs = editFileName && fileSpecs[editFileName]
    ? { ...DEFAULT_SPECS, ...fileSpecs[editFileName] }
    : globalSpecs;

  const setSpecs = (patch: Partial<ProjectSpecs>) => {
    if (editFileName) {
      appActions.setFileSpecs(editFileName, patch);
    } else {
      appActions.setSpecs(patch);
    }
  };

  // Auto-calculated control limits (read-only display, computed from active analysis sheet)
  const subgroups = useMemo<number[][]>(() => {
    if (!sheet || mapping.measureCols.length === 0) return [];
    if (mapping.measureCols.length >= 2) {
      return sheet.rows
        .map((r) => mapping.measureCols.map((c) => Number(r[c])))
        .filter((row) => row.every((v) => !isNaN(v)));
    }
    const flat = sheet.rows.map((r) => Number(r[mapping.measureCols[0]])).filter((v) => !isNaN(v));
    const n = Math.max(2, Math.min(10, specs.subgroupSize));
    const groups: number[][] = [];
    for (let i = 0; i + n <= flat.length; i += n) groups.push(flat.slice(i, i + n));
    return groups;
  }, [sheet, mapping.measureCols, specs.subgroupSize]);

  const spcResult = useMemo(
    () => (subgroups.length > 0 ? computeXbarR(subgroups) : null),
    [subgroups]
  );

  const hasData = spcResult !== null;
  const xbar = spcResult?.xbar ?? null;
  const rbar = spcResult?.rbar ?? null;

  const lcs = xbar !== null && rbar !== null ? xbar + 0.594 * rbar : null;
  const lss = xbar !== null && rbar !== null ? xbar + 0.377 * rbar : null;
  const lsi = xbar !== null && rbar !== null ? xbar - 0.377 * rbar : null;
  const lci = xbar !== null && rbar !== null ? xbar - 0.594 * rbar : null;

  return (
    <SectionCard
      title={
        <span className="flex items-center gap-2">
          <Target className="w-4 h-4 text-primary" />
          Spécifications du projet
        </span>
      }
    >
      {/* File selector — only shown when files are loaded */}
      {files.length > 0 && (
        <div className="mb-4 pb-4 border-b border-border">
          <Label className="text-xs flex items-center gap-1.5 mb-1.5">
            <FileSpreadsheet className="w-3.5 h-3.5 text-primary" />
            Fichier actif
          </Label>
          <Select
            value={editFileName ?? ""}
            onValueChange={(v) => setEditFileNameState(v || null)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Sélectionner un fichier" />
            </SelectTrigger>
            <SelectContent>
              {files.map((f) => (
                <SelectItem key={f.name} value={f.name}>
                  {f.name}
                  {f.name === activeFileName && (
                    <span className="ml-2 text-[10px] text-muted-foreground">(actif)</span>
                  )}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {editFileName && editFileName !== activeFileName && (
            <p className="mt-1.5 text-[11px] text-amber-500">
              Vous éditez les spécifications de <strong>{editFileName}</strong> — ce n'est pas le fichier actif pour les analyses.
            </p>
          )}
        </div>
      )}

      {/* Row 1: project identity */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <Label className="text-xs">Société</Label>
          <Input
            value={specs.projectName}
            onChange={(e) => setSpecs({ projectName: e.target.value })}
          />
        </div>
        <div>
          <Label className="text-xs">{"Nom d'échantillon"}</Label>
          <Input
            value={specs.sampleName ?? ""}
            onChange={(e) => setSpecs({ sampleName: e.target.value })}
            placeholder="Ex: Échantillon A"
          />
        </div>
        <div>
          <Label className="text-xs">Unité</Label>
          <Input value={specs.unit} onChange={(e) => setSpecs({ unit: e.target.value })} />
        </div>
      </div>

      {/* Row 2: process + spec values */}
      <div className="grid grid-cols-4 gap-3 mt-3">
        <div>
          <Label className="text-xs">Taille sous-groupe (n)</Label>
          <Input
            type="number"
            min={2}
            max={10}
            value={specs.subgroupSize}
            onChange={(e) => setSpecs({ subgroupSize: Number(e.target.value) })}
          />
        </div>
        <div>
          <Label className="text-xs">Cible</Label>
          <Input
            type="number"
            step="0.001"
            value={specs.target}
            onChange={(e) => setSpecs({ target: Number(e.target.value) })}
            placeholder="Ex: 10.000"
          />
        </div>
        <div>
          <Label className="text-xs">Tolérance inf. LSL (−ΔT)</Label>
          <Input
            type="number"
            step="0.001"
            value={specs.lsl}
            onChange={(e) => setSpecs({ lsl: Number(e.target.value) })}
            placeholder="Ex: -0.050"
          />
        </div>
        <div>
          <Label className="text-xs">Tolérance sup. USL (+ΔT)</Label>
          <Input
            type="number"
            step="0.001"
            value={specs.usl}
            onChange={(e) => setSpecs({ usl: Number(e.target.value) })}
            placeholder="Ex: 0.050"
          />
        </div>
      </div>

      {/* Auto-calculated control limits (read-only display) */}
      <div className="mt-5 pt-4 border-t border-border">
        <div className="flex items-center gap-2 mb-3">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">
            Limites de contrôle calculées
          </Label>
          {hasData && (
            <Badge variant="outline" className="text-[10px]">
              X̿={xbar?.toFixed(3)} · R̄={rbar?.toFixed(3)}
            </Badge>
          )}
        </div>
        {!hasData ? (
          <p className="text-xs text-muted-foreground py-3 text-center border border-dashed border-border rounded-lg">
            Importez des données pour calculer les limites automatiquement.
          </p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <ComputedLimit label="LSS" value={lss} formula="X̿ + 0.377·R̄" color="text-orange-500" />
            <ComputedLimit label="LSI" value={lsi} formula="X̿ − 0.377·R̄" color="text-blue-500" />
            <ComputedLimit label="LCS" value={lcs} formula="X̿ + 0.594·R̄" color="text-destructive" />
            <ComputedLimit label="LCI" value={lci} formula="X̿ − 0.594·R̄" color="text-success" />
          </div>
        )}
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Ces paramètres sont propres à chaque fichier et appliqués automatiquement aux analyses et rapports. Sauvegardés dans Supabase.
      </p>
    </SectionCard>
  );
};
