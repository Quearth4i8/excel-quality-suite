// SPC / MSA / Capability / Uncertainty computations
// Pure TypeScript, no dependencies

// ===== Constants table for control charts (n = subgroup size) =====
// A2, D3, D4 (X̄-R), A3, B3, B4 (X̄-S), d2 (for sigma estimation)
export const SPC_CONSTANTS: Record<number, { A2: number; D3: number; D4: number; A3: number; B3: number; B4: number; d2: number; E2: number }> = {
  2: { A2: 1.880, D3: 0, D4: 3.267, A3: 2.659, B3: 0, B4: 3.267, d2: 1.128, E2: 2.660 },
  3: { A2: 1.023, D3: 0, D4: 2.574, A3: 1.954, B3: 0, B4: 2.568, d2: 1.693, E2: 1.772 },
  4: { A2: 0.729, D3: 0, D4: 2.282, A3: 1.628, B3: 0, B4: 2.266, d2: 2.059, E2: 1.457 },
  5: { A2: 0.577, D3: 0, D4: 2.114, A3: 1.427, B3: 0, B4: 2.089, d2: 2.326, E2: 1.290 },
  6: { A2: 0.483, D3: 0, D4: 2.004, A3: 1.287, B3: 0.030, B4: 1.970, d2: 2.534, E2: 1.184 },
  7: { A2: 0.419, D3: 0.076, D4: 1.924, A3: 1.182, B3: 0.118, B4: 1.882, d2: 2.704, E2: 1.109 },
  8: { A2: 0.373, D3: 0.136, D4: 1.864, A3: 1.099, B3: 0.185, B4: 1.815, d2: 2.847, E2: 1.054 },
  9: { A2: 0.337, D3: 0.184, D4: 1.816, A3: 1.032, B3: 0.239, B4: 1.761, d2: 2.970, E2: 1.010 },
  10: { A2: 0.308, D3: 0.223, D4: 1.777, A3: 0.975, B3: 0.284, B4: 1.716, d2: 3.078, E2: 0.975 },
};

export const mean = (a: number[]): number => a.reduce((s, x) => s + x, 0) / (a.length || 1);
export const sum = (a: number[]): number => a.reduce((s, x) => s + x, 0);
export const stdev = (a: number[], sample = true): number => {
  if (a.length < 2) return 0;
  const m = mean(a);
  const v = a.reduce((s, x) => s + (x - m) ** 2, 0) / (sample ? a.length - 1 : a.length);
  return Math.sqrt(v);
};
export const range = (a: number[]): number => Math.max(...a) - Math.min(...a);
export const min = (a: number[]) => Math.min(...a);
export const max = (a: number[]) => Math.max(...a);

// ===== X-bar / R chart =====
export interface XbarRResult {
  subgroupMeans: number[];   // X̄ᵢ — mean of each subgroup row
  subgroupRanges: number[];  // Rᵢ — range (max−min) of each subgroup row
  xbar: number;              // X̿ — mean of all subgroup means (used in all limit calculations)
  rbar: number;              // R̄ — mean of all ranges
  uclX: number;
  lclX: number;
  clX: number;
  uclR: number;
  lclR: number;
  clR: number;
  sigmaHat: number;
  outOfControl: number[]; // indices
  westernElectric: { rule: number; index: number; description: string }[];
  n: number;
}

export function computeXbarR(subgroups: number[][]): XbarRResult {
  const n = subgroups[0]?.length ?? 0;
  const c = SPC_CONSTANTS[n] || SPC_CONSTANTS[5];
  const means = subgroups.map(mean);
  const ranges = subgroups.map(range);
  const xbar = mean(means);
  const rbar = mean(ranges);
  const sigmaHat = rbar / c.d2;
  const uclX = xbar + c.A2 * rbar;
  const lclX = xbar - c.A2 * rbar;
  const uclR = c.D4 * rbar;
  const lclR = c.D3 * rbar;

  const outOfControl: number[] = [];
  means.forEach((m, i) => {
    if (m > uclX || m < lclX) outOfControl.push(i);
  });

  const we = westernElectricRules(means, xbar, sigmaHat);

  return {
    subgroupMeans: means,
    subgroupRanges: ranges,
    xbar,
    rbar,
    uclX,
    lclX,
    clX: xbar,
    uclR,
    lclR,
    clR: rbar,
    sigmaHat,
    outOfControl,
    westernElectric: we,
    n,
  };
}

// ===== Reference line builders =====
export interface RefLine { y: number; label: string; color: string; }

export function buildXbarRefLines(result: XbarRResult): RefLine[] {
  const { xbar, rbar } = result;
  return [
    { y: xbar + 0.594 * rbar, label: "LCS", color: "hsl(var(--destructive))" },
    { y: xbar + 0.377 * rbar, label: "LSS", color: "hsl(var(--warning))" },
    { y: xbar,                label: "X̿",  color: "hsl(var(--success))" },
    { y: xbar - 0.377 * rbar, label: "LSI", color: "hsl(var(--warning))" },
    { y: xbar - 0.594 * rbar, label: "LCI", color: "hsl(var(--destructive))" },
  ];
}

export function buildRRefLines(result: XbarRResult): RefLine[] {
  const { uclR, clR, lclR } = result;
  return [
    { y: uclR,                                        label: "LCS", color: "hsl(var(--destructive))" },
    { y: clR + (uclR - clR) * (2 / 3),               label: "LSS", color: "hsl(var(--warning))" },
    { y: clR,                                         label: "R̄",  color: "hsl(var(--success))" },
    { y: Math.max(0, clR - (clR - lclR) * (2 / 3)), label: "LSI", color: "hsl(var(--warning))" },
    { y: lclR,                                        label: "LCI", color: "hsl(var(--destructive))" },
  ];
}

// ===== X-bar / S chart =====
export function computeXbarS(subgroups: number[][]) {
  const n = subgroups[0]?.length ?? 0;
  const c = SPC_CONSTANTS[n] || SPC_CONSTANTS[5];
  const means = subgroups.map(mean);
  const stds = subgroups.map((g) => stdev(g));
  const xbar = mean(means);
  const sbar = mean(stds);
  const uclX = xbar + c.A3 * sbar;
  const lclX = xbar - c.A3 * sbar;
  const uclS = c.B4 * sbar;
  const lclS = c.B3 * sbar;
  const outOfControl: number[] = [];
  means.forEach((m, i) => {
    if (m > uclX || m < lclX) outOfControl.push(i);
  });
  return { subgroupMeans: means, subgroupStds: stds, xbar, sbar, uclX, lclX, clX: xbar, uclS, lclS, clS: sbar, outOfControl, n };
}

// ===== I-MR chart =====
export function computeIMR(values: number[]) {
  const movingRanges = values.slice(1).map((v, i) => Math.abs(v - values[i]));
  const xbar = mean(values);
  const mrbar = mean(movingRanges);
  const sigmaHat = mrbar / 1.128;
  const uclI = xbar + 2.66 * mrbar;
  const lclI = xbar - 2.66 * mrbar;
  const uclMR = 3.267 * mrbar;
  const lclMR = 0;
  const outOfControl: number[] = [];
  values.forEach((v, i) => {
    if (v > uclI || v < lclI) outOfControl.push(i);
  });
  return { values, movingRanges, xbar, mrbar, sigmaHat, uclI, lclI, clI: xbar, uclMR, lclMR, clMR: mrbar, outOfControl };
}

// ===== Western Electric rules =====
function westernElectricRules(values: number[], cl: number, sigma: number) {
  const violations: { rule: number; index: number; description: string }[] = [];
  values.forEach((v, i) => {
    const z = (v - cl) / sigma;
    if (Math.abs(z) > 3) violations.push({ rule: 1, index: i, description: "1 point au-delà de 3σ" });
  });
  // Rule 2: 9 consecutive on same side of CL
  for (let i = 8; i < values.length; i++) {
    const slice = values.slice(i - 8, i + 1);
    if (slice.every((v) => v > cl) || slice.every((v) => v < cl))
      violations.push({ rule: 2, index: i, description: "9 points consécutifs du même côté" });
  }
  // Rule 3: 6 consecutive increasing or decreasing
  for (let i = 5; i < values.length; i++) {
    const s = values.slice(i - 5, i + 1);
    let inc = true,
      dec = true;
    for (let k = 1; k < s.length; k++) {
      if (s[k] <= s[k - 1]) inc = false;
      if (s[k] >= s[k - 1]) dec = false;
    }
    if (inc || dec) violations.push({ rule: 3, index: i, description: "6 points en tendance continue" });
  }
  // Rule 4: 2 of 3 beyond 2σ
  for (let i = 2; i < values.length; i++) {
    const s = values.slice(i - 2, i + 1);
    const beyond = s.filter((v) => Math.abs((v - cl) / sigma) > 2 && (v - cl) > 0).length;
    const beyondNeg = s.filter((v) => Math.abs((v - cl) / sigma) > 2 && (v - cl) < 0).length;
    if (beyond >= 2 || beyondNeg >= 2) violations.push({ rule: 4, index: i, description: "2 sur 3 points au-delà de 2σ" });
  }
  return violations;
}

// ===== Capability =====
export interface CapabilityResult {
  mean: number;
  stdShortTerm: number; // for Cp/Cpk (R-bar/d2)
  stdLongTerm: number; // sample std for Pp/Ppk
  cp: number;
  cpk: number;
  pp: number;
  ppk: number;
  cpm?: number;
  lsl: number;
  usl: number;
  target?: number;
  interpretation: string;
  status: "capable" | "improve" | "not_capable";
}

export function computeCapability(
  values: number[],
  lsl: number,
  usl: number,
  target?: number,
  subgroupSize?: number,
  ranges?: number[] // pre-computed subgroup ranges (e.g. row ranges for multi-column data)
): CapabilityResult {
  const m = mean(values);

  // σg = √(Σ(xi − X̿)² / (N−1))  — global long-term std (sample std)
  const sLong = stdev(values);

  // σi = R̄ / d2  — within-subgroup short-term std
  const n = (subgroupSize && subgroupSize >= 2 && subgroupSize <= 10) ? subgroupSize : 5;
  let sShort = sLong; // fallback when not enough data
  if (ranges && ranges.length > 0) {
    // Use pre-computed ranges (row ranges in multi-column analysis: each row = one subgroup)
    sShort = mean(ranges) / SPC_CONSTANTS[n].d2;
  } else {
    // Estimate σi from consecutive subgroups within a single column
    const subgroups: number[][] = [];
    for (let i = 0; i < values.length; i += n) subgroups.push(values.slice(i, i + n));
    const completeSubs = subgroups.filter((s) => s.length === n);
    if (completeSubs.length > 0) {
      sShort = mean(completeSubs.map(range)) / SPC_CONSTANTS[n].d2;
    }
  }

  // CP = (USL − LSL) / (6 σi)
  const cp = (usl - lsl) / (6 * sShort);
  // CPK = min( (USL − X̿)/(3 σi),  (X̿ − LSL)/(3 σi) )
  const cpk = Math.min((usl - m) / (3 * sShort), (m - lsl) / (3 * sShort));
  // PP = (USL − LSL) / (6 σg)
  const pp = (usl - lsl) / (6 * sLong);
  // PPK = min( (USL − X̿)/(3 σg),  (X̿ − LSL)/(3 σg) )
  const ppk = Math.min((usl - m) / (3 * sLong), (m - lsl) / (3 * sLong));
  const cpm = target !== undefined ? (usl - lsl) / (6 * Math.sqrt(sLong ** 2 + (m - target) ** 2)) : undefined;

  let status: CapabilityResult["status"] = "not_capable";
  let interpretation = "Procédé non capable - actions correctives nécessaires";
  if (cpk >= 1.33) {
    status = "capable";
    interpretation = "Procédé capable - performance satisfaisante";
  } else if (cpk >= 1.0) {
    status = "improve";
    interpretation = "Procédé à améliorer - performance limite";
  }

  return { mean: m, stdShortTerm: sShort, stdLongTerm: sLong, cp, cpk, pp, ppk, cpm, lsl, usl, target, interpretation, status };
}

// ===== Histogram =====
export function buildHistogram(values: number[], bins = 20, loOverride?: number, hiOverride?: number) {
  if (values.length === 0) return [];
  const lo = loOverride ?? Math.min(...values);
  const hi = hiOverride ?? Math.max(...values);
  const w = (hi - lo) / bins || 1;
  const counts = Array(bins).fill(0);
  values.forEach((v) => {
    const idx = Math.min(bins - 1, Math.floor((v - lo) / w));
    counts[idx]++;
  });
  // Pick label precision so bin centres are distinct
  const decimals = w < 0.0001 ? 5 : w < 0.001 ? 4 : w < 0.01 ? 3 : w < 0.1 ? 2 : 1;
  return counts.map((c, i) => ({
    bin: lo + i * w + w / 2,
    count: c,
    label: (lo + i * w + w / 2).toFixed(decimals),
  }));
}

// Normal PDF for overlay
export function normalPdf(x: number, mu: number, sigma: number) {
  return (1 / (sigma * Math.sqrt(2 * Math.PI))) * Math.exp(-((x - mu) ** 2) / (2 * sigma ** 2));
}

// ===== MSA / Gage R&R (Average & Range method — AIAG K constants) =====
export interface MSAEntry {
  part: string | number;
  operator: string | number;
  trial: number;
  value: number;
}

// K1 = 1/d2* for the number of trials (repeatability)
export const MSA_K1: Record<number, number> = {
  2: 0.8862,
  3: 0.5908,
};

// K2 = 1/d2* for the number of appraisers/operators (reproducibility)
export const MSA_K2: Record<number, number> = {
  2: 0.7071,
  3: 0.5231,
};

// K3 = 1/d2* for the number of parts (part variation)
export const MSA_K3: Record<number, number> = {
  2: 0.7071,
  3: 0.5231,
  4: 0.4467,
  5: 0.4030,
  6: 0.3742,
  7: 0.3534,
  8: 0.3375,
  9: 0.3249,
  10: 0.3146,
};

function getK1(r: number): number {
  const clamped = Math.min(Math.max(r, 2), 3);
  return MSA_K1[clamped] ?? MSA_K1[2];
}
function getK2(g: number): number {
  const clamped = Math.min(Math.max(g, 2), 3);
  return MSA_K2[clamped] ?? MSA_K2[2];
}
function getK3(p: number): number {
  const clamped = Math.min(Math.max(p, 2), 10);
  return MSA_K3[clamped] ?? MSA_K3[10];
}

export interface MSAResult {
  // Main metrics (AIAG range method)
  ev: number;   // EV = R̄ × K1  (Equipment Variation / Repeatability)
  av: number;   // AV = √((X̄DIFF × K2)² − EV²/(n·r))  (Appraiser Variation / Reproducibility)
  grr: number;  // R&R = √(EV² + AV²)
  pv: number;   // PV = Rp × K3  (Part Variation)
  tv: number;   // TV = √(R&R² + PV²)
  // Percentages
  evPct: number;
  avPct: number;
  grrPct: number;
  pvPct: number;
  // Variance contributions
  evContrib: number;
  avContrib: number;
  grrContrib: number;
  pvContrib: number;
  // ndc
  ndc: number;
  // Study dimensions
  parts: number;
  operators: number;
  trials: number;
  // Intermediate values for formula display
  rbar: number;   // R̄ — average of ranges
  xDiff: number;  // X̄DIFF — range of operator averages
  rp: number;     // Rp — range of part averages
  k1: number;
  k2: number;
  k3: number;
  // Status
  interpretation: string;
  status: "excellent" | "acceptable" | "improve";
}

export function computeMSA(entries: MSAEntry[]): MSAResult {
  // Group by part & operator
  const partsSet = Array.from(new Set(entries.map((e) => String(e.part))));
  const opsSet = Array.from(new Set(entries.map((e) => String(e.operator))));
  const parts = partsSet.length;
  const operators = opsSet.length;

  // data[op][part] = trials[]
  const data: Record<string, Record<string, number[]>> = {};
  opsSet.forEach((o) => {
    data[o] = {};
    partsSet.forEach((p) => (data[o][p] = []));
  });
  entries.forEach((e) => {
    data[String(e.operator)][String(e.part)].push(e.value);
  });

  const trials = Math.max(...opsSet.flatMap((o) => partsSet.map((p) => data[o][p].length)));

  // ── EV = R̄ × K1 ──
  const ranges: number[] = [];
  opsSet.forEach((o) => partsSet.forEach((p) => {
    const t = data[o][p];
    if (t.length > 1) ranges.push(range(t));
  }));
  const rbar = mean(ranges);
  const k1 = getK1(trials);
  const ev = rbar * k1;

  // ── AV = √((X̄DIFF × K2)² − EV²/(n·r)) ──
  const opMeans = opsSet.map((o) => {
    const all: number[] = [];
    partsSet.forEach((p) => all.push(...data[o][p]));
    return mean(all);
  });
  const xDiff = max(opMeans) - min(opMeans);
  const k2 = getK2(operators);
  const avSquared = (xDiff * k2) ** 2 - ev ** 2 / (parts * trials);
  const av = Math.sqrt(Math.max(0, avSquared));

  // ── R&R = √(EV² + AV²) ──
  const grr = Math.sqrt(ev ** 2 + av ** 2);

  // ── PV = Rp × K3 ──
  const partAverages = partsSet.map((p) => {
    const all: number[] = [];
    opsSet.forEach((o) => all.push(...data[o][p]));
    return mean(all);
  });
  const rp = max(partAverages) - min(partAverages);
  const k3 = getK3(parts);
  const pv = rp * k3;

  // ── TV = √(R&R² + PV²) ──
  const tv = Math.sqrt(grr ** 2 + pv ** 2);

  const evPct = tv > 0 ? (ev / tv) * 100 : 0;
  const avPct = tv > 0 ? (av / tv) * 100 : 0;
  const grrPct = tv > 0 ? (grr / tv) * 100 : 0;
  const pvPct = tv > 0 ? (pv / tv) * 100 : 0;

  const evContrib = tv > 0 ? (ev ** 2 / tv ** 2) * 100 : 0;
  const avContrib = tv > 0 ? (av ** 2 / tv ** 2) * 100 : 0;
  const grrContrib = tv > 0 ? (grr ** 2 / tv ** 2) * 100 : 0;
  const pvContrib = tv > 0 ? (pv ** 2 / tv ** 2) * 100 : 0;

  const ndc = grr > 0 ? Math.floor(1.41 * (pv / grr)) : 0;

  let status: MSAResult["status"] = "improve";
  let interpretation = "Système de mesure à améliorer (>30%)";
  if (grrPct < 10) {
    status = "excellent";
    interpretation = "Système de mesure excellent (<10%)";
  } else if (grrPct <= 30) {
    status = "acceptable";
    interpretation = "Système de mesure acceptable (10–30%)";
  }

  return {
    ev, av, grr, pv, tv,
    evPct, avPct, grrPct, pvPct,
    evContrib, avContrib, grrContrib, pvContrib,
    ndc, parts, operators, trials,
    rbar, xDiff, rp, k1, k2, k3,
    interpretation, status,
  };
}

// ===== Uncertainty =====
export interface UncertaintyComponent {
  name: string;
  type: "A" | "B";
  value: number; // standard uncertainty
  distribution?: "normal" | "uniform" | "triangular";
  divisor?: number;
}

export interface UncertaintyResult {
  uA: number;
  uB: number;
  uC: number; // combined
  k: number;
  U: number; // expanded
  components: UncertaintyComponent[];
  experimentalStd: number;
  n: number;
}

export function computeUncertaintyTypeA(values: number[]) {
  const n = values.length;
  const s = stdev(values);
  const uA = s / Math.sqrt(n); // std of the mean
  return { s, uA, n, mean: mean(values) };
}

export function combineUncertainties(uA: number, components: UncertaintyComponent[], k = 2): UncertaintyResult {
  const uB = Math.sqrt(components.filter((c) => c.type === "B").reduce((s, c) => s + c.value ** 2, 0));
  const uC = Math.sqrt(uA ** 2 + uB ** 2);
  const U = k * uC;
  return { uA, uB, uC, k, U, components, experimentalStd: 0, n: 0 };
}
