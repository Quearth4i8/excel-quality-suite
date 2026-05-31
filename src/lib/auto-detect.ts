// Auto-detection of Excel file structure for quality data types
// Returns a suggested ColumnMapping based purely on the imported data — no hardcoding.
import type { ParsedSheet } from "@/lib/excel";
import type { ColumnMapping } from "@/store/app-store";

export type DetectedKind = "dashboard" | "spc-card" | "msa-rr" | "capability" | "uncertainty" | "msa" | "spc" | "unknown";

export interface DetectionResult {
  kind: DetectedKind;
  mapping: Partial<ColumnMapping>;
  suggestedSubgroupSize: number | null;
  reason: string;
  confidence: number; // 0-1, how confident we are in this detection
}

const normalizeNumericValue = (value: any): string => {
  if (value == null) return "";
  const str = String(value).trim();
  return str
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, "")
    .replace(/,/g, ".");
};

const isNumericColumn = (sheet: ParsedSheet, col: string, threshold = 0.7): boolean => {
  const sample = sheet.rows.slice(0, 100);
  if (sample.length === 0) return false;
  const ok = sample.filter((r) => {
    const value = r[col];
    if (value == null || value === "") return false;
    const normalized = normalizeNumericValue(value);
    return normalized !== "" && !Number.isNaN(Number(normalized));
  }).length;
  return ok / sample.length >= threshold;
};

const matchHeader = (headers: string[], patterns: RegExp[]): string | null => {
  for (const p of patterns) {
    const found = headers.find((h) => p.test(String(h).toLowerCase().trim()));
    if (found) return found;
  }
  return null;
};

// Helper functions for different data type detection
function hasDashboardIndicators(headerStr: string, headers: string[], sheet: ParsedSheet): boolean {
  const dashboardKeywords = [
    'kpi', 'metric', 'indicateur', 'dashboard', 'tableau de bord',
    'target', 'objectif', 'goal', 'cible',
    'performance', 'efficiency', 'yield', 'rendement',
    'defect', 'defaut', 'scrap', 'rebut',
    'cpk', 'ppk', 'sigma', 'capability', 'capabilité'
  ];

  const hasKeywords = dashboardKeywords.some(kw => headerStr.includes(kw));
  const hasNumericColumns = headers.some(h => isNumericColumn(sheet, h));

  return hasKeywords && hasNumericColumns;
}

function hasSPCChartIndicators(headerStr: string, headers: string[], sheet: ParsedSheet): boolean {
  // spc-card = pre-computed control chart WITH UCL/LCL columns.
  // Raw measurement data (Mesure1..Mn, M1..Mn) should fall through to spc detection.
  const hasUCL = headerStr.includes('ucl');
  const hasLCL = headerStr.includes('lcl');
  return hasUCL && hasLCL;
}

function detectMSA_RR(headers: string[], sheet: ParsedSheet): DetectionResult | null {
  // Look for Gage R&R specific patterns, with broader French/English synonyms and variations
  const partCol = matchHeader(headers, [
    /^part[eè]?[s]?\b/i,
    /^pi[eè]ce[s]?\b/i,
    /^échantillon[s]?\b/i,
    /^sample[s]?\b/i,
    /^item[s]?\b/i,
    /^lot[s]?\b/i,
    /^pi[eè]ce[s]?\s*n[°º]?/i,
    /^piece[s]?\b/i,
  ]);
  const operatorCol = matchHeader(headers, [
    /^operator[s]?\b/i,
    /^op[eé]rateur[s]?\b/i,
    /^op\b/i,
    /^appraiser[s]?\b/i,
    /^judge[s]?\b/i,
    /^technician[s]?\b/i,
    /^mesureur[s]?\b/i,
    /^inspecteur[s]?\b/i,
    /^personnel\b/i,
  ]);
  const trialCol = matchHeader(headers, [
    /^trial\b/i,
    /^essai\b/i,
    /^run\b/i,
    /^replicate\b/i,
    /^repet/i,
    /^pass\b/i,
    /^passage\b/i,
    /^tour\b/i,
    /^serie\b/i,
  ]);
  const valueCol = matchHeader(headers, [
    /^measurement[s]?\b/i,
    /^mesure[s]?\b/i,
    /^valeur[s]?\b/i,
    /^value[s]?\b/i,
    /^reading[s]?\b/i,
    /^résultat[s]?\b/i,
    /^resultat[s]?\b/i,
    /^result[s]?\b/i,
    /^observation[s]?\b/i,
    /^obs\b/i,
  ]);

  const hasTwoIdentifiers = [partCol, operatorCol, trialCol].filter(Boolean).length >= 2;
  if (hasTwoIdentifiers) {
    const numericCols = headers.filter((h) => isNumericColumn(sheet, h) && h !== partCol && h !== operatorCol && h !== trialCol);
    const finalValueCol = valueCol || numericCols[0];

    if (finalValueCol) {
      return {
        kind: "msa-rr",
        mapping: {
          partCol,
          operatorCol,
          trialCol,
          valueCol: finalValueCol,
          measureCols: [finalValueCol],
        },
        suggestedSubgroupSize: null,
        reason: "Étude MSA R&R détectée (Pièce/Opérateur/Essai).",
        confidence: 0.95,
      };
    }
  }

  return null;
}

function hasUncertaintyIndicators(headerStr: string, headers: string[], sheet: ParsedSheet): boolean {
  const uncertaintyKeywords = [
    'uncertainty', 'incertitude', 'error', 'erreur',
    'standard deviation', 'écart type', 'sigma',
    'confidence', 'confiance', 'interval',
    'precision', 'précision', 'accuracy', 'exactitude',
    'repeatability', 'répétabilité', 'reproducibility', 'reproductibilité'
  ];

  const hasUncertaintyTerms = uncertaintyKeywords.some(kw => headerStr.includes(kw));
  const hasNumericColumns = headers.filter(h => isNumericColumn(sheet, h)).length >= 2;

  return hasUncertaintyTerms && hasNumericColumns;
}

function hasCapabilityIndicators(headerStr: string, headers: string[], sheet: ParsedSheet): boolean {
  const capabilityKeywords = [
    'capability', 'capabilité', 'cp', 'cpk', 'pp', 'ppk',
    'specification', 'spécification', 'tolerance', 'tolérance',
    'lsl', 'usl', 'target', 'cible',
    'process capability', 'capabilité processus'
  ];

  const hasCapabilityTerms = capabilityKeywords.some(kw => headerStr.includes(kw));
  const hasSingleNumericColumn = headers.filter(h => isNumericColumn(sheet, h)).length === 1;

  return hasCapabilityTerms || (hasSingleNumericColumn && sheet.rows.length > 20);
}

export function detectSheet(sheet: ParsedSheet): DetectionResult {
  const headers = sheet.headers.filter((h) => h && !h.startsWith("__"));
  const headerStr = headers.join(" ").toLowerCase();

  const debugInfo = {
    sheetName: sheet.name,
    headers,
    headerStr,
  };

  // 1. Dashboard detection: Look for KPI/summary metrics
  if (hasDashboardIndicators(headerStr, headers, sheet)) {
    const result: DetectionResult = {
      kind: "dashboard",
      mapping: {},
      suggestedSubgroupSize: null,
      reason: "Tableau de bord détecté (métriques et KPIs).",
      confidence: 0.9
    };
    return result;
  }

  // 2. SPC Card detection: Control chart data with UCL/LCL/Mean/etc.
  if (hasSPCChartIndicators(headerStr, headers, sheet)) {
    const result: DetectionResult = {
      kind: "spc-card",
      mapping: {},
      suggestedSubgroupSize: null,
      reason: "Carte de contrôle SPC détectée (UCL/LCL/Moyenne).",
      confidence: 0.95
    };
    return result;
  }

  // 3. MSA R&R detection: Gage R&R study format
  const msaRRResult = detectMSA_RR(headers, sheet);
  if (msaRRResult) {
    return msaRRResult;
  }

  // 4. Uncertainty detection: Measurement uncertainty data
  if (hasUncertaintyIndicators(headerStr, headers, sheet)) {
    return {
      kind: "uncertainty" as DetectedKind,
      mapping: {},
      suggestedSubgroupSize: null,
      reason: "Données d'incertitude détectées.",
      confidence: 0.85
    };
  }

  // 5. Capability detection: Process capability data
  if (hasCapabilityIndicators(headerStr, headers, sheet)) {
    return {
      kind: "capability" as DetectedKind,
      mapping: {},
      suggestedSubgroupSize: null,
      reason: "Données de capabilité détectées.",
      confidence: 0.8
    };
  }

  // 6. MSA detection: requires Part + Operator + a numeric value column
  const partCol = matchHeader(headers, [/^part[eè]?[s]?\b/i, /^pi[eè]ce[s]?\b/i, /^échantillon[s]?\b/i, /^sample[s]?\b/i]);
  const operatorCol = matchHeader(headers, [/^operator[s]?\b/i, /^op[eé]rateur[s]?\b/i, /^op\b/i, /^appraiser[s]?\b/i]);
  const trialCol = matchHeader(headers, [/^trial[s]?\b/i, /^essai[s]?\b/i, /^repet/i, /^run[s]?\b/i]);
  const valueCol = matchHeader(headers, [
    /^measurement[s]?\b/i,
    /^mesure[s]?\b/i,
    /^valeur[s]?\b/i,
    /^value[s]?\b/i,
    /^reading[s]?\b/i,
    /^résultat[s]?\b/i,
    /^resultat[s]?\b/i,
    /^result[s]?\b/i,
  ]);

  if (partCol && operatorCol && (valueCol || headers.some((h) => isNumericColumn(sheet, h)))) {
    const finalValueCol =
      valueCol ?? headers.find((h) => h !== partCol && h !== operatorCol && h !== trialCol && isNumericColumn(sheet, h)) ?? null;
    if (finalValueCol) {
      const result: DetectionResult = {
        kind: "msa",
        mapping: {
          partCol,
          operatorCol,
          trialCol,
          valueCol: finalValueCol,
          measureCols: [finalValueCol],
        },
        suggestedSubgroupSize: null,
        reason: `Format MSA détecté (Pièce/Opérateur/Mesure).`,
        confidence: 0.9
      };
      return result;
    }
  }

  // 7. SPC detection: numeric measure columns (M1..Mn, Mesure1.., or just numeric series)
  const measureCols = headers.filter((h) => {
    if (!isNumericColumn(sheet, h)) return false;
    // Exclude obvious index/id columns
    if (/^(nb|n°|num|index|id|sub|sous.?groupe|sample)$/i.test(h)) return false;
    return true;
  });

  if (measureCols.length >= 2) {
    const result: DetectionResult = {
      kind: "spc",
      mapping: {
        measureCols,
        partCol: null,
        operatorCol: null,
        trialCol: null,
        valueCol: null,
      },
      suggestedSubgroupSize: measureCols.length,
      reason: `Format SPC/Capabilité détecté (${measureCols.length} colonnes de mesures par sous-groupe).`,
      confidence: 0.85
    };
    return result;
  }

  if (measureCols.length === 1) {
    const result: DetectionResult = {
      kind: "spc",
      mapping: {
        measureCols,
        valueCol: measureCols[0],
        partCol: null,
        operatorCol: null,
        trialCol: null,
      },
      suggestedSubgroupSize: 5,
      reason: `Une seule colonne numérique détectée — sera scindée en sous-groupes.`,
      confidence: 0.7
    };
    return result;
  }

  const unknownResult: DetectionResult = {
    kind: "unknown",
    mapping: {},
    suggestedSubgroupSize: null,
    reason: "Structure non reconnue — utilisez l'assistant de mappage.",
    confidence: 0
  };
  return unknownResult;
}

// Detect across all sheets of all files: prefer the most informative one.
// If we find both kinds (e.g. MSA + SPC), merge them into a single mapping.
export function detectMulti(sheets: { fileIdx: number; sheetIdx: number; sheet: ParsedSheet }[]): {
  combined: Partial<ColumnMapping>;
  perSheet: { fileIdx: number; sheetIdx: number; result: DetectionResult }[];
  suggestedSubgroupSize: number | null;
} {
  const perSheet = sheets.map((s) => ({ fileIdx: s.fileIdx, sheetIdx: s.sheetIdx, result: detectSheet(s.sheet) }));
  const msa = perSheet.find((p) => p.result.kind === "msa");
  const spc = perSheet.find((p) => p.result.kind === "spc");

  const combined: Partial<ColumnMapping> = {};
  if (spc) Object.assign(combined, spc.result.mapping);
  if (msa) {
    // MSA fields complement SPC measure fields
    combined.partCol = msa.result.mapping.partCol ?? combined.partCol ?? null;
    combined.operatorCol = msa.result.mapping.operatorCol ?? combined.operatorCol ?? null;
    combined.trialCol = msa.result.mapping.trialCol ?? combined.trialCol ?? null;
    combined.valueCol = msa.result.mapping.valueCol ?? combined.valueCol ?? null;
    if (!combined.measureCols || combined.measureCols.length === 0) {
      combined.measureCols = msa.result.mapping.measureCols ?? [];
    }
  }

  return {
    combined,
    perSheet,
    suggestedSubgroupSize: spc?.result.suggestedSubgroupSize ?? null,
  };
}
