export type CommodityPoint = {
  day: number;
  date: string;
  price: number;
  changePct: number;
};

export type CommodityYearSeries = {
  year: number;
  firstDate: string;
  lastDate: string;
  basePrice: number;
  lastPrice: number;
  points: CommodityPoint[];
};

export type CommoditySummary = {
  startYear: number;
  endYear: number;
  currentYear: number;
  currentDay: number;
  currentChangePct: number | null;
  currentDate: string;
  recordHigh: (CommodityPoint & { year: number }) | null;
  recordLow: (CommodityPoint & { year: number }) | null;
};

export type CommodityDataset = {
  key: "oil" | "gold" | "sp500";
  name: string;
  unit: string;
  sourceName: string;
  sourceUrl: string;
  rawFile: string;
  summary: CommoditySummary;
  series: CommodityYearSeries[];
};

export type CommoditiesPayload = {
  generatedAt: string;
  oil: CommodityDataset;
  gold: CommodityDataset;
  sp500: CommodityDataset;
};
