const WebSocket = require('ws');

module.exports = (RED) => {
    const addEventDate = (node, date) => {
        node.status({
            fill: 'green',
            shape: 'ring',
            text: date
        });
    };

    RED.httpAdmin.get('/ha-entities/:serverId', RED.auth.needsPermission('flows.read'), async (req, res) => {
        const serverId = req.params.serverId;
        const serverNode = RED.nodes.getNode(serverId);
        if (!serverNode || !serverNode.credentials || !serverNode.credentials.host || !serverNode.credentials.access_token) {
            node.warn(`Servidor HA não encontrado ou não configurado: ${serverId}`);
            return res.status(404).json({ error: "Servidor Home Assistant não encontrado ou sem credenciais." });
        }

        const host = serverNode.credentials.host;
        const token = serverNode.credentials.access_token;
        const apiUrl = `${host}/api/states`;

        const allowedDomains = ['switch', 'light', 'fan', 'cover', 'input_boolean'];

        try {
            const response = await fetch(apiUrl, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            });

            if (!response.ok) {
                let errorText = `Erro ao buscar entidades do HA: ${response.status} ${response.statusText}`;
                try {
                    const errorBody = await response.json();
                    errorText += ` - ${JSON.stringify(errorBody)}`;
                } catch(e) {}
                console.error(errorText);
                return res.status(response.status).json({ error: `Erro ao conectar ao Home Assistant (${response.status}). Verifique a URL e o Token.` });
            }

            const states = await response.json();
            const entities = states
                .filter(entity => allowedDomains.includes(entity.entity_id.split('.')[0]))
                .map(entity => ({
                    id: entity.entity_id,
                    friendly_name: entity.attributes.friendly_name || entity.entity_id,
                }))
                .sort((a, b) => a.friendly_name.localeCompare(b.friendly_name));

            res.json(entities);

        } catch (err) {
            console.error(`Erro na requisição para ${apiUrl}:`, err);
            res.status(500).json({ error: `Erro ao fazer requisição para o Home Assistant: ${err.message}` });
        }
    });
    
    function andrerodrigue5Threeway(config) {
        let wsId = 100;
        RED.nodes.createNode(this, config);
        const node = this;
        
        this.server = RED.nodes.getNode(config.server);
        let entityIdTemp = config.entities;
        try {
            entityIdTemp = JSON.parse(entityIdTemp);
        } catch (e) {
            this.error("Erro ao analisar lista de entidades: " + e.message);
            entityIdTemp = [];
        }
        if(entityIdTemp.length === 0) {
            return;
        }
        
        let propertyTemp = config.property;
        try {
            propertyTemp = JSON.parse(propertyTemp);
        } catch (e) {
            this.error("Erro ao analisar lista de propriedades: " + e.message);
            propertyTemp = [];
        }

        const allowedDomains = ['switch', 'light', 'fan', 'cover', 'input_boolean'];
        
        this.entityId = [];
        for(const item of entityIdTemp) {
            const id = item.id;
            if(typeof id !== 'string' || !allowedDomains.some(domain => id.startsWith(domain + '.'))) {
                continue;
            }
            this.entityId.push(id);
        }

        const flow = this.context().flow;
        const global = this.context().global;
        let property = { payload: {} };
        for (const item of propertyTemp) {
            if (
                typeof item !== 'object' ||
                !('type' in item) ||
                !('key' in item) ||
                !('value' in item)
            ) {
                continue;
            }

            if (item.type === 'flow') {
                flow.set(item.key, item.value);
            } else if (item.type === 'global') {
                global.set(item.key, item.value);
            } else if (item.type === 'msg' && !item.key.startsWith('payload.status')) {
                RED.util.setMessageProperty(property, item.key, item.value, true);
            }
        }
        RED.util.setMessageProperty(property, 'payload.entity_id', this.entityId, true);

        const wsHost = this.server.credentials.host.replace(/https?:\/\//, '');
        const wsToken = this.server.credentials.access_token;

        const wsUrl = `ws://${wsHost}/api/websocket`;
        let ws;
        let nodeRedUserId = null;
        let stateChangedId = null;
        let currentUserId = null;

        let changeIdList = [];

        function connect() {
            ws = new WebSocket(wsUrl);

            ws.on('open', () => {
                ws.send(JSON.stringify({
                    "type": "auth",
                    "access_token": wsToken
                }));
                node.status({
                    fill: 'green',
                    shape: 'ring',
                    text: 'conectado'
                });
            });

            ws.on('message', (msg) => {
                try {
                    const data = JSON.parse(msg);

                    if (data.type === 'auth_ok') {
                        authSuccessful = true;
                        wsId++;
                        currentUserId = wsId;
                        ws.send(JSON.stringify({
                            id: currentUserId,
                            type: "auth/current_user"
                        }));
                    } else if (data.type === 'result' && data.id === currentUserId) {
                        nodeRedUserId = data.result.id;
                        wsId++;
                        stateChangedId = wsId;
                        ws.send(JSON.stringify({
                            "id": stateChangedId,
                            "type": "subscribe_events",
                            "event_type": "state_changed"
                        }));
                    } else if (data.type === 'event' && data.event.event_type === 'state_changed' && node.entityId.includes(data.event.data.entity_id)) {
                        if(!('context' in data.event) || !('user_id' in data.event.context) || data.event.context.user_id === undefined || data.event.context.user_id === nodeRedUserId) {
                            return;
                        }
                        const newState = data.event.data.new_state.state;
                        const dateLastChanged = data.event.data.new_state.last_changed;
                        const realEntity = data.event.data.entity_id;
                        const otherEntity = node.entityId.filter(entityId => entityId !== realEntity);

                        const newMsg = RED.util.cloneMessage(property) || {};
                        RED.util.setMessageProperty(newMsg, 'payload.state', newState, true);
                        if(otherEntity.length === 0) {
                            node.send(newMsg);
                            return;
                        }

                        const grouped = {};
                        for (const entity of otherEntity) {
                            const [domain] = entity.split('.');
                            if (!grouped[domain]) grouped[domain] = [];
                            grouped[domain].push(entity);
                        }
                        
                        changeIdList = [];
                        for (const [domain, entities] of Object.entries(grouped)) {
                            let service;
                            if (domain === 'cover') {
                                service = newState === 'on' ? 'open_cover' : 'close_cover';
                            } else {
                                service = newState === 'on' ? 'turn_on' : 'turn_off';
                            }

                            
                            wsId++;
                            changeIdList.push(wsId);
                            const callServiceMessage = {
                                id: wsId,
                                type: 'call_service',
                                domain,
                                service,
                                service_data: {
                                    entity_id: entities
                                }
                            };
                            ws.send(JSON.stringify(callServiceMessage));
                        }
                        addEventDate(node, dateLastChanged);
                        node.send(newMsg);
                    } else if (data.type === 'result' && changeIdList.length > 0 && changeIdList.includes(data.id)) {
                        // Adicionar futuramente um validação
                    } else if (data.type === 'result' && data.id === stateChangedId && data.success === false) {
                        node.error('Inscrição em state_changed do Home Assistant falhou');
                        console.log('Inscrição em state_changed falhou:', data.erro);
                    } else if (data.type === 'auth_invalid') {
                        node.error('Erro na autenticação');
                        console.log('Erro de autenticação:', data.message);
                        node.status({
                            fill: 'red',
                            shape: 'ring',
                            text: 'erro de autenticação'
                        });
                        ws.close();
                    }
                } catch (error) {
                    node.error('Erro ao processar mensagem WebSocker');
                    console.log('Erro ao processar mensagem WebSocket:', error, msg);
                }
            });

            ws.on('close', () => {
                node.log('WebSocket desconectado.');
                node.status({
                    fill: 'red',
                    shape: 'ring',
                    text: 'desconectado'
                });
                setTimeout(connect, 5000);
            });

            ws.on('error', (error) => {
                node.error('Erro no WebSocket');
                console.log('Erro WebSocket:', error);
                node.status({
                    fill: 'red',
                    shape: 'ring',
                    text: 'erro de conexão'
                });
                ws.close();
            });
        }
        connect();

        this.on('close', () => {
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.close();
            }
        });
    }
    RED.nodes.registerType("andrerodrigue5-threeway", andrerodrigue5Threeway);
};