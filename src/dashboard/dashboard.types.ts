import type { ApiSensorLatest, ApiSensorHistory } from "./dashboard.service";

export type DashboardReading = {
  timestamp: number;
  soilMoist: number;
  soilTemp: number;
  airHumid: number;
  airTemp: number;
  light: number;
  battery: number;
  validity: boolean;
};

export type DashboardSensor = {
  devEUI: string;
  devAddr: string;
  name: string;
  applicationId: string;

  lat?: number;
  lon?: number;

  reading: DashboardReading;

  latestMessages?: ApiSensorLatest[];
  history?: ApiSensorHistory[];
};

export type SensorStatus = "ok" | "warn" | "alert";

export function getSensorStatus(
  reading: DashboardReading
): SensorStatus {
  if (!reading.validity) {
    return "alert";
  }

  if (reading.soilMoist <= 20) {
    return "alert";
  }

  if (reading.soilMoist < 35) {
    return "warn";
  }

  return "ok";
}

export function mapApiReading(
  reading: ApiSensorLatest["payload"]
): DashboardReading {
  return {
    timestamp: reading.timestamp,
    soilMoist: reading.soil_moisture,
    soilTemp: reading.air_temperature,
    airHumid: reading.air_humidity,
    airTemp: reading.air_temperature,
    light: reading.luminosity,
    battery: reading.battery,
    validity: reading.validity,
  };
}