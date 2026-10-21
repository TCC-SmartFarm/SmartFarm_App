import type { SupabaseClient } from "@supabase/supabase-js";
import type { IrrigationDevice, IrrigationResponse } from "./types";

export interface LoadDevicesOptions {
  supabase: SupabaseClient;
  userId: string;
  profileTable?: string;
  profileUserColumn?: string;
  devicesColumn?: string;
}

const defaultTimezone = "America/Sao_Paulo";

export function getLocalTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || defaultTimezone;
  } catch {
    return defaultTimezone;
  }
}

/**
 * Reads the user's `devices` JSON column. The default matches the README of
 * the irrigation microservice: profiles.id -> profiles.devices.
 * Both object maps and arrays of devices are supported.
 */
export async function loadUserDevices({
  supabase,
  userId,
  profileTable = "profiles",
  profileUserColumn = "id",
  devicesColumn = "devices",
}: LoadDevicesOptions): Promise<IrrigationDevice[]> {
  const { data, error } = await supabase
    .from(profileTable)
    .select(devicesColumn)
    .eq(profileUserColumn, userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Não foi possível carregar seus dispositivos: ${error.message}`);
  }

  const row = data as Record<string, unknown> | null;
  const rawDevices = row?.[devicesColumn];
  const values: unknown[] = Array.isArray(rawDevices)
    ? rawDevices
    : rawDevices && typeof rawDevices === "object"
      ? Object.values(rawDevices as Record<string, unknown>)
      : [];

  const byEui = new Map<string, IrrigationDevice>();
  for (const value of values) {
    if (!value || typeof value !== "object") continue;
    const item = value as Record<string, unknown>;
    const rawEui = item.devEUI ?? item.deveui ?? item.dev_eui;
    if (typeof rawEui !== "string" || !rawEui.trim()) continue;

    const devEUI = rawEui.trim();
    const possibleName = item.name ?? item.label ?? item.deviceName ?? item.device_name;
    const name = typeof possibleName === "string" && possibleName.trim()
      ? possibleName.trim()
      : `Sensor ${devEUI.slice(-4).toUpperCase()}`;

    if (!byEui.has(devEUI)) byEui.set(devEUI, { devEUI, name });
  }

  return Array.from(byEui.values()).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

export interface FetchIrrigationOptions {
  apiBaseUrl: string;
  userId: string;
  devEUI: string;
  timezone?: string;
}

export async function fetchIrrigation({
  apiBaseUrl,
  userId,
  devEUI,
  timezone = getLocalTimezone(),
}: FetchIrrigationOptions): Promise<IrrigationResponse> {
  const base = apiBaseUrl.trim().replace(/\/+$/, "");
  if (!base) throw new Error("Configure a URL base para a API de irrigação.");

  const query = new URLSearchParams({ userId, devEUI, timezone });
  console.log(`[URL]: ${base}/api/v1/irrigation?${query.toString()}`)
  const url = `${base}/api/v1/irrigation?${query.toString()}`;

  let response: Response;
  try {
    response = await fetch(url, { method: "GET", headers: { Accept: "application/json" } });
  } catch {
    console.log( "Não foi possível conectar à API. Confira o endereço configurado, se o serviço está ativo e se o dispositivo consegue alcançá-lo.")
    throw new Error(
      "Não foi possível conectar à API. Confira o endereço configurado, se o serviço está ativo e se o dispositivo consegue alcançá-lo."
    );
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const serverMessage =
      body && typeof body === "object" && "error" in body && typeof body.error === "string"
        ? body.error
        : `A API respondeu com HTTP ${response.status}.`;
    throw new Error(serverMessage);
  }

  if (!body || typeof body !== "object" || !("sensor_id" in body) || !("irrigation" in body)) {
    throw new Error("A API respondeu, mas o formato dos dados não corresponde ao esperado.");
  }

  return body as IrrigationResponse;
}
