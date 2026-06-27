/**
 * config.ts — Gateway environment configuration.
 *
 * Loads env vars, scans for per-client API keys, and provides
 * fail-closed thresholds per client.
 */

const HIGH_VALUE_VERTICALS = new Set([
  'jewelry', 'fine_art', 'luxury_goods', 'electronics', 'pharma',
  'medical_device', 'precious_metals', 'regulated_goods', 'wine_spirits',
  'aerospace_parts', 'event_equipment', 'sensitive_documents', 'other',
]);

export interface GatewayConfig {
  port: number;
  databaseUrl: string;
  /** Map of API key → clientId (built from GATEWAY_API_KEY_<clientId> env vars) */
  apiKeys: Map<string, string>;
  /** Per-client fail-closed declared-value threshold (cents).
   *  Above this value, failures route to fail-closed instead of fail-open.
   *  Defaults to 500000 (5000.00) for high-value verticals, Infinity otherwise. */
  failClosedThresholds: Map<string, number>;
  /** Cache TTL in milliseconds (default 60_000) */
  cacheTtlMs: number;
  /** Buffer drain interval in milliseconds (default 5_000) */
  bufferDrainIntervalMs: number;
  /** Buffer file path for durable decision log */
  bufferPath: string;
}

function scanApiKeys(): Map<string, string> {
  const keys = new Map<string, string>();
  const prefix = 'GATEWAY_API_KEY_';
  for (const [envKey, envVal] of Object.entries(process.env)) {
    if (envKey.startsWith(prefix) && envVal) {
      const clientId = envKey.slice(prefix.length).toLowerCase();
      if (clientId) {
        keys.set(envVal, clientId);
      }
    }
  }
  return keys;
}

function scanFailClosedThresholds(): Map<string, number> {
  const thresholds = new Map<string, number>();
  const prefix = 'GATEWAY_FAIL_CLOSED_THRESHOLD_';
  for (const [envKey, envVal] of Object.entries(process.env)) {
    if (envKey.startsWith(prefix) && envVal) {
      const clientId = envKey.slice(prefix.length).toLowerCase();
      const parsed = parseInt(envVal, 10);
      if (clientId && Number.isFinite(parsed)) {
        thresholds.set(clientId, parsed);
      }
    }
  }
  return thresholds;
}

let _config: GatewayConfig | null = null;

export function loadConfig(): GatewayConfig {
  if (_config) return _config;

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('Missing required env var: DATABASE_URL');
  }

  const apiKeys = scanApiKeys();
  const explicitThresholds = scanFailClosedThresholds();
  const failClosedThresholds = new Map<string, number>();

  // For clients with explicit thresholds, use those.
  // For unknown clients, default to Infinity (never fail-closed).
  for (const clientId of apiKeys.values()) {
    failClosedThresholds.set(
      clientId,
      explicitThresholds.get(clientId) ?? Infinity,
    );
  }

  _config = {
    port: parseInt(process.env.GATEWAY_PORT ?? '3001', 10),
    databaseUrl,
    apiKeys,
    failClosedThresholds,
    cacheTtlMs: parseInt(process.env.GATEWAY_CACHE_TTL_MS ?? '60000', 10),
    bufferDrainIntervalMs: parseInt(process.env.GATEWAY_BUFFER_DRAIN_MS ?? '5000', 10),
    bufferPath: process.env.GATEWAY_BUFFER_PATH ?? '.gateway-buffer.jsonl',
  };

  return _config;
}

export function getConfig(): GatewayConfig {
  if (!_config) return loadConfig();
  return _config;
}

/** Determine if a shipment's risk warrants fail-closed behavior (D5).
 *  Returns true if the declaredValue exceeds the client's threshold,
 *  or if declaredValue is missing on a high-value vertical. */
export function shouldFailClosed(
  clientId: string,
  declaredValue: number | null | undefined,
  shipperVertical: string | null | undefined,
  thresholds: Map<string, number>,
): boolean {
  const threshold = thresholds.get(clientId.toLowerCase()) ?? Infinity;

  if (typeof declaredValue === 'number' && declaredValue > threshold) {
    return true;
  }

  // Missing declared value on high-value vertical → fail-closed (DATA_REQUIRED)
  if (
    (declaredValue == null || declaredValue === 0) &&
    shipperVertical &&
    HIGH_VALUE_VERTICALS.has(shipperVertical.toLowerCase())
  ) {
    return true;
  }

  return false;
}
