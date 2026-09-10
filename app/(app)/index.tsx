import {
  Pressable,
  StyleSheet,
  Text,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth0 } from "react-native-auth0";
import { router } from "expo-router";

export default function HomeScreen() {
  const { clearSession } = useAuth0();

  async function handleLogout() {
    try {
      await clearSession();
      router.replace("/sign-in");
    } catch (error) {
      console.error("Erro ao fazer logout:", error);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.text}>
        SmartFarm
      </Text>

      <Text style={styles.subtext}>
        Login realizado com sucesso.
      </Text>

      <Pressable
        onPress={handleLogout}
        style={({ pressed }) => [
          styles.logoutButton,
          pressed && styles.logoutButtonPressed,
        ]}
      >
        <Text style={styles.logoutText}>
          Sair da conta
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
    backgroundColor: "#F6F5F0",
  },

  text: {
    fontSize: 32,
    fontWeight: "800",
    color: "#1A201C",
  },

  subtext: {
    marginTop: 12,
    fontSize: 16,
    color: "#6B706B",
  },

  logoutButton: {
    marginTop: 40,
    minWidth: 180,
    minHeight: 52,
    paddingHorizontal: 24,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#1A201C",
    alignItems: "center",
    justifyContent: "center",
  },

  logoutButtonPressed: {
    opacity: 0.6,
  },

  logoutText: {
    color: "#1A201C",
    fontSize: 15,
    fontWeight: "700",
  },
});