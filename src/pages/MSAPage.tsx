import { useMemo, useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { AIPanel } from "@/components/ai/AIPanel";
import { SectionCard } from "@/components/dashboard/SectionCard";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { useAppStore, appActions } from "@/store/app-store";
import { computeMSA, MSAEntry } from "@/lib/spc-engine";
import { MSASpecsPanel } from "@/components/specs/MSASpecsPanel";
import { detectSheet } from "@/lib/auto-detect";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";
import { CheckCircle2, AlertTriangle, XCircle, User } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const MSAPage = () => {
  const files  = useAppStore((s) => s.files);
  const mapping = useAppStore((s) => s.mapping);

  // Column mapping (auto-synced silently)
  const [colPart,  setColPart]  = useState<string>(mapping.partCol     ?? "");
  const [colOp,    setColOp]    = useState<string>(mapping.operatorCol ?? "");
  const [colTrial, setColTrial] = useState<string>(mapping.trialCol    ?? "");
  const [colVal,   setColVal]   = useState<string>(mapping.valueCol    ?? "");

  useEffect(() => {
    if (mapping.partCol)     setColPart(mapping.partCol);
    if (mapping.operatorCol) setColOp(mapping.operatorCol);
    if (mapping.trialCol)    setColTrial(mapping.trialCol);
    if (mapping.valueCol)    setColVal(mapping.valueCol);
  }, [mapping.partCol, mapping.operatorCol, mapping.trialCol, mapping.valueCol]);

  // File selector — MSA files only
  const msaFiles = useMemo(
    () => files.reduce<{ idx: number; name: string }[]>((acc, f, i) => {
      const isMsa = f.uploadMode
        ? f.uploadMode === "msa"
        : f.sheets.some((s) => { const k = detectSheet(s).kind; return k === "msa" || k === "msa-rr"; });
      if (isMsa) acc.push({ idx: i, name: f.name });
      return acc;
    }, []),
    [files]
  );

  const [selectedFileIdx, setSelectedFileIdx] = useState<number | null>(null);

  useEffect(() => {
    if (selectedFileIdx === null && msaFiles.length > 0)
      setSelectedFileIdx(msaFiles[0].idx);
  }, [msaFiles, selectedFileIdx]);

  const msaSheet = useMemo(() => {
    if (selectedFileIdx === null) return null;
    const file = files[selectedFileIdx];
    if (!file) return null;
    for (const sh of file.sheets) {
      const k = detectSheet(sh).kind;
      if (k === "msa" || k === "msa-rr") return sh;
    }
    return file.sheets[0] ?? null;
  }, [files, selectedFileIdx]);

  // Fallback: if mapping has no MSA columns but we have a sheet, detect directly from it
  useEffect(() => {
    if (!msaSheet) return;
    if (colPart && msaSheet.headers.includes(colPart)) return;
    const d = detectSheet(msaSheet);
    if (d.mapping.partCol)     setColPart(d.mapping.partCol);
    if (d.mapping.operatorCol) setColOp(d.mapping.operatorCol);
    if (d.mapping.trialCol)    setColTrial(d.mapping.trialCol ?? "");
    if (d.mapping.valueCol)    setColVal(d.mapping.valueCol ?? "");
  }, [msaSheet]); // eslint-disable-line react-hooks/exhaustive-deps

  // Operator metadata — persisted in app store
  const opMeta = useAppStore((s) => s.msaOperatorMeta);
  const setOpField = (op: string, key: "name" | "date" | "id") => (e: React.ChangeEvent<HTMLInputElement>) =>
    appActions.setMsaOperatorMeta((prev) => ({ ...prev, [op]: { ...(prev[op] ?? { name: "", date: "", id: "" }), [key]: e.target.value } }));

  const parseNum = (v: any): number => {
    if (typeof v === "number") return v;
    if (typeof v === "string") return Number(v.trim().replace(/,/g, "."));
    return NaN;
  };

  const entries: MSAEntry[] = useMemo(() => {
    if (!msaSheet || !colPart || !colOp || !colVal) return [];
    return msaSheet.rows
      .map((r, i) => ({
        part: r[colPart], operator: r[colOp],
        trial: colTrial ? parseNum(r[colTrial]) : i,
        value: parseNum(r[colVal]),
      }))
      .filter((e) => e.part != null && e.operator != null && !isNaN(e.value));
  }, [msaSheet, colPart, colOp, colTrial, colVal]);

  const operators = useMemo(
    () => Array.from(new Set(entries.map((e) => String(e.operator)))).sort(),
    [entries]
  );

  useEffect(() => {
    if (operators.length === 0) return;
    appActions.setMsaOperatorMeta((prev) => {
      const next = { ...prev };
      operators.forEach((op) => { if (!next[op]) next[op] = { name: "", date: "", id: "" }; });
      return next;
    });
  }, [operators]);

  const hasData = entries.length > 0;
  const msa = useMemo(() => (hasData ? computeMSA(entries) : null), [hasData, entries]);

  // ── Operator cards (data-driven, always local) ──
  const operatorCards = operators.length > 0 ? (
    <SectionCard title="Opérateurs" className="mb-5">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {operators.map((op) => {
          const meta = opMeta[op] ?? { name: "", date: "", id: "" };
          return (
            <div key={op} className="rounded-xl border border-border p-4 space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <User className="w-4 h-4 text-primary" />
                </div>
                <span className="font-semibold text-sm">Opérateur {op}</span>
              </div>
              <Field label="Nom complet"><Input value={meta.name} onChange={setOpField(op, "name")} placeholder="—" /></Field>
              <Field label="Date"><Input type="date" value={meta.date} onChange={setOpField(op, "date")} /></Field>
              <Field label="ID"><Input value={meta.id} onChange={setOpField(op, "id")} placeholder="—" /></Field>
            </div>
          );
        })}
      </div>
    </SectionCard>
  ) : null;

  // ── File picker ──
  const filePicker = (
    <SectionCard title="Fichier MSA actif" className="mb-5">
      <div className="flex items-center gap-4 flex-wrap">
        {msaFiles.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucun fichier MSA — importez vos données depuis{" "}
            <span className="font-medium text-foreground">Données → MSA</span>.
          </p>
        ) : (
          <Select
            value={selectedFileIdx !== null ? String(selectedFileIdx) : ""}
            onValueChange={(v) => setSelectedFileIdx(Number(v))}
          >
            <SelectTrigger className="w-72">
              <SelectValue placeholder="Sélectionner un fichier" />
            </SelectTrigger>
            <SelectContent>
              {msaFiles.map(({ idx, name }) => (
                <SelectItem key={idx} value={String(idx)}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {msaSheet && (
          <span className="text-xs text-muted-foreground">
            {msaSheet.rows.length} lignes · {msaSheet.headers.length} colonnes
          </span>
        )}
      </div>
    </SectionCard>
  );

  if (!hasData || !msa) {
    return (
      <AppLayout title="MSA — Gage R&R" subtitle="Répétabilité & Reproductibilité (méthode étendue AIAG)">
        {filePicker}
        <div className="mb-5"><MSASpecsPanel /></div>
        {operatorCards}
        <EmptyState
          title="Aucune donnée MSA"
          message="Importez un fichier Excel MSA depuis Données → MSA. Le fichier doit contenir des colonnes Pièce, Opérateur, Essai et Mesure."
        />
      </AppLayout>
    );
  }

  const pieData = [
    { name: `EV ${msa.evPct.toFixed(1)}%`, value: msa.evPct, color: "hsl(var(--primary))" },
    { name: `AV ${msa.avPct.toFixed(1)}%`, value: msa.avPct, color: "hsl(var(--purple))" },
    { name: `PV ${msa.pvPct.toFixed(1)}%`, value: msa.pvPct, color: "hsl(var(--success))" },
  ];
  const barData = [
    { name: "EV",  "% Contribution": +msa.evContrib.toFixed(2),  "% Study Var": +msa.evPct.toFixed(2) },
    { name: "AV",  "% Contribution": +msa.avContrib.toFixed(2),  "% Study Var": +msa.avPct.toFixed(2) },
    { name: "GRR", "% Contribution": +msa.grrContrib.toFixed(2), "% Study Var": +msa.grrPct.toFixed(2) },
    { name: "PV",  "% Contribution": +msa.pvContrib.toFixed(2),  "% Study Var": +msa.pvPct.toFixed(2) },
  ];

  const StatusIcon  = msa.status === "excellent" ? CheckCircle2 : msa.status === "acceptable" ? AlertTriangle : XCircle;
  const statusColor = msa.status === "excellent" ? "text-success" : msa.status === "acceptable" ? "text-warning" : "text-destructive";
  const statusBg    = msa.status === "excellent" ? "bg-success/10 border-success/30" : msa.status === "acceptable" ? "bg-warning/10 border-warning/30" : "bg-destructive/10 border-destructive/30";

  return (
    <AppLayout title="MSA — Gage R&R" subtitle="Répétabilité & Reproductibilité (méthode étendue AIAG)">

      {/* 1. File picker */}
      {filePicker}

      {/* 2. Spécifications + operators */}
      <div className="mb-5"><MSASpecsPanel /></div>
      {operatorCards}

      {/* 3. Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        <SectionCard title="Décomposition de la variation">
          <div className="h-64">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={pieData} dataKey="value" cx="50%" cy="50%" outerRadius={90} innerRadius={45}>
                  {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 11 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        <SectionCard title="Comparaison des composantes">
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={barData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} unit="%" />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 11 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="% Contribution" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                <Bar dataKey="% Study Var" fill="hsl(var(--purple))" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
      </div>

      {/* 4. Results */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <SectionCard title="Configuration">
          <div className="space-y-0">
            <SpecRow label="Pièces (n)"   value={String(msa.parts)} />
            <SpecRow label="Opérateurs"   value={String(msa.operators)} />
            <SpecRow label="Essais (r)"   value={String(msa.trials)} />
            <SpecRow label="ndc"          value={String(msa.ndc)} highlight={msa.ndc >= 5} />
          </div>
        </SectionCard>

        <SectionCard title="Résultats R&R" className="lg:col-span-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground text-xs uppercase tracking-wide">
                <th className="text-left pb-2 font-medium">Source</th>
                <th className="text-right pb-2 font-medium">Valeur</th>
                <th className="text-right pb-2 font-medium">% Contrib.</th>
                <th className="text-right pb-2 font-medium">% Study Var</th>
              </tr>
            </thead>
            <tbody className="tabular-nums text-sm">
              <ResultRow label="Répétabilité (EV)"     val={msa.ev}  contrib={msa.evContrib}  pct={msa.evPct} />
              <ResultRow label="Reproductibilité (AV)" val={msa.av}  contrib={msa.avContrib}  pct={msa.avPct} />
              <ResultRow label="R&R Total"             val={msa.grr} contrib={msa.grrContrib} pct={msa.grrPct} bold />
              <ResultRow label="Pièce à pièce (PV)"   val={msa.pv}  contrib={msa.pvContrib}  pct={msa.pvPct} />
              <ResultRow label="Variation Totale (TV)" val={msa.tv}  contrib={100}            pct={100} bold />
            </tbody>
          </table>
          <div className={`flex items-center gap-3 mt-4 p-3 rounded-lg border ${statusBg}`}>
            <StatusIcon className={`w-6 h-6 shrink-0 ${statusColor}`} />
            <div>
              <div className={`text-sm font-bold ${statusColor}`}>%GRR = {msa.grrPct.toFixed(2)}%</div>
              <div className="text-xs text-muted-foreground">{msa.interpretation}</div>
            </div>
          </div>
        </SectionCard>
      </div>

      <div className="mt-5">
        <AIPanel
          title="Interprétation IA — MSA R&R"
          systemPrompt="Tu es un expert en analyse des systèmes de mesure (MSA/Gage R&R selon la méthode AIAG). Analyse les résultats MSA fournis et donne une interprétation claire en français. Explique le %GRR, la répétabilité, la reproductibilité, le ndc, identifie les problèmes et propose des actions correctives concrètes. Sois direct et pratique."
          userMessage={`Voici les résultats MSA R&R :
- %GRR (% Study Var) : ${msa.grrPct.toFixed(2)}%
- Répétabilité EV : ${msa.ev.toFixed(4)} (${msa.evPct.toFixed(1)}% study, ${msa.evContrib.toFixed(1)}% contribution)
- Reproductibilité AV : ${msa.av.toFixed(4)} (${msa.avPct.toFixed(1)}% study, ${msa.avContrib.toFixed(1)}% contribution)
- R&R GRR : ${msa.grr.toFixed(4)} (${msa.grrPct.toFixed(1)}% study, ${msa.grrContrib.toFixed(1)}% contribution)
- Variation pièce à pièce PV : ${msa.pv.toFixed(4)} (${msa.pvPct.toFixed(1)}% study, ${msa.pvContrib.toFixed(1)}% contribution)
- Variation totale TV : ${msa.tv.toFixed(4)}
- Nombre de catégories distinctes (ndc) : ${msa.ndc}
- Pièces : ${msa.parts} | Opérateurs : ${msa.operators} | Essais : ${msa.trials}
- Statut : ${msa.interpretation}

Donne une interprétation complète et des recommandations pour améliorer le système de mesure.`}
        />
      </div>

    </AppLayout>
  );
};

// ── Helpers ──

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <Label className="text-xs text-muted-foreground">{label}</Label>
    <div className="mt-1 [&_input]:h-8 [&_input]:text-sm">{children}</div>
  </div>
);

const SpecRow = ({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) => (
  <div className="flex justify-between items-center border-b border-border/50 py-2.5">
    <span className="text-xs text-muted-foreground">{label}</span>
    <span className={`text-sm font-semibold tabular-nums ${highlight ? "text-success" : ""}`}>{value}</span>
  </div>
);

const ResultRow = ({ label, val, contrib, pct, bold }: {
  label: string; val: number; contrib: number; pct: number; bold?: boolean;
}) => (
  <tr className={`border-b border-border/50 ${bold ? "font-semibold bg-accent/30" : ""}`}>
    <td className="py-2">{label}</td>
    <td className="text-right tabular-nums">{val.toFixed(4)}</td>
    <td className="text-right tabular-nums">{contrib.toFixed(2)}%</td>
    <td className="text-right tabular-nums">{pct.toFixed(2)}%</td>
  </tr>
);

export default MSAPage;
