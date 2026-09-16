import { supabase } from "../supabase/supabase";
import type { Device } from "./sensor.service";

type DeviceData = {
  Host: string;
  devEUI: string;
  app_s_key: string;
  nwk_s_key: string;
  devAddress: string;
  setup_date: number;
  lat: number;
  lon: number;
};

type UserRow = {
  userId: string;
  devices: Record<string, Omit<Device, "key">> | null;
};

export async function createDevice({
  userId,
  device,
}: {
  userId: string;
  device: DeviceData;
}): Promise<Device> {
  console.log(
    "DEVICE: criando sensor para:",
    userId
  );

  const { data: user, error: userError } =
    await supabase
      .from("users")
      .select("userId, devices")
      .eq("userId", userId)
      .maybeSingle<UserRow>();

  if (userError) {
    throw new Error(
      `Erro ao buscar usuário: ${userError.message}`
    );
  }

  if (!user) {
    throw new Error(
      "Usuário não encontrado no Supabase."
    );
  }

  const currentDevices =
    user.devices ?? {};

  const existingKeys =
    Object.keys(currentDevices)
      .map(Number)
      .filter(Number.isFinite);

  const nextKey =
    existingKeys.length > 0
      ? String(Math.max(...existingKeys) + 1)
      : "1";

  const updatedDevices = {
    ...currentDevices,
    [nextKey]: device,
  };

  const { error: updateError } =
    await supabase
      .from("users")
      .update({
        devices: updatedDevices,
      })
      .eq("userId", userId);

  if (updateError) {
    throw new Error(
      `Erro ao salvar sensor: ${updateError.message}`
    );
  }

  const newDevice: Device = {
    key: nextKey,
    ...device,
  };

  console.log(
    "DEVICE: sensor criado:",
    newDevice
  );

  return newDevice;
}


export async function updateDevice(
  userId: string,
  deviceKey: string,
  device: Device
): Promise<void> {
  console.log(
    "DEVICE: atualizando sensor:",
    deviceKey
  );

  const { data: user, error: userError } =
    await supabase
      .from("users")
      .select("userId, devices")
      .eq("userId", userId)
      .maybeSingle();

  if (userError) {
    throw new Error(
      `Erro ao buscar usuário: ${userError.message}`
    );
  }

  if (!user) {
    throw new Error(
      "Usuário não encontrado no Supabase."
    );
  }

  const currentDevices =
    user.devices ?? {};

  const updatedDevices = {
    ...currentDevices,

    [deviceKey]: {
      Host: device.Host,
      devEUI: device.devEUI,
      app_s_key: device.app_s_key,
      nwk_s_key: device.nwk_s_key,
      devAddress: device.devAddress,
      setup_date: device.setup_date,
      lat: device.lat,
      lon: device.lon,
    },
  };

  const { error: updateError } =
    await supabase
      .from("users")
      .update({
        devices: updatedDevices,
      })
      .eq("userId", userId);

  if (updateError) {
    throw new Error(
      `Erro ao atualizar sensor: ${updateError.message}`
    );
  }

  console.log(
    "DEVICE: sensor atualizado com sucesso."
  );
}