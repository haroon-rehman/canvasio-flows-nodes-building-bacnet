'use strict';
require('./_alias.js');

const { smartReadProperty } = require('@root/common/bacnet.js');

const DEFAULT_PROPERTY = 85;

/**
 * Normalize a Device point row.
 * Invalid numeric fields become null (never NaN).
 *
 * @param {object} point
 * @returns {{ name: string, type: number|null, instance: number|null, property: number, valid: boolean, error?: string }}
 */
function normalizePoint(point) {
    const name = typeof point?.name === 'string' ? point.name.trim() : '';
    const type = toFiniteInt(point?.type);
    const instance = toFiniteInt(point?.instance);
    let property = toFiniteInt(point?.property);
    if (property == null) {
        property = DEFAULT_PROPERTY;
    }

    if (!name) {
        return { name: '', type, instance, property, valid: false, error: 'Point name is required' };
    }
    if (type == null) {
        return { name, type: null, instance, property, valid: false, error: `Invalid object type for "${name}"` };
    }
    if (instance == null) {
        return { name, type, instance: null, property, valid: false, error: `Invalid object instance for "${name}"` };
    }

    return { name, type, instance, property, valid: true };
}

/**
 * @param {*} value
 * @returns {number|null}
 */
function toFiniteInt(value) {
    if (value === '' || value == null) {
        return null;
    }
    const n = typeof value === 'number' ? value : parseInt(value, 10);
    if (!Number.isFinite(n)) {
        return null;
    }
    return Math.trunc(n);
}

/**
 * Build HAL device address object for smartReadProperty.
 *
 * @param {object} options
 * @param {string} options.ipAddress
 * @param {number|null} [options.network]
 * @param {number[]|null} [options.macAddress]
 * @returns {object}
 */
function buildDeviceAddress(options) {
    return {
        deviceId: null,
        deviceName: '',
        network: options.network == null ? null : options.network,
        ipAddress: options.ipAddress,
        macAddress: options.macAddress == null ? null : options.macAddress,
        segmentation: null,
        maxApdu: null,
        vendorId: 0,
    };
}

/**
 * Extract Present-Value-style scalar from a smartReadProperty values entry.
 *
 * @param {*} raw
 * @returns {*|null}
 */
function extractValue(raw) {
    if (raw == null) {
        return null;
    }
    if (raw.errorClass != null || raw.errorCode != null) {
        return null;
    }
    if (Array.isArray(raw)) {
        return raw[0]?.value ?? null;
    }
    if (typeof raw === 'object' && Object.prototype.hasOwnProperty.call(raw, 'value')) {
        return raw.value;
    }
    return raw;
}

/**
 * Read configured BACnet Device points via HAL smartReadProperty.
 *
 * @param {import('@root/ext/node-bacstack/dist/index.js').Client} client
 * @param {object} options
 * @param {string} options.ipAddress - Device IP or ip:port
 * @param {Array<{name:string,type:*,instance:*,property:*}>} options.points
 * @param {number|null} [options.network]
 * @param {number[]|null} [options.macAddress]
 * @param {number} [options.readMethod=1] - 0 = RP only, >0 = RPM then RP fallback
 * @param {number} [options.maxConcurrentSinglePointRead=10]
 * @param {number} [options.concurrentTaskDelay=50]
 * @returns {Promise<{
 *   values: Object.<string, *|null>,
 *   errors: Object.<string, string>,
 *   successCount: number,
 *   total: number,
 *   points: ReturnType<typeof normalizePoint>[]
 * }>}
 */
async function readDevicePoints(client, options) {
    const ipAddress = options?.ipAddress;
    if (!ipAddress || typeof ipAddress !== 'string') {
        throw new Error('Device IP/address is required');
    }
    if (!client) {
        throw new Error('BACnet client is required');
    }

    const normalized = (options.points || []).map(normalizePoint);
    const values = {};
    const errors = {};
    let successCount = 0;

    for (const point of normalized) {
        if (!point.valid) {
            if (point.name) {
                values[point.name] = null;
                errors[point.name] = point.error || 'Invalid point';
            }
            continue;
        }
        values[point.name] = null;
    }

    const validPoints = normalized.filter((p) => p.valid);
    if (validPoints.length === 0) {
        return {
            values,
            errors,
            successCount: 0,
            total: normalized.filter((p) => p.name).length,
            points: normalized,
        };
    }

    const device = buildDeviceAddress({
        ipAddress,
        network: options.network,
        macAddress: options.macAddress,
    });

    const reqArr = validPoints.map((p) => ({
        objectId: { type: p.type, instance: p.instance },
        properties: [{ id: p.property }],
    }));

    const readMethod = options.readMethod == null ? 1 : options.readMethod;
    const maxConcurrent = options.maxConcurrentSinglePointRead == null
        ? 10
        : options.maxConcurrentSinglePointRead;
    const delay = options.concurrentTaskDelay == null ? 50 : options.concurrentTaskDelay;

    let result = [];
    try {
        result = await smartReadProperty(
            client,
            device,
            reqArr,
            readMethod,
            maxConcurrent,
            5,
            delay
        );
    } catch (err) {
        const message = err && err.message ? err.message : String(err);
        for (const point of validPoints) {
            values[point.name] = null;
            errors[point.name] = message;
        }
        return {
            values,
            errors,
            successCount: 0,
            total: validPoints.length,
            points: normalized,
        };
    }

    /** @type {Object.<string, *>} */
    const byKey = {};
    if (Array.isArray(result)) {
        for (const item of result) {
            if (!item?.objectId || !Array.isArray(item.values)) {
                continue;
            }
            for (const prop of item.values) {
                const key = `${item.objectId.type}_${item.objectId.instance}_${prop.id}`;
                byKey[key] = extractValue(prop.value);
            }
        }
    }

    for (const point of validPoints) {
        const key = `${point.type}_${point.instance}_${point.property}`;
        if (Object.prototype.hasOwnProperty.call(byKey, key) && byKey[key] != null) {
            let value = byKey[key];
            if (typeof value === 'boolean') {
                value = value ? 1 : 0;
            }
            values[point.name] = value;
            successCount += 1;
        } else {
            values[point.name] = null;
            errors[point.name] = errors[point.name] || 'Error reading point';
        }
    }

    return {
        values,
        errors,
        successCount,
        total: validPoints.length,
        points: normalized,
    };
}

module.exports = {
    DEFAULT_PROPERTY,
    normalizePoint,
    buildDeviceAddress,
    readDevicePoints,
};
