import type { ParsedFile, ParsedSheet } from "@/lib/excel";
import { useSyncExternalStore } from "react";
import { detectSheet, type DetectedKind } from "@/lib/auto-detect";
import { supabase } from "@/lib/supabase";

type Listener = () => void;

class SimpleStore<T> {
  private state: T;
  private listeners = new Set<Listener>();
  constructor(initial: T) {
    this.state = initial;
  }
  get = () => this.state;
  set = (partial: Partial<T> | ((s: T) => Partial<T>)) => {
    const p = typeof partial === "function" ? (partial as any)(this.state) : partial;
    this.state = { ...this.state, ...p };
    this.listeners.forEach((l) => l());
  };
  subscribe = (l: Listener) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
}

// ===== Specs (per project, applied everywhere) =====
export interface ProjectSpecs {
  lsl: number;
  usl: number;
  target: number;
  subgroupSize: number;
  unit: string;
  projectName: string;
  sampleName: string;
}

// ===== Per-column specs (override global) =====
export interface ColumnSpec {
  lsl: number;
  usl: number;
  target: number;
}
export type PerColumnSpecs = Record<string, ColumnSpec>;

// ===== Column mapping (validated by wizard) =====
export interface ColumnMapping {
  measureCols: string[];
  partCol: string | null;
  operatorCol: string | null;
  trialCol: string | null;
  valueCol: string | null;
  lslCol: string | null;
  uslCol: string | null;
  validated: boolean;
}

export interface AppState {
  files: ParsedFile[];
  activeFileIndex: number | null;
  activeSheetIndex: number | null;
  specs: ProjectSpecs;
  perColumnSpecs: PerColumnSpecs;
  // Per-file specs (keyed by file name)
  fileSpecs: Record<string, ProjectSpecs>;
  filePerColumnSpecs: Record<string, PerColumnSpecs>;
  mapping: ColumnMapping;
  mergedSheet: ParsedSheet | null;
}

export const DEFAULT_SPECS: ProjectSpecs = {
  lsl: 9.5,
  usl: 10.5,
  target: 10,
  subgroupSize: 5,
  unit: "mm",
  projectName: "Société par défaut",
  sampleName: "",
};

const DEFAULT_MAPPING: ColumnMapping = {
  measureCols: [],
  partCol: null,
  operatorCol: null,
  trialCol: null,
  valueCol: null,
  lslCol: null,
  uslCol: null,
  validated: false,
};

const STORAGE_KEY = "spc-app-state-v3";

const DB_TABLE = "app_state";

let currentUserId: string | null = null;
let persistTimer: number | null = null;

function scheduleDbPersist() {
  if (!currentUserId) return;
  if (persistTimer !== null) window.clearTimeout(persistTimer);
  persistTimer = window.setTimeout(() => {
    persistTimer = null;
    void persistToDb();
  }, 800);
}

async function persistToDb() {
  if (!currentUserId) return;
  const s = store.get();
  const payload = {
    files: s.files,
    activeFileIndex: s.activeFileIndex,
    activeSheetIndex: s.activeSheetIndex,
    specs: s.specs,
    mapping: s.mapping,
    perColumnSpecs: s.perColumnSpecs,
    fileSpecs: s.fileSpecs,
    filePerColumnSpecs: s.filePerColumnSpecs,
  };

  const { error } = await supabase
    .from(DB_TABLE)
    .upsert({ user_id: currentUserId, state: payload, updated_at: new Date().toISOString() }, { onConflict: "user_id" });

  if (error) {
    console.error("[app-store] persistToDb error", error);
  }
}

async function loadFromDb(userId: string): Promise<Partial<AppState> | null> {
  const { data, error } = await supabase
    .from(DB_TABLE)
    .select("state")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("[app-store] loadFromDb error", error);
    return null;
  }

  const state = (data as any)?.state as Partial<AppState> | undefined;
  if (!state) return null;
  return state;
}

function loadPersisted(): Partial<AppState> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return {
      specs: parsed.specs ?? DEFAULT_SPECS,
      mapping: parsed.mapping ?? DEFAULT_MAPPING,
      perColumnSpecs: parsed.perColumnSpecs ?? {},
      fileSpecs: parsed.fileSpecs ?? {},
      filePerColumnSpecs: parsed.filePerColumnSpecs ?? {},
    };
  } catch {
    return {};
  }
}

const persisted = loadPersisted();

const store = new SimpleStore<AppState>({
  files: [],
  activeFileIndex: null,
  activeSheetIndex: null,
  specs: { ...DEFAULT_SPECS, ...(persisted.specs || {}) },
  perColumnSpecs: persisted.perColumnSpecs || {},
  fileSpecs: persisted.fileSpecs || {},
  filePerColumnSpecs: persisted.filePerColumnSpecs || {},
  mapping: { ...DEFAULT_MAPPING, ...(persisted.mapping || {}) },
  mergedSheet: null,
});

function persist() {
  const s = store.get();
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        specs: s.specs,
        mapping: s.mapping,
        perColumnSpecs: s.perColumnSpecs,
        fileSpecs: s.fileSpecs,
        filePerColumnSpecs: s.filePerColumnSpecs,
      })
    );
  } catch {}

  scheduleDbPersist();
}

// Sync global specs/perColumnSpecs from a specific file's stored specs
function syncFromFileSpecs(s: AppState, fileName: string): Partial<AppState> {
  const updates: Partial<AppState> = {};
  if (s.fileSpecs[fileName]) {
    updates.specs = { ...DEFAULT_SPECS, ...s.fileSpecs[fileName] };
  }
  if (s.filePerColumnSpecs[fileName]) {
    updates.perColumnSpecs = s.filePerColumnSpecs[fileName];
  }
  return updates;
}

export function useAppStore<S>(selector: (s: AppState) => S): S {
  return useSyncExternalStore(store.subscribe, () => selector(store.get()), () => selector(store.get()));
}

function sheetLabel(fileIdx: number, sheetIdx: number, files: ParsedFile[]) {
  const f = files[fileIdx];
  return `${f?.name ?? "?"} / ${f?.sheets[sheetIdx]?.name ?? "?"}`;
}

// ===== Merge utility =====
export function mergeFiles(files: ParsedFile[]): ParsedSheet | null {
  if (files.length === 0) return null;

  const allSheets: { sheet: ParsedSheet; label: string }[] = [];
  files.forEach((f, fi) =>
    f.sheets.forEach((s, si) => {
      allSheets.push({ sheet: s, label: sheetLabel(fi, si, files) });
    })
  );
  if (allSheets.length === 0) return null;
  if (allSheets.length === 1) return allSheets[0].sheet;

  const headerSet = new Set<string>();
  allSheets.forEach(({ sheet }) => sheet.headers.forEach((h) => headerSet.add(h)));
  const headers = Array.from(headerSet);

  const rows: Record<string, any>[] = [];
  allSheets.forEach(({ sheet, label }) => {
    sheet.rows.forEach((r) => {
      const row: Record<string, any> = { __source: label };
      headers.forEach((h) => (row[h] = r[h] ?? null));
      rows.push(row);
    });
  });

  const finalHeaders = ["__source", ...headers];
  const matrix: any[][] = [finalHeaders, ...rows.map((r) => finalHeaders.map((h) => r[h]))];
  return { name: "Fusion globale", headers: finalHeaders, rows, matrix };
}

export const appActions = {
  setCurrentUser: (userId: string | null) => {
    currentUserId = userId;
  },
  loadPersistedForUser: async (userId: string) => {
    currentUserId = userId;
    const dbState = await loadFromDb(userId);
    if (!dbState) return;

    const files = (dbState.files ?? []) as ParsedFile[];
    const merged = mergeFiles(files);
    const activeFileIndex = (dbState.activeFileIndex ?? (files.length ? 0 : null)) as number | null;
    const activeFileName = activeFileIndex !== null ? files[activeFileIndex]?.name ?? null : null;
    const fileSpecs = (dbState.fileSpecs ?? store.get().fileSpecs) as Record<string, ProjectSpecs>;
    const filePerColumnSpecs = (dbState.filePerColumnSpecs ?? store.get().filePerColumnSpecs) as Record<string, PerColumnSpecs>;

    store.set({
      files,
      activeFileIndex,
      activeSheetIndex: (dbState.activeSheetIndex ?? (files.length ? 0 : null)) as number | null,
      specs: activeFileName && fileSpecs[activeFileName]
        ? { ...DEFAULT_SPECS, ...fileSpecs[activeFileName] }
        : ({ ...DEFAULT_SPECS, ...(dbState.specs ?? store.get().specs) } as ProjectSpecs),
      mapping: (dbState.mapping ?? store.get().mapping) as ColumnMapping,
      perColumnSpecs: activeFileName && filePerColumnSpecs[activeFileName]
        ? filePerColumnSpecs[activeFileName]
        : ((dbState.perColumnSpecs ?? store.get().perColumnSpecs) as PerColumnSpecs),
      fileSpecs,
      filePerColumnSpecs,
      mergedSheet: merged,
    });
  },
  addFile: (f: ParsedFile) => {
    const s = store.get();
    const files = [...s.files, f];
    const merged = mergeFiles(files);

    // Auto-detect mapping across ALL sheets of all files.
    const currentMapping = s.mapping;
    const detections: { fileIdx: number; sheetIdx: number; kind: DetectedKind; map: any; confidence: number }[] = [];
    files.forEach((file, fi) =>
      file.sheets.forEach((sh, si) => {
        const d = detectSheet(sh);
        detections.push({ fileIdx: fi, sheetIdx: si, kind: d.kind, map: d.mapping, confidence: d.confidence });
      })
    );

    const getBestDetection = (kind: DetectedKind) => {
      const matches = detections.filter(d => d.kind === kind);
      return matches.sort((a, b) => b.confidence - a.confidence)[0] || null;
    };

    const dashboardDet = getBestDetection("dashboard");
    const spcCardDet = getBestDetection("spc-card");
    const msaRRDet = getBestDetection("msa-rr");
    const capabilityDet = getBestDetection("capability");
    const uncertaintyDet = getBestDetection("uncertainty");
    const spcDet = getBestDetection("spc");
    const msaDet = getBestDetection("msa");

    const allHeaders = new Set<string>();
    files.forEach((file) => file.sheets.forEach((sh) => sh.headers.forEach((h) => allHeaders.add(h))));
    const stillValid = (col: string | null | undefined) => !!col && allHeaders.has(col);
    const measuresStillValid =
      currentMapping.measureCols.length > 0 && currentMapping.measureCols.every((c) => allHeaders.has(c));

    const detectedMeasures = spcDet?.map.measureCols ?? msaDet?.map.measureCols ?? msaRRDet?.map.measureCols ?? [];
    const detectedPart = msaDet?.map.partCol ?? msaRRDet?.map.partCol ?? null;
    const detectedOperator = msaDet?.map.operatorCol ?? msaRRDet?.map.operatorCol ?? null;
    const detectedTrial = msaDet?.map.trialCol ?? msaRRDet?.map.trialCol ?? null;
    const detectedValue = msaDet?.map.valueCol ?? msaRRDet?.map.valueCol ?? null;

    const nextMeasureCols = spcDet
      ? spcDet.map.measureCols
      : measuresStillValid
      ? currentMapping.measureCols
      : detectedMeasures;

    const nextMapping: ColumnMapping = {
      ...currentMapping,
      measureCols: nextMeasureCols,
      partCol: stillValid(currentMapping.partCol) ? currentMapping.partCol : detectedPart,
      operatorCol: stillValid(currentMapping.operatorCol) ? currentMapping.operatorCol : detectedOperator,
      trialCol: stillValid(currentMapping.trialCol) ? currentMapping.trialCol : detectedTrial,
      valueCol: stillValid(currentMapping.valueCol) ? currentMapping.valueCol : detectedValue,
      validated: true,
    };

    (appActions as any)._lastDetection = {
      dashboard: dashboardDet ? { fileIdx: dashboardDet.fileIdx, sheetIdx: dashboardDet.sheetIdx } : null,
      spcCard: spcCardDet ? { fileIdx: spcCardDet.fileIdx, sheetIdx: spcCardDet.sheetIdx } : null,
      msaRR: msaRRDet ? { fileIdx: msaRRDet.fileIdx, sheetIdx: msaRRDet.sheetIdx, part: detectedPart, operator: detectedOperator } : null,
      capability: capabilityDet ? { fileIdx: capabilityDet.fileIdx, sheetIdx: capabilityDet.sheetIdx } : null,
      uncertainty: uncertaintyDet ? { fileIdx: uncertaintyDet.fileIdx, sheetIdx: uncertaintyDet.sheetIdx } : null,
      spc: spcDet ? { fileIdx: spcDet.fileIdx, sheetIdx: spcDet.sheetIdx, measures: detectedMeasures.length } : null,
      msa: msaDet ? { fileIdx: msaDet.fileIdx, sheetIdx: msaDet.sheetIdx, part: detectedPart, operator: detectedOperator } : null,
      unknown: detections.every((d) => d.kind === "unknown"),
    };

    const preferredOrder = [msaRRDet, spcCardDet, dashboardDet, capabilityDet, uncertaintyDet, spcDet, msaDet];
    const preferred = preferredOrder.find(d => d !== null) ?? { fileIdx: files.length - 1, sheetIdx: 0 };

    const newActiveFileName = files[preferred.fileIdx]?.name ?? null;
    const specsSync = newActiveFileName && s.fileSpecs[newActiveFileName]
      ? { specs: { ...DEFAULT_SPECS, ...s.fileSpecs[newActiveFileName] } }
      : {};
    const perColSync = newActiveFileName && s.filePerColumnSpecs[newActiveFileName]
      ? { perColumnSpecs: s.filePerColumnSpecs[newActiveFileName] }
      : {};

    store.set({
      files,
      activeFileIndex: preferred.fileIdx,
      activeSheetIndex: preferred.sheetIdx,
      mergedSheet: merged,
      mapping: nextMapping,
      ...specsSync,
      ...perColSync,
    });
    persist();
  },
  removeFile: (idx: number) => {
    const s = store.get();
    const files = s.files.filter((_, i) => i !== idx);
    const merged = mergeFiles(files);
    const newActiveFileName = files.length ? files[0]?.name ?? null : null;
    store.set({
      files,
      activeFileIndex: files.length ? 0 : null,
      activeSheetIndex: files.length ? 0 : null,
      mergedSheet: merged,
      ...(newActiveFileName && s.fileSpecs[newActiveFileName]
        ? { specs: { ...DEFAULT_SPECS, ...s.fileSpecs[newActiveFileName] } }
        : {}),
      ...(newActiveFileName && s.filePerColumnSpecs[newActiveFileName]
        ? { perColumnSpecs: s.filePerColumnSpecs[newActiveFileName] }
        : {}),
    });
    persist();
  },
  setActiveFile: (idx: number) => {
    const s = store.get();
    const fileName = s.files[idx]?.name ?? null;
    store.set({
      activeFileIndex: idx,
      activeSheetIndex: 0,
      ...(fileName ? syncFromFileSpecs(s, fileName) : {}),
    });
    persist();
  },
  setActiveSheet: (idx: number) => {
    store.set({ activeSheetIndex: idx });
    persist();
  },
  getActiveSheet: (): ParsedSheet | null => {
    const s = store.get();
    if (s.activeFileIndex === null || s.activeSheetIndex === null) return null;
    return s.files[s.activeFileIndex]?.sheets[s.activeSheetIndex] ?? null;
  },
  getAnalysisSheet: (): ParsedSheet | null => {
    const s = store.get();
    if (s.files.length > 1 && s.mergedSheet) return s.mergedSheet;
    return appActions.getActiveSheet();
  },
  getSheetForKind: (kind: "spc" | "msa"): ParsedSheet | null => {
    const s = store.get();
    let fallbackSheet: ParsedSheet | null = null;
    for (const f of s.files) {
      for (const sh of f.sheets) {
        const detected = detectSheet(sh).kind;
        if (
          detected === kind ||
          (kind === "msa" && detected === "msa-rr") ||
          (kind === "spc" && detected === "spc-card")
        )
          return sh;
        if (kind === "msa" && !fallbackSheet && s.mapping.partCol && s.mapping.operatorCol) {
          const hasPart = sh.headers.includes(s.mapping.partCol);
          const hasOperator = sh.headers.includes(s.mapping.operatorCol);
          const hasValue = !s.mapping.valueCol || sh.headers.includes(s.mapping.valueCol);
          if (hasPart && hasOperator && hasValue) {
            fallbackSheet = sh;
          }
        }
      }
    }
    if (fallbackSheet) return fallbackSheet;
    return null;
  },
  clearFiles: () => {
    store.set({
      files: [],
      activeFileIndex: null,
      activeSheetIndex: null,
      mergedSheet: null,
      mapping: { ...DEFAULT_MAPPING },
    });
    persist();
  },
  hasAnyData: (): boolean => store.get().files.length > 0,

  // ===== Global specs (backward compat / no-file fallback) =====
  setSpecs: (patch: Partial<ProjectSpecs>) => {
    store.set({ specs: { ...store.get().specs, ...patch } });
    persist();
  },

  // ===== Per-file specs =====
  setFileSpecs: (fileName: string, patch: Partial<ProjectSpecs>) => {
    const s = store.get();
    const current = s.fileSpecs[fileName] ?? { ...DEFAULT_SPECS, ...s.specs };
    const updated = { ...current, ...patch };
    const newFileSpecs = { ...s.fileSpecs, [fileName]: updated };
    const activeFileName = s.activeFileIndex !== null ? s.files[s.activeFileIndex]?.name ?? null : null;
    store.set({
      fileSpecs: newFileSpecs,
      ...(fileName === activeFileName ? { specs: updated } : {}),
    });
    persist();
  },
  setFileColumnSpec: (fileName: string, col: string, patch: Partial<ColumnSpec>) => {
    const s = store.get();
    const currentPerCol = s.filePerColumnSpecs[fileName] ?? {};
    const fileSpec = s.fileSpecs[fileName] ?? s.specs;
    const current = currentPerCol[col] ?? { lsl: fileSpec.lsl, usl: fileSpec.usl, target: fileSpec.target };
    const updated = { ...current, ...patch };
    const newFilePerColSpecs = { ...s.filePerColumnSpecs, [fileName]: { ...currentPerCol, [col]: updated } };
    const activeFileName = s.activeFileIndex !== null ? s.files[s.activeFileIndex]?.name ?? null : null;
    store.set({
      filePerColumnSpecs: newFilePerColSpecs,
      ...(fileName === activeFileName ? { perColumnSpecs: { ...s.perColumnSpecs, [col]: updated } } : {}),
    });
    persist();
  },
  removeFileColumnSpec: (fileName: string, col: string) => {
    const s = store.get();
    const currentPerCol = { ...(s.filePerColumnSpecs[fileName] ?? {}) };
    delete currentPerCol[col];
    const newFilePerColSpecs = { ...s.filePerColumnSpecs, [fileName]: currentPerCol };
    const activeFileName = s.activeFileIndex !== null ? s.files[s.activeFileIndex]?.name ?? null : null;
    const nextGlobalPerCol = { ...s.perColumnSpecs };
    delete nextGlobalPerCol[col];
    store.set({
      filePerColumnSpecs: newFilePerColSpecs,
      ...(fileName === activeFileName ? { perColumnSpecs: nextGlobalPerCol } : {}),
    });
    persist();
  },

  // ===== Legacy per-column specs (global / no-file fallback) =====
  setColumnSpec: (col: string, patch: Partial<ColumnSpec>) => {
    const s = store.get();
    const current = s.perColumnSpecs[col] ?? { lsl: s.specs.lsl, usl: s.specs.usl, target: s.specs.target };
    store.set({ perColumnSpecs: { ...s.perColumnSpecs, [col]: { ...current, ...patch } } });
    persist();
  },
  removeColumnSpec: (col: string) => {
    const s = store.get();
    const next = { ...s.perColumnSpecs };
    delete next[col];
    store.set({ perColumnSpecs: next });
    persist();
  },
  getEffectiveSpec: (col: string | null | undefined): ColumnSpec => {
    const s = store.get();
    if (col && s.perColumnSpecs[col]) return s.perColumnSpecs[col];
    return { lsl: s.specs.lsl, usl: s.specs.usl, target: s.specs.target };
  },
  setMapping: (patch: Partial<ColumnMapping>) => {
    store.set({ mapping: { ...store.get().mapping, ...patch } });
    persist();
  },
  resetMapping: () => {
    store.set({ mapping: { ...DEFAULT_MAPPING } });
    persist();
  },
  rebuildMerge: () => {
    const merged = mergeFiles(store.get().files);
    store.set({ mergedSheet: merged });
    persist();
  },
};
