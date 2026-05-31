import { useMemo, useRef, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { SectionCard } from "@/components/dashboard/SectionCard";
import { SpecsPanel } from "@/components/specs/SpecsPanel";
import { MSASpecsPanel } from "@/components/specs/MSASpecsPanel";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAppStore, appActions, absLimits } from "@/store/app-store";
import { detectSheet } from "@/lib/auto-detect";
import {
  computeXbarR,
  computeCapability,
  computeMSA,
  computeUncertaintyTypeA,
  combineUncertainties,
  buildHistogram,
  normalPdf,
  MSAEntry,
  buildXbarRefLines,
  buildRRefLines,
} from "@/lib/spc-engine";
import { DEMO_SUBGROUPS, DEMO_MSA } from "@/lib/demo-data";
import { downloadXLSX } from "@/lib/excel";
import { notificationActions } from "@/lib/notifications";
import { ControlChart } from "@/components/charts/ControlChart";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { FileText, FileSpreadsheet, Loader2, BarChart2, Gauge } from "lucide-react";
import { toast } from "sonner";

type ReportType = "spc" | "msa";
type SpcSection = "spc" | "capability" | "uncertainty" | "documentNumber";
type MsaSection = "msa" | "uncertainty" | "documentNumber";

const ReportsPage = () => {
  const specs = useAppStore((s) => s.specs);
  const msaProjectSpecs = useAppStore((s) => s.msaProjectSpecs);
  const mapping = useAppStore((s) => s.mapping);
  const perColumnSpecs = useAppStore((s) => s.perColumnSpecs);
  const spcSheet = useAppStore(() => appActions.getSheetForKind("spc"));
  const msaSheet = useAppStore(() => appActions.getSheetForKind("msa"));
  const filesCount = useAppStore((s) => s.files.length);

  const [reportType, setReportType] = useState<ReportType>("spc");

  const [spcSelected, setSpcSelected] = useState<Record<SpcSection, boolean>>({
    spc: true,
    capability: true,
    uncertainty: true,
    documentNumber: false,
  });
  const [msaSelected, setMsaSelected] = useState<Record<MsaSection, boolean>>({
    msa: true,
    uncertainty: true,
    documentNumber: false,
  });

  const [busy, setBusy] = useState<"pdf" | "xlsx" | null>(null);
  const [reportDate, setReportDate] = useState(new Date().toISOString().slice(0, 10));
  const [reportAuthor, setReportAuthor] = useState("");
  const [documentNumber, setDocumentNumber] = useState("");

  const xbarChartRef = useRef<HTMLDivElement>(null);
  const rChartRef = useRef<HTMLDivElement>(null);
  const msaPieRef = useRef<HTMLDivElement>(null);

  const toggleSpc = (k: SpcSection) => setSpcSelected((s) => ({ ...s, [k]: !s[k] }));
  const toggleMsa = (k: MsaSection) => setMsaSelected((s) => ({ ...s, [k]: !s[k] }));

  // ===== Build datasets =====
  const subgroups = useMemo<number[][]>(() => {
    if (!spcSheet) return DEMO_SUBGROUPS;

    // Resolve measure columns: prefer global mapping if columns exist in this sheet,
    // otherwise fall back to detectSheet auto-detection (same as SPCPage)
    const detected = detectSheet(spcSheet);
    const detectedCols = (detected.mapping.measureCols ?? []) as string[];
    const numericCols = spcSheet.headers.filter((h) => {
      const sample = spcSheet.rows.slice(0, 10).map((r) => Number(r[h]));
      return sample.filter((v) => !isNaN(v)).length >= Math.min(3, sample.length);
    });
    const mappingValid = mapping.measureCols.length > 0 &&
      mapping.measureCols.every((c) => spcSheet.headers.includes(c));
    const measureCols = mappingValid
      ? mapping.measureCols
      : detectedCols.filter((c) => numericCols.includes(c)).length > 0
        ? detectedCols.filter((c) => numericCols.includes(c))
        : numericCols.slice(0, 5);

    if (measureCols.length === 0) return DEMO_SUBGROUPS;

    if (measureCols.length >= 2) {
      const g = spcSheet.rows
        .map((r) => measureCols.map((c) => Number(r[c])))
        .filter((row) => row.every((v) => !isNaN(v)));
      if (g.length) return g;
    } else {
      const flat = spcSheet.rows.map((r) => Number(r[measureCols[0]])).filter((v) => !isNaN(v));
      const n = Math.max(2, Math.min(10, specs.subgroupSize));
      const groups: number[][] = [];
      for (let i = 0; i + n <= flat.length; i += n) groups.push(flat.slice(i, i + n));
      if (groups.length) return groups;
    }
    return DEMO_SUBGROUPS;
  }, [spcSheet, mapping.measureCols, specs.subgroupSize]);

  const flatValues = useMemo(() => subgroups.flat(), [subgroups]);
  const spc = useMemo(() => computeXbarR(subgroups), [subgroups]);
  const cap = useMemo(() => {
    const { lsl, usl } = absLimits(specs);
    return computeCapability(flatValues, lsl, usl, specs.target, specs.subgroupSize);
  }, [flatValues, specs]);

  const msaEntries = useMemo<MSAEntry[]>(() => {
    if (!msaSheet) return DEMO_MSA;

    // Auto-detect MSA columns from the MSA sheet (same approach as MSAPage)
    const detected = detectSheet(msaSheet);
    const partCol   = mapping.partCol     ?? detected.mapping.partCol     ?? null;
    const operatorCol = mapping.operatorCol ?? detected.mapping.operatorCol ?? null;
    const trialCol  = mapping.trialCol    ?? detected.mapping.trialCol    ?? null;
    const valueCol  = mapping.valueCol    ?? detected.mapping.valueCol    ?? null;

    if (!partCol || !operatorCol || !valueCol) return DEMO_MSA;

    const e = msaSheet.rows
      .map((r, i) => ({
        part: r[partCol] ?? "",
        operator: r[operatorCol] ?? "",
        trial: trialCol ? Number(r[trialCol]) : i,
        value: Number(r[valueCol]),
      }))
      .filter((x) => x.part !== "" && x.operator !== "" && !isNaN(x.value));
    return e.length > 0 ? e : DEMO_MSA;
  }, [msaSheet, mapping]);

  const msa = useMemo(() => computeMSA(msaEntries), [msaEntries]);
  const typeA = useMemo(() => computeUncertaintyTypeA(flatValues), [flatValues]);
  const uncertainty = useMemo(
    () =>
      combineUncertainties(typeA.uA, [
        { name: "Résolution instrument", type: "B", value: 0.0029 },
        { name: "Étalonnage", type: "B", value: 0.002 },
      ]),
    [typeA]
  );

  const hist = useMemo(() => {
    const h = buildHistogram(flatValues, 22);
    const sigma = cap.stdLongTerm || 0.001;
    const maxCount = Math.max(...h.map((d) => d.count), 1);
    const maxPdf = normalPdf(cap.mean, cap.mean, sigma);
    return h.map((d) => ({
      ...d,
      pdf: maxPdf > 0 ? (normalPdf(d.bin, cap.mean, sigma) / maxPdf) * maxCount : 0,
    }));
  }, [flatValues, cap]);

  const msaPie = [
    { name: `EV ${msa.evPct.toFixed(1)}%`, value: msa.evPct, color: "hsl(var(--primary))" },
    { name: `AV ${msa.avPct.toFixed(1)}%`, value: msa.avPct, color: "hsl(var(--purple))" },
    { name: `PV ${msa.pvPct.toFixed(1)}%`, value: msa.pvPct, color: "hsl(var(--success))" },
  ];
  const msaBarData = [
    { name: "EV",  "% Contribution": +msa.evContrib.toFixed(2),  "% Study Var": +msa.evPct.toFixed(2) },
    { name: "AV",  "% Contribution": +msa.avContrib.toFixed(2),  "% Study Var": +msa.avPct.toFixed(2) },
    { name: "GRR", "% Contribution": +msa.grrContrib.toFixed(2), "% Study Var": +msa.grrPct.toFixed(2) },
    { name: "PV",  "% Contribution": +msa.pvContrib.toFixed(2),  "% Study Var": +msa.pvPct.toFixed(2) },
  ];

  const captureNode = async (node: HTMLDivElement | null): Promise<string | null> => {
    if (!node) return null;
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(node, {
        backgroundColor: "#ffffff",
        scale: 2,
        logging: false,
        useCORS: true,
      });
      return canvas.toDataURL("image/png");
    } catch (err) {
      console.error("Chart capture failed", err);
      return null;
    }
  };

  // ===== PDF Export =====
  const exportPdf = async () => {
    setBusy("pdf");
    try {
      const { jsPDF } = await import("jspdf");
      const autoTable = (await import("jspdf-autotable")).default;
      const doc = new jsPDF({ unit: "mm", format: "a4" });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();

      const sel = reportType === "spc" ? spcSelected : msaSelected;
      const docNum = (sel as any).documentNumber && documentNumber ? documentNumber : null;

      const tocEntries: { title: string; level: number; page: number }[] = [];

      const startSection = (title: string, level = 1) => {
        doc.addPage();
        const pageNum = doc.internal.pages.length - 1;
        tocEntries.push({ title, level, page: pageNum });
        doc.setFontSize(level === 1 ? 16 : 13);
        doc.setTextColor(37, 99, 235);
        doc.text(title, 14, 18);
        doc.setTextColor(0);
        doc.setFontSize(11);
        return pageNum;
      };

      // ===== Cover =====
      if (reportType === "spc") {
        doc.setFillColor(37, 99, 235);
        doc.rect(0, 0, pageW, 50, "F");
        doc.setTextColor(255);
        doc.setFontSize(22);
        doc.text("Rapport SPC & Capabilité", 14, 22);
        doc.setFontSize(13);
        doc.text("Contrôle statistique du procédé", 14, 32);
        doc.setFontSize(10);
        doc.text(`Date : ${reportDate}`, 14, 42);
        if (reportAuthor) doc.text(`Préparé par : ${reportAuthor}`, pageW / 2, 42);
        doc.setTextColor(0);
        doc.setFontSize(28);
        doc.text(specs.projectName, 14, 80);
        doc.setFontSize(11);
        doc.setTextColor(80);
        if (specs.sampleName) doc.text(`Échantillon : ${specs.sampleName}`, 14, 90);
        if (docNum) doc.text(`N° document : ${docNum}`, 14, specs.sampleName ? 98 : 90);
        const metaY = specs.sampleName || docNum ? 108 : 92;
        doc.text(`Taille sous-groupe : n = ${specs.subgroupSize} · Unité : ${specs.unit}`, 14, metaY);
        doc.text(`LSI : ${absLimits(specs).lsl} · LSS : ${absLimits(specs).usl} · Cible : ${specs.target}`, 14, metaY + 8);
        doc.text(`Source : ${filesCount > 0 ? `${filesCount} fichier(s) Excel importé(s)` : "Données de démonstration"}`, 14, metaY + 16);
      } else {
        doc.setFillColor(147, 51, 234);
        doc.rect(0, 0, pageW, 50, "F");
        doc.setTextColor(255);
        doc.setFontSize(22);
        doc.text("Rapport MSA — Analyse du système de mesure", 14, 22);
        doc.setFontSize(13);
        doc.text("Répétabilité · Reproductibilité · R&R", 14, 32);
        doc.setFontSize(10);
        doc.text(`Date : ${reportDate}`, 14, 42);
        if (reportAuthor) doc.text(`Préparé par : ${reportAuthor}`, pageW / 2, 42);
        doc.setTextColor(0);
        doc.setFontSize(20);
        doc.text(msaProjectSpecs.piece || specs.projectName, 14, 75);
        doc.setFontSize(11);
        doc.setTextColor(80);
        const msaMeta: [string, string][] = [
          ["Équipement", msaProjectSpecs.equipment || "—"],
          ["Référence", msaProjectSpecs.reference || "—"],
          ["Caractéristique", msaProjectSpecs.characteristics || "—"],
          ["Résolution", msaProjectSpecs.resolutionVal ? `${msaProjectSpecs.resolutionVal} ${msaProjectSpecs.resolutionUnit}` : "—"],
          ["Cible", msaProjectSpecs.target || "—"],
          ["Tolérance inf.", msaProjectSpecs.toleranceInf || "—"],
          ["Tolérance sup.", msaProjectSpecs.toleranceSup || "—"],
        ];
        if (docNum) msaMeta.push(["N° document", docNum]);
        msaMeta.forEach(([k, v], i) => doc.text(`${k} : ${v}`, 14, 85 + i * 8));
        doc.text(`Source : ${filesCount > 0 ? `${filesCount} fichier(s) Excel importé(s)` : "Données de démonstration"}`, 14, 85 + msaMeta.length * 8 + 4);
      }

      // TOC placeholder
      doc.addPage();
      const tocPageNumber = doc.internal.pages.length - 1;

      // ===== SPC sections =====
      if (reportType === "spc") {
        const s = spcSelected;

        if (s.spc) {
          const perColumnCap = (spcSheet && mapping.measureCols.length > 0)
            ? mapping.measureCols.map((c) => {
                const vals = spcSheet.rows.map((r) => Number(r[c])).filter((v) => !isNaN(v));
                const eff = perColumnSpecs[c] ?? absLimits(specs);
                const ccap = vals.length > 1
                  ? computeCapability(vals, eff.lsl, eff.usl, eff.target, specs.subgroupSize)
                  : null;
                return { col: c, eff, cap: ccap, n: vals.length };
              })
            : [];

          startSection("1. Contrôle statistique du procédé (SPC)", 1);
          autoTable(doc, {
            startY: 24,
            head: [["Paramètre", "Valeur"]],
            body: [
              ["Sous-groupes", String(subgroups.length)],
              ["Taille (n)", String(spc.n)],
              ["Moy. des moyennes", spc.xbar.toFixed(4)],
              ["Moy. des étendues", spc.rbar.toFixed(4)],
              ["UCL Xbarre", spc.uclX.toFixed(4)],
              ["LCL Xbarre", spc.lclX.toFixed(4)],
              ["UCL R", spc.uclR.toFixed(4)],
              ["Sigma-hat (court terme)", spc.sigmaHat.toFixed(4)],
              ["Points hors contrôle", String(spc.outOfControl.length)],
              ["Règles WE déclenchées", String(spc.westernElectric.length)],
            ],
            theme: "grid",
            headStyles: { fillColor: [37, 99, 235] },
          });
          let cy = (doc as any).lastAutoTable.finalY + 6;
          const xbarImg = await captureNode(xbarChartRef.current);
          if (xbarImg) { doc.addImage(xbarImg, "PNG", 14, cy, pageW - 28, 70); cy += 74; }
          const rImg = await captureNode(rChartRef.current);
          if (rImg) doc.addImage(rImg, "PNG", 14, cy, pageW - 28, 60);

          if (spc.westernElectric.length > 0 || spc.outOfControl.length > 0) {
            startSection("1.1 Anomalies détectées", 2);
            autoTable(doc, {
              startY: 24,
              head: [["Type", "Règle", "Sous-groupe", "Description"]],
              body: [
                ...spc.outOfControl.map((i) => ["Hors limites", "—", `#${i + 1}`, "Point au-delà des limites de contrôle"]),
                ...spc.westernElectric.map((r) => [`Règle WE ${r.rule}`, String(r.rule), `#${r.index + 1}`, r.description]),
              ],
              theme: "striped",
              headStyles: { fillColor: [220, 38, 38] },
            });
          }

          if (s.capability) {
            startSection("2. Capabilité du processus", 1);
            autoTable(doc, {
              startY: 24,
              head: [["Indice", "Valeur", "Statut"]],
              body: [
                ["Cp", cap.cp.toFixed(3), cap.cp >= 1.33 ? "Capable" : cap.cp >= 1 ? "À améliorer" : "Non capable"],
                ["Cpk", cap.cpk.toFixed(3), cap.cpk >= 1.33 ? "Capable" : cap.cpk >= 1 ? "À améliorer" : "Non capable"],
                ["Pp", cap.pp.toFixed(3), "-"],
                ["Ppk", cap.ppk.toFixed(3), cap.ppk >= 1.33 ? "Capable" : cap.ppk >= 1 ? "À améliorer" : "Non capable"],
                ["Cpm", cap.cpm?.toFixed(3) ?? "-", "-"],
                ["Moyenne", cap.mean.toFixed(4), "-"],
                ["Sigma court terme", cap.stdShortTerm.toFixed(4), "-"],
                ["Sigma long terme", cap.stdLongTerm.toFixed(4), "-"],
              ],
              theme: "striped",
              headStyles: { fillColor: [37, 99, 235] },
            });
            doc.setFontSize(10); doc.setTextColor(60);
            doc.text(`Interprétation : ${cap.interpretation}`, 14, (doc as any).lastAutoTable.finalY + 8);
            doc.setTextColor(0);

            if (perColumnCap.length > 1) {
              startSection("2.1 Capabilité par colonne de mesure", 2);
              autoTable(doc, {
                startY: 24,
                head: [["Colonne", "LSL", "Cible", "USL", "Moyenne", "Sigma", "Cp", "Cpk", "Ppk", "Statut"]],
                body: perColumnCap
                  .filter((p) => p.cap)
                  .map((p) => [
                    p.col, String(p.eff.lsl), String(p.eff.target), String(p.eff.usl),
                    p.cap!.mean.toFixed(3), p.cap!.stdLongTerm.toFixed(3),
                    p.cap!.cp.toFixed(2), p.cap!.cpk.toFixed(2), p.cap!.ppk.toFixed(2), p.cap!.status,
                  ]),
                theme: "grid",
                headStyles: { fillColor: [37, 99, 235] },
                styles: { fontSize: 8 },
              });
            }
          }
        } else if (s.capability) {
          startSection("1. Capabilité du processus", 1);
          autoTable(doc, {
            startY: 24,
            head: [["Indice", "Valeur", "Statut"]],
            body: [
              ["Cp", cap.cp.toFixed(3), cap.cp >= 1.33 ? "Capable" : cap.cp >= 1 ? "À améliorer" : "Non capable"],
              ["Cpk", cap.cpk.toFixed(3), cap.cpk >= 1.33 ? "Capable" : cap.cpk >= 1 ? "À améliorer" : "Non capable"],
              ["Pp", cap.pp.toFixed(3), "-"],
              ["Ppk", cap.ppk.toFixed(3), cap.ppk >= 1.33 ? "Capable" : cap.ppk >= 1 ? "À améliorer" : "Non capable"],
              ["Cpm", cap.cpm?.toFixed(3) ?? "-", "-"],
              ["Moyenne", cap.mean.toFixed(4), "-"],
            ],
            theme: "striped",
            headStyles: { fillColor: [37, 99, 235] },
          });
        }

        if (s.uncertainty) {
          const sectionNum = s.spc || s.capability ? (s.spc && s.capability ? 3 : 2) : 1;
          startSection(`${sectionNum}. Incertitude de mesure`, 1);
          autoTable(doc, {
            startY: 24,
            head: [["Composante", "Valeur"]],
            body: [
              ["N", String(typeA.n)],
              ["Moyenne", typeA.mean.toFixed(4)],
              ["s", typeA.s.toFixed(5)],
              ["uA", uncertainty.uA.toFixed(5)],
              ["uB", uncertainty.uB.toFixed(5)],
              ["uC", uncertainty.uC.toFixed(5)],
              ["k", String(uncertainty.k)],
              ["U", uncertainty.U.toFixed(5)],
              ["Résultat", `${typeA.mean.toFixed(4)} ± ${uncertainty.U.toFixed(5)} ${specs.unit}`],
            ],
            theme: "grid",
            headStyles: { fillColor: [37, 99, 235] },
          });
        }

        // Annexes SPC
        startSection("A. Annexes — Paramètres du projet", 1);
        autoTable(doc, {
          startY: 24,
          head: [["Paramètre", "Valeur"]],
          body: [
            ["Société", specs.projectName],
            ["Échantillon", specs.sampleName || "—"],
            ["Date du rapport", reportDate],
            ["Préparé par", reportAuthor || "—"],
            ...(docNum ? [["N° document", docNum]] : []),
            ["Unité", specs.unit],
            ["LSI", String(absLimits(specs).lsl)],
            ["LSS", String(absLimits(specs).usl)],
            ["Cible", String(specs.target)],
            ["n (sous-groupe)", String(specs.subgroupSize)],
            ["Colonnes de mesure", mapping.measureCols.join(", ") || "—"],
          ],
          theme: "grid",
          headStyles: { fillColor: [100, 100, 100] },
        });

        if (Object.keys(perColumnSpecs).length > 0) {
          startSection("B. Annexes — Spécifications par colonne", 1);
          autoTable(doc, {
            startY: 24,
            head: [["Colonne", "LSL", "Cible", "USL"]],
            body: Object.entries(perColumnSpecs).map(([c, v]) => [c, String(v.lsl), String(v.target), String(v.usl)]),
            theme: "striped",
            headStyles: { fillColor: [100, 100, 100] },
          });
        }

        startSection("C. Annexes — Données sources (extrait)", 1);
        autoTable(doc, {
          startY: 24,
          head: [["#", ...Array.from({ length: spc.n }, (_, i) => `M${i + 1}`), "Xbarre", "R"]],
          body: subgroups.slice(0, 25).map((g, i) => [
            String(i + 1), ...g.map((v) => v.toFixed(3)),
            spc.subgroupMeans[i].toFixed(3), spc.subgroupRanges[i].toFixed(3),
          ]),
          theme: "striped",
          styles: { fontSize: 8 },
          headStyles: { fillColor: [100, 100, 100] },
        });
        if (subgroups.length > 25) {
          doc.setFontSize(9); doc.setTextColor(120);
          doc.text(`... ${subgroups.length - 25} sous-groupes supplémentaires non affichés`, 14, (doc as any).lastAutoTable.finalY + 6);
          doc.setTextColor(0);
        }
      }

      // ===== MSA sections =====
      if (reportType === "msa") {
        const s = msaSelected;

        if (s.msa) {
          startSection("1. Analyse du système de mesure (MSA / R&R)", 1);
          autoTable(doc, {
            startY: 24,
            head: [["Source", "Écart-type", "% Contribution", "% Study Var"]],
            body: [
              ["Répétabilité (EV)", msa.ev.toFixed(4), msa.evContrib.toFixed(2) + "%", msa.evPct.toFixed(2) + "%"],
              ["Reproductibilité (AV)", msa.av.toFixed(4), msa.avContrib.toFixed(2) + "%", msa.avPct.toFixed(2) + "%"],
              ["R&R (GRR)", msa.grr.toFixed(4), msa.grrContrib.toFixed(2) + "%", msa.grrPct.toFixed(2) + "%"],
              ["Pièce à pièce (PV)", msa.pv.toFixed(4), msa.pvContrib.toFixed(2) + "%", msa.pvPct.toFixed(2) + "%"],
              ["Total Variation (TV)", msa.tv.toFixed(4), "100%", "100%"],
            ],
            theme: "grid",
            headStyles: { fillColor: [147, 51, 234] },
          });
          autoTable(doc, {
            startY: (doc as any).lastAutoTable.finalY + 4,
            body: [
              ["Pièces", String(msa.parts)],
              ["Opérateurs", String(msa.operators)],
              ["Essais (r)", String(msa.trials)],
              ["ndc", String(msa.ndc)],
              ["%GRR", msa.grrPct.toFixed(2) + "%"],
              ["Statut", msa.interpretation],
            ],
            theme: "plain",
            styles: { fontSize: 9 },
          });
          const pieImg = await captureNode(msaPieRef.current);
          if (pieImg) {
            const cy = (doc as any).lastAutoTable.finalY + 6;
            doc.addImage(pieImg, "PNG", 30, cy, 150, 70);
          }
        }

        if (s.uncertainty) {
          startSection(`${s.msa ? 2 : 1}. Incertitude de mesure`, 1);
          autoTable(doc, {
            startY: 24,
            head: [["Composante", "Valeur"]],
            body: [
              ["N", String(typeA.n)],
              ["Moyenne", typeA.mean.toFixed(4)],
              ["s", typeA.s.toFixed(5)],
              ["uA", uncertainty.uA.toFixed(5)],
              ["uB", uncertainty.uB.toFixed(5)],
              ["uC", uncertainty.uC.toFixed(5)],
              ["k", String(uncertainty.k)],
              ["U", uncertainty.U.toFixed(5)],
              ["Résultat", `${typeA.mean.toFixed(4)} ± ${uncertainty.U.toFixed(5)} ${specs.unit}`],
            ],
            theme: "grid",
            headStyles: { fillColor: [147, 51, 234] },
          });
        }

        // Annexes MSA
        startSection("A. Annexes — Paramètres MSA", 1);
        autoTable(doc, {
          startY: 24,
          head: [["Paramètre", "Valeur"]],
          body: [
            ["Équipement", msaProjectSpecs.equipment || "—"],
            ["Référence", msaProjectSpecs.reference || "—"],
            ["Pièce", msaProjectSpecs.piece || "—"],
            ["Caractéristique", msaProjectSpecs.characteristics || "—"],
            ["Résolution", msaProjectSpecs.resolutionVal ? `${msaProjectSpecs.resolutionVal} ${msaProjectSpecs.resolutionUnit}` : "—"],
            ["Cible", msaProjectSpecs.target || "—"],
            ["Tolérance inférieure", msaProjectSpecs.toleranceInf || "—"],
            ["Tolérance supérieure", msaProjectSpecs.toleranceSup || "—"],
            ["Date du rapport", reportDate],
            ["Préparé par", reportAuthor || "—"],
            ...(docNum ? [["N° document", docNum]] : []),
            ["Colonne pièce", mapping.partCol ?? "—"],
            ["Colonne opérateur", mapping.operatorCol ?? "—"],
            ["Colonne mesure", mapping.valueCol ?? "—"],
          ],
          theme: "grid",
          headStyles: { fillColor: [100, 100, 100] },
        });
      }

      // ===== TOC =====
      doc.setPage(tocPageNumber);
      doc.setFontSize(20);
      doc.setTextColor(reportType === "spc" ? 37 : 147, reportType === "spc" ? 99 : 51, reportType === "spc" ? 235 : 234);
      doc.text("Table des matières", 14, 22);
      doc.setTextColor(0);
      doc.setFontSize(11);
      let ty = 36;
      tocEntries.forEach((entry) => {
        const indent = entry.level === 1 ? 14 : 22;
        const fontSize = entry.level === 1 ? 11 : 10;
        doc.setFontSize(fontSize);
        if (entry.level === 1) doc.setFont("helvetica", "bold");
        else doc.setFont("helvetica", "normal");
        const titleX = indent;
        const pageX = pageW - 20;
        doc.text(entry.title, titleX, ty);
        const dotsStart = titleX + doc.getTextWidth(entry.title) + 2;
        const dotsEnd = pageX - 6;
        if (dotsEnd > dotsStart) {
          doc.setTextColor(180);
          let dx = dotsStart;
          while (dx < dotsEnd) { doc.text(".", dx, ty); dx += 2; }
          doc.setTextColor(0);
        }
        doc.text(String(entry.page), pageX, ty);
        (doc as any).link(titleX, ty - 4, pageW - titleX - 10, 6, { pageNumber: entry.page });
        ty += entry.level === 1 ? 8 : 6.5;
        if (ty > pageH - 20) { doc.addPage(); doc.setPage(doc.internal.pages.length - 1); ty = 22; }
      });
      doc.setFont("helvetica", "normal");

      // Page numbers
      const total = doc.internal.pages.length - 1;
      for (let p = 1; p <= total; p++) {
        doc.setPage(p);
        doc.setFontSize(8);
        doc.setTextColor(150);
        const label = reportType === "spc"
          ? [specs.projectName, specs.sampleName, docNum].filter(Boolean).join(" · ")
          : [msaProjectSpecs.piece || specs.projectName, msaProjectSpecs.equipment, docNum].filter(Boolean).join(" · ");
        doc.text(`${label} · Page ${p} / ${total}`, pageW / 2, pageH - 6, { align: "center" });
        doc.setTextColor(0);
      }

      const prefix = reportType === "spc" ? "rapport_spc" : "rapport_msa";
      doc.save(`${prefix}_${specs.projectName.replace(/\s+/g, "_")}_${reportDate}.pdf`);
      toast.success(`Rapport ${reportType.toUpperCase()} PDF généré`);
      notificationActions.add({ type: "success", title: `Rapport ${reportType.toUpperCase()} PDF généré`, message: "Table des matières cliquable incluse." });
    } catch (err: any) {
      toast.error("Erreur PDF", { description: err.message });
      notificationActions.add({ type: "error", title: "Erreur PDF", message: err.message });
    } finally {
      setBusy(null);
    }
  };

  // ===== Excel Export =====
  const exportXlsx = async () => {
    setBusy("xlsx");
    try {
      const sheets: { name: string; rows: any[][] }[] = [];
      const sel = reportType === "spc" ? spcSelected : msaSelected;
      const docNum = (sel as any).documentNumber && documentNumber ? documentNumber : null;

      if (reportType === "spc") {
        const s = spcSelected;
        sheets.push({
          name: "Synthèse",
          rows: [
            ["Rapport SPC & Capabilité"],
            ["Société", specs.projectName],
            ["Échantillon", specs.sampleName || "—"],
            ["Date du rapport", reportDate],
            ["Préparé par", reportAuthor || "—"],
            ...(docNum ? [["N° document", docNum]] : []),
            ["Unité", specs.unit],
            ["LSI", absLimits(specs).lsl],
            ["LSS", absLimits(specs).usl],
            ["Cible", specs.target],
            ["Taille sous-groupe", specs.subgroupSize],
          ],
        });
        if (s.spc) {
          sheets.push({
            name: "SPC - Données",
            rows: [
              ["Sous-groupe", ...Array.from({ length: spc.n }, (_, i) => `Mesure ${i + 1}`), "Moyenne", "Étendue"],
              ...subgroups.map((g, i) => [i + 1, ...g, spc.subgroupMeans[i], spc.subgroupRanges[i]]),
            ],
          });
          sheets.push({
            name: "SPC - Limites",
            rows: [
              ["Paramètre", "Valeur"],
              ["X̿ (moy. des moy.)", spc.xbar],
              ["R̄ (moy. étendues)", spc.rbar],
              ["UCL X̄", spc.uclX],
              ["CL X̄", spc.clX],
              ["LCL X̄", spc.lclX],
              ["UCL R", spc.uclR],
              ["CL R", spc.clR],
              ["LCL R", spc.lclR],
              ["Sigma estimé", spc.sigmaHat],
              ["Points hors contrôle", spc.outOfControl.length],
              [],
              ["Règles Western Electric"],
              ["Règle", "Sous-groupe", "Description"],
              ...spc.westernElectric.map((r) => [r.rule, r.index + 1, r.description]),
            ],
          });
        }
        if (s.capability) {
          sheets.push({
            name: "Capabilité",
            rows: [
              ["Indice", "Valeur"],
              ["Cp", cap.cp], ["Cpk", cap.cpk], ["Pp", cap.pp], ["Ppk", cap.ppk],
              ["Cpm", cap.cpm ?? ""], ["Moyenne", cap.mean],
              ["Sigma court terme", cap.stdShortTerm], ["Sigma long terme", cap.stdLongTerm],
              ["LSL", cap.lsl], ["USL", cap.usl], ["Target", cap.target ?? ""],
              ["Statut", cap.interpretation],
              [], ["Histogramme"], ["Bin centre", "Effectif", "Densité normale"],
              ...hist.map((h) => [h.bin, h.count, h.pdf]),
            ],
          });
        }
        if (s.uncertainty) {
          sheets.push({
            name: "Incertitude",
            rows: [
              ["Composante", "Valeur"],
              ["N", typeA.n], ["Moyenne", typeA.mean], ["s", typeA.s],
              ["uA", uncertainty.uA], ["uB", uncertainty.uB], ["uC", uncertainty.uC],
              ["k", uncertainty.k], ["U (élargie)", uncertainty.U],
              ["Résultat", `${typeA.mean.toFixed(4)} ± ${uncertainty.U.toFixed(5)} ${specs.unit}`],
            ],
          });
        }
      } else {
        const s = msaSelected;
        sheets.push({
          name: "Synthèse",
          rows: [
            ["Rapport MSA — Analyse du système de mesure"],
            ["Équipement", msaProjectSpecs.equipment || "—"],
            ["Référence", msaProjectSpecs.reference || "—"],
            ["Pièce", msaProjectSpecs.piece || "—"],
            ["Caractéristique", msaProjectSpecs.characteristics || "—"],
            ["Résolution", msaProjectSpecs.resolutionVal ? `${msaProjectSpecs.resolutionVal} ${msaProjectSpecs.resolutionUnit}` : "—"],
            ["Cible", msaProjectSpecs.target || "—"],
            ["Tolérance inférieure", msaProjectSpecs.toleranceInf || "—"],
            ["Tolérance supérieure", msaProjectSpecs.toleranceSup || "—"],
            ["Date du rapport", reportDate],
            ["Préparé par", reportAuthor || "—"],
            ...(docNum ? [["N° document", docNum]] : []),
          ],
        });
        if (s.msa) {
          sheets.push({
            name: "MSA - R&R",
            rows: [
              ["Source", "Écart-type", "% Contribution", "% Study Var"],
              ["EV (Répétabilité)", msa.ev, msa.evContrib, msa.evPct],
              ["AV (Reproductibilité)", msa.av, msa.avContrib, msa.avPct],
              ["GRR (R&R)", msa.grr, msa.grrContrib, msa.grrPct],
              ["PV (Pièce à pièce)", msa.pv, msa.pvContrib, msa.pvPct],
              ["TV (Total)", msa.tv, 100, 100],
              [],
              ["Pièces", msa.parts], ["Opérateurs", msa.operators],
              ["Essais (r)", msa.trials], ["ndc", msa.ndc],
              ["%GRR", msa.grrPct], ["Statut", msa.interpretation],
            ],
          });
        }
        if (s.uncertainty) {
          sheets.push({
            name: "Incertitude",
            rows: [
              ["Composante", "Valeur"],
              ["N", typeA.n], ["Moyenne", typeA.mean], ["s", typeA.s],
              ["uA", uncertainty.uA], ["uB", uncertainty.uB], ["uC", uncertainty.uC],
              ["k", uncertainty.k], ["U (élargie)", uncertainty.U],
              ["Résultat", `${typeA.mean.toFixed(4)} ± ${uncertainty.U.toFixed(5)} ${specs.unit}`],
            ],
          });
        }
      }

      const prefix = reportType === "spc" ? "rapport_spc" : "rapport_msa";
      downloadXLSX(`${prefix}_${specs.projectName.replace(/\s+/g, "_")}_${reportDate}.xlsx`, sheets);
      toast.success(`Export Excel ${reportType.toUpperCase()} généré`);
      notificationActions.add({ type: "success", title: `Export Excel ${reportType.toUpperCase()} généré`, message: "Fichier multi-feuilles prêt." });
    } catch (err: any) {
      toast.error("Erreur Excel", { description: err.message });
      notificationActions.add({ type: "error", title: "Erreur Excel", message: err.message });
    } finally {
      setBusy(null);
    }
  };

  const spcSectionDefs: { key: SpcSection; label: string; desc: string }[] = [
    { key: "spc", label: "Cartes SPC (X̄-R)", desc: "Cartes de contrôle, limites, règles Western Electric" },
    { key: "capability", label: "Capabilité", desc: "Cp, Cpk, Pp, Ppk, Cpm, histogramme + courbe normale" },
    { key: "uncertainty", label: "Incertitude", desc: "Type A + Type B, combinée, élargie (U)" },
    { key: "documentNumber", label: "Numéro de document", desc: "Inclure le numéro de document dans l'en-tête" },
  ];

  const msaSectionDefs: { key: MsaSection; label: string; desc: string }[] = [
    { key: "msa", label: "MSA (R&R)", desc: "Répétabilité, reproductibilité, %GRR, ndc, décomposition" },
    { key: "uncertainty", label: "Incertitude", desc: "Type A + Type B, combinée, élargie (U)" },
    { key: "documentNumber", label: "Numéro de document", desc: "Inclure le numéro de document dans l'en-tête" },
  ];

  const anySelected = reportType === "spc"
    ? Object.values(spcSelected).some(Boolean)
    : Object.values(msaSelected).some(Boolean);

  return (
    <AppLayout
      title="Rapports"
      subtitle={`${specs.projectName} · Génération PDF & Excel`}
    >
      {/* ── Report type selector ── */}
      <SectionCard title="Type de rapport" className="mb-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button
            onClick={() => setReportType("spc")}
            className={`flex items-start gap-4 p-4 rounded-xl border-2 text-left transition-all ${
              reportType === "spc"
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/40 hover:bg-accent/10"
            }`}
          >
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
              reportType === "spc" ? "bg-primary/15" : "bg-muted"
            }`}>
              <BarChart2 className={`w-5 h-5 ${reportType === "spc" ? "text-primary" : "text-muted-foreground"}`} />
            </div>
            <div>
              <div className={`font-semibold text-sm ${reportType === "spc" ? "text-primary" : ""}`}>
                Rapport SPC
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Cartes de contrôle X̄-R · Capabilité (Cp, Cpk) · Incertitude
              </div>
            </div>
          </button>

          <button
            onClick={() => setReportType("msa")}
            className={`flex items-start gap-4 p-4 rounded-xl border-2 text-left transition-all ${
              reportType === "msa"
                ? "border-purple-500 bg-purple-500/5"
                : "border-border hover:border-purple-400/40 hover:bg-accent/10"
            }`}
          >
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
              reportType === "msa" ? "bg-purple-500/15" : "bg-muted"
            }`}>
              <Gauge className={`w-5 h-5 ${reportType === "msa" ? "text-purple-500" : "text-muted-foreground"}`} />
            </div>
            <div>
              <div className={`font-semibold text-sm ${reportType === "msa" ? "text-purple-500" : ""}`}>
                Rapport MSA
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Répétabilité · Reproductibilité · %GRR · ndc · Incertitude
              </div>
            </div>
          </button>
        </div>
      </SectionCard>

      {/* ── Metadata ── */}
      <SectionCard title="Métadonnées du rapport" className="mb-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label className="text-xs">Date du rapport</Label>
            <Input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Préparé par</Label>
            <Input value={reportAuthor} onChange={(e) => setReportAuthor(e.target.value)} placeholder="Nom de l'auteur" />
          </div>
          <div>
            <Label className="text-xs">Numéro de document</Label>
            <Input value={documentNumber} onChange={(e) => setDocumentNumber(e.target.value)} placeholder="Ex : QC-2024-001" />
          </div>
        </div>
      </SectionCard>

      {/* ── Specs panel (contextual) ── */}
      <div className="mb-5">
        {reportType === "spc" ? <SpecsPanel /> : <MSASpecsPanel />}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">
        {/* ── Section selection ── */}
        <SectionCard title="Sections à inclure" className="lg:col-span-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {reportType === "spc"
              ? spcSectionDefs.map((s) => (
                  <label
                    key={s.key}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      spcSelected[s.key] ? "border-primary bg-accent/30" : "border-border hover:bg-accent/10"
                    }`}
                  >
                    <Checkbox checked={spcSelected[s.key]} onCheckedChange={() => toggleSpc(s.key)} className="mt-0.5" />
                    <div className="flex-1">
                      <div className="font-semibold text-sm">{s.label}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{s.desc}</div>
                    </div>
                  </label>
                ))
              : msaSectionDefs.map((s) => (
                  <label
                    key={s.key}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      msaSelected[s.key] ? "border-purple-500 bg-purple-500/5" : "border-border hover:bg-accent/10"
                    }`}
                  >
                    <Checkbox checked={msaSelected[s.key]} onCheckedChange={() => toggleMsa(s.key)} className="mt-0.5" />
                    <div className="flex-1">
                      <div className="font-semibold text-sm">{s.label}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{s.desc}</div>
                    </div>
                  </label>
                ))
            }
          </div>
        </SectionCard>

        {/* ── Generate ── */}
        <SectionCard title="Génération">
          <div className="space-y-3">
            <Button
              onClick={exportPdf}
              disabled={!anySelected || busy !== null}
              className={`w-full gap-2 ${reportType === "msa" ? "bg-purple-600 hover:bg-purple-700 text-white" : ""}`}
              size="lg"
            >
              {busy === "pdf" ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
              Générer le PDF
            </Button>
            <Button
              onClick={exportXlsx}
              disabled={!anySelected || busy !== null}
              variant="outline"
              className="w-full gap-2"
              size="lg"
            >
              {busy === "xlsx" ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
              Exporter en Excel
            </Button>
            <div className="text-xs text-muted-foreground pt-2 border-t border-border">
              Source : <strong className="text-foreground">{filesCount > 0 ? `${filesCount} fichier(s) importé(s)` : "Données de démonstration"}</strong>
            </div>
          </div>
        </SectionCard>
      </div>

      {/* ── Preview ── */}
      <SectionCard title="Aperçu des graphiques inclus">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {reportType === "spc" && (
            <>
              {spcSelected.spc && (
                <>
                  <div ref={xbarChartRef} className="bg-card p-3 rounded-lg border border-border">
                    <div className="text-xs font-medium text-muted-foreground mb-1">Carte X̄</div>
                    <ControlChart
                      values={spc.subgroupMeans}
                      referenceLines={buildXbarRefLines(spc)}
                      outOfControl={spc.outOfControl}
                      height={200}
                    />
                  </div>
                  <div ref={rChartRef} className="bg-card p-3 rounded-lg border border-border">
                    <div className="text-xs font-medium text-muted-foreground mb-1">Carte R</div>
                    <ControlChart
                      values={spc.subgroupRanges}
                      referenceLines={buildRRefLines(spc)}
                      color="hsl(var(--info))"
                      height={200}
                    />
                  </div>
                </>
              )}
              {spcSelected.capability && (
                <div className="bg-card p-3 rounded-lg border border-border lg:col-span-2">
                  <div className="text-xs font-medium text-muted-foreground mb-2">Indices de capabilité</div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Mini label="Cp"  v={cap.cp.toFixed(3)}  highlight={cap.cp >= 1.33} />
                    <Mini label="Cpk" v={cap.cpk.toFixed(3)} highlight={cap.cpk >= 1.33} />
                    <Mini label="Pp"  v={cap.pp.toFixed(3)} />
                    <Mini label="Ppk" v={cap.ppk.toFixed(3)} highlight={cap.ppk >= 1.33} />
                  </div>
                </div>
              )}
              {spcSelected.uncertainty && (
                <div className="bg-card p-3 rounded-lg border border-border lg:col-span-2 text-sm">
                  <div className="text-xs font-medium text-muted-foreground mb-2">Budget d'incertitude</div>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    <Mini label="uA" v={uncertainty.uA.toFixed(5)} />
                    <Mini label="uB" v={uncertainty.uB.toFixed(5)} />
                    <Mini label="uC" v={uncertainty.uC.toFixed(5)} />
                    <Mini label="k" v={String(uncertainty.k)} />
                    <Mini label="U élargie" v={uncertainty.U.toFixed(5)} highlight />
                  </div>
                </div>
              )}
            </>
          )}

          {reportType === "msa" && (
            <>
              {msaSelected.msa && (
                <>
                  <div ref={msaPieRef} className="bg-card p-3 rounded-lg border border-border">
                    <div className="text-xs font-medium text-muted-foreground mb-1">Décomposition de la variation</div>
                    <div className="h-64">
                      <ResponsiveContainer>
                        <PieChart>
                          <Pie data={msaPie} dataKey="value" cx="50%" cy="50%" outerRadius={90} innerRadius={45}>
                            {msaPie.map((d, i) => <Cell key={i} fill={d.color} />)}
                          </Pie>
                          <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 11 }} />
                          <Legend wrapperStyle={{ fontSize: 12 }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  <div className="bg-card p-3 rounded-lg border border-border">
                    <div className="text-xs font-medium text-muted-foreground mb-1">Comparaison des composantes</div>
                    <div className="h-64">
                      <ResponsiveContainer>
                        <BarChart data={msaBarData}>
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
                  </div>
                </>
              )}
              {msaSelected.uncertainty && (
                <div className="bg-card p-3 rounded-lg border border-border lg:col-span-2 text-sm">
                  <div className="text-xs font-medium text-muted-foreground mb-2">Budget d'incertitude</div>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    <Mini label="uA" v={uncertainty.uA.toFixed(5)} />
                    <Mini label="uB" v={uncertainty.uB.toFixed(5)} />
                    <Mini label="uC" v={uncertainty.uC.toFixed(5)} />
                    <Mini label="k" v={String(uncertainty.k)} />
                    <Mini label="U élargie" v={uncertainty.U.toFixed(5)} highlight />
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </SectionCard>
    </AppLayout>
  );
};

const Mini = ({ label, v, highlight }: { label: string; v: string; highlight?: boolean }) => (
  <div className={`rounded-md p-2 border ${highlight ? "border-orange/40 bg-orange/5" : "border-border bg-card"}`}>
    <div className="text-[10px] uppercase text-muted-foreground tracking-wider">{label}</div>
    <div className={`text-xl font-bold tabular-nums ${highlight ? "text-orange" : "text-primary"}`}>{v}</div>
  </div>
);

export default ReportsPage;
