import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";
import { useAuth0 } from "react-native-auth0";

import { useSensors } from "../../../src/sensor/SensorContext";
import type { Device } from "../../../src/sensor/sensor.service";

import {
  getAllSensors,
  getLatestSensor,
  getSensorHistory,
  type ApiSensorHistory,
  type ApiSensorLatest,
} from "../../../src/dashboard/dashboard.service";

import {
  Map,
  Camera,
  Marker,
  StyleSpecification,
} from "@maplibre/maplibre-react-native";


import {
  getSensorStatus,
  mapApiReading,
  type DashboardSensor,
  type SensorStatus,
} from "../../../src/dashboard/dashboard.types";
import { colors } from "@/theme/colors";

const HISTORY_DAYS = 7;

export default function DashboardScreen() {
  const { user } = useAuth0();
  const { devices } = useSensors();

  const [sensors, setSensors] = useState<DashboardSensor[]>([]);
  const [selectedDevEUI, setSelectedDevEUI] = useState<string | null>(null);

  const [selectedLatest, setSelectedLatest] =
    useState<ApiSensorLatest[]>([]);

  const [selectedHistory, setSelectedHistory] =
    useState<ApiSensorHistory[]>([]);

  const [loading, setLoading] = useState(true);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedSensor = useMemo(() => {
    return sensors.find(
      (sensor) => sensor.devEUI === selectedDevEUI
    ) ?? null;
  }, [sensors, selectedDevEUI]);

  /**
   * Localiza os dados do device salvo no Supabase/SecureStore.
   * Isso nos dá lat/lon, porque /api/sensors/all não retorna localização.
   */
  const getDevice = useCallback(
    (devEUI: string): Device | undefined => {
      // Os logs entram aqui, DENTRO da função e antes do return
      console.log("API devEUI:", devEUI); // Ajustado de item.devEUI para devEUI
      
      console.log(
        "DEVICES:",
        devices.map((d) => ({
          devEUI: d.devEUI,
          lat: d.lat,
          lon: d.lon,
        }))
      );

      // O return fica no final
      return devices.find((device) => device.devEUI === devEUI);
    },
    [devices] // O array de dependências vem imediatamente após a chave de fechamento }
  );

  /**
   * Carrega todos os sensores.
   * Endpoint:
   * GET /api/sensors/all/:userId
   */
  const loadSensors = useCallback(async () => {
    if (!user?.sub) {
      setLoading(false);
      return;
    }

    try {
      setError(null);

      const response = await getAllSensors(user.sub);
      // const response = await getAllSensors('ausdgsaduUSERIDajbd');


      const mappedSensors: DashboardSensor[] =
        response.leituras.map((item) => {
          const device = getDevice(item.devEUI);
          console.log("========== DEVICE ==========");
          console.log(JSON.stringify(device, null, 2));
          console.log("============================");

          return {
            devEUI: item.devEUI,
            devAddr: item.devAddr,
            name: item.name || item.devEUI,
            applicationId: item.applicationId,

            lat: device?.lat,
            lon: device?.lon,

            reading: mapApiReading(item.payload),
          };
        });

      setSensors(mappedSensors);

      if (mappedSensors.length === 0) {
        setSelectedDevEUI(null);
        setSelectedLatest([]);
        setSelectedHistory([]);
        return;
      }

      setSelectedDevEUI((current) => {
        const exists = mappedSensors.some(
          (sensor) => sensor.devEUI === current
        );

        return exists
          ? current
          : mappedSensors[0].devEUI;
      });
    } catch (err) {
      console.error("DASHBOARD: erro ao carregar sensores:", err);

      setError(
        err instanceof Error
          ? err.message
          : "Erro ao carregar sensores."
      );
    } finally {
      setLoading(false);
    }
  }, [user?.sub, getDevice]);
  // }, ['ausdgsaduUSERIDajbd', getDevice]);


  /**
   * Carrega detalhes do sensor selecionado.
   *
   * /latest = últimas 20 mensagens
   * /influx = histórico dos últimos dias
   */
  const loadSelectedSensor = useCallback(
    async (devEUI: string) => {
      if (!user?.sub) {
        return;
      }

      try {
        setLoadingDetails(true);

        const [latest, history] = await Promise.all([
          // getLatestSensor('ausdgsaduUSERIDajbd', devEUI),
          getLatestSensor(user.sub, devEUI),

          getSensorHistory(
            user.sub,
            HISTORY_DAYS,
            devEUI
          ),

          // getSensorHistory(
          //   "ausdgsaduUSERIDajbd",
          //   HISTORY_DAYS,
          //   devEUI
          // ),
          
        ]);

        setSelectedLatest(latest);
        setSelectedHistory(history);

        console.log(
          "DASHBOARD: latest:",
          latest.length
        );

        console.log(
          "DASHBOARD: histórico:",
          history.length
        );
      } catch (err) {
        console.error(
          "DASHBOARD: erro ao carregar detalhes:",
          err
        );
      } finally {
        setLoadingDetails(false);
      }
    },
    [user?.sub]
    // ["ausdgsaduUSERIDajbd"]
  );

  useEffect(() => {
    loadSensors();
  }, [loadSensors]);

  useEffect(() => {
    if (!selectedDevEUI) {
      return;
    }

    loadSelectedSensor(selectedDevEUI);
  }, [selectedDevEUI, loadSelectedSensor]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);

    try {
      await loadSensors();

      if (selectedDevEUI) {
        await loadSelectedSensor(selectedDevEUI);
      }
    } finally {
      setRefreshing(false);
    }
  }, [
    loadSensors,
    loadSelectedSensor,
    selectedDevEUI,
  ]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>
          Carregando dashboard...
        </Text>
      </View>
    );
  }
    


  return (
    <View style={styles.container}>
      <View style={styles.content}>
      <Pressable
        onPress={() => router.back()}
        style={styles.backButton}
      >
        <Text style={styles.backText}>
          ←
        </Text>
      </Pressable>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
          />
        }
      >
        {/* HEADER */}
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>
              Fazenda Mauá
            </Text>

            <Text style={styles.subtitle}>
              {sensors.length} sensor
              {sensors.length === 1 ? "" : "es"} conectado
              {sensors.length === 1 ? "" : "s"}
            </Text>
          </View>

          <View style={styles.onlineBadge}>
            <View style={styles.onlineDot} />

            <Text style={styles.onlineText}>
              Online
            </Text>
          </View>
        </View>

        {/* ERRO */}
        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorTitle}>
              Não foi possível atualizar
            </Text>

            <Text style={styles.errorText}>
              {error}
            </Text>

            <Pressable
              style={styles.retryButton}
              onPress={loadSensors}
            >
              <Text style={styles.retryText}>
                Tentar novamente
              </Text>
            </Pressable>
          </View>
        )}

        {/* MAPA */}
        <FarmMap
          sensors={sensors}
          selectedDevEUI={selectedDevEUI}
          onSelect={setSelectedDevEUI}
        />

        {/* SENSOR SELECIONADO */}
        {selectedSensor && (
          <View style={styles.card}>
            <View style={styles.sensorHeader}>
              <View>
                <Text style={styles.sectionLabel}>
                  SENSOR SELECIONADO
                </Text>

                <Text style={styles.sensorName}>
                  {selectedSensor.name}
                </Text>

                <Text style={styles.sensorEui}>
                  {selectedSensor.devEUI}
                </Text>
              </View>

              <StatusBadge
                status={getSensorStatus(
                  selectedSensor.reading
                )}
              />
            </View>

            {/* MÉTRICAS */}
            <View style={styles.metricsGrid}>
              <Metric
                label="Umidade solo"
                value={`${selectedSensor.reading.soilMoist}%`}
                icon="💧"
              />

              <Metric
                label="Temp. ar"
                value={`${selectedSensor.reading.airTemp.toFixed(
                  1
                )}°C`}
                icon="🌡"
              />

              <Metric
                label="Umidade ar"
                value={`${selectedSensor.reading.airHumid.toFixed(
                  1
                )}%`}
                icon="💨"
              />

              <Metric
                label="Luz"
                value={`${selectedSensor.reading.light.toLocaleString(
                  "pt-BR"
                )} lx`}
                icon="☀"
              />

              <Metric
                label="Bateria"
                value={`${selectedSensor.reading.battery}%`}
                icon="🔋"
              />
            </View>

            {loadingDetails && (
              <View style={styles.detailsLoading}>
                <ActivityIndicator />
                <Text style={styles.detailsLoadingText}>
                  Atualizando leituras...
                </Text>
              </View>
            )}

            {/* INFORMAÇÃO DO HISTÓRICO */}
            <View style={styles.historyBox}>
              <Text style={styles.historyTitle}>
                Histórico
              </Text>

              <Text style={styles.historyText}>
                {selectedHistory.length} leituras encontradas
                nos últimos {HISTORY_DAYS} dias.
              </Text>
            </View>
          </View>
        )}

        {/* LISTA */}
        <View style={styles.card}>
          <View style={styles.listHeader}>
            <Text style={styles.sectionTitle}>
              Todos os sensores
            </Text>

            <Text style={styles.sensorCount}>
              {sensors.length}
            </Text>
          </View>

          {sensors.map((sensor) => {
            const status = getSensorStatus(
              sensor.reading
            );

            const selected =
              sensor.devEUI === selectedDevEUI;

            return (
              <Pressable
                key={sensor.devEUI}
                style={[
                  styles.sensorRow,
                  selected && styles.sensorRowSelected,
                ]}
                onPress={() =>
                  setSelectedDevEUI(sensor.devEUI)
                }
              >
                <View
                  style={[
                    styles.statusDot,
                    {
                      backgroundColor:
                        getStatusColor(status),
                    },
                  ]}
                />

                <View style={styles.sensorRowInfo}>
                  <Text style={styles.sensorRowName}>
                    {sensor.name}
                  </Text>

                  <Text style={styles.sensorRowEui}>
                    {sensor.devEUI}
                  </Text>
                </View>

                <View style={styles.sensorRowRight}>
                  <Text style={styles.moistureValue}>
                    {sensor.reading.soilMoist}%
                  </Text>

                  <Text style={styles.moistureLabel}>
                    solo
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
        {/* IRRIGAÇÃO*/}
        <Pressable
          style={styles.addButton}
          onPress={() => router.push("/dashboard/components/irrigationPage")}
        >
          <Text style={styles.addButtonText}>
            IRRIGAÇÃO
          </Text>
        </Pressable>

        {/* NOVO SENSOR
        <Pressable
          style={styles.addButton}
          onPress={() => router.push("/sensor")}
        >
          <Text style={styles.addButtonText}>
            Configurar novo sensor
          </Text>
        </Pressable> */}
      </ScrollView>
      </View>
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* MAPA                                                                       */
/* -------------------------------------------------------------------------- */

type FarmMapProps = {
  sensors: DashboardSensor[];
  selectedDevEUI: string | null;
  onSelect: (devEUI: string) => void;
};

function FarmMap({
  sensors,
  selectedDevEUI,
  onSelect,
}: FarmMapProps) {
  const sensorsWithCoordinates = sensors.filter(
    (sensor) =>
      typeof sensor.lat === "number" &&
      typeof sensor.lon === "number" &&
      Number.isFinite(sensor.lat) &&
      Number.isFinite(sensor.lon)
  );

  if (sensorsWithCoordinates.length === 0) {
    return (
      <View style={styles.mapEmpty}>
        <Text style={styles.mapEmptyTitle}>
          Localização indisponível
        </Text>

        <Text style={styles.mapEmptyText}>
          Nenhum sensor possui latitude e longitude cadastradas.
        </Text>
      </View>
    );
  }

  const firstSensor = sensorsWithCoordinates[0];

  const mapStyle: StyleSpecification = {
    version: 8,

    sources: {
      "osm-raster": {
        type: "raster",
        tiles: [
          "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        ],
        tileSize: 256,
      },
    },

    layers: [
      {
        id: "osm-raster-layer",
        type: "raster",
        source: "osm-raster",
      },
    ],
  };

  return (
    <View style={styles.map}>
      <Map
        style={StyleSheet.absoluteFill}
        mapStyle={mapStyle}
        attribution
        compass
        scaleBar
      >
        <Camera
          initialViewState={{
            center: [
              firstSensor.lon!,
              firstSensor.lat!,
            ],
            zoom: 16,
          }}
        />

        {sensorsWithCoordinates.map((sensor) => {
          const selected =
            sensor.devEUI === selectedDevEUI;

          const status = getSensorStatus(
            sensor.reading
          );

          return (
            <Marker
              key={sensor.devEUI}
              id={`sensor-${sensor.devEUI}`}
              lngLat={[
                sensor.lon!,
                sensor.lat!,
              ]}
              onPress={() =>
                onSelect(sensor.devEUI)
              }
            >
              <View
                style={[
                  styles.realMapMarker,
                  selected &&
                    styles.realMapMarkerSelected,
                  {
                    backgroundColor:
                      getStatusColor(status),
                  },
                ]}
              >
                <View
                  style={styles.realMapMarkerInner}
                />
              </View>
            </Marker>
          );
        })}
      </Map>

      <View style={styles.mapOverlay}>
        <Text style={styles.mapOverlayTitle}>
          Fazenda Mauá
        </Text>

        <Text style={styles.mapOverlayText}>
          {sensorsWithCoordinates.length}{" "}
          {sensorsWithCoordinates.length === 1
            ? "sensor localizado"
            : "sensores localizados"}
        </Text>
      </View>
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* COMPONENTES                                                                */
/* -------------------------------------------------------------------------- */

function Metric({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: string;
}) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricIcon}>
        {icon}
      </Text>

      <Text style={styles.metricValue}>
        {value}
      </Text>

      <Text style={styles.metricLabel}>
        {label}
      </Text>
    </View>
  );
}

function StatusBadge({
  status,
}: {
  status: SensorStatus;
}) {
  const text =
    status === "ok"
      ? "Normal"
      : status === "warn"
        ? "Atenção"
        : "Alerta";

  return (
    <View
      style={[
        styles.statusBadge,
        {
          backgroundColor:
            getStatusColor(status) + "20",
        },
      ]}
    >
      <View
        style={[
          styles.statusBadgeDot,
          {
            backgroundColor:
              getStatusColor(status),
          },
        ]}
      />

      <Text
        style={[
          styles.statusBadgeText,
          {
            color: getStatusColor(status),
          },
        ]}
      >
        {text}
      </Text>
    </View>
  );
}

function getStatusColor(
  status: SensorStatus
) {
  switch (status) {
    case "alert":
      return "#C94C4C";

    case "warn":
      return "#D69E2E";

    default:
      return "#4A7C59";
  }
}

/* -------------------------------------------------------------------------- */
/* STYLES                                                                     */
/* -------------------------------------------------------------------------- */

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F6F5F0",
  },

  content: {
    padding: 16,
    paddingTop: 24,
    paddingBottom: 40,
    gap: 16,
  },

  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F6F5F0",
  },

  loadingText: {
    marginTop: 10,
    color: "#6B706B",
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  title: {
    fontSize: 24,
    fontWeight: "800",
    color: "#1A201C",
  },

  subtitle: {
    marginTop: 4,
    color: "#6B706B",
    fontSize: 14,
  },

  onlineBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: "#4A7C5918",
  },

  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#4A7C59",
  },

  onlineText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#4A7C59",
  },

  errorBox: {
    padding: 14,
    borderRadius: 14,
    backgroundColor: "#C94C4C15",
  },

  errorTitle: {
    fontWeight: "700",
    color: "#C94C4C",
  },

  errorText: {
    marginTop: 4,
    color: "#6B706B",
    fontSize: 13,
  },

  retryButton: {
    marginTop: 12,
    alignSelf: "flex-start",
    backgroundColor: "#C94C4C",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },

  retryText: {
    color: "#fff",
    fontWeight: "700",
  },

  map: {
    height: 300,
    borderRadius: 22,
    overflow: "hidden",
    backgroundColor: "#DDE7D3",
    position: "relative",
  },

  mapEmpty: {
  height: 300,
  borderRadius: 22,
  backgroundColor: "#E9E8E1",
  alignItems: "center",
  justifyContent: "center",
  paddingHorizontal: 30,
},

mapEmptyTitle: {
  color: "#1A201C",
  fontSize: 16,
  fontWeight: "800",
},

mapEmptyText: {
  marginTop: 6,
  color: "#6B706B",
  fontSize: 13,
  textAlign: "center",
},

realMapMarker: {
  width: 22,
  height: 22,
  borderRadius: 11,
  borderWidth: 3,
  borderColor: "#FFFFFF",
  alignItems: "center",
  justifyContent: "center",

  // sombra no Android
  elevation: 5,
},

realMapMarkerSelected: {
  width: 30,
  height: 30,
  borderRadius: 15,
  borderWidth: 4,
},

realMapMarkerInner: {
  width: 6,
  height: 6,
  borderRadius: 3,
  backgroundColor: "#FFFFFF",
},

  mapOverlay: {
    position: "absolute",
    left: 14,
    top: 14,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: "#F6F5F0E8",
  },

  mapOverlayTitle: {
    color: "#1A201C",
    fontWeight: "800",
    fontSize: 14,
  },

  mapOverlayText: {
    marginTop: 2,
    color: "#6B706B",
    fontSize: 11,
  },

  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 16,
  },

  sensorHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },

  sectionLabel: {
    color: "#8A8F89",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
  },

  sensorName: {
    marginTop: 5,
    color: "#1A201C",
    fontSize: 20,
    fontWeight: "800",
  },

  sensorEui: {
    marginTop: 3,
    color: "#8A8F89",
    fontSize: 11,
  },

  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },

  statusBadgeDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },

  statusBadgeText: {
    fontSize: 11,
    fontWeight: "800",
  },

  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 18,
  },

  metric: {
    width: "31%",
    minWidth: 95,
    backgroundColor: "#F6F5F0",
    borderRadius: 14,
    padding: 12,
  },

  metricIcon: {
    fontSize: 16,
  },

  metricValue: {
    marginTop: 8,
    color: "#1A201C",
    fontSize: 17,
    fontWeight: "800",
  },

  metricLabel: {
    marginTop: 3,
    color: "#6B706B",
    fontSize: 10,
  },

  detailsLoading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 14,
  },

  detailsLoadingText: {
    color: "#6B706B",
    fontSize: 12,
  },

  historyBox: {
    marginTop: 14,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#4A7C5910",
  },

  historyTitle: {
    color: "#1A201C",
    fontWeight: "800",
  },

  historyText: {
    marginTop: 3,
    color: "#6B706B",
    fontSize: 12,
  },

  listHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },

  sectionTitle: {
    color: "#1A201C",
    fontSize: 17,
    fontWeight: "800",
  },

  sensorCount: {
    color: "#6B706B",
    fontWeight: "700",
  },

  sensorRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: "#ECECE7",
  },

  sensorRowSelected: {
    backgroundColor: "#F6F5F0",
    borderRadius: 12,
    paddingHorizontal: 8,
  },

  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 10,
  },

  sensorRowInfo: {
    flex: 1,
  },

  sensorRowName: {
    color: "#1A201C",
    fontWeight: "700",
  },

  sensorRowEui: {
    marginTop: 2,
    color: "#8A8F89",
    fontSize: 10,
  },

  sensorRowRight: {
    alignItems: "flex-end",
  },

  moistureValue: {
    color: "#1A201C",
    fontWeight: "800",
  },

  moistureLabel: {
    color: "#8A8F89",
    fontSize: 10,
  },

  addButton: {
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: "center",
    backgroundColor: "#1A201C",
  },

  addButtonText: {
    color: "#FFFFFF",
    fontWeight: "800",
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
});