import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ForecastSummary,
  IrrigationDevice,
  IrrigationResponse,
  MSSSensorHistoryPoint,
  SoilMoistureDiagnostics,
  SoilMoisturePrediction,
  SoilMoisturePredictionPoint,
} from "./types";

export interface LoadDevicesOptions {
  supabase: SupabaseClient;
  userId: string;
  profileTable?: string;
  profileUserColumn?: string;
  devicesColumn?: string;
}

const defaultTimezone = "America/Sao_Paulo";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | null {
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string" && value.trim()
      ? Number(value)
      : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeIsoTimestamp(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
  }
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    const milliseconds = value > 1e12 ? value : value * 1000;
    const parsed = new Date(milliseconds);
    return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
  }
  return null;
}

function firstPresent(record: UnknownRecord, keys: string[]): unknown {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) return record[key];
  }
  return undefined;
}

function readNumber(record: UnknownRecord, keys: string[]): number | null {
  return finiteNumber(firstPresent(record, keys));
}

export function getLocalTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || defaultTimezone;
  } catch {
    return defaultTimezone;
  }
}

/**
 * Loads the user's device map from Supabase. Supports both a JSON object keyed by
 * device index and an array of device objects. This is lookup/parsing only; it
 * does not make irrigation decisions.
 */
export async function loadUserDevices({
  supabase,
  userId,
  profileTable = "profiles",
  profileUserColumn = "id",
  devicesColumn = "devices",
}: LoadDevicesOptions): Promise<IrrigationDevice[]> {
  const { data, error } = await supabase
    .from(profileTable)
    .select(devicesColumn)
    .eq(profileUserColumn, userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Não foi possível carregar seus dispositivos: ${error.message}`);
  }

  const row = data as UnknownRecord | null;
  const rawDevices = row?.[devicesColumn];
  const values: unknown[] = Array.isArray(rawDevices)
    ? rawDevices
    : rawDevices && typeof rawDevices === "object"
      ? Object.values(rawDevices as UnknownRecord)
      : [];

  const byEui = new Map<string, IrrigationDevice>();
  for (const value of values) {
    if (!isRecord(value)) continue;
    const rawEui = value.devEUI ?? value.deveui ?? value.dev_eui;
    if (typeof rawEui !== "string" || !rawEui.trim()) continue;

    const devEUI = rawEui.trim();
    const candidateName = value.name ?? value.label ?? value.deviceName ?? value.device_name;
    const name = typeof candidateName === "string" && candidateName.trim()
      ? candidateName.trim()
      : `Sensor ${devEUI.slice(-4).toUpperCase()}`;
    if (!byEui.has(devEUI)) byEui.set(devEUI, { devEUI, name });
  }

  return Array.from(byEui.values()).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

function normalizeMssHistory(value: unknown): MSSSensorHistoryPoint[] {
  if (!Array.isArray(value)) return [];
  const points: MSSSensorHistoryPoint[] = [];

  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const timestamp = normalizeIsoTimestamp(firstPresent(entry, ["timestamp", "time", "date"]));
    const raw = readNumber(entry, ["soil_moisture_raw", "soilMoistureRaw"]);
    const filtered = readNumber(entry, ["soil_moisture_kalman_filtered", "soilMoistureKalmanFiltered"]);
    // Zero is a valid measurement and must be retained.
    if (timestamp === null || raw === null || filtered === null) continue;
    points.push({ timestamp, soil_moisture_raw: raw, soil_moisture_kalman_filtered: filtered });
  }

  return points.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
}

function normalizePredictionPoint(value: unknown): SoilMoisturePredictionPoint | null {
  if (!isRecord(value)) return null;
  const timestamp = normalizeIsoTimestamp(value.timestamp);
  const hoursAhead = finiteNumber(value.hours_ahead);
  const predicted = finiteNumber(value.soil_moisture_predicted);
  const lower = finiteNumber(value.lower_bound);
  const upper = finiteNumber(value.upper_bound);
  if (timestamp === null || hoursAhead === null || predicted === null || lower === null || upper === null) return null;
  return {
    timestamp,
    hours_ahead: hoursAhead,
    soil_moisture_predicted: predicted,
    lower_bound: lower,
    upper_bound: upper,
  };
}

function normalizeDiagnostics(value: unknown): SoilMoistureDiagnostics | null {
  if (!isRecord(value)) return null;
  const { persistent_zero, sensor_saturated, messages } = value;
  const consecutiveNearZero = finiteNumber(value.consecutive_near_zero);
  const consecutiveNearMaximum = finiteNumber(value.consecutive_near_maximum);
  const requiredSamples = finiteNumber(value.required_consecutive_samples);
  if (typeof persistent_zero !== "boolean" || typeof sensor_saturated !== "boolean") return null;
  if (consecutiveNearZero === null || consecutiveNearMaximum === null || requiredSamples === null) return null;
  if (!Array.isArray(messages) || !messages.every((message) => typeof message === "string")) return null;

  return {
    persistent_zero,
    sensor_saturated,
    consecutive_near_zero: consecutiveNearZero,
    consecutive_near_maximum: consecutiveNearMaximum,
    required_consecutive_samples: requiredSamples,
    messages: messages as string[],
  };
}

/**
 * Strictly normalizes the v3 contract. It intentionally does not derive trend,
 * interval confidence, diagnostics, summary metrics or the endpoint value from
 * the plotted points. Those values are business outputs of the Go MSS.
 */
function normalizePrediction(value: unknown): SoilMoisturePrediction | undefined {
  if (!isRecord(value)) return undefined;
  const timestamp = normalizeIsoTimestamp(value.base_timestamp);
  const horizon = finiteNumber(value.horizon_hours);
  const step = finiteNumber(value.step_minutes);
  const current = finiteNumber(value.current_filtered);
  const trend = finiteNumber(value.trend_per_hour);
  const predicted = finiteNumber(value.predicted_at_horizon);
  const change = finiteNumber(value.change_from_current);
  const intervalWidth = finiteNumber(value.prediction_interval_width);
  const pointsValue = value.points;
  const diagnostics = normalizeDiagnostics(value.diagnostics);

  if (typeof value.model !== "string" || typeof value.unit !== "string" || timestamp === null) return undefined;
  if (horizon === null || step === null || current === null || trend === null || predicted === null || change === null || intervalWidth === null) return undefined;
  if (typeof value.trend_status !== "string" || typeof value.confidence_status !== "string" || diagnostics === null) return undefined;
  if (!Array.isArray(pointsValue)) return undefined;

  const points = pointsValue.map(normalizePredictionPoint).filter((point): point is SoilMoisturePredictionPoint => point !== null)
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  if (points.length < 2) return undefined;

  return {
    model: value.model,
    unit: value.unit,
    base_timestamp: timestamp,
    horizon_hours: horizon,
    step_minutes: step,
    current_filtered: current,
    trend_per_hour: trend,
    trend_status: value.trend_status,
    predicted_at_horizon: predicted,
    change_from_current: change,
    prediction_interval_width: intervalWidth,
    confidence_status: value.confidence_status,
    diagnostics,
    points,
  };
}

function normalizeForecastSummary(value: unknown): ForecastSummary | undefined {
  if (!isRecord(value)) return undefined;
  const days = finiteNumber(value.days);
  const totalPrecipitation = finiteNumber(value.total_precipitation_mm);
  const maxProbability = finiteNumber(value.max_precipitation_probability_percent);
  const daysWithRain = finiteNumber(value.days_with_likely_rain);
  if (days === null || totalPrecipitation === null || maxProbability === null || daysWithRain === null || typeof value.et0_available !== "boolean") {
    return undefined;
  }
  const totalET0 = value.total_et0_mm == null ? null : finiteNumber(value.total_et0_mm);
  if (value.total_et0_mm != null && totalET0 === null) return undefined;
  return {
    days,
    total_precipitation_mm: totalPrecipitation,
    max_precipitation_probability_percent: maxProbability,
    days_with_likely_rain: daysWithRain,
    et0_available: value.et0_available,
    total_et0_mm: totalET0,
  };
}

export interface FetchIrrigationOptions {
  apiBaseUrl: string;
  userId: string;
  devEUI: string;
  timezone?: string;
}

export async function fetchIrrigation({
  apiBaseUrl,
  userId,
  devEUI,
  timezone = getLocalTimezone(),
}: FetchIrrigationOptions): Promise<IrrigationResponse> {
  const base = apiBaseUrl.trim().replace(/\/+$/, "");
  if (!base) throw new Error("Configure uma URL base para a API de irrigação.");

  const query = new URLSearchParams({ userId, devEUI, timezone });
  const url = `${base}/api/v1/irrigation?${query.toString()}`;
  let response: Response;

  try {
    response = await fetch(url, { method: "GET", headers: { Accept: "application/json" } });
  } catch {
    throw new Error("Não foi possível conectar à API de irrigação. Verifique a URL, se o serviço está ativo e se o dispositivo consegue alcançá-lo.");
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const serverMessage = isRecord(body) && typeof body.error === "string"
      ? body.error
      : `A API de irrigação respondeu com HTTP ${response.status}.`;
    throw new Error(serverMessage);
  }
  if (!isRecord(body) || typeof body.sensor_id !== "string" || !isRecord(body.irrigation)) {
    throw new Error("A resposta da API de irrigação não corresponde ao contrato esperado.");
  }

  const rawHistory = body.sensor_history;
  const rawPrediction = body.soil_moisture_prediction;
  const rawForecastSummary = body.forecast_summary;
  const sensorHistory = normalizeMssHistory(rawHistory);
  const prediction = normalizePrediction(rawPrediction);
  const forecastSummary = normalizeForecastSummary(rawForecastSummary);

  const normalized: IrrigationResponse = {
    ...(body as unknown as IrrigationResponse),
    sensor_history: sensorHistory,
  };
  if (prediction) normalized.soil_moisture_prediction = prediction;
  else delete normalized.soil_moisture_prediction;
  if (forecastSummary) normalized.forecast_summary = forecastSummary;
  else delete normalized.forecast_summary;

  if (typeof __DEV__ !== "undefined" && __DEV__) {
    const rawPoints = isRecord(rawPrediction) && Array.isArray(rawPrediction.points) ? rawPrediction.points.length : 0;
    console.info("[Irrigation MSS v3] response fields:", Object.keys(body).join(", "));
    console.info("[Irrigation MSS v3] sensor_history:", {
      present: Array.isArray(rawHistory),
      rawCount: Array.isArray(rawHistory) ? rawHistory.length : 0,
      normalizedCount: sensorHistory.length,
    });
    console.info("[Irrigation MSS v3] soil_moisture_prediction:", {
      present: isRecord(rawPrediction),
      rawPointCount: rawPoints,
      normalizedPointCount: prediction?.points.length ?? 0,
      metadataComplete: prediction !== undefined,
    });
    console.info("[Irrigation MSS v3] forecast_summary:", {
      present: isRecord(rawForecastSummary),
      normalized: forecastSummary !== undefined,
    });
  }

  return normalized;
}
