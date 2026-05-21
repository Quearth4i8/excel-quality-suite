import { useMemo, useRef, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { SectionCard } from "@/components/dashboard/SectionCard";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAppStore, appActions } from "@/store/app-store";
import {
  computeXbarR,
  computeCapability,
  computeMSA,
  computeUncertaintyTypeA,
  combineUncertainties,
  buildHistogram,
  normalPdf,
  MSAEntry,
} from "@/lib/spc-engine";
import { DEMO_SUBGROUPS, DEMO_MSA } from "@/lib/demo-data";
import { downloadXLSX } from "@/lib/excel";
import { notificationActions } from "@/lib/notifications";
import { ControlChart } from "@/components/charts/ControlChart";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { FileText, FileSpreadsheet, Loader2 } from "lucide-react";
import { toast } from "sonner";

type ReportSection = "spc" | "capability" | "msa" | "uncertainty" | "documentNumber";

const ReportsPage = () => {
  const specs = useAppStore((s) => s.specs);
  const mapping = useAppStore((s) => s.mapping);
  const perColumnSpecs = useAppStore((s) => s.perColumnSpecs);
  const sheet = useAppStore(() => appActions.getAnalysisSheet());
  const filesCount = useAppStore((s) => s.files.length);

  const [selected, setSelected] = useState<Record<ReportSection, boolean>>({
    spc: true,
    capability: true,
    msa: true,
    uncertainty: true,
    documentNumber: false,
  });
  const [busy, setBusy] = useState<"pdf" | "xlsx" | null>(null);
  const [reportDate, setReportDate] = useState(new Date().toISOString().slice(0, 10));
  const [reportAuthor, setReportAuthor] = useState("");
  const [documentNumber, setDocumentNumber] = useState("");

  // refs for chart capture
  const xbarChartRef = useRef<HTMLDivElement>(null);
  const rChartRef = useRef<HTMLDivElement>(null);
  const histRef = useRef<HTMLDivElement>(null);
  const msaPieRef = useRef<HTMLDivElement>(null);

  // ===== Build datasets (live) =====
  const subgroups = useMemo<number[][]>(() => {
    if (sheet && mapping.measureCols.length > 0) {
      if (mapping.measureCols.length >= 2) {
        const g = sheet.rows
          .map((r) => mapping.measureCols.map((c) => Number(r[c])))
          .filter((row) => row.every((v) => !isNaN(v)));
        if (g.length) return g;
      } else {
        const flat = sheet.rows.map((r) => Number(r[mapping.measureCols[0]])).filter((v) => !isNaN(v));
        const n = Math.max(2, Math.min(10, specs.subgroupSize));
        const groups: number[][] = [];
        for (let i = 0; i + n <= flat.length; i += n) groups.push(flat.slice(i, i + n));
        if (groups.length) return groups;
      }
    }
    return DEMO_SUBGROUPS;
  }, [sheet, mapping.measureCols, specs.subgroupSize]);

  const flatValues = useMemo(() => subgroups.flat(), [subgroups]);
  const spc = useMemo(() => computeXbarR(subgroups), [subgroups]);
  const cap = useMemo(
    () => computeCapability(flatValues, specs.lsl, specs.usl, specs.target, specs.subgroupSize),
    [flatValues, specs]
  );

  const msaEntries = useMemo<MSAEntry[]>(() => {
    if (sheet && mapping.partCol && mapping.operatorCol && mapping.valueCol) {
      const e = sheet.rows
        .map((r, i) => ({
          part: r[mapping.partCol!] ?? "",
          operator: r[mapping.operatorCol!] ?? "",
          trial: mapping.trialCol ? Number(r[mapping.trialCol]) : i,
          value: Number(r[mapping.valueCol!]),
        }))
        .filter((x) => x.part !== "" && x.operator !== "" && !isNaN(x.value));
      if (e.length) return e;
    }
    return DEMO_MSA;
  }, [sheet, mapping]);

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
    { name: `EV ${msa.evPct.toFixed(1)}%`, value: msa.evPct, color: "#2563eb" },
    { name: `AV ${msa.avPct.toFixed(1)}%`, value: msa.avPct, color: "#9333ea" },
    { name: `PV ${msa.pvPct.toFixed(1)}%`, value: msa.pvPct, color: "#16a34a" },
  ];

  const toggle = (k: ReportSection) => setSelected((s) => ({ ...s, [k]: !s[k] }));

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

  // ===== PDF Export — hierarchical structure with clickable TOC =====
  const exportPdf = async () => {
    setBusy("pdf");
    try {
      const { jsPDF } = await import("jspdf");
      const autoTable = (await import("jspdf-autotable")).default;
      const doc = new jsPDF({ unit: "mm", format: "a4" });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();

      // Per-column capability table (annex)
      const perColumnCap = (sheet && mapping.measureCols.length > 0)
        ? mapping.measureCols.map((c) => {
            const vals = sheet.rows.map((r) => Number(r[c])).filter((v) => !isNaN(v));
            const eff = perColumnSpecs[c] ?? { lsl: specs.lsl, usl: specs.usl, target: specs.target };
            const ccap = vals.length > 1
              ? computeCapability(vals, eff.lsl, eff.usl, eff.target, specs.subgroupSize)
              : null;
            return { col: c, eff, cap: ccap, n: vals.length };
          })
        : [];

      // Track sections for TOC: { title, page }
      const tocEntries: { title: string; level: number; page: number }[] = [];

      // ===== Cover (page 1) =====
      doc.setFillColor(37, 99, 235);
      doc.rect(0, 0, pageW, 50, "F");
      doc.setTextColor(255);
      doc.setFontSize(22);
      doc.text("Rapport d'analyse statistique", 14, 22);
      doc.setFontSize(13);
      doc.text("SPC · MSA · Capabilité · Incertitude", 14, 32);
      doc.setFontSize(10);
      doc.text(`Date : ${reportDate}`, 14, 42);
      if (reportAuthor) doc.text(`Préparé par : ${reportAuthor}`, pageW / 2, 42);

      doc.setTextColor(0);
      doc.setFontSize(28);
      doc.text(specs.projectName, 14, 80);
      doc.setFontSize(11);
      doc.setTextColor(80);
      if (specs.sampleName) doc.text(`Échantillon : ${specs.sampleName}`, 14, 90);
      if (selected.documentNumber && documentNumber) {
        doc.text(`N° document : ${documentNumber}`, 14, specs.sampleName ? 98 : 90);
      }
      const metaY = specs.sampleName || (selected.documentNumber && documentNumber) ? 108 : 92;
      doc.text(`Taille sous-groupe : n = ${specs.subgroupSize} · Unité : ${specs.unit}`, 14, metaY);
      doc.text(`Source : ${filesCount > 0 ? `${filesCount} fichier(s) Excel importé(s)` : "Données de démonstration"}`, 14, metaY + 8);

      doc.setTextColor(0);
      doc.setFontSize(11);
      doc.text("Sections incluses :", 14, 130);
      const sections = [
        selected.spc && "1. Contrôle statistique du procédé (SPC)",
        selected.capability && "2. Capabilité du processus",
        selected.msa && "3. Analyse du système de mesure (MSA)",
        selected.uncertainty && "4. Incertitude de mesure",
        selected.documentNumber && documentNumber && `N° document : ${documentNumber}`,
      ].filter(Boolean) as string[];
      sections.forEach((s, i) => doc.text(`• ${s}`, 18, 140 + i * 7));
      doc.text("Annexes : tableaux complets, données brutes, paramètres", 14, 140 + sections.length * 7 + 10);

      // ===== TOC placeholder (page 2) — we'll re-render after collecting entries =====
      doc.addPage();
      const tocPageNumber = doc.internal.pages.length - 1;

      // Helper to register section page
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

      // ===== 1. SPC =====
      if (selected.spc) {
        startSection("1. Contrôle statistique du procédé (SPC)", 1);
        autoTable(doc, {
          startY: 24,
          head: [["Paramètre", "Valeur"]],
          body: [
            ["Sous-groupes", String(subgroups.length)],
            ["Taille (n)", String(spc.n)],
            ["X̄ (moyenne)", spc.xbar.toFixed(4)],
            ["R̄", spc.rbar.toFixed(4)],
            ["UCL X̄", spc.uclX.toFixed(4)],
            ["LCL X̄", spc.lclX.toFixed(4)],
            ["UCL R", spc.uclR.toFixed(4)],
            ["σ̂ (court terme)", spc.sigmaHat.toFixed(4)],
            ["Points hors contrôle", String(spc.outOfControl.length)],
            ["Règles WE déclenchées", String(spc.westernElectric.length)],
          ],
          theme: "grid",
          headStyles: { fillColor: [37, 99, 235] },
        });
        let cy = (doc as any).lastAutoTable.finalY + 6;
        const xbarImg = await captureNode(xbarChartRef.current);
        if (xbarImg) {
          doc.addImage(xbarImg, "PNG", 14, cy, pageW - 28, 70);
          cy += 74;
        }
        const rImg = await captureNode(rChartRef.current);
        if (rImg) doc.addImage(rImg, "PNG", 14, cy, pageW - 28, 60);

        // Subsection: anomalies
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
      }

      // ===== 2. Capability =====
      if (selected.capability) {
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
            ["σ court terme", cap.stdShortTerm.toFixed(4), "-"],
            ["σ long terme", cap.stdLongTerm.toFixed(4), "-"],
          ],
          theme: "striped",
          headStyles: { fillColor: [37, 99, 235] },
        });
        const histImg = await captureNode(histRef.current);
        if (histImg) {
          const cy = (doc as any).lastAutoTable.finalY + 6;
          doc.addImage(histImg, "PNG", 14, cy, pageW - 28, 80);
        }
        doc.setFontSize(10);
        doc.setTextColor(60);
        doc.text(`Interprétation : ${cap.interpretation}`, 14, pageH - 20);
        doc.setTextColor(0);

        // Per-column capability subsection
        if (perColumnCap.length > 1) {
          startSection("2.1 Capabilité par colonne de mesure", 2);
          autoTable(doc, {
            startY: 24,
            head: [["Colonne", "LSL", "Cible", "USL", "Moyenne", "σ", "Cp", "Cpk", "Ppk", "Statut"]],
            body: perColumnCap
              .filter((p) => p.cap)
              .map((p) => [
                p.col,
                String(p.eff.lsl),
                String(p.eff.target),
                String(p.eff.usl),
                p.cap!.mean.toFixed(3),
                p.cap!.stdLongTerm.toFixed(3),
                p.cap!.cp.toFixed(2),
                p.cap!.cpk.toFixed(2),
                p.cap!.ppk.toFixed(2),
                p.cap!.status,
              ]),
            theme: "grid",
            headStyles: { fillColor: [37, 99, 235] },
            styles: { fontSize: 8 },
          });
        }
      }

      // ===== 3. MSA =====
      if (selected.msa) {
        startSection("3. Analyse du système de mesure (MSA)", 1);
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
          headStyles: { fillColor: [37, 99, 235] },
        });
        autoTable(doc, {
          startY: (doc as any).lastAutoTable.finalY + 4,
          body: [
            ["Pièces", String(msa.parts)],
            ["Opérateurs", String(msa.operators)],
            ["Essais", String(msa.trials)],
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

      // ===== 4. Uncertainty =====
      if (selected.uncertainty) {
        startSection("4. Incertitude de mesure", 1);
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

      // ===== Annexes =====
      startSection("A. Annexes — Paramètres du projet", 1);
      autoTable(doc, {
        startY: 24,
        head: [["Paramètre", "Valeur"]],
        body: [
          ["Société", specs.projectName],
          ["Échantillon", specs.sampleName || "—"],
          ["Date du rapport", reportDate],
          ["Préparé par", reportAuthor || "—"],
          ...(selected.documentNumber && documentNumber ? [["N° document", documentNumber]] : []),
          ["Unité", specs.unit],
          ["LSI (auto)", String(specs.lsl)],
          ["LSS (auto)", String(specs.usl)],
          ["n (sous-groupe)", String(specs.subgroupSize)],
          ["Mappage mesures", mapping.measureCols.join(", ") || "—"],
          ["Mappage MSA — Pièce", mapping.partCol ?? "—"],
          ["Mappage MSA — Opérateur", mapping.operatorCol ?? "—"],
          ["Mappage MSA — Valeur", mapping.valueCol ?? "—"],
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
        head: [["#", ...Array.from({ length: spc.n }, (_, i) => `M${i + 1}`), "X̄", "R"]],
        body: subgroups.slice(0, 25).map((g, i) => [
          String(i + 1),
          ...g.map((v) => v.toFixed(3)),
          spc.subgroupMeans[i].toFixed(3),
          spc.subgroupRanges[i].toFixed(3),
        ]),
        theme: "striped",
        styles: { fontSize: 8 },
        headStyles: { fillColor: [100, 100, 100] },
      });
      if (subgroups.length > 25) {
        doc.setFontSize(9);
        doc.setTextColor(120);
        doc.text(`... ${subgroups.length - 25} sous-groupes supplémentaires non affichés`, 14, (doc as any).lastAutoTable.finalY + 6);
        doc.setTextColor(0);
      }

      // ===== Re-render TOC on page 2 =====
      doc.setPage(tocPageNumber);
      doc.setFontSize(20);
      doc.setTextColor(37, 99, 235);
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
        const text = entry.title;
        doc.text(text, titleX, ty);
        // dotted leaders
        const dotsStart = titleX + doc.getTextWidth(text) + 2;
        const dotsEnd = pageX - 6;
        if (dotsEnd > dotsStart) {
          doc.setTextColor(180);
          let dx = dotsStart;
          while (dx < dotsEnd) {
            doc.text(".", dx, ty);
            dx += 2;
          }
          doc.setTextColor(0);
        }
        doc.text(String(entry.page), pageX, ty);

        // Clickable link to the page
        const linkY = ty - 4;
        const linkH = 6;
        const linkW = pageW - titleX - 10;
        (doc as any).link(titleX, linkY, linkW, linkH, { pageNumber: entry.page });

        ty += entry.level === 1 ? 8 : 6.5;
        if (ty > pageH - 20) {
          doc.addPage();
          doc.setPage(doc.internal.pages.length - 1);
          ty = 22;
        }
      });
      doc.setFont("helvetica", "normal");

      // Page numbers footer on all pages
      const total = doc.internal.pages.length - 1;
      for (let p = 1; p <= total; p++) {
        doc.setPage(p);
        doc.setFontSize(8);
        doc.setTextColor(150);
        const footerParts = [specs.projectName, specs.sampleName, selected.documentNumber && documentNumber ? documentNumber : null].filter(Boolean);
        doc.text(`${footerParts.join(" · ")} · Page ${p} / ${total}`, pageW / 2, pageH - 6, { align: "center" });
        doc.setTextColor(0);
      }

      doc.save(`rapport_${specs.projectName.replace(/\s+/g, "_")}_${reportDate}.pdf`);
      toast.success("Rapport PDF généré avec table des matières cliquable");
      notificationActions.add({ type: "success", title: "Rapport PDF généré", message: "Table des matières cliquable incluse." });
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

      sheets.push({
        name: "Synthèse",
        rows: [
          ["Rapport SPC / MSA / Capabilité"],
          ["Société", specs.projectName],
          ["Échantillon", specs.sampleName || "—"],
          ["Date du rapport", reportDate],
          ["Préparé par", reportAuthor || "—"],
          ...(selected.documentNumber && documentNumber ? [["N° document", documentNumber]] : []),
          ["Unité", specs.unit],
          ["LSI (auto)", specs.lsl],
          ["LSS (auto)", specs.usl],
          ["Taille sous-groupe", specs.subgroupSize],
          [],
          ["Sections incluses"],
          ...Object.entries(selected).filter(([, v]) => v).map(([k]) => [k]),
        ],
      });

      if (selected.spc) {
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
            ["X̄ global", spc.xbar],
            ["R̄", spc.rbar],
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

      if (selected.capability) {
        sheets.push({
          name: "Capabilité",
          rows: [
            ["Indice", "Valeur"],
            ["Cp", cap.cp],
            ["Cpk", cap.cpk],
            ["Pp", cap.pp],
            ["Ppk", cap.ppk],
            ["Cpm", cap.cpm ?? ""],
            ["Moyenne", cap.mean],
            ["Sigma court terme", cap.stdShortTerm],
            ["Sigma long terme", cap.stdLongTerm],
            ["LSL", cap.lsl],
            ["USL", cap.usl],
            ["Target", cap.target ?? ""],
            ["Statut", cap.interpretation],
            [],
            ["Histogramme"],
            ["Bin centre", "Effectif", "Densité normale"],
            ...hist.map((h) => [h.bin, h.count, h.pdf]),
          ],
        });
      }

      if (selected.msa) {
        sheets.push({
          name: "MSA",
          rows: [
            ["Source", "Écart-type", "% Contribution", "% Study Var"],
            ["EV", msa.ev, msa.evContrib, msa.evPct],
            ["AV", msa.av, msa.avContrib, msa.avPct],
            ["GRR", msa.grr, msa.grrContrib, msa.grrPct],
            ["PV", msa.pv, msa.pvContrib, msa.pvPct],
            ["TV", msa.tv, 100, 100],
            [],
            ["Pièces", msa.parts],
            ["Opérateurs", msa.operators],
            ["Essais", msa.trials],
            ["ndc", msa.ndc],
            ["%GRR", msa.grrPct],
            ["Statut", msa.interpretation],
          ],
        });
      }

      if (selected.uncertainty) {
        sheets.push({
          name: "Incertitude",
          rows: [
            ["Composante", "Valeur"],
            ["N", typeA.n],
            ["Moyenne", typeA.mean],
            ["s", typeA.s],
            ["uA", uncertainty.uA],
            ["uB", uncertainty.uB],
            ["uC", uncertainty.uC],
            ["k", uncertainty.k],
            ["U (élargie)", uncertainty.U],
            ["Résultat", `${typeA.mean.toFixed(4)} ± ${uncertainty.U.toFixed(5)} ${specs.unit}`],
          ],
        });
      }

      downloadXLSX(`rapport_${specs.projectName.replace(/\s+/g, "_")}_${reportDate}.xlsx`, sheets);
      toast.success("Export Excel multi-feuilles généré");
      notificationActions.add({ type: "success", title: "Export Excel généré", message: "Fichier multi-feuilles prêt." });
    } catch (err: any) {
      toast.error("Erreur Excel", { description: err.message });
      notificationActions.add({ type: "error", title: "Erreur Excel", message: err.message });
    } finally {
      setBusy(null);
    }
  };

  const sectionDefs: { key: ReportSection; label: string; desc: string }[] = [
    { key: "spc", label: "SPC", desc: "Cartes de contrôle X̄-R, limites, règles Western Electric" },
    { key: "capability", label: "Capabilité", desc: "Cp, Cpk, Pp, Ppk, Cpm, histogramme + courbe normale" },
    { key: "msa", label: "MSA (R&R)", desc: "Répétabilité, reproductibilité, %GRR, ndc" },
    { key: "uncertainty", label: "Incertitude", desc: "Type A + Type B, combinée, élargie (U)" },
    { key: "documentNumber", label: "Numéro de document", desc: "Inclure le numéro de document dans l'en-tête du rapport" },
  ];

  const anySelected = Object.values(selected).some(Boolean);

  return (
    <AppLayout title="Rapports" subtitle={`${specs.projectName}${specs.sampleName ? ` · ${specs.sampleName}` : ""} · Génération PDF & Excel multi-feuilles`}>
      <SectionCard title="Métadonnées du rapport" className="mb-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label className="text-xs">Date du rapport</Label>
            <Input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Préparé par</Label>
            <Input
              value={reportAuthor}
              onChange={(e) => setReportAuthor(e.target.value)}
              placeholder="Nom de l'auteur"
            />
          </div>
          <div>
            <Label className="text-xs">Numéro de document</Label>
            <Input
              value={documentNumber}
              onChange={(e) => setDocumentNumber(e.target.value)}
              placeholder="Ex : QC-2024-001"
            />
          </div>
        </div>
      </SectionCard>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">
        <SectionCard title="1. Sélection des sections" className="lg:col-span-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {sectionDefs.map((s) => (
              <label
                key={s.key}
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  selected[s.key] ? "border-primary bg-accent/30" : "border-border hover:bg-accent/10"
                }`}
              >
                <Checkbox checked={selected[s.key]} onCheckedChange={() => toggle(s.key)} className="mt-0.5" />
                <div className="flex-1">
                  <div className="font-semibold text-sm">{s.label}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{s.desc}</div>
                </div>
              </label>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="2. Génération">
          <div className="space-y-3">
            <Button
              onClick={exportPdf}
              disabled={!anySelected || busy !== null}
              className="w-full gap-2"
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

      {/* Live preview / capture canvas */}
      <SectionCard title="3. Aperçu des graphiques inclus">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {selected.spc && (
            <>
              <div ref={xbarChartRef} className="bg-card p-3 rounded-lg border border-border">
                <div className="text-xs font-medium text-muted-foreground mb-1">Carte X̄</div>
                <ControlChart values={spc.subgroupMeans} ucl={spc.uclX} cl={spc.clX} lcl={spc.lclX} outOfControl={spc.outOfControl} height={200} />
              </div>
              <div ref={rChartRef} className="bg-card p-3 rounded-lg border border-border">
                <div className="text-xs font-medium text-muted-foreground mb-1">Carte R</div>
                <ControlChart values={spc.subgroupRanges} ucl={spc.uclR} cl={spc.clR} lcl={spc.lclR} color="hsl(var(--info))" height={200} />
              </div>
            </>
          )}
          {selected.capability && (
            <div ref={histRef} className="bg-card p-3 rounded-lg border border-border lg:col-span-2">
              <div className="text-xs font-medium text-muted-foreground mb-1">Histogramme + courbe normale</div>
              <div className="h-64">
                <ResponsiveContainer>
                  <ComposedChart data={hist} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 11 }} />
                    {Number.isFinite(specs.lsl) && <ReferenceLine x={specs.lsl.toFixed(2)} stroke="hsl(var(--destructive))" strokeDasharray="4 4" label={{ value: `LSI`, fill: "hsl(var(--destructive))", fontSize: 10 }} />}
                    {Number.isFinite(specs.usl) && <ReferenceLine x={specs.usl.toFixed(2)} stroke="hsl(var(--destructive))" strokeDasharray="4 4" label={{ value: `LSS`, fill: "hsl(var(--destructive))", fontSize: 10 }} />}
                    {Number.isFinite(specs.target) && <ReferenceLine x={specs.target.toFixed(2)} stroke="hsl(var(--success))" strokeDasharray="4 4" label={{ value: `X̄`, fill: "hsl(var(--success))", fontSize: 10 }} />}
                    <Bar dataKey="count" fill="hsl(var(--primary))" opacity={0.7} radius={[2, 2, 0, 0]} />
                    <Line type="monotone" dataKey="pdf" stroke="hsl(var(--purple))" strokeWidth={2.5} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
          {selected.msa && (
            <div ref={msaPieRef} className="bg-card p-3 rounded-lg border border-border lg:col-span-2">
              <div className="text-xs font-medium text-muted-foreground mb-1">Décomposition de la variation (MSA)</div>
              <div className="h-64">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={msaPie} dataKey="value" cx="50%" cy="50%" outerRadius={80} innerRadius={40}>
                      {msaPie.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Pie>
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
          {selected.uncertainty && (
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
