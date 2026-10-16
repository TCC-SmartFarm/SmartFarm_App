const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL;

if (!API_BASE_URL) {
  console.warn(
    "EXPO_PUBLIC_API_URL não foi configurado no arquivo .env"
  );
}

export type ApiPayload = {
  timestamp: number;
  air_temperature: number;
  air_humidity: number;
  soil_moisture: number;
  luminosity: number;
  battery: number;
  validity: boolean;
};

export type ApiSensorLatest = {
  userId: string;
  applicationId: string;
  deviceType: string;
  devAddr: string;
  devEUI: string;
  name: string;
  payload: ApiPayload;
};

export type ApiSensorHistory = {
  applicationId: string;
  devAddr: string;
  devEUI: string;
  deviceType: string;
  timestamp: number;
  userId: string;
  value: {
    air_humidity: number;
    air_temperature: number;
    battery: number;
    luminosity: number;
    soil_moisture: number;
    validity: number;
  };
};

export type ApiAllSensorsResponse = {
  leituras: ApiSensorLatest[];
  total_dispositivos: number;
  userId: string;
};

async function request<T>(path: string): Promise<T> {
  if (!API_BASE_URL) {
    throw new Error(
      "EXPO_PUBLIC_API_URL não foi configurado no arquivo .env"
    );
  }

  const base = API_BASE_URL.replace(/\/+$/, "");
  const url = `${base}${path}`;

  console.log("API:", url);

  const response = await fetch(url);

  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `API ${response.status}: ${text || response.statusText}`
    );
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("A API retornou uma resposta que não é JSON válido.");
  }
}

/**
 * Última leitura de cada sensor do usuário.
 */
export async function getAllSensors(
  userId: string
): Promise<ApiAllSensorsResponse> {
  return request<ApiAllSensorsResponse>(
    `/api/sensors/all/${encodeURIComponent(userId)}`
  );
}

/**
 * Últimas 20 mensagens de um sensor.
 */
export async function getLatestSensor(
  userId: string,
  devEUI: string
): Promise<ApiSensorLatest[]> {
  return request<ApiSensorLatest[]>(
    `/api/sensors/latest/${encodeURIComponent(
      userId
    )}/${encodeURIComponent(devEUI)}`
  );
}

/**
 * Histórico do sensor.
 */
export async function getSensorHistory(
  userId: string,
  days: number,
  devEUI: string
): Promise<ApiSensorHistory[]> {
  const url = `${API_BASE_URL}/api/sensors/influx/${userId}/${days}/${devEUI}`;

  console.log("API:", url);

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Erro ao buscar histórico: HTTP ${response.status}`
    );
  }

  const data = await response.json();

  console.log("API: histórico recebido:", data);

  return Array.isArray(data) ? data : [];
}