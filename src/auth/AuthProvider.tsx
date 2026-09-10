import { Auth0Provider } from "react-native-auth0";
import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
};

const domain = process.env.EXPO_PUBLIC_AUTH_DOMAIN;
const clientId = process.env.EXPO_PUBLIC_AUTH_CLIENT_ID;

if (!domain) {
  throw new Error(
    "EXPO_PUBLIC_AUTH0_DOMAIN não foi configurado no arquivo .env"
  );
}

if (!clientId) {
  throw new Error(
    "EXPO_PUBLIC_AUTH0_CLIENT_ID não foi configurado no arquivo .env"
  );
}

export function AuthProvider({ children }: Props) {
  return (
    <Auth0Provider
      domain={domain || ""}
      clientId={clientId || ""}
    >
      {children}
    </Auth0Provider>
  );
}