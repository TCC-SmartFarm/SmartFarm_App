export interface SensorHistoryPoint {
  /** Unix timestamp in seconds. */
  timestamp: number;
  soil_moisture: number;
  air_humidity?: number | null;
  air_temperature?: number | null;
  validity?: boolean;
}

export interface FetchSensorHistoryOptions {
  /** Base URL for the existing sensor API, e.g. https://...cloudapp.azure.com */
  apiBaseUrl: string;
  userId: string;
  devEUI: string;
  days?: number;
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readTimestamp(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    // Some APIs return milliseconds; the sensor API used by this project returns seconds.
    return value > 1e12 ? value / 1000 : value;
  }
  if (typeof value === "string" && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) return numeric > 1e12 ? numeric / 1000 : numeric;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed / 1000 : null;
  }
  return null;
}

function unwrapRecords(body: unknown): unknown[] {
  if (Array.isArray(body)) return body;
  if (!isRecord(body)) return [];
  for (const key of ["data", "records", "history", "result", "items"]) {
    if (Array.isArray(body[key])) return body[key] as unknown[];
  }
  return [];
}

function normalizeRecord(value: unknown, requestedDevEUI: string): SensorHistoryPoint | null {
  if (!isRecord(value)) return null;

  const recordDevEUI = value.devEUI ?? value.deveui ?? value.dev_eui;
  if (typeof recordDevEUI === "string" && recordDevEUI.toLowerCase() !== requestedDevEUI.toLowerCase()) {
    return null;
  }

  const measurement = isRecord(value.value)
    ? value.value
    : isRecord(value.payload)
      ? value.payload
      : isRecord(value.measurements)
        ? value.measurements
        : value;

  const rawSoil = measurement.soil_moisture ?? measurement.soilMoisture ?? measurement.soil_moisture_raw;
  if (rawSoil == null || rawSoil === "") return null;
  const soilMoisture = typeof rawSoil === "number" ? rawSoil : Number(rawSoil);
  if (!Number.isFinite(soilMoisture)) return null;
  if (measurement.validity === false || value.validity === false) return null;

  const timestamp = readTimestamp(value.timestamp ?? measurement.timestamp ?? value.time);
  if (timestamp === null) return null;

  const airHumidityValue = measurement.air_humidity ?? measurement.air_humidity_percent;
  const airTemperatureValue = measurement.air_temperature ?? measurement.air_temperature_celsius;
  const airHumidity = airHumidityValue == null ? null : Number(airHumidityValue);
  const airTemperature = airTemperatureValue == null ? null : Number(airTemperatureValue);

  return {
    timestamp,
    soil_moisture: soilMoisture,
    air_humidity: airHumidity !== null && Number.isFinite(airHumidity) ? airHumidity : null,
    air_temperature: airTemperature !== null && Number.isFinite(airTemperature) ? airTemperature : null,
    validity: measurement.validity !== false && value.validity !== false,
  };
}

/**
 * Loads the same sensor history endpoint already used by the mobile dashboard:
 * GET /api/sensors/influx/{userId}/{days}/{devEUI}
 */
export async function fetchSensorHistory({
  apiBaseUrl,
  userId,
  devEUI,
  days = 7,
}: FetchSensorHistoryOptions): Promise<SensorHistoryPoint[]> {
  const base = apiBaseUrl.trim().replace(/\/+$/, "");
  if (!base) throw new Error("Configure a URL base para a API de sensores.");

  const url = `${base}/api/sensors/influx/${encodeURIComponent(userId)}/${days}/${encodeURIComponent(devEUI)}`;
  let response: Response;
  try {
    response = await fetch(url, { method: "GET", headers: { Accept: "application/json" } });
  } catch {
    throw new Error("Não foi possível carregar o histórico do sensor. Verifique a URL da API de sensores e a conexão de rede.");
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`A API de sensores respondeu com HTTP ${response.status} ao consultar o histórico.`);
  }

  const records = unwrapRecords(body);
  const byTimestamp = new Map<number, SensorHistoryPoint>();
  for (const record of records) {
    const point = normalizeRecord(record, devEUI);
    if (point) byTimestamp.set(point.timestamp, point);
  }

  const points = Array.from(byTimestamp.values()).sort((a, b) => a.timestamp - b.timestamp);
  if (points.length === 0) {
    throw new Error("A API respondeu, mas não foram encontradas leituras válidas de umidade do solo no histórico.");
  }
  return points;
}
