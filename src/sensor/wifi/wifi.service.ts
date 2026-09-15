import WifiManager from "react-native-wifi-reborn";

export type WifiNetwork = {
  SSID: string;
  BSSID: string;
  level: number;
  frequency: number;
  capabilities: string;
};

export async function scanWifiNetworks(): Promise<WifiNetwork[]> {
  const networks = await WifiManager.reScanAndLoadWifiList();

  if (!Array.isArray(networks)) {
    return [];
  }

  return networks;
}

export async function findEspNetworks(): Promise<WifiNetwork[]> {
  const networks = await scanWifiNetworks();

  return networks.filter((network) =>
    network.SSID?.startsWith("esp_")
  );
}

export async function getCurrentWifiSSID(): Promise<string | null> {
  try {
    const ssid = await WifiManager.getCurrentWifiSSID();

    return ssid || null;
  } catch (error) {
    console.error(
      "WI-FI: erro ao obter SSID atual:",
      error
    );

    return null;
  }
}

export async function connectToWifi(
  ssid: string,
  password?: string
): Promise<boolean> {
  try {
    console.log("WI-FI: conectando em", ssid);

    if (password) {
      await WifiManager.connectToProtectedSSID(
        ssid,
        password,
        false,
        false
      );
    } else {
      await WifiManager.connectToProtectedSSID(
        ssid,
        "",
        false,
        false
      );
    }

    console.log("WI-FI: conexão estabelecida");

    const currentSSID = await getCurrentWifiSSID();

    console.log(
      "WI-FI: SSID atual após conexão:",
      currentSSID
    );

    return currentSSID === ssid;
  } catch (error) {
    console.error(
      "WI-FI: erro ao conectar:",
      error
    );

    return false;
  }
}