
import React from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth0 } from "react-native-auth0";
import { router } from "expo-router";
import { colors } from "@/theme/colors";


export default function HomeScreen() {
  const { clearSession } = useAuth0();

  async function handleLogout() {
    try {
      await clearSession({ returnToUrl: `smartfarm://${process.env.EXPO_PUBLIC_AUTH_DOMAIN}/android/br.com.smartfarm.app/callback` });
      router.replace("/sign-in");
    } catch (error) {
      console.error("Erro ao fazer logout:", error);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        
        {/* Cabeçalho com o Logo em versão reduzida */}
        <View style={styles.header}>
          <Image 
            source={require("../../assets/smartfarm_logo.png")} 
            style={styles.smallLogo}
            resizeMode="contain"
          />
          <Text style={styles.title}>SmartFarm</Text>
          <Text style={styles.subtext}>
            Login realizado com sucesso.
          </Text>
        </View>

        {/* Ações */}
        <View style={styles.actions}>
          <Pressable
            onPress={() => router.push("./sensor/post")}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.primaryButtonPressed,
            ]}
          >
            <Text style={styles.primaryButtonText}>
              Configurar sensor
            </Text>
            <Text style={styles.primaryButtonIcon}>→</Text>
          </Pressable>

          <Pressable
            onPress={handleLogout}
            style={({ pressed }) => [
              styles.secondaryButton,
              pressed && styles.secondaryButtonPressed,
            ]}
          >
            <Text style={styles.secondaryButtonText}>
              Sair da conta
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
    paddingHorizontal: 32,
    justifyContent: "center",
  },
  header: {
    alignItems: "center",
    marginBottom: 32,
  },
  smallLogo: {
    width: 72,
    height: 72,
    marginBottom: 12,
  },
  title: {
    fontSize: 36,
    fontWeight: "900",
    color: colors.text,
    letterSpacing: -1,
  },
  subtext: {
    marginTop: 6,
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: "center",
  },
  
  // Card de Status
  dashboardCard: {
    backgroundColor: colors.greenSoft,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    marginBottom: 36,
  },
  cardEmoji: {
    fontSize: 32,
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.dark,
    marginBottom: 4,
  },
  cardDescription: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 18,
  },

  // Botões
  actions: {
    gap: 12,
  },
  primaryButton: {
    backgroundColor: colors.green,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 56,
    borderRadius: 16,
    paddingHorizontal: 24,
    gap: 8,
    shadowColor: colors.greenDark,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryButtonPressed: {
    backgroundColor: colors.greenDark,
    transform: [{ scale: 0.98 }],
    shadowOpacity: 0.05,
  },
  primaryButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: "700",
  },
  primaryButtonIcon: {
    color: colors.white,
    fontSize: 18,
    fontWeight: "600",
  },
  secondaryButton: {
    minHeight: 56,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    backgroundColor: "transparent",
  },
  secondaryButtonPressed: {
    backgroundColor: colors.greenSoft,
  },
  secondaryButtonText: {
    color: colors.textSecondary,
    fontSize: 15,
    fontWeight: "600",
  },
});