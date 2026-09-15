import React, {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from "react";

import type { Device } from "./sensor.service";

type SensorContextType = {
  devices: Device[];
  selectedDevice: Device | null;

  setDevices: (devices: Device[]) => void;
  setSelectedDevice: (device: Device | null) => void;

  clearDevices: () => void;
};

const SensorContext = createContext<SensorContextType | undefined>(
  undefined
);

export function SensorProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [devices, setDevicesState] = useState<Device[]>([]);
  const [selectedDevice, setSelectedDeviceState] =
    useState<Device | null>(null);

  function setDevices(devices: Device[]) {
    setDevicesState(devices);
  }

  function setSelectedDevice(device: Device | null) {
    setSelectedDeviceState(device);
  }

  function clearDevices() {
    setDevicesState([]);
    setSelectedDeviceState(null);
  }

  return (
    <SensorContext.Provider
      value={{
        devices,
        selectedDevice,
        setDevices,
        setSelectedDevice,
        clearDevices,
      }}
    >
      {children}
    </SensorContext.Provider>
  );
}

export function useSensors() {
  const context = useContext(SensorContext);

  if (!context) {
    throw new Error(
      "useSensors deve ser usado dentro de SensorProvider"
    );
  }

  return context;
}