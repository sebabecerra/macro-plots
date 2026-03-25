import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptDir, "..");
const oilSource = resolve(root, "DCOILWTICO.csv");
const goldSource = resolve(root, "gold_pm.json");
const sp500Source = resolve(root, "SP500.csv");
const outputDir = resolve(root, "public/data");
const rawOutputDir = resolve(root, "public/raw");
const outputFile = resolve(outputDir, "commodities.json");
const MIN_YEAR = 1986;

function parseOil(text) {
  return text
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .map((line) => {
      const [date, rawPrice] = line.split(",");
      return { date, price: Number(rawPrice) };
    })
    .filter((row) => row.date && Number.isFinite(row.price) && row.price > 0);
}

function parseGold(text) {
  return JSON.parse(text)
    .map((row) => ({
      date: row.d,
      price: Number(row.v?.[0]),
    }))
    .filter((row) => row.date && Number.isFinite(row.price) && row.price > 0);
}

function parseCsvSeries(text) {
  return text
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .map((line) => {
      const [date, rawPrice] = line.split(",");
      return { date, price: Number(rawPrice) };
    })
    .filter((row) => row.date && Number.isFinite(row.price) && row.price > 0);
}

function buildSeries(rows, minYear) {
  const buckets = new Map();

  for (const row of rows) {
    const year = Number(row.date.slice(0, 4));
    if (year < minYear) continue;
    if (!buckets.has(year)) buckets.set(year, []);
    buckets.get(year).push(row);
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([year, points]) => {
      const base = points[0].price;
      return {
        year,
        firstDate: points[0].date,
        lastDate: points.at(-1).date,
        basePrice: round2(base),
        lastPrice: round2(points.at(-1).price),
        points: points.map((point, index) => ({
          day: index + 1,
          date: point.date,
          price: round2(point.price),
          changePct: round4(((point.price / base) - 1) * 100),
        })),
      };
    });
}

function buildSummary(series) {
  if (!series.length) {
    throw new Error(`No valid yearly series were generated for data after ${MIN_YEAR}.`);
  }

  const current = series.at(-1);
  const currentPoint = current?.points.at(-1);
  if (!current || !currentPoint) {
    throw new Error("The latest yearly series does not contain any valid points.");
  }

  const allPoints = series.flatMap((item) =>
    item.points.map((point) => ({
      year: item.year,
      ...point,
    })),
  );
  if (!allPoints.length) {
    throw new Error("No valid commodity points were generated.");
  }

  const high = allPoints.reduce((best, point) =>
    !best || point.changePct > best.changePct ? point : best,
  null);
  const low = allPoints.reduce((best, point) =>
    !best || point.changePct < best.changePct ? point : best,
  null);

  return {
    startYear: series[0].year,
    endYear: current.year,
    currentYear: current.year,
    currentDay: currentPoint.day,
    currentChangePct: currentPoint.changePct,
    currentDate: current.lastDate,
    recordHigh: high,
    recordLow: low,
  };
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function round4(value) {
  return Math.round(value * 10000) / 10000;
}

const [oilText, goldText, sp500Text] = await Promise.all([
  readFile(oilSource, "utf8"),
  readFile(goldSource, "utf8"),
  readFile(sp500Source, "utf8"),
]);

const oilSeries = buildSeries(parseOil(oilText), MIN_YEAR);
const goldSeries = buildSeries(parseGold(goldText), MIN_YEAR);
const sp500Series = buildSeries(parseCsvSeries(sp500Text), MIN_YEAR);

function buildDatasetSummary(label, series) {
  try {
    return buildSummary(series);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to build ${label} dataset: ${message}`);
  }
}

const payload = {
  generatedAt: new Date().toISOString(),
  oil: {
    key: "oil",
    name: "WTI Crude Oil",
    unit: "USD per barrel",
    sourceName: "FRED / U.S. Energy Information Administration",
    sourceUrl: "https://fred.stlouisfed.org/series/DCOILWTICO",
    rawFile: "DCOILWTICO.csv",
    summary: buildDatasetSummary("oil", oilSeries),
    series: oilSeries,
  },
  gold: {
    key: "gold",
    name: "Gold PM Fix",
    unit: "USD per troy ounce",
    sourceName: "LBMA Gold Price PM feed",
    sourceUrl: "https://www.lbma.org.uk/prices-and-data",
    rawFile: "gold_pm.json",
    summary: buildDatasetSummary("gold", goldSeries),
    series: goldSeries,
  },
  sp500: {
    key: "sp500",
    name: "S&P 500",
    unit: "Index level",
    sourceName: "FRED / Standard & Poor's",
    sourceUrl: "https://fred.stlouisfed.org/series/SP500",
    rawFile: "SP500.csv",
    summary: buildDatasetSummary("sp500", sp500Series),
    series: sp500Series,
  },
};

await mkdir(outputDir, { recursive: true });
await mkdir(rawOutputDir, { recursive: true });
await Promise.all([
  writeFile(outputFile, JSON.stringify(payload)),
  copyFile(oilSource, resolve(rawOutputDir, "DCOILWTICO.csv")),
  copyFile(goldSource, resolve(rawOutputDir, "gold_pm.json")),
  copyFile(sp500Source, resolve(rawOutputDir, "SP500.csv")),
]);
console.log(`Wrote ${outputFile}`);
