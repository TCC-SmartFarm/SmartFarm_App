import * as SecureStore from "expo-secure-store";
import type { Device } from "./sensor.service";

function sanitizeKey(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function getStorageKey(userId: string) {
  return `smartfarm_devices_${sanitizeKey(userId)}`;
}

export async function saveDevices(
  userId: string,
  devices: Device[]
) {
  const key = getStorageKey(userId);

  await SecureStore.setItemAsync(
    key,
    JSON.stringify(devices)
  );

  console.log(
    "STORAGE: devices salvos:",
    devices.length
  );
}

export async function loadDevices(
  userId: string
): Promise<Device[]> {
  const key = getStorageKey(userId);

  const stored = await SecureStore.getItemAsync(key);

  if (!stored) {
    console.log("STORAGE: nenhum device salvo localmente");
    return [];
  }

  try {
    const devices = JSON.parse(stored);

    if (!Array.isArray(devices)) {
      console.log("STORAGE: dados inválidos");
      return [];
    }

    console.log(
      "STORAGE: devices carregados:",
      devices.length
    );

    return devices;
  } catch (error) {
    console.error(
      "STORAGE: erro ao ler devices:",
      error
    );

    return [];
  }
}

export async function clearDevices(userId: string) {
  const key = getStorageKey(userId);

  await SecureStore.deleteItemAsync(key);
}