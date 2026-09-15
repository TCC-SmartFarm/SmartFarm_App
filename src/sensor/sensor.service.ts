import { supabase } from "../supabase/supabase";

export type Device = {
  key: string;
  Host: string;
  devEUI: string;
  app_s_key: string;
  nwk_s_key: string;
  devAddress: string;
  setup_date: number;
};

type UserRow = {
  userId: string;
  devices: Record<string, Omit<Device, "key">> | null;
};

export async function getUserDevices(
  auth0UserId: string
): Promise<Device[]> {
  console.log(
    "SUPABASE: buscando usuário:",
    auth0UserId
  );

  const { data, error } = await supabase
    .from("users")
    .select("userId, devices")
    .eq("userId", auth0UserId)
    .maybeSingle<UserRow>();

  if (error) {
    console.error(
      "SUPABASE: erro ao buscar usuário:",
      error
    );

    throw new Error(
      `Erro ao buscar usuário: ${error.message}`
    );
  }

  if (!data) {
    console.log(
      "SUPABASE: usuário não encontrado"
    );

    return [];
  }

  console.log(
    "SUPABASE: usuário encontrado:",
    data.userId
  );

  console.log(
    "SUPABASE: devices:",
    data.devices
  );

  if (!data.devices) {
    return [];
  }

  const devices = Object.entries(data.devices).map(
    ([key, device]) => ({
      key,
      ...device,
    })
  );

  console.log(
    "SUPABASE: devices convertidos:",
    devices
  );

  return devices;
}