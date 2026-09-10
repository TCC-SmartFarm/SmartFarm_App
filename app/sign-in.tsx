import {
  Pressable,
  StyleSheet,
  Text,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth0 } from "react-native-auth0";

export default function SignInScreen() {
  const { authorize, isLoading } = useAuth0();

  async function handleLogin() {
    try {
      await authorize(
        {
          scope: "openid profile email",
        },
        {
          customScheme: "smartfarm",
        }
      );
    } catch (error) {
      console.error("Erro no login:", error);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>
        SmartFarm
      </Text>

      <Text style={styles.subtitle}>
        Faça login para continuar.
      </Text>

      <Pressable
        onPress={handleLogin}
        disabled={isLoading}
        style={styles.button}
      >
        <Text style={styles.buttonText}>
          {isLoading ? "Entrando..." : "Entrar"}
        </Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    backgroundColor: "#F6F5F0",
  },

  title: {
    fontSize: 42,
    fontWeight: "800",
    color: "#1A201C",
  },

  subtitle: {
    marginTop: 12,
    fontSize: 16,
    color: "#6B706B",
  },

  button: {
    marginTop: 32,
    minWidth: 180,
    minHeight: 54,
    paddingHorizontal: 24,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1A201C",
  },

  buttonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
});