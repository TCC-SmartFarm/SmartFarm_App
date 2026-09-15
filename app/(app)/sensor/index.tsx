import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  ScrollView,
} from "react-native";

import { SafeAreaView } from "react-native-safe-area-context";

import NetInfo from "@react-native-community/netinfo";
import { useAuth0 } from "react-native-auth0";

import { router } from "expo-router";
import { useEffect, useState } from "react";

import { useSensors } from "../../../src/sensor/SensorContext";

import {
  getUserDevices,
} from "../../../src/sensor/sensor.service";

import {
  loadDevices,
  saveDevices,
} from "../../../src/sensor/sensor.storage";
import { colors } from "@/theme/colors";

export default function SensorSetupScreen() {
  const [checkingInternet, setCheckingInternet] =
    useState(true);

  const [hasInternet, setHasInternet] =
    useState<boolean | null>(null);

  const { user } = useAuth0();

  const {
    devices,
    setDevices,
    setSelectedDevice,
  } = useSensors();

  const [loadingDevices, setLoadingDevices] = useState(true);

  useEffect(() => {
    checkInternet();
    if (!user?.sub) {
      return;
    }

    loadUserDevices(user.sub);
  }, [user?.sub]);

  async function loadUserDevices(auth0UserId: string) {
    try {
      setLoadingDevices(true);

      // Primeiro carrega o cache local
      const cachedDevices = await loadDevices(
        auth0UserId
      );

      if (cachedDevices.length > 0) {
        setDevices(cachedDevices);
      }

      // Depois tenta atualizar pelo Supabase
      const remoteDevices =
        await getUserDevices(auth0UserId);

      setDevices(remoteDevices);

      await saveDevices(
        auth0UserId,
        remoteDevices
      );

      console.log(
        "HOME: devices atualizados:",
        remoteDevices
      );
    } catch (error) {
      console.error(
        "HOME: erro ao carregar devices:",
        error
      );

      // Se Supabase falhar, continua usando cache
      if (devices.length === 0) {
        const cachedDevices =
          await loadDevices(auth0UserId);

        setDevices(cachedDevices);
      }
    } finally {
      setLoadingDevices(false);
    }
  }


  async function checkInternet() {
    try {
      setCheckingInternet(true);

      const state = await NetInfo.fetch();

      const connected =
        state.isConnected === true &&
        state.isInternetReachable !== false;

      setHasInternet(connected);
    } catch (error) {
      console.error(
        "Erro ao verificar internet:",
        error
      );

      setHasInternet(false);
    } finally {
      setCheckingInternet(false);
    }
  }

  function handleNewDevice() {
    router.push("/sensor/new-device");
  }

  function handleContinue() {
    router.push("/sensor/button");
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Pressable
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Text style={styles.backText}>
            ←
          </Text>
        </Pressable>

        <View style={styles.content}>
          <Text style={styles.eyebrow}>
            CONFIGURAÇÃO
          </Text>

          <Text style={styles.title}>
            Vamos preparar{"\n"}
            seu sensor.
          </Text>

          <Text style={styles.description}>
            Antes de começar, precisamos consultar
            as informações do sensor. Para isso,
            seu celular precisa estar conectado
            à internet.
          </Text>

          <View style={styles.contentSensores}>          
                {checkingInternet
                  ? <Text>Aguarde um momento.</Text>
                  : hasInternet
                    ?
                    <ScrollView
                      style={styles.scroll}
                      showsVerticalScrollIndicator={true}
                    >

                      {/* dashboard placeholder */}
                      <View style={styles.dashboardCard}>
                        <View style={styles.devicesSection}>
                          {loadingDevices && devices.length === 0 ? (
                            <ActivityIndicator />
                          ) : devices.length === 0 ? (
                            <View style={styles.emptyCard}>
                              <Text style={styles.emptyTitle}>
                                Nenhum sensor cadastrado
                              </Text>

                              <Text style={styles.emptyText}>
                                Você ainda não possui sensores cadastrados.
                              </Text>
                            </View>
                          ) : (
                            <View style={styles.list}>
                              {devices.map((device) => {
                                const isConfigured = device.setup_date !== 0;

                                return (
                                  <Pressable
                                    key={device.key}
                                    disabled={isConfigured}
                                    style={({ pressed }) => [
                                      styles.deviceCard,
                                      isConfigured && styles.deviceCardDisabled,
                                      pressed && !isConfigured && styles.deviceCardPressed,
                                    ]}
                                    onPress={() => {
                                      if (isConfigured) {
                                        return;
                                      }

                                      setSelectedDevice(device);
                                      handleContinue();
                                    }}
                                  >
                                    <View
                                      style={[
                                        styles.deviceIndicator,
                                        isConfigured
                                          ? styles.deviceIndicatorConfigured
                                          : styles.deviceIndicatorPending,
                                      ]}
                                    />

                                    <View style={styles.deviceInfo}>
                                      <View style={styles.deviceHeader}>
                                        <Text
                                          style={styles.deviceName}
                                          numberOfLines={1}
                                        >
                                          Sensor {device.key}
                                        </Text>

                                        <View
                                          style={[
                                            styles.statusBadge,
                                            isConfigured
                                              ? styles.statusBadgeConfigured
                                              : styles.statusBadgePending,
                                          ]}
                                        >
                                          <Text
                                            style={[
                                              styles.statusBadgeText,
                                              isConfigured
                                                ? styles.statusBadgeTextConfigured
                                                : styles.statusBadgeTextPending,
                                            ]}
                                          >
                                            {isConfigured
                                              ? "Configurado"
                                              : "Não configurado"}
                                          </Text>
                                        </View>
                                      </View>

                                      <Text
                                        style={styles.deviceId}
                                        numberOfLines={1}
                                        ellipsizeMode="middle"
                                      >
                                        devEUI: {device.devEUI}
                                      </Text>

                                      <View style={styles.deviceDetails}>
                                        <View style={styles.detailItem}>
                                          <Text style={styles.detailLabel}>
                                            Endereço
                                          </Text>

                                          <Text
                                            style={styles.detailValue}
                                            numberOfLines={1}
                                          >
                                            {device.devAddress}
                                          </Text>
                                        </View>

                                        <View style={styles.detailItem}>
                                          <Text style={styles.detailLabel}>
                                            Host
                                          </Text>

                                          <Text
                                            style={styles.detailValue}
                                            numberOfLines={1}
                                          >
                                            {device.Host}
                                          </Text>
                                        </View>
                                      </View>

                                      {!isConfigured && (
                                        <Text style={styles.setupHint}>
                                          Toque para configurar este sensor
                                        </Text>
                                      )}
                                    </View>

                                    {!isConfigured && (
                                      <Text style={styles.deviceArrow}>
                                        →
                                      </Text>
                                    )}
                                  </Pressable>
                                );
                              })}
                            </View>
                            
                          )}
                        </View>
                      </View>
                    </ScrollView>
                    : <Text>Conecte-se à internet e tente novamente.</Text>
                    }
              
            </View>

            {checkingInternet && (
              <ActivityIndicator
                size="small"
                color="#4A7C59"
              />
            )}
          </View>
        </View>

        <View style={styles.bottom}>
          {!hasInternet && !checkingInternet && (
            <Pressable
              onPress={checkInternet}
              style={styles.secondaryButton}
            >
              <Text style={styles.secondaryButtonText}>
                Verificar novamente
              </Text>
            </Pressable>
          )}        
        </View>
        <Pressable
            disabled={
              checkingInternet || hasInternet !== true
            }
            onPress={handleNewDevice}
            style={({ pressed }) => [
              styles.button,
              (checkingInternet ||
                hasInternet !== true) &&
                styles.buttonDisabled,
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={styles.buttonText}>
              Meu device não está na lista
            </Text>
          </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
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


  eyebrow: {
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
    marginTop: 22,
    marginBottom: 8,
    fontSize: 16,
    lineHeight: 25,
    color: "#6B706B",
  },

  bottom: {
    gap: 12,
  },

  button: {
    minHeight: 58,
    maxWidth: "70%",
    paddingHorizontal: 24,
    borderRadius: 999,
    backgroundColor: "#1A201C",
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
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },

  secondaryButton: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },

  secondaryButtonText: {
    color: "#1A201C",
    fontSize: 14,
    fontWeight: "600",
    textDecorationLine: "underline",
  },

  list: {
    gap: 12,
  },

  devicesSection: {
    width: "100%",
    // marginBottom: 28,
  },

  deviceCard: {
    width: "100%",
    minHeight: 72,
    paddingHorizontal: 18,
    paddingVertical: 14,
    marginBottom: 10,
    borderRadius: 18,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
  },

  deviceIndicator: {
    width: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: colors.green,
    marginRight: 14,
  },

  deviceInfo: {
    flex: 1,
  },

  deviceName: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.dark,
  },

  deviceId: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: "500",
    color: colors.dark,
  },

  emptyCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 20,
  },

  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1A201C",
  },

  emptyText: {
    fontSize: 14,
    color: "#6B706B",
    marginTop: 6,
  },

  /* Scroll */

  scroll: {
    flex: 1,
  },


  /* Devices */

  deviceCardPressed: {
    opacity: 0.75,
    transform: [{ scale: 0.99 }],
  },

  deviceDetails: {
    flexDirection: "row",
    marginTop: 8,
    gap: 16,
  },

  detailItem: {
    flex: 1,
    minWidth: 0,
  },

  detailLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  detailValue: {
    marginTop: 2,
    fontSize: 12,
    color: colors.dark,
  },

  deviceArrow: {
    marginLeft: 8,
    fontSize: 22,
    fontWeight: "600",
    color: colors.green,
  },
  statusBadge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },

  statusBadgeConfigured: {
    backgroundColor: colors.greenSoft,
  },

  statusBadgePending: {
    backgroundColor: "#fde2aeff",
  },

  statusBadgeText: {
    fontSize: 10,
    fontWeight: "800",
  },

  statusBadgeTextConfigured: {
    color: colors.greenDark,
  },

  statusBadgeTextPending: {
    color: "#8A5E18",
  },

  setupHint: {
    marginTop: 9,
    fontSize: 16,
    fontWeight: "700",
    color: "#8A5E18",
  },
  deviceIndicatorConfigured: {
    backgroundColor: colors.green,
  },

  deviceIndicatorPending: {
    backgroundColor: "#C58A2A",
  },
  deviceHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  deviceCardDisabled: {
    opacity: 0.65,
  },
  
  dashboardCard: {
    backgroundColor: colors.greenSoft,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    padding: 8,
    alignItems: "center",
    // marginBottom: 20,
  },
  contentSensores: {
    flex: 1,
    justifyContent: "center",
  },
});