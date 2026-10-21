import { IrrigationDashboard } from "./src";
import { useAuth0 } from "react-native-auth0"; // ajuste para o caminho real do seu useAuth
import { supabase } from "../../../../src/supabase/supabase";

export default function IrrigationPage() {
  const auth = useAuth0();

  // Ajuste para o formato real retornado pelo seu hook.
  // Em sessões Auth0, o identificador costuma estar em user.sub.
  const userId = auth.user?.sub ?? auth.user?.id ?? null;

  const apiBaseUrl = process.env.EXPO_PUBLIC_IRRIGATION_API_URL ?? "http://10.33.133.15:8456";

  return (
    <IrrigationDashboard
      userId={userId}
      supabase={supabase}
      apiBaseUrl={apiBaseUrl}
      profileTable="users"
      profileUserColumn="userId"
      devicesColumn="devices"
      timezone="America/Sao_Paulo"
    />
  );
}
