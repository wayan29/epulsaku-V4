"use server";

import { verifyAuth } from "@/app/api/auth/actions";
import { coerceToDate } from "@/lib/date-utils";
import { aggregateDb } from "@/lib/mongodb";
import {
  differenceInDays,
  eachDayOfInterval,
  endOfDay,
  endOfMonth,
  endOfWeek,
  endOfYear,
  format as formatDateFns,
  startOfDay,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subDays,
  subMonths,
  subWeeks,
  subYears,
} from "date-fns";
import type { Document } from "mongodb";

type DashboardProvider = "digiflazz" | "tokovoucher";
type DashboardStatus = "Sukses" | "Pending" | "Gagal";
type HealthTone = "accent" | "positive" | "warning" | "danger" | "neutral";

interface AggregateSnapshot {
  transactions: number;
  successCount: number;
  pendingCount: number;
  failedCount: number;
  revenue: number;
  cost: number;
  profit: number;
  successRate: number;
}

export type DashboardMetricKey =
  | "transactions"
  | "revenue"
  | "cost"
  | "profit";

export interface DashboardSummaryInput {
  from?: string;
  to?: string;
}

export interface DashboardKpi {
  key: "today" | "yesterday" | "week" | "month" | "year" | "overall";
  label: string;
  helper: string;
  transactions: number;
  revenue: number;
  cost: number;
  profit: number;
  successRate: number;
  deltaTransactions: number | null;
  deltaProfit: number | null;
}

export interface DashboardChartPoint {
  label: string;
  transactions: number;
  revenue: number;
  cost: number;
  profit: number;
}

export interface DashboardBrandRow {
  name: string;
  transactions: number;
  revenue: number;
  profit: number;
  share: number;
  fill: string;
}

export interface DashboardProviderRow {
  provider: DashboardProvider;
  label: string;
  transactions: number;
  successCount: number;
  pendingCount: number;
  failedCount: number;
  successRate: number;
  revenue: number;
  cost: number;
  profit: number;
  dominantBrand: string;
}

export interface DashboardStatusRow {
  status: DashboardStatus;
  label: string;
  count: number;
  share: number;
  tone: HealthTone;
}

export interface DashboardHealthCard {
  key: string;
  label: string;
  value: string;
  helper: string;
  tone: HealthTone;
}

export interface DashboardHighlight {
  key: string;
  label: string;
  value: string;
  helper: string;
  tone: HealthTone;
}

export interface DashboardSummary {
  generatedAt: string;
  range: {
    from: string;
    to: string;
    days: number;
  };
  rangeSummary: AggregateSnapshot;
  kpis: DashboardKpi[];
  chartSeries: DashboardChartPoint[];
  brandBreakdown: DashboardBrandRow[];
  providerBreakdown: DashboardProviderRow[];
  statusBreakdown: DashboardStatusRow[];
  healthCards: DashboardHealthCard[];
  highlights: DashboardHighlight[];
}

interface DashboardAggregateRow {
  transactions?: number;
  successCount?: number;
  pendingCount?: number;
  failedCount?: number;
  revenue?: number;
  cost?: number;
  profit?: number;
}

interface DashboardDailyAggregateRow {
  key: string;
  transactions: number;
  revenue: number;
  cost: number;
  profit: number;
}

interface DashboardBrandAggregateRow {
  name: string;
  transactions: number;
  revenue: number;
  profit: number;
}

interface DashboardProviderAggregateRow {
  provider: DashboardProvider;
  transactions: number;
  successCount: number;
  pendingCount: number;
  failedCount: number;
  revenue: number;
  cost: number;
  profit: number;
}

interface DashboardProviderBrandAggregateRow {
  provider: DashboardProvider;
  dominantBrand: string;
}

interface RangeFacetResponse {
  summary?: DashboardAggregateRow[];
  dailySeries?: DashboardDailyAggregateRow[];
  brands?: DashboardBrandAggregateRow[];
  providers?: DashboardProviderAggregateRow[];
  providerBrands?: DashboardProviderBrandAggregateRow[];
}

type KpiFacetKey =
  | "todayCurrent"
  | "todayPrevious"
  | "yesterdayCurrent"
  | "yesterdayPrevious"
  | "weekCurrent"
  | "weekPrevious"
  | "monthCurrent"
  | "monthPrevious"
  | "yearCurrent"
  | "yearPrevious"
  | "overallCurrent";

type KpiFacetResponse = Partial<Record<KpiFacetKey, DashboardAggregateRow[]>>;

const TRANSACTIONS_DB = "transactions_log";
const BRAND_COLORS = [
  "#D35400",
  "#E67E22",
  "#F39C12",
  "#F5B041",
  "#38BDF8",
  "#2563EB",
  "#10B981",
];
const DASHBOARD_TIMEZONE = process.env.TIMEZONE || "Asia/Makassar";
const DASHBOARD_PERF_LOG = process.env.LOG_DASHBOARD_PERF === "true";
const DASHBOARD_SLOW_QUERY_MS = Number(
  process.env.DASHBOARD_SLOW_QUERY_MS || "300"
);

function createEmptyAggregate(): AggregateSnapshot {
  return {
    transactions: 0,
    successCount: 0,
    pendingCount: 0,
    failedCount: 0,
    revenue: 0,
    cost: 0,
    profit: 0,
    successRate: 0,
  };
}

function roundOneDecimal(value: number): number {
  return Number(value.toFixed(1));
}

function toSuccessRate(successCount: number, transactions: number): number {
  if (transactions === 0) return 0;
  return roundOneDecimal((successCount / transactions) * 100);
}

function toPercentChange(current: number, previous: number): number | null {
  if (previous === 0) {
    return current === 0 ? 0 : 100;
  }

  return roundOneDecimal(((current - previous) / previous) * 100);
}

function formatCompact(value: number): string {
  return new Intl.NumberFormat("id-ID", {
    notation: "compact",
    maximumFractionDigits: value >= 100 ? 0 : 1,
  }).format(value);
}

function formatCurrency(value: number): string {
  return `Rp ${Math.round(value).toLocaleString("id-ID")}`;
}

function formatDurationMs(value: number): string {
  return `${Math.round(value)}ms`;
}

function logDashboardPerf(payload: {
  rangeDays: number;
  rangeTransactions: number;
  rangeFacetMs: number;
  kpiFacetMs: number;
  transformMs: number;
  totalMs: number;
  brandRows: number;
  chartPoints: number;
}) {
  if (!DASHBOARD_PERF_LOG && payload.totalMs < DASHBOARD_SLOW_QUERY_MS) {
    return;
  }

  const logMethod =
    payload.totalMs >= DASHBOARD_SLOW_QUERY_MS ? console.warn : console.info;

  logMethod(
    `[Dashboard Perf] total=${formatDurationMs(payload.totalMs)} rangeFacet=${formatDurationMs(payload.rangeFacetMs)} kpiFacet=${formatDurationMs(payload.kpiFacetMs)} transform=${formatDurationMs(payload.transformMs)} rangeDays=${payload.rangeDays} tx=${payload.rangeTransactions} chartPoints=${payload.chartPoints} brands=${payload.brandRows}`
  );
}

function hydrateAggregate(row?: DashboardAggregateRow): AggregateSnapshot {
  const transactions = row?.transactions ?? 0;
  const successCount = row?.successCount ?? 0;
  const pendingCount = row?.pendingCount ?? 0;
  const failedCount = row?.failedCount ?? 0;
  const revenue = row?.revenue ?? 0;
  const cost = row?.cost ?? 0;
  const profit = row?.profit ?? revenue - cost;

  return {
    transactions,
    successCount,
    pendingCount,
    failedCount,
    revenue,
    cost,
    profit,
    successRate: toSuccessRate(successCount, transactions),
  };
}

function getDateRange(input?: DashboardSummaryInput) {
  const fallbackFrom = subDays(new Date(), 6);
  const fallbackTo = new Date();

  const tentativeFrom = input?.from ? coerceToDate(input.from) : fallbackFrom;
  const tentativeTo = input?.to
    ? coerceToDate(input.to)
    : input?.from
      ? coerceToDate(input.from)
      : fallbackTo;

  const safeFrom = Number.isNaN(tentativeFrom.getTime()) ? fallbackFrom : tentativeFrom;
  const safeTo = Number.isNaN(tentativeTo.getTime()) ? fallbackTo : tentativeTo;

  const from = startOfDay(safeFrom <= safeTo ? safeFrom : safeTo);
  const to = endOfDay(safeFrom <= safeTo ? safeTo : safeFrom);

  return {
    from,
    to,
    days: differenceInDays(to, from) + 1,
  };
}

function buildNormalizedFieldStages(): Document[] {
  return [
    {
      $addFields: {
        dashboardTimestamp: "$timestampDate",
        dashboardProvider: {
          $cond: [
            {
              $eq: [
                { $toLower: { $ifNull: ["$provider", "digiflazz"] } },
                "tokovoucher",
              ],
            },
            "tokovoucher",
            "digiflazz",
          ],
        },
        dashboardStatus: {
          $switch: {
            branches: [
              { case: { $eq: ["$status", "Sukses"] }, then: "Sukses" },
              { case: { $eq: ["$status", "Gagal"] }, then: "Gagal" },
              { case: { $eq: ["$status", "Pending"] }, then: "Pending" },
            ],
            default: "Pending",
          },
        },
        dashboardBrand: {
          $let: {
            vars: {
              brandValue: {
                $trim: {
                  input: { $ifNull: ["$productBrandFromProvider", ""] },
                },
              },
            },
            in: {
              $cond: [{ $eq: ["$$brandValue", ""] }, "Unknown", "$$brandValue"],
            },
          },
        },
        dashboardCost: {
          $cond: [{ $isNumber: "$costPrice" }, "$costPrice", 0],
        },
        dashboardSelling: {
          $cond: [
            {
              $and: [
                { $isNumber: "$sellingPrice" },
                { $gt: ["$sellingPrice", 0] },
              ],
            },
            "$sellingPrice",
            {
              $cond: [{ $isNumber: "$costPrice" }, "$costPrice", 0],
            },
          ],
        },
      },
    },
  ];
}

function buildSummaryStages(): Document[] {
  return [
    {
      $group: {
        _id: null,
        transactions: { $sum: 1 },
        successCount: {
          $sum: {
            $cond: [{ $eq: ["$dashboardStatus", "Sukses"] }, 1, 0],
          },
        },
        pendingCount: {
          $sum: {
            $cond: [{ $eq: ["$dashboardStatus", "Pending"] }, 1, 0],
          },
        },
        failedCount: {
          $sum: {
            $cond: [{ $eq: ["$dashboardStatus", "Gagal"] }, 1, 0],
          },
        },
        revenue: {
          $sum: {
            $cond: [
              { $eq: ["$dashboardStatus", "Sukses"] },
              "$dashboardSelling",
              0,
            ],
          },
        },
        cost: {
          $sum: {
            $cond: [
              { $eq: ["$dashboardStatus", "Sukses"] },
              "$dashboardCost",
              0,
            ],
          },
        },
      },
    },
    {
      $project: {
        _id: 0,
        transactions: 1,
        successCount: 1,
        pendingCount: 1,
        failedCount: 1,
        revenue: 1,
        cost: 1,
        profit: { $subtract: ["$revenue", "$cost"] },
      },
    },
  ];
}

function buildRangeMatchStage(from: Date, to: Date): Document {
  return {
    $match: {
      dashboardTimestamp: {
        $gte: from,
        $lte: to,
      },
    },
  };
}

function buildRangeFacetPipeline(range: { from: Date; to: Date }): Document[] {
  return [
    {
      $match: {
        timestampDate: {
          $gte: range.from,
          $lte: range.to,
        },
      },
    },
    ...buildNormalizedFieldStages(),
    {
      $facet: {
        summary: buildSummaryStages(),
        dailySeries: [
          {
            $group: {
              _id: {
                $dateToString: {
                  format: "%Y-%m-%d",
                  date: "$dashboardTimestamp",
                  timezone: DASHBOARD_TIMEZONE,
                },
              },
              transactions: { $sum: 1 },
              revenue: {
                $sum: {
                  $cond: [
                    { $eq: ["$dashboardStatus", "Sukses"] },
                    "$dashboardSelling",
                    0,
                  ],
                },
              },
              cost: {
                $sum: {
                  $cond: [
                    { $eq: ["$dashboardStatus", "Sukses"] },
                    "$dashboardCost",
                    0,
                  ],
                },
              },
            },
          },
          {
            $project: {
              _id: 0,
              key: "$_id",
              transactions: 1,
              revenue: 1,
              cost: 1,
              profit: { $subtract: ["$revenue", "$cost"] },
            },
          },
          { $sort: { key: 1 } },
        ],
        brands: [
          {
            $group: {
              _id: "$dashboardBrand",
              transactions: { $sum: 1 },
              revenue: {
                $sum: {
                  $cond: [
                    { $eq: ["$dashboardStatus", "Sukses"] },
                    "$dashboardSelling",
                    0,
                  ],
                },
              },
              cost: {
                $sum: {
                  $cond: [
                    { $eq: ["$dashboardStatus", "Sukses"] },
                    "$dashboardCost",
                    0,
                  ],
                },
              },
            },
          },
          {
            $project: {
              _id: 0,
              name: "$_id",
              transactions: 1,
              revenue: 1,
              profit: { $subtract: ["$revenue", "$cost"] },
            },
          },
          { $sort: { transactions: -1, profit: -1, name: 1 } },
        ],
        providers: [
          {
            $group: {
              _id: "$dashboardProvider",
              transactions: { $sum: 1 },
              successCount: {
                $sum: {
                  $cond: [{ $eq: ["$dashboardStatus", "Sukses"] }, 1, 0],
                },
              },
              pendingCount: {
                $sum: {
                  $cond: [{ $eq: ["$dashboardStatus", "Pending"] }, 1, 0],
                },
              },
              failedCount: {
                $sum: {
                  $cond: [{ $eq: ["$dashboardStatus", "Gagal"] }, 1, 0],
                },
              },
              revenue: {
                $sum: {
                  $cond: [
                    { $eq: ["$dashboardStatus", "Sukses"] },
                    "$dashboardSelling",
                    0,
                  ],
                },
              },
              cost: {
                $sum: {
                  $cond: [
                    { $eq: ["$dashboardStatus", "Sukses"] },
                    "$dashboardCost",
                    0,
                  ],
                },
              },
            },
          },
          {
            $project: {
              _id: 0,
              provider: "$_id",
              transactions: 1,
              successCount: 1,
              pendingCount: 1,
              failedCount: 1,
              revenue: 1,
              cost: 1,
              profit: { $subtract: ["$revenue", "$cost"] },
            },
          },
          { $sort: { provider: 1 } },
        ],
        providerBrands: [
          {
            $group: {
              _id: {
                provider: "$dashboardProvider",
                brand: "$dashboardBrand",
              },
              transactions: { $sum: 1 },
              revenue: {
                $sum: {
                  $cond: [
                    { $eq: ["$dashboardStatus", "Sukses"] },
                    "$dashboardSelling",
                    0,
                  ],
                },
              },
              cost: {
                $sum: {
                  $cond: [
                    { $eq: ["$dashboardStatus", "Sukses"] },
                    "$dashboardCost",
                    0,
                  ],
                },
              },
            },
          },
          {
            $project: {
              _id: 0,
              provider: "$_id.provider",
              brand: "$_id.brand",
              transactions: 1,
              profit: { $subtract: ["$revenue", "$cost"] },
            },
          },
          { $sort: { provider: 1, transactions: -1, profit: -1, brand: 1 } },
          {
            $group: {
              _id: "$provider",
              dominantBrand: { $first: "$brand" },
            },
          },
          {
            $project: {
              _id: 0,
              provider: "$_id",
              dominantBrand: 1,
            },
          },
        ],
      },
    },
  ];
}

function buildKpiFacetPipeline(): Document[] {
  const now = new Date();
  const weekOptions = { weekStartsOn: 1 as const };
  const today = { from: startOfDay(now), to: endOfDay(now) };
  const yesterday = {
    from: startOfDay(subDays(now, 1)),
    to: endOfDay(subDays(now, 1)),
  };
  const yesterdayPrevious = {
    from: startOfDay(subDays(now, 2)),
    to: endOfDay(subDays(now, 2)),
  };
  const week = {
    from: startOfWeek(now, weekOptions),
    to: endOfWeek(now, weekOptions),
  };
  const weekPrevious = {
    from: startOfWeek(subWeeks(now, 1), weekOptions),
    to: endOfWeek(subWeeks(now, 1), weekOptions),
  };
  const month = {
    from: startOfMonth(now),
    to: endOfMonth(now),
  };
  const monthPrevious = {
    from: startOfMonth(subMonths(now, 1)),
    to: endOfMonth(subMonths(now, 1)),
  };
  const year = {
    from: startOfYear(now),
    to: endOfYear(now),
  };
  const yearPrevious = {
    from: startOfYear(subYears(now, 1)),
    to: endOfYear(subYears(now, 1)),
  };

  const scopedSummary = (from: Date, to: Date): Document[] => [
    buildRangeMatchStage(from, to),
    ...buildSummaryStages(),
  ];

  return [
    {
      $match: {
        timestampDate: { $type: "date" },
      },
    },
    ...buildNormalizedFieldStages(),
    {
      $facet: {
        todayCurrent: scopedSummary(today.from, today.to),
        todayPrevious: scopedSummary(yesterday.from, yesterday.to),
        yesterdayCurrent: scopedSummary(yesterday.from, yesterday.to),
        yesterdayPrevious: scopedSummary(
          yesterdayPrevious.from,
          yesterdayPrevious.to
        ),
        weekCurrent: scopedSummary(week.from, week.to),
        weekPrevious: scopedSummary(weekPrevious.from, weekPrevious.to),
        monthCurrent: scopedSummary(month.from, month.to),
        monthPrevious: scopedSummary(monthPrevious.from, monthPrevious.to),
        yearCurrent: scopedSummary(year.from, year.to),
        yearPrevious: scopedSummary(yearPrevious.from, yearPrevious.to),
        overallCurrent: buildSummaryStages(),
      },
    },
  ];
}

function buildBrandBreakdown(
  rows: DashboardBrandAggregateRow[],
  totalTransactions: number
): DashboardBrandRow[] {
  if (rows.length === 0 || totalTransactions === 0) return [];

  const primary = rows.slice(0, BRAND_COLORS.length - 1);
  const overflow = rows.slice(BRAND_COLORS.length - 1);

  if (overflow.length > 0) {
    primary.push({
      name: "Others",
      transactions: overflow.reduce((sum, item) => sum + item.transactions, 0),
      revenue: overflow.reduce((sum, item) => sum + item.revenue, 0),
      profit: overflow.reduce((sum, item) => sum + item.profit, 0),
    });
  }

  return primary.map((item, index) => ({
    ...item,
    share: roundOneDecimal((item.transactions / totalTransactions) * 100),
    fill:
      item.name === "Others"
        ? "#94A3B8"
        : BRAND_COLORS[index % BRAND_COLORS.length],
  }));
}

function buildProviderBreakdown(
  rows: DashboardProviderAggregateRow[],
  dominantBrandRows: DashboardProviderBrandAggregateRow[]
): DashboardProviderRow[] {
  const providerMap = new Map(rows.map((row) => [row.provider, row]));
  const dominantBrandMap = new Map(
    dominantBrandRows.map((row) => [row.provider, row.dominantBrand])
  );

  return (["digiflazz", "tokovoucher"] as const).map((provider) => {
    const values = providerMap.get(provider);
    const transactions = values?.transactions ?? 0;
    const successCount = values?.successCount ?? 0;
    const pendingCount = values?.pendingCount ?? 0;
    const failedCount = values?.failedCount ?? 0;
    const revenue = values?.revenue ?? 0;
    const cost = values?.cost ?? 0;
    const profit = values?.profit ?? revenue - cost;

    return {
      provider,
      label: provider === "digiflazz" ? "Digiflazz" : "TokoVoucher",
      transactions,
      successCount,
      pendingCount,
      failedCount,
      successRate: toSuccessRate(successCount, transactions),
      revenue,
      cost,
      profit,
      dominantBrand: dominantBrandMap.get(provider) || "Belum ada data",
    };
  });
}

function buildStatusBreakdown(
  aggregate: AggregateSnapshot
): DashboardStatusRow[] {
  const total = aggregate.transactions;

  return [
    {
      status: "Sukses",
      label: "Sukses",
      count: aggregate.successCount,
      share: total > 0 ? roundOneDecimal((aggregate.successCount / total) * 100) : 0,
      tone: "positive",
    },
    {
      status: "Pending",
      label: "Pending",
      count: aggregate.pendingCount,
      share: total > 0 ? roundOneDecimal((aggregate.pendingCount / total) * 100) : 0,
      tone: "warning",
    },
    {
      status: "Gagal",
      label: "Gagal",
      count: aggregate.failedCount,
      share: total > 0 ? roundOneDecimal((aggregate.failedCount / total) * 100) : 0,
      tone: "danger",
    },
  ];
}

function buildChartSeries(
  range: { from: Date; to: Date },
  rows: DashboardDailyAggregateRow[]
): DashboardChartPoint[] {
  const rowsByKey = new Map(rows.map((row) => [row.key, row]));
  const dailyPoints = eachDayOfInterval({ start: range.from, end: range.to }).map(
    (day) => {
      const key = formatDateFns(day, "yyyy-MM-dd");
      const values = rowsByKey.get(key);

      return {
        date: day,
        key,
        label: formatDateFns(day, "dd MMM"),
        transactions: values?.transactions ?? 0,
        revenue: values?.revenue ?? 0,
        cost: values?.cost ?? 0,
        profit: values?.profit ?? 0,
      };
    }
  );

  const rangeDays = differenceInDays(range.to, range.from);
  if (rangeDays <= 31) {
    return dailyPoints.map(({ label, transactions, revenue, cost, profit }) => ({
      label,
      transactions,
      revenue,
      cost,
      profit,
    }));
  }

  const groups = new Map<
    string,
    {
      date: Date;
      label: string;
      transactions: number;
      revenue: number;
      cost: number;
      profit: number;
    }
  >();

  for (const point of dailyPoints) {
    const bucketDate =
      rangeDays <= 180
        ? startOfWeek(point.date, { weekStartsOn: 1 })
        : startOfMonth(point.date);
    const bucketKey = formatDateFns(bucketDate, "yyyy-MM-dd");
    const existing = groups.get(bucketKey) || {
      date: bucketDate,
      label: formatDateFns(bucketDate, rangeDays <= 180 ? "dd MMM" : "MMM yy"),
      transactions: 0,
      revenue: 0,
      cost: 0,
      profit: 0,
    };

    existing.transactions += point.transactions;
    existing.revenue += point.revenue;
    existing.cost += point.cost;
    existing.profit += point.profit;
    groups.set(bucketKey, existing);
  }

  return [...groups.values()]
    .sort((left, right) => left.date.getTime() - right.date.getTime())
    .map(({ label, transactions, revenue, cost, profit }) => ({
      label,
      transactions,
      revenue,
      cost,
      profit,
    }));
}

function buildKpis(kpiFacet: KpiFacetResponse): DashboardKpi[] {
  const entries: Array<{
    key: DashboardKpi["key"];
    label: string;
    helper: string;
    currentKey: KpiFacetKey;
    previousKey?: KpiFacetKey;
  }> = [
    {
      key: "today",
      label: "Today",
      helper: "Performa transaksi hari ini.",
      currentKey: "todayCurrent",
      previousKey: "todayPrevious",
    },
    {
      key: "yesterday",
      label: "Yesterday",
      helper: "Performa transaksi kemarin.",
      currentKey: "yesterdayCurrent",
      previousKey: "yesterdayPrevious",
    },
    {
      key: "week",
      label: "This Week",
      helper: "Akumulasi transaksi minggu berjalan.",
      currentKey: "weekCurrent",
      previousKey: "weekPrevious",
    },
    {
      key: "month",
      label: "This Month",
      helper: "Akumulasi transaksi bulan berjalan.",
      currentKey: "monthCurrent",
      previousKey: "monthPrevious",
    },
    {
      key: "year",
      label: "This Year",
      helper: "Akumulasi transaksi tahun berjalan.",
      currentKey: "yearCurrent",
      previousKey: "yearPrevious",
    },
    {
      key: "overall",
      label: "Overall",
      helper: "Seluruh transaksi yang tercatat.",
      currentKey: "overallCurrent",
    },
  ];

  return entries.map((entry) => {
    const current = hydrateAggregate(kpiFacet[entry.currentKey]?.[0]);
    const previous = entry.previousKey
      ? hydrateAggregate(kpiFacet[entry.previousKey]?.[0])
      : null;

    return {
      key: entry.key,
      label: entry.label,
      helper: entry.helper,
      transactions: current.transactions,
      revenue: current.revenue,
      cost: current.cost,
      profit: current.profit,
      successRate: current.successRate,
      deltaTransactions: previous
        ? toPercentChange(current.transactions, previous.transactions)
        : null,
      deltaProfit: previous
        ? toPercentChange(current.profit, previous.profit)
        : null,
    };
  });
}

function buildHealthCards(
  rangeSummary: AggregateSnapshot,
  chartSeries: DashboardChartPoint[],
  rangeDays: number
): DashboardHealthCard[] {
  const busiestPoint = [...chartSeries].sort(
    (left, right) => right.transactions - left.transactions
  )[0];

  return [
    {
      key: "success-rate",
      label: "Success Rate",
      value: `${rangeSummary.successRate}%`,
      helper: `${rangeSummary.successCount.toLocaleString("id-ID")} sukses dari ${rangeSummary.transactions.toLocaleString("id-ID")} transaksi`,
      tone:
        rangeSummary.successRate >= 90
          ? "positive"
          : rangeSummary.successRate >= 75
            ? "warning"
            : "danger",
    },
    {
      key: "pending-review",
      label: "Pending Watch",
      value: rangeSummary.pendingCount.toLocaleString("id-ID"),
      helper:
        rangeSummary.pendingCount > 0
          ? "Transaksi tertunda perlu dipantau."
          : "Tidak ada antrean pending.",
      tone: rangeSummary.pendingCount > 5 ? "warning" : "neutral",
    },
    {
      key: "failure-review",
      label: "Failure Watch",
      value: rangeSummary.failedCount.toLocaleString("id-ID"),
      helper:
        rangeSummary.failedCount > 0
          ? "Cek provider, input pelanggan, atau retry flow."
          : "Tidak ada spike transaksi gagal.",
      tone: rangeSummary.failedCount > 5 ? "danger" : "neutral",
    },
    {
      key: "daily-volume",
      label: "Avg Daily Volume",
      value: formatCompact(rangeSummary.transactions / Math.max(rangeDays, 1)),
      helper: `Rata-rata transaksi harian dalam ${rangeDays} hari.`,
      tone: "accent",
    },
    {
      key: "busiest-window",
      label: "Busiest Window",
      value: busiestPoint?.label || "Belum ada data",
      helper: busiestPoint
        ? `${busiestPoint.transactions.toLocaleString("id-ID")} transaksi pada window tersibuk`
        : "Belum ada transaksi pada range ini.",
      tone: "warning",
    },
  ];
}

function buildHighlights(
  brands: DashboardBrandRow[],
  providers: DashboardProviderRow[],
  chartSeries: DashboardChartPoint[]
): DashboardHighlight[] {
  const topBrand = brands[0];
  const topProvider = [...providers]
    .filter((provider) => provider.transactions > 0)
    .sort((left, right) => right.profit - left.profit)[0];
  const busiestWindow = [...chartSeries].sort(
    (left, right) => right.transactions - left.transactions
  )[0];

  return [
    {
      key: "top-brand",
      label: "Top Brand",
      value: topBrand?.name || "Belum ada data",
      helper: topBrand
        ? `${topBrand.transactions.toLocaleString("id-ID")} transaksi, ${formatCurrency(topBrand.profit)} profit`
        : "Belum ada distribusi brand untuk range ini.",
      tone: "accent",
    },
    {
      key: "strongest-provider",
      label: "Strongest Provider",
      value: topProvider?.label || "Belum ada data",
      helper: topProvider
        ? `${formatCurrency(topProvider.profit)} profit dengan success rate ${topProvider.successRate}%`
        : "Belum ada provider dominan untuk range ini.",
      tone: "positive",
    },
    {
      key: "busiest-window",
      label: "Busiest Window",
      value: busiestWindow?.label || "Belum ada data",
      helper: busiestWindow
        ? `${busiestWindow.transactions.toLocaleString("id-ID")} transaksi pada window tertinggi`
        : "Belum ada aktivitas pada range ini.",
      tone: "warning",
    },
  ];
}

async function assertDashboardAccess() {
  const { isAuthenticated, user } = await verifyAuth();

  if (!isAuthenticated || !user) {
    throw new Error("Unauthorized");
  }

  const hasAccess =
    user.role === "super_admin" ||
    user.permissions?.includes("all_access") ||
    user.permissions?.includes("dashboard");

  if (!hasAccess) {
    throw new Error("Forbidden");
  }
}

async function buildDashboardSummary(
  input?: DashboardSummaryInput
): Promise<DashboardSummary> {
  const range = getDateRange(input);
  const startedAt = Date.now();

  const [rangeFacetResult, kpiFacetResult] = await Promise.all([
    (async () => {
      const queryStartedAt = Date.now();
      const rows = await aggregateDb<RangeFacetResponse>(
        TRANSACTIONS_DB,
        buildRangeFacetPipeline(range),
        {
          allowDiskUse: true,
        }
      );

      return {
        rows,
        durationMs: Date.now() - queryStartedAt,
      };
    })(),
    (async () => {
      const queryStartedAt = Date.now();
      const rows = await aggregateDb<KpiFacetResponse>(
        TRANSACTIONS_DB,
        buildKpiFacetPipeline(),
        {
          allowDiskUse: true,
        }
      );

      return {
        rows,
        durationMs: Date.now() - queryStartedAt,
      };
    })(),
  ]);

  const transformStartedAt = Date.now();
  const rangeFacet = rangeFacetResult.rows[0] || {};
  const kpiFacet = kpiFacetResult.rows[0] || {};

  const rangeSummary = hydrateAggregate(rangeFacet.summary?.[0]);
  const chartSeries = buildChartSeries(range, rangeFacet.dailySeries || []);
  const brandBreakdown = buildBrandBreakdown(
    rangeFacet.brands || [],
    rangeSummary.transactions
  );
  const providerBreakdown = buildProviderBreakdown(
    rangeFacet.providers || [],
    rangeFacet.providerBrands || []
  );
  const statusBreakdown = buildStatusBreakdown(rangeSummary);
  const healthCards = buildHealthCards(rangeSummary, chartSeries, range.days);
  const highlights = buildHighlights(
    brandBreakdown,
    providerBreakdown,
    chartSeries
  );
  const transformMs = Date.now() - transformStartedAt;
  const totalMs = Date.now() - startedAt;

  logDashboardPerf({
    rangeDays: range.days,
    rangeTransactions: rangeSummary.transactions,
    rangeFacetMs: rangeFacetResult.durationMs,
    kpiFacetMs: kpiFacetResult.durationMs,
    transformMs,
    totalMs,
    brandRows: brandBreakdown.length,
    chartPoints: chartSeries.length,
  });

  return {
    generatedAt: new Date().toISOString(),
    range: {
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      days: range.days,
    },
    rangeSummary,
    kpis: buildKpis(kpiFacet),
    chartSeries,
    brandBreakdown,
    providerBreakdown,
    statusBreakdown,
    healthCards,
    highlights,
  };
}

export async function getDashboardSummary(
  input?: DashboardSummaryInput
): Promise<DashboardSummary> {
  await assertDashboardAccess();
  return buildDashboardSummary(input);
}

// Internal maintenance helper for benchmark/backfill scripts. Do not use in routes.
export async function getDashboardSummaryForMaintenance(
  input?: DashboardSummaryInput
): Promise<DashboardSummary> {
  return buildDashboardSummary(input);
}
