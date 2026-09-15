import React from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  Image,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth0 } from "react-native-auth0";
import { colors } from "@/theme/colors";


export default function SignInScreen() {
  const { authorize, isLoading } = useAuth0();

  async function handleLogin() {
    try {
      await authorize(
        { scope: "openid profile email" },
        { customScheme: "smartfarm" }
      );
    } catch (error) {
      console.error("Erro no login:", error);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        
        {/* Cabeçalho com o Logo Customizado */}
        <View style={styles.header}>
          <Image 
            source={require("../assets/smartfarm_logo.png")} 
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={styles.title}>SmartFarm</Text>
          <Text style={styles.subtitle}>
            Faça login para continuar.
          </Text>
        </View>

        {/* Botão de Entrada */}
        <Pressable
          onPress={handleLogin}
          disabled={isLoading}
          style={({ pressed }) => [
            styles.button,
            pressed && !isLoading && styles.buttonPressed,
            isLoading && styles.buttonDisabled,
          ]}
        >
          {isLoading ? (
            <ActivityIndicator color={colors.white} size="small" />
          ) : (
            <Text style={styles.buttonText}>Entrar</Text>
          )}
        </Pressable>

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
    marginBottom: 48,
  },
  logo: {
    width: 120,
    height: 120,
    marginBottom: 24,
  },
  title: {
    fontSize: 42,
    fontWeight: "900",
    color: colors.text,
    letterSpacing: -1,
  },
  subtitle: {
    marginTop: 8,
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: "center",
  },
  button: {
    backgroundColor: colors.green,
    minHeight: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.greenDark,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonPressed: {
    backgroundColor: colors.greenDark,
    transform: [{ scale: 0.98 }],
    shadowOpacity: 0.05,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: "700",
  },
});