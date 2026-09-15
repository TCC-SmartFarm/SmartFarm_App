import { Stack } from "expo-router";
import { SensorProvider } from "../../src/sensor/SensorContext";

export default function AppLayout() {
  return (
    <SensorProvider>
      <Stack
        screenOptions={{
          headerShown: false,
        }}
      />
    </SensorProvider>
  );
}