import { useMemo, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { SectionCard } from "@/components/dashboard/SectionCard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { computeUncertaintyTypeA } from "@/lib/spc-engine";

// ── Types ──────────────────────────────────────────────────────────────────

type Distribution = "uniform" | "triangular" | "trapezoidal" | "normal";

interface TypeBRow {
  id: string;
  name: string;
  distribution: Distribution;
  a: number;
  k: number;     // divisor for normal
  beta: number;  // shape factor for trapezoidal [0,1]
}

// ── Constants ──────────────────────────────────────────────────────────────

const T_REF        = 20;                        // °C — température d'étalonnage (fixed)
const ALPHA_INOX   = 11.5e-6;                   // /°C — coeff dilatation acier inox
const ALPHA_CUIVRE = 16.5e-6;                   // /°C — coeff dilatation cuivre (câble)
const DELTA_ALPHA  = ALPHA_CUIVRE - ALPHA_INOX; // 5×10⁻⁶ /°C

// ── Pure computation ───────────────────────────────────────────────────────

function computeUB(row: TypeBRow): number {
  if (row.a <= 0) return 0;
  switch (row.distribution) {
    case "normal":      return row.a / Math.max(row.k, 1);
    case "uniform":     return row.a / Math.sqrt(3);
    case "triangular":  return row.a / Math.sqrt(6);
    case "trapezoidal": return row.a * Math.sqrt((1 + Math.max(0, Math.min(1, row.beta)) ** 2) / 6);
  }
}

function fmt(v: number) { return v.toFixed(4); }

// ── Static lookup tables ───────────────────────────────────────────────────

const DIST_LABELS: Record<Distribution, string> = {
  uniform:     "Uniforme",
  triangular:  "Triangulaire",
  trapezoidal: "Trapézoïdale",
  normal:      "Normale",
};

const DIST_FORMULA: Record<Distribution, string> = {
  uniform:     "a / √3",
  triangular:  "a / √6",
  trapezoidal: "a · √((1+β²)/6)",
  normal:      "a / k",
};

let _idCounter = 0;
const nextId = () => String(++_idCounter);

const DEFAULT_B: TypeBRow[] = [
  { id: nextId(), name: "Résolution instrument", distribution: "uniform", a: 0.005, k: 2, beta: 0 },
  { id: nextId(), name: "Étalonnage",            distribution: "normal",  a: 0.010, k: 2, beta: 0 },
];

// ── Component ──────────────────────────────────────────────────────────────

const UncertaintyPage = () => {

  // Project info
  const [measurand,  setMeasurand]  = useState("");
  const [unit,       setUnit]       = useState("");
  const [operator,   setOperator]   = useState("");
  const [date,       setDate]       = useState("");
  const [tolerance,  setTolerance]  = useState("");

  // Type A — 10 manual measurements
  const [meas, setMeas] = useState<string[]>(Array(10).fill(""));
  const setMeasAt = (i: number, v: string) =>
    setMeas((prev) => prev.map((x, idx) => (idx === i ? v : x)));

  const validValues = useMemo(
    () => meas.filter((m) => m.trim() !== "").map(Number).filter((v) => !isNaN(v)),
    [meas]
  );
  const typeA    = useMemo(() => computeUncertaintyTypeA(validValues), [validValues]);
  const hasTypeA = validValues.length >= 2;

  // Type B — user-defined sources
  const [bRows, setBRows] = useState<TypeBRow[]>(DEFAULT_B);
  const addB    = () => setBRows((r) => [...r, { id: nextId(), name: "Nouvelle source", distribution: "uniform", a: 0.001, k: 2, beta: 0 }]);
  const removeB = (id: string) => setBRows((r) => r.filter((x) => x.id !== id));
  const updateB = (id: string, patch: Partial<TypeBRow>) =>
    setBRows((r) => r.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  // Type B — temperature correction
  const [tAtelier, setTAtelier] = useState<string>("23");
  const [lPlage,   setLPlage]   = useState<string>("25");
  const tVal   = Number(tAtelier) || 0;
  const lVal   = Number(lPlage)   || 0;
  const deltaT = Math.abs(tVal - T_REF);
  const uTem   = (deltaT * ALPHA_INOX  * lVal) / Math.sqrt(2);
  const uCd    = (DELTA_ALPHA * deltaT * lVal) / Math.sqrt(3);

  // Expanded uncertainty factor
  const [kFactor, setKFactor] = useState("2");
  const k = Number(kFactor) || 2;

  // Budget — combines all sources
  const budget = useMemo(() => {
    const rows: { name: string; type: "A" | "B"; u: number }[] = [];
    if (hasTypeA) rows.push({ name: "Type A — mesures répétées", type: "A", u: typeA.uA });
    bRows.forEach((r) => {
      const u = computeUB(r);
      if (u > 0) rows.push({ name: r.name, type: "B", u });
    });
    if (uTem > 0) rows.push({ name: "Température (dilatation thermique)", type: "B", u: uTem });
    if (uCd  > 0) rows.push({ name: "Différentiel de dilatation (Δα)", type: "B", u: uCd });
    const totalU2 = rows.reduce((s, r) => s + r.u ** 2, 0);
    const uC = Math.sqrt(totalU2);
    return { rows, totalU2, uC, U: k * uC };
  }, [hasTypeA, typeA.uA, bRows, uTem, k]);

  const unitSuffix = unit ? ` (${unit})` : "";

  return (
    <AppLayout
      title="Incertitude de mesure"
      subtitle="Évaluation Type A · Type B · Budget · Incertitude élargie — GUM (JCGM 100:2008)"
    >

      {/* ─── 1. Project info ─── */}
      <SectionCard title="Informations du mesurande" className="mb-5">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Field label="Mesurande">
            <Input value={measurand} onChange={(e) => setMeasurand(e.target.value)} placeholder="ex. Longueur, Masse…" />
          </Field>
          <Field label="Unité">
            <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="ex. mm, g, °C…" />
          </Field>
          <Field label="Tolérance T (±)">
            <Input type="number" step="any" value={tolerance} onChange={(e) => setTolerance(e.target.value)} placeholder="ex. 0.05" />
          </Field>
          <Field label="Opérateur">
            <Input value={operator} onChange={(e) => setOperator(e.target.value)} placeholder="—" />
          </Field>
          <Field label="Date">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
      </SectionCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">

        {/* ─── 2. Type A ─── */}
        <SectionCard title="Évaluation de Type A — Mesures répétées">
          <p className="text-xs text-muted-foreground mb-4">
            Saisissez jusqu'à 10 mesures individuelles.
            L'incertitude-type est <span className="font-medium text-foreground">u&#x2090; = s / √n</span>.
          </p>

          <div className="grid grid-cols-5 gap-2 mb-5">
            {meas.map((v, i) => (
              <div key={i}>
                <Label className="text-[10px] text-muted-foreground">m{i + 1}</Label>
                <Input
                  type="number"
                  value={v}
                  onChange={(e) => setMeasAt(i, e.target.value)}
                  className="h-8 text-xs text-right mt-0.5"
                  placeholder="—"
                />
              </div>
            ))}
          </div>

          <div className="border-t border-border pt-3 space-y-0">
            <SpecRow label="n (mesures valides)"        value={String(typeA.n)} />
            <SpecRow label="Moyenne q̄"                 value={hasTypeA ? fmt(typeA.mean) : "—"} unit={unit} />
            <SpecRow label="Écart-type expérimental s"  value={hasTypeA ? fmt(typeA.s)    : "—"} unit={unit} />
            <SpecRow label="uA = s / √n"                value={hasTypeA ? fmt(typeA.uA)   : "—"} unit={unit} highlight />
            <SpecRow label="Degrés de liberté ν = n−1"  value={hasTypeA ? String(typeA.n - 1) : "—"} />
          </div>
        </SectionCard>

        {/* ─── 3. Type B ─── */}
        <SectionCard
          title="Évaluation de Type B — Sources d'incertitude"
          actions={
            <Button size="sm" variant="outline" onClick={addB} className="gap-1.5">
              <Plus className="w-3.5 h-3.5" />Ajouter
            </Button>
          }
        >
          <p className="text-xs text-muted-foreground mb-3">
            Saisir la demi-largeur <span className="font-medium text-foreground">a</span> de chaque source.
            La loi choisie détermine le diviseur (GUM §4.3).
          </p>

          {/* User-defined rows */}
          <div className="space-y-2 mb-4">
            {bRows.map((row) => {
              const uB = computeUB(row);
              return (
                <div key={row.id} className="flex flex-wrap items-center gap-2 border border-border/60 rounded-lg p-2.5">
                  <Input
                    value={row.name}
                    onChange={(e) => updateB(row.id, { name: e.target.value })}
                    className="h-7 text-xs flex-1 min-w-[90px]"
                    placeholder="Nom de la source"
                  />
                  <Select value={row.distribution} onValueChange={(v) => updateB(row.id, { distribution: v as Distribution })}>
                    <SelectTrigger className="h-7 text-xs w-32 shrink-0"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(DIST_LABELS) as Distribution[]).map((d) => (
                        <SelectItem key={d} value={d}>{DIST_LABELS[d]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-[10px] text-muted-foreground">a =</span>
                    <Input type="number" step="any" value={row.a} onChange={(e) => updateB(row.id, { a: Number(e.target.value) })} className="h-7 text-xs w-20 text-right" />
                  </div>
                  {row.distribution === "normal" && (
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-[10px] text-muted-foreground">÷k =</span>
                      <Input type="number" step="0.1" min="1" value={row.k} onChange={(e) => updateB(row.id, { k: Number(e.target.value) })} className="h-7 text-xs w-12 text-right" />
                    </div>
                  )}
                  {row.distribution === "trapezoidal" && (
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-[10px] text-muted-foreground">β =</span>
                      <Input type="number" step="0.1" min="0" max="1" value={row.beta} onChange={(e) => updateB(row.id, { beta: Number(e.target.value) })} className="h-7 text-xs w-12 text-right" />
                    </div>
                  )}
                  {(row.distribution === "uniform" || row.distribution === "triangular") && (
                    <span className="text-[10px] text-muted-foreground italic shrink-0">{DIST_FORMULA[row.distribution]}</span>
                  )}
                  <div className="text-xs font-semibold tabular-nums text-primary shrink-0 min-w-[60px] text-right">
                    u = {fmt(uB)}
                  </div>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 shrink-0" onClick={() => removeB(row.id)}>
                    <Trash2 className="w-3 h-3 text-destructive" />
                  </Button>
                </div>
              );
            })}
            {bRows.length === 0 && (
              <p className="text-xs text-muted-foreground italic text-center py-2">
                Aucune source — cliquez sur Ajouter.
              </p>
            )}
          </div>

          {/* ── Temperature & differential dilatation subsections ── */}
          <div className="border-t border-border pt-3">
            <p className="text-xs font-semibold text-foreground mb-2">
              Incertitude due à la température
            </p>
            <div className="rounded-lg border border-border/60 overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-accent/40 text-muted-foreground">
                    <th className="text-left px-3 py-2 font-medium">Paramètre</th>
                    <th className="text-right px-3 py-2 font-medium">Valeur</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-border/40">
                    <td className="px-3 py-2 text-muted-foreground">
                      T étalonnage (référence)
                    </td>
                    <td className="px-3 py-2 text-right font-medium">{T_REF} °C</td>
                  </tr>
                  <tr className="border-t border-border/40">
                    <td className="px-3 py-2 text-muted-foreground">T atelier</td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Input
                          type="number"
                          value={tAtelier}
                          onChange={(e) => setTAtelier(e.target.value)}
                          className="h-6 text-xs w-16 text-right"
                        />
                        <span className="text-muted-foreground">°C</span>
                      </div>
                    </td>
                  </tr>
                  <tr className="border-t border-border/40">
                    <td className="px-3 py-2 text-muted-foreground">ΔT = |T atelier − T réf|</td>
                    <td className="px-3 py-2 text-right font-medium">{deltaT.toFixed(1)} °C</td>
                  </tr>
                  <tr className="border-t border-border/40">
                    <td className="px-3 py-2 text-muted-foreground">α acier inox</td>
                    <td className="px-3 py-2 text-right font-medium">11,5 × 10⁻⁶ /°C</td>
                  </tr>
                  <tr className="border-t border-border/40">
                    <td className="px-3 py-2 text-muted-foreground">Plage instrument L</td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Input
                          type="number"
                          value={lPlage}
                          onChange={(e) => setLPlage(e.target.value)}
                          className="h-6 text-xs w-16 text-right"
                        />
                        <span className="text-muted-foreground">mm</span>
                      </div>
                    </td>
                  </tr>
                  <tr className="border-t border-border/40">
                    <td className="px-3 py-2 text-muted-foreground">Distribution</td>
                    <td className="px-3 py-2 text-right font-medium">Triangulaire → diviseur √2</td>
                  </tr>
                </tbody>
              </table>
              {/* Formula */}
              <div className="bg-primary/5 border-t border-primary/20 px-3 py-2.5">
                <p className="text-[11px] font-mono text-foreground">
                  u_tem = (ΔT × α_inox × L) / √2 = ({deltaT.toFixed(1)} × 11,5×10⁻⁶ × {lVal}) / √2
                  {" "}≈ <span className="font-bold text-primary">{fmt(uTem)} mm</span>
                </p>
              </div>
            </div>
          </div>
          {/* ── Differential dilatation subsection ── */}
          <div className="border-t border-border pt-3 mt-3">
            <p className="text-xs font-semibold text-foreground mb-2">
              Incertitude due au différentiel de dilatation
            </p>
            <div className="rounded-lg border border-border/60 overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-accent/40 text-muted-foreground">
                    <th className="text-left px-3 py-2 font-medium">Paramètre</th>
                    <th className="text-right px-3 py-2 font-medium">Valeur</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-border/40">
                    <td className="px-3 py-2 text-muted-foreground">α cuivre (câble)</td>
                    <td className="px-3 py-2 text-right font-medium">16,5 × 10⁻⁶ /°C</td>
                  </tr>
                  <tr className="border-t border-border/40">
                    <td className="px-3 py-2 text-muted-foreground">α acier inox (instrument)</td>
                    <td className="px-3 py-2 text-right font-medium">11,5 × 10⁻⁶ /°C</td>
                  </tr>
                  <tr className="border-t border-border/40">
                    <td className="px-3 py-2 text-muted-foreground">Δα = α cuivre − α acier</td>
                    <td className="px-3 py-2 text-right font-medium">5 × 10⁻⁶ /°C</td>
                  </tr>
                  <tr className="border-t border-border/40">
                    <td className="px-3 py-2 text-muted-foreground">ΔT (calculé)</td>
                    <td className="px-3 py-2 text-right font-medium">{deltaT.toFixed(1)} °C</td>
                  </tr>
                  <tr className="border-t border-border/40">
                    <td className="px-3 py-2 text-muted-foreground">Plage instrument L</td>
                    <td className="px-3 py-2 text-right font-medium">{lVal} mm</td>
                  </tr>
                  <tr className="border-t border-border/40">
                    <td className="px-3 py-2 text-muted-foreground">Distribution</td>
                    <td className="px-3 py-2 text-right font-medium">Rectangulaire → diviseur √3</td>
                  </tr>
                </tbody>
              </table>
              <div className="bg-primary/5 border-t border-primary/20 px-3 py-2.5">
                <p className="text-[11px] font-mono text-foreground">
                  u_cd = (Δα × ΔT × L) / √3 = (5×10⁻⁶ × {deltaT.toFixed(1)} × {lVal}) / √3
                  {" "}≈ <span className="font-bold text-primary">{fmt(uCd)} mm</span>
                </p>
              </div>
            </div>
          </div>
        </SectionCard>
      </div>

      {/* ─── 4. Budget ─── */}
      <SectionCard title="Budget d'incertitude" className="mb-5">
        {budget.rows.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">
            Saisissez des mesures (Type A) ou configurez des sources Type B pour construire le budget.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="text-left pb-2 font-medium">Source</th>
                <th className="text-center pb-2 font-medium">Type</th>
                <th className="text-right pb-2 font-medium">u(xᵢ){unitSuffix}</th>
                <th className="text-right pb-2 font-medium">u²(xᵢ)</th>
                <th className="text-right pb-2 font-medium">% Contrib.</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {budget.rows.map((r, i) => (
                <tr key={i} className="border-b border-border/50">
                  <td className="py-2.5">{r.name}</td>
                  <td className="py-2.5 text-center">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${r.type === "A" ? "bg-primary/10 text-primary" : "bg-purple/10 text-purple"}`}>
                      {r.type}
                    </span>
                  </td>
                  <td className="py-2.5 text-right">{fmt(r.u)}</td>
                  <td className="py-2.5 text-right text-xs">{(r.u ** 2).toExponential(3)}</td>
                  <td className="py-2.5 text-right">
                    {budget.totalU2 > 0 ? ((r.u ** 2 / budget.totalU2) * 100).toFixed(1) + " %" : "—"}
                  </td>
                </tr>
              ))}
              <tr className="font-semibold bg-accent/30">
                <td className="py-2.5">Incertitude-type composée u&#x2093;(y)</td>
                <td className="py-2.5 text-center text-[10px] text-muted-foreground">√Σu²</td>
                <td className="py-2.5 text-right text-primary">{fmt(budget.uC)}</td>
                <td className="py-2.5 text-right text-xs">{(budget.uC ** 2).toExponential(3)}</td>
                <td className="py-2.5 text-right">100 %</td>
              </tr>
            </tbody>
          </table>
        )}
      </SectionCard>

      {/* ─── 5. Result ─── */}
      <SectionCard title="Résultat — Incertitude élargie  U = k · u&#x2093;(y)">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <BigVal label="uc (combinée)" value={fmt(budget.uC)} unit={unit} accent="text-info" />

          <div className="rounded-lg p-3 border border-border bg-card">
            <div className="text-[10px] uppercase text-muted-foreground tracking-wider mb-2">
              Facteur d'élargissement k
            </div>
            <Select value={kFactor} onValueChange={setKFactor}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">k = 1  (p ≈ 68 %)</SelectItem>
                <SelectItem value="2">k = 2  (p ≈ 95 %)</SelectItem>
                <SelectItem value="3">k = 3  (p ≈ 99 %)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <BigVal label={`U = ${k} × uc`} value={fmt(budget.U)} unit={unit} accent="text-orange" highlight />

          <div className="rounded-lg p-3 border border-orange/30 bg-orange/5">
            <div className="text-[10px] uppercase text-muted-foreground tracking-wider mb-2">Expression finale</div>
            <div className="text-sm font-bold leading-snug">
              {measurand || "y"} = {hasTypeA ? fmt(typeA.mean) : "?"} ± {fmt(budget.U)}
            </div>
            <div className="text-[10px] text-muted-foreground mt-1">
              {unit && <span>{unit} · </span>}k = {k} · p ≈ {k === 1 ? "68" : k === 2 ? "95" : "99"} %
            </div>
          </div>
        </div>

        <p className="text-xs text-muted-foreground italic">
          Référence : JCGM 100:2008 — Guide pour l'expression de l'incertitude de mesure (GUM), §4 &amp; §5.
        </p>
      </SectionCard>

      {/* ─── 6. Verdict ─── */}
      <VerdictCard U={budget.U} tolerance={Number(tolerance) || null} unit={unit} />

    </AppLayout>
  );
};

// ── Sub-components ─────────────────────────────────────────────────────────

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <Label className="text-xs text-muted-foreground">{label}</Label>
    <div className="mt-1 [&_input]:h-8 [&_input]:text-sm">{children}</div>
  </div>
);

const SpecRow = ({ label, value, unit, highlight }: { label: string; value: string; unit?: string; highlight?: boolean }) => (
  <div className="flex justify-between items-center border-b border-border/50 py-2.5">
    <span className="text-xs text-muted-foreground">{label}</span>
    <span className={`text-sm font-semibold tabular-nums ${highlight ? "text-primary" : ""}`}>
      {value}
      {unit && value !== "—" ? <span className="text-xs font-normal text-muted-foreground ml-1">{unit}</span> : null}
    </span>
  </div>
);

const BigVal = ({ label, value, unit, accent, highlight }: { label: string; value: string; unit?: string; accent: string; highlight?: boolean }) => (
  <div className={`rounded-lg p-3 border ${highlight ? "border-orange/40 bg-orange/5" : "border-border bg-card"}`}>
    <div className="text-[10px] uppercase text-muted-foreground tracking-wider">{label}</div>
    <div className={`text-xl font-bold tabular-nums mt-1 ${accent}`}>{value}</div>
    {unit && <div className="text-[10px] text-muted-foreground mt-0.5">{unit}</div>}
  </div>
);

// ── Verdict ────────────────────────────────────────────────────────────────

interface VerdictLevel {
  label: string;
  description: string;
  rule: string;
  bg: string;
  border: string;
  text: string;
  bar: string;
}

const VERDICT_LEVELS: VerdictLevel[] = [
  {
    label: "Excellent",
    description: "L'incertitude est très faible par rapport à la tolérance. Le système de mesure est parfaitement adapté.",
    rule: "U / T ≤ 20 %",
    bg: "bg-success/10", border: "border-success/40", text: "text-success", bar: "bg-success",
  },
  {
    label: "Acceptable",
    description: "L'incertitude respecte la règle du tiers (1/3). Le système de mesure est adapté à l'usage.",
    rule: "20 % < U / T ≤ 33 %",
    bg: "bg-primary/10", border: "border-primary/40", text: "text-primary", bar: "bg-primary",
  },
  {
    label: "Limite",
    description: "L'incertitude est élevée. Des décisions de conformité peuvent être compromises.",
    rule: "33 % < U / T ≤ 50 %",
    bg: "bg-warning/10", border: "border-warning/40", text: "text-warning", bar: "bg-warning",
  },
  {
    label: "Non acceptable",
    description: "L'incertitude dépasse la moitié de la tolérance. Le système de mesure n'est pas adapté.",
    rule: "U / T > 50 %",
    bg: "bg-destructive/10", border: "border-destructive/40", text: "text-destructive", bar: "bg-destructive",
  },
];

function getVerdict(ratio: number): VerdictLevel {
  if (ratio <= 0.20) return VERDICT_LEVELS[0];
  if (ratio <= 0.33) return VERDICT_LEVELS[1];
  if (ratio <= 0.50) return VERDICT_LEVELS[2];
  return VERDICT_LEVELS[3];
}

const VerdictCard = ({ U, tolerance, unit }: { U: number; tolerance: number | null; unit: string }) => {
  const hasTolerance = tolerance !== null && tolerance > 0;
  const ratio        = hasTolerance ? U / tolerance! : null;
  const pct          = ratio !== null ? ratio * 100 : null;
  const verdict      = ratio !== null ? getVerdict(ratio) : null;
  const barWidth     = pct !== null ? Math.min(pct, 100) : 0;

  return (
    <SectionCard title="Verdict — Aptitude du système de mesure" className="mt-5">
      {!hasTolerance ? (
        <p className="text-xs text-muted-foreground italic">
          Saisissez une <span className="font-medium text-foreground">Tolérance T (±)</span> dans les informations du mesurande pour obtenir le verdict.
        </p>
      ) : (
        <div className="space-y-4">
          {/* Ratio bar */}
          <div>
            <div className="flex justify-between text-xs mb-1.5">
              <span className="text-muted-foreground">U / T = {fmt(U)} / {fmt(tolerance!)}{unit ? ` ${unit}` : ""}</span>
              <span className={`font-bold ${verdict!.text}`}>{pct!.toFixed(1)} %</span>
            </div>
            <div className="relative h-3 rounded-full bg-accent overflow-hidden">
              {/* Threshold markers */}
              <div className="absolute top-0 left-[20%] w-px h-full bg-border/80 z-10" />
              <div className="absolute top-0 left-[33%] w-px h-full bg-border/80 z-10" />
              <div className="absolute top-0 left-[50%] w-px h-full bg-border/80 z-10" />
              {/* Fill */}
              <div
                className={`h-full rounded-full transition-all duration-300 ${verdict!.bar}`}
                style={{ width: `${barWidth}%` }}
              />
            </div>
            <div className="flex justify-between text-[9px] text-muted-foreground mt-1">
              <span>0 %</span>
              <span>20 %</span>
              <span>33 %</span>
              <span>50 %</span>
              <span>100 %</span>
            </div>
          </div>

          {/* Verdict badge */}
          <div className={`flex items-start gap-3 rounded-xl border p-4 ${verdict!.bg} ${verdict!.border}`}>
            <div className="flex-1">
              <div className={`text-lg font-bold mb-1 ${verdict!.text}`}>{verdict!.label}</div>
              <p className="text-sm text-muted-foreground">{verdict!.description}</p>
              <p className="text-xs text-muted-foreground mt-1 italic">Critère appliqué : {verdict!.rule}</p>
            </div>
            <div className="text-right shrink-0">
              <div className="text-[10px] uppercase text-muted-foreground tracking-wide">U / T</div>
              <div className={`text-2xl font-bold tabular-nums ${verdict!.text}`}>{pct!.toFixed(1)} %</div>
            </div>
          </div>

          {/* Reference table */}
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-accent/40 text-muted-foreground">
                  <th className="text-left px-3 py-2 font-medium">Ratio U / T</th>
                  <th className="text-left px-3 py-2 font-medium">Verdict</th>
                  <th className="text-left px-3 py-2 font-medium">Interprétation</th>
                </tr>
              </thead>
              <tbody>
                {VERDICT_LEVELS.map((v, i) => (
                  <tr
                    key={i}
                    className={`border-t border-border/50 ${verdict === v ? v.bg : ""}`}
                  >
                    <td className="px-3 py-2 font-mono">{v.rule}</td>
                    <td className={`px-3 py-2 font-semibold ${v.text}`}>{v.label}</td>
                    <td className="px-3 py-2 text-muted-foreground">{v.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </SectionCard>
  );
};

export default UncertaintyPage;
