import { useMemo } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { AIPanel } from "@/components/ai/AIPanel";
import { SectionCard } from "@/components/dashboard/SectionCard";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { useAppStore, appActions, absLimits } from "@/store/app-store";
import { computeCapability, buildHistogram, normalPdf } from "@/lib/spc-engine";
import { SpecsPanel } from "@/components/specs/SpecsPanel";
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { CheckCircle2, AlertTriangle, XCircle, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const CapabilityPage = () => {
  const spcSheet = useAppStore(() => appActions.getSheetForKind("spc"));
  const specs = useAppStore((s) => s.specs);
  const mapping = useAppStore((s) => s.mapping);

  const columns = mapping.measureCols.length > 0 ? mapping.measureCols : [];

  // All individual measurements pooled from every mapped column
  const allValues = useMemo(() => {
    if (!spcSheet || columns.length === 0) return [];
    const vals: number[] = [];
    for (const row of spcSheet.rows) {
      for (const c of columns) {
        const v = Number(row[c]);
        if (!isNaN(v)) vals.push(v);
      }
    }
    return vals;
  }, [spcSheet, columns]);

  // Row means — one per subgroup, used only for UI count display
  const rowMeans = useMemo(() => {
    if (!spcSheet || columns.length === 0) return [];
    return spcSheet.rows
      .map((r) => {
        const vals = columns.map((c) => Number(r[c])).filter((v) => !isNaN(v));
        if (vals.length === 0) return null;
        return vals.reduce((s, v) => s + v, 0) / vals.length;
      })
      .filter((v): v is number => v !== null);
  }, [spcSheet, columns]);

  // Row ranges — range across all columns per row, used for σᵢ = R̄/d₂
  const rowRanges = useMemo(() => {
    if (!spcSheet || columns.length === 0) return [];
    return spcSheet.rows
      .map((r) => {
        const vals = columns.map((c) => Number(r[c])).filter((v) => !isNaN(v));
        return vals.length >= 2 ? Math.max(...vals) - Math.min(...vals) : null;
      })
      .filter((v): v is number => v !== null);
  }, [spcSheet, columns]);

  // Global capability: all individual values + row ranges for σᵢ
  const globalCap = useMemo(() => {
    if (allValues.length === 0) return null;
    const n = Math.min(Math.max(columns.length, 2), 10);
    const { lsl, usl } = absLimits(specs);
    return computeCapability(allValues, lsl, usl, specs.target, n, rowRanges.length > 0 ? rowRanges : undefined);
  }, [allValues, rowRanges, columns.length, specs]);

  // Histogram of ALL individual measurements; normal curve uses σg
  const hist = useMemo(() => {
    if (allValues.length === 0 || !globalCap) return [];
    const BIN_WIDTH = 0.01;
    const rawLo = Math.min(...allValues);
    const rawHi = Math.max(...allValues);
    // Snap to BIN_WIDTH boundaries then add half a bin on each side → 5 centred bars
    const snappedLo = Math.floor(rawLo / BIN_WIDTH) * BIN_WIDTH - BIN_WIDTH / 2;
    const snappedHi = Math.ceil(rawHi / BIN_WIDTH) * BIN_WIDTH + BIN_WIDTH / 2;
    const bins = Math.round((snappedHi - snappedLo) / BIN_WIDTH);
    const h = buildHistogram(allValues, bins, snappedLo, snappedHi);
    const mu = globalCap.mean;
    const sigma = globalCap.stdLongTerm || 0.001;
    const maxCount = Math.max(...h.map((d) => d.count), 1);
    const maxPdf = normalPdf(mu, mu, sigma);
    return h.map((d) => ({
      ...d,
      pdf: maxPdf > 0 ? (normalPdf(d.bin, mu, sigma) / maxPdf) * maxCount : 0,
    }));
  }, [allValues, globalCap]);

  const hasData = allValues.length > 0 && globalCap !== null;

  if (!hasData || !globalCap) {
    return (
      <AppLayout title="Capabilité Process" subtitle={`${specs.projectName} · Cp · Cpk · Pp · Ppk · Cpm`}>
        <div className="mb-5"><SpecsPanel /></div>
        <EmptyState
          title="Aucune donnée de capabilité"
          message="Importez votre fichier Excel SPC/Capabilité depuis l'onglet « Données ». Les indices Cp, Cpk, Pp, Ppk et l'histogramme avec courbe normale seront calculés directement à partir de vos mesures."
        />
      </AppLayout>
    );
  }

  const cap = globalCap;
  const eff = { ...absLimits(specs), target: specs.target };

  // X-axis domain spans spec limits so reference lines are always visible
  const dataMin = Math.min(...allValues);
  const dataMax = Math.max(...allValues);
  const xMin = Math.min(eff.lsl, dataMin);
  const xMax = Math.max(eff.usl, dataMax);
  const xPad = (xMax - xMin) * 0.05;
  const xDomain: [number, number] = [xMin - xPad, xMax + xPad];

  // Bar size: fill each bin proportionally (~550 px chart area assumed)
  const barSize = hist.length > 1
    ? Math.max(3, Math.round(550 * (hist[1].bin - hist[0].bin) / (xDomain[1] - xDomain[0])))
    : 10;

  // Pick exactly 5 bin-centre positions to use as ticks (aligns with bar positions)
  const xTicks = (() => {
    if (hist.length <= 5) return hist.map((d) => d.bin);
    const n = hist.length;
    return [0, Math.floor(n / 4), Math.floor(n / 2), Math.floor((3 * n) / 4), n - 1].map(
      (i) => hist[i].bin
    );
  })();

  const StatusIcon = cap.status === "capable" ? CheckCircle2 : cap.status === "improve" ? AlertTriangle : XCircle;
  const statusColor = cap.status === "capable" ? "text-success" : cap.status === "improve" ? "text-warning" : "text-destructive";

  const chartProps = {
    lsl: eff.lsl, usl: eff.usl, target: eff.target, xDomain, xTicks, barSize,
  };

  return (
    <AppLayout title="Capabilité Process" subtitle={`${specs.projectName} · Cp · Cpk · Pp · Ppk · Cpm`}>
      <div className="mb-5"><SpecsPanel /></div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">
        <SectionCard title="Source de données">
          <div className="text-xs text-muted-foreground mb-2">
            Capteurs : <strong className="text-foreground">{mapping.measureCols.join(", ") || "—"}</strong>
          </div>
          <div className="mt-3 text-xs text-muted-foreground">
            Sous-groupes : <strong className="text-foreground">{rowMeans.length}</strong>
            <span className="ml-2">(n={columns.length})</span>
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            N total : <strong className="text-foreground">{allValues.length}</strong>
          </div>
          <div className="mt-3 text-xs text-muted-foreground">
            LSL={eff.lsl.toFixed(4)} · Cible={eff.target} · USL={eff.usl.toFixed(4)}
          </div>
        </SectionCard>

        <SectionCard title={`Indicateurs globaux · n=${columns.length} capteurs`} className="lg:col-span-2">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <Idx label="Cp" value={cap.cp} />
            <Idx label="Cpk" value={cap.cpk} highlight />
            <Idx label="Pp" value={cap.pp} />
            <Idx label="Ppk" value={cap.ppk} highlight />
          </div>
          <div className={`flex items-center gap-3 p-3 rounded-lg border ${cap.status === "capable" ? "bg-success/10 border-success/30" : cap.status === "improve" ? "bg-warning/10 border-warning/30" : "bg-destructive/10 border-destructive/30"}`}>
            <StatusIcon className={`w-7 h-7 ${statusColor}`} />
            <div>
              <div className={`font-semibold ${statusColor}`}>{cap.interpretation}</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                X̿ = {cap.mean.toFixed(4)} · σᵢ = {cap.stdShortTerm.toFixed(4)} · σg = {cap.stdLongTerm.toFixed(4)}
              </div>
            </div>
          </div>
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <HistChart data={hist} title="Histogramme de distribution" showCurve={false} {...chartProps} />
        <HistChart data={hist} title="Courbe de distribution normale" showCurve={true} {...chartProps} />
      </div>

      <div className="mt-5">
        <AIPanel
          title="Interprétation IA — Capabilité"
          systemPrompt="Tu es un expert en capabilité des procédés industriels. Analyse les indices de capabilité fournis et donne une interprétation claire en français. Explique ce que signifient les valeurs Cp, Cpk, Pp, Ppk pour ce procédé, identifie les risques, et propose des recommandations concrètes pour améliorer la capabilité si nécessaire. Sois direct et actionnable."
          userMessage={`Voici les résultats de capabilité :
- Cp : ${cap.cp.toFixed(4)}
- Cpk : ${cap.cpk.toFixed(4)}
- Pp : ${cap.pp.toFixed(4)}
- Ppk : ${cap.ppk.toFixed(4)}
${cap.cpm !== undefined ? `- Cpm : ${cap.cpm.toFixed(4)}` : ""}
- Moyenne (X̄) : ${cap.mean.toFixed(4)}
- Sigma court terme (σᵢ) : ${cap.stdShortTerm.toFixed(4)}
- Sigma long terme (σg) : ${cap.stdLongTerm.toFixed(4)}
- LSL : ${cap.lsl} | USL : ${cap.usl}${cap.target !== undefined ? ` | Cible : ${cap.target}` : ""}
- Statut : ${cap.interpretation}

Donne une interprétation détaillée et des recommandations.`}
        />
      </div>
    </AppLayout>
  );
};

// ── shared chart component ────────────────────────────────────────────────────
interface HistChartProps {
  data: { bin: number; count: number; pdf: number }[];
  title: string;
  showCurve: boolean;
  lsl: number;
  usl: number;
  target: number;
  xDomain: [number, number];
  xTicks: number[];
  barSize: number;
}

const HistChart = ({ data, title, showCurve, lsl, usl, target, xDomain, xTicks, barSize }: HistChartProps) => (
  <SectionCard title={title}>
    <div className="h-72">
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis
            dataKey="bin"
            type="number"
            domain={xDomain}
            ticks={xTicks}
            tickFormatter={(v: number) => v.toFixed(3)}
            tick={{ fontSize: 10 }}
            stroke="hsl(var(--muted-foreground))"
          />
          <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
          <RechartsTooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 11 }} />
          <ReferenceLine x={lsl} stroke="hsl(var(--destructive))" strokeDasharray="4 4" label={{ value: `LSL ${lsl.toFixed(3)}`, fill: "hsl(var(--destructive))", fontSize: 10, position: "top" }} />
          <ReferenceLine x={usl} stroke="hsl(var(--destructive))" strokeDasharray="4 4" label={{ value: `USL ${usl.toFixed(3)}`, fill: "hsl(var(--destructive))", fontSize: 10, position: "top" }} />
          <ReferenceLine x={target} stroke="hsl(var(--success))" strokeDasharray="4 4" label={{ value: `Cible ${target}`, fill: "hsl(var(--success))", fontSize: 10, position: "top" }} />
          <Bar dataKey="count" fill="hsl(var(--primary))" opacity={showCurve ? 0.3 : 0.7} barSize={barSize} radius={[2, 2, 0, 0]} />
          {showCurve && <Line type="monotone" dataKey="pdf" stroke="hsl(var(--purple))" strokeWidth={2.5} dot={false} />}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  </SectionCard>
);

// ── formula tooltips ──────────────────────────────────────────────────────────
const FORMULAS: Record<string, { formula: string; desc: string }> = {
  Cp:  { formula: "Cp = (USL − LSL) / (6 σᵢ)", desc: "σᵢ = R̄ / d₂  — d₂ = 2.326 (n = 5)" },
  Cpk: { formula: "Cpk = min[ (USL − X̿) / (3 σᵢ),  (X̿ − LSL) / (3 σᵢ) ]", desc: "σᵢ = R̄ / d₂  (court terme)" },
  Pp:  { formula: "Pp = (USL − LSL) / (6 σg)", desc: "σg = √[ Σ(xᵢ − X̿)² / (N−1) ]  (global)" },
  Ppk: { formula: "Ppk = min[ (USL − X̿) / (3 σg),  (X̿ − LSL) / (3 σg) ]", desc: "σg = écart-type global (long terme)" },
};

const Idx = ({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) => {
  const color = value >= 1.33 ? "text-success" : value >= 1 ? "text-warning" : "text-destructive";
  const formula = FORMULAS[label];
  return (
    <div className={`rounded-lg p-3 border ${highlight ? "border-primary/30 bg-accent/30" : "border-border bg-card"}`}>
      <div className="flex items-center gap-1 mb-1">
        <span className="text-[10px] uppercase text-muted-foreground tracking-wider">{label}</span>
        {formula && (
          <TooltipProvider delayDuration={100}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="w-3 h-3 text-muted-foreground cursor-help shrink-0" />
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs text-center">
                <p className="font-mono text-xs font-semibold">{formula.formula}</p>
                <p className="text-[11px] text-muted-foreground mt-1">{formula.desc}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
      <div className={`text-3xl font-bold ${color}`}>{value.toFixed(2)}</div>
    </div>
  );
};

export default CapabilityPage;
