import { useMemo, useRef, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { SectionCard } from "@/components/dashboard/SectionCard";
import { ControlChart } from "@/components/charts/ControlChart";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { useAppStore } from "@/store/app-store";
import { computeXbarR, buildXbarRefLines, buildRRefLines } from "@/lib/spc-engine";
import { detectSheet } from "@/lib/auto-detect";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { AlertTriangle, CheckCircle2, ZoomIn, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const SPCPage = () => {
  const files = useAppStore((s) => s.files);
  const activeFileIndex = useAppStore((s) => s.activeFileIndex);
  const specs = useAppStore((s) => s.specs);

  // ── Explicit user selections (all local — zero global mapping used) ──
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [selectedSheetIdx, setSelectedSheetIdx] = useState(0);
  const [localMeasureCols, setLocalMeasureCols] = useState<string[] | null>(null);
  const [localSubgroupSize, setLocalSubgroupSize] = useState(specs.subgroupSize);
  const [zoomTarget, setZoomTarget] = useState<number | null>(null);
  const xbarRef = useRef<HTMLDivElement>(null);

  // ── Resolve exactly one file and one sheet — never touches merged data ──
  const defaultFile = files[activeFileIndex ?? 0] ?? files[0] ?? null;
  const selectedFile =
    (selectedFileName ? files.find((f) => f.name === selectedFileName) ?? null : null) ?? defaultFile;
  const selectedSheet =
    selectedFile?.sheets[selectedSheetIdx] ?? selectedFile?.sheets[0] ?? null;

  const handleFileChange = (name: string) => {
    setSelectedFileName(name);
    setSelectedSheetIdx(0);
    setLocalMeasureCols(null); // reset so columns re-detect for new sheet
    setZoomTarget(null);
  };

  const handleSheetChange = (idx: number) => {
    setSelectedSheetIdx(idx);
    setLocalMeasureCols(null);
    setZoomTarget(null);
  };

  // ── Numeric columns of THIS sheet only ──
  const numericCols = useMemo(() => {
    if (!selectedSheet || selectedSheet.rows.length === 0) return [];
    return selectedSheet.headers.filter((h) => {
      const sample = selectedSheet.rows.slice(0, 10).map((r) => Number(r[h]));
      return sample.filter((v) => !isNaN(v)).length >= Math.min(3, sample.length);
    });
  }, [selectedSheet]);

  // ── Auto-detect measure cols from THIS sheet only (used as default) ──
  const detectedMeasureCols = useMemo(() => {
    if (!selectedSheet || numericCols.length === 0) return [];
    const det = (detectSheet(selectedSheet).mapping.measureCols ?? []) as string[];
    const valid = det.filter((c) => numericCols.includes(c));
    return valid.length > 0 ? valid : numericCols.slice(0, 5);
  }, [selectedSheet, numericCols]);

  // Active measure cols: explicit selection filtered to what exists in this sheet,
  // or auto-detected default — NEVER uses global mapping
  const activeMeasureCols = useMemo(() => {
    if (localMeasureCols !== null) {
      const valid = localMeasureCols.filter((c) => numericCols.includes(c));
      return valid.length > 0 ? valid : detectedMeasureCols;
    }
    return detectedMeasureCols;
  }, [localMeasureCols, numericCols, detectedMeasureCols]);

  const activeSubgroupSize = Math.max(2, Math.min(10, localSubgroupSize));

  const toggleCol = (col: string) => {
    const base = localMeasureCols ?? activeMeasureCols;
    if (base.includes(col)) {
      if (base.length === 1) return;
      setLocalMeasureCols(base.filter((c) => c !== col));
    } else {
      setLocalMeasureCols([...base, col]);
    }
  };

  // ── Subgroups from THIS sheet's rows only ──
  const subgroups = useMemo<number[][]>(() => {
    if (!selectedSheet || activeMeasureCols.length === 0) return [];
    if (activeMeasureCols.length >= 2) {
      return selectedSheet.rows
        .map((r) => activeMeasureCols.map((c) => Number(r[c])))
        .filter((row) => row.every((v) => !isNaN(v)));
    }
    const flat = selectedSheet.rows
      .map((r) => Number(r[activeMeasureCols[0]]))
      .filter((v) => !isNaN(v));
    const groups: number[][] = [];
    for (let i = 0; i + activeSubgroupSize <= flat.length; i += activeSubgroupSize) {
      groups.push(flat.slice(i, i + activeSubgroupSize));
    }
    return groups;
  }, [selectedSheet, activeMeasureCols, activeSubgroupSize]);

  const hasData = subgroups.length > 0;
  const xbarR = useMemo(() => (hasData ? computeXbarR(subgroups) : null), [hasData, subgroups]);
  const xbarRefLines = useMemo(() => (xbarR ? buildXbarRefLines(xbarR) : []), [xbarR]);
  const rRefLines = useMemo(() => (xbarR ? buildRRefLines(xbarR) : []), [xbarR]);

  const xbarOutOfControl = useMemo(() => {
    if (!xbarR || xbarRefLines.length === 0) return [];
    const lcs = xbarRefLines[0].y;
    const lci = xbarRefLines[4].y;
    return xbarR.subgroupMeans
      .map((m, i) => ({ m, i }))
      .filter(({ m }) => m > lcs || m < lci)
      .map(({ i }) => i);
  }, [xbarR, xbarRefLines]);

  const anomalies = useMemo(() => {
    if (!xbarR) return [];
    const list: { rule: string; ruleNumber: number | null; pointIndex: number; value: number; type: "OOC" | "WE" }[] = [];
    xbarOutOfControl.forEach((i) =>
      list.push({ rule: "Point hors limites de contrôle (LCS/LCI)", ruleNumber: null, pointIndex: i, value: xbarR.subgroupMeans[i], type: "OOC" })
    );
    xbarR.westernElectric.forEach((r) =>
      list.push({ rule: r.description, ruleNumber: r.rule, pointIndex: r.index, value: xbarR.subgroupMeans[r.index], type: "WE" })
    );
    return list;
  }, [xbarR, xbarOutOfControl]);

  const zoomData = useMemo(() => {
    if (zoomTarget === null || !xbarR) return null;
    const W = 6;
    const start = Math.max(0, zoomTarget - W);
    const end = Math.min(xbarR.subgroupMeans.length, zoomTarget + W + 1);
    return { values: xbarR.subgroupMeans.slice(start, end), outOfControl: [zoomTarget - start], startOffset: start };
  }, [zoomTarget, xbarR]);

  if (files.length === 0) {
    return (
      <AppLayout title="Cartes SPC" subtitle={`${specs.projectName} · Contrôle statistique du procédé`}>
        <EmptyState
          title="Aucune donnée SPC"
          message="Importez votre fichier Excel SPC depuis l'onglet « Données »."
        />
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Cartes SPC" subtitle={`${specs.projectName} · Contrôle statistique du procédé`}>

      {/* ── Source de données ── */}
      <SectionCard
        title={<span className="flex items-center gap-2"><Settings2 className="w-4 h-4 text-primary" />Source de données</span>}
        className="mb-5"
      >
        <div className="flex flex-wrap gap-3 mb-4">
          {/* File selector */}
          <div className="min-w-[200px] flex-1">
            <Label className="text-xs mb-1 block">Fichier</Label>
            <Select value={selectedFile?.name ?? ""} onValueChange={handleFileChange}>
              <SelectTrigger><SelectValue placeholder="Sélectionner un fichier" /></SelectTrigger>
              <SelectContent>
                {files.map((f) => (
                  <SelectItem key={f.name} value={f.name}>{f.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Sheet selector */}
          {selectedFile && selectedFile.sheets.length > 1 && (
            <div className="min-w-[160px] flex-1">
              <Label className="text-xs mb-1 block">Feuille</Label>
              <Select value={String(selectedSheetIdx)} onValueChange={(v) => handleSheetChange(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {selectedFile.sheets.map((s, i) => (
                    <SelectItem key={i} value={String(i)}>{s.name} ({s.rows.length} lignes)</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Subgroup size — only for single column */}
          {activeMeasureCols.length === 1 && (
            <div className="w-36">
              <Label className="text-xs mb-1 block">Taille sous-groupe (n)</Label>
              <Input
                type="number" min={2} max={10}
                value={localSubgroupSize}
                onChange={(e) => setLocalSubgroupSize(Number(e.target.value))}
              />
            </div>
          )}
        </div>

        {/* Column chips */}
        {numericCols.length > 0 ? (
          <div>
            <Label className="text-xs text-muted-foreground mb-2 block">
              Colonnes de mesure — cliquez pour sélectionner / désélectionner
            </Label>
            <div className="flex flex-wrap gap-2">
              {numericCols.map((col) => {
                const active = activeMeasureCols.includes(col);
                return (
                  <button
                    key={col}
                    onClick={() => toggleCol(col)}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                      active
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-muted text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
                    }`}
                  >
                    {col}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              {selectedFile?.name} ·{" "}
              {activeMeasureCols.length >= 2
                ? `${activeMeasureCols.length} colonnes → ${subgroups.length} sous-groupes`
                : `1 colonne groupée par n=${activeSubgroupSize} → ${subgroups.length} sous-groupes`}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Aucune colonne numérique détectée dans cette feuille.</p>
        )}
      </SectionCard>

      {/* ── Charts ── */}
      {!hasData || !xbarR ? (
        <SectionCard className="mb-5">
          <p className="text-sm text-muted-foreground text-center py-6">
            Sélectionnez au moins une colonne numérique pour afficher les cartes.
          </p>
        </SectionCard>
      ) : (
        <>
          <SectionCard title="Carte X̄ - R" className="mb-5">
            <div ref={xbarRef}>
              <div className="text-xs text-muted-foreground font-medium mb-1">
                Carte X̄ (Moyennes) — X̿ = {xbarR.xbar.toFixed(4)}
              </div>
              <ControlChart values={xbarR.subgroupMeans} referenceLines={xbarRefLines} outOfControl={xbarOutOfControl} height={280} />
              <div className="text-xs text-muted-foreground font-medium mb-1 mt-4">
                Carte R (Étendues) — R̄ = {xbarR.rbar.toFixed(4)}
              </div>
              <ControlChart values={xbarR.subgroupRanges} referenceLines={rRefLines} color="hsl(var(--info))" height={220} />
            </div>
          </SectionCard>

          <SectionCard
            title={<span className="flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-warning" />Anomalies détectées<Badge variant="outline">{anomalies.length}</Badge></span>}
            className="mb-5"
          >
            {anomalies.length === 0 ? (
              <div className="flex items-center gap-2 text-success text-sm">
                <CheckCircle2 className="w-5 h-5" /> Aucune anomalie — procédé sous contrôle statistique.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-muted-foreground border-b border-border">
                      <th className="text-left py-2 px-2">Type</th>
                      <th className="text-left py-2 px-2">Règle</th>
                      <th className="text-left py-2 px-2">Point</th>
                      <th className="text-right py-2 px-2">Valeur (X̄)</th>
                      <th className="text-left py-2 px-2 w-24">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {anomalies.map((a, i) => (
                      <tr key={i} className="border-b border-border/50 hover:bg-muted/30">
                        <td className="px-2 py-1.5">
                          <Badge variant="outline" className={a.type === "OOC" ? "bg-destructive/10 text-destructive border-destructive/30" : "bg-warning/10 text-warning border-warning/30"}>
                            {a.type === "OOC" ? "Hors limites" : `Règle WE ${a.ruleNumber ?? ""}`}
                          </Badge>
                        </td>
                        <td className="px-2 py-1.5 text-xs text-muted-foreground">{a.rule}</td>
                        <td className="px-2 py-1.5">#{a.pointIndex + 1}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{a.value.toFixed(4)}</td>
                        <td className="px-2 py-1.5">
                          <Button size="sm" variant="outline" className="h-7 px-2 gap-1" onClick={() => setZoomTarget(a.pointIndex)}>
                            <ZoomIn className="w-3 h-3" /> Zoom
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          {zoomData && zoomTarget !== null && (
            <SectionCard
              title={<span className="flex items-center gap-2"><ZoomIn className="w-4 h-4 text-primary" />Zoom sur le point #{zoomTarget + 1}</span>}
              actions={<Button size="sm" variant="ghost" onClick={() => setZoomTarget(null)}>Fermer</Button>}
            >
              <div className="text-xs text-muted-foreground mb-2">
                Fenêtre ±6 sous-groupes (indices {zoomData.startOffset + 1} → {zoomData.startOffset + zoomData.values.length}).
              </div>
              <ControlChart values={zoomData.values} referenceLines={xbarRefLines} outOfControl={zoomData.outOfControl} height={280} />
            </SectionCard>
          )}
        </>
      )}
    </AppLayout>
  );
};

export default SPCPage;
