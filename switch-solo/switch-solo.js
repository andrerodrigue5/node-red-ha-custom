const WebSocket = require('ws');

module.exports = (RED) => {
    function formatDate() {
        const date = new Date();
        const pad = n => String(n).padStart(2, '0');

        const year = date.getFullYear();
        const month = pad(date.getMonth() + 1); // meses vão de 0 a 11
        const day = pad(date.getDate());
        const hours = pad(date.getHours());
        const minutes = pad(date.getMinutes());
        const seconds = pad(date.getSeconds());
    
        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    }
    const addEventDate = (node, text, color) => {
        const finalText = text === 'date' ? formatDate() : text;
        node.status({
            fill: color === undefined ? 'green' : color,
            shape: 'ring',
            text: finalText
        });
    };

    RED.httpAdmin.get('/ha-entities/:serverId', RED.auth.needsPermission('flows.read'), async (req, res) => {
        const serverId = req.params.serverId;
        const serverNode = RED.nodes.getNode(serverId);
        if (!serverNode || !serverNode.credentials || !serverNode.credentials.host || !serverNode.credentials.access_token) {
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

    function validateGroup(group)
    {
        return typeof group === 'object' &&
            'name' in group &&
            'button' in group &&
            'turn_off' in group &&
            'entity' in group &&
            group.entity.length > 0 &&
            (
                (group.turn_off !== '' && /^[0-9]{1,}$/.test(group.turn_off)) ||
                group.turn_off === ''
            );
    }

    function filterEntity(entityList) {
        const allowedDomains = ['switch', 'light', 'fan', 'cover', 'input_boolean'];
        const entityId = [];
        for(const item of entityList) {
            const id = item.id;
            if(typeof id !== 'string' || !allowedDomains.some(domain => id.startsWith(domain + '.'))) {
                continue;
            }
            entityId.push(id);
        }
        return entityId;
    }

    let wsId = 0;
    function idPrefix()
    {
        wsId++;
        return parseInt('202020' + wsId);
    }
    
    function andrerodrigue5SwitchSolo(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        const server = RED.nodes.getNode(config.server);
        const wsHost = server.credentials.host.replace(/https?:\/\//, '');
        const wsToken = server.credentials.access_token;

        const wsUrl = `ws://${wsHost}/api/websocket`;
        let ws;
        let nodeRedUserId = null;
        let stateChangedId = null;
        let currentUserId = null;
        let timeoutChange = null;
        const timeoutOff = {};
        const changeIdList = [];
        
        // GROUP
        let groupTemp = config.group;
        try {
            groupTemp = JSON.parse(groupTemp);
        } catch (e) {
            this.error("Erro ao analisar lista de grupos: " + e.message);
            groupTemp = [];
        }
        if(groupTemp.length === 0) {
            return;
        }

        const resetEntities = [];
        const group = {};
        const entityIdGroup = {};
        const monitoredEntities = [];
        let idGroup = 0;
        for(const item of groupTemp) {
            if(!validateGroup(item)) {
                continue;
            }

            const entity = filterEntity(item.entity);
            if(entity.length === 0) {
                continue;
            }
            const allEntities = [...entity];

            const itemButton = item.button;
            const reset = item.reset === 'yes';
            idGroup++;
            if(itemButton && reset && !resetEntities.includes(itemButton)) {
                resetEntities.push(itemButton);
            }
            if(itemButton && !monitoredEntities.includes(itemButton)) {
                monitoredEntities.push(itemButton)
            }
            if(itemButton) {
                allEntities.push(itemButton);
                entityIdGroup[itemButton] = idGroup;
            }
            for(const entityId of entity) {
                if(reset && !resetEntities.includes(entityId)) {
                    resetEntities.push(entityId);
                }
                if(itemButton) {
                    continue;
                }
                entityIdGroup[entityId] = idGroup;
                monitoredEntities.push(entityId)
            }

            if(item.turn_off) {
                timeoutOff[idGroup] = null;
            }

            group[idGroup] = {
                id: idGroup,
                name: item.name,
                turn_off: item.turn_off,
                button: itemButton,
                entity: entity,
                all_entities: allEntities
            };
        }

        this.group = group;
        this.entityIdGroup = entityIdGroup;
        this.monitoredEntities = monitoredEntities;
        this.resetEntities = resetEntities;
        
        // PROPERTY
        let propertyTemp = config.property;
        try {
            propertyTemp = JSON.parse(propertyTemp);
        } catch (e) {
            this.error("Erro ao analisar lista de propriedades: " + e.message);
            propertyTemp = [];
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
                    text: 'connected'
                });
            });

            ws.on('message', (msg) => {
                try {
                    const data = JSON.parse(msg);

                    if (data.type === 'auth_ok') {
                        authSuccessful = true;
                        currentUserId = idPrefix();
                        ws.send(JSON.stringify({
                            id: currentUserId,
                            type: "auth/current_user"
                        }));
                    } else if(data.type === 'result' && data.id === currentUserId){
                        nodeRedUserId = data.result.id;
                        stateChangedId = idPrefix();
                        ws.send(JSON.stringify({
                            "id": stateChangedId,
                            "type": "subscribe_events",
                            "event_type": "state_changed"
                        }));
                    } else if (data.type === 'event' && data.event.event_type === 'state_changed' && node.monitoredEntities.includes(data.event.data.entity_id)) {
                        if(!('context' in data.event) || !('user_id' in data.event.context) || data.event.context.user_id === undefined || data.event.context.user_id === nodeRedUserId) {
                            return;
                        }
                        if(timeoutChange) {
                            clearTimeout(timeoutChange);
                        }
                        if(!['on', 'off'].includes(data.event.data.new_state.state)) {
                            return;
                        }
                        const currentState = data.event.data.new_state.state === 'on' ? 'on' : 'off';
                        const realEntity = data.event.data.entity_id;
                        const idGroup = node.entityIdGroup[realEntity];
                        const entityGroup = node.group[idGroup];
                        const entityList = entityGroup.entity;
                        const allEntities = entityGroup.all_entities;
                        const otherEntity = entityList.filter(entityId => entityId !== realEntity);

                        const newMsg = RED.util.cloneMessage(property) || {};
                        RED.util.setMessageProperty(newMsg, 'payload.state', currentState, true);
                        RED.util.setMessageProperty(newMsg, 'payload.entity_id', allEntities, true);

                        const turnOff = entityGroup.turn_off;
                        if(turnOff && timeoutOff[idGroup]) {
                            clearTimeout(timeoutOff[idGroup]);
                        }
                        if(turnOff && currentState === 'on') {
                            const timeTimeout = turnOff * 60 * 1000;
                            console.log('Ligou = ' + formatDate());
                            timeoutOff[idGroup] = setTimeout(function() {
                                console.log('Desligou = ' + formatDate());
                                sendChangeState(node, allEntities, newMsg);
                            }, timeTimeout);
                        }

                        if(otherEntity.length === 0) {
                            node.send(newMsg);
                            return;
                        }

                        sendChangeState(node, otherEntity, newMsg);
                    } else if (data.type === 'result' && changeIdList.length > 0 && changeIdList.includes(data.id)) {
                        if(data.success === true) {
                            addEventDate(node, 'date', 'green');
                            timeoutChange = setTimeout(() => {
                                if(ws.readyState === WebSocket.OPEN) {
                                    addEventDate(node, 'Connected', 'green')
                                    return;
                                }
                                addEventDate(node, 'disconnected', 'red')
                            }, 50000);
                            return;
                        }
                        addEventDate(node, 'Error in ' + formatDate(), 'red');
                    } else if (data.type === 'result' && data.id === stateChangedId && data.success === false) {
                        node.error('Inscrição em state_changed do Home Assistant falhou');
                        console.log('Inscrição em state_changed falhou:', data.erro);
                    } else if (data.type === 'result' && data.id === stateChangedId && data.success === true && node.resetEntities.length > 0) {
                        const grouped = {};
                        for (const entity of node.resetEntities) {
                            const [domain] = entity.split('.');
                            if (!grouped[domain]) grouped[domain] = [];
                            grouped[domain].push(entity);
                        }
                        Object.entries(grouped).forEach(([domain, entities]) => {
                            const service = domain === 'cover' ? 'close_cover' : 'turn_off';
                            const callServiceMessage = {
                                id: idPrefix(),
                                type: 'call_service',
                                domain,
                                service,
                                service_data: {
                                    entity_id: entities
                                }
                            };
                            ws.send(JSON.stringify(callServiceMessage));
                        });
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
                    text: 'disconnected'
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

        function sendChangeState(node, entityList, newMsg) {
            const grouped = {};
            for (const entity of entityList) {
                const [domain] = entity.split('.');
                if (!grouped[domain]) grouped[domain] = [];
                grouped[domain].push(entity);
            }

            Object.entries(grouped).forEach(([domain, entities]) => {
                const idUse = idPrefix();
                changeIdList.push(idUse);
                const callServiceMessage = {
                    id: idUse,
                    type: 'call_service',
                    domain,
                    service: domain === 'cover' ? 'close_cover' : 'turn_off',
                    service_data: {
                        entity_id: entities
                    }
                };
                ws.send(JSON.stringify(callServiceMessage));
            });
            addEventDate(node, 'date', 'green');
            node.send(newMsg);
        }

        this.on('close', () => {
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.close();
            }
        });
    }
    RED.nodes.registerType("andrerodrigue5-switch-solo", andrerodrigue5SwitchSolo);
};