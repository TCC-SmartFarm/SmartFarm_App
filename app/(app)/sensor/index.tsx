import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { SafeAreaView } from "react-native-safe-area-context";

import NetInfo from "@react-native-community/netinfo";

import { router } from "expo-router";
import { useEffect, useState } from "react";

export default function SensorSetupScreen() {
  const [checkingInternet, setCheckingInternet] =
    useState(true);

  const [hasInternet, setHasInternet] =
    useState<boolean | null>(null);

  useEffect(() => {
    checkInternet();
  }, []);

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

        <View style={styles.main}>
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

          <View style={styles.statusCard}>
            <View
              style={[
                styles.statusIndicator,
                hasInternet === true &&
                  styles.statusIndicatorSuccess,
                hasInternet === false &&
                  styles.statusIndicatorError,
              ]}
            />

            <View style={styles.statusContent}>
              <Text style={styles.statusTitle}>
                {checkingInternet
                  ? "Verificando conexão"
                  : hasInternet
                    ? "Você está conectado"
                    : "Sem conexão com a internet"}
              </Text>

              <Text style={styles.statusDescription}>
                {checkingInternet
                  ? "Aguarde um momento."
                  : hasInternet
                    ? "Podemos continuar com a configuração."
                    : "Conecte-se à internet e tente novamente."}
              </Text>
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

          <Pressable
            disabled={
              checkingInternet || hasInternet !== true
            }
            onPress={handleContinue}
            style={({ pressed }) => [
              styles.button,
              (checkingInternet ||
                hasInternet !== true) &&
                styles.buttonDisabled,
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={styles.buttonText}>
              Continuar
            </Text>

            <Text style={styles.buttonArrow}>
              →
            </Text>
          </Pressable>
        </View>
      </View>
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

  statusIndicator: {
    width: 12,
    height: 12,
    borderRadius: 999,
    backgroundColor: "#D7D7D2",
  },

  statusIndicatorSuccess: {
    backgroundColor: "#4A7C59",
  },

  statusIndicatorError: {
    backgroundColor: "#A34B4B",
  },

  statusContent: {
    flex: 1,
  },

  statusTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1A201C",
  },

  statusDescription: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 19,
    color: "#6B706B",
  },

  bottom: {
    gap: 12,
  },

  button: {
    minHeight: 58,
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

  buttonArrow: {
    color: "#FFFFFF",
    fontSize: 21,
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
});