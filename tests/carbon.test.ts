import { describe, it, expect } from "vitest";
import {
  calculateCarbonMetrics,
  diffCarbon,
  formatCarbonMarkdown,
} from "../src/utils/carbon.js";

describe("carbon utility — Software Carbon Intensity (SCI) calculations", () => {
  it("calculates accurate energy and carbon metrics for a low-cost index scan", () => {
    const metrics = calculateCarbonMetrics(8.29, 10000);

    expect(metrics.energyKwh).toBeGreaterThan(0);
    expect(metrics.co2Grams).toBeGreaterThan(0);
    expect(metrics.estCpuMs).toBeGreaterThanOrEqual(0.05);
    expect(metrics.batchSize).toBe(10000);
  });

  it("handles zero or negative plan costs safely", () => {
    const metrics = calculateCarbonMetrics(0, 10000);

    expect(metrics.energyKwh).toBe(0);
    expect(metrics.co2Grams).toBe(0);
    expect(metrics.estCpuMs).toBe(0.05);
  });

  it("correctly identifies carbon reductions when optimizing slow queries", () => {
    // Optimizing a query from cost 1500 to cost 8.29
    const diff = diffCarbon(1500, 8.29, 10000);

    expect(diff.deltaEnergyKwh).toBeLessThan(0);
    expect(diff.deltaCo2Grams).toBeLessThan(0);
    expect(diff.pctChange).toBeLessThan(-90);
    expect(diff.summary).toContain("Green AI Impact");
    expect(diff.summary).toContain("avoided");
  });

  it("correctly identifies carbon regression when query cost spikes", () => {
    // Regression from cost 8.29 to cost 5000
    const diff = diffCarbon(8.29, 5000, 10000);

    expect(diff.deltaEnergyKwh).toBeGreaterThan(0);
    expect(diff.deltaCo2Grams).toBeGreaterThan(0);
    expect(diff.pctChange).toBeGreaterThan(100);
    expect(diff.summary).toContain("High Carbon Footprint");
  });

  it("generates markdown containing SCI methodology and table", () => {
    const diff = diffCarbon(1000, 50, 10000);
    const markdown = formatCarbonMarkdown(diff);

    expect(markdown).toContain("Software Carbon Intensity (SCI) Impact");
    expect(markdown).toContain("Green Software Foundation SCI framework");
    expect(markdown).toContain("Operational Energy (E)");
    expect(markdown).toContain("Carbon Footprint (gCO₂e)");
  });
});
