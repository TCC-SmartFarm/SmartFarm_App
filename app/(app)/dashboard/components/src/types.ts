export type SoilStatus = "dry" | "intermediate" | "wet" | string;

export interface IrrigationDevice {
  devEUI: string;
  name: string;
}

export interface IrrigationLocation {
  latitude?: number | null;
  longitude?: number | null;
  source?: string;
  timezone?: string;
}

export interface IrrigationSensor {
  air_humidity_percent?: number | null;
  air_temperature_celsius?: number | null;
  soil_moisture_kalman_filtered?: number | null;
  soil_moisture_raw?: number | null;
  timestamp?: string | null;
  validity?: boolean;
}

export interface ForecastDay {
  date: string;
  precipitation_probability_percent?: number | null;
  precipitation_mm?: number | null;
  et0_mm?: number | null;
  rain_likely?: boolean;
}

export interface IrrigationRecommendation {
  action?: string;
  message?: string;
  recommended_day?: string | null;
  should_irrigate?: boolean;
  should_irrigate_today?: boolean;
  soil_status?: SoilStatus;
  rain_probability_percent?: number | null;
  expected_rain_mm?: number | null;
}

export interface IrrigationResponse {
  sensor_id: string;
  location?: IrrigationLocation;
  sensor?: IrrigationSensor;
  forecast_today_and_next_5_days?: ForecastDay[];
  irrigation?: IrrigationRecommendation;
  note?: string;
}
