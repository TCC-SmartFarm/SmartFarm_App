import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { SupabaseClient } from "@supabase/supabase-js";
import { colors } from "./colors";
import { fetchIrrigation, loadUserDevices } from "./irrigationApi";
import type { ForecastDay, IrrigationDevice, IrrigationResponse, SoilStatus } from "./types";

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
  symbol,
  label,
  value,
  detail,
}: {
  symbol: string;
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <View style={styles.metricCard}>
      <View style={styles.metricTopLine}>
        <View style={styles.metricSymbolWrap}><Text style={styles.metricSymbol}>{symbol}</Text></View>
        <Text style={styles.metricLabel}>{label}</Text>
      </View>
      <Text style={styles.metricValue}>{value}</Text>
      {detail ? <Text style={styles.metricDetail}>{detail}</Text> : null}
    </View>
  );
}

function ForecastCard({ day }: { day: ForecastDay }) {
  const date = formatDay(day.date);
  return (
    <View style={styles.forecastCard}>
      <Text style={styles.forecastWeekday}>{date.weekday}</Text>
      <Text style={styles.forecastDate}>{date.date}</Text>
      <View style={styles.forecastRainIcon}><Text style={styles.forecastRainGlyph}>☂</Text></View>
      <Text style={styles.forecastRainProbability}>{formatPercent(day.precipitation_probability_percent)}</Text>
      <Text style={styles.forecastCaption}>chance de chuva</Text>
      <View style={styles.forecastDivider} />
      <View style={styles.forecastDataLine}>
        <Text style={styles.forecastDataLabel}>Chuva</Text>
        <Text style={styles.forecastDataValue}>{formatNumber(day.precipitation_mm, 1)} mm</Text>
      </View>
      <View style={styles.forecastDataLine}>
        <Text style={styles.forecastDataLabel}>ET₀</Text>
        <Text style={styles.forecastDataValue}>{day.et0_mm == null ? "—" : `${formatNumber(day.et0_mm, 2)} mm`}</Text>
      </View>
      {day.rain_likely ? <Pill label="Chuva provável" tone="green" /> : <Pill label="Menor chance" tone="neutral" />}
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
}: IrrigationDashboardProps) {
  const [devices, setDevices] = useState<IrrigationDevice[]>([]);
  const [selectedEui, setSelectedEui] = useState("");
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [deviceError, setDeviceError] = useState("");
  const [reloadDevices, setReloadDevices] = useState(0);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState("");
  const [result, setResult] = useState<IrrigationResponse | null>(null);
  const selectedDevice = devices.find((device) => device.devEUI === selectedEui);

  useEffect(() => {
    let active = true;

    async function getDevices() {
      if (!userId) {
        setDevices([]);
        setSelectedEui("");
        setDeviceError("Não foi possível identificar o usuário da sessão atual.");
        setDevicesLoading(false);
        return;
      }

      setDevicesLoading(true);
      setDeviceError("");
      setApiError("");
      setResult(null);
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
    try {
      const response = await fetchIrrigation({ apiBaseUrl, userId, devEUI: selectedEui, timezone });
      setResult(response);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Não foi possível consultar a recomendação.");
    } finally {
      setLoading(false);
    }
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
              <View style={styles.brandMark}><Text style={styles.brandMarkText}>i</Text></View>
              <Text style={styles.brandName}>IRRIGAÇÃO INTELIGENTE</Text>
            </View>
            <Text style={styles.pageTitle}>Cuide do solo.{"\n"}Irrigue com confiança.</Text>
            <Text style={styles.pageDescription}>
              Leituras do sensor e previsão do tempo reunidas para ajudar você a escolher o melhor momento para irrigar.
            </Text>
          </View>

          <View style={styles.queryCard}>
            <View style={styles.queryCardHeading}>
              <View style={styles.queryTitleGroup}>
                <Text style={styles.eyebrow}>NOVA ANÁLISE</Text>
                <Text style={styles.queryTitle}>Escolha seu sensor</Text>
                <Text style={styles.queryDescription}>A consulta só acontece quando você solicitar.</Text>
              </View>
              <View style={styles.queryDecor}><Text style={styles.queryDecorGlyph}>⌁</Text></View>
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
                      onPress={() => {
                        setSelectedEui(device.devEUI);
                        setResult(null);
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
              {loading ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryButtonSymbol}>↗</Text>}
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
                  <View style={styles.recommendationIcon}><Text style={styles.recommendationIconText}>✓</Text></View>
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
                  <MetricCard symbol="◉" label="Umidade do solo" value={formatPercent(sensor?.soil_moisture_kalman_filtered)} detail="Estimativa filtrada por Kalman" />
                  <MetricCard symbol="≈" label="Leitura bruta" value={formatPercent(sensor?.soil_moisture_raw)} detail="Valor original do sensor" />
                  <MetricCard symbol="°" label="Temperatura do ar" value={sensor?.air_temperature_celsius == null ? "—" : `${formatNumber(sensor.air_temperature_celsius, 1)} °C`} detail="Temperatura medida" />
                  <MetricCard symbol="↗" label="Umidade do ar" value={formatPercent(sensor?.air_humidity_percent)} detail="Umidade relativa" />
                </View>
              </View>

              <View style={styles.sectionBlock}>
                <View style={styles.forecastHeadingRow}>
                  <SectionHeading title="Previsão para 6 dias" subtitle="Hoje e os próximos cinco dias." />
                  <Text style={styles.horizontalHint}>Deslize para ver →</Text>
                </View>
                {forecast.length > 0 ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.forecastScrollContent}>
                    {forecast.map((day) => <ForecastCard key={day.date} day={day} />)}
                  </ScrollView>
                ) : (
                  <View style={styles.emptyForecast}><Text style={styles.stateText}>A API não retornou dados de previsão.</Text></View>
                )}
              </View>

              <View style={styles.locationCard}>
                <View style={styles.locationIcon}><Text style={styles.locationIconText}>⌖</Text></View>
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
                  <Text style={styles.noteMark}>i</Text>
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
              <View style={styles.emptyStateMark}><Text style={styles.emptyStateGlyph}>⌁</Text></View>
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
  scrollContent: { flexGrow: 1, alignItems: "center", paddingHorizontal: 18, paddingTop: 28, paddingBottom: 36 },
  page: { width: "100%", maxWidth: 1120 },
  header: { marginBottom: 25 },
  brandRow: { flexDirection: "row", alignItems: "center", marginBottom: 20 },
  brandMark: { width: 30, height: 30, borderRadius: 10, backgroundColor: colors.greenDark, alignItems: "center", justifyContent: "center", marginRight: 10 },
  brandMarkText: { color: colors.white, fontSize: 20, fontWeight: "800", fontStyle: "italic" },
  brandName: { color: colors.greenDark, fontSize: 11, fontWeight: "800", letterSpacing: 1.6 },
  pageTitle: { color: colors.dark, fontSize: 34, lineHeight: 39, fontWeight: "800", letterSpacing: -0.8, marginBottom: 11 },
  pageDescription: { maxWidth: 600, color: colors.textSecondary, fontSize: 15, lineHeight: 23 },
  queryCard: { backgroundColor: colors.white, borderColor: colors.border, borderWidth: 1, borderRadius: 22, padding: 20, marginBottom: 23 },
  queryCardHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 },
  queryTitleGroup: { flex: 1, paddingRight: 12 },
  eyebrow: { color: colors.green, fontSize: 10, letterSpacing: 1.45, fontWeight: "800", marginBottom: 7 },
  queryTitle: { color: colors.dark, fontSize: 21, fontWeight: "800", marginBottom: 5 },
  queryDescription: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  queryDecor: { width: 46, height: 46, borderRadius: 16, backgroundColor: colors.greenSoft, alignItems: "center", justifyContent: "center" },
  queryDecorGlyph: { color: colors.greenDark, fontSize: 29, fontWeight: "600" },
  deviceList: { flexDirection: "row", flexWrap: "wrap", marginBottom: 18 },
  deviceOption: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 11, minWidth: 230, maxWidth: "100%", flexGrow: 1, flexBasis: 245, marginRight: 9, marginBottom: 9, backgroundColor: colors.white },
  deviceOptionSelected: { borderColor: colors.green, backgroundColor: "#F5F8F4" },
  deviceRadio: { width: 17, height: 17, borderRadius: 9, borderWidth: 1.5, borderColor: colors.border, alignItems: "center", justifyContent: "center", marginRight: 10 },
  deviceRadioSelected: { borderColor: colors.green },
  deviceRadioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.green },
  deviceTextGroup: { flex: 1, minWidth: 0 },
  deviceName: { color: colors.text, fontSize: 13, fontWeight: "700", marginBottom: 3 },
  deviceNameSelected: { color: colors.greenDark },
  deviceEui: { color: colors.textSecondary, fontSize: 10 },
  selectedCheck: { color: colors.green, marginLeft: 8, fontWeight: "800", fontSize: 16 },
  inlineState: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", marginBottom: 18 },
  stateText: { color: colors.textSecondary, fontSize: 13, lineHeight: 20, flexShrink: 1, marginRight: 10 },
  smallRetryButton: { paddingHorizontal: 11, paddingVertical: 8, borderRadius: 9, backgroundColor: colors.greenSoft, marginTop: 5 },
  smallRetryText: { color: colors.greenDark, fontWeight: "700", fontSize: 12 },
  warningText: { color: "#815C22", fontSize: 12, marginBottom: 12 },
  primaryButton: { backgroundColor: colors.greenDark, borderRadius: 13, minHeight: 53, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", justifyContent: "center", alignSelf: "center", width: "100%", maxWidth: 390 },
  primaryButtonDisabled: { opacity: 0.48 },
  primaryButtonSymbol: { color: colors.white, fontSize: 19, fontWeight: "700", marginRight: 10 },
  primaryButtonText: { color: colors.white, fontSize: 15, fontWeight: "800" },
  queryFootnote: { textAlign: "center", color: colors.textSecondary, fontSize: 11, lineHeight: 17, marginTop: 12 },
  errorCard: { backgroundColor: "#FFF8F0", borderWidth: 1, borderColor: "#EAD9C1", borderRadius: 16, padding: 17, marginBottom: 22 },
  errorTitle: { color: "#815C22", fontSize: 15, fontWeight: "800", marginBottom: 5 },
  errorMessage: { color: colors.text, fontSize: 13, lineHeight: 20 },
  errorRetry: { alignSelf: "flex-start", paddingVertical: 9, paddingHorizontal: 12, backgroundColor: "#F2E5D2", borderRadius: 9, marginTop: 12 },
  errorRetryText: { color: "#815C22", fontSize: 12, fontWeight: "800" },
  resultHeader: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", marginBottom: 15 },
  resultHeaderText: { flex: 1, minWidth: 235, marginRight: 10, marginBottom: 6 },
  resultTitle: { color: colors.dark, fontSize: 24, fontWeight: "800", letterSpacing: -0.4, marginBottom: 5 },
  resultSubtitle: { color: colors.textSecondary, fontSize: 11, lineHeight: 17 },
  pill: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  pillText: { fontSize: 10, fontWeight: "800" },
  recommendationCard: { backgroundColor: colors.greenDark, borderRadius: 22, padding: 21, marginBottom: 28 },
  recommendationTop: { flexDirection: "row", alignItems: "center", marginBottom: 15 },
  recommendationIcon: { width: 31, height: 31, borderRadius: 11, backgroundColor: "rgba(255,255,255,0.14)", alignItems: "center", justifyContent: "center", marginRight: 10 },
  recommendationIconText: { color: colors.white, fontSize: 17, fontWeight: "800" },
  recommendationEyebrow: { color: "#DCE8DC", fontSize: 10, letterSpacing: 1.2, fontWeight: "800" },
  recommendationTitle: { color: colors.white, fontSize: 26, lineHeight: 31, letterSpacing: -0.4, fontWeight: "800", marginBottom: 9 },
  recommendationMessage: { color: "#EFF5EF", fontSize: 14, lineHeight: 22, maxWidth: 800 },
  recommendationMetaRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", marginTop: 18 },
  recommendedDayPill: { borderLeftWidth: 1, borderLeftColor: "rgba(255,255,255,0.25)", paddingLeft: 14, marginLeft: 13, marginTop: 5, marginBottom: 5 },
  recommendedDayLabel: { color: "#DCE8DC", fontSize: 9, letterSpacing: 1, fontWeight: "800", marginBottom: 3 },
  recommendedDayValue: { color: colors.white, fontSize: 13, fontWeight: "800" },
  sectionBlock: { marginBottom: 29 },
  sectionHeading: { marginBottom: 14 },
  sectionTitle: { color: colors.dark, fontSize: 19, fontWeight: "800", marginBottom: 4, letterSpacing: -0.2 },
  sectionSubtitle: { color: colors.textSecondary, fontSize: 12, lineHeight: 18 },
  metricGrid: { flexDirection: "row", flexWrap: "wrap", marginRight: -6, marginLeft: -6 },
  metricCard: { flexGrow: 1, flexBasis: 220, minWidth: 145, backgroundColor: colors.white, borderColor: colors.border, borderWidth: 1, borderRadius: 17, padding: 15, marginHorizontal: 6, marginBottom: 12 },
  metricTopLine: { flexDirection: "row", alignItems: "center", marginBottom: 13 },
  metricSymbolWrap: { width: 30, height: 30, borderRadius: 10, backgroundColor: colors.greenSoft, alignItems: "center", justifyContent: "center", marginRight: 8 },
  metricSymbol: { color: colors.greenDark, fontSize: 16, fontWeight: "800" },
  metricLabel: { color: colors.textSecondary, fontSize: 11, fontWeight: "700", flexShrink: 1 },
  metricValue: { color: colors.dark, fontSize: 25, letterSpacing: -0.4, fontWeight: "800", marginBottom: 4 },
  metricDetail: { color: colors.textSecondary, fontSize: 10, lineHeight: 15 },
  forecastHeadingRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between" },
  horizontalHint: { color: colors.textSecondary, fontSize: 10, marginBottom: 17, marginLeft: 10 },
  forecastScrollContent: { paddingRight: 8, paddingBottom: 4 },
  forecastCard: { width: 160, backgroundColor: colors.white, borderColor: colors.border, borderWidth: 1, borderRadius: 17, padding: 13, marginRight: 10 },
  forecastWeekday: { color: colors.dark, textTransform: "capitalize", fontSize: 13, fontWeight: "800" },
  forecastDate: { color: colors.textSecondary, fontSize: 10, marginTop: 2 },
  forecastRainIcon: { width: 34, height: 34, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.greenSoft, marginTop: 13, marginBottom: 8 },
  forecastRainGlyph: { color: colors.greenDark, fontSize: 17 },
  forecastRainProbability: { color: colors.dark, fontSize: 22, fontWeight: "800", letterSpacing: -0.3 },
  forecastCaption: { color: colors.textSecondary, fontSize: 9, marginTop: 1 },
  forecastDivider: { height: 1, backgroundColor: colors.border, marginVertical: 12 },
  forecastDataLine: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 7 },
  forecastDataLabel: { color: colors.textSecondary, fontSize: 10 },
  forecastDataValue: { color: colors.text, fontSize: 10, fontWeight: "800" },
  emptyForecast: { backgroundColor: colors.white, padding: 17, borderRadius: 14, borderColor: colors.border, borderWidth: 1 },
  locationCard: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: 17, padding: 16, marginBottom: 13 },
  locationIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: colors.greenSoft, alignItems: "center", justifyContent: "center", marginRight: 12 },
  locationIconText: { color: colors.greenDark, fontSize: 23 },
  locationContent: { flex: 1, minWidth: 155, marginRight: 10, marginVertical: 4 },
  locationTitle: { color: colors.dark, fontSize: 13, fontWeight: "800", marginBottom: 4 },
  locationCoordinates: { color: colors.text, fontSize: 12, fontWeight: "600", marginBottom: 3 },
  locationDetail: { color: colors.textSecondary, fontSize: 10 },
  noteCard: { flexDirection: "row", alignItems: "flex-start", backgroundColor: colors.greenSoft, borderRadius: 15, padding: 15, marginBottom: 15 },
  noteMark: { color: colors.greenDark, borderWidth: 1, borderColor: colors.green, overflow: "hidden", textAlign: "center", textAlignVertical: "center", width: 22, height: 22, borderRadius: 11, fontSize: 13, fontWeight: "800", marginRight: 10 },
  noteContent: { flex: 1 },
  noteTitle: { color: colors.greenDark, fontSize: 12, fontWeight: "800", marginBottom: 4 },
  noteText: { color: colors.textSecondary, fontSize: 11, lineHeight: 17 },
  disclaimer: { color: colors.textSecondary, fontSize: 10, lineHeight: 16, marginTop: 4, marginBottom: 20 },
  emptyStateCard: { backgroundColor: colors.white, borderRadius: 21, borderWidth: 1, borderColor: colors.border, alignItems: "center", paddingHorizontal: 24, paddingVertical: 29, marginBottom: 24 },
  emptyStateMark: { width: 48, height: 48, borderRadius: 16, backgroundColor: colors.greenSoft, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  emptyStateGlyph: { fontSize: 28, color: colors.greenDark },
  emptyStateTitle: { color: colors.dark, fontSize: 16, fontWeight: "800", textAlign: "center", marginBottom: 6 },
  emptyStateText: { maxWidth: 480, color: colors.textSecondary, fontSize: 12, lineHeight: 19, textAlign: "center" },
  footer: { textAlign: "center", color: "#969A93", fontSize: 9, letterSpacing: 1.1, lineHeight: 15, marginTop: 5 },
});
