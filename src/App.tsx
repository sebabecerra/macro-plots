import { useEffect, useRef, useState } from "react";
import { InlineMath } from "react-katex";
import { toBlob } from "html-to-image";
import CommodityChart from "./components/CommodityChart";
import type { CommodityDataset, CommoditiesPayload } from "./types";

type Locale = "en" | "es";

const accents = {
  oil: "#ffd166",
  gold: "#ffd166",
  sp500: "#ffd166",
  ipsa: "#ffd166",
};

const localizedDatasets = {
  en: {
    oil: { name: "WTI Crude Oil", unit: "USD per barrel" },
    gold: { name: "Gold Futures", unit: "USD per troy ounce" },
    sp500: { name: "S&P 500", unit: "Index level" },
    ipsa: { name: "S&P IPSA", unit: "Index level" },
  },
  es: {
    oil: { name: "Petroleo WTI", unit: "USD por barril" },
    gold: { name: "Futuros del oro", unit: "USD por onza troy" },
    sp500: { name: "S&P 500", unit: "Nivel del indice" },
    ipsa: { name: "S&P IPSA", unit: "Nivel del indice" },
  },
} as const;

const copy = {
  en: {
    loading: "Loading dashboard...",
    loadErrorLead: "Could not load the generated dataset. Run",
    loadErrorTail: "if you need to regenerate it, then start the Vite server.",
    error: "Error",
    methodology: "Methodology:",
    updated: "Updated",
    reload: "Reload dataset",
    reloading: "Reloading...",
    reloadFailed: "Reload failed. Showing the last generated dataset.",
    currentYtd: "YTD",
    asOf: "As of",
    high: "High",
    low: "Low",
    rawData: "Raw data",
    normalizedCsv: "Normalized CSV",
    source: "Source",
    coverage: "Coverage",
    language: "Language",
    methodologyText: "each line represents one calendar year. Here, “normalized” means that the first valid trading observation of the year is used as the common base level, so every subsequent point is shown as the cumulative percentage change relative to that starting value rather than as an absolute price. The x-axis is trading-day count, not calendar date, so the observation on day 40 of one year is directly comparable with day 40 of any other year. The colored line is the current year, while the grey lines represent the empirical distribution of prior-year paths, allowing current performance to be evaluated against the historical range of rallies and drawdowns observed at the same stage of the annual cycle. In the formula,",
    methodologyTextTail: "denotes the observed asset price on trading day",
    methodologyTextTail2: "and",
    methodologyTextTail3: "denotes the first valid trading observation of year",
  },
  es: {
    loading: "Cargando dashboard...",
    loadErrorLead: "No se pudo cargar el dataset generado. Ejecuta",
    loadErrorTail: "si necesitas regenerarlo y luego inicia el servidor de Vite.",
    error: "Error",
    methodology: "Metodologia:",
    updated: "Actualizado",
    reload: "Recargar dataset",
    reloading: "Recargando...",
    reloadFailed: "La recarga fallo. Se muestra el ultimo dataset generado.",
    currentYtd: "YTD",
    asOf: "Al",
    high: "Maximo",
    low: "Minimo",
    rawData: "Datos raw",
    normalizedCsv: "CSV normalizado",
    source: "Fuente",
    coverage: "Cobertura",
    language: "Idioma",
    methodologyText: "cada linea representa un ano calendario. Aqui, “normalizado” significa que la primera observacion valida del ano se usa como nivel base comun, de modo que cada punto posterior se muestra como el cambio porcentual acumulado respecto de ese valor inicial y no como un precio absoluto. El eje x usa conteo de dias de trading, no fecha calendario, por lo que la observacion del dia 40 de un ano es comparable directamente con el dia 40 de cualquier otro ano. La linea destacada corresponde al ano actual, mientras que las lineas grises representan la distribucion empirica de trayectorias de anos previos, permitiendo evaluar el desempeno actual contra el rango historico de rallies y drawdowns observados en esta misma etapa del ciclo anual. En la formula,",
    methodologyTextTail: "denota el precio observado del activo en el dia de trading",
    methodologyTextTail2: "y",
    methodologyTextTail3: "denota la primera observacion valida del ano",
  },
} as const;

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

function formatDate(date: string, locale: Locale) {
  return new Date(`${date}T00:00:00`).toLocaleDateString(locale === "es" ? "es-CL" : "en-US", {
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

async function downloadCardPng(node: HTMLElement, filename: string) {
  const blob = await toBlob(node, {
    cacheBust: true,
    pixelRatio: 2,
    backgroundColor: "#050505",
  });

  if (!blob) {
    throw new Error("Could not render the chart card as an image.");
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function ChartSection({ dataset, locale }: { dataset: CommodityDataset; locale: Locale }) {
  const cardRef = useRef<HTMLElement | null>(null);
  const accent = accents[dataset.key];
  const summary = dataset.summary;
  const labels = copy[locale];
  const datasetLabels = localizedDatasets[locale][dataset.key];
  const currentValue = formatPct(summary.currentChangePct);
  const recordHigh = formatPct(summary.recordHigh?.changePct);
  const recordLow = formatPct(summary.recordLow?.changePct);
  const currentDate = formatDate(summary.currentDate, locale);
  const handleDownloadCard = async () => {
    if (!cardRef.current) return;
    await downloadCardPng(cardRef.current, `${dataset.key}-ytd-card.png`);
  };

  return (
    <section className="panel section-card" ref={cardRef}>
      <div className="section-header">
        <div className="section-heading">
          <div className="section-kicker">{datasetLabels.name}</div>
          <h2>{datasetLabels.name}</h2>
          <p>{datasetLabels.unit}</p>
        </div>
        <div className="section-statline">
          <span>{summary.currentYear} {labels.currentYtd} <strong>{currentValue}</strong></span>
          <span>{labels.asOf} {currentDate}</span>
          <span>{labels.low} {recordLow}</span>
          <span>{labels.high} {recordHigh}</span>
        </div>
        <div className="section-actions">
          <a className="button subtle" href={withBaseUrl(`raw/${dataset.rawFile}`)} download>
            {labels.rawData}
          </a>
          <button className="button" onClick={() => downloadNormalizedCsv(dataset)}>
            {labels.normalizedCsv}
          </button>
          <button className="button" onClick={() => void handleDownloadCard()}>
            ↓
          </button>
        </div>
      </div>

      <CommodityChart dataset={dataset} accent={accent} />

      <div className="section-footer">
        <span>
          {labels.source}: <a href={dataset.sourceUrl} target="_blank" rel="noreferrer">{dataset.sourceName}</a>
        </span>
        <span>{labels.coverage}: {summary.startYear} to {summary.endYear}</span>
      </div>
    </section>
  );
}

export default function App() {
  const [locale, setLocale] = useState<Locale>("es");
  const [data, setData] = useState<CommoditiesPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const labels = copy[locale];

  const loadData = async (forceRefresh = false) => {
    if (forceRefresh && data) {
      setIsRefreshing(true);
      setRefreshError(null);
    } else if (!data) {
      setLoadError(null);
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
      setData(data);
      setLoadError(null);
      setRefreshError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (data) {
        setRefreshError(message);
      } else {
        setLoadError(message);
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  if (!data && !loadError) {
    return <main className="app-shell"><div className="panel status-panel">{labels.loading}</div></main>;
  }

  if (!data && loadError) {
    return (
      <main className="app-shell">
        <div className="panel status-panel">
          {labels.loadErrorLead} <code>npm run build:data</code> {labels.loadErrorTail}
          <br />
          {labels.error}: {loadError}
        </div>
      </main>
    );
  }

  const payload = data!;
  const { oil, gold, sp500, ipsa } = payload;
  const generatedAt = new Date(payload.generatedAt).toLocaleString(locale === "es" ? "es-CL" : "en-US", {
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
            <div className="methodology-meta">
              <span className="methodology-chip">{labels.methodology}</span>
              <span className="generated-at">{labels.updated} {generatedAt}</span>
            </div>
            <div className="methodology-controls">
              <div className="language-switch" aria-label={labels.language}>
                <button className={`button subtle ${locale === "es" ? "active" : ""}`} onClick={() => setLocale("es")} type="button">
                  ES
                </button>
                <button className={`button subtle ${locale === "en" ? "active" : ""}`} onClick={() => setLocale("en")} type="button">
                  EN
                </button>
              </div>
              <button className="button subtle" onClick={() => void loadData(true)} disabled={isRefreshing}>
                {isRefreshing ? labels.reloading : labels.reload}
              </button>
            </div>
          </div>
          {refreshError ? (
            <div className="refresh-warning" role="status">
              {labels.reloadFailed} {labels.error}: {refreshError}
            </div>
          ) : null}
          <span className="methodology-copy">
            {labels.methodologyText} <InlineMath math={"y"} /> {locale === "es" ? "denota ano calendario," : "denotes calendar year,"}{" "}
            <InlineMath math={"d"} /> {locale === "es" ? "denota indice de trading dentro de ese ano," : "denotes trading-day index within that year,"}{" "}
            <InlineMath math={"P(y,d)"} /> {labels.methodologyTextTail} <InlineMath math={"d"} />, {labels.methodologyTextTail2}{" "}
            <InlineMath math={"P(y,1)"} /> {labels.methodologyTextTail3} <InlineMath math={"y"} />.
          </span>
          <div className="formula-inline methodology-formula methodology-formula-break" aria-label="YTD formula">
            <span className="formula-roman">YTD</span>
            <span>(</span>
            <span className="formula-var">y</span>
            <span>, </span>
            <span className="formula-var">d</span>
            <span>) = 100 </span>
            <span className="formula-group">(</span>
            <span className="formula-symbol">P</span>
            <span>(</span>
            <span className="formula-var">y</span>
            <span>, </span>
            <span className="formula-var">d</span>
            <span>) / </span>
            <span className="formula-symbol">P</span>
            <span>(</span>
            <span className="formula-var">y</span>
            <span>, 1) - 1</span>
            <span className="formula-group">)</span>
          </div>
        </div>
      </section>
      <section className="chart-grid">
        <ChartSection dataset={oil} locale={locale} />
        <ChartSection dataset={gold} locale={locale} />
        <ChartSection dataset={sp500} locale={locale} />
        <ChartSection dataset={ipsa} locale={locale} />
      </section>
    </main>
  );
}
