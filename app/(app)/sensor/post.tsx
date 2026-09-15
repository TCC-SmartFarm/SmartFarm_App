import React, {
  useEffect,
  useState,
} from "react";

import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { SafeAreaView } from "react-native-safe-area-context";

import { router } from "expo-router";

import { useAuth0 } from "react-native-auth0";

import { useSensors } from "../../../src/sensor/SensorContext";

import {
  getCurrentWifiSSID,
} from "../../../src/sensor/wifi/wifi.service";

import {
  postDeviceToEsp,
} from "../../../src/sensor/esp.service";

import {
  updateDevice,
} from "../../../src/sensor/device.service";

import {
  saveDevices,
} from "../../../src/sensor/sensor.storage";

import { colors } from "@/theme/colors";

export default function SensorPostScreen() {
  const { user } = useAuth0();

  const {
    devices,
    selectedDevice,
    setDevices,
    setSelectedDevice,
  } = useSensors();

  const [currentSSID, setCurrentSSID] =
    useState<string | null>(null);

  const [checkingWifi, setCheckingWifi] =
    useState(true);

  const [sending, setSending] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const [
    sendSuccess,
    setSendSuccess,
  ] = useState(false);

  useEffect(() => {
    checkWifi();
  }, []);

  async function checkWifi() {
    try {
      setCheckingWifi(true);
      setError(null);

      const ssid =
        await getCurrentWifiSSID();

      console.log(
        "POST: SSID atual:",
        ssid
      );

      setCurrentSSID(ssid);

      if (!ssid?.startsWith("esp_")) {
        setError(
          "Seu celular não está conectado à rede do sensor."
        );
      }
    } catch (err) {
      console.error(
        "POST: erro verificando Wi-Fi:",
        err
      );

      setError(
        "Não foi possível verificar a conexão com o sensor."
      );
    } finally {
      setCheckingWifi(false);
    }
  }

  async function handlePost() {
    if (!selectedDevice) {
      setError(
        "Nenhum sensor foi selecionado."
      );
      return;
    }

    if (!user?.sub) {
      setError(
        "Usuário não autenticado."
      );
      return;
    }

    try {
      setSending(true);
      setError(null);
      setSendSuccess(false);

      // Confirma novamente o Wi-Fi antes do POST
      const ssid =
        await getCurrentWifiSSID();

      console.log(
        "POST: verificando SSID antes do envio:",
        ssid
      );

      if (!ssid?.startsWith("esp_")) {
        throw new Error(
          "Seu celular não está conectado à rede do sensor."
        );
      }

      const result =
        await postDeviceToEsp(
          selectedDevice
        );

      if (result.status === 200) {
        console.log(
          "POST: configuração aceita pelo ESP"
        );

        const setupDate =
          Math.floor(
            Math.floor(Date.now() / 1000)
          );

        const configuredDevice = {
          ...selectedDevice,
          setup_date: setupDate,
        };

        /*
         * Atualiza o array global
         */
        const updatedDevices =
          devices.map((device) =>
            device.key ===
            selectedDevice.key
              ? configuredDevice
              : device
          );

        setDevices(updatedDevices);

        /*
         * Atualiza o device selecionado
         */
        setSelectedDevice(
          configuredDevice
        );

        /*
         * Atualiza o storage local.
         *
         * Isso é importante porque daqui para frente
         * o aplicativo pode estar sem Internet.
         */
        await saveDevices(
          user.sub,
          updatedDevices
        );

        /*
         * Atualiza o Supabase.
         *
         * O POST para o ESP já deu certo, então
         * agora marcamos o sensor como configurado.
         */
        await updateDevice(
          user.sub,
          selectedDevice.key,
          configuredDevice
        );

        setSendSuccess(true);

        /*
         * Pequena pausa visual antes da próxima tela.
         */
        setTimeout(() => {
          router.replace(
            "/sensor/success"
          );
        }, 700);

        return;
      }

      if (result.status === 500) {
        setError(
          "O sensor recusou a configuração. Verifique os dados e tente novamente."
        );

        return;
      }

      setError(
        `O sensor retornou o código ${result.status}.`
      );
    } catch (err) {
      console.error(
        "POST: erro:",
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível configurar o sensor."
      );
    } finally {
      setSending(false);
    }
  }

  if (!selectedDevice) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>
            Nenhum sensor selecionado
          </Text>

          <Text style={styles.emptyText}>
            Volte para a tela anterior e
            selecione um sensor.
          </Text>

          <Pressable
            onPress={() => router.back()}
            style={styles.button}
          >
            <Text style={styles.buttonText}>
              Voltar
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const isConnectedToEsp =
    !!currentSSID &&
    currentSSID.startsWith("esp_");

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Pressable
          onPress={() => router.back()}
          style={styles.backButton}
          disabled={sending}
        >
          <Text style={styles.backText}>
            ←
          </Text>
        </Pressable>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={
            styles.scrollContent
          }
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.eyebrow}>
            ETAPA FINAL
          </Text>

          <Text style={styles.title}>
            Configurando{"\n"}
            seu sensor.
          </Text>

          <Text style={styles.description}>
            Estamos enviando as informações
            cadastradas para o sensor através da
            rede Wi-Fi local.
          </Text>

          {/* Sensor */}

          <View style={styles.sensorCard}>
            <View
              style={styles.sensorIndicator}
            />

            <View style={styles.sensorInfo}>
              <Text style={styles.sensorTitle}>
                Sensor {selectedDevice.key}
              </Text>

              <Text style={styles.sensorEui}>
                devEUI: {selectedDevice.devEUI}
              </Text>

              <Text style={styles.sensorAddress}>
                Endereço:{" "}
                {selectedDevice.devAddress}
              </Text>
            </View>
          </View>

          {/* Wi-Fi */}

          <View style={styles.statusCard}>
            <View
              style={[
                styles.statusIndicator,
                isConnectedToEsp &&
                  styles.statusIndicatorSuccess,
                !isConnectedToEsp &&
                  styles.statusIndicatorError,
              ]}
            />

            <View
              style={styles.statusContent}
            >
              <Text style={styles.statusTitle}>
                {checkingWifi
                  ? "Verificando conexão"
                  : isConnectedToEsp
                    ? "Sensor conectado"
                    : "Sensor não conectado"}
              </Text>

              <Text
                style={styles.statusDescription}
              >
                {checkingWifi
                  ? "Verificando a rede Wi-Fi atual."
                  : isConnectedToEsp
                    ? `Conectado a ${currentSSID}`
                    : "Conecte-se à rede esp_ do sensor."}
              </Text>
            </View>
          </View>

          {/* Dados */}

          <View style={styles.dataCard}>
            <Text style={styles.dataTitle}>
              Dados que serão enviados
            </Text>

            <DataRow
              label="Host"
              value={selectedDevice.Host}
            />

            <DataRow
              label="devEUI"
              value={selectedDevice.devEUI}
            />

            <DataRow
              label="devAddress"
              value={
                selectedDevice.devAddress
              }
            />

            <DataRow
              label="app_s_key"
              value={
                selectedDevice.app_s_key
              }
              secret
            />

            <DataRow
              label="nwk_s_key"
              value={
                selectedDevice.nwk_s_key
              }
              secret
            />
          </View>

          {sendSuccess && (
            <View
              style={styles.successCard}
            >
              <View
                style={styles.successDot}
              />

              <Text
                style={styles.successText}
              >
                Sensor configurado com sucesso.
              </Text>
            </View>
          )}

          {error && (
            <View
              style={styles.errorCard}
            >
              <Text
                style={styles.errorTitle}
              >
                Não foi possível configurar
              </Text>

              <Text
                style={styles.errorText}
              >
                {error}
              </Text>
            </View>
          )}
        </ScrollView>

        <View style={styles.bottom}>
          {!isConnectedToEsp &&
            !checkingWifi && (
              <Pressable
                onPress={checkWifi}
                disabled={sending}
                style={
                  styles.secondaryButton
                }
              >
                <Text
                  style={
                    styles.secondaryButtonText
                  }
                >
                  Verificar conexão
                </Text>
              </Pressable>
            )}

          <Pressable
            disabled={
              sending ||
              checkingWifi ||
              !isConnectedToEsp ||
              sendSuccess
            }
            onPress={handlePost}
            style={({ pressed }) => [
              styles.button,
              (!isConnectedToEsp ||
                checkingWifi ||
                sending ||
                sendSuccess) &&
                styles.buttonDisabled,
              pressed &&
                !sending &&
                styles.buttonPressed,
            ]}
          >
            {sending ? (
              <ActivityIndicator
                color={colors.white}
              />
            ) : (
              <>
                <Text
                  style={styles.buttonText}
                >
                  {sendSuccess
                    ? "Configurado"
                    : "Configurar sensor"}
                </Text>

                {!sendSuccess && (
                  <Text
                    style={styles.buttonArrow}
                  >
                    →
                  </Text>
                )}
              </>
            )}
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

function DataRow({
  label,
  value,
  secret = false,
}: {
  label: string;
  value: string;
  secret?: boolean;
}) {
  return (
    <View style={styles.dataRow}>
      <Text style={styles.dataLabel}>
        {label}
      </Text>

      <Text
        style={styles.dataValue}
        numberOfLines={1}
        ellipsizeMode="middle"
      >
        {secret
          ? `${value.slice(0, 4)}••••${value.slice(-4)}`
          : value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 8,
  },

  backButton: {
    width: 44,
    height: 44,
    justifyContent: "center",
  },

  backText: {
    fontSize: 28,
    color: colors.dark,
  },

  scroll: {
    flex: 1,
  },

  scrollContent: {
    paddingTop: 20,
    paddingBottom: 24,
  },

  eyebrow: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.5,
    color: colors.green,
  },

  title: {
    marginTop: 12,
    fontSize: 40,
    lineHeight: 43,
    fontWeight: "800",
    letterSpacing: -1.2,
    color: colors.dark,
  },

  description: {
    marginTop: 20,
    fontSize: 15,
    lineHeight: 23,
    color: colors.textSecondary,
  },

  sensorCard: {
    marginTop: 28,
    padding: 18,
    borderRadius: 20,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
  },

  sensorIndicator: {
    width: 10,
    height: 10,
    borderRadius: 10,
    backgroundColor: colors.green,
    marginRight: 12,
  },

  sensorInfo: {
    flex: 1,
    minWidth: 0,
  },

  sensorTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: colors.dark,
  },

  sensorEui: {
    marginTop: 4,
    fontSize: 12,
    color: colors.textSecondary,
  },

  sensorAddress: {
    marginTop: 4,
    fontSize: 12,
    color: colors.textSecondary,
  },

  statusCard: {
    marginTop: 14,
    padding: 16,
    borderRadius: 18,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
  },

  statusIndicator: {
    width: 10,
    height: 10,
    borderRadius: 10,
    backgroundColor: "#D7D7D2",
    marginRight: 12,
  },

  statusIndicatorSuccess: {
    backgroundColor: colors.green,
  },

  statusIndicatorError: {
    backgroundColor: "#A34B4B",
  },

  statusContent: {
    flex: 1,
  },

  statusTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.dark,
  },

  statusDescription: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
  },

  dataCard: {
    marginTop: 14,
    padding: 18,
    borderRadius: 20,
    backgroundColor: colors.greenSoft,
    borderWidth: 1,
    borderColor: colors.border,
  },

  dataTitle: {
    marginBottom: 12,
    fontSize: 15,
    fontWeight: "800",
    color: colors.dark,
  },

  dataRow: {
    paddingVertical: 9,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },

  dataLabel: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: colors.textSecondary,
  },

  dataValue: {
    marginTop: 3,
    fontSize: 12,
    color: colors.dark,
  },

  successCard: {
    marginTop: 14,
    padding: 15,
    borderRadius: 16,
    backgroundColor: colors.greenSoft,
    flexDirection: "row",
    alignItems: "center",
  },

  successDot: {
    width: 9,
    height: 9,
    borderRadius: 9,
    backgroundColor: colors.green,
    marginRight: 10,
  },

  successText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
    color: colors.greenDark,
  },

  errorCard: {
    marginTop: 14,
    padding: 16,
    borderRadius: 16,
    backgroundColor: "#F5E5E5",
    borderWidth: 1,
    borderColor: "#E0C6C6",
  },

  errorTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#8A3737",
  },

  errorText: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 18,
    color: "#8A3737",
  },

  bottom: {
    paddingTop: 10,
    paddingBottom: 10,
    gap: 10,
    backgroundColor: colors.background,
  },

  secondaryButton: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },

  secondaryButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.dark,
    textDecorationLine: "underline",
  },

  button: {
    minHeight: 58,
    paddingHorizontal: 24,
    borderRadius: 999,
    backgroundColor: colors.dark,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },

  buttonDisabled: {
    opacity: 0.35,
  },

  buttonPressed: {
    opacity: 0.8,
  },

  buttonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: "700",
  },

  buttonArrow: {
    color: colors.white,
    fontSize: 21,
  },

  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
  },

  emptyTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: colors.dark,
  },

  emptyText: {
    marginTop: 8,
    fontSize: 15,
    lineHeight: 22,
    color: colors.textSecondary,
    marginBottom: 24,
  },
});