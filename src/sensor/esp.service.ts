import type { Device } from "./sensor.service";

const ESP_CONFIG_PATH =
  process.env.EXPO_PUBLIC_ESP_CONFIG_PATH || "/api/config";

export type EspPostResult = {
  success: boolean;
  status: number;
  responseText: string;
};

export async function postDeviceToEsp(
  device: Device
): Promise<EspPostResult> {
  const url = `http://${device.Host}${ESP_CONFIG_PATH}`;

  console.log("ESP: enviando configuração para:", url);

  const payload = {
    // devEUI: device.devEUI,
    app_s_key: device.app_s_key,
    nwk_s_key: device.nwk_s_key,
    dev_addr: device.devAddress,
    setup_date: Math.floor(Date.now() / 1000),
  };

  console.log(
    "ESP: payload:",
    JSON.stringify(payload)
  );

  try {
    const response = await fetch(url, {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify(payload),
    });

    const responseText = await response.text();

    console.log(
      "ESP: status:",
      response.status
    );

    console.log(
      "ESP: resposta:",
      responseText
    );

    return {
      success: response.ok,
      status: response.status,
      responseText,
    };
  } catch (error) {
    console.error(
      "ESP: erro no POST:",
      error
    );

    throw new Error(
      "Não foi possível conectar ao sensor."
    );
  }
}