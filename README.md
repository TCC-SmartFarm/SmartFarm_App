# SmartFarm App

Aplicativo mobile do projeto SmartFarm, desenvolvido com Expo e React Native para autenticação, cadastro e configuração de sensores em campo.

O aplicativo foi pensado para conduzir o usuário por um fluxo simples: entrar na conta, selecionar ou cadastrar um sensor, aproximar-se do equipamento, registrar a localização, conectar-se à rede Wi-Fi criada pelo sensor e enviar os dados de configuração diretamente para ele.

## Objetivo

O app centraliza a configuração inicial dos sensores SmartFarm sem exigir que o usuário conheça os detalhes técnicos do dispositivo.

Atualmente, o fluxo principal é:

```text
Login
  ↓
Tela inicial
  ↓
Sensores cadastrados
  ↓
Selecionar sensor não configurado
  ↓
Confirmação do botão físico
  ↓
Captura da localização
  ↓
Conexão à rede esp_...
  ↓
Envio da configuração para o sensor
  ↓
Atualização do cadastro
  ↓
Conclusão
```

## Tecnologias

- Expo / React Native
- TypeScript
- Expo Router
- Auth0 (`react-native-auth0`)
- Supabase (`@supabase/supabase-js`)
- Expo Secure Store
- Expo Location
- React Native NetInfo
- React Native Wi-Fi Reborn

## Estrutura

A aplicação utiliza o Expo Router para organizar as telas e mantém os dados dos sensores em um contexto global.

```text
app/
├── _layout.tsx
├── sign-in.tsx
└── (app)/
    ├── _layout.tsx
    ├── index.tsx
    └── sensor/
        ├── _layout.tsx
        ├── index.tsx
        ├── create.tsx
        ├── button.tsx
        ├── wifi.tsx
        ├── post.tsx
        └── success.tsx

src/
├── auth/
├── supabase/
└── sensor/
    ├── SensorContext.tsx
    ├── sensor.service.ts
    ├── sensor.storage.ts
    ├── device.service.ts
    ├── esp.service.ts
    └── wifi/
        └── wifi.service.ts
```

## Autenticação

O login é feito pelo Auth0 já utilizado pelo projeto. O identificador do usuário disponibilizado pelo Auth0 (`user.sub`) é utilizado para localizar o registro correspondente na tabela `users` do Supabase.

O aplicativo não implementa uma integração entre Auth0 e o sistema de autenticação do Supabase. A consulta é feita diretamente pelo cliente usando a chave pública do projeto.

## Dados dos sensores

Os sensores pertencentes ao usuário ficam armazenados na coluna `devices` da tabela `users`.

O formato utilizado é um objeto indexado:

```json
{
  "1": {
    "Host": "192.168.4.1",
    "devEUI": "5e76ce4fd99eefe3",
    "app_s_key": "FFEEDDCCBBAA99887766554433221100",
    "nwk_s_key": "00112233445566778899AABBCCDDEEFF",
    "devAddress": "d99eefe3",
    "setup_date": 0
  }
}
```

No aplicativo, esse objeto é convertido para um array de `Device`, mantendo a chave original no campo `key`.

`setup_date` controla o estado do sensor:

- `0`: sensor cadastrado, mas ainda não configurado.
- diferente de `0`: sensor já configurado.

Sensores configurados aparecem como indisponíveis para uma nova configuração pela interface.

## Cadastro de sensor

A tela `sensor/create.tsx` permite cadastrar um novo sensor.

Os dados informados atualmente são:

- `Host`
- `devEUI`
- `app_s_key`
- `nwk_s_key`
- `devAddress`

O campo `setup_date` não é preenchido pelo usuário. Um sensor novo sempre é criado com `setup_date: 0`.

Ao salvar, o aplicativo:

1. consulta o usuário no Supabase;
2. identifica a próxima chave disponível (`1`, `2`, `3`...);
3. adiciona o novo dispositivo ao objeto `devices`;
4. atualiza o registro no Supabase;
5. atualiza o contexto global;
6. salva os dados no armazenamento local.

## Armazenamento local

Os dispositivos também são mantidos no `SecureStore` do aparelho.

A chave de armazenamento é separada por usuário para evitar que os dados de uma conta sejam reutilizados por outra conta no mesmo aparelho.

O cache permite recuperar os sensores já conhecidos mesmo quando o aplicativo não consegue acessar o Supabase.

## Localização

Durante a etapa de confirmação do botão físico do sensor, o aplicativo solicita a permissão de localização e captura a posição atual do aparelho usando alta precisão.

São obtidos:

```ts
latitude
longitude
```

Esses dados fazem parte das informações temporárias da configuração e devem acompanhar o dispositivo nas próximas etapas do fluxo.

## Wi-Fi do sensor

O sensor cria uma rede Wi-Fi cujo SSID começa com `esp_`.

### Android

No Android, o aplicativo procura redes próximas usando `react-native-wifi-reborn`. A busca exige permissão de localização para realizar o scan.

Somente redes cujo SSID começa com `esp_` são apresentadas ao usuário.

### iOS

No iOS, o fluxo é manual: o usuário abre os ajustes de Wi-Fi, conecta-se à rede `esp_...` e retorna ao aplicativo. Ao tocar em `Já estou conectado`, o app verifica o SSID atual.

## Envio para o sensor

Depois que o aparelho está conectado à rede do sensor, a página `sensor/post.tsx` envia os dados por HTTP diretamente para o endereço local do equipamento.

O endpoint é configurável por variável de ambiente:

```env
EXPO_PUBLIC_ESP_CONFIG_PATH=/config
```

Com o valor acima, por exemplo, o aplicativo envia para:

```text
http://192.168.4.1/config
```

O payload de configuração contém os dados necessários para o sensor, como `devEUI`, `app_s_key`, `nwk_s_key` e `devAddress`.

A aplicação considera o HTTP `200` como sucesso. Um `500` é tratado como falha de configuração e permite uma nova tentativa.

## Atualização após o POST

O sensor só passa a ser considerado configurado depois de uma resposta de sucesso do equipamento.

Nesse momento, o aplicativo:

1. define `setup_date` com o timestamp atual;
2. atualiza o `SensorContext`;
3. salva o novo estado no `SecureStore`;
4. atualiza o registro correspondente no Supabase;
5. encaminha o usuário para a tela de sucesso.

Assim, o estado mostrado no aplicativo permanece consistente com o resultado do processo de configuração.

## Variáveis de ambiente

As principais variáveis utilizadas são:

```env
EXPO_PUBLIC_AUTH_CLIENT_ID=...
EXPO_PUBLIC_AUTH_CLIENT_SECRET=...
EXPO_PUBLIC_AUTH_DOMAIN=...

EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...

EXPO_PUBLIC_ESP_CONFIG_PATH=/config
```

As chaves públicas podem ser usadas no aplicativo conforme a configuração do Supabase. Nenhuma `service_role key` deve ser embutida no app.

## Execução

Instale as dependências e execute o projeto com o cliente de desenvolvimento do Expo:

```bash
npm install
npx expo start --dev-client
```

Para limpar o cache do Metro durante o desenvolvimento:

```bash
npx expo start --dev-client -c
```

Como o projeto utiliza módulos nativos para Wi-Fi e localização, alterações nesses módulos normalmente exigem um novo build do development client.

## Estado atual

O aplicativo já possui o fluxo de autenticação, consulta e cache dos sensores, cadastro de novos sensores, verificação de conexão com a rede do equipamento, captura de localização e estrutura para envio da configuração diretamente ao sensor.

A etapa de comunicação com o firmware depende do endpoint HTTP e do formato de payload definidos no dispositivo físico. Esses valores devem permanecer alinhados entre o aplicativo e o firmware.

## Observação de segurança

Atualmente o aplicativo consulta o Supabase diretamente usando a chave pública do projeto e o `user.sub` como filtro. Isso simplifica o desenvolvimento, mas não equivale a uma autenticação do usuário dentro do Supabase. Em uma versão de produção, o acesso aos dados dos sensores deve ser protegido por RLS corretamente configurado ou por uma camada de backend que faça a autorização da operação.
