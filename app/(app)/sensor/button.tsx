import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { SafeAreaView } from "react-native-safe-area-context";

import { router } from "expo-router";

export default function SensorButtonScreen() {
  function handleButtonConfirmation() {
    router.push("./wifi");
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
          <Text style={styles.step}>
            ETAPA 2
          </Text>

          <Text style={styles.title}>
            Agora, fique{"\n"}
            próximo ao sensor.
          </Text>

          <Text style={styles.description}>
            Pressione o botão de configuração
            localizado no próprio sensor.
          </Text>

          <View style={styles.instructionCard}>
            <View style={styles.number}>
              <Text style={styles.numberText}>
                1
              </Text>
            </View>

            <View style={styles.instructionContent}>
              <Text style={styles.instructionTitle}>
                Vá até o sensor
              </Text>

              <Text style={styles.instructionText}>
                Mantenha o celular próximo ao
                dispositivo durante a configuração.
              </Text>
            </View>
          </View>

          <View style={styles.instructionCard}>
            <View style={styles.number}>
              <Text style={styles.numberText}>
                2
              </Text>
            </View>

            <View style={styles.instructionContent}>
              <Text style={styles.instructionTitle}>
                Pressione o botão
              </Text>

              <Text style={styles.instructionText}>
                Aguarde o sensor entrar no modo
                de configuração.
              </Text>
            </View>
          </View>
        </View>

        <View>
          <Pressable
            onPress={handleButtonConfirmation}
            style={({ pressed }) => [
              styles.button,
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={styles.buttonText}>
              Já apertei o botão
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
    marginTop: 10,
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

  instructionCard: {
    marginTop: 18,
    padding: 18,
    borderRadius: 22,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
  },

  number: {
    width: 32,
    height: 32,
    borderRadius: 999,
    backgroundColor: "#E7EEE7",
    alignItems: "center",
    justifyContent: "center",
  },

  numberText: {
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
    marginTop: 5,
    color: "#6B706B",
    fontSize: 13,
    lineHeight: 19,
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
});