import "dotenv/config";
import { endOfMonth, endOfYear, startOfMonth, startOfYear, subDays } from "date-fns";
import { getDashboardSummaryForMaintenance } from "../src/lib/dashboard-utils";

type Scenario = {
  label: string;
  from: Date;
  to: Date;
};

function createScenarios(): Scenario[] {
  const today = new Date();
  const last7Days = {
    from: subDays(today, 6),
    to: today,
  };

  return [
    {
      label: "Cold 7D",
      ...last7Days,
    },
    {
      label: "Warm 7D",
      ...last7Days,
    },
    {
      label: "30D",
      from: subDays(today, 29),
      to: today,
    },
    {
      label: "MTD",
      from: startOfMonth(today),
      to: endOfMonth(today) > today ? today : endOfMonth(today),
    },
    {
      label: "YTD",
      from: startOfYear(today),
      to: endOfYear(today) > today ? today : endOfYear(today),
    },
  ];
}

async function main() {
  const scenarios = createScenarios();
  const results: Array<{
    label: string;
    durationMs: number;
    rangeDays: number;
    transactions: number;
    chartPoints: number;
    brands: number;
  }> = [];

  for (const scenario of scenarios) {
    const startedAt = Date.now();
    const summary = await getDashboardSummaryForMaintenance({
      from: scenario.from.toISOString(),
      to: scenario.to.toISOString(),
    });
    const durationMs = Date.now() - startedAt;

    results.push({
      label: scenario.label,
      durationMs,
      rangeDays: summary.range.days,
      transactions: summary.rangeSummary.transactions,
      chartPoints: summary.chartSeries.length,
      brands: summary.brandBreakdown.length,
    });
  }

  const warmSamples = results.filter((item) => item.label !== "Cold 7D");
  const averageWarmMs =
    warmSamples.reduce((sum, item) => sum + item.durationMs, 0) /
    Math.max(warmSamples.length, 1);
  const worstMs = Math.max(...results.map((item) => item.durationMs));
  const recommendedSlowThresholdMs =
    averageWarmMs <= 250 ? 300 : averageWarmMs <= 350 ? 400 : 500;

  console.log(
    JSON.stringify(
      {
        results,
        recommendation: {
          currentSlowThresholdMs: Number(process.env.DASHBOARD_SLOW_QUERY_MS || "400"),
          averageWarmMs: Math.round(averageWarmMs),
          worstMs,
          recommendedSlowThresholdMs,
        },
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error("[measure:dashboard-latency] failed");
  console.error(error);
  process.exitCode = 1;
});
