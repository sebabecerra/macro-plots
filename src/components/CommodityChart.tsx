import { useEffect, useRef } from "react";
import type { EChartsOption } from "echarts";
import { CanvasRenderer } from "echarts/renderers";
import { LineChart } from "echarts/charts";
import {
  GridComponent,
  LegendComponent,
  TooltipComponent,
} from "echarts/components";
import { init, use } from "echarts/core";
import type { EChartsType } from "echarts/core";
import type { CommodityDataset } from "../types";

use([
  CanvasRenderer,
  LineChart,
  GridComponent,
  LegendComponent,
  TooltipComponent,
]);

type Props = {
  dataset: CommodityDataset;
  accent: string;
};

function formatPrice(value: number) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatHoverDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
  });
}

export default function CommodityChart({ dataset, accent }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!ref.current) return;

    const chart: EChartsType = init(ref.current, undefined, { renderer: "canvas" });
    const currentYear = dataset.summary.currentYear;
    const currentSeriesIndex = dataset.series.findIndex((entry) => entry.year === currentYear);
    let lastMouseY = 0;
    let animationFrame = 0;
    let animationTimeout: number | undefined;

    const allSeriesData = dataset.series.map((entry) =>
      entry.points.map((point) => [point.day, point.changePct, point.date, point.price]),
    );

    const option: EChartsOption = {
      animation: false,
      backgroundColor: "transparent",
      grid: { left: 50, right: 14, top: 28, bottom: 30 },
      legend: {
        top: 14,
        left: 8,
        itemWidth: 16,
        itemHeight: 2,
        textStyle: { color: accent, fontFamily: "Arial, Helvetica, sans-serif", fontSize: 10, fontWeight: 700 },
        data: [String(currentYear)],
      },
      tooltip: {
        trigger: "axis",
        axisPointer: {
          type: "line",
          snap: false,
          lineStyle: {
            color: "rgba(255,255,255,0.16)",
            width: 1,
          },
        },
        backgroundColor: "rgba(10, 10, 12, 0.98)",
        borderColor: "rgba(255,255,255,0.18)",
        textStyle: { color: "#f4f4f4", fontFamily: "Arial, Helvetica, sans-serif", fontSize: 10 },
        formatter: (params: unknown) => {
          const items = params as Array<{
            seriesName: string;
            data: [number, number, string, number];
          }>;
          if (!items.length) return "";

          let best = items[0];
          let bestDistance = Number.POSITIVE_INFINITY;

          for (const item of items) {
            const [day, change] = item.data;
            const [, py] = chart.convertToPixel({ xAxisIndex: 0, yAxisIndex: 0 }, [day, change]) as [number, number];
            const distance = Math.abs(py - lastMouseY);
            if (distance < bestDistance) {
              best = item;
              bestDistance = distance;
            }
          }

          const [, , date, price] = best.data;
          return [
            `<strong>${best.seriesName}</strong>`,
            `${formatHoverDate(date)}`,
            `Value ${formatPrice(price)}`,
          ].join("<br/>");
        },
      },
      xAxis: {
        type: "value",
        name: "Trading Days",
        nameLocation: "middle",
        nameGap: 24,
        min: 1,
        max: Math.max(...dataset.series.map((item) => item.points.length)),
        axisLine: { lineStyle: { color: "rgba(255,255,255,0.42)" } },
        axisLabel: { color: "rgba(220,220,220,0.7)", fontFamily: "Arial, Helvetica, sans-serif", fontSize: 10 },
        splitLine: { show: false },
      },
      yAxis: {
        type: "value",
        name: "YTD Change (%)",
        nameLocation: "end",
        nameRotate: 0,
        nameGap: 38,
        nameTextStyle: { color: "rgba(220,220,220,0.68)", fontFamily: "Arial, Helvetica, sans-serif", fontSize: 10 },
        axisLine: { lineStyle: { color: "rgba(255,255,255,0.42)" } },
        axisLabel: {
          color: "rgba(220,220,220,0.7)",
          fontFamily: "Arial, Helvetica, sans-serif",
          fontSize: 10,
          formatter: (value: number) => `${value}%`,
        },
        splitLine: { lineStyle: { color: "rgba(255,255,255,0.09)" } },
      },
      series: dataset.series.map((entry) => {
        const isCurrent = entry.year === currentYear;
        const lineWidth = isCurrent ? 3.25 : 1.1;
        const color = isCurrent ? accent : "rgba(255,255,255,0.22)";
        const fullData = allSeriesData.find((_, index) => dataset.series[index].year === entry.year) ?? [];
        const data = isCurrent ? fullData.slice(0, 1) : fullData;

        return {
          name: String(entry.year),
          type: "line",
          showSymbol: false,
          smooth: false,
          z: isCurrent ? 10 : 2,
          lineStyle: { color, width: lineWidth },
          emphasis: {
            focus: "series",
            lineStyle: { width: isCurrent ? 4 : 2 },
          },
          data,
        };
      }),
    };

    chart.setOption(option);

    if (currentSeriesIndex >= 0) {
      const currentData = allSeriesData[currentSeriesIndex];
      const totalPoints = currentData.length;
      const start = performance.now();
      const duration = 1800;

      const animateCurrentSeries = (now: number) => {
        const progress = Math.min((now - start) / duration, 1);
        const visiblePoints = Math.max(1, Math.ceil(progress * totalPoints));

        chart.setOption({
          series: dataset.series.map((entry, index) => (
            index === currentSeriesIndex
              ? { name: String(entry.year), data: currentData.slice(0, visiblePoints) }
              : { name: String(entry.year) }
          )),
        });

        if (progress < 1) {
          animationFrame = window.requestAnimationFrame(animateCurrentSeries);
        }
      };

      animationTimeout = window.setTimeout(() => {
        animationFrame = window.requestAnimationFrame(animateCurrentSeries);
      }, 80);
    }

    const zr = chart.getZr();
    const handleMouseMove = (event: { offsetY: number }) => {
      lastMouseY = event.offsetY;
    };
    zr.on("mousemove", handleMouseMove);
    const resizeObserver = new ResizeObserver(() => chart.resize());
    resizeObserver.observe(ref.current);

    return () => {
      if (animationTimeout) {
        window.clearTimeout(animationTimeout);
      }
      if (animationFrame) {
        window.cancelAnimationFrame(animationFrame);
      }
      zr.off("mousemove", handleMouseMove);
      resizeObserver.disconnect();
      chart.dispose();
    };
  }, [accent, dataset]);

  return <div className="chart-canvas" ref={ref} />;
}
