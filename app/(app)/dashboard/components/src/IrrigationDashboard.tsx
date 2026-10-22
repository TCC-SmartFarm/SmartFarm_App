import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import type { SupabaseClient } from "@supabase/supabase-js";
import { colors } from "./colors";
import { fetchIrrigation, loadUserDevices } from "./irrigationApi";
import type { ForecastDay, IrrigationDevice, IrrigationResponse, SoilStatus } from "./types";
import IrrigationTrendChart from "./IrrigationTrendChart";
import { fetchSensorHistory, type SensorHistoryPoint } from "./sensorHistoryApi";

export { colors } from "./colors";
export type { ForecastDay, IrrigationDevice, IrrigationResponse } from "./types";

export interface IrrigationDashboardProps {
  /** User ID from the active useAuth session (e.g. Auth0 `user.sub`). */
  userId?: string | null;
  /** Your existing Supabase JS client. */
  supabase: SupabaseClient;
  /** Base URL only, e.g. http://localhost:8456 (do not include the route). */
  apiBaseUrl: string;
  /** Must match the profile table used by the irrigation API. */
  profileTable?: string;
  /** Must match SUPABASE_USER_COLUMN in the microservice configuration. */
  profileUserColumn?: string;
  /** Must match SUPABASE_DEVICES_COLUMN in the microservice configuration. */
  devicesColumn?: string;
  timezone?: string;
  /** Base URL of the existing sensor API used for historical readings. */
  sensorApiBaseUrl?: string;
  /** Number of days requested from the sensor history endpoint. */
  historyDays?: number;
  /** Should match KALMAN_PROCESS_NOISE in the Go service .env. */
  kalmanProcessNoise?: number;
  /** Should match KALMAN_MEASUREMENT_NOISE in the Go service .env. */
  kalmanMeasurementNoise?: number;
}

type Tone = "green" | "amber" | "neutral";

function formatNumber(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  return Number(value).toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

function formatPercent(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(Number(value))
    ? "—"
    : `${formatNumber(value, 1)}%`;
}

function formatDay(date: string): { weekday: string; date: string } {
  const parsed = new Date(`${date}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return { weekday: "Dia", date };
  return {
    weekday: new Intl.DateTimeFormat("pt-BR", { weekday: "short" }).format(parsed).replace(".", ""),
    date: new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(parsed).replace(".", ""),
  };
}

function formatTimestamp(timestamp: string | null | undefined, timezone: string): string {
  if (!timestamp) return "Horário indisponível";
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return "Horário indisponível";
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: timezone,
    }).format(parsed);
  } catch {
    return parsed.toLocaleString("pt-BR");
  }
}

function soilLabel(status: SoilStatus | undefined): string {
  switch (status) {
    case "dry": return "Solo seco";
    case "wet": return "Solo úmido";
    case "intermediate": return "Umidade intermediária";
    default: return "Condição do solo não classificada";
  }
}

function soilTone(status: SoilStatus | undefined): Tone {
  if (status === "dry") return "amber";
  if (status === "wet") return "green";
  return "neutral";
}

function recommendationTitle(data: IrrigationResponse): string {
  const irrigation = data.irrigation;
  switch (irrigation?.action) {
    case "not_needed_now": return "Não irrigar agora";
    case "manual_check": return "Verificação manual recomendada";
    case "irrigate_on_recommended_day":
      return irrigation.should_irrigate_today ? "Irrigação indicada para hoje" : "Planeje a irrigação";
    default:
      if (irrigation?.should_irrigate_today) return "Irrigação indicada para hoje";
      if (irrigation?.should_irrigate) return "Irrigação recomendada";
      return "Recomendação de irrigação";
  }
}

function toneColors(tone: Tone) {
  if (tone === "green") return { backgroundColor: colors.greenSoft, color: colors.greenDark };
  if (tone === "amber") return { backgroundColor: "#F8EEDC", color: "#815C22" };
  return { backgroundColor: "#F0F0EC", color: colors.textSecondary };
}

type IconName = "sprout" | "droplets" | "thermometer" | "wind" | "cloud-rain" | "map-pin" | "arrow-up-right" | "refresh-cw" | "check" | "clock" | "sun" | "activity" | "calendar";

function AppIcon({
  name,
  size = 18,
  color = colors.greenDark,
}: {
  name: IconName;
  size?: number;
  color?: string;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      {name === "sprout" ? <>
        <Path d="M12 22v-8" />
        <Path d="M12 14C7.5 14 5 11.5 5 7c4.5 0 7 2.5 7 7Z" />
        <Path d="M12 11c0-4.5 2.5-7 7-7 0 4.5-2.5 7-7 7Z" />
      </> : null}
      {name === "droplets" ? <>
        <Path d="M12 3.5S5.5 10.1 5.5 14.5a6.5 6.5 0 0 0 13 0C18.5 10.1 12 3.5 12 3.5Z" />
        <Path d="M9 15a3 3 0 0 0 3 3" />
      </> : null}
      {name === "thermometer" ? <>
        <Path d="M14 14.8V5a3 3 0 0 0-6 0v9.8a5 5 0 1 0 6 0Z" />
        <Path d="M11 11v6" />
      </> : null}
      {name === "wind" ? <>
        <Path d="M3 8h12a3 3 0 1 0-3-3" />
        <Path d="M2 12h16a2 2 0 1 1-2 2" />
        <Path d="M4 16h5a2 2 0 1 1-2 2" />
      </> : null}
      {name === "cloud-rain" ? <>
        <Path d="M20 16.2A4.5 4.5 0 0 0 18 7.7a6 6 0 0 0-11.5 1.8A4 4 0 0 0 7 17h13Z" />
        <Path d="m8 20-1 2M14 20l-1 2M20 20l-1 2" />
      </> : null}
      {name === "map-pin" ? <>
        <Path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
        <Circle cx="12" cy="10" r="2" />
      </> : null}
      {name === "arrow-up-right" ? <>
        <Path d="M7 17 17 7M8 7h9v9" />
      </> : null}
      {name === "refresh-cw" ? <>
        <Path d="M20 7v5h-5M4 17v-5h5" />
        <Path d="M5.6 9A7 7 0 0 1 18 6l2 1M4 17l2 1a7 7 0 0 0 12.4-3" />
      </> : null}
      {name === "check" ? <Path d="m5 12 4 4L19 6" /> : null}
      {name === "clock" ? <>
        <Circle cx="12" cy="12" r="9" />
        <Path d="M12 7v5l3 2" />
      </> : null}
      {name === "sun" ? <>
        <Circle cx="12" cy="12" r="4" />
        <Path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42" />
      </> : null}
      {name === "activity" ? <Path d="M3 12h4l3-8 4 16 3-8h4" /> : null}
      {name === "calendar" ? <>
        <Path d="M8 2v4M16 2v4M3 10h18" />
        <RectCompat />
      </> : null}
    </Svg>
  );
}

// Kept as a tiny SVG helper so the icon set has no extra dependency.
function RectCompat() {
  return <Path d="M5 4h14a2 2 0 0 1 2 2v13H3V6a2 2 0 0 1 2-2Z" />;
}

function Pill({ label, tone = "neutral" }: { label: string; tone?: Tone }) {
  const tones = toneColors(tone);
  return (
    <View style={[styles.pill, { backgroundColor: tones.backgroundColor }]}> 
      <Text style={[styles.pillText, { color: tones.color }]}>{label}</Text>
    </View>
  );
}

function SectionHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.sectionHeading}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

function MetricCard({
  icon,
  label,
  value,
  detail,
}: {
  icon: IconName;
  label: string;
  value: string;
  detail?: string;
}) {
  const iconColor = icon === "thermometer" ? "#C8784A" : icon === "wind" ? "#5B8DAD" : icon === "activity" ? "#3478D4" : colors.greenDark;
  const iconBackground = icon === "thermometer" ? "#F8E9E0" : icon === "wind" ? "#E8F1F5" : icon === "activity" ? "#EAF0FC" : colors.greenSoft;
  return (
    <View style={styles.metricCard}>
      <View style={styles.metricTopLine}>
        <View style={[styles.metricSymbolWrap, { backgroundColor: iconBackground }]}><AppIcon name={icon} color={iconColor} size={18} /></View>
        <Text style={styles.metricLabel}>{label}</Text>
      </View>
      <Text style={styles.metricValue}>{value}</Text>
      {detail ? <Text style={styles.metricDetail}>{detail}</Text> : null}
    </View>
  );
}

function ForecastCard({ day, index }: { day: ForecastDay; index: number }) {
  const date = formatDay(day.date);
  const probability = Math.max(0, Math.min(100, Number(day.precipitation_probability_percent) || 0));
  const isToday = index === 0;
  return (
    <View style={[styles.forecastCard, isToday && styles.forecastCardToday]}>
      <View style={styles.forecastTopLine}>
        <View>
          <Text style={styles.forecastWeekday}>{isToday ? "Hoje" : date.weekday}</Text>
          <Text style={styles.forecastDate}>{date.date}</Text>
        </View>
        {isToday ? <View style={styles.todayDot} /> : null}
      </View>
      <View style={styles.forecastRainIcon}>
        <AppIcon name={day.rain_likely ? "cloud-rain" : "sun"} color={day.rain_likely ? "#557FAD" : "#C98D38"} size={21} />
      </View>
      <Text style={styles.forecastRainProbability}>{formatPercent(day.precipitation_probability_percent)}</Text>
      <Text style={styles.forecastCaption}>chance de chuva</Text>
      <View style={styles.probabilityTrack}><View style={[styles.probabilityFill, { width: `${probability}%` }]} /></View>
      <View style={styles.forecastDivider} />
      <View style={styles.forecastDataLine}>
        <Text style={styles.forecastDataLabel}>Precipitação</Text>
        <Text style={styles.forecastDataValue}>{formatNumber(day.precipitation_mm, 1)} mm</Text>
      </View>
      <View style={styles.forecastDataLine}>
        <Text style={styles.forecastDataLabel}>ET₀</Text>
        <Text style={styles.forecastDataValue}>{day.et0_mm == null ? "—" : `${formatNumber(day.et0_mm, 2)} mm`}</Text>
      </View>
      {day.rain_likely ? <View style={styles.weatherStatus}><View style={styles.weatherStatusDot} /><Text style={styles.weatherStatusText}>Chuva provável</Text></View> : null}
    </View>
  );
}

export default function IrrigationDashboard({
  userId,
  supabase,
  apiBaseUrl,
  profileTable = "profiles",
  profileUserColumn = "id",
  devicesColumn = "devices",
  timezone = "America/Sao_Paulo",
  sensorApiBaseUrl = "https://smartfarm-tcc.chilecentral.cloudapp.azure.com",
  historyDays = 7,
  kalmanProcessNoise = 1,
  kalmanMeasurementNoise = 4,
}: IrrigationDashboardProps) {
  const { width: windowWidth } = useWindowDimensions();
  const [devices, setDevices] = useState<IrrigationDevice[]>([]);
  const [selectedEui, setSelectedEui] = useState("");
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [deviceError, setDeviceError] = useState("");
  const [reloadDevices, setReloadDevices] = useState(0);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState("");
  const [result, setResult] = useState<IrrigationResponse | null>(null);
  const [history, setHistory] = useState<SensorHistoryPoint[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const selectedDevice = devices.find((device) => device.devEUI === selectedEui);

  useEffect(() => {
    let active = true;

    async function getDevices() {
      if (!userId) {
        setDevices([]);
        setSelectedEui("");
        setResult(null);
        setHistory([]);
        setHistoryError("");
        setHistoryLoading(false);
        setDeviceError("Não foi possível identificar o usuário da sessão atual.");
        setDevicesLoading(false);
        return;
      }

      setDevicesLoading(true);
      setDeviceError("");
      setApiError("");
      setResult(null);
      setHistory([]);
      setHistoryError("");
      setHistoryLoading(false);
      try {
        const found = await loadUserDevices({
          supabase,
          userId,
          profileTable,
          profileUserColumn,
          devicesColumn,
        });
        if (!active) return;
        setDevices(found);
        setSelectedEui((current) => found.some((device) => device.devEUI === current)
          ? current
          : found[0]?.devEUI ?? "");
        if (found.length === 0) {
          setDeviceError("Nenhum dispositivo com devEUI foi encontrado no perfil deste usuário.");
        }
      } catch (error) {
        if (!active) return;
        setDevices([]);
        setSelectedEui("");
        setDeviceError(error instanceof Error ? error.message : "Falha ao carregar dispositivos.");
      } finally {
        if (active) setDevicesLoading(false);
      }
    }

    void getDevices();
    return () => { active = false; };
  }, [supabase, userId, profileTable, profileUserColumn, devicesColumn, reloadDevices]);

  async function handleConsult() {
    if (!userId || !selectedEui || loading) return;
    setLoading(true);
    setApiError("");
    setResult(null);
    setHistory([]);
    setHistoryError("");
    setHistoryLoading(true);

    // The recommendation and sensor history are independent requests. If the history
    // endpoint fails, keep the irrigation result and forecast visible in the dashboard.
    const recommendationRequest = fetchIrrigation({ apiBaseUrl, userId, devEUI: selectedEui, timezone })
      .then((response) => setResult(response))
      .catch((error: unknown) => {
        setApiError(error instanceof Error ? error.message : "Não foi possível consultar a recomendação.");
      });

    const historyRequest = fetchSensorHistory({
      apiBaseUrl: sensorApiBaseUrl,
      userId,
      devEUI: selectedEui,
      days: historyDays,
    })
      .then((points) => setHistory(points))
      .catch((error: unknown) => {
        setHistory([]);
        setHistoryError(error instanceof Error ? error.message : "Não foi possível carregar o histórico do sensor.");
      })
      .finally(() => setHistoryLoading(false));

    await Promise.all([recommendationRequest, historyRequest]);
    setLoading(false);
  }

  const sensor = result?.sensor;
  const irrigation = result?.irrigation;
  const forecast = result?.forecast_today_and_next_5_days ?? [];
  const currentRecommendation = result ? recommendationTitle(result) : "";
  const canConsult = Boolean(userId && selectedEui && !devicesLoading && !loading);

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.page}>
          <View style={styles.header}>
            <View style={styles.brandRow}>
              <View style={styles.brandIdentity}>
                <View style={styles.brandMark}><AppIcon name="sprout" color={colors.white} size={22} /></View>
                <View>
                  <Text style={styles.brandName}>IRRIGAÇÃO INTELIGENTE</Text>
                  <Text style={styles.brandCaption}>PAINEL DE MONITORAMENTO</Text>
                </View>
              </View>
              <View style={styles.brandBadge}><View style={styles.brandBadgeDot} /><Text style={styles.brandBadgeText}>ANÁLISE SOB DEMANDA</Text></View>
            </View>
            <View style={styles.heroIntro}>
              <View style={styles.heroCopy}>
                <Text style={styles.heroEyebrow}>DECISÕES MAIS CONSCIENTES</Text>
                <Text style={styles.pageTitle}>Seu cultivo, em equilíbrio.</Text>
                <Text style={styles.pageDescription}>
                  Entenda a umidade do solo e acompanhe a previsão do tempo antes de decidir quando irrigar.
                </Text>
              </View>
              {windowWidth >= 430 ? (
                <View style={styles.heroIllustration}>
                  <View style={styles.heroIllustrationHalo} />
                  <View style={styles.heroIllustrationIcon}><AppIcon name="sprout" size={42} color={colors.greenDark} /></View>
                  <View style={styles.heroIllustrationDrop}><AppIcon name="droplets" size={19} color="#FFFFFF" /></View>
                </View>
              ) : null}
            </View>
          </View>

          <View style={styles.queryCard}>
            <View style={styles.queryCardHeading}>
              <View style={styles.queryTitleGroup}>
                <Text style={styles.eyebrow}>NOVA ANÁLISE</Text>
                <Text style={styles.queryTitle}>Escolha seu sensor</Text>
                <Text style={styles.queryDescription}>A consulta só acontece quando você solicitar.</Text>
              </View>
              <View style={styles.queryDecor}><AppIcon name="activity" size={23} color={colors.greenDark} /></View>
            </View>

            {devicesLoading ? (
              <View style={styles.inlineState}>
                <ActivityIndicator color={colors.green} />
                <Text style={styles.stateText}>Carregando seus dispositivos…</Text>
              </View>
            ) : devices.length > 0 ? (
              <View style={styles.deviceList}>
                {devices.map((device) => {
                  const selected = device.devEUI === selectedEui;
                  return (
                    <Pressable
                      key={device.devEUI}
                      disabled={loading}
                      onPress={() => {
                        setSelectedEui(device.devEUI);
                        setResult(null);
                        setHistory([]);
                        setHistoryError("");
                        setApiError("");
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      style={[styles.deviceOption, selected && styles.deviceOptionSelected]}
                    >
                      <View style={[styles.deviceRadio, selected && styles.deviceRadioSelected]}>
                        {selected ? <View style={styles.deviceRadioDot} /> : null}
                      </View>
                      <View style={styles.deviceTextGroup}>
                        <Text style={[styles.deviceName, selected && styles.deviceNameSelected]} numberOfLines={1}>{device.name}</Text>
                        <Text style={styles.deviceEui} numberOfLines={1}>{device.devEUI}</Text>
                      </View>
                      {selected ? <Text style={styles.selectedCheck}>✓</Text> : null}
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <View style={styles.inlineState}>
                <Text style={styles.stateText}>{deviceError || "Nenhum dispositivo disponível."}</Text>
                <Pressable onPress={() => setReloadDevices((value) => value + 1)} style={styles.smallRetryButton} accessibilityRole="button">
                  <Text style={styles.smallRetryText}>Tentar novamente</Text>
                </Pressable>
              </View>
            )}

            {deviceError && devices.length > 0 ? <Text style={styles.warningText}>{deviceError}</Text> : null}

            <Pressable
              onPress={handleConsult}
              disabled={!canConsult}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canConsult, busy: loading }}
              style={[styles.primaryButton, !canConsult && styles.primaryButtonDisabled]}
            >
              {loading ? <ActivityIndicator color={colors.white} /> : <AppIcon name={result ? "refresh-cw" : "arrow-up-right"} color={colors.white} size={19} />}
              <Text style={styles.primaryButtonText}>{loading ? "Analisando condições…" : result ? "Atualizar recomendação" : "Analisar irrigação"}</Text>
            </Pressable>
            <Text style={styles.queryFootnote}>A análise considera a umidade filtrada e a previsão para hoje e os próximos cinco dias.</Text>
          </View>

          {apiError ? (
            <View style={styles.errorCard}>
              <Text style={styles.errorTitle}>Não foi possível concluir a consulta</Text>
              <Text style={styles.errorMessage}>{apiError}</Text>
              <Pressable onPress={handleConsult} disabled={!canConsult} style={styles.errorRetry} accessibilityRole="button">
                <Text style={styles.errorRetryText}>Tentar novamente</Text>
              </Pressable>
            </View>
          ) : null}

          {result ? (
            <>
              <View style={styles.resultHeader}>
                <View style={styles.resultHeaderText}>
                  <Text style={styles.eyebrow}>RESULTADO DA ANÁLISE</Text>
                  <Text style={styles.resultTitle}>Resumo do seu cultivo</Text>
                  <Text style={styles.resultSubtitle}>
                    {selectedDevice?.name ?? `Sensor ${result.sensor_id}`} · leitura em {formatTimestamp(sensor?.timestamp, result.location?.timezone || timezone)}
                  </Text>
                </View>
                <Pill label={sensor?.validity === false ? "Leitura inválida" : "Leitura recebida"} tone={sensor?.validity === false ? "amber" : "green"} />
              </View>

              <View style={styles.recommendationCard}>
                <View style={styles.recommendationTop}>
                  <View style={styles.recommendationIcon}><AppIcon name={irrigation?.should_irrigate ? "droplets" : "check"} color={colors.white} size={20} /></View>
                  <Text style={styles.recommendationEyebrow}>RECOMENDAÇÃO DO SISTEMA</Text>
                </View>
                <Text style={styles.recommendationTitle}>{currentRecommendation}</Text>
                <Text style={styles.recommendationMessage}>{irrigation?.message || "A API não retornou uma mensagem explicativa para esta recomendação."}</Text>
                <View style={styles.recommendationMetaRow}>
                  <Pill label={soilLabel(irrigation?.soil_status)} tone={soilTone(irrigation?.soil_status)} />
                  {irrigation?.recommended_day ? (
                    <View style={styles.recommendedDayPill}>
                      <Text style={styles.recommendedDayLabel}>DIA SUGERIDO</Text>
                      <Text style={styles.recommendedDayValue}>{formatDay(irrigation.recommended_day).date}</Text>
                    </View>
                  ) : null}
                </View>
              </View>

              <View style={styles.sectionBlock}>
                <SectionHeading title="Condições atuais" subtitle="Valores informados pelo sensor selecionado." />
                <View style={styles.metricGrid}>
                  <MetricCard icon="droplets" label="Umidade do solo" value={formatPercent(sensor?.soil_moisture_kalman_filtered)} detail="Estimativa filtrada por Kalman" />
                  <MetricCard icon="activity" label="Leitura bruta" value={formatPercent(sensor?.soil_moisture_raw)} detail="Valor original do sensor" />
                  <MetricCard icon="thermometer" label="Temperatura do ar" value={sensor?.air_temperature_celsius == null ? "—" : `${formatNumber(sensor.air_temperature_celsius, 1)} °C`} detail="Temperatura medida" />
                  <MetricCard icon="wind" label="Umidade do ar" value={formatPercent(sensor?.air_humidity_percent)} detail="Umidade relativa" />
                </View>
              </View>

              <IrrigationTrendChart
                history={history}
                forecast={forecast}
                latestSensor={sensor}
                timezone={result.location?.timezone || timezone}
                kalmanProcessNoise={kalmanProcessNoise}
                kalmanMeasurementNoise={kalmanMeasurementNoise}
                historyLoading={historyLoading}
                historyError={historyError || undefined}
              />

              <View style={styles.sectionBlock}>
                <View style={styles.forecastHeadingRow}>
                  <SectionHeading title="Previsão para 6 dias" subtitle="Hoje e os próximos cinco dias." />
                  <Text style={styles.horizontalHint}>Deslize para ver →</Text>
                </View>
                {forecast.length > 0 ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.forecastScrollContent}>
                    {forecast.map((day, index) => <ForecastCard key={day.date} day={day} index={index} />)}
                  </ScrollView>
                ) : (
                  <View style={styles.emptyForecast}><Text style={styles.stateText}>A API não retornou dados de previsão.</Text></View>
                )}
              </View>

              <View style={styles.locationCard}>
                <View style={styles.locationIcon}><AppIcon name="map-pin" color={colors.greenDark} size={20} /></View>
                <View style={styles.locationContent}>
                  <Text style={styles.locationTitle}>Localização do sensor</Text>
                  <Text style={styles.locationCoordinates}>
                    {result.location?.latitude == null || result.location?.longitude == null
                      ? "Coordenadas indisponíveis"
                      : `${formatNumber(result.location.latitude, 6)}, ${formatNumber(result.location.longitude, 6)}`}
                  </Text>
                  <Text style={styles.locationDetail}>Fuso horário: {result.location?.timezone || timezone}</Text>
                </View>
                <Pill label={result.location?.source || "Localização"} tone="neutral" />
              </View>

              {result.note ? (
                <View style={styles.noteCard}>
                  <View style={styles.noteMark}><Text style={styles.noteMarkText}>i</Text></View>
                  <View style={styles.noteContent}>
                    <Text style={styles.noteTitle}>Sobre esta recomendação</Text>
                    <Text style={styles.noteText}>{result.note}</Text>
                  </View>
                </View>
              ) : null}
              <Text style={styles.disclaimer}>
                Esta ferramenta oferece apoio à decisão e não aciona equipamentos de irrigação. Valide os limiares com o tipo de solo, a cultura e as condições reais do local.
              </Text>
            </>
          ) : (
            <View style={styles.emptyStateCard}>
              <View style={styles.emptyStateMark}><AppIcon name="sprout" size={25} color={colors.greenDark} /></View>
              <Text style={styles.emptyStateTitle}>Sua análise aparece aqui</Text>
              <Text style={styles.emptyStateText}>Selecione um dispositivo e toque em “Analisar irrigação” para consultar as condições do solo e a previsão do tempo.</Text>
            </View>
          )}

          <Text style={styles.footer}>IRRIGAÇÃO INTELIGENTE · DADOS DO SENSOR + PREVISÃO METEOROLÓGICA</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  scrollContent: { flexGrow: 1, alignItems: "center", paddingHorizontal: 16, paddingTop: 18, paddingBottom: 34 },
  page: { width: "100%", maxWidth: 980 },
  header: { marginBottom: 23 },
  brandRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", marginBottom: 25 },
  brandIdentity: { flexDirection: "row", alignItems: "center", marginRight: 12, marginBottom: 8 },
  brandMark: { width: 43, height: 43, borderRadius: 15, backgroundColor: colors.greenDark, alignItems: "center", justifyContent: "center", marginRight: 11, shadowColor: colors.greenDark, shadowOpacity: 0.14, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  brandName: { color: colors.greenDark, fontSize: 10, fontWeight: "900", letterSpacing: 1.35, marginBottom: 3 },
  brandCaption: { color: colors.textSecondary, fontSize: 8, fontWeight: "700", letterSpacing: 1.15 },
  brandBadge: { flexDirection: "row", alignItems: "center", backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 8, marginBottom: 8 },
  brandBadgeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.green, marginRight: 7 },
  brandBadgeText: { color: colors.textSecondary, fontSize: 8, fontWeight: "800", letterSpacing: 0.65 },
  heroIntro: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  heroCopy: { flex: 1, minWidth: 0, paddingRight: 10 },
  heroEyebrow: { color: colors.green, fontSize: 10, letterSpacing: 1.4, fontWeight: "900", marginBottom: 8 },
  pageTitle: { color: colors.dark, fontSize: 31, lineHeight: 37, fontWeight: "800", letterSpacing: -0.95, marginBottom: 9, maxWidth: 570 },
  pageDescription: { maxWidth: 570, color: colors.textSecondary, fontSize: 13, lineHeight: 21 },
  heroIllustration: { width: 104, height: 104, marginLeft: 8, alignItems: "center", justifyContent: "center" },
  heroIllustrationHalo: { position: "absolute", width: 100, height: 100, borderRadius: 50, backgroundColor: colors.greenSoft },
  heroIllustrationIcon: { width: 65, height: 65, alignItems: "center", justifyContent: "center", borderRadius: 24, backgroundColor: "rgba(255,255,255,0.78)" },
  heroIllustrationDrop: { position: "absolute", right: 0, bottom: 1, width: 34, height: 34, borderRadius: 12, backgroundColor: colors.green, alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: colors.background },
  eyebrow: { color: colors.green, fontSize: 9, letterSpacing: 1.35, fontWeight: "900", marginBottom: 6 },
  queryCard: { backgroundColor: colors.white, borderColor: colors.border, borderWidth: 1, borderRadius: 24, padding: 18, marginBottom: 23, shadowColor: "#25372A", shadowOpacity: 0.045, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 1 },
  queryCardHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 17 },
  queryTitleGroup: { flex: 1, paddingRight: 12 },
  queryTitle: { color: colors.dark, fontSize: 20, fontWeight: "800", letterSpacing: -0.4, marginBottom: 5 },
  queryDescription: { color: colors.textSecondary, fontSize: 12, lineHeight: 18 },
  queryDecor: { width: 46, height: 46, borderRadius: 16, backgroundColor: colors.greenSoft, alignItems: "center", justifyContent: "center" },
  deviceList: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -4, marginBottom: 10 },
  deviceOption: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 15, paddingHorizontal: 12, paddingVertical: 12, minWidth: 215, maxWidth: "100%", flexGrow: 1, flexBasis: 235, marginHorizontal: 4, marginBottom: 8, backgroundColor: "#FCFCF9" },
  deviceOptionSelected: { borderColor: colors.green, backgroundColor: "#F0F5EF", shadowColor: colors.greenDark, shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  deviceRadio: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: "#C9CDC5", alignItems: "center", justifyContent: "center", marginRight: 10 },
  deviceRadioSelected: { borderColor: colors.green },
  deviceRadioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.green },
  deviceTextGroup: { flex: 1, minWidth: 0 },
  deviceName: { color: colors.text, fontSize: 12, fontWeight: "800", marginBottom: 4 },
  deviceNameSelected: { color: colors.greenDark },
  deviceEui: { color: colors.textSecondary, fontSize: 9, letterSpacing: 0.1 },
  selectedCheck: { color: colors.green, marginLeft: 8, fontWeight: "900", fontSize: 16 },
  inlineState: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", marginBottom: 15, paddingVertical: 6 },
  stateText: { color: colors.textSecondary, fontSize: 12, lineHeight: 19, flexShrink: 1, marginRight: 10 },
  smallRetryButton: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, backgroundColor: colors.greenSoft, marginTop: 5 },
  smallRetryText: { color: colors.greenDark, fontWeight: "800", fontSize: 11 },
  warningText: { color: "#815C22", fontSize: 11, lineHeight: 17, marginBottom: 12 },
  primaryButton: { backgroundColor: colors.greenDark, borderRadius: 14, minHeight: 51, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", justifyContent: "center", alignSelf: "stretch", width: "100%", marginTop: 4, shadowColor: colors.greenDark, shadowOpacity: 0.16, shadowRadius: 9, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  primaryButtonDisabled: { opacity: 0.48, shadowOpacity: 0 },
  primaryButtonSymbol: { color: colors.white, fontSize: 19, fontWeight: "700", marginRight: 10 },
  primaryButtonText: { color: colors.white, fontSize: 14, fontWeight: "800", marginLeft: 9 },
  queryFootnote: { textAlign: "center", color: colors.textSecondary, fontSize: 10, lineHeight: 16, marginTop: 11 },
  errorCard: { backgroundColor: "#FFF8F0", borderWidth: 1, borderColor: "#EAD9C1", borderRadius: 18, padding: 17, marginBottom: 22 },
  errorTitle: { color: "#815C22", fontSize: 14, fontWeight: "800", marginBottom: 5 },
  errorMessage: { color: colors.text, fontSize: 12, lineHeight: 19 },
  errorRetry: { alignSelf: "flex-start", paddingVertical: 9, paddingHorizontal: 12, backgroundColor: "#F2E5D2", borderRadius: 10, marginTop: 12 },
  errorRetryText: { color: "#815C22", fontSize: 11, fontWeight: "800" },
  resultHeader: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  resultHeaderText: { flex: 1, minWidth: 220, marginRight: 10, marginBottom: 6 },
  resultTitle: { color: colors.dark, fontSize: 23, fontWeight: "800", letterSpacing: -0.55, marginBottom: 5 },
  resultSubtitle: { color: colors.textSecondary, fontSize: 10, lineHeight: 16 },
  pill: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999 },
  pillText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.1 },
  recommendationCard: { position: "relative", overflow: "hidden", backgroundColor: colors.greenDark, borderRadius: 25, padding: 22, marginBottom: 25, shadowColor: colors.greenDark, shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 3 },
  recommendationTop: { flexDirection: "row", alignItems: "center", marginBottom: 15 },
  recommendationIcon: { width: 36, height: 36, borderRadius: 13, backgroundColor: "rgba(255,255,255,0.14)", alignItems: "center", justifyContent: "center", marginRight: 10 },
  recommendationIconText: { color: colors.white, fontSize: 17, fontWeight: "800" },
  recommendationEyebrow: { color: "#DCE8DC", fontSize: 9, letterSpacing: 1.25, fontWeight: "900" },
  recommendationTitle: { color: colors.white, fontSize: 27, lineHeight: 32, letterSpacing: -0.6, fontWeight: "800", marginBottom: 9, maxWidth: 720 },
  recommendationMessage: { color: "#EFF5EF", fontSize: 13, lineHeight: 21, maxWidth: 760 },
  recommendationMetaRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", marginTop: 18 },
  recommendedDayPill: { borderLeftWidth: 1, borderLeftColor: "rgba(255,255,255,0.25)", paddingLeft: 14, marginLeft: 13, marginTop: 5, marginBottom: 5 },
  recommendedDayLabel: { color: "#DCE8DC", fontSize: 8, letterSpacing: 1, fontWeight: "900", marginBottom: 4 },
  recommendedDayValue: { color: colors.white, fontSize: 12, fontWeight: "800" },
  sectionBlock: { marginBottom: 25 },
  sectionHeading: { marginBottom: 13 },
  sectionTitle: { color: colors.dark, fontSize: 19, fontWeight: "800", marginBottom: 5, letterSpacing: -0.4 },
  sectionSubtitle: { color: colors.textSecondary, fontSize: 11, lineHeight: 17 },
  metricGrid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -5 },
  metricCard: { flexGrow: 1, flexBasis: 155, minWidth: 140, backgroundColor: colors.white, borderColor: colors.border, borderWidth: 1, borderRadius: 19, padding: 14, marginHorizontal: 5, marginBottom: 10, shadowColor: "#25372A", shadowOpacity: 0.035, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 1 },
  metricTopLine: { flexDirection: "row", alignItems: "center", marginBottom: 13 },
  metricSymbolWrap: { width: 34, height: 34, borderRadius: 12, alignItems: "center", justifyContent: "center", marginRight: 9 },
  metricSymbol: { color: colors.greenDark, fontSize: 16, fontWeight: "800" },
  metricLabel: { color: colors.textSecondary, fontSize: 10, lineHeight: 14, fontWeight: "700", flexShrink: 1 },
  metricValue: { color: colors.dark, fontSize: 25, letterSpacing: -0.75, fontWeight: "800", marginBottom: 5 },
  metricDetail: { color: colors.textSecondary, fontSize: 9, lineHeight: 14 },
  forecastHeadingRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between" },
  horizontalHint: { color: colors.textSecondary, fontSize: 9, marginBottom: 17, marginLeft: 10 },
  forecastScrollContent: { paddingRight: 8, paddingBottom: 5 },
  forecastCard: { width: 156, backgroundColor: colors.white, borderColor: colors.border, borderWidth: 1, borderRadius: 19, padding: 13, marginRight: 10 },
  forecastCardToday: { borderColor: "#B9CDBA", backgroundColor: "#FBFDF9" },
  forecastTopLine: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  todayDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.green, marginTop: 5 },
  forecastWeekday: { color: colors.dark, textTransform: "capitalize", fontSize: 12, fontWeight: "800" },
  forecastDate: { color: colors.textSecondary, fontSize: 9, marginTop: 3 },
  forecastRainIcon: { width: 39, height: 39, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#EDF3F7", marginTop: 14, marginBottom: 9 },
  forecastRainGlyph: { color: colors.greenDark, fontSize: 17 },
  forecastRainProbability: { color: colors.dark, fontSize: 24, fontWeight: "800", letterSpacing: -0.6 },
  forecastCaption: { color: colors.textSecondary, fontSize: 9, marginTop: 2 },
  probabilityTrack: { height: 4, borderRadius: 999, backgroundColor: "#EDEFE9", overflow: "hidden", marginTop: 9 },
  probabilityFill: { height: 4, borderRadius: 999, backgroundColor: "#E9963A" },
  forecastDivider: { height: 1, backgroundColor: colors.border, marginVertical: 12 },
  forecastDataLine: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  forecastDataLabel: { color: colors.textSecondary, fontSize: 9 },
  forecastDataValue: { color: colors.text, fontSize: 9, fontWeight: "800" },
  weatherStatus: { flexDirection: "row", alignItems: "center", backgroundColor: "#EEF4EE", borderRadius: 7, alignSelf: "flex-start", paddingHorizontal: 7, paddingVertical: 5, marginTop: 3 },
  weatherStatusDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.green, marginRight: 5 },
  weatherStatusText: { color: colors.greenDark, fontSize: 8, fontWeight: "800" },
  emptyForecast: { backgroundColor: colors.white, padding: 17, borderRadius: 15, borderColor: colors.border, borderWidth: 1 },
  locationCard: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: 18, padding: 15, marginBottom: 13 },
  locationIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.greenSoft, alignItems: "center", justifyContent: "center", marginRight: 12 },
  locationIconText: { color: colors.greenDark, fontSize: 23 },
  locationContent: { flex: 1, minWidth: 155, marginRight: 10, marginVertical: 4 },
  locationTitle: { color: colors.dark, fontSize: 12, fontWeight: "800", marginBottom: 4 },
  locationCoordinates: { color: colors.text, fontSize: 11, fontWeight: "700", marginBottom: 4 },
  locationDetail: { color: colors.textSecondary, fontSize: 9 },
  noteCard: { flexDirection: "row", alignItems: "flex-start", backgroundColor: colors.greenSoft, borderWidth: 1, borderColor: "#D9E4D8", borderRadius: 16, padding: 14, marginBottom: 15 },
  noteMark: { alignItems: "center", justifyContent: "center", width: 24, height: 24, borderRadius: 9, backgroundColor: "rgba(53,93,66,0.09)", marginRight: 10 },
  noteMarkText: { color: colors.greenDark, fontSize: 13, fontWeight: "900" },
  noteContent: { flex: 1 },
  noteTitle: { color: colors.greenDark, fontSize: 11, fontWeight: "800", marginBottom: 4 },
  noteText: { color: colors.textSecondary, fontSize: 10, lineHeight: 16 },
  disclaimer: { color: colors.textSecondary, fontSize: 9, lineHeight: 15, marginTop: 3, marginBottom: 19 },
  emptyStateCard: { backgroundColor: colors.white, borderRadius: 24, borderWidth: 1, borderColor: colors.border, alignItems: "center", paddingHorizontal: 23, paddingVertical: 30, marginBottom: 24, shadowColor: "#25372A", shadowOpacity: 0.035, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 1 },
  emptyStateMark: { width: 56, height: 56, borderRadius: 19, backgroundColor: colors.greenSoft, alignItems: "center", justifyContent: "center", marginBottom: 14 },
  emptyStateGlyph: { fontSize: 28, color: colors.greenDark },
  emptyStateTitle: { color: colors.dark, fontSize: 17, fontWeight: "800", textAlign: "center", marginBottom: 7, letterSpacing: -0.25 },
  emptyStateText: { maxWidth: 440, color: colors.textSecondary, fontSize: 12, lineHeight: 19, textAlign: "center" },
  footer: { textAlign: "center", color: "#969A93", fontSize: 8, letterSpacing: 1.05, lineHeight: 14, marginTop: 5 },
});
