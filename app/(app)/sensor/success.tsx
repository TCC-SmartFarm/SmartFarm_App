import React from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

import { useSensors } from "../../../src/sensor/SensorContext";

import { colors } from "@/theme/colors";

export default function SensorSuccessScreen() {
  const { selectedDevice } = useSensors();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.center}>
          <View style={styles.successCircle}>
            <Text style={styles.successCheck}>
              ✓
            </Text>
          </View>

          <Text style={styles.eyebrow}>
            CONFIGURAÇÃO CONCLUÍDA
          </Text>

          <Text style={styles.title}>
            Sensor configurado{"\n"}
            com sucesso.
          </Text>

          <Text style={styles.description}>
            Seu sensor recebeu as informações e
            está pronto para funcionar.
          </Text>

          {selectedDevice && (
            <View style={styles.sensorCard}>
              <View style={styles.sensorIndicator} />

              <View style={styles.sensorInfo}>
                <Text style={styles.sensorName}>
                  Sensor {selectedDevice.key}
                </Text>

                <Text
                  style={styles.sensorEui}
                  numberOfLines={1}
                  ellipsizeMode="middle"
                >
                  devEUI: {selectedDevice.devEUI}
                </Text>
              </View>

              <View style={styles.configuredBadge}>
                <Text style={styles.configuredBadgeText}>
                  Configurado
                </Text>
              </View>
            </View>
          )}
        </View>

        <View style={styles.bottom}>
          <Pressable
            onPress={() =>
              router.replace("/sensor")
            }
            style={({ pressed }) => [
              styles.primaryButton,
              pressed &&
                styles.primaryButtonPressed,
            ]}
          >
            <Text style={styles.primaryButtonText}>
              Voltar para sensores
            </Text>

            <Text style={styles.primaryButtonArrow}>
              →
            </Text>
          </Pressable>

          <Pressable
            onPress={() =>
              router.replace("/")
            }
            style={({ pressed }) => [
              styles.secondaryButton,
              pressed &&
                styles.secondaryButtonPressed,
            ]}
          >
            <Text style={styles.secondaryButtonText}>
              Ir para a Home
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
    backgroundColor: colors.background,
  },

  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingVertical: 24,
    justifyContent: "space-between",
  },

  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  successCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.greenSoft,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 28,
  },

  successCheck: {
    fontSize: 42,
    lineHeight: 48,
    fontWeight: "700",
    color: colors.green,
  },

  eyebrow: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.5,
    color: colors.green,
    textAlign: "center",
  },

  title: {
    marginTop: 12,
    fontSize: 36,
    lineHeight: 41,
    fontWeight: "800",
    letterSpacing: -1,
    color: colors.dark,
    textAlign: "center",
  },

  description: {
    maxWidth: 320,
    marginTop: 18,
    fontSize: 15,
    lineHeight: 23,
    color: colors.textSecondary,
    textAlign: "center",
  },

  sensorCard: {
    width: "100%",
    marginTop: 30,
    padding: 16,
    borderRadius: 18,
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

  sensorName: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.dark,
  },

  sensorEui: {
    marginTop: 4,
    fontSize: 12,
    color: colors.textSecondary,
  },

  configuredBadge: {
    marginLeft: 10,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    backgroundColor: colors.greenSoft,
  },

  configuredBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.greenDark,
  },

  bottom: {
    gap: 10,
  },

  primaryButton: {
    minHeight: 58,
    borderRadius: 999,
    backgroundColor: colors.dark,
    paddingHorizontal: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },

  primaryButtonPressed: {
    opacity: 0.8,
  },

  primaryButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.white,
  },

  primaryButtonArrow: {
    fontSize: 21,
    color: colors.white,
  },

  secondaryButton: {
    minHeight: 48,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },

  secondaryButtonPressed: {
    backgroundColor: colors.greenSoft,
  },

  secondaryButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textSecondary,
  },
});