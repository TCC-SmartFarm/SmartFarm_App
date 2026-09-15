type SensorConfig = {
  sensorId: string;
  deviceId: string;
  endpoint: string;
  payload: Record<string, unknown>;
};

type SensorContextData = {
  sensorConfig: SensorConfig | null;
  setSensorConfig: (config: SensorConfig) => void;
  clearSensorConfig: () => void;
};