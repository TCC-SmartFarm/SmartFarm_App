import React, { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Line,
  Path,
  Rect,
  Stop,
  Text as SvgText,
} from "react-native-svg";
import { colors } from "./colors";
import type { ForecastDay, ForecastSummary, IrrigationSensor, MSSSensorHistoryPoint, SoilMoistureDiagnostics, SoilMoisturePrediction } from "./types";
import type { SensorHistoryPoint } from "./sensorHistoryApi";

const SERIES_COLORS = {
  raw: "#3478D4",
  kalman: "#D94B50",
  rain: "#E9963A",
  grid: "#EDEFE8",
  axis: "#92988F",
};

type ForecastMetric = "precipitation" | "probability" | "et0";

interface IrrigationTrendChartProps {
  /** Raw history fetched from the existing sensor API (used only for the blue series). */
  history: SensorHistoryPoint[];
  /** Kalman-filtered history returned by the Go irrigation MSS. */
  sensorHistory?: MSSSensorHistoryPoint[];
  /** Future projection returned by the Go irrigation MSS. */
  soilPrediction?: SoilMoisturePrediction;
  forecast: ForecastDay[];
  forecastSummary?: ForecastSummary;
  latestSensor?: IrrigationSensor;
  timezone?: string;
  historyLoading?: boolean;
  historyError?: string;
}

interface PlotHistoryPoint {
  timestamp: number;
  raw: number;
}

interface PlotFilteredPoint {
  timestamp: number;
  filtered: number;
}

interface PlotCoordinate {
  x: number;
  y: number;
}

interface SoilForecastPoint {
  timestamp: number;
  hoursAhead: number;
  value: number;
  lower: number;
  upper: number;
}

interface SoilForecastSummary {
  current: number;
  predicted: number;
  change: number;
  trendPerHour: number;
  lower: number;
  upper: number;
  horizonHours: number;
  unit: string;
  trendStatus: string;
  confidenceStatus: string;
  predictionIntervalWidth: number;
  diagnostics: SoilMoistureDiagnostics;
}

function toFiniteNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function timestampSeconds(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value > 1e12 ? value / 1000 : value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed / 1000 : null;
  }
  return null;
}

function dateTimestamp(date: string): number {
  const parsed = new Date(`${date}T12:00:00Z`).getTime();
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function formatTickDate(timestamp: number, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "short",
      timeZone: timezone,
    }).format(new Date(timestamp)).replace(" de ", "/").replace(".", "");
  } catch {
    return new Date(timestamp).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  }
}

function formatNumber(value: number, digits = 1): string {
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: digits });
}

/** Builds the raw blue series from the separate 7-day sensor-history endpoint.
 * The latest raw value supplied by the MSS is authoritative and replaces a
 * nearby duplicate, but no filtering or prediction is performed here.
 */
function normalizeRawHistory(history: SensorHistoryPoint[], latestSensor?: IrrigationSensor, serverHistory: MSSSensorHistoryPoint[] = []): PlotHistoryPoint[] {
  const byTimestamp = new Map<number, number>();
  for (const point of history) {
    if (!Number.isFinite(point.timestamp) || !Number.isFinite(point.soil_moisture)) continue;
    byTimestamp.set(point.timestamp, point.soil_moisture);
  }

  // The Go response includes canonical timestamps and raw values for all the
  // observations it accepted; merge those in to handle timestamp adjustments
  // performed by the MSS and eliminate duplicate samples.
  for (const point of serverHistory) {
    const timestamp = timestampSeconds(point.timestamp);
    const value = toFiniteNumber(point.soil_moisture_raw);
    if (timestamp !== null && value !== null) byTimestamp.set(timestamp, value);
  }

  const latestTimestamp = timestampSeconds(latestSensor?.timestamp);
  const latestRaw = toFiniteNumber(latestSensor?.soil_moisture_raw);
  if (latestTimestamp !== null && latestRaw !== null) {
    let closest: number | null = null;
    let distance = Number.POSITIVE_INFINITY;
    for (const timestamp of byTimestamp.keys()) {
      const currentDistance = Math.abs(timestamp - latestTimestamp);
      if (currentDistance < distance) {
        distance = currentDistance;
        closest = timestamp;
      }
    }
    if (closest !== null && distance <= 180) byTimestamp.delete(closest);
    byTimestamp.set(latestTimestamp, latestRaw);
  }

  return Array.from(byTimestamp.entries())
    .map(([timestamp, raw]) => ({ timestamp, raw }))
    .sort((a, b) => a.timestamp - b.timestamp);
}

/** Uses the filtered series from Go without re-running Kalman in React Native. */
function normalizeFilteredHistory(history: MSSSensorHistoryPoint[] = []): PlotFilteredPoint[] {
  const byTimestamp = new Map<number, number>();
  for (const point of history) {
    const timestamp = timestampSeconds(point.timestamp);
    const value = toFiniteNumber(point.soil_moisture_kalman_filtered);
    if (timestamp !== null && value !== null) byTimestamp.set(timestamp, value);
  }

  return Array.from(byTimestamp.entries())
    .map(([timestamp, filtered]) => ({ timestamp, filtered }))
    .sort((a, b) => a.timestamp - b.timestamp);
}

/** Maps the MSS response projection for rendering only. */
function normalizePrediction(prediction?: SoilMoisturePrediction): SoilForecastPoint[] {
  if (!prediction || !Array.isArray(prediction.points)) return [];
  return prediction.points
    .map((point) => {
      const timestamp = timestampSeconds(point.timestamp);
      const value = toFiniteNumber(point.soil_moisture_predicted);
      const lower = toFiniteNumber(point.lower_bound);
      const upper = toFiniteNumber(point.upper_bound);
      const hoursAhead = toFiniteNumber(point.hours_ahead);
      if (timestamp === null || value === null || lower === null || upper === null || hoursAhead === null) return null;
      return { timestamp, value, lower, upper, hoursAhead };
    })
    .filter((point): point is SoilForecastPoint => point !== null)
    .sort((a, b) => a.timestamp - b.timestamp);
}

/** Reads summary values and diagnostics produced by the Go MSS. No soil state,
 * trend, sensor condition, confidence level, or prediction is inferred here.
 */
function summarizeSoilForecast(
  prediction: SoilMoisturePrediction | undefined,
  forecastPoints: SoilForecastPoint[],
): SoilForecastSummary | null {
  if (!prediction || forecastPoints.length < 2) return null;
  const finalPoint = forecastPoints[forecastPoints.length - 1];
  return {
    current: prediction.current_filtered,
    predicted: prediction.predicted_at_horizon,
    change: prediction.change_from_current,
    trendPerHour: prediction.trend_per_hour,
    lower: finalPoint.lower,
    upper: finalPoint.upper,
    horizonHours: prediction.horizon_hours,
    unit: prediction.unit,
    trendStatus: prediction.trend_status,
    confidenceStatus: prediction.confidence_status,
    predictionIntervalWidth: prediction.prediction_interval_width,
    diagnostics: prediction.diagnostics,
  };
}

function trendStatusLabel(status: string): string {
  switch (status) {
    case "increasing": return "Tendência de alta";
    case "decreasing": return "Tendência de queda";
    case "stable": return "Tendência estável";
    default: return status;
  }
}

function confidenceStatusLabel(status: string): string {
  switch (status) {
    case "high_uncertainty": return "Incerteza elevada";
    case "within_threshold": return "Incerteza dentro do limite";
    case "unavailable": return "Incerteza indisponível";
    default: return status;
  }
}

function isPercentageUnit(unit: string): boolean {
  return unit === "%" || unit.toLowerCase() === "percent" || unit.toLowerCase() === "percentage";
}

function formatSoilValue(value: number, unit: string): string {
  return `${formatNumber(value, 1)}${isPercentageUnit(unit) ? "%" : ""}`;
}

function formatSoilChange(value: number, unit: string): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatNumber(value, 1)} ${isPercentageUnit(unit) ? "p.p." : "unid."}`;
}

function formatSoilTrendRate(value: number, unit: string): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatNumber(value, 2)} ${isPercentageUnit(unit) ? "p.p./h" : "unid./h"}`;
}

function soilScaleLabel(unit: string): string {
  return isPercentageUnit(unit) ? "Umidade do solo (%)" : "Escala do sensor";
}

function makeBandPath(upper: PlotCoordinate[], lower: PlotCoordinate[]): string {
  if (!upper.length || upper.length !== lower.length) return "";
  const lowerReversed = [...lower].reverse();
  const start = smoothPath(upper);
  return `${start} ${lowerReversed.map((point) => `L ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ")} Z`;
}

function smoothPath(points: PlotCoordinate[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let path = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const dx = current.x - previous.x;
    const control = Math.max(0, dx * 0.42);
    path += ` C ${(previous.x + control).toFixed(2)} ${previous.y.toFixed(2)}, ${(current.x - control).toFixed(2)} ${current.y.toFixed(2)}, ${current.x.toFixed(2)} ${current.y.toFixed(2)}`;
  }
  return path;
}

function makeAreaPath(points: PlotCoordinate[], baseline: number): string {
  if (points.length === 0) return "";
  return `${smoothPath(points)} L ${points[points.length - 1].x.toFixed(2)} ${baseline.toFixed(2)} L ${points[0].x.toFixed(2)} ${baseline.toFixed(2)} Z`;
}

function LegendItem({ color, label, kind = "line" }: { color: string; label: string; kind?: "line" | "bar" | "dashed" }) {
  return (
    <View style={styles.legendItem}>
      {kind === "bar" ? (
        <View style={[styles.legendBar, { backgroundColor: color }]} />
      ) : kind === "dashed" ? (
        <View style={styles.legendDashWrap}>
          <View style={[styles.legendDash, { backgroundColor: color }]} />
          <View style={[styles.legendDash, { backgroundColor: color }]} />
          <View style={[styles.legendDash, { backgroundColor: color }]} />
        </View>
      ) : (
        <View style={[styles.legendLine, { backgroundColor: color }]} />
      )}
      <Text style={styles.legendLabel}>{label}</Text>
    </View>
  );
}

function SummaryMetric({ label, value, caption }: { label: string; value: string; caption: string }) {
  return (
    <View style={styles.summaryMetric}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryCaption}>{caption}</Text>
    </View>
  );
}

const FORECAST_OPTIONS: { key: ForecastMetric; label: string; detail: string; glyph: string }[] = [
  { key: "precipitation", label: "Chuva", detail: "mm previstos", glyph: "↓" },
  { key: "probability", label: "Chance", detail: "de chuva", glyph: "%" },
  { key: "et0", label: "ET₀", detail: "mm de referência", glyph: "☼" },
];

export default function IrrigationTrendChart({
  history,
  sensorHistory = [],
  soilPrediction,
  forecast,
  forecastSummary,
  latestSensor,
  timezone = "America/Sao_Paulo",
  historyLoading = false,
  historyError,
}: IrrigationTrendChartProps) {
  const [containerWidth, setContainerWidth] = useState(0);
  const [forecastMetric, setForecastMetric] = useState<ForecastMetric>("precipitation");

  useEffect(() => {
    if (forecastMetric === "et0" && forecastSummary?.et0_available !== true) {
      setForecastMetric("precipitation");
    }
  }, [forecastMetric, forecastSummary?.et0_available]);

  // Raw history is fetched from the existing 7-day sensor endpoint. All filtering
  // and prediction values come from the Go irrigation MSS response.
  const plotHistory = useMemo(
    () => normalizeRawHistory(history, latestSensor, sensorHistory),
    [history, latestSensor, sensorHistory],
  );
  const plotFiltered = useMemo(
    () => normalizeFilteredHistory(sensorHistory),
    [sensorHistory],
  );
  const plotForecast = useMemo(
    () => forecast
      .map((day) => ({
        ...day,
        timestamp: dateTimestamp(day.date),
        precipitation: toFiniteNumber(day.precipitation_mm),
        probability: toFiniteNumber(day.precipitation_probability_percent),
        et0: toFiniteNumber(day.et0_mm),
      }))
      .filter((day) => Number.isFinite(day.timestamp))
      .sort((a, b) => a.timestamp - b.timestamp),
    [forecast],
  );
  const soilForecast = useMemo(() => normalizePrediction(soilPrediction), [soilPrediction]);
  const soilForecastSummary = useMemo(
    () => summarizeSoilForecast(soilPrediction, soilForecast),
    [soilPrediction, soilForecast],
  );

  const allTimes = [
    ...plotHistory.map((point) => point.timestamp * 1000),
    ...plotFiltered.map((point) => point.timestamp * 1000),
    ...plotForecast.map((point) => point.timestamp),
    ...soilForecast.map((point) => point.timestamp * 1000),
  ];
  const chartWidth = containerWidth || 280;
  const chartHeight = 250;
  const margin = { top: 20, right: 33, bottom: 34, left: 33 };
  const plotWidth = Math.max(100, chartWidth - margin.left - margin.right);
  const plotHeight = chartHeight - margin.top - margin.bottom;
  const minTimestamp = allTimes.length ? Math.min(...allTimes) : Date.now() - 86400000;
  let maxTimestamp = allTimes.length ? Math.max(...allTimes) : Date.now();
  if (maxTimestamp - minTimestamp < 3600000) maxTimestamp = minTimestamp + 3600000;
  const timeSpan = maxTimestamp - minTimestamp;
  const xFor = (timestampMs: number) => margin.left + ((timestampMs - minTimestamp) / timeSpan) * plotWidth;

  const maxRaw = Math.max(
    100,
    ...plotHistory.map((point) => point.raw),
    ...plotFiltered.map((point) => point.filtered),
    ...soilForecast.map((point) => point.upper),
  );
  const soilMax = Math.max(100, Math.ceil(maxRaw / 25) * 25);
  const selectedForecastValue = (day: (typeof plotForecast)[number]): number | null => {
    if (forecastMetric === "probability") return day.probability;
    if (forecastMetric === "et0") {
      // Go's v3 summary states whether ET₀ was supplied. A zero daily value can
      // be omitted by the current Go `omitempty` tag, so treat that omission as
      // zero only when the server confirms ET₀ availability for this window.
      return day.et0 ?? (forecastSummary?.et0_available === true ? 0 : null);
    }
    return day.precipitation;
  };
  const availableForecastValues = plotForecast
    .map(selectedForecastValue)
    .filter((value): value is number => value !== null && Number.isFinite(value));
  const maxForecastValue = Math.max(1, ...availableForecastValues);
  const forecastAxisMax = forecastMetric === "probability"
    ? 100
    : forecastMetric === "precipitation"
      ? Math.max(5, Math.ceil(maxForecastValue / 10) * 10)
      : Math.max(1, Math.ceil(maxForecastValue));
  const ySoil = (value: number) => margin.top + plotHeight - (Math.max(0, Math.min(soilMax, value)) / soilMax) * plotHeight;
  const yForecast = (value: number) => margin.top + plotHeight - (Math.max(0, Math.min(forecastAxisMax, value)) / forecastAxisMax) * plotHeight;
  const forecastMetricLabel = forecastMetric === "probability"
    ? "Probabilidade de chuva (%)"
    : forecastMetric === "et0"
      ? "ET₀ de referência (mm)"
      : "Precipitação prevista (mm)";
  const forecastAxisLabel = forecastMetric === "probability" ? "Probabilidade (%)" : forecastMetric === "et0" ? "ET₀ (mm)" : "Chuva (mm)";
  const yFractions = [0, 0.5, 1];
  const rawCoordinates = plotHistory.map((point) => ({ x: xFor(point.timestamp * 1000), y: ySoil(point.raw) }));
  const filteredCoordinates = plotFiltered.map((point) => ({ x: xFor(point.timestamp * 1000), y: ySoil(point.filtered) }));
  const rawPath = smoothPath(rawCoordinates);
  const filteredPath = smoothPath(filteredCoordinates);
  const filteredAreaPath = filteredCoordinates.length > 1 ? makeAreaPath(filteredCoordinates, margin.top + plotHeight) : "";
  const soilForecastCoordinates = soilForecast.map((point) => ({ x: xFor(point.timestamp * 1000), y: ySoil(point.value) }));
  const soilForecastUpperCoordinates = soilForecast.map((point) => ({ x: xFor(point.timestamp * 1000), y: ySoil(point.upper) }));
  const soilForecastLowerCoordinates = soilForecast.map((point) => ({ x: xFor(point.timestamp * 1000), y: ySoil(point.lower) }));
  const soilForecastPath = smoothPath(soilForecastCoordinates);
  const soilForecastBandPath = soilForecast.length > 1 ? makeBandPath(soilForecastUpperCoordinates, soilForecastLowerCoordinates) : "";

  const totalPrecipitation = forecastSummary?.total_precipitation_mm ?? null;
  const daysWithLikelyRain = forecastSummary?.days_with_likely_rain ?? null;
  const totalET0 = forecastSummary?.et0_available ? forecastSummary.total_et0_mm ?? null : null;
  const validReadings = plotHistory.length;
  const lastRawPoint = plotHistory[plotHistory.length - 1];
  const lastFilteredPoint = plotFiltered[plotFiltered.length - 1];
  const projectionMissing = !soilPrediction || soilForecast.length < 2;
  const filteredHistoryMissing = sensorHistory.length === 0;
  const ticks = Math.max(3, Math.min(containerWidth > 520 ? 5 : 4, 5));

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          <Text style={styles.eyebrow}>HISTÓRICO & CLIMA</Text>
          <Text style={styles.title}>Como está evoluindo?</Text>
          <Text style={styles.subtitle}>As leituras do seu sensor e o que o tempo reserva.</Text>
        </View>
        <View style={styles.periodBadge}>
          <Text style={styles.periodBadgeText}>7 dias + clima</Text>
        </View>
      </View>

      <View style={styles.legend}>
        <LegendItem color={SERIES_COLORS.raw} label="Leitura bruta" />
        <LegendItem color={SERIES_COLORS.kalman} label="Kalman histórico · Go" />
        <LegendItem color={SERIES_COLORS.kalman} label={`Projeção ${soilPrediction?.horizon_hours ?? "—"}h · Go`} kind="dashed" />
        <LegendItem color={SERIES_COLORS.rain} label={forecastMetricLabel} kind="bar" />
      </View>

      <View style={styles.forecastMetricArea}>
        <View style={styles.switchHeadingRow}>
          <View style={styles.switchHeadingCopy}>
            <Text style={styles.metricSwitchLabel}>Previsão no gráfico</Text>
            <Text style={styles.metricSwitchHint}>Toque para trocar a informação em laranja</Text>
          </View>
          <View style={styles.tapHint}>
            <Text style={styles.tapHintText}>↔</Text>
            <Text style={styles.tapHintText}>alternar</Text>
          </View>
        </View>
        <View style={styles.metricOptions}>
          {FORECAST_OPTIONS.map((option) => {
            const selected = forecastMetric === option.key;
            return (
              <Pressable
                key={option.key}
                onPress={() => setForecastMetric(option.key)}
                disabled={option.key === "et0" && forecastSummary?.et0_available !== true}
                accessibilityRole="button"
                accessibilityLabel={`Mostrar ${option.label} no gráfico`}
                accessibilityHint="Alterna a variável meteorológica exibida no gráfico"
                accessibilityState={{ selected }}
                hitSlop={3}
                style={({ pressed }: { pressed: boolean }) => [
                  styles.metricOption,
                  selected && styles.metricOptionSelected,
                  option.key === "et0" && forecastSummary?.et0_available !== true && styles.metricOptionDisabled,
                  pressed && styles.metricOptionPressed,
                ]}
              >
                <View style={[styles.metricGlyph, selected && styles.metricGlyphSelected]}>
                  <Text style={[styles.metricGlyphText, selected && styles.metricGlyphTextSelected]}>{option.glyph}</Text>
                </View>
                <View style={styles.metricOptionCopy}>
                  <Text style={[styles.metricOptionTitle, selected && styles.metricOptionTitleSelected, option.key === "et0" && forecastSummary?.et0_available !== true && styles.metricOptionTextDisabled]}>{option.label}</Text>
                  <Text style={[styles.metricOptionDetail, selected && styles.metricOptionDetailSelected, option.key === "et0" && forecastSummary?.et0_available !== true && styles.metricOptionTextDisabled]}>{option.key === "et0" && forecastSummary?.et0_available !== true ? "não disponível" : option.detail}</Text>
                </View>
                <View style={[styles.selectionIndicator, selected && styles.selectionIndicatorSelected]}>
                  {selected ? <Text style={styles.selectionCheck}>✓</Text> : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.chartLabelsRow}>
        <View style={styles.chartLabelGroup}>
          <View style={[styles.chartLabelDot, { backgroundColor: SERIES_COLORS.kalman }]} />
          <Text style={styles.chartLabelText}>{soilScaleLabel(soilPrediction?.unit ?? "sensor_scale")}</Text>
        </View>
        <View style={[styles.chartLabelGroup, styles.chartLabelRight]}>
          <View style={[styles.chartLabelDot, { backgroundColor: SERIES_COLORS.rain }]} />
          <Text style={[styles.chartLabelText, styles.chartLabelTextRight]}>{forecastAxisLabel}</Text>
        </View>
      </View>

      <View
        onLayout={(event: { nativeEvent: { layout: { width: number } } }) => {
          const width = event.nativeEvent.layout.width;
          if (width > 0 && Math.abs(width - containerWidth) > 1) setContainerWidth(width);
        }}
        style={styles.chartContainer}
      >
        {containerWidth > 0 ? (
          <Svg width={chartWidth} height={chartHeight}>
            <Defs>
              <LinearGradient id="kalmanFill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={SERIES_COLORS.kalman} stopOpacity="0.18" />
                <Stop offset="1" stopColor={SERIES_COLORS.kalman} stopOpacity="0.015" />
              </LinearGradient>
            </Defs>

            {yFractions.map((fraction) => {
              const y = margin.top + plotHeight - fraction * plotHeight;
              const soilTick = Math.round(soilMax * fraction);
              const forecastTick = forecastAxisMax * fraction;
              return (
                <React.Fragment key={`grid-${fraction}`}>
                  <Line x1={margin.left} y1={y} x2={margin.left + plotWidth} y2={y} stroke={SERIES_COLORS.grid} strokeWidth={1} />
                  <SvgText x={margin.left - 7} y={y + 3} fill={SERIES_COLORS.axis} fontSize={9} textAnchor="end">{soilTick}</SvgText>
                  <SvgText x={margin.left + plotWidth + 7} y={y + 3} fill={SERIES_COLORS.axis} fontSize={9} textAnchor="start">{formatNumber(forecastTick, forecastMetric === "probability" ? 0 : 1)}</SvgText>
                </React.Fragment>
              );
            })}

            {plotForecast.map((day) => {
              const metricValue = selectedForecastValue(day);
              if (metricValue === null || !Number.isFinite(metricValue)) return null;
              const x = xFor(day.timestamp);
              const barWidth = Math.max(7, Math.min(16, (86400000 * plotWidth / timeSpan) * 0.48));
              const y = yForecast(metricValue);
              const baseline = margin.top + plotHeight;
              const height = Math.max(2, baseline - y);
              return (
                <Rect
                  key={`forecast-${day.date}`}
                  x={x - barWidth / 2}
                  y={baseline - height}
                  width={barWidth}
                  height={height}
                  rx={barWidth / 2}
                  fill={SERIES_COLORS.rain}
                  opacity={forecastMetric === "probability" ? 0.58 : 0.68}
                />
              );
            })}

            {soilForecastBandPath ? (
              <Path d={soilForecastBandPath} fill={SERIES_COLORS.kalman} opacity={0.10} />
            ) : null}

            {filteredAreaPath ? <Path d={filteredAreaPath} fill="url(#kalmanFill)" /> : null}
            {rawCoordinates.length > 1 ? (
              <Path d={rawPath} fill="none" stroke={SERIES_COLORS.raw} strokeWidth={2.1} strokeOpacity={0.82} strokeLinecap="round" strokeLinejoin="round" />
            ) : null}
            {filteredCoordinates.length > 1 ? (
              <Path d={filteredPath} fill="none" stroke={SERIES_COLORS.kalman} strokeWidth={3.1} strokeLinecap="round" strokeLinejoin="round" />
            ) : null}
            {lastRawPoint ? (
              <Circle cx={xFor(lastRawPoint.timestamp * 1000)} cy={ySoil(lastRawPoint.raw)} r={4} fill={colors.white} stroke={SERIES_COLORS.raw} strokeWidth={2} />
            ) : null}
            {lastFilteredPoint ? (
              <Circle cx={xFor(lastFilteredPoint.timestamp * 1000)} cy={ySoil(lastFilteredPoint.filtered)} r={4.5} fill={colors.white} stroke={SERIES_COLORS.kalman} strokeWidth={2.4} />
            ) : null}

            {soilForecastCoordinates.length > 1 ? (
              <>
                <Line
                  x1={soilForecastCoordinates[0].x}
                  y1={margin.top + 2}
                  x2={soilForecastCoordinates[0].x}
                  y2={margin.top + plotHeight}
                  stroke={SERIES_COLORS.kalman}
                  strokeOpacity={0.22}
                  strokeWidth={1}
                  strokeDasharray="3 5"
                />
                <Path
                  d={soilForecastPath}
                  fill="none"
                  stroke={SERIES_COLORS.kalman}
                  strokeWidth={2.8}
                  strokeDasharray="6 5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <Circle
                  cx={soilForecastCoordinates[soilForecastCoordinates.length - 1].x}
                  cy={soilForecastCoordinates[soilForecastCoordinates.length - 1].y}
                  r={4.5}
                  fill={colors.white}
                  stroke={SERIES_COLORS.kalman}
                  strokeWidth={2.5}
                />
                <SvgText
                  x={soilForecastCoordinates[soilForecastCoordinates.length - 1].x - 5}
                  y={Math.max(margin.top + 12, soilForecastCoordinates[soilForecastCoordinates.length - 1].y - 9)}
                  fill={SERIES_COLORS.kalman}
                  fontSize={10}
                  fontWeight="700"
                  textAnchor="end"
                >
                  {formatNumber(soilForecast[soilForecast.length - 1].value, 1)}%
                </SvgText>
              </>
            ) : null}

            {Array.from({ length: ticks }, (_, index) => {
              const fraction = index / (ticks - 1);
              const timestamp = minTimestamp + timeSpan * fraction;
              const x = margin.left + plotWidth * fraction;
              return (
                <SvgText key={`date-${index}`} x={x} y={chartHeight - 10} fill={SERIES_COLORS.axis} fontSize={9} textAnchor="middle">
                  {formatTickDate(timestamp, timezone)}
                </SvgText>
              );
            })}
          </Svg>
        ) : (
          <View style={styles.chartPlaceholder}>
            <View style={styles.placeholderAccent} />
            <Text style={styles.placeholderText}>Preparando seu gráfico…</Text>
          </View>
        )}
      </View>

      {soilForecastSummary ? (
        <View style={styles.projectionCard}>
          <View style={styles.projectionTopRow}>
            <View style={styles.projectionHeadingBlock}>
              <Text style={styles.projectionEyebrow}>ESTIMATIVA DE UMIDADE</Text>
              <Text style={styles.projectionTitle}>Próximas {soilForecastSummary.horizonHours} horas</Text>
            </View>
            <View style={styles.projectionBadges}>
              <View style={[styles.projectionTrendBadge, (soilForecastSummary.diagnostics.persistent_zero || soilForecastSummary.diagnostics.sensor_saturated) && styles.projectionTrendBadgeWarning]}>
                <Text style={[styles.projectionTrendText, (soilForecastSummary.diagnostics.persistent_zero || soilForecastSummary.diagnostics.sensor_saturated) && styles.projectionTrendTextWarning]}>
                  {trendStatusLabel(soilForecastSummary.trendStatus)}
                </Text>
              </View>
              <View style={[styles.projectionConfidenceBadge, soilForecastSummary.confidenceStatus === "high_uncertainty" && styles.projectionTrendBadgeWarning]}>
                <Text style={[styles.projectionConfidenceText, soilForecastSummary.confidenceStatus === "high_uncertainty" && styles.projectionTrendTextWarning]}>
                  {confidenceStatusLabel(soilForecastSummary.confidenceStatus)}
                </Text>
              </View>
            </View>
          </View>
          <Text style={styles.projectionCurrentLabel}>Base filtrada atual pelo MSS: {formatSoilValue(soilForecastSummary.current, soilForecastSummary.unit)}</Text>
          <Text style={styles.projectionCurrentLabel}>Tendência por hora informada pelo MSS: {formatSoilTrendRate(soilForecastSummary.trendPerHour, soilForecastSummary.unit)}</Text>
          <View style={styles.projectionValueRow}>
            <Text style={styles.projectionValue}>{formatSoilValue(soilForecastSummary.predicted, soilForecastSummary.unit)}</Text>
            <View style={styles.projectionDeltaBlock}>
              <Text style={[styles.projectionDelta, soilForecastSummary.change < 0 ? styles.projectionDeltaDown : soilForecastSummary.change > 0 ? styles.projectionDeltaUp : null]}>
                {formatSoilChange(soilForecastSummary.change, soilForecastSummary.unit)}
              </Text>
              <Text style={styles.projectionDeltaCaption}>variação estimada</Text>
            </View>
          </View>
          <View style={styles.projectionRangeRow}>
            <Text style={styles.projectionRangeLabel}>Faixa estimada ao final do período</Text>
            <Text style={styles.projectionRangeValue}>{formatSoilValue(soilForecastSummary.lower, soilForecastSummary.unit)}–{formatSoilValue(soilForecastSummary.upper, soilForecastSummary.unit)}</Text>
          </View>
          {isPercentageUnit(soilForecastSummary.unit) ? (
            <View style={styles.projectionRangeTrack}>
              <View style={[styles.projectionRangeFill, { left: `${soilForecastSummary.lower}%`, width: `${Math.max(1, soilForecastSummary.upper - soilForecastSummary.lower)}%` }]} />
              <View style={[styles.projectionRangeMarker, { left: `${soilForecastSummary.predicted}%` }]} />
            </View>
          ) : null}
          <Text style={styles.projectionRangeLabel}>Largura do intervalo segundo o MSS: {formatSoilValue(soilForecastSummary.predictionIntervalWidth, soilForecastSummary.unit)}</Text>
          {soilForecastSummary.diagnostics.messages.length > 0 ? (
            <View style={styles.diagnosticMessages}>
              {soilForecastSummary.diagnostics.messages.map((message, index) => (
                <Text key={`${index}-${message}`} style={styles.projectionExplanation}>• {message}</Text>
              ))}
            </View>
          ) : (
            <Text style={styles.projectionExplanation}>O MSS não retornou mensagens de diagnóstico para esta projeção.</Text>
          )}
        </View>
      ) : null}

      <View style={styles.dataStatusRow}>
        <View style={styles.dataStatusChip}>
          <View style={[styles.dataStatusDot, { backgroundColor: SERIES_COLORS.kalman }]} />
          <Text style={styles.dataStatusText}>MSS: {sensorHistory.length} leituras históricas</Text>
        </View>
        <View style={styles.dataStatusChip}>
          <View style={[styles.dataStatusDot, { backgroundColor: SERIES_COLORS.kalman }]} />
          <Text style={styles.dataStatusText}>Go: {soilForecast.length} pontos projetados</Text>
        </View>
      </View>

      <View style={styles.chartFooterNote}>
        <View style={styles.footerIndicator} />
        <Text style={styles.chartFooterText}>O filtro e a projeção são calculados pelo microsserviço Go. O app apenas exibe a série histórica, os pontos futuros e a faixa de incerteza retornados pela API.</Text>
      </View>

      {historyLoading ? (
        <View style={styles.infoBox}><Text style={styles.infoText}>Carregando as leituras anteriores do sensor…</Text></View>
      ) : historyError ? (
        <View style={styles.warningBox}>
          <Text style={styles.warningTitle}>Histórico bruto temporariamente indisponível</Text>
          <Text style={styles.warningText}>{historyError} O filtro e a projeção continuam vindo do microsserviço Go, quando presentes na resposta.</Text>
        </View>
      ) : null}

      {!historyLoading && filteredHistoryMissing ? (
        <View style={styles.warningBox}>
          <Text style={styles.warningTitle}>Histórico filtrado indisponível</Text>
          <Text style={styles.warningText}>O campo sensor_history não contém pontos válidos no contrato v3. Confira se o endpoint implantado corresponde à versão atual do Irrigacao-MSS e consulte os logs [Irrigation MSS v3].</Text>
        </View>
      ) : null}
      {!historyLoading && projectionMissing ? (
        <View style={styles.warningBox}>
          <Text style={styles.warningTitle}>Projeção v3 indisponível ou incompleta</Text>
          <Text style={styles.warningText}>O MSS precisa retornar soil_moisture_prediction com metadados, diagnostics e pelo menos dois pontos válidos. O aplicativo não preenche metadados ausentes nem calcula uma projeção local.</Text>
        </View>
      ) : null}

      <View style={styles.summaryGrid}>
        <SummaryMetric label="PONTOS NO GRÁFICO" value={String(validReadings)} caption="Leituras brutas exibidas" />
        <SummaryMetric label="CHUVA ACUMULADA" value={totalPrecipitation == null ? "—" : `${formatNumber(totalPrecipitation, 1)} mm`} caption={forecastSummary ? `Resumo Go · ${forecastSummary.days} dias` : "Resumo não recebido do MSS"} />
        <SummaryMetric label="DIAS COM CHUVA PROVÁVEL" value={daysWithLikelyRain == null ? "—" : String(daysWithLikelyRain)} caption="Contagem calculada no Go" />
        <SummaryMetric label="ET₀ ACUMULADA" value={totalET0 == null ? "—" : `${formatNumber(totalET0, 1)} mm`} caption={forecastSummary?.et0_available ? "Resumo calculado no Go" : "ET₀ indisponível no MSS"} />
      </View>

      <Text style={styles.footnote}>
        O MSS em Go realiza a filtragem e a projeção temporal. Este componente não aplica Kalman nem estima valores futuros no dispositivo.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: "#EAE9E2",
    borderRadius: 26,
    padding: 17,
    marginBottom: 25,
    overflow: "hidden",
    shadowColor: "#25372A",
    shadowOpacity: 0.055,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 7 },
    elevation: 2,
  },
  headerRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 15 },
  headerText: { flex: 1, minWidth: 0, paddingRight: 8 },
  eyebrow: { color: colors.green, fontSize: 10, letterSpacing: 1.45, fontWeight: "900", marginBottom: 7 },
  title: { color: colors.dark, fontSize: 22, fontWeight: "800", letterSpacing: -0.7, marginBottom: 5 },
  subtitle: { color: colors.textSecondary, fontSize: 12, lineHeight: 18 },
  periodBadge: { backgroundColor: colors.greenSoft, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 999, marginTop: 2 },
  periodBadgeText: { color: colors.greenDark, fontSize: 10, fontWeight: "800" },
  legend: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 12, marginBottom: 18, paddingTop: 1 },
  legendItem: { flexDirection: "row", alignItems: "center", marginRight: 3 },
  legendLine: { width: 17, height: 3, borderRadius: 3, marginRight: 6 },
  legendDashWrap: { width: 19, height: 4, flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginRight: 6 },
  legendDash: { width: 4, height: 3, borderRadius: 2 },
  legendBar: { width: 8, height: 12, borderRadius: 5, marginRight: 7 },
  legendLabel: { color: "#5E655D", fontSize: 11, fontWeight: "700" },
  forecastMetricArea: { backgroundColor: "#F7F8F3", borderRadius: 18, padding: 11, marginBottom: 15, borderWidth: 1, borderColor: "#EBEEE6" },
  switchHeadingRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10, paddingHorizontal: 2 },
  switchHeadingCopy: { flex: 1, paddingRight: 8 },
  metricSwitchLabel: { color: colors.dark, fontSize: 12, fontWeight: "800", marginBottom: 3 },
  metricSwitchHint: { color: colors.textSecondary, fontSize: 10, lineHeight: 14 },
  tapHint: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.white, borderWidth: 1, borderColor: "#E5E8DF", paddingHorizontal: 8, paddingVertical: 5, borderRadius: 999 },
  tapHintText: { color: colors.greenDark, fontSize: 9, fontWeight: "800" },
  metricOptions: { flexDirection: "row", gap: 7 },
  metricOption: {
    flex: 1,
    minWidth: 0,
    minHeight: 59,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 9,
    borderRadius: 13,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: "#E3E6DD",
  },
  metricOptionSelected: {
    backgroundColor: colors.greenDark,
    borderColor: colors.greenDark,
    shadowColor: colors.greenDark,
    shadowOpacity: 0.16,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  metricOptionPressed: { opacity: 0.82, transform: [{ scale: 0.98 }] },
  metricOptionDisabled: { opacity: 0.48, backgroundColor: "#F5F5F0" },
  metricOptionTextDisabled: { color: "#8D9288" },
  metricGlyph: { width: 27, height: 27, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: "#F0F3EB", marginRight: 6 },
  metricGlyphSelected: { backgroundColor: "rgba(255,255,255,0.16)" },
  metricGlyphText: { color: colors.greenDark, fontSize: 13, fontWeight: "900" },
  metricGlyphTextSelected: { color: colors.white },
  metricOptionCopy: { flex: 1, minWidth: 0 },
  metricOptionTitle: { color: colors.dark, fontSize: 11, lineHeight: 14, fontWeight: "800" },
  metricOptionTitleSelected: { color: colors.white },
  metricOptionDetail: { color: colors.textSecondary, fontSize: 8, lineHeight: 11, marginTop: 2 },
  metricOptionDetailSelected: { color: "#DCE8DC" },
  selectionIndicator: { width: 14, height: 14, borderRadius: 7, borderWidth: 1, borderColor: "#CDD4C8", marginLeft: 3, alignItems: "center", justifyContent: "center" },
  selectionIndicatorSelected: { backgroundColor: colors.white, borderColor: colors.white },
  selectionCheck: { color: colors.greenDark, fontSize: 9, lineHeight: 11, fontWeight: "900" },
  chartLabelsRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  chartLabelGroup: { flexDirection: "row", alignItems: "center", flexShrink: 1 },
  chartLabelRight: { justifyContent: "flex-end", marginLeft: 8 },
  chartLabelDot: { width: 7, height: 7, borderRadius: 4, marginRight: 6 },
  chartLabelText: { color: colors.textSecondary, fontSize: 10, fontWeight: "700" },
  chartLabelTextRight: { textAlign: "right", flexShrink: 1 },
  chartContainer: { width: "100%", alignItems: "center", minHeight: 250, backgroundColor: "#FCFCF9", borderRadius: 18, overflow: "hidden", paddingVertical: 4 },
  chartPlaceholder: { height: 250, width: "100%", alignItems: "center", justifyContent: "center", backgroundColor: "#FCFCF9", borderRadius: 15 },
  placeholderAccent: { width: 34, height: 4, backgroundColor: colors.green, borderRadius: 9, marginBottom: 11 },
  placeholderText: { color: colors.textSecondary, fontSize: 12, fontWeight: "600" },
  projectionCard: { backgroundColor: "#FFF8F7", borderColor: "#F4DEDD", borderWidth: 1, borderRadius: 18, padding: 14, marginTop: 11, marginBottom: 4 },
  projectionTopRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 },
  projectionHeadingBlock: { flex: 1 },
  projectionBadges: { alignItems: "flex-end", gap: 5, maxWidth: "60%" },
  projectionEyebrow: { color: SERIES_COLORS.kalman, fontSize: 9, fontWeight: "900", letterSpacing: 1.1, marginBottom: 4 },
  projectionTitle: { color: colors.dark, fontSize: 15, fontWeight: "800", letterSpacing: -0.25 },
  projectionTrendBadge: { backgroundColor: "#FBE8E6", borderRadius: 999, paddingHorizontal: 9, paddingVertical: 6, maxWidth: "58%" },
  projectionTrendBadgeWarning: { backgroundColor: "#FFF0D8" },
  projectionTrendText: { color: "#A33F43", fontSize: 9, fontWeight: "800", textAlign: "center" },
  projectionTrendTextWarning: { color: "#835A1C" },
  projectionConfidenceBadge: { backgroundColor: "#EEF1EA", borderRadius: 999, paddingHorizontal: 9, paddingVertical: 6, maxWidth: "100%" },
  projectionConfidenceText: { color: colors.greenDark, fontSize: 9, fontWeight: "800", textAlign: "center" },
  diagnosticMessages: { gap: 5 },
  projectionCurrentLabel: { color: colors.textSecondary, fontSize: 10, lineHeight: 15, marginTop: 12 },
  projectionValueRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8, marginBottom: 12 },
  projectionValue: { color: colors.dark, fontSize: 30, fontWeight: "900", letterSpacing: -1.3 },
  projectionDeltaBlock: { alignItems: "flex-end" },
  projectionDelta: { color: colors.textSecondary, fontSize: 14, fontWeight: "800" },
  projectionDeltaDown: { color: "#B84449" },
  projectionDeltaUp: { color: colors.greenDark },
  projectionDeltaCaption: { color: colors.textSecondary, fontSize: 9, marginTop: 2 },
  projectionRangeRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 7 },
  projectionRangeLabel: { color: colors.textSecondary, fontSize: 9, flex: 1 },
  projectionRangeValue: { color: colors.dark, fontSize: 10, fontWeight: "800" },
  projectionRangeTrack: { height: 6, borderRadius: 999, backgroundColor: "#F0DAD9", overflow: "hidden", position: "relative", marginBottom: 10 },
  projectionRangeFill: { position: "absolute", top: 0, bottom: 0, backgroundColor: "#D94B50", opacity: 0.42, borderRadius: 999 },
  projectionRangeMarker: { position: "absolute", top: -2, width: 3, height: 10, marginLeft: -1.5, backgroundColor: "#A93037", borderRadius: 2 },
  projectionExplanation: { color: "#6C6563", fontSize: 10, lineHeight: 15 },
  dataStatusRow: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 8, marginBottom: 3 },
  dataStatusChip: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#F6F7F2", borderWidth: 1, borderColor: "#E8EBE2", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7 },
  dataStatusDot: { width: 6, height: 6, borderRadius: 3 },
  dataStatusText: { color: colors.textSecondary, fontSize: 9, fontWeight: "700" },
  chartFooterNote: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginTop: 10, marginBottom: 15, paddingHorizontal: 2 },
  footerIndicator: { width: 6, height: 6, borderRadius: 3, backgroundColor: SERIES_COLORS.kalman, marginTop: 5 },
  chartFooterText: { color: colors.textSecondary, fontSize: 10, lineHeight: 15, flex: 1 },
  infoBox: { backgroundColor: "#F0F5EF", borderRadius: 12, padding: 11, marginBottom: 12, borderWidth: 1, borderColor: "#E1EAE0" },
  infoText: { color: colors.greenDark, fontSize: 11, lineHeight: 17 },
  warningBox: { backgroundColor: "#FFF8EE", borderRadius: 12, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: "#F0E2CB" },
  warningTitle: { color: "#815C22", fontSize: 11, fontWeight: "900", marginBottom: 4 },
  warningText: { color: colors.textSecondary, fontSize: 10, lineHeight: 16 },
  summaryGrid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -4 },
  summaryMetric: { flexGrow: 1, flexBasis: 92, minWidth: 82, paddingHorizontal: 10, paddingVertical: 13, borderRadius: 15, backgroundColor: "#F8F9F5", borderWidth: 1, borderColor: "#EDF0E8", marginHorizontal: 4, marginBottom: 7 },
  summaryLabel: { color: colors.textSecondary, fontSize: 8, letterSpacing: 0.35, fontWeight: "900", marginBottom: 7 },
  summaryValue: { color: colors.dark, fontSize: 16, lineHeight: 20, fontWeight: "900", letterSpacing: -0.4, marginBottom: 4 },
  summaryCaption: { color: colors.textSecondary, fontSize: 9, lineHeight: 13 },
  footnote: { color: "#858B82", fontSize: 9, lineHeight: 14, marginTop: 4 },
});
