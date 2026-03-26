import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptDir, "..");
const outputDir = resolve(root, "public/data");
const rawOutputDir = resolve(root, "public/raw");
const outputFile = resolve(outputDir, "commodities.json");
const MIN_YEAR = 1986;
const startDate = new Date(`${MIN_YEAR}-01-01T00:00:00Z`);
const period1 = Math.floor(startDate.getTime() / 1000);
const period2 = Math.floor(Date.now() / 1000) + 86400;

const SERIES_CONFIG = [
  {
    key: "oil",
    sourceType: "yahoo",
    ticker: "CL=F",
    name: "WTI Crude Oil",
    unit: "USD per barrel",
    sourceName: "Yahoo Finance",
    sourceUrl: "https://finance.yahoo.com/quote/CL%3DF/history",
    rawFile: "oil-yahoo.csv",
  },
  {
    key: "gold",
    sourceType: "yahoo",
    ticker: "GC=F",
    name: "Gold Futures",
    unit: "USD per troy ounce",
    sourceName: "Yahoo Finance",
    sourceUrl: "https://finance.yahoo.com/quote/GC%3DF/history",
    rawFile: "gold-yahoo.csv",
  },
  {
    key: "sp500",
    sourceType: "yahoo",
    ticker: "^GSPC",
    name: "S&P 500",
    unit: "Index level",
    sourceName: "Yahoo Finance",
    sourceUrl: "https://finance.yahoo.com/quote/%5EGSPC/history",
    rawFile: "sp500-yahoo.csv",
  },
  {
    key: "ipsa",
    sourceType: "bcentral",
    name: "S&P IPSA",
    unit: "Index level",
    sourceName: "Banco Central de Chile",
    sourceUrl: "https://si3.bcentral.cl/siete/ES/Siete/Cuadro/CAP_ESTADIST_MACRO/MN_EST_MACRO_IV/PEM_INDBUR?idSerie=F013.IBC.IND.N.7.LAC.CL.CLP.BLO.D",
    rawFile: "ipsa-bcentral.csv",
    seriesId: "F013.IBC.IND.N.7.LAC.CL.CLP.BLO.D",
  },
];

function round2(value) {
  return Math.round(value * 100) / 100;
}

function round4(value) {
  return Math.round(value * 10000) / 10000;
}

function toDateString(timestamp) {
  return new Date(timestamp * 1000).toISOString().slice(0, 10);
}

async function fetchYahooSeries({ ticker }) {
  const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}`);
  url.searchParams.set("period1", String(period1));
  url.searchParams.set("period2", String(period2));
  url.searchParams.set("interval", "1d");
  url.searchParams.set("includePrePost", "false");
  url.searchParams.set("events", "div,splits");

  const response = await fetch(url, {
    headers: {
      "User-Agent": "macro-plots/1.0",
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Yahoo Finance request failed for ${ticker}: HTTP ${response.status}`);
  }

  const payload = await response.json();
  const result = payload?.chart?.result?.[0];
  const timestamps = result?.timestamp ?? [];
  const quote = result?.indicators?.quote?.[0];
  const closes = quote?.close ?? [];
  const adjcloses = result?.indicators?.adjclose?.[0]?.adjclose ?? [];

  if (!timestamps.length || !closes.length) {
    const message = payload?.chart?.error?.description ?? "No time series returned";
    throw new Error(`Yahoo Finance returned no usable data for ${ticker}: ${message}`);
  }

  return timestamps
    .map((timestamp, index) => {
      const adjusted = adjcloses[index];
      const close = closes[index];
      const price = Number.isFinite(adjusted) ? adjusted : close;
      return {
        date: toDateString(timestamp),
        price,
      };
    })
    .filter((row) => row.date && Number.isFinite(row.price) && row.price > 0);
}

function formatBcentralDate(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseBcentralDate(value) {
  const [day, month, year] = value.split("-");
  return `${year}-${month}-${day}`;
}

async function fetchBcentralSeries({ seriesId }) {
  const user = process.env.BCCH_USER;
  const pass = process.env.BCCH_PASS;

  if (!user || !pass) {
    throw new Error("BCCH_USER/BCCH_PASS are required to fetch IPSA from Banco Central de Chile.");
  }

  const url = new URL("https://si3.bcentral.cl/SieteRestWS/SieteRestWS.ashx");
  url.searchParams.set("user", user);
  url.searchParams.set("pass", pass);
  url.searchParams.set("timeseries", seriesId);
  url.searchParams.set("firstdate", formatBcentralDate(startDate));
  url.searchParams.set("lastdate", formatBcentralDate(new Date()));
  url.searchParams.set("function", "GetSeries");

  const response = await fetch(url, {
    headers: {
      "User-Agent": "macro-plots/1.0",
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Banco Central request failed for ${seriesId}: HTTP ${response.status}`);
  }

  const payload = await response.json();
  if (payload?.Codigo !== 0) {
    throw new Error(`Banco Central returned Codigo=${payload?.Codigo}: ${payload?.Descripcion ?? "Unknown error"}`);
  }

  const observations = payload?.Series?.Obs ?? [];
  if (!observations.length) {
    throw new Error(`Banco Central returned no usable data for ${seriesId}.`);
  }

  return observations
    .map((entry) => ({
      date: parseBcentralDate(entry.indexDateString),
      price: Number(entry.value),
    }))
    .filter((row) => row.date && Number.isFinite(row.price) && row.price > 0);
}

function toRawCsv(rows) {
  return [
    "date,price",
    ...rows.map((row) => `${row.date},${round4(row.price)}`),
  ].join("\n");
}

function daysBetween(a, b) {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / msPerDay);
}

function dropBrokenTailSegment(rows) {
  if (rows.length < 2) return rows;

  let lastGapIndex = -1;
  for (let index = 1; index < rows.length; index += 1) {
    if (daysBetween(rows[index - 1].date, rows[index].date) > 120) {
      lastGapIndex = index;
    }
  }

  if (lastGapIndex === -1) return rows;

  const trailingSegment = rows.slice(lastGapIndex);
  if (trailingSegment.length >= 30) return rows;

  console.warn(
    `Dropping anomalous trailing segment from ${trailingSegment[0].date} to ${trailingSegment.at(-1).date} (${trailingSegment.length} rows) after a large data gap.`,
  );
  return rows.slice(0, lastGapIndex);
}

function parseRawCsv(csvText) {
  const [header, ...lines] = csvText.trim().split(/\r?\n/);
  if (header !== "date,price") {
    throw new Error("Unexpected CSV header in local raw snapshot.");
  }

  return lines
    .map((line) => {
      const [date, rawPrice] = line.split(",");
      return {
        date,
        price: Number(rawPrice),
      };
    })
    .filter((row) => row.date && Number.isFinite(row.price) && row.price > 0);
}

async function loadLocalRawSeries(rawFile) {
  const localPath = resolve(rawOutputDir, rawFile);
  await access(localPath);
  const csvText = await readFile(localPath, "utf8");
  const rows = parseRawCsv(csvText);
  if (!rows.length) {
    throw new Error(`Local raw snapshot ${rawFile} did not contain any usable rows.`);
  }
  return rows;
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

function buildDatasetSummary(label, series) {
  try {
    return buildSummary(series);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to build ${label} dataset: ${message}`);
  }
}

const downloaded = await Promise.all(
  SERIES_CONFIG.map(async (config) => {
    let rows;

    try {
      rows = config.sourceType === "bcentral"
        ? await fetchBcentralSeries(config)
        : await fetchYahooSeries(config);
    } catch (error) {
      try {
        rows = await loadLocalRawSeries(config.rawFile);
        const message = error instanceof Error ? error.message : String(error);
        const sourceLabel = config.sourceType === "bcentral" ? config.seriesId : config.ticker;
        console.warn(`Falling back to local snapshot for ${sourceLabel}: ${message}`);
      } catch (fallbackError) {
        const primaryMessage = error instanceof Error ? error.message : String(error);
        const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
        const sourceLabel = config.sourceType === "bcentral" ? config.seriesId : config.ticker;
        throw new Error(`Failed to fetch ${sourceLabel} and no local fallback was usable. Fetch error: ${primaryMessage}. Fallback error: ${fallbackMessage}`);
      }
    }

    const cleanedRows = dropBrokenTailSegment(rows);
    const series = buildSeries(cleanedRows, MIN_YEAR);
    return {
      ...config,
      rows: cleanedRows,
      series,
    };
  }),
);

const payload = {
  generatedAt: new Date().toISOString(),
  oil: {
    key: "oil",
    name: downloaded[0].name,
    unit: downloaded[0].unit,
    sourceName: downloaded[0].sourceName,
    sourceUrl: downloaded[0].sourceUrl,
    rawFile: downloaded[0].rawFile,
    summary: buildDatasetSummary("oil", downloaded[0].series),
    series: downloaded[0].series,
  },
  gold: {
    key: "gold",
    name: downloaded[1].name,
    unit: downloaded[1].unit,
    sourceName: downloaded[1].sourceName,
    sourceUrl: downloaded[1].sourceUrl,
    rawFile: downloaded[1].rawFile,
    summary: buildDatasetSummary("gold", downloaded[1].series),
    series: downloaded[1].series,
  },
  sp500: {
    key: "sp500",
    name: downloaded[2].name,
    unit: downloaded[2].unit,
    sourceName: downloaded[2].sourceName,
    sourceUrl: downloaded[2].sourceUrl,
    rawFile: downloaded[2].rawFile,
    summary: buildDatasetSummary("sp500", downloaded[2].series),
    series: downloaded[2].series,
  },
  ipsa: {
    key: "ipsa",
    name: downloaded[3].name,
    unit: downloaded[3].unit,
    sourceName: downloaded[3].sourceName,
    sourceUrl: downloaded[3].sourceUrl,
    rawFile: downloaded[3].rawFile,
    summary: buildDatasetSummary("ipsa", downloaded[3].series),
    series: downloaded[3].series,
  },
};

await mkdir(outputDir, { recursive: true });
await mkdir(rawOutputDir, { recursive: true });
await Promise.all([
  writeFile(outputFile, JSON.stringify(payload)),
  ...downloaded.map((config) => writeFile(resolve(rawOutputDir, config.rawFile), toRawCsv(config.rows))),
]);

console.log(`Wrote ${outputFile}`);
