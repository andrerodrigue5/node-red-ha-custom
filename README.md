
# node-red-ha-custom

> 🇧🇷 Este README está disponível em português e inglês.  
> 🇺🇸 This README is available in Portuguese and English.

---

## 🇧🇷 Descrição (PT-BR)

Uma coleção de nós personalizados para o Node-RED, desenvolvidos para melhorar a automação com o Home Assistant via API WebSocket.  
Esses nós facilitam a integração com dispositivos físicos e ajudam a simplificar automações complexas dentro do ecossistema do Home Assistant.

## ✨ Funcionalidades

- Integração direta com o Home Assistant usando a API WebSocket  
- Nós de fácil configuração focados em controle de dispositivos inteligentes  
- Suporte a diversos domínios do Home Assistant como switches, luzes, ventiladores, cortinas, entre outros  
- Construído com foco em desempenho e usabilidade

---

## ⚠️ IMPORTANTE – Configuração do Usuário no Home Assistant

> **⚠️ IMPORTANTE**  
> Para garantir uma operação segura e confiável, você **deve** criar um usuário específico para o Node-RED e gerar um token de acesso de longa duração dedicado a partir do usuário criado **exclusivamente para o Node-RED**.
>
> 1. Vá em **Configurações → Pessoas → Adicionar pessoa**
> 2. Crie um novo usuário (exemplo):  
>    - **Usuário:** `nodered`  
>    - **Senha:** `SENHA_FORTE`  
>    - **Permitir login:** Sim  
>    - **Somente acesso local:** Não  
>    - **Administrador:** Sim  
> 3. Faça o login com o novo usuário  
> 4. Vá para o perfil do usuário → Segurança  
> 5. Crie um novo **Token de Acesso de Longa Duração**  
> 6. Use este token na configuração do servidor do Home Assistant dentro de cada nó
>
> Usar um usuário separado garante o isolamento adequado das permissões e impede loops infinitos.

---

## 🧩 Nós

### 🔁 `threeway` – Sincronizar interruptores em paralelo (three-way)

Este nó permite a sincronização virtual de múltiplos dispositivos configurados em um sistema paralelo (three-way ou multi-way) utilizando entidades do Home Assistant. Ideal para interruptores físicos ligados em paralelo.

#### Funcionalidades principais:
- Sincroniza o estado entre 2 ou mais entidades
- Suporta os domínios: `switch`, `light`, `fan`, `cover`, `input_boolean`
- Lida com conflitos de estado garantindo consistência
- Usa a API WebSocket do Home Assistant para atualizações em tempo real
- **Output padrão:**
  - `payload.state`: estado atual sincronizado
  - `payload.entity_id`: array com as entidades afetadas
  - E quaisquer outras chaves personalizadas dentro de `payload` que o usuário definir

### 🕒 `light-scheduler` – Agendamento inteligente de iluminação

Este nó permite automatizar o acionamento de luzes com base em horários fixos, eventos astronômicos (como nascer/pôr do sol) ou com atraso/antecedência configurável. Ideal para agendar o acendimento ou desligamento de luzes em horários dinâmicos e contextuais.

#### Funcionalidades principais:
- Agendamento com base em horário fixo (`HH:MM`) ou nascer/pôr do sol
- Permite adicionar ou subtrair minutos dos eventos astronômicos
- Suporte a controle por **ajudantes** (ex: `input_boolean`, `input_datetime`, etc)
- Calcula os horários com base na latitude/longitude configuradas
  - **Output padrão:**
  - `payload.state`: `"on"` ou `"off"` no momento da transição
  - `payload.entity_id`: entidade ou lista de entidades-alvo
  - E quaisquer outras chaves personalizadas dentro de `payload` que o usuário definir

### 🚦 `switch solo` – Controle exclusivo de dispositivos no Home Assistant

Este nó permite criar grupos de entidades onde **apenas uma pode estar ligada por vez**. Ideal para selecionar modos, perfis ou zonas exclusivas de atuação no seu ambiente domótico.

#### Funcionalidades principais:
- Sincroniza o estado entre múltiplas entidades garantindo que **somente uma esteja ligada**
- Suporta os domínios: `switch`, `light`, `fan`, `cover`, `input_boolean`
- Permite definir uma entidade como **botão de controle exclusivo**: apenas ela poderá comandar o grupo
- Suporte a **desligamento automático (timeoff)** após tempo configurado (em minutos)
- O grupo pode ser resetado (desligado) automaticamente ao reiniciar o Node-RED
- Usa a API WebSocket do Home Assistant para atualizações em tempo real

#### Output padrão:
- `payload.state`: estado atual da entidade que foi ligada/desligada
- `payload.entity_id`: array com as entidades afetadas
- E quaisquer outras chaves personalizadas dentro de `payload` que o usuário definir

---

## 📦 Instalação

### Via Gerenciador de Paletas do Node-RED

1. Abra o editor do Node-RED  
2. Clique no **menu** (☰) no canto superior direito  
3. Selecione **Gerenciar paleta**  
4. Vá até a aba **Instalar**  
5. Procure por: `@andrerodrigue5/node-red-ha-custom`  
6. Clique em **Instalar**

---

### Instalação manual via NPM

Para instalar diretamente no diretório do usuário do Node-RED (O diretório pode mudar em cada sistema ou forma de instalação):

```bash
cd ~/.node-red/data
npm install @andrerodrigue5/node-red-ha-custom
```

Depois, reinicie o Node-RED (Está ação pode mudar dependendo do tipo de instalação):

```bash
node-red-restart
```

---

## Licença

MIT © [andrerodrigue5](https://github.com/andrerodrigue5)

---

---

## 🇺🇸 Description (EN)

A collection of custom Node-RED nodes designed to enhance Home Assistant automation via its WebSocket API.  
These nodes aim to simplify the integration of physical devices and streamline complex automations within the Home Assistant ecosystem.

## ✨ Features

- Seamless integration with Home Assistant via WebSocket API  
- Easy-to-configure nodes focused on smart home control  
- Support for various Home Assistant domains such as switches, lights, fans, covers, and more  
- Built with performance and usability in mind

---

## ⚠️ IMPORTANT – Home Assistant User Configuration

> **⚠️ IMPORTANT**  
> To ensure secure and reliable operation, you **must** create a dedicated user for Node-RED and generate a long-lived access token from that user **exclusively for Node-RED**.
>
> 1. Go to **Settings → People → Add person**
> 2. Create a new user (example):  
>    - **Username:** `nodered`  
>    - **Password:** `STRONG_PASSWORD`  
>    - **Allow login:** Yes  
>    - **Local only:** No  
>    - **Administrator:** Yes  
> 3. Log in with the new user  
> 4. Go to **User Profile → Security**  
> 5. Create a new **Long-Lived Access Token**  
> 6. Use this token in the Home Assistant server configuration inside each node
>
> Using a dedicated user ensures proper permission isolation and prevents infinite loops.

---

## 🧩 Nodes

### 🔁 `threeway` – Synchronize parallel (three-way) switches

A node that enables virtual synchronization of multiple switches configured in a three-way (or multi-way) setup using Home Assistant entities. Ideal for physical switches wired in parallel.

#### Key Features:
- Synchronizes states between 2 or more entities
- Supports domains: `switch`, `light`, `fan`, `cover`, `input_boolean`
- Handles state conflicts and ensures consistency
- Uses Home Assistant WebSocket API for real-time updates
- **Output always includes:**
  - `payload.state`: the synchronized current state
  - `payload.entity_id`: an array of the affected entities
  - Any other user-defined message inside `payload`

### 🕒 `light-scheduler` – Smart lighting schedule

This node allows you to automate light activation based on fixed times, astronomical events (such as sunrise/sunset), or with configurable offsets. Ideal for scheduling lights to turn on or off at dynamic, context-aware times.

#### Key features:
- Scheduling based on fixed time (`HH:MM`) or sunrise/sunset
- Allows adding or subtracting minutes from astronomical events
- Supports control via **helper entities** (e.g. `input_boolean`, `input_datetime`, etc)
- Calculates event times based on configured latitude/longitude
- **Default output:**
  - `payload.state`: `"on"` or `"off"` at the moment of transition
  - `payload.entity_id`: the target entity or list of entities
  - And any other custom keys within `payload` defined by the user

### 🚦 `switch solo` – Exclusive control of Home Assistant entities

This node creates groups of entities where **only one can be ON at a time**. Perfect for mutually exclusive modes, profiles, or zones in your smart home.

#### Main features:
- Synchronizes states among entities, ensuring **only one is ON**
- Supports domains: `switch`, `light`, `fan`, `cover`, `input_boolean`
- Allows assigning a **control button**: only it can toggle the group, ignoring changes from others
- Supports **auto turn-off (timeoff)** after a configurable number of minutes
- Can **reset all entities (turn OFF)** when Node-RED restarts
- Uses Home Assistant's WebSocket API for real-time updates

#### Default output:
- `payload.state`: current state of the toggled entity
- `payload.entity_id`: array of affected entities
- Plus any additional custom keys defined by the user within `payload`

---

## 📦 Installation

### Install via Node-RED Palette Manager

1. Open your Node-RED editor  
2. Click the **menu** (☰) in the top-right corner  
3. Select **Manage palette**  
4. Go to the **Install** tab  
5. Search for: `@andrerodrigue5/node-red-ha-custom`  
6. Click **Install**

---

### Manual installation via NPM

To manually install into your Node-RED user directory (The directory may change on each system or installation method):

```bash
cd ~/.node-red/data
npm install @andrerodrigue5/node-red-ha-custom
```

Then restart Node-RED (This action may change depending on the type of installation):

```bash
node-red-restart
```

---

## License

MIT © [andrerodrigue5](https://github.com/andrerodrigue5)
