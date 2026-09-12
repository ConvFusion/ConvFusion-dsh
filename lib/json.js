export function losslessJson(value) {
    if (value === undefined || value === null)
        return null;
    if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean')
        return value;
    if (typeof value === 'bigint' || typeof value === 'function' || typeof value === 'symbol')
        return null;
    if (Array.isArray(value))
        return value.map((item) => losslessJson(item));
    if (typeof value === 'object') {
        const out = {};
        for (const [key, item] of Object.entries(value)) {
            if (item === undefined)
                continue;
            out[key] = losslessJson(item);
        }
        return out;
    }
    return null;
}
//# sourceMappingURL=json.js.map