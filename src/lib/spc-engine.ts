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

export function computeCapability(values: number[], lsl: number, usl: number, target?: number, subgroupSize?: number): CapabilityResult {
  const m = mean(values);
  const sLong = stdev(values);
  let sShort = sLong;
  if (subgroupSize && subgroupSize >= 2 && subgroupSize <= 10) {
    // estimate from subgroups
    const subgroups: number[][] = [];
    for (let i = 0; i < values.length; i += subgroupSize) subgroups.push(values.slice(i, i + subgroupSize));
    const completeSubs = subgroups.filter((s) => s.length === subgroupSize);
    if (completeSubs.length > 0) {
      const rbar = mean(completeSubs.map(range));
      sShort = rbar / SPC_CONSTANTS[subgroupSize].d2;
    }
  }
  const cp = (usl - lsl) / (6 * sShort);
  const cpk = Math.min((usl - m) / (3 * sShort), (m - lsl) / (3 * sShort));
  const pp = (usl - lsl) / (6 * sLong);
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
export function buildHistogram(values: number[], bins = 20) {
  if (values.length === 0) return [];
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const w = (hi - lo) / bins || 1;
  const counts = Array(bins).fill(0);
  values.forEach((v) => {
    const idx = Math.min(bins - 1, Math.floor((v - lo) / w));
    counts[idx]++;
  });
  return counts.map((c, i) => ({
    bin: lo + i * w + w / 2,
    count: c,
    label: (lo + i * w + w / 2).toFixed(2),
  }));
}

// Normal PDF for overlay
export function normalPdf(x: number, mu: number, sigma: number) {
  return (1 / (sigma * Math.sqrt(2 * Math.PI))) * Math.exp(-((x - mu) ** 2) / (2 * sigma ** 2));
}

// ===== MSA / Gage R&R (Average & Range method) =====
export interface MSAEntry {
  part: string | number;
  operator: string | number;
  trial: number;
  value: number;
}

export interface MSAResult {
  ev: number; // repeatability
  av: number; // reproducibility
  grr: number;
  pv: number; // part variation
  tv: number; // total variation
  evPct: number;
  avPct: number;
  grrPct: number;
  pvPct: number;
  ndc: number; // number of distinct categories
  evContrib: number;
  avContrib: number;
  grrContrib: number;
  pvContrib: number;
  parts: number;
  operators: number;
  trials: number;
  interpretation: string;
  status: "excellent" | "acceptable" | "improve";
}

export function computeMSA(entries: MSAEntry[]): MSAResult {
  // Group by part & operator
  const partsSet = Array.from(new Set(entries.map((e) => String(e.part))));
  const opsSet = Array.from(new Set(entries.map((e) => String(e.operator))));
  const parts = partsSet.length;
  const operators = opsSet.length;

  // values[op][part] = trials[]
  const data: Record<string, Record<string, number[]>> = {};
  opsSet.forEach((o) => {
    data[o] = {};
    partsSet.forEach((p) => (data[o][p] = []));
  });
  entries.forEach((e) => {
    data[String(e.operator)][String(e.part)].push(e.value);
  });

  const trials = Math.max(...opsSet.flatMap((o) => partsSet.map((p) => data[o][p].length)));

  // Range per (op,part)
  const ranges: number[] = [];
  opsSet.forEach((o) => partsSet.forEach((p) => {
    const t = data[o][p];
    if (t.length > 1) ranges.push(range(t));
  }));
  const rbar = mean(ranges);
  const dStar = SPC_CONSTANTS[Math.min(Math.max(trials, 2), 10)].d2;
  const ev = rbar / dStar;

  // Operator means
  const opMeans = opsSet.map((o) => {
    const all: number[] = [];
    partsSet.forEach((p) => all.push(...data[o][p]));
    return mean(all);
  });
  const xDiff = max(opMeans) - min(opMeans);
  const dStarOp = SPC_CONSTANTS[Math.min(Math.max(operators, 2), 10)].d2;
  const avSquared = (xDiff / dStarOp) ** 2 - (ev ** 2) / (parts * trials);
  const av = Math.sqrt(Math.max(0, avSquared));

  const grr = Math.sqrt(ev ** 2 + av ** 2);

  // Part variation: range of part averages across operators
  const partAverages = partsSet.map((p) => {
    const all: number[] = [];
    opsSet.forEach((o) => all.push(...data[o][p]));
    return mean(all);
  });
  const rp = max(partAverages) - min(partAverages);
  const dStarPart = SPC_CONSTANTS[Math.min(Math.max(parts, 2), 10)].d2;
  const pv = rp / dStarPart;

  const tv = Math.sqrt(grr ** 2 + pv ** 2);

  const evPct = (ev / tv) * 100;
  const avPct = (av / tv) * 100;
  const grrPct = (grr / tv) * 100;
  const pvPct = (pv / tv) * 100;

  // contribution = variance ratios
  const evContrib = (ev ** 2 / tv ** 2) * 100;
  const avContrib = (av ** 2 / tv ** 2) * 100;
  const grrContrib = (grr ** 2 / tv ** 2) * 100;
  const pvContrib = (pv ** 2 / tv ** 2) * 100;

  const ndc = Math.floor(1.41 * (pv / grr));

  let status: MSAResult["status"] = "improve";
  let interpretation = "Système de mesure à améliorer (>30%)";
  if (grrPct < 10) {
    status = "excellent";
    interpretation = "Système de mesure excellent (<10%)";
  } else if (grrPct <= 30) {
    status = "acceptable";
    interpretation = "Système de mesure acceptable (10-30%)";
  }

  return {
    ev, av, grr, pv, tv,
    evPct, avPct, grrPct, pvPct,
    ndc, evContrib, avContrib, grrContrib, pvContrib,
    parts, operators, trials,
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
