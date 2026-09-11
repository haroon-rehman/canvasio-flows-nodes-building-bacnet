'use strict';
require('./_alias.js');

const { getQueue, removeJob } = require('@root/common/job/global_queue_manager.js');
const { generateUniqueJobId } = require('@root/common/func.js');
const { readDevicePoints } = require('@root/common/device_read.js');
const { EVENT_INPUT, EVENT_CLOSE } = require('@root/common/core/constant.js');

module.exports = function (RED) {
    class BacnetDevice {
        constructor(config) {
            RED.nodes.createNode(this, config);

            const clientNode = RED.nodes.getNode(config.client);
            if (!clientNode || !clientNode.instance) {
                this.error('BACnet Network is required');
                this.status({ fill: 'red', shape: 'ring', text: 'no network' });
                return;
            }

            this.client = clientNode.instance;
            this.ip = config.ip;
            this.points = Array.isArray(config.points) ? config.points : [];
            this.jobId = generateUniqueJobId(this.id, 'bacnetDevice');
            this.job = getQueue();
            this.busy = false;

            this.on(EVENT_INPUT, (msg) => this.#handleInput(msg));
            this.on(EVENT_CLOSE, () => {
                removeJob(this.jobId);
            });
        }

        #handleInput(msg) {
            if (!this.ip) {
                this.error('Device IP/address is required', msg);
                this.status({ fill: 'red', shape: 'ring', text: 'no IP' });
                return;
            }

            if (this.job.queue.map((item) => item.id).includes(this.jobId)) {
                return;
            }

            const clonedMsg = RED.util.cloneMessage(msg);
            const node = this;

            this.job.addJob({
                id: this.jobId,
                priority: 3,
                task: {
                    execute: async () => {
                        node.status({ fill: 'yellow', shape: 'dot', text: 'reading' });
                        try {
                            const result = await readDevicePoints(node.client, {
                                ipAddress: node.ip,
                                points: node.points,
                                readMethod: 1,
                            });

                            clonedMsg.payload = result.values;
                            clonedMsg.device = node.ip;
                            clonedMsg.timestamp = Date.now();

                            if (result.errors && Object.keys(result.errors).length > 0) {
                                clonedMsg.errors = result.errors;
                                for (const [name, err] of Object.entries(result.errors)) {
                                    node.warn(`${name}: ${err}`);
                                }
                            }

                            node.send(clonedMsg);

                            const total = result.total;
                            const ok = result.successCount;
                            if (total === 0) {
                                node.status({ fill: 'yellow', shape: 'ring', text: '0/0 points' });
                            } else if (ok === 0) {
                                node.status({ fill: 'red', shape: 'ring', text: `0/${total} points` });
                            } else if (ok < total) {
                                node.status({ fill: 'yellow', shape: 'dot', text: `${ok}/${total} points` });
                            } else {
                                node.status({ fill: 'green', shape: 'dot', text: `${ok}/${total} points` });
                            }
                        } catch (err) {
                            const message = err && err.message ? err.message : String(err);
                            node.error(`BACnet Error: ${message}`, clonedMsg);
                            node.status({ fill: 'red', shape: 'ring', text: message });
                        }
                    },
                },
            });

            this.status({ fill: 'yellow', shape: 'dot', text: 'in queue' });
        }
    }

    RED.nodes.registerType('bacnet-device', BacnetDevice);
};
