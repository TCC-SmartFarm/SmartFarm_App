import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type SensorConfig = {
  sensorId: string;
  deviceId: string;

  /**
   * Endpoint que será usado posteriormente
   * para comunicação com o ESP.
   */
  endpoint: string;

  /**
   * Dados que serão enviados posteriormente
   * para o sensor.
   */
  payload: Record<string, unknown>;
};

type SensorContextData = {
  sensorConfig: SensorConfig | null;

  setSensorConfig: (config: SensorConfig) => void;

  clearSensorConfig: () => void;
};

const SensorContext = createContext<SensorContextData | undefined>(
  undefined
);

type SensorProviderProps = {
  children: ReactNode;
};

export function SensorProvider({
  children,
}: SensorProviderProps) {
  const [sensorConfig, setSensorConfig] =
    useState<SensorConfig | null>(null);

  const value = useMemo(
    () => ({
      sensorConfig,

      setSensorConfig,

      clearSensorConfig: () => {
        setSensorConfig(null);
      },
    }),
    [sensorConfig]
  );

  return (
    <SensorContext.Provider value={value}>
      {children}
    </SensorContext.Provider>
  );
}

export function useSensor() {
  const context = useContext(SensorContext);

  if (!context) {
    throw new Error(
      "useSensor deve ser utilizado dentro de SensorProvider"
    );
  }

  return context;
}