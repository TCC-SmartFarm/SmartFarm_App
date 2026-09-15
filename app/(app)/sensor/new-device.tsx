import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth0 } from "react-native-auth0";
import { router } from "expo-router";

import { useSensors } from "../../../src/sensor/SensorContext";

import {
  createDevice,
} from "../../../src/sensor/device.service";

import {
  saveDevices,
} from "../../../src/sensor/sensor.storage";

import { colors } from "@/theme/colors";

export default function CreateSensorScreen() {
  const { user } = useAuth0();

  const {
    devices,
    setDevices,
    setSelectedDevice,
  } = useSensors();

  const [devEUI, setDevEUI] = useState("");
  const [devAddress, setDevAddress] = useState("");
  const [appSKey, setAppSKey] = useState("");
  const [nwkSKey, setNwkSKey] = useState("");
  const [host, setHost] = useState("192.168.4.1");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function isValid() {
    if (!devEUI.trim()) {
      return "Informe o devEUI.";
    }

    if (!devAddress.trim()) {
      return "Informe o devAddress.";
    }

    if (!appSKey.trim()) {
      return "Informe a app_s_key.";
    }

    if (!nwkSKey.trim()) {
      return "Informe a nwk_s_key.";
    }

    if (!host.trim()) {
      return "Informe o Host.";
    }

    return null;
  }

  async function handleCreate() {
    setError(null);

    if (!user?.sub) {
      setError("Usuário não autenticado.");
      return;
    }

    const validationError = isValid();

    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      setSaving(true);

      const newDevice = await createDevice({
        userId: user.sub,

        device: {
          Host: host.trim(),
          devEUI: devEUI.trim(),
          app_s_key: appSKey.trim(),
          nwk_s_key: nwkSKey.trim(),
          devAddress: devAddress.trim(),

          // Sensor recém-cadastrado ainda não foi configurado
          setup_date: 0,
        },
      });

      const updatedDevices = [
        ...devices,
        newDevice,
      ];

      setDevices(updatedDevices);

      await saveDevices(
        user.sub,
        updatedDevices
      );

      setSelectedDevice(newDevice);

      router.back();
    } catch (err) {
      console.error(
        "CREATE SENSOR:",
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível cadastrar o sensor."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={
          Platform.OS === "ios"
            ? "padding"
            : undefined
        }
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Pressable
            onPress={() => router.back()}
            style={styles.backButton}
          >
            <Text style={styles.backText}>
              ←
            </Text>
          </Pressable>

          <Text style={styles.eyebrow}>
            NOVO SENSOR
          </Text>

          <Text style={styles.title}>
            Cadastre um{"\n"}
            novo sensor.
          </Text>

          <Text style={styles.description}>
            Informe os dados do sensor para
            adicioná-lo à sua conta.
          </Text>

          <View style={styles.form}>
            <Input
              label="devEUI"
              value={devEUI}
              onChangeText={setDevEUI}
              placeholder="Ex.: 5e76ce4fd99eefe3"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Input
              label="devAddress"
              value={devAddress}
              onChangeText={setDevAddress}
              placeholder="Ex.: d99eefe3"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Input
              label="app_s_key"
              value={appSKey}
              onChangeText={setAppSKey}
              placeholder="32 caracteres hexadecimais"
              autoCapitalize="characters"
              autoCorrect={false}
            />

            <Input
              label="nwk_s_key"
              value={nwkSKey}
              onChangeText={setNwkSKey}
              placeholder="32 caracteres hexadecimais"
              autoCapitalize="characters"
              autoCorrect={false}
            />

            <Input
              label="Host"
              value={host}
              onChangeText={setHost}
              placeholder="Ex.: 192.168.4.1"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="numeric"
            />
          </View>

          <View style={styles.infoCard}>
            <View style={styles.infoIndicator} />

            <View style={styles.infoContent}>
              <Text style={styles.infoTitle}>
                Sensor ainda não configurado
              </Text>

              <Text style={styles.infoText}>
                Este sensor será cadastrado como
                pendente de configuração. A
                configuração física será realizada
                posteriormente.
              </Text>
            </View>
          </View>

          {error && (
            <View style={styles.errorCard}>
              <Text style={styles.errorText}>
                {error}
              </Text>
            </View>
          )}

          <View style={styles.bottomSpace} />
        </ScrollView>

        <View style={styles.bottom}>
          <Pressable
            disabled={saving}
            onPress={handleCreate}
            style={({ pressed }) => [
              styles.button,
              saving && styles.buttonDisabled,
              pressed &&
                !saving &&
                styles.buttonPressed,
            ]}
          >
            {saving ? (
              <ActivityIndicator
                size="small"
                color={colors.white}
              />
            ) : (
              <>
                <Text style={styles.buttonText}>
                  Cadastrar sensor
                </Text>

                <Text style={styles.buttonArrow}>
                  →
                </Text>
              </>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

type InputProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  autoCorrect?: boolean;
  keyboardType?: "default" | "numeric";
};

function Input({
  label,
  value,
  onChangeText,
  placeholder,
  autoCapitalize = "none",
  autoCorrect = false,
  keyboardType = "default",
}: InputProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>
        {label}
      </Text>

      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#9A9D98"
        autoCapitalize={autoCapitalize}
        autoCorrect={autoCorrect}
        keyboardType={keyboardType}
        style={styles.input}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },

  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  scroll: {
    flex: 1,
  },

  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 30,
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

  eyebrow: {
    marginTop: 20,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.5,
    color: colors.green,
  },

  title: {
    marginTop: 12,
    fontSize: 38,
    lineHeight: 42,
    fontWeight: "800",
    letterSpacing: -1.1,
    color: colors.dark,
  },

  description: {
    marginTop: 18,
    fontSize: 15,
    lineHeight: 23,
    color: colors.textSecondary,
  },

  form: {
    marginTop: 28,
    gap: 17,
  },

  field: {
    width: "100%",
  },

  label: {
    marginBottom: 7,
    fontSize: 13,
    fontWeight: "700",
    color: colors.dark,
  },

  input: {
    width: "100%",
    minHeight: 54,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    paddingHorizontal: 16,
    fontSize: 14,
    color: colors.dark,
  },

  infoCard: {
    marginTop: 24,
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 16,
    borderRadius: 16,
    backgroundColor: colors.greenSoft,
    borderWidth: 1,
    borderColor: colors.border,
  },

  infoIndicator: {
    width: 9,
    height: 9,
    marginTop: 4,
    marginRight: 11,
    borderRadius: 9,
    backgroundColor: "#C58A2A",
  },

  infoContent: {
    flex: 1,
  },

  infoTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.dark,
  },

  infoText: {
    marginTop: 5,
    fontSize: 12,
    lineHeight: 18,
    color: colors.textSecondary,
  },

  errorCard: {
    marginTop: 16,
    padding: 14,
    borderRadius: 14,
    backgroundColor: "#F5E5E5",
    borderWidth: 1,
    borderColor: "#E0C6C6",
  },

  errorText: {
    fontSize: 13,
    lineHeight: 18,
    color: "#8A3737",
  },

  bottomSpace: {
    height: 10,
  },

  bottom: {
    paddingHorizontal: 24,
    paddingTop: 10,
    paddingBottom: 10,
    backgroundColor: colors.background,
  },

  button: {
    minHeight: 58,
    borderRadius: 999,
    backgroundColor: colors.dark,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },

  buttonDisabled: {
    opacity: 0.5,
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
});