/////////////////
// tentativa de correção da lat/long e host fixo
/////////////////

import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useAuth0 } from "react-native-auth0";
import * as Location from "expo-location";

import { useSensors } from "../../../src/sensor/SensorContext";
import {
  connectToWifi,
  findEspNetworks,
  getCurrentWifiSSID,
  type WifiNetwork,
} from "../../../src/sensor/wifi/wifi.service";
import { postDeviceToEsp } from "../../../src/sensor/esp.service";
import { updateDevice } from "../../../src/sensor/device.service";
import { saveDevices } from "../../../src/sensor/sensor.storage";

const ESP_SSID = "DATALOGGER_CONFIG";
const ESP_CONFIG_PATH = process.env.EXPO_PUBLIC_ESP_CONFIG_PATH || "/api/config";

export default function SensorWifiScreen() {
  const { user } = useAuth0();
  const {
    devices,
    selectedDevice,
    setDevices,
    setSelectedDevice,
  } = useSensors();

  const [loading, setLoading] = useState(Platform.OS === "android");
  const [networks, setNetworks] = useState<WifiNetwork[]>([]);
  const [currentSSID, setCurrentSSID] = useState<string | null>(null);
  const [isConnectedToEsp, setIsConnectedToEsp] = useState(false);
  const [checkingConnection, setCheckingConnection] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [selectedNetwork, setSelectedNetwork] = useState<WifiNetwork | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendSuccess, setSendSuccess] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);

  useEffect(() => {
    void initializeWifi();
  }, []);

  async function initializeWifi() {
    try {
      const ssid = await getCurrentWifiSSID();
      setCurrentSSID(ssid);
      const connected = ssid === ESP_SSID;
      setIsConnectedToEsp(connected);

      if (Platform.OS === "android" && !connected) {
        await scanForSensor();
      }
    } catch (err) {
      console.error("WI-FI: erro ao inicializar:", err);
      if (Platform.OS === "android") {
        await scanForSensor();
      } else {
        setError("Não foi possível verificar a rede Wi-Fi atual.");
      }
    }
  }

  async function scanForSensor() {
    try {
      setLoading(true);
      setError(null);

      const permission = await Location.getForegroundPermissionsAsync();
      let granted = permission.granted;

      if (!granted) {
        const requested = await Location.requestForegroundPermissionsAsync();
        granted = requested.granted;
      }

      if (!granted) {
        setError("Precisamos da permissão de localização para procurar o sensor.");
        return;
      }

      const espNetworks = await findEspNetworks();
      setNetworks(espNetworks);

      if (espNetworks.length === 0) {
        setError("Nenhum sensor encontrado. Verifique se ele está ligado e em modo de configuração.");
      }
    } catch (err) {
      console.error("WI-FI: erro ao procurar redes:", err);
      setError("Não foi possível procurar redes Wi-Fi. Confira as permissões e tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  function markAsConnected(ssid: string) {
    const connected = ssid === ESP_SSID;
    setCurrentSSID(ssid);
    setIsConnectedToEsp(connected);
    if (connected) {
      setError(null);
      setSendSuccess(false);
    }
    return connected;
  }

  async function checkManualConnection() {
    try {
      setCheckingConnection(true);
      setError(null);
      const ssid = await getCurrentWifiSSID();
      const connected = markAsConnected(ssid ?? "");

      if (!connected) {
        setError(`Conecte o celular à rede ${ESP_SSID} e tente novamente.`);
      }
    } catch (err) {
      console.error("WI-FI: erro verificando conexão:", err);
      setError("Não foi possível verificar a conexão com o sensor.");
    } finally {
      setCheckingConnection(false);
    }
  }

  async function handleConnect(network: WifiNetwork) {
    try {
      setConnecting(true);
      setSelectedNetwork(network);
      setError(null);

      // A rede criada pelo ESP é aberta, portanto não precisa de senha.
      const connected = await connectToWifi(network.SSID);
      const ssid = await getCurrentWifiSSID();

      if (!connected || ssid !== ESP_SSID) {
        markAsConnected(ssid ?? "");
        setError(`Não foi possível confirmar a conexão com ${network.SSID}. Tente novamente.`);
        return;
      }

      markAsConnected(ssid);
      console.log("WI-FI: conectado ao sensor; permanecendo nesta tela.");
    } catch (err) {
      console.error("WI-FI: falha ao conectar ao ESP:", err);
      setError("Não foi possível conectar ao sensor.");
    } finally {
      setConnecting(false);
    }
  }

  async function handleConfigureSensor() {
    if (!selectedDevice) {
      setError("Nenhum sensor foi selecionado.");
      return;
    }
    if (!user?.sub) {
      setError("Usuário não autenticado. Entre novamente no aplicativo.");
      return;
    }

    try {
      setSending(true);
      setError(null);
      setSendSuccess(false);

      // Confirma a rede imediatamente antes do POST.
      const ssid = await getCurrentWifiSSID();
      console.log("CONFIGURAÇÃO: SSID antes do POST:", ssid);
      if (ssid !== ESP_SSID) {
        markAsConnected(ssid ?? "");
        throw new Error(`A conexão com ${ESP_SSID} foi perdida. Reconecte-se e tente novamente.`);
      }
      markAsConnected(ssid);

      // Captura a posição atual do celular; ela não é enviada ao ESP,
      // mas será salva junto ao cadastro do sensor no aplicativo/Supabase.
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        throw new Error("Precisamos da permissão de localização para registrar a posição do sensor.");
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      const coordinates = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };
      setCurrentLocation(coordinates);
      console.log("CONFIGURAÇÃO: posição do celular:", coordinates);

      // 1. Envia os parâmetros de configuração ao ESP.
      // postDeviceToEsp usa selectedDevice.Host (valor do cadastro no Supabase)
      // e EXPO_PUBLIC_ESP_CONFIG_PATH para montar a URL.
      const result = await postDeviceToEsp(selectedDevice);
      if (result.status !== 200) {
        if (result.status === 500) {
          throw new Error("O sensor recusou a configuração. Verifique os dados e tente novamente.");
        }
        throw new Error(`O sensor retornou o código HTTP ${result.status}.`);
      }

      // 2. Só marca o sensor como configurado depois da resposta HTTP 200.
      const configuredDevice = {
        ...selectedDevice,
        lat: coordinates.latitude,
        lon: coordinates.longitude,
        setup_date: Math.floor(Date.now() / 1000),
      };
      const updatedDevices = devices.map((device) =>
        device.key === selectedDevice.key ? configuredDevice : device
      );

      setDevices(updatedDevices);
      setSelectedDevice(configuredDevice);

      // 3. Persiste no aparelho e atualiza o registro do usuário no Supabase.
      await saveDevices(user.sub, updatedDevices);
      await updateDevice(user.sub, selectedDevice.key, configuredDevice);

      setSendSuccess(true);
      console.log("CONFIGURAÇÃO: ESP, armazenamento local e Supabase atualizados.");
    } catch (err) {
      console.error("CONFIGURAÇÃO: erro:", err);
      setError(err instanceof Error ? err.message : "Não foi possível configurar o sensor.");
    } finally {
      setSending(false);
    }
  }

  if (!selectedDevice) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyContainer}>
          <Text style={styles.title}>Nenhum sensor selecionado</Text>
          <Text style={styles.description}>Volte e selecione o sensor que deseja configurar.</Text>
          <Pressable onPress={() => router.back()} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Voltar</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const setupDatePreview = Math.floor(Date.now() / 1000);
  const latitude = currentLocation?.latitude;
  const longitude = currentLocation?.longitude;
  const espEndpoint = selectedDevice.Host
    ? `http://${selectedDevice.Host}${ESP_CONFIG_PATH}`
    : "Host não definido no cadastro do sensor";

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Pressable disabled={sending} onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>←</Text>
        </Pressable>

        <Text style={styles.step}>ETAPA 3 · CONFIGURAÇÃO</Text>
        <Text style={styles.title}>{isConnectedToEsp ? "Configure seu sensor." : "Conecte seu sensor."}</Text>
        <Text style={styles.description}>
          Conecte-se à rede do dispositivo e envie a configuração sem sair desta tela.
        </Text>

        {!isConnectedToEsp && (
          <>
            {Platform.OS === "ios" ? (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Conexão manual</Text>
                <Text style={styles.bodyText}>
                  Abra os ajustes de Wi-Fi, conecte-se à rede {ESP_SSID} e volte para o SmartFarm.
                </Text>
                <Pressable onPress={() => Linking.openSettings()} style={styles.secondaryButton}>
                  <Text style={styles.secondaryButtonText}>Abrir ajustes de Wi-Fi</Text>
                </Pressable>
                <Pressable disabled={checkingConnection} onPress={checkManualConnection} style={styles.primaryButton}>
                  {checkingConnection ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>Já estou conectado</Text>}
                </Pressable>
              </View>
            ) : (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>Sensores encontrados</Text>
                  <Pressable disabled={loading || connecting} onPress={scanForSensor}>
                    <Text style={styles.linkText}>Procurar novamente</Text>
                  </Pressable>
                </View>
                {loading ? (
                  <View style={styles.loadingRow}>
                    <ActivityIndicator color="#4A7C59" />
                    <Text style={styles.bodyText}>Procurando redes Wi-Fi...</Text>
                  </View>
                ) : networks.length === 0 ? (
                  <Text style={styles.bodyText}>Nenhuma rede {ESP_SSID} encontrada.</Text>
                ) : (
                  networks.map((network) => (
                    <Pressable
                      key={network.BSSID || network.SSID}
                      disabled={connecting}
                      onPress={() => handleConnect(network)}
                      style={styles.networkRow}
                    >
                      <View style={styles.networkInfo}>
                        <Text style={styles.rowTitle}>{network.SSID}</Text>
                        <Text style={styles.mutedText}>Sinal: {network.level} dBm</Text>
                      </View>
                      {selectedNetwork?.BSSID === network.BSSID && connecting ? (
                        <ActivityIndicator color="#4A7C59" />
                      ) : (
                        <Text style={styles.linkText}>Conectar →</Text>
                      )}
                    </Pressable>
                  ))
                )}
              </View>
            )}
          </>
        )}

        {isConnectedToEsp && (
          <>
            <View style={styles.connectedCard}>
              <View style={styles.statusDot} />
              <View style={styles.networkInfo}>
                <Text style={styles.rowTitle}>Sensor conectado</Text>
                <Text style={styles.mutedText}>Rede: {currentSSID}</Text>
              </View>
              <Pressable disabled={checkingConnection || sending} onPress={checkManualConnection}>
                <Text style={styles.linkText}>Verificar</Text>
              </Pressable>
            </View>

            <SectionTitle title="Enviado ao dispositivo (ESP)" subtitle="POST HTTP para o sensor. As chaves são ocultadas na tela." />
            <View style={styles.card}>
              <InfoRow label="Método" value="POST" />
              <InfoRow label="Endpoint" value={espEndpoint} />
              <InfoRow label="Host" value={displayValue(selectedDevice.Host)} />
              <InfoRow label="devEUI" value={displayValue(selectedDevice.devEUI)} />
              <InfoRow label="devAddress" value={displayValue(selectedDevice.devAddress)} />
              <InfoRow label="app_s_key" value={maskSecret(selectedDevice.app_s_key)} />
              <InfoRow label="nwk_s_key" value={maskSecret(selectedDevice.nwk_s_key)} />
            </View>

            <SectionTitle title="Salvo no aplicativo e no Supabase" subtitle="Após o ESP responder HTTP 200, o app atualiza o estado local e o registro do usuário." />
            <View style={styles.card}>
              <InfoRow label="userId" value={displayValue(user?.sub)} />
              <InfoRow label="Sensor (key)" value={displayValue(selectedDevice.key)} />
              <InfoRow label="Host" value={displayValue(selectedDevice.Host)} />
              <InfoRow label="devEUI" value={displayValue(selectedDevice.devEUI)} />
              <InfoRow label="devAddress" value={displayValue(selectedDevice.devAddress)} />
              <InfoRow label="app_s_key" value={maskSecret(selectedDevice.app_s_key)} />
              <InfoRow label="nwk_s_key" value={maskSecret(selectedDevice.nwk_s_key)} />
              <InfoRow label="Latitude (lat)" value={latitude === undefined ? "Será capturada ao configurar" : String(latitude)} />
              <InfoRow label="Longitude (lon)" value={longitude === undefined ? "Será capturada ao configurar" : String(longitude)} />
              <InfoRow label="setup_date (Unix, estimado)" value={String(setupDatePreview)} />
            </View>

            <Text style={styles.noteText}>
              As coordenadas e o setup_date são mantidos no cadastro do aplicativo/Supabase; eles não fazem parte do resumo dos campos enviados ao ESP acima.
            </Text>

            {sendSuccess && (
              <View style={styles.successCard}>
                <Text style={styles.successTitle}>✓ Sensor configurado com sucesso</Text>
                <Text style={styles.bodyText}>O ESP respondeu com sucesso e os dados foram salvos no aplicativo e no Supabase.</Text>
                <Pressable onPress={() => router.replace("/sensor/success")} style={styles.primaryButton}>
                  <Text style={styles.primaryButtonText}>Continuar</Text>
                </Pressable>
              </View>
            )}

            {!sendSuccess && (
              <Pressable
                disabled={sending || checkingConnection}
                onPress={handleConfigureSensor}
                style={({ pressed }) => [styles.primaryButton, (sending || checkingConnection) && styles.disabledButton, pressed && styles.pressedButton]}
              >
                {sending ? (
                  <View style={styles.buttonContent}>
                    <ActivityIndicator color="#FFFFFF" />
                    <Text style={styles.primaryButtonText}>Configurando...</Text>
                  </View>
                ) : (
                  <Text style={styles.primaryButtonText}>Configurar sensor</Text>
                )}
              </Pressable>
            )}
          </>
        )}

        {error && (
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>Não foi possível concluir</Text>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.mutedText}>{subtitle}</Text>
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text selectable style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function displayValue(value: unknown): string {
  return value === null || value === undefined || value === "" ? "Não definido" : String(value);
}

function maskSecret(value?: string | null): string {
  if (!value) return "Não definido";
  if (value.length <= 8) return "••••••••";
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F6F5F0" },
  content: { paddingHorizontal: 22, paddingTop: 12, paddingBottom: 36 },
  emptyContainer: { flex: 1, justifyContent: "center", padding: 24 },
  backButton: { width: 42, height: 42, justifyContent: "center", marginBottom: 12 },
  backText: { color: "#1A201C", fontSize: 28 },
  step: { color: "#4A7C59", fontSize: 12, letterSpacing: 1.4, fontWeight: "800" },
  title: { color: "#1A201C", fontSize: 32, lineHeight: 38, fontWeight: "800", marginTop: 8 },
  description: { color: "#6B706B", fontSize: 14, lineHeight: 21, marginTop: 10, marginBottom: 20 },
  card: { backgroundColor: "#FFFFFF", borderRadius: 18, padding: 16, borderWidth: 1, borderColor: "#E4E4DC", marginBottom: 16 },
  cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 8 },
  cardTitle: { color: "#1A201C", fontSize: 16, fontWeight: "800", marginBottom: 8 },
  bodyText: { color: "#606760", fontSize: 13, lineHeight: 19 },
  secondaryButton: { borderRadius: 12, paddingVertical: 13, paddingHorizontal: 14, borderWidth: 1, borderColor: "#D8DED5", alignItems: "center", marginTop: 12 },
  secondaryButtonText: { color: "#1A201C", fontWeight: "700", fontSize: 14 },
  primaryButton: { minHeight: 52, borderRadius: 15, backgroundColor: "#1A201C", alignItems: "center", justifyContent: "center", paddingHorizontal: 16, marginTop: 12 },
  primaryButtonText: { color: "#FFFFFF", fontWeight: "800", fontSize: 15 },
  disabledButton: { opacity: 0.55 },
  pressedButton: { opacity: 0.8 },
  buttonContent: { flexDirection: "row", alignItems: "center", gap: 10 },
  loadingRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  networkRow: { paddingVertical: 14, borderTopWidth: 1, borderTopColor: "#ECECE5", flexDirection: "row", alignItems: "center", gap: 12 },
  networkInfo: { flex: 1 },
  rowTitle: { color: "#1A201C", fontWeight: "800", fontSize: 14 },
  mutedText: { color: "#70766F", fontSize: 12, lineHeight: 18, marginTop: 3 },
  linkText: { color: "#4A7C59", fontWeight: "800", fontSize: 12 },
  connectedCard: { backgroundColor: "#E7EEE7", borderRadius: 16, padding: 15, flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  statusDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#4A7C59" },
  sectionHeader: { marginTop: 14, marginBottom: 8, gap: 4 },
  sectionTitle: { color: "#1A201C", fontSize: 18, fontWeight: "800" },
  infoRow: { paddingVertical: 9, borderTopWidth: 1, borderTopColor: "#ECECE5", gap: 3 },
  infoLabel: { color: "#71776F", fontSize: 10, fontWeight: "800", letterSpacing: 0.5, textTransform: "uppercase" },
  infoValue: { color: "#1A201C", fontSize: 13, lineHeight: 18 },
  noteText: { color: "#70766F", fontSize: 12, lineHeight: 18, marginBottom: 8 },
  successCard: { backgroundColor: "#E7EEE7", borderRadius: 18, padding: 16, marginTop: 4 },
  successTitle: { color: "#355D42", fontSize: 16, fontWeight: "800", marginBottom: 8 },
  errorCard: { backgroundColor: "#F8E9E7", borderRadius: 14, padding: 14, marginTop: 14, borderWidth: 1, borderColor: "#E9C8C4" },
  errorTitle: { color: "#8C3535", fontWeight: "800", fontSize: 14, marginBottom: 5 },
  errorText: { color: "#7B3F3F", fontSize: 13, lineHeight: 19 },
});




/////////////////////
// versão que funcionava até 16/10/2026 17:38 (antes de arrumar a lat e long e o host fixo)
/////////////////////

// import { useEffect, useState } from "react";
// import {
//   ActivityIndicator,
//   Linking,
//   Platform,
//   Pressable,
//   ScrollView,
//   StyleSheet,
//   Text,
//   View,
// } from "react-native";
// import { SafeAreaView } from "react-native-safe-area-context";
// import { router } from "expo-router";
// import { useAuth0 } from "react-native-auth0";
// import * as Location from "expo-location";

// import { useSensors } from "../../../src/sensor/SensorContext";
// import {
//   connectToWifi,
//   findEspNetworks,
//   getCurrentWifiSSID,
//   type WifiNetwork,
// } from "../../../src/sensor/wifi/wifi.service";
// import { postDeviceToEsp } from "../../../src/sensor/esp.service";
// import { updateDevice } from "../../../src/sensor/device.service";
// import { saveDevices } from "../../../src/sensor/sensor.storage";

// const ESP_SSID = "DATALOGGER_CONFIG";
// const ESP_ENDPOINT = "http://192.168.4.1/api/config";

// export default function SensorWifiScreen() {
//   const { user } = useAuth0();
//   const {
//     devices,
//     selectedDevice,
//     setDevices,
//     setSelectedDevice,
//   } = useSensors();

//   const [loading, setLoading] = useState(Platform.OS === "android");
//   const [networks, setNetworks] = useState<WifiNetwork[]>([]);
//   const [currentSSID, setCurrentSSID] = useState<string | null>(null);
//   const [isConnectedToEsp, setIsConnectedToEsp] = useState(false);
//   const [checkingConnection, setCheckingConnection] = useState(false);
//   const [connecting, setConnecting] = useState(false);
//   const [selectedNetwork, setSelectedNetwork] = useState<WifiNetwork | null>(null);
//   const [error, setError] = useState<string | null>(null);
//   const [sending, setSending] = useState(false);
//   const [sendSuccess, setSendSuccess] = useState(false);

//   useEffect(() => {
//     void initializeWifi();
//   }, []);

//   async function initializeWifi() {
//     try {
//       const ssid = await getCurrentWifiSSID();
//       setCurrentSSID(ssid);
//       const connected = ssid === ESP_SSID;
//       setIsConnectedToEsp(connected);

//       if (Platform.OS === "android" && !connected) {
//         await scanForSensor();
//       }
//     } catch (err) {
//       console.error("WI-FI: erro ao inicializar:", err);
//       if (Platform.OS === "android") {
//         await scanForSensor();
//       } else {
//         setError("Não foi possível verificar a rede Wi-Fi atual.");
//       }
//     }
//   }

//   async function scanForSensor() {
//     try {
//       setLoading(true);
//       setError(null);

//       const permission = await Location.getForegroundPermissionsAsync();
//       let granted = permission.granted;

//       if (!granted) {
//         const requested = await Location.requestForegroundPermissionsAsync();
//         granted = requested.granted;
//       }

//       if (!granted) {
//         setError("Precisamos da permissão de localização para procurar o sensor.");
//         return;
//       }

//       const espNetworks = await findEspNetworks();
//       setNetworks(espNetworks);

//       if (espNetworks.length === 0) {
//         setError("Nenhum sensor encontrado. Verifique se ele está ligado e em modo de configuração.");
//       }
//     } catch (err) {
//       console.error("WI-FI: erro ao procurar redes:", err);
//       setError("Não foi possível procurar redes Wi-Fi. Confira as permissões e tente novamente.");
//     } finally {
//       setLoading(false);
//     }
//   }

//   function markAsConnected(ssid: string) {
//     const connected = ssid === ESP_SSID;
//     setCurrentSSID(ssid);
//     setIsConnectedToEsp(connected);
//     if (connected) {
//       setError(null);
//       setSendSuccess(false);
//     }
//     return connected;
//   }

//   async function checkManualConnection() {
//     try {
//       setCheckingConnection(true);
//       setError(null);
//       const ssid = await getCurrentWifiSSID();
//       const connected = markAsConnected(ssid ?? "");

//       if (!connected) {
//         setError(`Conecte o celular à rede ${ESP_SSID} e tente novamente.`);
//       }
//     } catch (err) {
//       console.error("WI-FI: erro verificando conexão:", err);
//       setError("Não foi possível verificar a conexão com o sensor.");
//     } finally {
//       setCheckingConnection(false);
//     }
//   }

//   async function handleConnect(network: WifiNetwork) {
//     try {
//       setConnecting(true);
//       setSelectedNetwork(network);
//       setError(null);

//       // A rede criada pelo ESP é aberta, portanto não precisa de senha.
//       const connected = await connectToWifi(network.SSID);
//       const ssid = await getCurrentWifiSSID();

//       if (!connected || ssid !== ESP_SSID) {
//         markAsConnected(ssid ?? "");
//         setError(`Não foi possível confirmar a conexão com ${network.SSID}. Tente novamente.`);
//         return;
//       }

//       markAsConnected(ssid);
//       console.log("WI-FI: conectado ao sensor; permanecendo nesta tela.");
//     } catch (err) {
//       console.error("WI-FI: falha ao conectar ao ESP:", err);
//       setError("Não foi possível conectar ao sensor.");
//     } finally {
//       setConnecting(false);
//     }
//   }

//   async function handleConfigureSensor() {
//     if (!selectedDevice) {
//       setError("Nenhum sensor foi selecionado.");
//       return;
//     }
//     if (!user?.sub) {
//       setError("Usuário não autenticado. Entre novamente no aplicativo.");
//       return;
//     }

//     try {
//       setSending(true);
//       setError(null);
//       setSendSuccess(false);

//       // Confirma a rede imediatamente antes do POST.
//       const ssid = await getCurrentWifiSSID();
//       console.log("CONFIGURAÇÃO: SSID antes do POST:", ssid);
//       if (ssid !== ESP_SSID) {
//         markAsConnected(ssid ?? "");
//         throw new Error(`A conexão com ${ESP_SSID} foi perdida. Reconecte-se e tente novamente.`);
//       }
//       markAsConnected(ssid);

//       // 1. Envia os parâmetros de configuração ao ESP.
//       const result = await postDeviceToEsp(selectedDevice);
//       if (result.status !== 200) {
//         if (result.status === 500) {
//           throw new Error("O sensor recusou a configuração. Verifique os dados e tente novamente.");
//         }
//         throw new Error(`O sensor retornou o código HTTP ${result.status}.`);
//       }

//       // 2. Só marca o sensor como configurado depois da resposta HTTP 200.
//       const configuredDevice = {
//         ...selectedDevice,
//         setup_date: Math.floor(Date.now() / 1000),
//       };
//       const updatedDevices = devices.map((device) =>
//         device.key === selectedDevice.key ? configuredDevice : device
//       );

//       setDevices(updatedDevices);
//       setSelectedDevice(configuredDevice);

//       // 3. Persiste no aparelho e atualiza o registro do usuário no Supabase.
//       await saveDevices(user.sub, updatedDevices);
//       await updateDevice(user.sub, selectedDevice.key, configuredDevice);

//       setSendSuccess(true);
//       console.log("CONFIGURAÇÃO: ESP, armazenamento local e Supabase atualizados.");
//     } catch (err) {
//       console.error("CONFIGURAÇÃO: erro:", err);
//       setError(err instanceof Error ? err.message : "Não foi possível configurar o sensor.");
//     } finally {
//       setSending(false);
//     }
//   }

//   if (!selectedDevice) {
//     return (
//       <SafeAreaView style={styles.container}>
//         <View style={styles.emptyContainer}>
//           <Text style={styles.title}>Nenhum sensor selecionado</Text>
//           <Text style={styles.description}>Volte e selecione o sensor que deseja configurar.</Text>
//           <Pressable onPress={() => router.back()} style={styles.primaryButton}>
//             <Text style={styles.primaryButtonText}>Voltar</Text>
//           </Pressable>
//         </View>
//       </SafeAreaView>
//     );
//   }

//   const setupDatePreview = Math.floor(Date.now() / 1000);
//   const latitude = selectedDevice.lat;
//   const longitude = selectedDevice.lon;

//   return (
//     <SafeAreaView style={styles.container}>
//       <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
//         <Pressable disabled={sending} onPress={() => router.back()} style={styles.backButton}>
//           <Text style={styles.backText}>←</Text>
//         </Pressable>

//         <Text style={styles.step}>ETAPA 3 · CONFIGURAÇÃO</Text>
//         <Text style={styles.title}>{isConnectedToEsp ? "Configure seu sensor." : "Conecte seu sensor."}</Text>
//         <Text style={styles.description}>
//           Conecte-se à rede do dispositivo e envie a configuração sem sair desta tela.
//         </Text>

//         {!isConnectedToEsp && (
//           <>
//             {Platform.OS === "ios" ? (
//               <View style={styles.card}>
//                 <Text style={styles.cardTitle}>Conexão manual</Text>
//                 <Text style={styles.bodyText}>
//                   Abra os ajustes de Wi-Fi, conecte-se à rede {ESP_SSID} e volte para o SmartFarm.
//                 </Text>
//                 <Pressable onPress={() => Linking.openSettings()} style={styles.secondaryButton}>
//                   <Text style={styles.secondaryButtonText}>Abrir ajustes de Wi-Fi</Text>
//                 </Pressable>
//                 <Pressable disabled={checkingConnection} onPress={checkManualConnection} style={styles.primaryButton}>
//                   {checkingConnection ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>Já estou conectado</Text>}
//                 </Pressable>
//               </View>
//             ) : (
//               <View style={styles.card}>
//                 <View style={styles.cardHeader}>
//                   <Text style={styles.cardTitle}>Sensores encontrados</Text>
//                   <Pressable disabled={loading || connecting} onPress={scanForSensor}>
//                     <Text style={styles.linkText}>Procurar novamente</Text>
//                   </Pressable>
//                 </View>
//                 {loading ? (
//                   <View style={styles.loadingRow}>
//                     <ActivityIndicator color="#4A7C59" />
//                     <Text style={styles.bodyText}>Procurando redes Wi-Fi...</Text>
//                   </View>
//                 ) : networks.length === 0 ? (
//                   <Text style={styles.bodyText}>Nenhuma rede {ESP_SSID} encontrada.</Text>
//                 ) : (
//                   networks.map((network) => (
//                     <Pressable
//                       key={network.BSSID || network.SSID}
//                       disabled={connecting}
//                       onPress={() => handleConnect(network)}
//                       style={styles.networkRow}
//                     >
//                       <View style={styles.networkInfo}>
//                         <Text style={styles.rowTitle}>{network.SSID}</Text>
//                         <Text style={styles.mutedText}>Sinal: {network.level} dBm</Text>
//                       </View>
//                       {selectedNetwork?.BSSID === network.BSSID && connecting ? (
//                         <ActivityIndicator color="#4A7C59" />
//                       ) : (
//                         <Text style={styles.linkText}>Conectar →</Text>
//                       )}
//                     </Pressable>
//                   ))
//                 )}
//               </View>
//             )}
//           </>
//         )}

//         {isConnectedToEsp && (
//           <>
//             <View style={styles.connectedCard}>
//               <View style={styles.statusDot} />
//               <View style={styles.networkInfo}>
//                 <Text style={styles.rowTitle}>Sensor conectado</Text>
//                 <Text style={styles.mutedText}>Rede: {currentSSID}</Text>
//               </View>
//               <Pressable disabled={checkingConnection || sending} onPress={checkManualConnection}>
//                 <Text style={styles.linkText}>Verificar</Text>
//               </Pressable>
//             </View>

//             <SectionTitle title="Enviado ao dispositivo (ESP)" subtitle="POST HTTP para o sensor. As chaves são ocultadas na tela." />
//             <View style={styles.card}>
//               <InfoRow label="Método" value="POST" />
//               <InfoRow label="Endpoint" value={ESP_ENDPOINT} />
//               <InfoRow label="Host" value={displayValue(selectedDevice.Host)} />
//               <InfoRow label="devEUI" value={displayValue(selectedDevice.devEUI)} />
//               <InfoRow label="devAddress" value={displayValue(selectedDevice.devAddress)} />
//               <InfoRow label="app_s_key" value={maskSecret(selectedDevice.app_s_key)} />
//               <InfoRow label="nwk_s_key" value={maskSecret(selectedDevice.nwk_s_key)} />
//             </View>

//             <SectionTitle title="Salvo no aplicativo e no Supabase" subtitle="Após o ESP responder HTTP 200, o app atualiza o estado local e o registro do usuário." />
//             <View style={styles.card}>
//               <InfoRow label="userId" value={displayValue(user?.sub)} />
//               <InfoRow label="Sensor (key)" value={displayValue(selectedDevice.key)} />
//               <InfoRow label="Host" value={displayValue(selectedDevice.Host)} />
//               <InfoRow label="devEUI" value={displayValue(selectedDevice.devEUI)} />
//               <InfoRow label="devAddress" value={displayValue(selectedDevice.devAddress)} />
//               <InfoRow label="app_s_key" value={maskSecret(selectedDevice.app_s_key)} />
//               <InfoRow label="nwk_s_key" value={maskSecret(selectedDevice.nwk_s_key)} />
//               <InfoRow label="Latitude (lat)" value={displayValue(latitude)} />
//               <InfoRow label="Longitude (lon)" value={displayValue(longitude)} />
//               <InfoRow label="setup_date (Unix, estimado)" value={String(setupDatePreview)} />
//             </View>

//             <Text style={styles.noteText}>
//               As coordenadas e o setup_date são mantidos no cadastro do aplicativo/Supabase; eles não fazem parte do resumo dos campos enviados ao ESP acima.
//             </Text>

//             {sendSuccess && (
//               <View style={styles.successCard}>
//                 <Text style={styles.successTitle}>✓ Sensor configurado com sucesso</Text>
//                 <Text style={styles.bodyText}>O ESP respondeu com sucesso e os dados foram salvos no aplicativo e no Supabase.</Text>
//                 <Pressable onPress={() => router.replace("/sensor/success")} style={styles.primaryButton}>
//                   <Text style={styles.primaryButtonText}>Continuar</Text>
//                 </Pressable>
//               </View>
//             )}

//             {!sendSuccess && (
//               <Pressable
//                 disabled={sending || checkingConnection}
//                 onPress={handleConfigureSensor}
//                 style={({ pressed }) => [styles.primaryButton, (sending || checkingConnection) && styles.disabledButton, pressed && styles.pressedButton]}
//               >
//                 {sending ? (
//                   <View style={styles.buttonContent}>
//                     <ActivityIndicator color="#FFFFFF" />
//                     <Text style={styles.primaryButtonText}>Configurando...</Text>
//                   </View>
//                 ) : (
//                   <Text style={styles.primaryButtonText}>Configurar sensor</Text>
//                 )}
//               </Pressable>
//             )}
//           </>
//         )}

//         {error && (
//           <View style={styles.errorCard}>
//             <Text style={styles.errorTitle}>Não foi possível concluir</Text>
//             <Text style={styles.errorText}>{error}</Text>
//           </View>
//         )}
//       </ScrollView>
//     </SafeAreaView>
//   );
// }

// function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) {
//   return (
//     <View style={styles.sectionHeader}>
//       <Text style={styles.sectionTitle}>{title}</Text>
//       <Text style={styles.mutedText}>{subtitle}</Text>
//     </View>
//   );
// }

// function InfoRow({ label, value }: { label: string; value: string }) {
//   return (
//     <View style={styles.infoRow}>
//       <Text style={styles.infoLabel}>{label}</Text>
//       <Text selectable style={styles.infoValue}>{value}</Text>
//     </View>
//   );
// }

// function displayValue(value: unknown): string {
//   return value === null || value === undefined || value === "" ? "Não definido" : String(value);
// }

// function maskSecret(value?: string | null): string {
//   if (!value) return "Não definido";
//   if (value.length <= 8) return "••••••••";
//   return `${value.slice(0, 4)}••••${value.slice(-4)}`;
// }

// const styles = StyleSheet.create({
//   container: { flex: 1, backgroundColor: "#F6F5F0" },
//   content: { paddingHorizontal: 22, paddingTop: 12, paddingBottom: 36 },
//   emptyContainer: { flex: 1, justifyContent: "center", padding: 24 },
//   backButton: { width: 42, height: 42, justifyContent: "center", marginBottom: 12 },
//   backText: { color: "#1A201C", fontSize: 28 },
//   step: { color: "#4A7C59", fontSize: 12, letterSpacing: 1.4, fontWeight: "800" },
//   title: { color: "#1A201C", fontSize: 32, lineHeight: 38, fontWeight: "800", marginTop: 8 },
//   description: { color: "#6B706B", fontSize: 14, lineHeight: 21, marginTop: 10, marginBottom: 20 },
//   card: { backgroundColor: "#FFFFFF", borderRadius: 18, padding: 16, borderWidth: 1, borderColor: "#E4E4DC", marginBottom: 16 },
//   cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 8 },
//   cardTitle: { color: "#1A201C", fontSize: 16, fontWeight: "800", marginBottom: 8 },
//   bodyText: { color: "#606760", fontSize: 13, lineHeight: 19 },
//   secondaryButton: { borderRadius: 12, paddingVertical: 13, paddingHorizontal: 14, borderWidth: 1, borderColor: "#D8DED5", alignItems: "center", marginTop: 12 },
//   secondaryButtonText: { color: "#1A201C", fontWeight: "700", fontSize: 14 },
//   primaryButton: { minHeight: 52, borderRadius: 15, backgroundColor: "#1A201C", alignItems: "center", justifyContent: "center", paddingHorizontal: 16, marginTop: 12 },
//   primaryButtonText: { color: "#FFFFFF", fontWeight: "800", fontSize: 15 },
//   disabledButton: { opacity: 0.55 },
//   pressedButton: { opacity: 0.8 },
//   buttonContent: { flexDirection: "row", alignItems: "center", gap: 10 },
//   loadingRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
//   networkRow: { paddingVertical: 14, borderTopWidth: 1, borderTopColor: "#ECECE5", flexDirection: "row", alignItems: "center", gap: 12 },
//   networkInfo: { flex: 1 },
//   rowTitle: { color: "#1A201C", fontWeight: "800", fontSize: 14 },
//   mutedText: { color: "#70766F", fontSize: 12, lineHeight: 18, marginTop: 3 },
//   linkText: { color: "#4A7C59", fontWeight: "800", fontSize: 12 },
//   connectedCard: { backgroundColor: "#E7EEE7", borderRadius: 16, padding: 15, flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
//   statusDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#4A7C59" },
//   sectionHeader: { marginTop: 14, marginBottom: 8, gap: 4 },
//   sectionTitle: { color: "#1A201C", fontSize: 18, fontWeight: "800" },
//   infoRow: { paddingVertical: 9, borderTopWidth: 1, borderTopColor: "#ECECE5", gap: 3 },
//   infoLabel: { color: "#71776F", fontSize: 10, fontWeight: "800", letterSpacing: 0.5, textTransform: "uppercase" },
//   infoValue: { color: "#1A201C", fontSize: 13, lineHeight: 18 },
//   noteText: { color: "#70766F", fontSize: 12, lineHeight: 18, marginBottom: 8 },
//   successCard: { backgroundColor: "#E7EEE7", borderRadius: 18, padding: 16, marginTop: 4 },
//   successTitle: { color: "#355D42", fontSize: 16, fontWeight: "800", marginBottom: 8 },
//   errorCard: { backgroundColor: "#F8E9E7", borderRadius: 14, padding: 14, marginTop: 14, borderWidth: 1, borderColor: "#E9C8C4" },
//   errorTitle: { color: "#8C3535", fontWeight: "800", fontSize: 14, marginBottom: 5 },
//   errorText: { color: "#7B3F3F", fontSize: 13, lineHeight: 19 },
// });




/////////////////////
// wifi.tsx original
/////////////////////

// import {
//   ActivityIndicator,
//   Linking,
//   Pressable,
//   StyleSheet,
//   Text,
//   View,
// } from "react-native";

// import * as Location from "expo-location";

// import { SafeAreaView } from "react-native-safe-area-context";

// import { router } from "expo-router";

// import { useEffect, useState } from "react";

// import { Platform } from "react-native";

// import {
//   connectToWifi,
//   findEspNetworks,
//   getCurrentWifiSSID,
//   type WifiNetwork,
// } from "../../../src/sensor/wifi/wifi.service";

// export default function SensorWifiScreen() {
//   const [loading, setLoading] = useState(true);

//   const [networks, setNetworks] =
//     useState<WifiNetwork[]>([]);

//   const [currentSSID, setCurrentSSID] = useState<string | null>(null);

//   const [checkingConnection, setCheckingConnection] = useState(false);

//   const [isConnectedToEsp, setIsConnectedToEsp] = useState(false);

//   const [connecting, setConnecting] = useState(false);

//   const [selectedNetwork, setSelectedNetwork] = useState<WifiNetwork | null>(null);

//   const [connectedSSID, setConnectedSSID] = useState<string | null>(null);

//   const [error, setError] = useState<string | null>(
//     null
//   );

//   useEffect(() => {
//     if (Platform.OS === "android") {
//       scanForSensor();
//     }
//   }, []);

//   async function scanForSensor() {
//     try {
//       setLoading(true);
//       setError(null);

//       console.log("WI-FI: verificando permissão");

//       const permission =
//         await Location.getForegroundPermissionsAsync();

//       let granted = permission.granted;

//       if (!granted) {
//         console.log("WI-FI: solicitando permissão");

//         const requested =
//           await Location.requestForegroundPermissionsAsync();

//         granted = requested.granted;
//       }

//       if (!granted) {
//         setError(
//           "Precisamos da permissão de localização para procurar o sensor."
//         );
//         return;
//       }

//       console.log("WI-FI: permissão concedida");

//       console.log("WI-FI: iniciando scan");

//       const espNetworks = await findEspNetworks();

//       console.log(
//         "WI-FI: redes encontradas:",
//         espNetworks
//       );

//       setNetworks(espNetworks);
//     } catch (error) {
//       console.error(
//         "WI-FI: erro ao procurar redes:",
//         error
//       );

//       setError(
//         "Para encontrar o sensor, permita o acesso à localização."
//       );
//     } finally {
//       setLoading(false);
//     }
//   }



//   async function checkEspConnection() {
//     try {
//       setCheckingConnection(true);
//       setError(null);

//       console.log(
//         "WI-FI: verificando rede atual"
//       );

//       const ssid = await getCurrentWifiSSID();

//       console.log(
//         "WI-FI: SSID atual:",
//         ssid
//       );

//       setCurrentSSID(ssid);

//       const connected =
//         !!ssid &&
//         ssid.startsWith("DATA");

//       setIsConnectedToEsp(connected);

//       if (!connected) {
//         setError(
//           "Seu celular ainda não está conectado à rede do sensor."
//         );
//       }
//     } catch (error) {
//       console.error(
//         "WI-FI: erro verificando conexão:",
//         error
//       );

//       setError(
//         "Não foi possível verificar a rede atual."
//       );
//     } finally {
//       setCheckingConnection(false);
//     }
//   }

//   async function handleConnect(network: WifiNetwork) {
//     try {
//       setConnecting(true);
//       setSelectedNetwork(network);
//       setError(null);

//       console.log(
//         "WI-FI: usuário selecionou:",
//         network.SSID
//       );

//       const connected = await connectToWifi(
//         network.SSID,
//         '12345678'
//       );

//       if (!connected) {
//         setError(
//           `Não foi possível conectar ao ${network.SSID}.`
//         );

//         return;
//       }

//       setConnectedSSID(network.SSID);

//       console.log(
//         "WI-FI: conectado ao sensor!"
//       );
//     } catch (error) {
//       console.error(
//         "WI-FI: erro durante conexão:",
//         error
//       );

//       setError(
//         "Não foi possível conectar ao sensor."
//       );
//     } finally {
//       setConnecting(false);
//     }
//   }

//   return (
//     <SafeAreaView style={styles.container}>
//       {Platform.OS === "ios" ? (
//         <View style={styles.manualContainer}>
//           <View>
//             <Pressable
//               onPress={() => router.back()}
//               style={styles.backButton}
//             >
//               <Text style={styles.backText}>
//                 ←
//               </Text>
//             </Pressable>

//             <Text style={styles.step}>
//               ETAPA 3
//             </Text>

//             <Text style={styles.manualTitle}>
//               Conecte seu{"\n"}
//               sensor.
//             </Text>

//             <Text style={styles.manualDescription}>
//               Para continuar, conecte o iPhone à rede
//               Wi-Fi criada pelo seu sensor.
//             </Text>

//             <View style={styles.instructionList}>
//               <View style={styles.instructionCard}>
//                 <View style={styles.instructionNumber}>
//                   <Text style={styles.instructionNumberText}>
//                     1
//                   </Text>
//                 </View>

//                 <View style={styles.instructionContent}>
//                   <Text style={styles.instructionTitle}>
//                     Abra os ajustes
//                   </Text>

//                   <Text style={styles.instructionText}>
//                     Abra os ajustes de Wi-Fi do seu iPhone.
//                   </Text>
//                 </View>
//               </View>

//               <View style={styles.instructionCard}>
//                 <View style={styles.instructionNumber}>
//                   <Text style={styles.instructionNumberText}>
//                     2
//                   </Text>
//                 </View>

//                 <View style={styles.instructionContent}>
//                   <Text style={styles.instructionTitle}>
//                     Encontre o sensor
//                   </Text>

//                   <Text style={styles.instructionText}>
//                     Procure uma rede que comece com{" "}
//                     <Text style={styles.highlight}>
//                       DATALOGGER
//                     </Text>
//                   </Text>
//                 </View>
//               </View>

//               <View style={styles.instructionCard}>
//                 <View style={styles.instructionNumber}>
//                   <Text style={styles.instructionNumberText}>
//                     3
//                   </Text>
//                 </View>

//                 <View style={styles.instructionContent}>
//                   <Text style={styles.instructionTitle}>
//                     Conecte-se à rede
//                   </Text>

//                   <Text style={styles.instructionText}>
//                     Depois de conectar, volte para o
//                     aplicativo SmartFarm.
//                   </Text>
//                 </View>
//               </View>
//             </View>
//           </View>

//           <View style={styles.manualBottom}>
//             <Pressable
//               onPress={() => Linking.openSettings()}
//               style={styles.secondaryButton}
//             >
//               <Text style={styles.secondaryButtonText}>
//                 Abrir ajustes
//               </Text>
//             </Pressable>

//             <Pressable
//               disabled={checkingConnection}
//               onPress={checkEspConnection}
//               style={({ pressed }) => [
//                 styles.button,
//                 pressed && styles.buttonPressed,
//                 checkingConnection && styles.buttonDisabled,
//               ]}
//             >
//               {checkingConnection ? (
//                 <ActivityIndicator color="#FFFFFF" />
//               ) : (
//                 <>
//                   <Text style={styles.buttonText}>
//                     Já estou conectado
//                   </Text>

//                   <Text style={styles.buttonArrow}>
//                     →
//                   </Text>
//                 </>
//               )}
//             </Pressable>

//             {isConnectedToEsp && (
//               <View style={styles.successCard}>
//                 <View style={styles.successDot} />

//                 <Text style={styles.successText}>
//                   Conectado a {currentSSID}
//                 </Text>
//               </View>
//             )}
//           </View>
//         </View>
//       ) : (
//         // Android
//         <View style={styles.content}>
//           <Pressable
//             onPress={() => router.back()}
//             style={styles.backButton}
//           >
//             <Text style={styles.backText}>
//               ←
//             </Text>
//           </Pressable>

//           <View style={styles.main}>
//             <Text style={styles.step}>
//               ETAPA 3
//             </Text>

//             <Text style={styles.title}>
//               Procurando{"\n"}
//               seu sensor...
//             </Text>

//             <Text style={styles.description}>
//               Estamos procurando uma rede Wi-Fi
//               criada pelo seu sensor.
//             </Text>

//             {loading && (
//               <View style={styles.statusCard}>
//                 <ActivityIndicator
//                   size="small"
//                   color="#4A7C59"
//                 />

//                 <Text style={styles.statusText}>
//                   Procurando redes próximas...
//                 </Text>
//               </View>
//             )}

//             {!loading && error && (
//               <View style={styles.statusCard}>
//                 <View style={styles.errorDot} />

//                 <Text style={styles.statusText}>
//                   {error}
//                 </Text>
//               </View>
//             )}

//             {!loading &&
//               !error &&
//               networks.length === 0 && (
//                 <View style={styles.statusCard}>
//                   <View style={styles.emptyDot} />

//                   <View style={styles.statusContent}>
//                     <Text style={styles.statusTitle}>
//                       Nenhum sensor encontrado
//                     </Text>

//                     <Text style={styles.statusDescription}>
//                       Verifique se o sensor está ligado
//                       e em modo de configuração.
//                     </Text>
//                   </View>
//                 </View>
//               )}

//             {!loading &&
//               !error &&
//               networks.length > 0 && (
//                 <View style={styles.networkList}>
//                   <Text style={styles.listTitle}>
//                     Sensor encontrado
//                   </Text>

//                   {networks.map((network) => (
//                     <Pressable
//                       key={network.BSSID}
//                       disabled={connecting}
//                       onPress={() => handleConnect(network)}
//                       style={({ pressed }) => [
//                         styles.networkCard,

//                         selectedNetwork?.BSSID === network.BSSID &&
//                           styles.networkCardSelected,

//                         pressed &&
//                           !connecting &&
//                           styles.networkCardPressed,

//                         connecting &&
//                           selectedNetwork?.BSSID !== network.BSSID &&
//                           styles.networkCardDisabled,
//                       ]}
//                     >
//                       <View style={styles.networkIcon}>
//                         <Text style={styles.networkIconText}>
//                           Wi
//                         </Text>
//                       </View>

//                       <View style={styles.networkContent}>
//                         <Text style={styles.networkName}>
//                           {network.SSID}
//                         </Text>

//                         <Text style={styles.networkSignal}>
//                           Sinal: {network.level} dBm
//                         </Text>
//                       </View>

//                       {selectedNetwork?.BSSID === network.BSSID &&
//                       connecting ? (
//                         <ActivityIndicator
//                           size="small"
//                           color="#4A7C59"
//                         />
//                       ) : connectedSSID === network.SSID ? (
//                         <Text style={styles.connectedIcon}>
//                           ✓
//                         </Text>
//                       ) : (
//                         <Text style={styles.networkArrow}>
//                           →
//                         </Text>
//                       )}
//                     </Pressable>
//                   ))}
//                 </View>
//               )}
//               {connectedSSID && (
//               <View style={styles.connectedCard}>
//                 <View style={styles.connectedDot} />

//                 <View style={styles.connectedContent}>
//                   <Text style={styles.connectedTitle}>
//                     Sensor conectado
//                   </Text>

//                   <Text style={styles.connectedDescription}>
//                     Seu celular está conectado a {connectedSSID}.
//                   </Text>
//                 </View>
//               </View>
//             )}
//           </View>
//           {connectedSSID && (
//             <Pressable
//               onPress={() => router.push("/sensor/post")}
//               style={styles.button}
//             >
//               <Text style={styles.buttonText}>
//                 Continuar
//               </Text>

//               <Text style={styles.buttonArrow}>
//                 →
//               </Text>
//             </Pressable>
//           )}

//           {!loading && (
//             <View style={styles.bottom}>
//               <Pressable
//                 onPress={scanForSensor}
//                 style={styles.secondaryButton}
//               >
//                 <Text style={styles.secondaryButtonText}>
//                   Procurar novamente
//                 </Text>
//               </Pressable>
//             </View>
//           )}
//         </View>
//       )}
//     </SafeAreaView>
//   );
// }

// const styles = StyleSheet.create({
//   container: {
//     flex: 1,
//     backgroundColor: "#F6F5F0",
//   },

//   content: {
//     flex: 1,
//     paddingHorizontal: 24,
//     paddingVertical: 20,
//     justifyContent: "space-between",
//   },

//   backButton: {
//     width: 44,
//     height: 44,
//     justifyContent: "center",
//   },

//   backText: {
//     fontSize: 28,
//     color: "#1A201C",
//   },

//   main: {
//     marginTop: 20,
//   },

//   step: {
//     fontSize: 12,
//     fontWeight: "700",
//     letterSpacing: 1.5,
//     color: "#4A7C59",
//   },

//   title: {
//     marginTop: 12,
//     fontSize: 40,
//     lineHeight: 43,
//     fontWeight: "800",
//     letterSpacing: -1.2,
//     color: "#1A201C",
//   },

//   description: {
//     marginTop: 20,
//     fontSize: 16,
//     lineHeight: 25,
//     color: "#6B706B",
//   },

//   statusCard: {
//     marginTop: 32,
//     padding: 20,
//     borderRadius: 24,
//     backgroundColor: "#FFFFFF",
//     flexDirection: "row",
//     alignItems: "center",
//     gap: 14,
//   },

//   statusContent: {
//     flex: 1,
//   },

//   statusText: {
//     flex: 1,
//     color: "#1A201C",
//     fontSize: 15,
//     fontWeight: "600",
//   },

//   statusTitle: {
//     color: "#1A201C",
//     fontSize: 16,
//     fontWeight: "700",
//   },

//   statusDescription: {
//     marginTop: 5,
//     color: "#6B706B",
//     fontSize: 13,
//     lineHeight: 19,
//   },

//   errorDot: {
//     width: 12,
//     height: 12,
//     borderRadius: 999,
//     backgroundColor: "#A34B4B",
//   },

//   emptyDot: {
//     width: 12,
//     height: 12,
//     borderRadius: 999,
//     backgroundColor: "#D7D7D2",
//   },

//   networkList: {
//     marginTop: 32,
//     gap: 12,
//   },

//   listTitle: {
//     marginBottom: 4,
//     color: "#1A201C",
//     fontSize: 17,
//     fontWeight: "700",
//   },

//   networkCard: {
//     padding: 18,
//     borderRadius: 22,
//     backgroundColor: "#FFFFFF",
//     flexDirection: "row",
//     alignItems: "center",
//     gap: 14,
//   },

//   networkCardPressed: {
//     opacity: 0.7,
//   },

//   networkIcon: {
//     width: 42,
//     height: 42,
//     borderRadius: 14,
//     backgroundColor: "#E7EEE7",
//     alignItems: "center",
//     justifyContent: "center",
//   },

//   networkIconText: {
//     color: "#4A7C59",
//     fontSize: 12,
//     fontWeight: "800",
//   },

//   networkContent: {
//     flex: 1,
//   },

//   networkName: {
//     color: "#1A201C",
//     fontSize: 16,
//     fontWeight: "700",
//   },

//   networkSignal: {
//     marginTop: 4,
//     color: "#6B706B",
//     fontSize: 13,
//   },

//   networkArrow: {
//     color: "#1A201C",
//     fontSize: 21,
//   },

//   bottom: {
//     gap: 12,
//   },

//   secondaryButton: {
//     minHeight: 50,
//     justifyContent: "center",
//     alignItems: "center",
//   },

//   secondaryButtonText: {
//     color: "#1A201C",
//     fontSize: 14,
//     fontWeight: "600",
//     textDecorationLine: "underline",
//   },

//   networkCardSelected: {
//   borderWidth: 1,
//   borderColor: "#4A7C59",
// },

// networkCardDisabled: {
//   opacity: 0.45,
// },

// connectedIcon: {
//   color: "#4A7C59",
//   fontSize: 22,
//   fontWeight: "800",
// },

// connectedCard: {
//   marginTop: 16,
//   padding: 18,
//   borderRadius: 22,
//   backgroundColor: "#E7EEE7",
//   flexDirection: "row",
//   alignItems: "center",
//   gap: 12,
// },

// connectedDot: {
//   width: 10,
//   height: 10,
//   borderRadius: 999,
//   backgroundColor: "#4A7C59",
// },

// connectedContent: {
//   flex: 1,
// },

// connectedTitle: {
//   color: "#355D42",
//   fontSize: 15,
//   fontWeight: "800",
// },

// connectedDescription: {
//   marginTop: 4,
//   color: "#6B706B",
//   fontSize: 13,
//   lineHeight: 19,
// },

// button: {
//   marginTop: 18,
//   minHeight: 58,
//   borderRadius: 999,
//   backgroundColor: "#1A201C",
//   flexDirection: "row",
//   alignItems: "center",
//   justifyContent: "center",
//   gap: 10,
// },

// buttonText: {
//   color: "#FFFFFF",
//   fontSize: 16,
//   fontWeight: "700",
// },

// buttonArrow: {
//   color: "#FFFFFF",
//   fontSize: 21,
// },

//   /*
//    * ============================
//    * IPHONE
//    * ============================
//    */

//   manualContainer: {
//     flex: 1,
//     paddingHorizontal: 24,
//     paddingVertical: 20,
//     justifyContent: "space-between",
//   },

//   manualTitle: {
//     marginTop: 12,
//     fontSize: 40,
//     lineHeight: 43,
//     fontWeight: "800",
//     letterSpacing: -1.2,
//     color: "#1A201C",
//   },

//   manualDescription: {
//     marginTop: 20,
//     fontSize: 16,
//     lineHeight: 25,
//     color: "#6B706B",
//   },

//   instructionList: {
//     marginTop: 30,
//     gap: 12,
//   },

//   instructionCard: {
//     padding: 18,
//     borderRadius: 22,
//     backgroundColor: "#FFFFFF",
//     flexDirection: "row",
//     alignItems: "center",
//     gap: 14,
//   },

//   instructionNumber: {
//     width: 34,
//     height: 34,
//     borderRadius: 17,
//     backgroundColor: "#E7EEE7",
//     alignItems: "center",
//     justifyContent: "center",
//   },

//   instructionNumberText: {
//     color: "#4A7C59",
//     fontSize: 14,
//     fontWeight: "800",
//   },

//   instructionContent: {
//     flex: 1,
//   },

//   instructionTitle: {
//     color: "#1A201C",
//     fontSize: 15,
//     fontWeight: "700",
//   },

//   instructionText: {
//     marginTop: 4,
//     color: "#6B706B",
//     fontSize: 13,
//     lineHeight: 19,
//   },

//   highlight: {
//     color: "#4A7C59",
//     fontWeight: "800",
//   },

//   manualBottom: {
//     gap: 6,
//   },

//   buttonPressed: {
//     opacity: 0.8,
//   },

//   buttonDisabled: {
//     opacity: 0.45,
//   },

//   successCard: {
//     marginTop: 10,
//     paddingHorizontal: 16,
//     paddingVertical: 13,
//     borderRadius: 18,
//     backgroundColor: "#E7EEE7",
//     flexDirection: "row",
//     alignItems: "center",
//     justifyContent: "center",
//     gap: 9,
//   },

//   successDot: {
//     width: 9,
//     height: 9,
//     borderRadius: 999,
//     backgroundColor: "#4A7C59",
//   },

//   successText: {
//     color: "#355D42",
//     fontSize: 14,
//     fontWeight: "700",
//   },
// });


