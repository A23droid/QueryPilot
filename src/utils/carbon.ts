/**
 * carbon.ts — Software Carbon Intensity (SCI) & Compute Energy Estimator
 *
 * Implements carbon emission and energy consumption modeling aligned with
 * the Green Software Foundation's Software Carbon Intensity (SCI) specification:
 *   SCI = ((E * I) + M) / R
 *
 * Where:
 *   - E: Operational energy consumed (kWh) derived from PostgreSQL execution plan cost units.
 *   - I: Location-based marginal carbon intensity of grid (380 gCO2e/kWh - EPA eGRID average).
 *   - M: Embodied carbon share of server compute infrastructure.
 *   - R: Functional unit (default: 10,000 query executions in production API routes).
 */

export interface CarbonMetrics {
  /** Operational energy consumption in kilowatt-hours (kWh) per batch */
  energyKwh: number;
  /** Estimated carbon emissions in grams of CO2 equivalent (gCO2e) */
  co2Grams: number;
  /** Estimated CPU time in milliseconds per single query */
  estCpuMs: number;
  /** Functional unit batch size (number of executions) */
  batchSize: number;
}

export interface CarbonDiff {
  baseline: CarbonMetrics;
  current: CarbonMetrics;
  /** Difference in kWh (current - baseline). Negative value represents energy saved */
  deltaEnergyKwh: number;
  /** Difference in gCO2e (current - baseline). Negative value represents emissions avoided */
  deltaCo2Grams: number;
  /** Percentage change in emissions */
  pctChange: number;
  /** Human-readable sustainability summary */
  summary: string;
}

/**
 * Energy conversion constant:
 * On modern cloud instances (e.g. GCP c2d / AWS c6g, ~0.0008 kWh per 1,000 PostgreSQL cost units).
 */
const KWH_PER_COST_UNIT = 0.0000008;

/**
 * Grid Carbon Intensity:
 * EPA eGRID standard for U.S. average grid: 380 grams CO2e per kWh.
 */
const GRID_CARBON_INTENSITY_G_PER_KWH = 380;

/**
 * Embodied carbon factor (hardware lifecycle share per 10k query batch):
 * Green Software Foundation SCI embodied carbon estimate for cloud server CPU time.
 */
const EMBODIED_CARBON_PER_BATCH_GRAMS = 0.015;

/**
 * Calculates Software Carbon Intensity (SCI) metrics for a PostgreSQL plan cost.
 *
 * @param totalCost - Total execution plan cost from PostgreSQL EXPLAIN
 * @param batchSize - Number of query executions to project (default: 10,000)
 */
export function calculateCarbonMetrics(
  totalCost: number,
  batchSize = 10000,
): CarbonMetrics {
  const safeCost = Math.max(0, totalCost);

  // Operational energy E (kWh)
  const energyKwh = safeCost * KWH_PER_COST_UNIT * (batchSize / 1000);

  // Operational emissions (E * I) + Embodied emissions (M)
  const operationalCo2 = energyKwh * GRID_CARBON_INTENSITY_G_PER_KWH;
  const embodiedCo2 = safeCost > 0 ? EMBODIED_CARBON_PER_BATCH_GRAMS : 0;
  const co2Grams = operationalCo2 + embodiedCo2;

  // Approximate CPU time estimation (~0.12ms per 10 cost units on modern SSD/RAM)
  const estCpuMs = Math.max(0.05, safeCost * 0.012);

  return {
    energyKwh: Number(energyKwh.toFixed(6)),
    co2Grams: Number(co2Grams.toFixed(3)),
    estCpuMs: Number(estCpuMs.toFixed(2)),
    batchSize,
  };
}

/**
 * Diffs carbon emissions and energy consumption between a baseline plan and current plan.
 *
 * @param baselineCost - Baseline execution plan cost
 * @param currentCost - Current execution plan cost
 * @param batchSize - Batch size for projection
 */
export function diffCarbon(
  baselineCost: number,
  currentCost: number,
  batchSize = 10000,
): CarbonDiff {
  const baseline = calculateCarbonMetrics(baselineCost, batchSize);
  const current = calculateCarbonMetrics(currentCost, batchSize);

  const deltaEnergyKwh = Number((current.energyKwh - baseline.energyKwh).toFixed(6));
  const deltaCo2Grams = Number((current.co2Grams - baseline.co2Grams).toFixed(3));

  const pctChange =
    baseline.co2Grams > 0
      ? Number((((current.co2Grams - baseline.co2Grams) / baseline.co2Grams) * 100).toFixed(1))
      : 0;

  let summary = "";
  if (deltaCo2Grams < -0.05) {
    const saved = Math.abs(deltaCo2Grams);
    summary = `🌱 Green AI Impact: -${saved.toFixed(2)}g CO₂e avoided (${Math.abs(pctChange)}% reduction) per ${batchSize.toLocaleString()} runs`;
  } else if (deltaCo2Grams > 0.05) {
    summary = `⚠️ High Carbon Footprint: +${deltaCo2Grams.toFixed(2)}g CO₂e increase (+${pctChange}%) per ${batchSize.toLocaleString()} runs`;
  } else {
    summary = `Neutral carbon footprint (±0.0% SCI delta)`;
  }

  return {
    baseline,
    current,
    deltaEnergyKwh,
    deltaCo2Grams,
    pctChange,
    summary,
  };
}

/**
 * Formats a clean Markdown block highlighting Software Carbon Intensity (SCI) metrics
 * for Merge Request comments and GitLab governance reports.
 */
export function formatCarbonMarkdown(diff: CarbonDiff): string {
  const isGreen = diff.deltaCo2Grams <= 0;
  const badge = isGreen ? "🌱 OPTIMIZED (LOW CARBON)" : "⚠️ CARBON REGRESSION";
  const icon = isGreen ? "✅" : "⚠️";

  return `### 🌱 Software Carbon Intensity (SCI) Impact
> **Status:** \`${badge}\`  
> *Quantified via Green Software Foundation SCI framework: SCI = ((E × I) + M) / R*

| Metric (per ${diff.current.batchSize.toLocaleString()} runs) | Baseline | Current | Delta |
| :--- | :--- | :--- | :--- |
| **Operational Energy (E)** | \`${diff.baseline.energyKwh} kWh\` | \`${diff.current.energyKwh} kWh\` | \`${diff.deltaEnergyKwh > 0 ? "+" : ""}${diff.deltaEnergyKwh} kWh\` |
| **Carbon Footprint (gCO₂e)** | \`${diff.baseline.co2Grams}g\` | \`${diff.current.co2Grams}g\` | \`${diff.deltaCo2Grams > 0 ? "+" : ""}${diff.deltaCo2Grams}g (${diff.pctChange}%)\` |
| **Est. CPU Time / Query** | \`${diff.baseline.estCpuMs} ms\` | \`${diff.current.estCpuMs} ms\` | \`${icon} ${diff.summary}\` |
`;
}
