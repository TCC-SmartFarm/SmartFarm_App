import React, { useMemo, useState } from "react";
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
import type { ForecastDay, IrrigationSensor } from "./types";
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
  history: SensorHistoryPoint[];
  forecast: ForecastDay[];
  latestSensor?: IrrigationSensor;
  timezone?: string;
  kalmanProcessNoise?: number;
  kalmanMeasurementNoise?: number;
  historyLoading?: boolean;
  historyError?: string;
}

interface PlotHistoryPoint {
  timestamp: number;
  raw: number;
  filtered: number;
  serverFiltered?: number;
}

interface PlotCoordinate {
  x: number;
  y: number;
}

interface SoilForecastPoint {
  timestamp: number;
  value: number;
  lower: number;
  upper: number;
}

interface SoilForecastSummary {
  current: number;
  predicted: number;
  change: number;
  lower: number;
  upper: number;
  saturated: boolean;
  trendLabel: string;
  explanation: string;
}

const SOIL_FORECAST_HOURS = 24;
const TREND_DAMPING_HOURS = 6;

function toFiniteNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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

/** Mirrors the univariate Kalman equations documented by the Go service. */
function applyKalman(
  history: SensorHistoryPoint[],
  processNoise: number,
  measurementNoise: number,
  latestSensor?: IrrigationSensor,
): PlotHistoryPoint[] {
  const sorted = history
    .filter((point) => Number.isFinite(point.timestamp) && Number.isFinite(point.soil_moisture))
    .map((point) => ({ timestamp: point.timestamp, raw: point.soil_moisture }))
    .sort((a, b) => a.timestamp - b.timestamp);

  const latestTimestamp = latestSensor?.timestamp ? Date.parse(latestSensor.timestamp) / 1000 : Number.NaN;
  const latestRaw = toFiniteNumber(latestSensor?.soil_moisture_raw);
  const latestFiltered = toFiniteNumber(latestSensor?.soil_moisture_kalman_filtered);
  let authoritativePointIndex = -1;

  if (Number.isFinite(latestTimestamp) && latestRaw !== null) {
    let closestIndex = -1;
    let closestDistance = Number.POSITIVE_INFINITY;
    sorted.forEach((point, index) => {
      const distance = Math.abs(point.timestamp - latestTimestamp);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    });

    if (closestIndex >= 0 && closestDistance <= 180) {
      sorted[closestIndex] = { timestamp: latestTimestamp, raw: latestRaw };
      sorted.sort((a, b) => a.timestamp - b.timestamp);
      authoritativePointIndex = sorted.findIndex((point) => point.timestamp === latestTimestamp);
    } else {
      sorted.push({ timestamp: latestTimestamp, raw: latestRaw });
      sorted.sort((a, b) => a.timestamp - b.timestamp);
      authoritativePointIndex = sorted.findIndex((point) => point.timestamp === latestTimestamp);
    }
  }

  if (sorted.length === 0) return [];

  const q = Number.isFinite(processNoise) && processNoise >= 0 ? processNoise : 1;
  const r = Number.isFinite(measurementNoise) && measurementNoise > 0 ? measurementNoise : 4;
  let estimate = sorted[0].raw;
  let covariance = r;

  const result: PlotHistoryPoint[] = sorted.map((point, index) => {
    if (index === 0) {
      estimate = point.raw;
    } else {
      const predictedCovariance = covariance + q;
      const gain = predictedCovariance / (predictedCovariance + r);
      estimate = estimate + gain * (point.raw - estimate);
      covariance = (1 - gain) * predictedCovariance;
    }
    return { timestamp: point.timestamp, raw: point.raw, filtered: estimate };
  });

  // The backend is authoritative for the current filtered value.
  if (authoritativePointIndex >= 0 && latestFiltered !== null) {
    result[authoritativePointIndex].serverFiltered = latestFiltered;
    result[authoritativePointIndex].filtered = latestFiltered;
  }

  return result;
}

/**
 * Trend-aware 2-state Kalman model for short-term soil-moisture projection.
 * State = [moisture level, moisture slope in percentage-points/hour].
 * The slope is damped over time so a short sensor fluctuation is not
 * extrapolated linearly for an entire day. The current level is anchored to
 * the scalar value returned by the Go API; the trend is inferred from history.
 */
function forecastSoilMoisture(
  history: PlotHistoryPoint[],
  processNoise: number,
  measurementNoise: number,
  authoritativeCurrent?: number | null,
  horizonHours = SOIL_FORECAST_HOURS,
): SoilForecastPoint[] {
  const data = history
    .filter((point) => Number.isFinite(point.timestamp) && Number.isFinite(point.raw))
    .slice()
    .sort((a, b) => a.timestamp - b.timestamp);
  if (!data.length) return [];

  const q = Number.isFinite(processNoise) && processNoise >= 0 ? processNoise : 1;
  const r = Number.isFinite(measurementNoise) && measurementNoise > 0 ? measurementNoise : 4;

  let level = data[0].raw;
  let slope = 0;
  let p00 = r;
  let p01 = 0;
  let p10 = 0;
  let p11 = 4; // Initial uncertainty in the slope (percentage-points/hour).
  let previousTimestamp = data[0].timestamp;

  const predictState = (dtHours: number) => {
    const dt = Math.max(1 / 3600, Math.min(24, dtHours));
    const decay = Math.exp(-dt / TREND_DAMPING_HOURS);
    const trendIntegral = TREND_DAMPING_HOURS * (1 - decay);
    const predictedLevel = level + trendIntegral * slope;
    const predictedSlope = decay * slope;

    // Covariance propagation for F=[[1,a],[0,phi]], plus process noise.
    const qLevel = q * dt;
    const qSlope = q * 0.01 * dt;
    const nextP00 = p00 + trendIntegral * (p01 + p10) + trendIntegral * trendIntegral * p11 + qLevel;
    const nextP01 = decay * (p01 + trendIntegral * p11);
    const nextP10 = decay * (p10 + trendIntegral * p11);
    const nextP11 = decay * decay * p11 + qSlope;
    return { dt, decay, trendIntegral, predictedLevel, predictedSlope, p00: nextP00, p01: nextP01, p10: nextP10, p11: nextP11 };
  };

  for (let index = 1; index < data.length; index += 1) {
    const point = data[index];
    const dtHours = (point.timestamp - previousTimestamp) / 3600;
    if (!Number.isFinite(dtHours) || dtHours <= 0) continue;

    const predicted = predictState(dtHours);
    const innovation = point.raw - predicted.predictedLevel;
    const innovationVariance = predicted.p00 + r;
    const k0 = predicted.p00 / innovationVariance;
    const k1 = predicted.p10 / innovationVariance;

    level = predicted.predictedLevel + k0 * innovation;
    slope = predicted.predictedSlope + k1 * innovation;

    p00 = Math.max(1e-6, (1 - k0) * predicted.p00);
    p01 = (1 - k0) * predicted.p01;
    p10 = predicted.p10 - k1 * predicted.p00;
    p11 = Math.max(1e-6, predicted.p11 - k1 * predicted.p01);
    // Numerical symmetry keeps the 2x2 covariance stable.
    const cross = (p01 + p10) / 2;
    p01 = cross;
    p10 = cross;
    previousTimestamp = point.timestamp;
  }

  const currentTimestamp = data[data.length - 1].timestamp;
  const currentLevel = typeof authoritativeCurrent === "number" && Number.isFinite(authoritativeCurrent)
    ? authoritativeCurrent
    : level;
  level = currentLevel;

  const currentSigma = Math.sqrt(Math.max(0, p00));
  const output: SoilForecastPoint[] = [{
    timestamp: currentTimestamp,
    value: clampMoisture(currentLevel),
    lower: clampMoisture(currentLevel - 1.96 * currentSigma),
    upper: clampMoisture(currentLevel + 1.96 * currentSigma),
  }];

  for (let hour = 1; hour <= horizonHours; hour += 1) {
    const predicted = predictState(1);
    level = predicted.predictedLevel;
    slope = predicted.predictedSlope;
    p00 = Math.max(1e-6, predicted.p00);
    p01 = predicted.p01;
    p10 = predicted.p10;
    p11 = Math.max(1e-6, predicted.p11);
    const sigma = Math.sqrt(p00);
    output.push({
      timestamp: currentTimestamp + hour * 3600,
      value: clampMoisture(level),
      lower: clampMoisture(level - 1.96 * sigma),
      upper: clampMoisture(level + 1.96 * sigma),
    });
  }
  return output;
}

function clampMoisture(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function summarizeSoilForecast(
  history: PlotHistoryPoint[],
  forecast: SoilForecastPoint[],
): SoilForecastSummary | null {
  if (!history.length || forecast.length < 2) return null;
  const currentPoint = forecast[0];
  const predictedPoint = forecast[forecast.length - 1];
  const recent = history.slice(-Math.min(12, history.length));
  const saturatedCount = recent.filter((point) => point.raw >= 99.5).length;
  const saturated = currentPoint.value >= 99.5 && recent.length >= 3 && saturatedCount / recent.length >= 0.7;
  const change = predictedPoint.value - currentPoint.value;

  let trendLabel = "Tendência estável";
  if (change <= -1.5) trendLabel = "Tendência de queda";
  else if (change >= 1.5) trendLabel = "Tendência de alta";
  if (saturated) trendLabel = "Sensor no limite superior";

  let explanation = `Projeção de tendência para as próximas ${SOIL_FORECAST_HOURS} horas, com incerteza crescente ao longo do horizonte.`;
  if (saturated) {
    explanation = "As leituras recentes estão próximas de 100%. Como o sensor não registra uma queda mensurável, a projeção permanece no limite superior e não estima quando o solo começará a secar.";
  } else if (history.length < 4) {
    explanation = "Há poucas leituras para identificar uma tendência confiável. A projeção deve ser tratada como preliminar.";
  } else if (Math.abs(change) < 1.5) {
    explanation = "O histórico recente não apresenta uma tendência consistente de alta ou queda; o modelo projeta estabilidade no curto prazo.";
  }

  return {
    current: currentPoint.value,
    predicted: predictedPoint.value,
    change,
    lower: predictedPoint.lower,
    upper: predictedPoint.upper,
    saturated,
    trendLabel,
    explanation,
  };
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
  forecast,
  latestSensor,
  timezone = "America/Sao_Paulo",
  kalmanProcessNoise = 1,
  kalmanMeasurementNoise = 4,
  historyLoading = false,
  historyError,
}: IrrigationTrendChartProps) {
  const [containerWidth, setContainerWidth] = useState(0);
  const [forecastMetric, setForecastMetric] = useState<ForecastMetric>("precipitation");
  const plotHistory = useMemo(
    () => applyKalman(history, kalmanProcessNoise, kalmanMeasurementNoise, latestSensor),
    [history, kalmanProcessNoise, kalmanMeasurementNoise, latestSensor],
  );
  const plotForecast = useMemo(
    () => forecast
      .map((day) => ({
        ...day,
        timestamp: dateTimestamp(day.date),
        precipitation: toFiniteNumber(day.precipitation_mm) ?? 0,
      }))
      .filter((day) => Number.isFinite(day.timestamp))
      .sort((a, b) => a.timestamp - b.timestamp),
    [forecast],
  );
  const soilForecast = useMemo(() => {
    const last = plotHistory[plotHistory.length - 1];
    return forecastSoilMoisture(
      plotHistory,
      kalmanProcessNoise,
      kalmanMeasurementNoise,
      last?.filtered ?? null,
      SOIL_FORECAST_HOURS,
    );
  }, [plotHistory, kalmanProcessNoise, kalmanMeasurementNoise]);
  const soilForecastSummary = useMemo(
    () => summarizeSoilForecast(plotHistory, soilForecast),
    [plotHistory, soilForecast],
  );

  const allTimes = [
    ...plotHistory.map((point) => point.timestamp * 1000),
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
    ...plotHistory.map((point) => Math.max(point.raw, point.filtered)),
    ...soilForecast.map((point) => point.upper),
  );
  const soilMax = Math.max(100, Math.ceil(maxRaw / 25) * 25);
  const selectedForecastValue = (day: (typeof plotForecast)[number]) => {
    if (forecastMetric === "probability") return toFiniteNumber(day.precipitation_probability_percent) ?? 0;
    if (forecastMetric === "et0") return toFiniteNumber(day.et0_mm) ?? 0;
    return day.precipitation;
  };
  const maxForecastValue = Math.max(1, ...plotForecast.map(selectedForecastValue));
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
  const filteredCoordinates = plotHistory.map((point) => ({ x: xFor(point.timestamp * 1000), y: ySoil(point.filtered) }));
  const rawPath = smoothPath(rawCoordinates);
  const filteredPath = smoothPath(filteredCoordinates);
  const filteredAreaPath = makeAreaPath(filteredCoordinates, margin.top + plotHeight);
  const soilForecastCoordinates = soilForecast.map((point) => ({ x: xFor(point.timestamp * 1000), y: ySoil(point.value) }));
  const soilForecastUpperCoordinates = soilForecast.map((point) => ({ x: xFor(point.timestamp * 1000), y: ySoil(point.upper) }));
  const soilForecastLowerCoordinates = soilForecast.map((point) => ({ x: xFor(point.timestamp * 1000), y: ySoil(point.lower) }));
  const soilForecastPath = smoothPath(soilForecastCoordinates);
  const soilForecastBandPath = makeBandPath(soilForecastUpperCoordinates, soilForecastLowerCoordinates);

  const accumulatedRain = plotForecast.reduce((sum, day) => sum + Math.max(0, day.precipitation), 0);
  const validReadings = plotHistory.length;
  const lastPoint = plotHistory[plotHistory.length - 1];
  const forecastDays = plotForecast.length;
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
        <LegendItem color={SERIES_COLORS.kalman} label="Kalman histórico" />
        <LegendItem color={SERIES_COLORS.kalman} label="Projeção 24h" kind="dashed" />
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
                accessibilityRole="button"
                accessibilityLabel={`Mostrar ${option.label} no gráfico`}
                accessibilityHint="Alterna a variável meteorológica exibida no gráfico"
                accessibilityState={{ selected }}
                hitSlop={3}
                style={({ pressed }) => [
                  styles.metricOption,
                  selected && styles.metricOptionSelected,
                  pressed && styles.metricOptionPressed,
                ]}
              >
                <View style={[styles.metricGlyph, selected && styles.metricGlyphSelected]}>
                  <Text style={[styles.metricGlyphText, selected && styles.metricGlyphTextSelected]}>{option.glyph}</Text>
                </View>
                <View style={styles.metricOptionCopy}>
                  <Text style={[styles.metricOptionTitle, selected && styles.metricOptionTitleSelected]}>{option.label}</Text>
                  <Text style={[styles.metricOptionDetail, selected && styles.metricOptionDetailSelected]}>{option.detail}</Text>
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
          <Text style={styles.chartLabelText}>Umidade do solo (%)</Text>
        </View>
        <View style={[styles.chartLabelGroup, styles.chartLabelRight]}>
          <View style={[styles.chartLabelDot, { backgroundColor: SERIES_COLORS.rain }]} />
          <Text style={[styles.chartLabelText, styles.chartLabelTextRight]}>{forecastAxisLabel}</Text>
        </View>
      </View>

      <View
        onLayout={(event) => {
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
              const x = xFor(day.timestamp);
              const barWidth = Math.max(7, Math.min(16, (86400000 * plotWidth / timeSpan) * 0.48));
              const metricValue = selectedForecastValue(day);
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

            {plotHistory.length > 1 ? (
              <>
                <Path d={filteredAreaPath} fill="url(#kalmanFill)" />
                <Path d={rawPath} fill="none" stroke={SERIES_COLORS.raw} strokeWidth={2.1} strokeOpacity={0.82} strokeLinecap="round" strokeLinejoin="round" />
                <Path d={filteredPath} fill="none" stroke={SERIES_COLORS.kalman} strokeWidth={3.1} strokeLinecap="round" strokeLinejoin="round" />
                {lastPoint ? (
                  <>
                    <Circle cx={xFor(lastPoint.timestamp * 1000)} cy={ySoil(lastPoint.raw)} r={4} fill={colors.white} stroke={SERIES_COLORS.raw} strokeWidth={2} />
                    <Circle cx={xFor(lastPoint.timestamp * 1000)} cy={ySoil(lastPoint.filtered)} r={4.5} fill={colors.white} stroke={SERIES_COLORS.kalman} strokeWidth={2.4} />
                  </>
                ) : null}
              </>
            ) : plotHistory.length === 1 ? (
              <>
                <Circle cx={rawCoordinates[0].x} cy={rawCoordinates[0].y} r={4} fill={colors.white} stroke={SERIES_COLORS.raw} strokeWidth={2} />
                <Circle cx={filteredCoordinates[0].x} cy={filteredCoordinates[0].y} r={4.5} fill={colors.white} stroke={SERIES_COLORS.kalman} strokeWidth={2.4} />
              </>
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
              <Text style={styles.projectionTitle}>Próximas 24 horas</Text>
            </View>
            <View style={[styles.projectionTrendBadge, soilForecastSummary.saturated && styles.projectionTrendBadgeWarning]}>
              <Text style={[styles.projectionTrendText, soilForecastSummary.saturated && styles.projectionTrendTextWarning]}>
                {soilForecastSummary.trendLabel}
              </Text>
            </View>
          </View>
          <View style={styles.projectionValueRow}>
            <Text style={styles.projectionValue}>{formatNumber(soilForecastSummary.predicted, 1)}%</Text>
            <View style={styles.projectionDeltaBlock}>
              <Text style={[styles.projectionDelta, soilForecastSummary.change < -0.1 ? styles.projectionDeltaDown : soilForecastSummary.change > 0.1 ? styles.projectionDeltaUp : null]}>
                {soilForecastSummary.change > 0.1 ? "+" : ""}{formatNumber(soilForecastSummary.change, 1)} p.p.
              </Text>
              <Text style={styles.projectionDeltaCaption}>variação estimada</Text>
            </View>
          </View>
          <View style={styles.projectionRangeRow}>
            <Text style={styles.projectionRangeLabel}>Faixa estimada ao final do período</Text>
            <Text style={styles.projectionRangeValue}>{formatNumber(soilForecastSummary.lower, 1)}–{formatNumber(soilForecastSummary.upper, 1)}%</Text>
          </View>
          <View style={styles.projectionRangeTrack}>
            <View style={[styles.projectionRangeFill, { left: `${soilForecastSummary.lower}%`, width: `${Math.max(1, soilForecastSummary.upper - soilForecastSummary.lower)}%` }]} />
            <View style={[styles.projectionRangeMarker, { left: `${soilForecastSummary.predicted}%` }]} />
          </View>
          <Text style={styles.projectionExplanation}>{soilForecastSummary.explanation}</Text>
        </View>
      ) : null}

      <View style={styles.chartFooterNote}>
        <View style={styles.footerIndicator} />
        <Text style={styles.chartFooterText}>A linha vermelha contínua mostra o nível filtrado. A linha tracejada projeta a tendência de curto prazo; a faixa rosa representa a incerteza do modelo, não uma garantia.</Text>
      </View>

      {historyLoading ? (
        <View style={styles.infoBox}><Text style={styles.infoText}>Carregando as leituras anteriores do sensor…</Text></View>
      ) : historyError ? (
        <View style={styles.warningBox}>
          <Text style={styles.warningTitle}>Histórico temporariamente indisponível</Text>
          <Text style={styles.warningText}>{historyError} A recomendação e a previsão continuam disponíveis quando recebidas pela API.</Text>
        </View>
      ) : null}

      <View style={styles.summaryGrid}>
        <SummaryMetric label="PONTOS NO HISTÓRICO" value={String(validReadings)} caption="Leituras exibidas" />
        <SummaryMetric label="CHUVA PREVISTA" value={`${formatNumber(accumulatedRain, 1)} mm`} caption={`Próximos ${forecastDays} dias`} />
        <SummaryMetric label="UMIDADE FILTRADA" value={lastPoint ? `${formatNumber(lastPoint.filtered, 1)}%` : "—"} caption="Última estimativa" />
      </View>

      <Text style={styles.footnote}>
        Q={formatNumber(kalmanProcessNoise, 2)} e R={formatNumber(kalmanMeasurementNoise, 2)} são os parâmetros-base do filtro histórico e da projeção; a projeção usa um modelo temporal de nível + tendência.
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
  projectionEyebrow: { color: SERIES_COLORS.kalman, fontSize: 9, fontWeight: "900", letterSpacing: 1.1, marginBottom: 4 },
  projectionTitle: { color: colors.dark, fontSize: 15, fontWeight: "800", letterSpacing: -0.25 },
  projectionTrendBadge: { backgroundColor: "#FBE8E6", borderRadius: 999, paddingHorizontal: 9, paddingVertical: 6, maxWidth: "58%" },
  projectionTrendBadgeWarning: { backgroundColor: "#FFF0D8" },
  projectionTrendText: { color: "#A33F43", fontSize: 9, fontWeight: "800", textAlign: "center" },
  projectionTrendTextWarning: { color: "#835A1C" },
  projectionValueRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12, marginBottom: 12 },
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
