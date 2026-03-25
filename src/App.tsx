import { useEffect, useState } from "react";
import { InlineMath } from "react-katex";
import CommodityChart from "./components/CommodityChart";
import type { CommodityDataset, CommoditiesPayload } from "./types";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: CommoditiesPayload };

const accents = {
  oil: "#ffd166",
  gold: "#ffd166",
  sp500: "#ffd166",
};

function withBaseUrl(path: string) {
  const base = import.meta.env.BASE_URL.endsWith("/")
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`;
  return `${base}${path.replace(/^\//, "")}`;
}

function formatPct(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "N/A";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function formatDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function downloadNormalizedCsv(dataset: CommodityDataset) {
  const rows = ["year,day,date,price,change_pct"];
  dataset.series.forEach((entry) => {
    entry.points.forEach((point) => {
      rows.push([entry.year, point.day, point.date, point.price, point.changePct].join(","));
    });
  });

  const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${dataset.key}-normalized-ytd.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function ChartSection({ dataset }: { dataset: CommodityDataset }) {
  const accent = accents[dataset.key];
  const summary = dataset.summary;
  const currentValue = formatPct(summary.currentChangePct);
  const recordHigh = formatPct(summary.recordHigh?.changePct);
  const recordLow = formatPct(summary.recordLow?.changePct);
  const currentDate = formatDate(summary.currentDate);

  return (
    <section className="panel section-card">
      <div className="section-header">
        <div className="section-heading">
          <div className="section-kicker">{dataset.name}</div>
          <h2>{dataset.name}</h2>
          <p>{dataset.unit}</p>
        </div>
        <div className="section-statline">
          <span>{summary.currentYear} YTD <strong>{currentValue}</strong></span>
          <span>As of {currentDate}</span>
          <span>High {recordHigh}</span>
          <span>Low {recordLow}</span>
        </div>
        <div className="section-actions">
          <a className="button subtle" href={withBaseUrl(`raw/${dataset.rawFile}`)} download>
            Raw data
          </a>
          <button className="button" onClick={() => downloadNormalizedCsv(dataset)}>
            Normalized CSV
          </button>
        </div>
      </div>

      <CommodityChart dataset={dataset} accent={accent} />

      <div className="section-footer">
        <span>
          Source: <a href={dataset.sourceUrl} target="_blank" rel="noreferrer">{dataset.sourceName}</a>
        </span>
        <span>Coverage: {summary.startYear} to {summary.endYear}</span>
      </div>
    </section>
  );
}

export default function App() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadData = async (forceRefresh = false) => {
    if (state.status === "ready") {
      setIsRefreshing(true);
    }

    try {
      const url = new URL(withBaseUrl("data/commodities.json"), window.location.origin);
      if (forceRefresh) {
        url.searchParams.set("t", String(Date.now()));
      }

      const response = await fetch(url.toString(), {
        cache: forceRefresh ? "no-store" : "default",
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json() as CommoditiesPayload;
      setState({ status: "ready", data });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setState({ status: "error", message });
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  if (state.status === "loading") {
    return <main className="app-shell"><div className="panel status-panel">Loading dashboard...</div></main>;
  }

  if (state.status === "error") {
    return (
      <main className="app-shell">
        <div className="panel status-panel">
          Could not load the generated dataset. Run <code>npm run build:data</code> and then start the Vite server.
          <br />
          Error: {state.message}
        </div>
      </main>
    );
  }

  const { oil, gold, sp500 } = state.data;
  const generatedAt = new Date(state.data.generatedAt).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });

  return (
    <main className="app-shell">
      <section className="panel methodology-card">
        <div className="methodology-inline">
          <div className="methodology-topline">
            <span className="methodology-chip">Methodology:</span>
            <div className="methodology-controls">
              <span className="generated-at">Updated {generatedAt}</span>
              <button className="button subtle" onClick={() => void loadData(true)} disabled={isRefreshing}>
                {isRefreshing ? "Updating..." : "Update"}
              </button>
            </div>
          </div>
          <span className="methodology-copy">
            each line represents one calendar year. Here, “normalized” means that the first valid trading observation of
            the year is used as the common base level, so every subsequent point is shown as the cumulative percentage
            change relative to that starting value rather than as an absolute price. The x-axis is trading-day count, not
            calendar date, so the observation on day 40 of one year is directly comparable with day 40 of any other year.
            The colored line is the current year, while the grey lines represent the empirical distribution of prior-year
            paths, allowing current performance to be evaluated against the historical range of rallies and drawdowns
            observed at the same stage of the annual cycle. In the formula, <InlineMath math={"y"} /> denotes calendar
            year, <InlineMath math={"d"} /> denotes trading-day index within that year, <InlineMath math={"P(y,d)"} />
            {" "}denotes the observed asset price on trading day <InlineMath math={"d"} />, and{" "}
            <InlineMath math={"P(y,1)"} /> denotes the first valid trading observation of year <InlineMath math={"y"} />.
          </span>
          <div className="formula-inline methodology-formula methodology-formula-break">
            <span>YTD(</span><InlineMath math={"y"} /><span>,</span><InlineMath math={"d"} />
            <span>) = 100 (</span><InlineMath math={"P(y,d)"} /><span> / </span><InlineMath math={"P(y,1)"} />
            <span> - 1)</span>
          </div>
        </div>
      </section>
      <section className="chart-grid">
        <ChartSection dataset={oil} />
        <ChartSection dataset={gold} />
        <ChartSection dataset={sp500} />
      </section>
    </main>
  );
}
