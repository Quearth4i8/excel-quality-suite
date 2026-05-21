import { useMemo, useEffect, useRef } from "react";
import { useAppStore, appActions } from "@/store/app-store";
import { SectionCard } from "@/components/dashboard/SectionCard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Target, Plus, Trash2 } from "lucide-react";
import { computeXbarR } from "@/lib/spc-engine";

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

export const SpecsPanel = ({ compact = false }: { compact?: boolean }) => {
  const specs = useAppStore((s) => s.specs);
  const perColumnSpecs = useAppStore((s) => s.perColumnSpecs);
  const mapping = useAppStore((s) => s.mapping);
  const sheet = useAppStore(() => appActions.getAnalysisSheet());

  const measureCols = mapping.measureCols;

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

  const lss = xbar !== null && rbar !== null ? xbar + 0.377 * rbar : null;
  const lsi = xbar !== null && rbar !== null ? xbar - 0.377 * rbar : null;
  const lcs = xbar !== null && rbar !== null ? xbar + 0.594 * rbar : null;
  const lci = xbar !== null && rbar !== null ? xbar - 0.594 * rbar : null;

  const prevLimits = useRef<{ lsl: number; usl: number; target: number } | null>(null);

  useEffect(() => {
    if (lss === null || lsi === null || xbar === null) return;
    const prev = prevLimits.current;
    if (prev && prev.lsl === lsi && prev.usl === lss && prev.target === xbar) return;
    prevLimits.current = { lsl: lsi, usl: lss, target: xbar };
    appActions.setSpecs({ usl: lss, lsl: lsi, target: xbar });
  }, [lss, lsi, xbar]);

  return (
    <SectionCard
      title={
        <span className="flex items-center gap-2">
          <Target className="w-4 h-4 text-primary" />
          Spécifications du projet
        </span>
      }
    >
      <div className={`grid ${compact ? "grid-cols-2" : "grid-cols-2 md:grid-cols-3"} gap-3`}>
        <div>
          <Label className="text-xs">Société</Label>
          <Input
            value={specs.projectName}
            onChange={(e) => appActions.setSpecs({ projectName: e.target.value })}
          />
        </div>
        <div>
          <Label className="text-xs">{"Nom d'échantillon"}</Label>
          <Input
            value={specs.sampleName ?? ""}
            onChange={(e) => appActions.setSpecs({ sampleName: e.target.value })}
            placeholder="Ex: Échantillon A"
          />
        </div>
        <div>
          <Label className="text-xs">Unité</Label>
          <Input value={specs.unit} onChange={(e) => appActions.setSpecs({ unit: e.target.value })} />
        </div>
        <div>
          <Label className="text-xs">Taille sous-groupe (n)</Label>
          <Input
            type="number"
            min={2}
            max={10}
            value={specs.subgroupSize}
            onChange={(e) => appActions.setSpecs({ subgroupSize: Number(e.target.value) })}
          />
        </div>
      </div>

      <div className="mt-5 pt-4 border-t border-border">
        <div className="flex items-center gap-2 mb-3">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">
            Limites calculées automatiquement
          </Label>
          {hasData && (
            <Badge variant="outline" className="text-[10px]">
              X̄={xbar?.toFixed(3)} · R̄={rbar?.toFixed(3)}
            </Badge>
          )}
        </div>
        {!hasData ? (
          <p className="text-xs text-muted-foreground py-3 text-center border border-dashed border-border rounded-lg">
            Importez des données pour calculer les limites automatiquement.
          </p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <ComputedLimit
              label="LSS"
              value={lss}
              formula="X̄ + 0.377·R̄"
              color="text-orange-500"
            />
            <ComputedLimit
              label="LSI"
              value={lsi}
              formula="X̄ − 0.377·R̄"
              color="text-blue-500"
            />
            <ComputedLimit
              label="LCS"
              value={lcs}
              formula="X̄ + 0.594·R̄"
              color="text-destructive"
            />
            <ComputedLimit
              label="LCI"
              value={lci}
              formula="X̄ − 0.594·R̄"
              color="text-success"
            />
          </div>
        )}
      </div>

      {measureCols.length > 0 && (
        <div className="mt-5 pt-4 border-t border-border">
          <div className="flex items-center gap-2 mb-3">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              Spécifications par colonne de mesure
            </Label>
            <Badge variant="outline">{Object.keys(perColumnSpecs).length} surcharge(s)</Badge>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground border-b border-border">
                  <th className="text-left py-1.5 px-2">Colonne</th>
                  <th className="text-left py-1.5 px-2">LSL</th>
                  <th className="text-left py-1.5 px-2">Cible</th>
                  <th className="text-left py-1.5 px-2">USL</th>
                  <th className="text-left py-1.5 px-2 w-20">Action</th>
                </tr>
              </thead>
              <tbody>
                {measureCols.map((col) => {
                  const cs = perColumnSpecs[col];
                  const active = !!cs;
                  const v = cs ?? { lsl: specs.lsl, usl: specs.usl, target: specs.target };
                  return (
                    <tr key={col} className={`border-b border-border/50 ${active ? "bg-accent/20" : ""}`}>
                      <td className="px-2 py-1.5 font-medium">{col}</td>
                      <td className="px-2 py-1.5">
                        <Input
                          className="h-8 text-xs"
                          type="number"
                          step="0.001"
                          value={v.lsl}
                          onChange={(e) =>
                            appActions.setColumnSpec(col, { lsl: Number(e.target.value), usl: v.usl, target: v.target })
                          }
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          className="h-8 text-xs"
                          type="number"
                          step="0.001"
                          value={v.target}
                          onChange={(e) =>
                            appActions.setColumnSpec(col, { target: Number(e.target.value), usl: v.usl, lsl: v.lsl })
                          }
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          className="h-8 text-xs"
                          type="number"
                          step="0.001"
                          value={v.usl}
                          onChange={(e) =>
                            appActions.setColumnSpec(col, { usl: Number(e.target.value), lsl: v.lsl, target: v.target })
                          }
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        {active ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-destructive"
                            onClick={() => appActions.removeColumnSpec(col)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2"
                            onClick={() => appActions.setColumnSpec(col, v)}
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Les colonnes avec spécifications dédiées utilisent leurs propres LSL/USL/Cible pour le calcul de capabilité.
          </p>
        </div>
      )}

      <p className="mt-3 text-xs text-muted-foreground">
        Ces paramètres sont appliqués automatiquement à toutes les analyses et rapports. Sauvegardés dans Supabase.
      </p>
    </SectionCard>
  );
};
