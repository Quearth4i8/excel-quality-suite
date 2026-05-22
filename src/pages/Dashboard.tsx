import { useMemo } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { SectionCard } from "@/components/dashboard/SectionCard";
import { ControlChart } from "@/components/charts/ControlChart";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { useAppStore, appActions } from "@/store/app-store";
import {
  computeXbarR,
  computeCapability,
  computeMSA,
  buildHistogram,
  normalPdf,
  mean,
  MSAEntry,
  buildXbarRefLines,
  buildRRefLines,
} from "@/lib/spc-engine";
import {
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Line,
  ComposedChart,
  PieChart,
  Pie,
  Cell,
  Legend,
  CartesianGrid,
  ReferenceLine,
} from "recharts";

const Dashboard = () => {
  const specs = useAppStore((s) => s.specs);
  const mapping = useAppStore((s) => s.mapping);
  const filesCount = useAppStore((s) => s.files.length);

  // Sheets dedicated to each analysis kind (auto-detected at import).
  const spcSheet = useAppStore(() => appActions.getSheetForKind("spc"));
  const msaSheet = useAppStore(() => appActions.getSheetForKind("msa"));

  // SPC subgroups — STRICTLY from imported file. No demo fallback.
  const subgroups = useMemo<number[][]>(() => {
    if (!spcSheet || mapping.measureCols.length === 0) return [];
    if (mapping.measureCols.length >= 2) {
      return spcSheet.rows
        .map((r) => mapping.measureCols.map((c) => Number(r[c])))
        .filter((row) => row.every((v) => !isNaN(v)));
    }
    const col = mapping.measureCols[0];
    const flat = spcSheet.rows.map((r) => Number(r[col])).filter((v) => !isNaN(v));
    const n = Math.max(2, Math.min(10, specs.subgroupSize));
    const groups: number[][] = [];
    for (let i = 0; i + n <= flat.length; i += n) groups.push(flat.slice(i, i + n));
    return groups;
  }, [spcSheet, mapping.measureCols, specs.subgroupSize]);

  const flatValues = useMemo(() => subgroups.flat(), [subgroups]);
  const hasSpc = subgroups.length > 0;

  // MSA entries — STRICTLY from imported MSA file.
  const msaEntries = useMemo<MSAEntry[]>(() => {
    if (!msaSheet || !mapping.partCol || !mapping.operatorCol || !mapping.valueCol) return [];
    return msaSheet.rows
      .map((r, i) => ({
        part: r[mapping.partCol!] ?? "",
        operator: r[mapping.operatorCol!] ?? "",
        trial: mapping.trialCol ? Number(r[mapping.trialCol]) : i,
        value: Number(r[mapping.valueCol!]),
      }))
      .filter((e) => e.part !== "" && e.operator !== "" && !isNaN(e.value));
  }, [msaSheet, mapping]);
  const hasMsa = msaEntries.length > 0;

  // Compute on imported data only
  const spc = useMemo(() => (hasSpc ? computeXbarR(subgroups) : null), [hasSpc, subgroups]);
  const cap = useMemo(
    () => (hasSpc ? computeCapability(flatValues, specs.lsl, specs.usl, specs.target, specs.subgroupSize) : null),
    [hasSpc, flatValues, specs]
  );
  const msa = useMemo(() => (hasMsa ? computeMSA(msaEntries) : null), [hasMsa, msaEntries]);

  const hist = useMemo(() => {
    if (!cap || flatValues.length === 0) return [];
    const h = buildHistogram(flatValues, 18);
    const sigma = cap.stdLongTerm || 0.001;
    const maxCount = Math.max(...h.map((d) => d.count), 1);
    const maxPdf = normalPdf(cap.mean, cap.mean, sigma);
    return h.map((d) => ({
      ...d,
      pdf: maxPdf > 0 ? (normalPdf(d.bin, cap.mean, sigma) / maxPdf) * maxCount : 0,
    }));
  }, [flatValues, cap]);

  // No data → render only the empty state
  if (!hasSpc && !hasMsa) {
    return (
      <AppLayout
        title={`Tableau de bord — ${specs.projectName}`}
        subtitle="En attente de vos fichiers Excel"
      >
        <EmptyState
          title={filesCount === 0 ? "Aucun fichier importé" : "Données non interprétables"}
          message={
            filesCount === 0
              ? "Importez vos fichiers Excel (un fichier SPC/Capabilité avec colonnes de mesures, et un fichier MSA avec Pièce/Opérateur/Mesure) depuis l'onglet « Données ». L'application détecte automatiquement leur structure et génère tous les calculs et diagrammes à partir de vos valeurs — rien n'est affiché tant qu'aucune donnée n'est chargée."
              : "Les fichiers importés n'ont pas pu être interprétés automatiquement. Ouvrez l'assistant de mappage dans l'onglet « Données » pour assigner manuellement les colonnes."
          }
        />
      </AppLayout>
    );
  }

  const isInControl = spc ? spc.outOfControl.length === 0 : true;
  const trendMean = spc?.subgroupMeans ?? [];
  const trendRange = spc?.subgroupRanges ?? [];
  const trendCpk = cap ? trendMean.map((m) => Math.abs(cap.cpk + (m - cap.mean) * 5)) : [];
  const trendPpk = cap ? trendMean.map((m) => Math.abs(cap.ppk + (m - cap.mean) * 4)) : [];
  const uVal = cap && cap.stdLongTerm > 0 ? (cap.stdLongTerm / Math.sqrt(flatValues.length)) * 2 : 0;
  const trendU = trendMean.map(() => uVal);

  const msaPie = msa
    ? [
        { name: `EV (${msa.evPct.toFixed(1)}%)`, value: msa.evPct, color: "hsl(var(--primary))" },
        { name: `AV (${msa.avPct.toFixed(1)}%)`, value: msa.avPct, color: "hsl(var(--purple))" },
        { name: `PV (${msa.pvPct.toFixed(1)}%)`, value: msa.pvPct, color: "hsl(var(--success))" },
      ]
    : [];

  const tableRows = subgroups.slice(0, 5);

  return (
    <AppLayout
      title={`Tableau de bord — ${specs.projectName}`}
      subtitle="Analyse en direct des fichiers Excel importés"
    >
      {/* KPI Row — only the KPIs that have a data source */}
      {hasSpc && cap && spc && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-5">
          <div className="bg-card rounded-xl border border-border shadow-card p-4 flex flex-col gap-2">
            <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">État du processus</div>
            <div className="flex items-center gap-3 py-2">
              {isInControl ? (
                <CheckCircle2 className="w-10 h-10 text-success" />
              ) : (
                <AlertTriangle className="w-10 h-10 text-warning" />
              )}
              <div>
                <div className={`font-bold text-sm ${isInControl ? "text-success" : "text-warning"}`}>
                  {isInControl ? "SOUS CONTRÔLE" : "HORS CONTRÔLE"}
                </div>
                <div className="text-xs text-muted-foreground">
                  {spc.outOfControl.length === 0 ? "Aucun point hors limites" : `${spc.outOfControl.length} point(s) détecté(s)`}
                </div>
              </div>
            </div>
          </div>

          <KpiCard label="Moyenne globale (X̄)" value={cap.mean.toFixed(3)} unit={specs.unit} accent="success" trend={trendMean} />
          <KpiCard label="Écart type global (σ)" value={cap.stdLongTerm.toFixed(3)} unit={specs.unit} accent="info" trend={trendRange} />
          <KpiCard label="Cpk" value={cap.cpk.toFixed(2)} subtitle="Capabilité court terme" accent="primary" trend={trendCpk} trendType="bar" />
          <KpiCard label="Ppk" value={cap.ppk.toFixed(2)} subtitle="Performance long terme" accent="purple" trend={trendPpk} trendType="bar" />
          <KpiCard label="Incertitude (U)" value={uVal.toFixed(4)} unit={specs.unit} accent="orange" trend={trendU} />
        </div>
      )}

      {/* Row: data table + control charts (SPC) */}
      {hasSpc && spc && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 mb-5">
          <SectionCard title="1. Données (sous-groupes)">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground border-b border-border">
                    <th className="px-2 py-2 text-left font-medium">Sous-groupe</th>
                    {Array.from({ length: spc.n }).map((_, i) => (
                      <th key={i} className="px-2 py-2 text-left font-medium">Mesure {i + 1}</th>
                    ))}
                    <th className="px-2 py-2 text-left font-medium">Moyenne (X̄)</th>
                    <th className="px-2 py-2 text-left font-medium">Étendue (R)</th>
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map((g, i) => (
                    <tr key={i} className="border-b border-border/50 hover:bg-muted/30">
                      <td className="px-2 py-2 font-medium">{i + 1}</td>
                      {g.map((v, j) => (
                        <td key={j} className="px-2 py-2 tabular-nums">{v.toFixed(3)}</td>
                      ))}
                      <td className="px-2 py-2 tabular-nums font-semibold text-primary">{mean(g).toFixed(3)}</td>
                      <td className="px-2 py-2 tabular-nums">{(Math.max(...g) - Math.min(...g)).toFixed(3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
              <div className="text-xs text-muted-foreground space-y-1">
                <div>Total sous-groupes : <span className="font-semibold text-foreground">{subgroups.length}</span></div>
                <div>Taille du sous-groupe : <span className="font-semibold text-foreground">{spc.n}</span></div>
                <div>Source : <span className="font-semibold text-foreground">Fichier Excel importé</span></div>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="2. Cartes de contrôle (X̄ - R)">
            <div className="text-xs text-muted-foreground mb-1 font-medium">Carte X̄ (Moyennes)</div>
            <ControlChart
              values={spc.subgroupMeans}
              referenceLines={buildXbarRefLines(spc)}
              outOfControl={spc.outOfControl}
              height={180}
            />
            <div className="text-xs text-muted-foreground mb-1 mt-3 font-medium">Carte R (Étendues)</div>
            <ControlChart
              values={spc.subgroupRanges}
              referenceLines={buildRRefLines(spc)}
              color="hsl(var(--info))"
              height={150}
            />
          </SectionCard>
        </div>
      )}

      {/* Row: capability + uncertainty (SPC) */}
      {hasSpc && cap && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 mb-5">
          <SectionCard title="3. Capabilité Process">
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-1 space-y-2 text-sm">
                <Spec label="USL (Limite sup.)" value={`${specs.usl} ${specs.unit}`} />
                <Spec label="LSL (Limite inf.)" value={`${specs.lsl} ${specs.unit}`} />
                <Spec label="Cible (Target)" value={`${specs.target} ${specs.unit}`} />
                <Spec label="Moyenne (X̄)" value={`${cap.mean.toFixed(3)} ${specs.unit}`} />
                <Spec label="Écart type (σ)" value={`${cap.stdLongTerm.toFixed(3)} ${specs.unit}`} />
              </div>
              <div className="col-span-1 h-44">
                <ResponsiveContainer>
                  <ComposedChart data={hist} margin={{ top: 10, right: 5, left: -20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="label" tick={{ fontSize: 9 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={{ fontSize: 9 }} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 11 }} />
                    <ReferenceLine x={specs.lsl.toFixed(2)} stroke="hsl(var(--destructive))" strokeDasharray="3 3" label={{ value: "LSL", fill: "hsl(var(--destructive))", fontSize: 10 }} />
                    <ReferenceLine x={specs.usl.toFixed(2)} stroke="hsl(var(--destructive))" strokeDasharray="3 3" label={{ value: "USL", fill: "hsl(var(--destructive))", fontSize: 10 }} />
                    <ReferenceLine x={specs.target.toFixed(2)} stroke="hsl(var(--success))" strokeDasharray="3 3" label={{ value: "Cible", fill: "hsl(var(--success))", fontSize: 10 }} />
                    <Bar dataKey="count" fill="hsl(var(--primary))" opacity={0.8} radius={[2, 2, 0, 0]} />
                    <Line type="monotone" dataKey="pdf" stroke="hsl(var(--purple))" strokeWidth={2} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <div className="col-span-1 grid grid-cols-2 gap-2 text-sm content-start">
                <Stat label="Cp" value={cap.cp.toFixed(2)} accent="primary" />
                <Stat label="Cpk" value={cap.cpk.toFixed(2)} accent={cap.cpk >= 1.33 ? "success" : cap.cpk >= 1 ? "warning" : "destructive"} />
                <Stat label="Pp" value={cap.pp.toFixed(2)} accent="primary" />
                <Stat label="Ppk" value={cap.ppk.toFixed(2)} accent={cap.ppk >= 1.33 ? "success" : cap.ppk >= 1 ? "warning" : "destructive"} />
              </div>
            </div>
          </SectionCard>

          <SectionCard title="4. Incertitude de mesure">
            <div className="grid grid-cols-2 gap-4 items-center">
              <UncertaintyGauge value={uVal} max={Math.max(uVal * 2, 0.02)} />
              <div className="space-y-2 text-sm">
                <Spec label="Type d'incertitude" value="Type A" />
                <Spec label="N (mesures)" value={String(flatValues.length)} />
                <Spec label="Écart type (s)" value={cap.stdLongTerm.toFixed(4) + " " + specs.unit} />
                <Spec label="Incertitude (u)" value={(uVal / 2).toFixed(5) + " " + specs.unit} />
                <Spec label="Incertitude élargie (U)" value={uVal.toFixed(5) + " " + specs.unit} />
                <Spec label="Facteur k" value="2" />
              </div>
            </div>
          </SectionCard>
        </div>
      )}

      {/* Row: MSA + interpretation */}
      {(hasMsa || hasSpc) && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          {hasMsa && msa ? (
            <SectionCard title="5. MSA – R&R (Répétabilité & Reproductibilité)">
              <div className="grid grid-cols-2 gap-4 items-center">
                <div>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-muted-foreground border-b border-border">
                        <th className="text-left py-2 font-medium">Source</th>
                        <th className="text-right py-2 font-medium">Écart (s)</th>
                        <th className="text-right py-2 font-medium">% Contrib.</th>
                        <th className="text-right py-2 font-medium">% Study</th>
                      </tr>
                    </thead>
                    <tbody className="tabular-nums">
                      <tr className="border-b border-border/50"><td className="py-1.5">Répétabilité (EV)</td><td className="text-right">{msa.ev.toFixed(3)}</td><td className="text-right">{msa.evContrib.toFixed(1)}%</td><td className="text-right">{msa.evPct.toFixed(1)}%</td></tr>
                      <tr className="border-b border-border/50"><td className="py-1.5">Reproductibilité (AV)</td><td className="text-right">{msa.av.toFixed(3)}</td><td className="text-right">{msa.avContrib.toFixed(1)}%</td><td className="text-right">{msa.avPct.toFixed(1)}%</td></tr>
                      <tr className="border-b border-border/50 font-medium"><td className="py-1.5">R&R (GRR)</td><td className="text-right">{msa.grr.toFixed(3)}</td><td className="text-right">{msa.grrContrib.toFixed(1)}%</td><td className="text-right">{msa.grrPct.toFixed(1)}%</td></tr>
                      <tr className="border-b border-border/50"><td className="py-1.5">Pièce à pièce (PV)</td><td className="text-right">{msa.pv.toFixed(3)}</td><td className="text-right">{msa.pvContrib.toFixed(1)}%</td><td className="text-right">{msa.pvPct.toFixed(1)}%</td></tr>
                      <tr className="font-semibold"><td className="py-1.5">Total Variation (TV)</td><td className="text-right">{msa.tv.toFixed(3)}</td><td className="text-right">100%</td><td className="text-right">100%</td></tr>
                    </tbody>
                  </table>
                  <div className={`mt-3 text-sm font-semibold flex items-center gap-2 ${msa.status === "excellent" ? "text-success" : msa.status === "acceptable" ? "text-warning" : "text-destructive"}`}>
                    %GRR = {msa.grrPct.toFixed(1)}%
                    <span className="text-xs font-normal">· {msa.interpretation}</span>
                  </div>
                </div>
                <div className="h-44">
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={msaPie} dataKey="value" cx="50%" cy="50%" outerRadius={70} innerRadius={35}>
                        {msaPie.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                      </Pie>
                      <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 11 }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </SectionCard>
          ) : (
            <SectionCard title="5. MSA – R&R">
              <div className="text-sm text-muted-foreground py-6 text-center">
                Aucun fichier MSA détecté.<br />
                <span className="text-xs">Importez un fichier avec colonnes Pièce / Opérateur / Mesure.</span>
              </div>
            </SectionCard>
          )}

          <SectionCard title="6. État du processus & interprétation">
            <div className="grid grid-cols-3 gap-4 items-start">
              <div className="col-span-2">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-muted-foreground border-b border-border">
                      <th className="text-left py-2 font-medium">Critère</th>
                      <th className="text-left py-2 font-medium">Résultat</th>
                      <th className="text-left py-2 font-medium">Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {spc && <Row label="Points hors limites" value={String(spc.outOfControl.length)} ok={spc.outOfControl.length === 0} />}
                    {spc && <Row label="Tendance / règles SPC" value={spc.westernElectric.length === 0 ? "Aucune anomalie" : `${spc.westernElectric.length} alerte(s)`} ok={spc.westernElectric.length === 0} />}
                    {cap && <Row label="Capabilité (Cpk ≥ 1.33)" value={cap.cpk.toFixed(2)} ok={cap.cpk >= 1.33} warn={cap.cpk >= 1 && cap.cpk < 1.33} />}
                    {msa && <Row label="MSA (%GRR ≤ 30%)" value={`${msa.grrPct.toFixed(1)}%`} ok={msa.grrPct < 10} warn={msa.grrPct >= 10 && msa.grrPct <= 30} />}
                    {cap && <Row label="Incertitude (U)" value={uVal.toFixed(4)} ok />}
                  </tbody>
                </table>
              </div>
              <div className={`rounded-lg p-3 flex flex-col items-center text-center gap-2 border ${isInControl && (cap?.cpk ?? 0) >= 1.33 ? "bg-success/10 border-success/30" : "bg-warning/10 border-warning/30"}`}>
                <div className={`text-xs font-semibold uppercase tracking-wider ${isInControl && (cap?.cpk ?? 0) >= 1.33 ? "text-success" : "text-warning"}`}>Conclusion</div>
                <p className="text-xs text-foreground/80 leading-relaxed">
                  Le processus est globalement {isInControl ? "sous contrôle" : "à surveiller"}.
                  {cap && cap.cpk < 1.33 && " La capabilité doit être améliorée."}
                </p>
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${isInControl && (cap?.cpk ?? 0) >= 1.33 ? "bg-success" : "bg-warning"}`}>
                  {isInControl && (cap?.cpk ?? 0) >= 1.33 ? (
                    <CheckCircle2 className="w-7 h-7 text-success-foreground" />
                  ) : (
                    <AlertTriangle className="w-7 h-7 text-warning-foreground" />
                  )}
                </div>
              </div>
            </div>
          </SectionCard>
        </div>
      )}
    </AppLayout>
  );
};

const Spec = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between border-b border-border/50 py-1.5">
    <span className="text-muted-foreground text-xs">{label}</span>
    <span className="font-semibold text-xs tabular-nums">{value}</span>
  </div>
);

const Stat = ({ label, value, accent }: { label: string; value: string; accent: string }) => {
  const colorMap: Record<string, string> = {
    primary: "text-primary",
    success: "text-success",
    warning: "text-warning",
    destructive: "text-destructive",
  };
  return (
    <div className="bg-secondary/40 rounded-md p-2 border border-border">
      <div className="text-[10px] uppercase text-muted-foreground tracking-wider">{label}</div>
      <div className={`text-xl font-bold ${colorMap[accent] || "text-foreground"}`}>{value}</div>
    </div>
  );
};

const Row = ({ label, value, ok, warn }: { label: string; value: string; ok?: boolean; warn?: boolean }) => (
  <tr className="border-b border-border/50">
    <td className="py-2 text-xs">{label}</td>
    <td className="py-2 text-xs tabular-nums">{value}</td>
    <td className="py-2">
      {ok ? (
        <span className="inline-flex items-center gap-1 text-success text-xs font-medium"><CheckCircle2 className="w-3.5 h-3.5" />OK</span>
      ) : warn ? (
        <span className="inline-flex items-center gap-1 text-warning text-xs font-medium"><AlertTriangle className="w-3.5 h-3.5" />À améliorer</span>
      ) : (
        <span className="inline-flex items-center gap-1 text-destructive text-xs font-medium"><AlertTriangle className="w-3.5 h-3.5" />Critique</span>
      )}
    </td>
  </tr>
);

const UncertaintyGauge = ({ value, max }: { value: number; max: number }) => {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="flex flex-col items-center justify-center">
      <div className="relative w-32 h-32">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="40" stroke="hsl(var(--border))" strokeWidth="10" fill="none" />
          <circle
            cx="50"
            cy="50"
            r="40"
            stroke="hsl(var(--orange))"
            strokeWidth="10"
            fill="none"
            strokeDasharray={`${(pct / 100) * 251.3} 251.3`}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-2xl font-bold text-orange tabular-nums">{value.toFixed(4)}</div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">U élargie</div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
