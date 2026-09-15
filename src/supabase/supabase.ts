import "react-native-url-polyfill/auto";

import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  process.env.EXPO_PUBLIC_SUPABASE_URL;

const supabasePublishableKey =
  process.env.EXPO_PUBLIC_SUPABASE_KEY;

if (!supabaseUrl) {
  throw new Error(
    "EXPO_PUBLIC_SUPABASE_URL não configurado."
  );
}

if (!supabasePublishableKey) {
  throw new Error(
    "EXPO_PUBLIC_SUPABASE_KEY não configurado."
  );
}

export const supabase = createClient(
  supabaseUrl,
  supabasePublishableKey
);