module.exports = function(RED) {
    const threewayNode = require('./threeway/threeway.js');
    threewayNode(RED);
    
    const lightTimeOnOff = require('./light-scheduler/light-scheduler.js');
    lightTimeOnOff(RED);
};