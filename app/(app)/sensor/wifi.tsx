import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import * as Location from "expo-location";

import { SafeAreaView } from "react-native-safe-area-context";

import { router } from "expo-router";

import { useEffect, useState } from "react";

import { Platform } from "react-native";

import {
  connectToWifi,
  findEspNetworks,
  getCurrentWifiSSID,
  type WifiNetwork,
} from "../../../src/sensor/wifi/wifi.service";

export default function SensorWifiScreen() {
  const [loading, setLoading] = useState(true);

  const [networks, setNetworks] =
    useState<WifiNetwork[]>([]);

  const [currentSSID, setCurrentSSID] = useState<string | null>(null);

  const [checkingConnection, setCheckingConnection] = useState(false);

  const [isConnectedToEsp, setIsConnectedToEsp] = useState(false);

  const [connecting, setConnecting] = useState(false);

  const [selectedNetwork, setSelectedNetwork] = useState<WifiNetwork | null>(null);

  const [connectedSSID, setConnectedSSID] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(
    null
  );

  useEffect(() => {
    if (Platform.OS === "android") {
      scanForSensor();
    }
  }, []);

  async function scanForSensor() {
    try {
      setLoading(true);
      setError(null);

      console.log("WI-FI: verificando permissão");

      const permission =
        await Location.getForegroundPermissionsAsync();

      let granted = permission.granted;

      if (!granted) {
        console.log("WI-FI: solicitando permissão");

        const requested =
          await Location.requestForegroundPermissionsAsync();

        granted = requested.granted;
      }

      if (!granted) {
        setError(
          "Precisamos da permissão de localização para procurar o sensor."
        );
        return;
      }

      console.log("WI-FI: permissão concedida");

      console.log("WI-FI: iniciando scan");

      const espNetworks = await findEspNetworks();

      console.log(
        "WI-FI: redes encontradas:",
        espNetworks
      );

      setNetworks(espNetworks);
    } catch (error) {
      console.error(
        "WI-FI: erro ao procurar redes:",
        error
      );

      setError(
        "Para encontrar o sensor, permita o acesso à localização."
      );
    } finally {
      setLoading(false);
    }
  }



  async function checkEspConnection() {
    try {
      setCheckingConnection(true);
      setError(null);

      console.log(
        "WI-FI: verificando rede atual"
      );

      const ssid = await getCurrentWifiSSID();

      console.log(
        "WI-FI: SSID atual:",
        ssid
      );

      setCurrentSSID(ssid);

      const connected =
        !!ssid &&
        ssid.startsWith("esp_");

      setIsConnectedToEsp(connected);

      if (!connected) {
        setError(
          "Seu celular ainda não está conectado à rede do sensor."
        );
      }
    } catch (error) {
      console.error(
        "WI-FI: erro verificando conexão:",
        error
      );

      setError(
        "Não foi possível verificar a rede atual."
      );
    } finally {
      setCheckingConnection(false);
    }
  }

  async function handleConnect(network: WifiNetwork) {
    try {
      setConnecting(true);
      setSelectedNetwork(network);
      setError(null);

      console.log(
        "WI-FI: usuário selecionou:",
        network.SSID
      );

      const connected = await connectToWifi(
        network.SSID,
        '12345678'
      );

      if (!connected) {
        setError(
          `Não foi possível conectar ao ${network.SSID}.`
        );

        return;
      }

      setConnectedSSID(network.SSID);

      console.log(
        "WI-FI: conectado ao sensor!"
      );
    } catch (error) {
      console.error(
        "WI-FI: erro durante conexão:",
        error
      );

      setError(
        "Não foi possível conectar ao sensor."
      );
    } finally {
      setConnecting(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      {Platform.OS === "ios" ? (
        <View style={styles.manualContainer}>
          <View>
            <Pressable
              onPress={() => router.back()}
              style={styles.backButton}
            >
              <Text style={styles.backText}>
                ←
              </Text>
            </Pressable>

            <Text style={styles.step}>
              ETAPA 3
            </Text>

            <Text style={styles.manualTitle}>
              Conecte seu{"\n"}
              sensor.
            </Text>

            <Text style={styles.manualDescription}>
              Para continuar, conecte o iPhone à rede
              Wi-Fi criada pelo seu sensor.
            </Text>

            <View style={styles.instructionList}>
              <View style={styles.instructionCard}>
                <View style={styles.instructionNumber}>
                  <Text style={styles.instructionNumberText}>
                    1
                  </Text>
                </View>

                <View style={styles.instructionContent}>
                  <Text style={styles.instructionTitle}>
                    Abra os ajustes
                  </Text>

                  <Text style={styles.instructionText}>
                    Abra os ajustes de Wi-Fi do seu iPhone.
                  </Text>
                </View>
              </View>

              <View style={styles.instructionCard}>
                <View style={styles.instructionNumber}>
                  <Text style={styles.instructionNumberText}>
                    2
                  </Text>
                </View>

                <View style={styles.instructionContent}>
                  <Text style={styles.instructionTitle}>
                    Encontre o sensor
                  </Text>

                  <Text style={styles.instructionText}>
                    Procure uma rede que comece com{" "}
                    <Text style={styles.highlight}>
                      esp_
                    </Text>
                  </Text>
                </View>
              </View>

              <View style={styles.instructionCard}>
                <View style={styles.instructionNumber}>
                  <Text style={styles.instructionNumberText}>
                    3
                  </Text>
                </View>

                <View style={styles.instructionContent}>
                  <Text style={styles.instructionTitle}>
                    Conecte-se à rede
                  </Text>

                  <Text style={styles.instructionText}>
                    Depois de conectar, volte para o
                    aplicativo SmartFarm.
                  </Text>
                </View>
              </View>
            </View>
          </View>

          <View style={styles.manualBottom}>
            <Pressable
              onPress={() => Linking.openSettings()}
              style={styles.secondaryButton}
            >
              <Text style={styles.secondaryButtonText}>
                Abrir ajustes
              </Text>
            </Pressable>

            <Pressable
              disabled={checkingConnection}
              onPress={checkEspConnection}
              style={({ pressed }) => [
                styles.button,
                pressed && styles.buttonPressed,
                checkingConnection && styles.buttonDisabled,
              ]}
            >
              {checkingConnection ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Text style={styles.buttonText}>
                    Já estou conectado
                  </Text>

                  <Text style={styles.buttonArrow}>
                    →
                  </Text>
                </>
              )}
            </Pressable>

            {isConnectedToEsp && (
              <View style={styles.successCard}>
                <View style={styles.successDot} />

                <Text style={styles.successText}>
                  Conectado a {currentSSID}
                </Text>
              </View>
            )}
          </View>
        </View>
      ) : (
        // Android
        <View style={styles.content}>
          <Pressable
            onPress={() => router.back()}
            style={styles.backButton}
          >
            <Text style={styles.backText}>
              ←
            </Text>
          </Pressable>

          <View style={styles.main}>
            <Text style={styles.step}>
              ETAPA 3
            </Text>

            <Text style={styles.title}>
              Procurando{"\n"}
              seu sensor...
            </Text>

            <Text style={styles.description}>
              Estamos procurando uma rede Wi-Fi
              criada pelo seu sensor.
            </Text>

            {loading && (
              <View style={styles.statusCard}>
                <ActivityIndicator
                  size="small"
                  color="#4A7C59"
                />

                <Text style={styles.statusText}>
                  Procurando redes próximas...
                </Text>
              </View>
            )}

            {!loading && error && (
              <View style={styles.statusCard}>
                <View style={styles.errorDot} />

                <Text style={styles.statusText}>
                  {error}
                </Text>
              </View>
            )}

            {!loading &&
              !error &&
              networks.length === 0 && (
                <View style={styles.statusCard}>
                  <View style={styles.emptyDot} />

                  <View style={styles.statusContent}>
                    <Text style={styles.statusTitle}>
                      Nenhum sensor encontrado
                    </Text>

                    <Text style={styles.statusDescription}>
                      Verifique se o sensor está ligado
                      e em modo de configuração.
                    </Text>
                  </View>
                </View>
              )}

            {!loading &&
              !error &&
              networks.length > 0 && (
                <View style={styles.networkList}>
                  <Text style={styles.listTitle}>
                    Sensor encontrado
                  </Text>

                  {networks.map((network) => (
                    <Pressable
                      key={network.BSSID}
                      disabled={connecting}
                      onPress={() => handleConnect(network)}
                      style={({ pressed }) => [
                        styles.networkCard,

                        selectedNetwork?.BSSID === network.BSSID &&
                          styles.networkCardSelected,

                        pressed &&
                          !connecting &&
                          styles.networkCardPressed,

                        connecting &&
                          selectedNetwork?.BSSID !== network.BSSID &&
                          styles.networkCardDisabled,
                      ]}
                    >
                      <View style={styles.networkIcon}>
                        <Text style={styles.networkIconText}>
                          Wi
                        </Text>
                      </View>

                      <View style={styles.networkContent}>
                        <Text style={styles.networkName}>
                          {network.SSID}
                        </Text>

                        <Text style={styles.networkSignal}>
                          Sinal: {network.level} dBm
                        </Text>
                      </View>

                      {selectedNetwork?.BSSID === network.BSSID &&
                      connecting ? (
                        <ActivityIndicator
                          size="small"
                          color="#4A7C59"
                        />
                      ) : connectedSSID === network.SSID ? (
                        <Text style={styles.connectedIcon}>
                          ✓
                        </Text>
                      ) : (
                        <Text style={styles.networkArrow}>
                          →
                        </Text>
                      )}
                    </Pressable>
                  ))}
                </View>
              )}
              {connectedSSID && (
              <View style={styles.connectedCard}>
                <View style={styles.connectedDot} />

                <View style={styles.connectedContent}>
                  <Text style={styles.connectedTitle}>
                    Sensor conectado
                  </Text>

                  <Text style={styles.connectedDescription}>
                    Seu celular está conectado a {connectedSSID}.
                  </Text>
                </View>
              </View>
            )}
          </View>
          {connectedSSID && (
            <Pressable
              onPress={() => router.push("/sensor/post")}
              style={styles.button}
            >
              <Text style={styles.buttonText}>
                Continuar
              </Text>

              <Text style={styles.buttonArrow}>
                →
              </Text>
            </Pressable>
          )}

          {!loading && (
            <View style={styles.bottom}>
              <Pressable
                onPress={scanForSensor}
                style={styles.secondaryButton}
              >
                <Text style={styles.secondaryButtonText}>
                  Procurar novamente
                </Text>
              </Pressable>
            </View>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F6F5F0",
  },

  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingVertical: 20,
    justifyContent: "space-between",
  },

  backButton: {
    width: 44,
    height: 44,
    justifyContent: "center",
  },

  backText: {
    fontSize: 28,
    color: "#1A201C",
  },

  main: {
    marginTop: 20,
  },

  step: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.5,
    color: "#4A7C59",
  },

  title: {
    marginTop: 12,
    fontSize: 40,
    lineHeight: 43,
    fontWeight: "800",
    letterSpacing: -1.2,
    color: "#1A201C",
  },

  description: {
    marginTop: 20,
    fontSize: 16,
    lineHeight: 25,
    color: "#6B706B",
  },

  statusCard: {
    marginTop: 32,
    padding: 20,
    borderRadius: 24,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },

  statusContent: {
    flex: 1,
  },

  statusText: {
    flex: 1,
    color: "#1A201C",
    fontSize: 15,
    fontWeight: "600",
  },

  statusTitle: {
    color: "#1A201C",
    fontSize: 16,
    fontWeight: "700",
  },

  statusDescription: {
    marginTop: 5,
    color: "#6B706B",
    fontSize: 13,
    lineHeight: 19,
  },

  errorDot: {
    width: 12,
    height: 12,
    borderRadius: 999,
    backgroundColor: "#A34B4B",
  },

  emptyDot: {
    width: 12,
    height: 12,
    borderRadius: 999,
    backgroundColor: "#D7D7D2",
  },

  networkList: {
    marginTop: 32,
    gap: 12,
  },

  listTitle: {
    marginBottom: 4,
    color: "#1A201C",
    fontSize: 17,
    fontWeight: "700",
  },

  networkCard: {
    padding: 18,
    borderRadius: 22,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },

  networkCardPressed: {
    opacity: 0.7,
  },

  networkIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "#E7EEE7",
    alignItems: "center",
    justifyContent: "center",
  },

  networkIconText: {
    color: "#4A7C59",
    fontSize: 12,
    fontWeight: "800",
  },

  networkContent: {
    flex: 1,
  },

  networkName: {
    color: "#1A201C",
    fontSize: 16,
    fontWeight: "700",
  },

  networkSignal: {
    marginTop: 4,
    color: "#6B706B",
    fontSize: 13,
  },

  networkArrow: {
    color: "#1A201C",
    fontSize: 21,
  },

  bottom: {
    gap: 12,
  },

  secondaryButton: {
    minHeight: 50,
    justifyContent: "center",
    alignItems: "center",
  },

  secondaryButtonText: {
    color: "#1A201C",
    fontSize: 14,
    fontWeight: "600",
    textDecorationLine: "underline",
  },

  networkCardSelected: {
  borderWidth: 1,
  borderColor: "#4A7C59",
},

networkCardDisabled: {
  opacity: 0.45,
},

connectedIcon: {
  color: "#4A7C59",
  fontSize: 22,
  fontWeight: "800",
},

connectedCard: {
  marginTop: 16,
  padding: 18,
  borderRadius: 22,
  backgroundColor: "#E7EEE7",
  flexDirection: "row",
  alignItems: "center",
  gap: 12,
},

connectedDot: {
  width: 10,
  height: 10,
  borderRadius: 999,
  backgroundColor: "#4A7C59",
},

connectedContent: {
  flex: 1,
},

connectedTitle: {
  color: "#355D42",
  fontSize: 15,
  fontWeight: "800",
},

connectedDescription: {
  marginTop: 4,
  color: "#6B706B",
  fontSize: 13,
  lineHeight: 19,
},

button: {
  marginTop: 18,
  minHeight: 58,
  borderRadius: 999,
  backgroundColor: "#1A201C",
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "center",
  gap: 10,
},

buttonText: {
  color: "#FFFFFF",
  fontSize: 16,
  fontWeight: "700",
},

buttonArrow: {
  color: "#FFFFFF",
  fontSize: 21,
},

  /*
   * ============================
   * IPHONE
   * ============================
   */

  manualContainer: {
    flex: 1,
    paddingHorizontal: 24,
    paddingVertical: 20,
    justifyContent: "space-between",
  },

  manualTitle: {
    marginTop: 12,
    fontSize: 40,
    lineHeight: 43,
    fontWeight: "800",
    letterSpacing: -1.2,
    color: "#1A201C",
  },

  manualDescription: {
    marginTop: 20,
    fontSize: 16,
    lineHeight: 25,
    color: "#6B706B",
  },

  instructionList: {
    marginTop: 30,
    gap: 12,
  },

  instructionCard: {
    padding: 18,
    borderRadius: 22,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },

  instructionNumber: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#E7EEE7",
    alignItems: "center",
    justifyContent: "center",
  },

  instructionNumberText: {
    color: "#4A7C59",
    fontSize: 14,
    fontWeight: "800",
  },

  instructionContent: {
    flex: 1,
  },

  instructionTitle: {
    color: "#1A201C",
    fontSize: 15,
    fontWeight: "700",
  },

  instructionText: {
    marginTop: 4,
    color: "#6B706B",
    fontSize: 13,
    lineHeight: 19,
  },

  highlight: {
    color: "#4A7C59",
    fontWeight: "800",
  },

  manualBottom: {
    gap: 6,
  },

  buttonPressed: {
    opacity: 0.8,
  },

  buttonDisabled: {
    opacity: 0.45,
  },

  successCard: {
    marginTop: 10,
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderRadius: 18,
    backgroundColor: "#E7EEE7",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },

  successDot: {
    width: 9,
    height: 9,
    borderRadius: 999,
    backgroundColor: "#4A7C59",
  },

  successText: {
    color: "#355D42",
    fontSize: 14,
    fontWeight: "700",
  },
});


