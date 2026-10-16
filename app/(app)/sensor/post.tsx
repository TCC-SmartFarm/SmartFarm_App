// import React, {
//   useEffect,
//   useState,
// } from "react";

// import {
//   ActivityIndicator,
//   Pressable,
//   ScrollView,
//   StyleSheet,
//   Text,
//   View,
// } from "react-native";

// import { SafeAreaView } from "react-native-safe-area-context";

// import { router } from "expo-router";

// import { useAuth0 } from "react-native-auth0";

// import { useSensors } from "../../../src/sensor/SensorContext";

// import {
//   getCurrentWifiSSID,
// } from "../../../src/sensor/wifi/wifi.service";

// import {
//   postDeviceToEsp,
// } from "../../../src/sensor/esp.service";

// import {
//   updateDevice,
// } from "../../../src/sensor/device.service";

// import {
//   saveDevices,
// } from "../../../src/sensor/sensor.storage";

// import { colors } from "@/theme/colors";

// export default function SensorPostScreen() {
//   const { user } = useAuth0();

//   const {
//     devices,
//     selectedDevice,
//     setDevices,
//     setSelectedDevice,
//   } = useSensors();

//   const [currentSSID, setCurrentSSID] =
//     useState<string | null>(null);

//   const [checkingWifi, setCheckingWifi] =
//     useState(true);

//   const [sending, setSending] =
//     useState(false);

//   const [error, setError] =
//     useState<string | null>(null);

//   const [
//     sendSuccess,
//     setSendSuccess,
//   ] = useState(false);

//   /*
//    * setup_date que será criado no momento
//    * da configuração.
//    *
//    * Ele só é efetivamente criado quando
//    * o usuário executar o POST com sucesso.
//    */
//   const [previewSetupDate] =
//     useState(() =>
//       Math.floor(Date.now() / 1000)
//     );

//   useEffect(() => {
//     checkWifi();
//   }, []);

//   async function checkWifi() {
//     try {
//       setCheckingWifi(true);
//       setError(null);

//       const ssid =
//         await getCurrentWifiSSID();

//       console.log(
//         "POST: SSID atual:",
//         ssid
//       );

//       setCurrentSSID(ssid);

//       if (!ssid?.startsWith("DATA")) {
//         setError(
//           "Seu celular não está conectado à rede do sensor."
//         );
//       }
//     } catch (err) {
//       console.error(
//         "POST: erro verificando Wi-Fi:",
//         err
//       );

//       setError(
//         "Não foi possível verificar a conexão com o sensor."
//       );
//     } finally {
//       setCheckingWifi(false);
//     }
//   }

//   async function handlePost() {
//     if (!selectedDevice) {
//       setError(
//         "Nenhum sensor foi selecionado."
//       );
//       return;
//     }

//     if (!user?.sub) {
//       setError(
//         "Usuário não autenticado."
//       );
//       return;
//     }

//     try {
//       setSending(true);
//       setError(null);
//       setSendSuccess(false);

//       /*
//        * Confirma novamente o Wi-Fi antes do POST.
//        */
//       const ssid =
//         await getCurrentWifiSSID();

//       console.log(
//         "POST: verificando SSID antes do envio:",
//         ssid
//       );

//       if (!ssid?.startsWith("DATA")) {
//         throw new Error(
//           "Seu celular não está conectado à rede do sensor."
//         );
//       }

//       /*
//        * POST para o ESP.
//        *
//        * O objeto selectedDevice é passado para
//        * postDeviceToEsp(), que é responsável pela
//        * construção do payload efetivamente enviado.
//        */
//       const result =
//         await postDeviceToEsp(
//           selectedDevice
//         );

//       if (result.status === 200) {
//         console.log(
//           "POST: configuração aceita pelo ESP"
//         );

//         /*
//          * Cria a data/hora da configuração.
//          */
//         const setupDate =
//           Math.floor(
//             Math.floor(Date.now() / 1000)
//           );

//         /*
//          * Mantém todos os dados existentes do
//          * selectedDevice e adiciona/atualiza
//          * setup_date.
//          *
//          * Portanto, se selectedDevice já possui:
//          *
//          * - Host
//          * - devEUI
//          * - app_s_key
//          * - nwk_s_key
//          * - devAddress
//          * - lat
//          * - lon
//          *
//          * todos eles continuam no objeto salvo.
//          */
//         const configuredDevice = {
//           ...selectedDevice,
//           setup_date: setupDate,
//         };

//         /*
//          * Atualiza o array global.
//          */
//         const updatedDevices =
//           devices.map((device) =>
//             device.key ===
//             selectedDevice.key
//               ? configuredDevice
//               : device
//           );

//         setDevices(updatedDevices);

//         /*
//          * Atualiza o device selecionado.
//          */
//         setSelectedDevice(
//           configuredDevice
//         );

//         /*
//          * Atualiza o storage local.
//          *
//          * Isso é importante porque daqui para frente
//          * o aplicativo pode estar sem Internet.
//          */
//         await saveDevices(
//           user.sub,
//           updatedDevices
//         );

//         /*
//          * Atualiza o Supabase.
//          *
//          * Aqui o objeto configurado contém também
//          * latitude e longitude, caso já estejam
//          * presentes no selectedDevice.
//          */
//         await updateDevice(
//           user.sub,
//           selectedDevice.key,
//           configuredDevice
//         );

//         setSendSuccess(true);

//         /*
//          * Pequena pausa visual antes da próxima tela.
//          */
//         setTimeout(() => {
//           router.replace(
//             "/sensor/success"
//           );
//         }, 700);

//         return;
//       }

//       if (result.status === 500) {
//         setError(
//           "O sensor recusou a configuração. Verifique os dados e tente novamente."
//         );

//         return;
//       }

//       setError(
//         `O sensor retornou o código ${result.status}.`
//       );
//     } catch (err) {
//       console.error(
//         "POST: erro:",
//         err
//       );

//       setError(
//         err instanceof Error
//           ? err.message
//           : "Não foi possível configurar o sensor."
//       );
//     } finally {
//       setSending(false);
//     }
//   }

//   if (!selectedDevice) {
//     return (
//       <SafeAreaView style={styles.container}>
//         <View style={styles.emptyContainer}>
//           <Text style={styles.emptyTitle}>
//             Nenhum sensor selecionado
//           </Text>

//           <Text style={styles.emptyText}>
//             Volte para a tela anterior e
//             selecione um sensor.
//           </Text>

//           <Pressable
//             onPress={() => router.back()}
//             style={styles.button}
//           >
//             <Text style={styles.buttonText}>
//               Voltar
//             </Text>
//           </Pressable>
//         </View>
//       </SafeAreaView>
//     );
//   }

//   const isConnectedToEsp =
//     !!currentSSID &&
//     currentSSID.startsWith("DATA");

//   /*
//    * Valores da localização que serão
//    * mantidos no device e posteriormente
//    * enviados ao updateDevice().
//    */
//   const latitude =
//     selectedDevice.lat;

//   const longitude =
//     selectedDevice.lon;

//   /*
//    * Endpoint utilizado pelo ESP.
//    *
//    * Mantemos isso explícito na interface para
//    * deixar claro para o usuário para onde
//    * os dados de configuração estão sendo enviados.
//    */
//   const espEndpoint =
//     "http://192.168.4.1/api/config";

//   /*
//    * Representação visual do payload.
//    *
//    * As chaves aparecem mascaradas na interface,
//    * mas o objeto real enviado continua contendo
//    * os valores completos.
//    */
//   const payloadPreview = {
//     Host:
//       selectedDevice.Host,
//     devEUI:
//       selectedDevice.devEUI,
//     devAddress:
//       selectedDevice.devAddress,
//     app_s_key:
//       selectedDevice.app_s_key,
//     nwk_s_key:
//       selectedDevice.nwk_s_key,
//   };

//   /*
//    * Payload visual seguro.
//    *
//    * Não expõe as chaves completas na tela.
//    */
//   const payloadDisplay = {
//     Host:
//       selectedDevice.Host,
//     devEUI:
//       selectedDevice.devEUI,
//     devAddress:
//       selectedDevice.devAddress,
//     app_s_key:
//       maskSecret(
//         selectedDevice.app_s_key
//       ),
//     nwk_s_key:
//       maskSecret(
//         selectedDevice.nwk_s_key
//       ),
//   };

//   /*
//    * Dados que serão persistidos no Supabase.
//    *
//    * As coordenadas vêm do selectedDevice.
//    */
//   const supabasePreview = {
//     userId:
//       user?.sub ?? "",
//     sensor:
//       selectedDevice.key,
//     Host:
//       selectedDevice.Host,
//     devEUI:
//       selectedDevice.devEUI,
//     devAddress:
//       selectedDevice.devAddress,
//     app_s_key:
//       selectedDevice.app_s_key,
//     nwk_s_key:
//       selectedDevice.nwk_s_key,
//     lat:
//       latitude,
//     lon:
//       longitude,
//     setup_date:
//       previewSetupDate,
//   };

//   return (
//     <SafeAreaView style={styles.container}>
//       <View style={styles.content}>
//         <Pressable
//           onPress={() => router.back()}
//           style={styles.backButton}
//           disabled={sending}
//         >
//           <Text style={styles.backText}>
//             ←
//           </Text>
//         </Pressable>

//         <ScrollView
//           style={styles.scroll}
//           contentContainerStyle={
//             styles.scrollContent
//           }
//           showsVerticalScrollIndicator={false}
//         >
//           <Text style={styles.eyebrow}>
//             ETAPA FINAL
//           </Text>

//           <Text style={styles.title}>
//             Configurando{"\n"}
//             seu sensor.
//           </Text>

//           <Text style={styles.description}>
//             Estamos enviando as informações
//             cadastradas para o sensor através da
//             rede Wi-Fi local.
//           </Text>

//           {/* ================================================= */}
//           {/* SENSOR */}
//           {/* ================================================= */}

//           <View style={styles.sensorCard}>
//             <View
//               style={styles.sensorIndicator}
//             />

//             <View style={styles.sensorInfo}>
//               <Text style={styles.sensorTitle}>
//                 Sensor {selectedDevice.key}
//               </Text>

//               <Text style={styles.sensorEui}>
//                 devEUI: {selectedDevice.devEUI}
//               </Text>

//               <Text style={styles.sensorAddress}>
//                 Endereço:{" "}
//                 {selectedDevice.devAddress}
//               </Text>
//             </View>
//           </View>

//           {/* ================================================= */}
//           {/* WI-FI */}
//           {/* ================================================= */}

//           <View style={styles.statusCard}>
//             <View
//               style={[
//                 styles.statusIndicator,
//                 isConnectedToEsp &&
//                   styles.statusIndicatorSuccess,
//                 !isConnectedToEsp &&
//                   styles.statusIndicatorError,
//               ]}
//             />

//             <View
//               style={
//                 styles.statusContent
//               }
//             >
//               <Text style={styles.statusTitle}>
//                 {checkingWifi
//                   ? "Verificando conexão"
//                   : isConnectedToEsp
//                     ? "Sensor conectado"
//                     : "Sensor não conectado"}
//               </Text>

//               <Text
//                 style={
//                   styles.statusDescription
//                 }
//               >
//                 {checkingWifi
//                   ? "Verificando a rede Wi-Fi atual."
//                   : isConnectedToEsp
//                     ? `Conectado a ${currentSSID}`
//                     : "Conecte-se à rede DATALOGGER do sensor."}
//               </Text>
//             </View>
//           </View>

//           {/* ================================================= */}
//           {/* SEÇÃO ESP */}
//           {/* ================================================= */}

//           <View style={styles.sectionHeader}>
//             <Text style={styles.sectionEyebrow}>
//               ESP
//             </Text>

//             <Text style={styles.sectionTitle}>
//               Dados enviados ao sensor
//             </Text>

//             <Text
//               style={
//                 styles.sectionDescription
//               }
//             >
//               Estes são os dados de configuração
//               utilizados no POST para o ESP.
//             </Text>
//           </View>

//           {/* Informações do POST */}

//           <View style={styles.infoCard}>
//             <Text style={styles.cardTitle}>
//               Requisição HTTP
//             </Text>

//             <InfoRow
//               label="Método"
//               value="POST"
//             />

//             <InfoRow
//               label="Endpoint"
//               value={espEndpoint}
//             />

//             <InfoRow
//               label="Content-Type"
//               value="application/json"
//             />

//             <InfoRow
//               label="Rede Wi-Fi"
//               value={
//                 currentSSID ??
//                 "Não conectado"
//               }
//             />
//           </View>

//           {/* Dados */}

//           <View style={styles.dataCard}>
//             <Text style={styles.dataTitle}>
//               Campos enviados ao ESP
//             </Text>

//             <Text
//               style={
//                 styles.dataSubtitle
//               }
//             >
//               Os valores abaixo correspondem
//               aos dados de configuração do
//               sensor.
//             </Text>

//             <DataRow
//               label="Host"
//               value={
//                 selectedDevice.Host
//               }
//             />

//             <DataRow
//               label="devEUI"
//               value={
//                 selectedDevice.devEUI
//               }
//             />

//             <DataRow
//               label="devAddress"
//               value={
//                 selectedDevice.devAddress
//               }
//             />

//             <DataRow
//               label="app_s_key"
//               value={
//                 selectedDevice.app_s_key
//               }
//               secret
//             />

//             <DataRow
//               label="nwk_s_key"
//               value={
//                 selectedDevice.nwk_s_key
//               }
//               secret
//             />
//           </View>

//           {/* Payload JSON */}

//           <View style={styles.payloadCard}>
//             <Text style={styles.payloadTitle}>
//               Payload JSON
//             </Text>

//             <Text
//               style={
//                 styles.payloadDescription
//               }
//             >
//               Este é o formato dos dados enviados
//               no corpo da requisição. As chaves de
//               segurança são ocultadas apenas nesta
//               visualização.
//             </Text>

//             <View
//               style={styles.payloadBox}
//             >
//               <Text
//                 style={styles.payloadText}
//               >
//                 {JSON.stringify(
//                   payloadDisplay,
//                   null,
//                   2
//                 )}
//               </Text>
//             </View>
//           </View>

//           {/* ================================================= */}
//           {/* LOCALIZAÇÃO */}
//           {/* ================================================= */}

//           <View style={styles.sectionHeader}>
//             <Text style={styles.sectionEyebrow}>
//               LOCALIZAÇÃO
//             </Text>

//             <Text style={styles.sectionTitle}>
//               Coordenadas do sensor
//             </Text>

//             <Text
//               style={
//                 styles.sectionDescription
//               }
//             >
//               Estas coordenadas não são enviadas
//               ao ESP. Elas serão mantidas no
//               cadastro do sensor no aplicativo e
//               no Supabase.
//             </Text>
//           </View>

//           <View style={styles.locationCard}>
//             <View
//               style={styles.coordinateRow}
//             >
//               <View
//                 style={
//                   styles.coordinateContent
//                 }
//               >
//                 <Text
//                   style={
//                     styles.coordinateLabel
//                   }
//                 >
//                   LATITUDE
//                 </Text>

//                 <Text
//                   style={
//                     styles.coordinateValue
//                   }
//                 >
//                   {latitude !==
//                     undefined &&
//                   latitude !== null
//                     ? latitude
//                     : "Não definida"}
//                 </Text>
//               </View>
//             </View>

//             <View
//               style={[
//                 styles.coordinateRow,
//                 styles.coordinateRowBorder,
//               ]}
//             >
//               <View
//                 style={
//                   styles.coordinateContent
//                 }
//               >
//                 <Text
//                   style={
//                     styles.coordinateLabel
//                   }
//                 >
//                   LONGITUDE
//                 </Text>

//                 <Text
//                   style={
//                     styles.coordinateValue
//                   }
//                 >
//                   {longitude !==
//                     undefined &&
//                   longitude !== null
//                     ? longitude
//                     : "Não definida"}
//                 </Text>
//               </View>
//             </View>
//           </View>

//           {/* ================================================= */}
//           {/* SUPABASE */}
//           {/* ================================================= */}

//           <View style={styles.sectionHeader}>
//             <Text style={styles.sectionEyebrow}>
//               SUPABASE
//             </Text>

//             <Text style={styles.sectionTitle}>
//               Dados que serão salvos
//             </Text>

//             <Text
//               style={
//                 styles.sectionDescription
//               }
//             >
//               Depois que o ESP aceitar a
//               configuração, estes dados serão
//               persistidos no cadastro do sensor.
//             </Text>
//           </View>

//           <View style={styles.supabaseCard}>
//             <Text
//               style={styles.supabaseTitle}
//             >
//               Registro do sensor
//             </Text>

//             <DataRow
//               label="userId"
//               value={
//                 supabasePreview.userId
//               }
//             />

//             <DataRow
//               label="Sensor"
//               value={
//                 supabasePreview.sensor
//               }
//             />

//             <DataRow
//               label="Host"
//               value={
//                 supabasePreview.Host
//               }
//             />

//             <DataRow
//               label="devEUI"
//               value={
//                 supabasePreview.devEUI
//               }
//             />

//             <DataRow
//               label="devAddress"
//               value={
//                 supabasePreview.devAddress
//               }
//             />

//             <DataRow
//               label="app_s_key"
//               value={
//                 supabasePreview.app_s_key
//               }
//               secret
//             />

//             <DataRow
//               label="nwk_s_key"
//               value={
//                 supabasePreview.nwk_s_key
//               }
//               secret
//             />

//             <DataRow
//               label="lat"
//               value={
//                 latitude !==
//                   undefined &&
//                 latitude !== null
//                   ? String(latitude)
//                   : "Não definida"
//               }
//             />

//             <DataRow
//               label="lon"
//               value={
//                 longitude !==
//                   undefined &&
//                 longitude !== null
//                   ? String(longitude)
//                   : "Não definida"
//               }
//             />

//             <DataRow
//               label="setup_date"
//               value={formatUnixDate(
//                 previewSetupDate
//               )}
//             />

//             <DataRow
//               label="setup_date (Unix)"
//               value={String(
//                 previewSetupDate
//               )}
//             />
//           </View>

//           {/* JSON visual do Supabase */}

//           <View
//             style={
//               styles.supabasePayloadCard
//             }
//           >
//             <Text
//               style={
//                 styles.payloadTitle
//               }
//             >
//               Registro que será persistido
//             </Text>

//             <Text
//               style={
//                 styles.payloadDescription
//               }
//             >
//               Representação dos dados do sensor
//               no momento da configuração.
//             </Text>

//             <View
//               style={
//                 styles.payloadBox
//               }
//             >
//               <Text
//                 style={
//                   styles.payloadText
//                 }
//               >
//                 {JSON.stringify(
//                   {
//                     userId:
//                       supabasePreview.userId,
//                     sensor:
//                       supabasePreview.sensor,
//                     Host:
//                       supabasePreview.Host,
//                     devEUI:
//                       supabasePreview.devEUI,
//                     devAddress:
//                       supabasePreview.devAddress,
//                     app_s_key:
//                       maskSecret(
//                         supabasePreview.app_s_key
//                       ),
//                     nwk_s_key:
//                       maskSecret(
//                         supabasePreview.nwk_s_key
//                       ),
//                     lat:
//                       supabasePreview.lat,
//                     lon:
//                       supabasePreview.lon,
//                     setup_date:
//                       supabasePreview.setup_date,
//                   },
//                   null,
//                   2
//                 )}
//               </Text>
//             </View>
//           </View>

//           {/* ================================================= */}
//           {/* SUCESSO / ERRO */}
//           {/* ================================================= */}

//           {sendSuccess && (
//             <View
//               style={
//                 styles.successCard
//               }
//             >
//               <View
//                 style={
//                   styles.successDot
//                 }
//               />

//               <Text
//                 style={
//                   styles.successText
//                 }
//               >
//                 Sensor configurado com sucesso.
//               </Text>
//             </View>
//           )}

//           {error && (
//             <View
//               style={styles.errorCard}
//             >
//               <Text
//                 style={
//                   styles.errorTitle
//                 }
//               >
//                 Não foi possível configurar
//               </Text>

//               <Text
//                 style={
//                   styles.errorText
//                 }
//               >
//                 {error}
//               </Text>
//             </View>
//           )}
//         </ScrollView>

//         {/* ================================================= */}
//         {/* BOTÕES */}
//         {/* ================================================= */}

//         <View style={styles.bottom}>
//           {!isConnectedToEsp &&
//             !checkingWifi && (
//               <Pressable
//                 onPress={checkWifi}
//                 disabled={sending}
//                 style={
//                   styles.secondaryButton
//                 }
//               >
//                 <Text
//                   style={
//                     styles.secondaryButtonText
//                   }
//                 >
//                   Verificar conexão
//                 </Text>
//               </Pressable>
//             )}

//           <Pressable
//             disabled={
//               sending ||
//               checkingWifi ||
//               !isConnectedToEsp ||
//               sendSuccess
//             }
//             onPress={handlePost}
//             style={({ pressed }) => [
//               styles.button,
//               (!isConnectedToEsp ||
//                 checkingWifi ||
//                 sending ||
//                 sendSuccess) &&
//                 styles.buttonDisabled,
//               pressed &&
//                 !sending &&
//                 styles.buttonPressed,
//             ]}
//           >
//             {sending ? (
//               <ActivityIndicator
//                 color={colors.white}
//               />
//             ) : (
//               <>
//                 <Text
//                   style={
//                     styles.buttonText
//                   }
//                 >
//                   {sendSuccess
//                     ? "Configurado"
//                     : "Configurar sensor"}
//                 </Text>

//                 {!sendSuccess && (
//                   <Text
//                     style={
//                       styles.buttonArrow
//                     }
//                   >
//                     →
//                   </Text>
//                 )}
//               </>
//             )}
//           </Pressable>
//         </View>
//       </View>
//     </SafeAreaView>
//   );
// }

// /* ========================================================= */
// /* COMPONENTES */
// /* ========================================================= */

// function DataRow({
//   label,
//   value,
//   secret = false,
// }: {
//   label: string;
//   value: string;
//   secret?: boolean;
// }) {
//   return (
//     <View style={styles.dataRow}>
//       <Text style={styles.dataLabel}>
//         {label}
//       </Text>

//       <Text
//         style={styles.dataValue}
//         numberOfLines={1}
//         ellipsizeMode="middle"
//       >
//         {secret
//           ? maskSecret(value)
//           : value}
//       </Text>
//     </View>
//   );
// }

// function InfoRow({
//   label,
//   value,
// }: {
//   label: string;
//   value: string;
// }) {
//   return (
//     <View style={styles.infoRow}>
//       <Text style={styles.infoLabel}>
//         {label}
//       </Text>

//       <Text
//         style={styles.infoValue}
//         numberOfLines={2}
//         ellipsizeMode="middle"
//       >
//         {value}
//       </Text>
//     </View>
//   );
// }

// /* ========================================================= */
// /* HELPERS */
// /* ========================================================= */

// function maskSecret(
//   value?: string
// ) {
//   if (!value) {
//     return "Não definido";
//   }

//   if (value.length <= 8) {
//     return "••••••••";
//   }

//   return `${value.slice(
//     0,
//     4
//   )}••••${value.slice(-4)}`;
// }

// function formatUnixDate(
//   unix: number
// ) {
//   const date =
//     new Date(unix * 1000);

//   return date.toLocaleString(
//     "pt-BR"
//   );
// }

// /* ========================================================= */
// /* STYLES */
// /* ========================================================= */

// const styles = StyleSheet.create({
//   container: {
//     flex: 1,
//     backgroundColor:
//       colors.background,
//   },

//   content: {
//     flex: 1,
//     paddingHorizontal: 24,
//     paddingTop: 8,
//   },

//   backButton: {
//     width: 44,
//     height: 44,
//     justifyContent: "center",
//   },

//   backText: {
//     fontSize: 28,
//     color: colors.dark,
//   },

//   scroll: {
//     flex: 1,
//   },

//   scrollContent: {
//     paddingTop: 20,
//     paddingBottom: 24,
//   },

//   eyebrow: {
//     fontSize: 12,
//     fontWeight: "700",
//     letterSpacing: 1.5,
//     color: colors.green,
//   },

//   title: {
//     marginTop: 12,
//     fontSize: 40,
//     lineHeight: 43,
//     fontWeight: "800",
//     letterSpacing: -1.2,
//     color: colors.dark,
//   },

//   description: {
//     marginTop: 20,
//     fontSize: 15,
//     lineHeight: 23,
//     color: colors.textSecondary,
//   },

//   sensorCard: {
//     marginTop: 28,
//     padding: 18,
//     borderRadius: 20,
//     backgroundColor:
//       colors.white,
//     borderWidth: 1,
//     borderColor:
//       colors.border,
//     flexDirection: "row",
//     alignItems: "center",
//   },

//   sensorIndicator: {
//     width: 10,
//     height: 10,
//     borderRadius: 10,
//     backgroundColor:
//       colors.green,
//     marginRight: 12,
//   },

//   sensorInfo: {
//     flex: 1,
//     minWidth: 0,
//   },

//   sensorTitle: {
//     fontSize: 17,
//     fontWeight: "800",
//     color: colors.dark,
//   },

//   sensorEui: {
//     marginTop: 4,
//     fontSize: 12,
//     color:
//       colors.textSecondary,
//   },

//   sensorAddress: {
//     marginTop: 4,
//     fontSize: 12,
//     color:
//       colors.textSecondary,
//   },

//   statusCard: {
//     marginTop: 14,
//     padding: 16,
//     borderRadius: 18,
//     backgroundColor:
//       colors.white,
//     borderWidth: 1,
//     borderColor:
//       colors.border,
//     flexDirection: "row",
//     alignItems: "center",
//   },

//   statusIndicator: {
//     width: 10,
//     height: 10,
//     borderRadius: 10,
//     backgroundColor:
//       "#D7D7D2",
//     marginRight: 12,
//   },

//   statusIndicatorSuccess: {
//     backgroundColor:
//       colors.green,
//   },

//   statusIndicatorError: {
//     backgroundColor:
//       "#A34B4B",
//   },

//   statusContent: {
//     flex: 1,
//   },

//   statusTitle: {
//     fontSize: 15,
//     fontWeight: "700",
//     color: colors.dark,
//   },

//   statusDescription: {
//     marginTop: 3,
//     fontSize: 12,
//     lineHeight: 17,
//     color:
//       colors.textSecondary,
//   },

//   /* ======================================================= */
//   /* SEÇÕES */
//   /* ======================================================= */

//   sectionHeader: {
//     marginTop: 30,
//     marginBottom: 12,
//   },

//   sectionEyebrow: {
//     fontSize: 10,
//     fontWeight: "800",
//     letterSpacing: 1.5,
//     color: colors.green,
//   },

//   sectionTitle: {
//     marginTop: 5,
//     fontSize: 21,
//     fontWeight: "800",
//     color: colors.dark,
//   },

//   sectionDescription: {
//     marginTop: 6,
//     fontSize: 13,
//     lineHeight: 19,
//     color:
//       colors.textSecondary,
//   },

//   /* ======================================================= */
//   /* HTTP */
//   /* ======================================================= */

//   infoCard: {
//     padding: 18,
//     borderRadius: 20,
//     backgroundColor:
//       colors.white,
//     borderWidth: 1,
//     borderColor:
//       colors.border,
//   },

//   cardTitle: {
//     marginBottom: 10,
//     fontSize: 15,
//     fontWeight: "800",
//     color: colors.dark,
//   },

//   infoRow: {
//     paddingVertical: 10,
//     borderTopWidth: 1,
//     borderTopColor:
//       colors.border,
//   },

//   infoLabel: {
//     fontSize: 10,
//     fontWeight: "800",
//     textTransform: "uppercase",
//     letterSpacing: 0.5,
//     color:
//       colors.textSecondary,
//   },

//   infoValue: {
//     marginTop: 4,
//     fontSize: 12,
//     color: colors.dark,
//   },

//   /* ======================================================= */
//   /* DADOS */
//   /* ======================================================= */

//   dataCard: {
//     marginTop: 14,
//     padding: 18,
//     borderRadius: 20,
//     backgroundColor:
//       colors.greenSoft,
//     borderWidth: 1,
//     borderColor:
//       colors.border,
//   },

//   dataTitle: {
//     marginBottom: 5,
//     fontSize: 15,
//     fontWeight: "800",
//     color: colors.dark,
//   },

//   dataSubtitle: {
//     marginBottom: 8,
//     fontSize: 12,
//     lineHeight: 17,
//     color:
//       colors.textSecondary,
//   },

//   dataRow: {
//     paddingVertical: 9,
//     borderTopWidth: 1,
//     borderTopColor:
//       colors.border,
//   },

//   dataLabel: {
//     fontSize: 10,
//     fontWeight: "700",
//     textTransform: "uppercase",
//     letterSpacing: 0.5,
//     color:
//       colors.textSecondary,
//   },

//   dataValue: {
//     marginTop: 3,
//     fontSize: 12,
//     color: colors.dark,
//   },

//   /* ======================================================= */
//   /* PAYLOAD */
//   /* ======================================================= */

//   payloadCard: {
//     marginTop: 14,
//     padding: 18,
//     borderRadius: 20,
//     backgroundColor:
//       colors.white,
//     borderWidth: 1,
//     borderColor:
//       colors.border,
//   },

//   payloadTitle: {
//     fontSize: 15,
//     fontWeight: "800",
//     color: colors.dark,
//   },

//   payloadDescription: {
//     marginTop: 5,
//     marginBottom: 12,
//     fontSize: 12,
//     lineHeight: 17,
//     color:
//       colors.textSecondary,
//   },

//   payloadBox: {
//     padding: 14,
//     borderRadius: 12,
//     backgroundColor:
//       colors.background,
//     borderWidth: 1,
//     borderColor:
//       colors.border,
//   },

//   payloadText: {
//     fontFamily:
//       "monospace",
//     fontSize: 11,
//     lineHeight: 18,
//     color: colors.dark,
//   },

//   /* ======================================================= */
//   /* LOCALIZAÇÃO */
//   /* ======================================================= */

//   locationCard: {
//     borderRadius: 20,
//     backgroundColor:
//       colors.white,
//     borderWidth: 1,
//     borderColor:
//       colors.border,
//     overflow: "hidden",
//   },

//   coordinateRow: {
//     padding: 18,
//   },

//   coordinateRowBorder: {
//     borderTopWidth: 1,
//     borderTopColor:
//       colors.border,
//   },

//   coordinateContent: {
//     flex: 1,
//   },

//   coordinateLabel: {
//     fontSize: 10,
//     fontWeight: "800",
//     letterSpacing: 1,
//     color:
//       colors.textSecondary,
//   },

//   coordinateValue: {
//     marginTop: 5,
//     fontSize: 20,
//     fontWeight: "700",
//     fontFamily:
//       "monospace",
//     color: colors.dark,
//   },

//   /* ======================================================= */
//   /* SUPABASE */
//   /* ======================================================= */

//   supabaseCard: {
//     padding: 18,
//     borderRadius: 20,
//     backgroundColor:
//       colors.white,
//     borderWidth: 1,
//     borderColor:
//       colors.border,
//   },

//   supabaseTitle: {
//     marginBottom: 8,
//     fontSize: 15,
//     fontWeight: "800",
//     color: colors.dark,
//   },

//   supabasePayloadCard: {
//     marginTop: 14,
//     padding: 18,
//     borderRadius: 20,
//     backgroundColor:
//       colors.greenSoft,
//     borderWidth: 1,
//     borderColor:
//       colors.border,
//   },

//   /* ======================================================= */
//   /* SUCESSO */
//   /* ======================================================= */

//   successCard: {
//     marginTop: 14,
//     padding: 15,
//     borderRadius: 16,
//     backgroundColor:
//       colors.greenSoft,
//     flexDirection: "row",
//     alignItems: "center",
//   },

//   successDot: {
//     width: 9,
//     height: 9,
//     borderRadius: 9,
//     backgroundColor:
//       colors.green,
//     marginRight: 10,
//   },

//   successText: {
//     flex: 1,
//     fontSize: 13,
//     fontWeight: "700",
//     color:
//       colors.greenDark,
//   },

//   /* ======================================================= */
//   /* ERRO */
//   /* ======================================================= */

//   errorCard: {
//     marginTop: 14,
//     padding: 16,
//     borderRadius: 16,
//     backgroundColor:
//       "#F5E5E5",
//     borderWidth: 1,
//     borderColor:
//       "#E0C6C6",
//   },

//   errorTitle: {
//     fontSize: 14,
//     fontWeight: "800",
//     color:
//       "#8A3737",
//   },

//   errorText: {
//     marginTop: 4,
//     fontSize: 12,
//     lineHeight: 18,
//     color:
//       "#8A3737",
//   },

//   /* ======================================================= */
//   /* BOTÕES */
//   /* ======================================================= */

//   bottom: {
//     paddingTop: 10,
//     paddingBottom: 10,
//     gap: 10,
//     backgroundColor:
//       colors.background,
//   },

//   secondaryButton: {
//     minHeight: 48,
//     alignItems: "center",
//     justifyContent: "center",
//   },

//   secondaryButtonText: {
//     fontSize: 14,
//     fontWeight: "600",
//     color: colors.dark,
//     textDecorationLine:
//       "underline",
//   },

//   button: {
//     minHeight: 58,
//     paddingHorizontal: 24,
//     borderRadius: 999,
//     backgroundColor:
//       colors.dark,
//     flexDirection: "row",
//     alignItems: "center",
//     justifyContent: "center",
//     gap: 10,
//   },

//   buttonDisabled: {
//     opacity: 0.35,
//   },

//   buttonPressed: {
//     opacity: 0.8,
//   },

//   buttonText: {
//     color: colors.white,
//     fontSize: 16,
//     fontWeight: "700",
//   },

//   buttonArrow: {
//     color: colors.white,
//     fontSize: 21,
//   },

//   /* ======================================================= */
//   /* EMPTY */
//   /* ======================================================= */

//   emptyContainer: {
//     flex: 1,
//     justifyContent: "center",
//     paddingHorizontal: 24,
//   },

//   emptyTitle: {
//     fontSize: 24,
//     fontWeight: "800",
//     color: colors.dark,
//   },

//   emptyText: {
//     marginTop: 8,
//     fontSize: 15,
//     lineHeight: 22,
//     color:
//       colors.textSecondary,
//     marginBottom: 24,
//   },
// });