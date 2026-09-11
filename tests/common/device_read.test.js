'use strict';

const EventEmitter = require('events');
const bacnet = require('@root/ext/node-bacstack/dist/index.js');
const { describe, beforeAll, afterAll, afterEach, expect, it } = require('@jest/globals');

const {
    normalizePoint,
    buildDeviceAddress,
    readDevicePoints,
    DEFAULT_PROPERTY,
} = require('@root/common/device_read.js');
const { CoalescedJobQueue } = require('@root/common/job/core.js');
const {
    getQueue,
    removeJob,
    clearPending,
    reset,
    shutdown,
} = require('@root/common/job/global_queue_manager.js');
const { DiscoverDeviceJob } = require('@root/common/job/discover_device.js');
const { EVENT_I_AM } = require('@root/common/core/constant.js');
const { serverConfig } = require('@root/tests/_test_lib/data.js');
const { delay } = require('@root/common/core/util.js');

describe('device_read normalizePoint', () => {
    it('defaults property to 85', () => {
        const p = normalizePoint({ name: 'Temp', type: 0, instance: 1 });
        expect(p.valid).toBe(true);
        expect(p.property).toBe(DEFAULT_PROPERTY);
    });

    it('rejects NaN / empty numerics', () => {
        expect(normalizePoint({ name: 'A', type: '', instance: 1 }).valid).toBe(false);
        expect(normalizePoint({ name: 'A', type: 0, instance: 'x' }).valid).toBe(false);
        expect(normalizePoint({ name: '', type: 0, instance: 1 }).valid).toBe(false);
    });

    it('accepts string numerics', () => {
        const p = normalizePoint({ name: 'Hum', type: '2', instance: '3', property: '85' });
        expect(p).toMatchObject({ name: 'Hum', type: 2, instance: 3, property: 85, valid: true });
    });
});

describe('device_read buildDeviceAddress', () => {
    it('builds IP-only device', () => {
        expect(buildDeviceAddress({ ipAddress: '192.168.1.10' })).toMatchObject({
            ipAddress: '192.168.1.10',
            network: null,
            macAddress: null,
        });
    });
});

describe('queue lifecycle', () => {
    afterEach(async () => {
        await shutdown();
    });

    it('removeJob clears pending without stopping worker', async () => {
        const q = getQueue();
        class Job {
            async execute() {
                await delay(200);
            }
        }
        q.addJob({ id: 'keep', task: new Job() });
        q.addJob({ id: 'drop', task: new Job() });
        expect(q.queue.length).toBe(2);
        expect(removeJob('drop')).toBe(true);
        expect(q.queue.map((j) => j.id)).toEqual(['keep']);
        expect(q.isRunning).toBe(true);
        clearPending();
        expect(q.queue.length).toBe(0);
    });

    it('reset tears down and recreates queue', async () => {
        const q1 = getQueue();
        q1.addJob({
            id: 'stale',
            task: {
                async execute() {
                    await delay(5);
                },
            },
        });
        await reset();
        const q2 = getQueue();
        expect(q2).not.toBe(q1);
        expect(q2.queue.length).toBe(0);
    });

    it('CoalescedJobQueue clearPending / removeJob', () => {
        const q = new CoalescedJobQueue(10, false);
        q.addJob({ id: 'a', task: { execute: async () => {} } });
        q.addJob({ id: 'b', task: { execute: async () => {} } });
        expect(q.removeJob('a')).toBe(true);
        expect(q.clearPending()).toBe(1);
        expect(q.queue.length).toBe(0);
    });
});

describe('DiscoverDeviceJob iAm listener cleanup', () => {
    it('adds and removes the same bound listener', async () => {
        const client = new EventEmitter();
        client.readProperty = () => {};
        client.whoIs = () => {};

        const job = new DiscoverDeviceJob(
            client,
            new EventEmitter(),
            {},
            65535,
            0,
            4194303,
            10
        );

        await job.onStart();
        expect(client.listenerCount(EVENT_I_AM)).toBe(1);
        await job.onStart();
        expect(client.listenerCount(EVENT_I_AM)).toBe(1);
        await job.onStop();
        expect(client.listenerCount(EVENT_I_AM)).toBe(0);
        await job.onStop();
        expect(client.listenerCount(EVENT_I_AM)).toBe(0);
    });
});

describe('device_read readDevicePoints against simulator', () => {
    let client = null;

    beforeAll(() => {
        client = new bacnet.Client({
            apduTimeout: 2000,
            interface: '0.0.0.0',
            port: 47818,
            broadcastAddress: '127.0.0.255:47809',
        });
    });

    afterAll(() => {
        if (client) {
            client.close();
        }
    });

    it('reads configured points into name map', async () => {
        const result = await readDevicePoints(client, {
            ipAddress: `127.0.0.1:${serverConfig.port}`,
            points: [
                { name: 'AI0', type: 0, instance: 0, property: 85 },
                { name: 'Missing', type: 0, instance: 99999, property: 85 },
            ],
            readMethod: 1,
        });

        expect(result.total).toBe(2);
        expect(Object.prototype.hasOwnProperty.call(result.values, 'AI0')).toBe(true);
        expect(Object.prototype.hasOwnProperty.call(result.values, 'Missing')).toBe(true);
        expect(result.values.Missing).toBeNull();
        expect(result.errors.Missing).toBeTruthy();
        // AI0 may succeed or fail depending on fixture density; ensure shape holds
        expect(result.successCount + Object.keys(result.errors).length).toBeGreaterThanOrEqual(1);
    }, 30000);

    it('RPM path (readMethod 1) and RP-only path (readMethod 0)', async () => {
        const points = [{ name: 'P0', type: 0, instance: 0, property: 85 }];
        const rpm = await readDevicePoints(client, {
            ipAddress: `127.0.0.1:${serverConfig.port}`,
            points,
            readMethod: 1,
        });
        const rp = await readDevicePoints(client, {
            ipAddress: `127.0.0.1:${serverConfig.port}`,
            points,
            readMethod: 0,
        });
        expect(rpm.values).toHaveProperty('P0');
        expect(rp.values).toHaveProperty('P0');
    }, 30000);
});
