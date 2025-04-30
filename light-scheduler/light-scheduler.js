const WebSocket = require('ws');
const SunCalc = require('suncalc');

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

    async function getState(url, token, id) {
        try {
            const response = await fetch(url + '/api/states/' + id, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            });

            if (!response.ok) {
                let errorText = `Erro ao buscar state do HA: ${response.status} ${response.statusText}`;
                try {
                    const errorBody = await response.json();
                    errorText += ` - ${JSON.stringify(errorBody)}`;
                } catch(e) {}
                console.error(errorText);
                return res.status(response.status).json({ error: `Erro ao conectar ao Home Assistant (${response.status}). Verifique a URL e o Token.` });
            }

            const states = await response.json();
            return states.state;
        } catch (err) {
            console.error(`Erro na requisição para ${apiUrl}:`, err);
            res.status(500).json({ error: `Erro ao fazer requisição para o Home Assistant: ${err.message}` });
        }
    }

    function getSunTimes(lat, lon) {
        if(!isValidLatLng(lat, lon)) {
            return null;
        }
        const times = SunCalc.getTimes(new Date(), lat, lon);
        let sunrise = times.sunrise;
        let sunset = times.sunset;

        return {
            sunrise: {
                hour: sunrise.getHours(),
                minute: sunrise.getMinutes()
            },
            sunset: {
                hour: sunset.getHours(),
                minute: sunset.getMinutes()
            },
        };
    }

    function isValidLatLng(lat, lng) {
        lat = lat ? parseFloat(lat) : lat;
        lng = lng ? parseFloat(lng) : lng;
        const isLatValid = typeof lat === 'number' && !isNaN(lat) && lat >= -90 && lat <= 90;
        const isLngValid = typeof lng === 'number' && !isNaN(lng) && lng >= -180 && lng <= 180;
        return isLatValid && isLngValid;
    }

    const allTypeOnOff = ['sunrise', 'sunset', 'hour'];
    const suntimeValue = ['sunrise', 'sunset'];
    const runTypeValue = ['after', 'before'];
    function validateGroup(group, suntime) {
        return typeof group === 'object' &&
            'button' in group &&
            group.button !== '' &&
            'type_on' in group &&
            allTypeOnOff.includes(group.type_on) &&
            'run_on' in group &&
            typeof group.run_on === 'object' &&
            'type' in group.run_on &&
            'minute' in group.run_on &&
            'hour_on' in group &&
            'type_off' in group &&
            allTypeOnOff.includes(group.type_off) &&
            'run_off' in group &&
            typeof group.run_off === 'object' &&
            'type' in group.run_off &&
            'minute' in group.run_off &&
            'hour_off' in group &&
            'entity' in group &&
            (
                (suntimeValue.includes(group.type_on) && suntime) ||
                group.type_on === 'hour' && /^[0-9]{2}\:[0-9]{2}/.test(group.hour_on)
            ) &&
            (
                (suntimeValue.includes(group.type_off) && suntime) ||
                group.type_off === 'hour' && /^[0-9]{2}\:[0-9]{2}/.test(group.hour_off)
            ) &&
            group.entity.length > 0;
    }

    function addMinutes(hour, minuteAdd) {
        const h = parseInt(hour.hour);
        const m = parseInt(hour.minute);
        const date = new Date(0, 0, 0, h, m);
        date.setMinutes(date.getMinutes() + parseInt(minuteAdd));
        const newHour = parseInt(date.getHours());
        const newMinute = parseInt(date.getMinutes());
        return {
            hour: newHour,
            minute: newMinute
        };
    }
    function subtractMinutes(hour, minuteSubtract) {
        minuteSubtract = minuteSubtract.replace(/^\-/, '');
        return addMinutes(hour, minuteSubtract * -1);
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

    function andrerodrigue5LightScheduler(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        
        const server = RED.nodes.getNode(config.server);

        // SUN
        const latitude = config.latitude;
        const longitude = config.longitude;
        const suntime = getSunTimes(latitude, longitude);
        
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

        let idGroup = 0;
        const group = {};
        const entityIdGroup = {};
        const monitoredEntities = [];
        for(const item of groupTemp) {
            if(!validateGroup(item, suntime)) {
                continue;
            }

            const entity = filterEntity(item.entity);
            if(entity.length === 0) {
                continue;
            }

            let turnOn;
            if(suntimeValue.includes(item.type_on)) {
                turnOn = item.type_on === 'sunrise' ? suntime.sunrise : suntime.sunset;
                if(runTypeValue.includes(item.run_on.type) && /^[0-9]{1,}$/.test(item.run_on.minute)) {
                    turnOn = item.run_on.type === 'after' ? addMinutes(turnOn, item.run_on.minute) : subtractMinutes(turnOn, item.run_on.minute);
                }
            } else {
                turnOnSplit = item.hour_on.split(':');
                turnOn = {
                    hour: parseInt(turnOnSplit[0]),
                    minute: parseInt(turnOnSplit[1]),
                };
            }
            let turnOff;
            if(suntimeValue.includes(item.type_off)) {
                turnOff = item.type_off === 'sunrise' ? suntime.sunrise : suntime.sunset;
                if(runTypeValue.includes(item.run_off.type) && /^[0-9]{1,}$/.test(item.run_off.minute)) {
                    turnOff = item.run_off.type === 'after' ? addMinutes(turnOff, item.run_off.minute) : subtractMinutes(turnOff, item.run_off.minute);
                }
            } else {
                turnOffSplit = item.hour_off.split(':');
                turnOff = {
                    hour: parseInt(turnOffSplit[0]),
                    minute: parseInt(turnOffSplit[1]),
                };
            }

            idGroup++;
            entityIdGroup[item.button] = idGroup;
            monitoredEntities.push(item.button);
            group[idGroup] = {
                id: idGroup,
                name: item.name,
                button: item.button,
                on: turnOn,
                off: turnOff,
                entity: entity
            };
        }
        this.monitoredEntities = monitoredEntities;
        this.entityIdGroup = entityIdGroup;
        this.group = group;

        // Teste in dev
        // const dateDev = new Date();
        // const hourDev = parseInt(dateDev.getHours());
        // const minuteDev = parseInt(dateDev.getMinutes());
        // group[100] = {
        //     id: 100,
        //     name: 'Teste',
        //     button: 'input_boolean.ligar_desligar_teste',
        //     on: { hour: hourDev, minute: minuteDev },
        //     off: { hour: hourDev, minute: minuteDev + 1 },
        //     entity: ['input_boolean.luz_21_30_01', 'input_boolean.luz_21_30_02']
        // };

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
        RED.util.setMessageProperty(property, 'payload.entity_id', this.entityId, true);

        let currentMinute = null;
        setInterval(() => {
            const dateNow = new Date();
            const hourNow = parseInt(dateNow.getHours());
            const minuteNow = parseInt(dateNow.getMinutes());
            if(minuteNow === currentMinute) {
                return;
            }
            currentMinute = minuteNow;
            for (const item of Object.values(group)) {
                if(item.on.hour === hourNow && item.on.minute === minuteNow) {
                    runEvent(item.entity, item.button, 'on', hourNow + ':' + minuteNow);
                } else if(item.off.hour === hourNow && item.off.minute === minuteNow) {
                    runEvent(item.entity, item.button, 'off', hourNow + ':' + minuteNow);
                }
            }
        }, 50000);

        const wsHost = server.credentials.host.replace(/https?:\/\//, '');
        const wsToken = server.credentials.access_token;

        const wsUrl = `ws://${wsHost}/api/websocket`;
        let ws;
        let nodeRedUserId = null;
        let stateChangedId = null;
        let currentUserId = null;
        let timeoutChange = null;

        let changeIdList = [];
        async function runEvent(entity, button, action, date) {
            if(timeoutChange) {
                clearTimeout(timeoutChange);
            }
            const buttonState = await getState(server.credentials.host, server.credentials.access_token, button);
            if(action === buttonState) {
                return;
            }
            const entityReturn = [ ...entity ];
            entityReturn.push(button);

            const grouped = {};
            for (const item of entityReturn) {
                const [domain] = item.split('.');
                if (!grouped[domain]) grouped[domain] = [];
                grouped[domain].push(item);
            }

            changeIdList = [];
            Object.entries(grouped).forEach(([domain, entities]) => {
                let service;
                if (domain === 'cover') {
                    service = action === 'on' ? 'open_cover' : 'close_cover';
                } else {
                    service = action === 'on' ? 'turn_on' : 'turn_off';
                }

                const sendId = idPrefix();
                changeIdList.push(sendId);
                const callServiceMessage = {
                    id: sendId,
                    type: 'call_service',
                    domain,
                    service,
                    service_data: {
                        entity_id: entities
                    }
                };
                ws.send(JSON.stringify(callServiceMessage));
            });

            const newMsg = RED.util.cloneMessage(property) || {};
            RED.util.setMessageProperty(newMsg, 'payload.state', action, true);
            RED.util.setMessageProperty(newMsg, 'payload.entity_id', entity, true);
            node.send(newMsg);
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
                    text: 'Connected'
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
                        const newState = data.event.data.new_state.state;
                        const realEntity = data.event.data.entity_id;
                        const idGroup = node.entityIdGroup[realEntity];
                        const entityGroup = node.group[idGroup];
                        const entityList = entityGroup.entity;

                        const newMsg = RED.util.cloneMessage(property) || {};
                        RED.util.setMessageProperty(newMsg, 'payload.state', newState, true);
                        RED.util.setMessageProperty(newMsg, 'payload.entity_id', entityList, true);
                        if(entityList.length === 0) {
                            node.send(newMsg);
                            return;
                        }

                        const grouped = {};
                        for (const entity of entityList) {
                            const [domain] = entity.split('.');
                            if (!grouped[domain]) grouped[domain] = [];
                            grouped[domain].push(entity);
                        }

                        changeIdList = [];
                        Object.entries(grouped).forEach(([domain, entities]) => {
                            let service;
                            if (domain === 'cover') {
                                service = newState === 'on' ? 'open_cover' : 'close_cover';
                            } else {
                                service = newState === 'on' ? 'turn_on' : 'turn_off';
                            }
                            const idUse = idPrefix();
                            changeIdList.push(idUse);
                            const callServiceMessage = {
                                id: idUse,
                                type: 'call_service',
                                domain,
                                service,
                                service_data: {
                                    entity_id: entities
                                }
                            };
                            ws.send(JSON.stringify(callServiceMessage));
                        });
                        node.send(newMsg);
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
                node.log('WebSocket Disconnected.');
                node.status({
                    fill: 'red',
                    shape: 'ring',
                    text: 'Disconnected'
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
    RED.nodes.registerType("andrerodrigue5-light-scheduler", andrerodrigue5LightScheduler);
};