import WifiManager from "react-native-wifi-reborn";

export type WifiNetwork = {
  SSID: string;
  BSSID: string;
  level: number;
  frequency: number;
  capabilities: string;
};

const ESP_SSID = "DATALOGGER_CONFIG";
const ESP_IP = "192.168.4.1";
const ESP_URL = `http://${ESP_IP}/`;

const CONNECTION_TIMEOUT = 15000;
const HTTP_TIMEOUT = 5000;

/**
 * Escaneia as redes Wi-Fi disponíveis.
 */
export async function scanWifiNetworks(): Promise<WifiNetwork[]> {
  try {
    console.log("WI-FI: iniciando scan...");

    const networks =
      await WifiManager.reScanAndLoadWifiList();

    if (!Array.isArray(networks)) {
      console.warn(
        "WI-FI: scan não retornou uma lista."
      );

      return [];
    }

    console.log(
      "WI-FI: redes encontradas:",
      networks.length
    );

    return networks;
  } catch (error) {
    console.error(
      "WI-FI: erro no scan:",
      error
    );

    return [];
  }
}

/**
 * Localiza especificamente o Access Point do ESP.
 *
 * O firmware atual utiliza:
 *
 * SSID     = DATALOGGER_CONFIG
 * Canal    = 1
 * 2.4 GHz
 * Segurança = OPEN
 */
export async function findEspNetworks(): Promise<WifiNetwork[]> {
  const networks = await scanWifiNetworks();

  const espNetworks = networks.filter(
    (network) =>
      network.SSID === ESP_SSID
  );

  console.log(
    "WI-FI: ESPs encontrados:",
    espNetworks
  );

  return espNetworks;
}

/**
 * Obtém o SSID atualmente conectado.
 */
export async function getCurrentWifiSSID(): Promise<string | null> {
  try {
    const ssid =
      await WifiManager.getCurrentWifiSSID();

    return ssid || null;
  } catch (error) {
    console.error(
      "WI-FI: erro ao obter SSID atual:",
      error
    );

    return null;
  }
}

/**
 * Aguarda até que o Android informe que está conectado
 * ao SSID desejado.
 */
async function waitForWifiConnection(
  expectedSSID: string,
  timeout = CONNECTION_TIMEOUT
): Promise<boolean> {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    const currentSSID =
      await getCurrentWifiSSID();

    console.log(
      "WI-FI: aguardando conexão...",
      currentSSID
    );

    if (currentSSID === expectedSSID) {
      console.log(
        "WI-FI: SSID confirmado:",
        expectedSSID
      );

      return true;
    }

    await new Promise((resolve) =>
      setTimeout(resolve, 500)
    );
  }

  console.error(
    "WI-FI: timeout aguardando conexão."
  );

  return false;
}

/**
 * Verifica se o ESP responde no endereço padrão
 * do SoftAP do ESP-IDF.
 */
export async function checkEspConnection(): Promise<boolean> {
  console.log(
    "WI-FI: verificando comunicação com ESP:",
    ESP_URL
  );

  const controller =
    new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    HTTP_TIMEOUT
  );

  try {
    const response = await fetch(
      ESP_URL,
      {
        method: "GET",
        signal: controller.signal,
      }
    );

    clearTimeout(timeout);

    console.log(
      "WI-FI: ESP respondeu:",
      response.status
    );

    return response.ok;
  } catch (error) {
    clearTimeout(timeout);

    console.error(
      "WI-FI: ESP não respondeu:",
      error
    );

    return false;
  }
}

/**
 * Conecta ao ESP.
 *
 * IMPORTANTE:
 * O ESP possui uma rede OPEN.
 *
 * Portanto não usamos senha.
 */
export async function connectToEsp(
  network: WifiNetwork
): Promise<boolean> {
  try {
    console.log("====================================");
    console.log("WI-FI: CONECTANDO AO ESP");
    console.log("WI-FI: SSID:", network.SSID);
    console.log("WI-FI: BSSID:", network.BSSID);
    console.log("WI-FI: frequência:", network.frequency);
    console.log("WI-FI: sinal:", network.level);
    console.log("WI-FI: segurança:", network.capabilities);
    console.log("====================================");

    await WifiManager.connectToProtectedSSID(
      network.SSID,
      "",
      false,
      false
    );

    console.log(
      "WI-FI: solicitação de conexão concluída"
    );

    const currentSSID =
      await getCurrentWifiSSID();

    console.log(
      "WI-FI: SSID atual:",
      currentSSID
    );

    return currentSSID === network.SSID;

  } catch (error) {
    console.error(
      "WI-FI: falha ao conectar ao ESP:",
      error
    );

    return false;
  }
}

/**
 * Função compatível com o código atual da aplicação.
 *
 * Permite continuar fazendo:
 *
 * connectToWifi("DATALOGGER_CONFIG")
 */
export async function connectToWifi(
  ssid: string,
  password?: string
): Promise<boolean> {
  try {
    /*
     * Para o nosso ESP, sempre usamos a rede
     * DATALOGGER_CONFIG.
     */
    if (ssid !== ESP_SSID) {
      console.error(
        "WI-FI: SSID não é do ESP:",
        ssid
      );

      return false;
    }

    /*
     * O firmware está configurado como WIFI_AUTH_OPEN.
     *
     * Portanto ignoramos password.
     */
    if (password) {
      console.warn(
        "WI-FI: senha fornecida, mas o ESP utiliza rede aberta."
      );
    }

    const espNetworks =
      await findEspNetworks();

    if (espNetworks.length === 0) {
      console.error(
        "WI-FI: DATALOGGER_CONFIG não encontrada."
      );

      return false;
    }

    /*
     * Normalmente haverá apenas um ESP.
     *
     * Se houver mais de um, escolhemos o que
     * possui maior intensidade de sinal.
     */
    const bestNetwork =
      [...espNetworks].sort(
        (a, b) => b.level - a.level
      )[0];

    console.log(
      "WI-FI: ESP selecionado:",
      bestNetwork
    );

    return await connectToEsp(
      bestNetwork
    );
  } catch (error) {
    console.error(
      "WI-FI: erro geral:",
      error
    );

    return false;
  }
}

/**
 * Retorna informações sobre o ESP encontrado.
 */
export async function getEspNetwork(): Promise<WifiNetwork | null> {
  const networks =
    await findEspNetworks();

  if (networks.length === 0) {
    return null;
  }

  return [...networks].sort(
    (a, b) => b.level - a.level
  )[0];
}