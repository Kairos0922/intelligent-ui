import {
  createSnapshotMetadataSeal,
  validatePassPayload,
  validatePassSnapshot,
  verifyPassSignature,
  verifySnapshotCredential,
  verifySnapshotMetadata,
  type PassAttestation,
  type PassHost,
  type PassIntegrity,
  type PassLatestKnown,
  type PassPayload,
  type PassSignature,
  type PassSnapshot,
} from "@intelligent-ui/core/agent";

const SNAPSHOT_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 8_000;
const META_STORE = "meta";
const SNAPSHOT_STORE = "snapshots";

interface PassIssuerConfig {
  issuer: PassPayload["issuer"];
  publicKey: string;
}

interface PassFeedResponse {
  payload: PassPayload;
  signature: PassSignature;
  status: "live" | "revoked";
  observedAt: string;
  staleAfter?: string;
  source?: { id?: string; url?: string };
}

interface FeedFetchResult {
  feed: PassFeedResponse | null;
  reason: "ok" | "timeout" | "unavailable" | "http_error" | "malformed";
}

export interface DshPassOptions {
  /** Base URL of the test/real issuer. Omit to render only unverified model data. */
  issuerUrl?: string;
  /** Optional pinned Ed25519 SPKI base64 key; otherwise /config is fetched once. */
  publicKey?: string;
  /**
   * Exact https origins allowed to receive QR/link navigation. The configured
   * issuer origin is added automatically when it is https. Model output and
   * issuer feed content never add to this list.
   */
  allowedOrigins?: string[];
  fetcher?: typeof fetch;
  now?: () => number;
  online?: () => boolean;
  timeoutMs?: number;
}

export type PassRefreshStatus = "succeeded" | "timeout" | "unavailable";

export interface PassRefreshResult {
  status: PassRefreshStatus;
  reason?: string;
  attestation?: PassAttestation | null;
}

export interface DshPassHost extends PassHost {
  ensurePass(payload: PassPayload): void;
  getPayload(credentialId: string): PassPayload | null;
  getAttestation(credentialId: string): PassAttestation | null;
  getLatestKnown(credentialId: string): PassLatestKnown | null;
  isOnline(): boolean;
  now(): number;
  subscribe(listener: () => void): () => void;
  isQrPayloadAllowed(payload: string): boolean;
  isIssuerLinkAllowed(url: string): boolean;
  clearEpoch(): number;
  refresh(credentialId: string): Promise<PassRefreshResult>;
  refreshAll(): Promise<PassRefreshResult[]>;
  clear(): Promise<void>;
  dispose(): void;
}

interface MetaRecord {
  id: string;
  kind: "hmac" | "issuer-key";
  key?: CryptoKey;
  keyId?: string;
  value?: string;
}

function globalConfig(): { url?: string; publicKey?: string; allowedOrigins?: unknown } {
  const value = (globalThis as { __IUI_PASS_ISSUER__?: unknown }).__IUI_PASS_ISSUER__;
  if (!value || typeof value !== "object") return {};
  const raw = value as { url?: unknown; publicKey?: unknown; allowedOrigins?: unknown };
  return {
    ...(typeof raw.url === "string" && raw.url ? { url: raw.url } : {}),
    ...(typeof raw.publicKey === "string" && raw.publicKey ? { publicKey: raw.publicKey } : {}),
    ...(raw.allowedOrigins !== undefined ? { allowedOrigins: raw.allowedOrigins } : {}),
  };
}

function addHttpsOrigin(out: Set<string>, value: unknown): void {
  if (typeof value !== "string" || !value.trim()) return;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:") return;
    if (url.username || url.password) return;
    out.add(url.origin);
  } catch {
    // Invalid allowlist entries are ignored; they must never widen the policy.
  }
}

function allowedOriginSet(values: unknown, issuerUrl: string): Set<string> {
  const out = new Set<string>();
  if (Array.isArray(values)) {
    for (const value of values) addHttpsOrigin(out, value);
  }
  if (issuerUrl) addHttpsOrigin(out, issuerUrl);
  return out;
}

function isOpaqueQrPayload(payload: string): boolean {
  const value = payload.trim();
  if (!value) return false;
  if (value.toLowerCase().startsWith("iui1:")) return true;
  if (value.startsWith("//")) return false;
  return !/^[a-z][a-z0-9+.-]*:/i.test(value);
}

function isTimeoutError(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("name" in error)) return false;
  const name: unknown = error.name;
  return name === "TimeoutError" || name === "AbortError";
}

function instant(value: unknown, fallback: string): string {
  if (typeof value === "string" && Number.isFinite(Date.parse(value))) return value;
  return fallback;
}

function sourceFor(feed: PassFeedResponse): PassAttestation["source"] {
  return {
    id: feed.source?.id ?? feed.payload.issuer.id,
    kind: "issuer",
    ...(feed.source?.url ? { url: feed.source.url } : {}),
  };
}

class PassSnapshotStore {
  private dbPromise: Promise<IDBDatabase | null> | null = null;

  private db(): Promise<IDBDatabase | null> {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise((resolve) => {
      if (typeof indexedDB === "undefined") {
        resolve(null);
        return;
      }
      const request = indexedDB.open("iui-pass", 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) {
          db.createObjectStore(SNAPSHOT_STORE, { keyPath: "credentialId" });
        }
        if (!db.objectStoreNames.contains(META_STORE)) {
          db.createObjectStore(META_STORE, { keyPath: "id" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    });
    return this.dbPromise;
  }

  private async read<T>(storeName: string, key: IDBValidKey): Promise<T | null> {
    const db = await this.db();
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(storeName, "readonly");
        const request = tx.objectStore(storeName).get(key);
        request.onsuccess = () => resolve((request.result as T | undefined) ?? null);
        request.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  private async write(storeName: string, value: unknown): Promise<void> {
    const db = await this.db();
    if (!db) return;
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(storeName, "readwrite");
        tx.objectStore(storeName).put(value);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  private async remove(storeName: string, key: IDBValidKey): Promise<void> {
    const db = await this.db();
    if (!db) return;
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(storeName, "readwrite");
        tx.objectStore(storeName).delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  async getSnapshot(credentialId: string): Promise<PassSnapshot | null> {
    const raw = await this.read<unknown>(SNAPSHOT_STORE, credentialId);
    return validatePassSnapshot(raw).snapshot;
  }

  async putSnapshot(snapshot: PassSnapshot): Promise<void> {
    await this.write(SNAPSHOT_STORE, snapshot);
  }

  async deleteSnapshot(credentialId: string): Promise<void> {
    await this.remove(SNAPSHOT_STORE, credentialId);
  }

  async getHostKey(): Promise<{ key: CryptoKey; keyId: string } | null> {
    const existing = await this.read<MetaRecord>(META_STORE, "hmac");
    if (existing?.key && existing.keyId) return { key: existing.key, keyId: existing.keyId };
    if (!globalThis.crypto?.subtle) return null;
    try {
      const key = await crypto.subtle.generateKey(
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign", "verify"],
      );
      const keyId = `host:${crypto.randomUUID()}`;
      await this.write(META_STORE, { id: "hmac", kind: "hmac", key, keyId } satisfies MetaRecord);
      return { key, keyId };
    } catch {
      return null;
    }
  }

  async putIssuerKey(keyId: string, publicKey: string): Promise<void> {
    await this.write(META_STORE, {
      id: `issuer:${keyId}`,
      kind: "issuer-key",
      keyId,
      value: publicKey,
    } satisfies MetaRecord);
  }

  async getIssuerKey(keyId: string): Promise<string | null> {
    const record = await this.read<MetaRecord>(META_STORE, `issuer:${keyId}`);
    return record?.value ?? null;
  }

  async clear(): Promise<void> {
    const db = await this.db();
    if (!db) return;
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction([SNAPSHOT_STORE, META_STORE], "readwrite");
        tx.objectStore(SNAPSHOT_STORE).clear();
        tx.objectStore(META_STORE).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      } catch {
        resolve();
      }
    });
  }
}

/**
 * DSH host-side pass controller.
 *
 * The model can only suggest a credentialId and display fields. This controller
 * fetches the issuer feed, verifies the Ed25519 signature, and exposes a
 * host-owned attestation. Snapshots are sealed with a non-extractable HMAC key
 * in IndexedDB; the issuer private key never reaches the page.
 */
export function createDshPassHost(options: DshPassOptions = {}): DshPassHost {
  const global = globalConfig();
  const issuerUrl = (options.issuerUrl ?? global.url ?? "").replace(/\/+$/, "");
  const pinnedKey = options.publicKey ?? global.publicKey;
  const fetcher = options.fetcher ?? fetch;
  const now = options.now ?? (() => Date.now());
  const online = options.online ?? (() => (typeof navigator === "undefined" ? true : navigator.onLine));
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const store = new PassSnapshotStore();
  const allowedOrigins = allowedOriginSet(
    options.allowedOrigins ?? global.allowedOrigins,
    issuerUrl,
  );

  const payloads = new Map<string, PassPayload>();
  const modelPayloads = new Map<string, PassPayload>();
  const attestations = new Map<string, PassAttestation>();
  const latest = new Map<string, PassLatestKnown>();
  const pending = new Map<string, Promise<PassRefreshResult>>();
  const listeners = new Set<() => void>();
  let generation = 0;
  let clearEpoch = 0;
  let clearing: Promise<void> | null = null;
  let config: PassIssuerConfig | null = pinnedKey
    ? {
        issuer: { id: "issuer", name: "Issuer", keyId: "", algorithm: "Ed25519" },
        publicKey: pinnedKey,
      }
    : null;

  const notify = () => {
    for (const listener of [...listeners]) {
      try {
        listener();
      } catch {
        // A host listener must not break the pass controller.
      }
    }
  };

  const current = (run: number): boolean => run === generation;

  const isAllowedHttpsUrl = (value: string): boolean => {
    try {
      const url = new URL(value.trim());
      return url.protocol === "https:" &&
        !url.username &&
        !url.password &&
        allowedOrigins.has(url.origin);
    } catch {
      return false;
    }
  };

  const isQrPayloadAllowed = (payload: string): boolean => {
    if (isOpaqueQrPayload(payload)) return true;
    return isAllowedHttpsUrl(payload);
  };

  const isIssuerLinkAllowed = (url: string): boolean => isAllowedHttpsUrl(url);

  const setInvalid = (payload: PassPayload, reason: string, run = generation) => {
    if (!current(run)) return;
    payloads.set(payload.credentialId, payload);
    attestations.set(payload.credentialId, {
      credentialId: payload.credentialId,
      integrity: "invalid",
      observedAt: new Date(now()).toISOString(),
      checkedAt: new Date(now()).toISOString(),
      validUntil: payload.validUntil,
      staleAfter: payload.validUntil,
      source: { id: payload.issuer.id, kind: "issuer" },
    });
    void reason;
    notify();
  };

  const setUnverified = (payload: PassPayload, run = generation) => {
    if (!current(run)) return;
    if (!payloads.has(payload.credentialId)) {
      payloads.set(payload.credentialId, payload);
    }
    const checkedAt = new Date(now()).toISOString();
    attestations.set(payload.credentialId, {
      credentialId: payload.credentialId,
      integrity: "unverified",
      observedAt: checkedAt,
      checkedAt,
      validUntil: payload.validUntil,
      staleAfter: payload.validUntil,
      source: { id: "dsh", kind: "host" },
    });
    notify();
  };

  const loadConfig = async (): Promise<PassIssuerConfig | null> => {
    if (config?.publicKey) return config;
    if (!issuerUrl) return null;
    try {
      const response = await fetcher(`${issuerUrl}/config`, {
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) return null;
      const raw = (await response.json()) as unknown;
      if (!raw || typeof raw !== "object") return null;
      const record = raw as { publicKey?: unknown; issuer?: unknown };
      if (typeof record.publicKey !== "string" || !record.publicKey) return null;
      const issuer = record.issuer as PassPayload["issuer"] | undefined;
      if (!issuer || typeof issuer !== "object") return null;
      config = {
        issuer,
        publicKey: record.publicKey,
      };
      return config;
    } catch {
      return null;
    }
  };

  const fetchFeed = async (credentialId: string): Promise<FeedFetchResult> => {
    if (!issuerUrl) return { feed: null, reason: "unavailable" };
    try {
      const url = `${issuerUrl}/pass?credentialId=${encodeURIComponent(credentialId)}`;
      const response = await fetcher(url, {
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) return { feed: null, reason: "http_error" };
      const raw = (await response.json()) as unknown;
      if (!raw || typeof raw !== "object") return { feed: null, reason: "malformed" };
      const feed = raw as PassFeedResponse;
      if (!feed.payload || !feed.signature) return { feed: null, reason: "malformed" };
      if (feed.status !== "live" && feed.status !== "revoked") {
        return { feed: null, reason: "malformed" };
      }
      return { feed, reason: "ok" };
    } catch (error) {
      return { feed: null, reason: isTimeoutError(error) ? "timeout" : "unavailable" };
    }
  };

  const saveSnapshot = async (
    payload: PassPayload,
    signature: PassSignature,
    integrity: PassIntegrity,
    checkedAt: string,
    staleAfter: string,
  ): Promise<void> => {
    try {
      const base: PassSnapshot = {
        schemaVersion: "1.0",
        credentialId: payload.credentialId,
        payload,
        snapshotAt: checkedAt,
        lastCheckedAt: checkedAt,
        validUntil: payload.validUntil,
        staleAfter,
        integrity,
        seal: {
          credential: {
            alg: "issuer-signature",
            keyId: signature.keyId,
            value: signature.value,
          },
        },
      };
      const hostKey = await store.getHostKey();
      if (hostKey) {
        base.seal.metadata = {
          alg: "host-hmac-sha256",
          keyId: hostKey.keyId,
          value: await createSnapshotMetadataSeal(base, hostKey.key, hostKey.keyId),
        };
      }
      await store.putSnapshot(base);
    } catch {
      // Snapshot persistence is best effort; live verification still works.
    }
  };

  const applyLive = async (
    feed: PassFeedResponse,
    requested: PassPayload,
    run: number,
  ): Promise<boolean> => {
    if (!current(run)) return true;
    const checked = validatePassPayload(feed.payload);
    if (!checked.payload || checked.payload.credentialId !== requested.credentialId) {
      setInvalid(requested, "issuer payload does not match the requested credential", run);
      return true;
    }
    const payload = checked.payload;
    const configValue = await loadConfig();
    if (!current(run)) return true;
    if (!configValue) {
      return false;
    }
    const signatureOk = await verifyPassSignature(payload, feed.signature, configValue.publicKey);
    if (!current(run)) return true;
    if (!signatureOk) {
      setInvalid(payload, "issuer signature verification failed", run);
      return true;
    }
    await store.putIssuerKey(payload.issuer.keyId, configValue.publicKey);
    if (!current(run)) return true;
    const checkedAt = new Date(now()).toISOString();
    const maxStaleAt = Math.min(
      Date.parse(payload.validUntil),
      Date.parse(checkedAt) + SNAPSHOT_TTL_MS,
    );
    const requestedStaleAt = feed.staleAfter ? Date.parse(feed.staleAfter) : Number.NaN;
    const staleAfter = new Date(
      Number.isFinite(requestedStaleAt) ? Math.min(requestedStaleAt, maxStaleAt) : maxStaleAt,
    ).toISOString();
    const integrity: PassIntegrity = feed.status === "revoked" ? "revoked" : "verified";
    if (!current(run)) return true;
    payloads.set(payload.credentialId, payload);
    attestations.set(payload.credentialId, {
      credentialId: payload.credentialId,
      integrity,
      observedAt: instant(feed.observedAt, checkedAt),
      checkedAt,
      validUntil: payload.validUntil,
      staleAfter,
      source: sourceFor(feed),
    });
    latest.set(payload.credentialId, {
      ...(payload.gate ? { gate: payload.gate } : {}),
      observedAt: instant(feed.observedAt, checkedAt),
    });
    if (integrity === "verified" || integrity === "revoked") {
      await saveSnapshot(payload, feed.signature, integrity, checkedAt, staleAfter);
    }
    if (!current(run)) return true;
    notify();
    return true;
  };

  const applySnapshot = async (requested: PassPayload, run: number): Promise<boolean> => {
    if (!current(run)) return true;
    const snapshot = await store.getSnapshot(requested.credentialId);
    if (!current(run)) return true;
    if (!snapshot) return false;
    const hostKey = await store.getHostKey();
    if (!current(run)) return true;
    if (!hostKey || !(await verifySnapshotMetadata(snapshot, hostKey.key, hostKey.keyId))) {
      setInvalid(snapshot.payload, "snapshot metadata seal is invalid", run);
      return true;
    }
    if (!current(run)) return true;
    const publicKey =
      (await store.getIssuerKey(snapshot.payload.issuer.keyId)) ?? config?.publicKey ?? pinnedKey ?? null;
    if (!current(run)) return true;
    if (!publicKey || !(await verifySnapshotCredential(snapshot, publicKey))) {
      setInvalid(snapshot.payload, "snapshot credential seal is invalid", run);
      return true;
    }
    if (!current(run)) return true;
    payloads.set(snapshot.credentialId, snapshot.payload);
    attestations.set(snapshot.credentialId, {
      credentialId: snapshot.credentialId,
      integrity: snapshot.integrity ?? "verified",
      observedAt: snapshot.lastCheckedAt ?? snapshot.snapshotAt,
      checkedAt: snapshot.lastCheckedAt ?? snapshot.snapshotAt,
      validUntil: snapshot.validUntil,
      staleAfter: snapshot.staleAfter,
      source: { id: snapshot.payload.issuer.id, kind: "issuer" },
      snapshotAt: snapshot.snapshotAt,
    });
    if (!current(run)) return true;
    notify();
    return true;
  };

  const load = async (modelPayload: PassPayload, force = false): Promise<PassRefreshResult> => {
    const credentialId = modelPayload.credentialId;
    modelPayloads.set(credentialId, modelPayload);
    const running = pending.get(credentialId);
    if (running) return running;
    if (!force && payloads.has(credentialId)) {
      return {
        status: "succeeded",
        reason: "already_loaded",
        attestation: attestations.get(credentialId) ?? null,
      };
    }
    // A new mount after logout must not write a snapshot while the previous
    // clear is still removing in-flight writes.
    if (clearing) await clearing;
    const run = generation;
    const task = (async (): Promise<PassRefreshResult> => {
      const canFetch = online() && !!issuerUrl;
      const fetched: FeedFetchResult = canFetch
        ? await fetchFeed(credentialId)
        : { feed: null, reason: "unavailable" };
      if (!current(run)) return { status: "unavailable", reason: "cleared" };
      if (fetched.feed) {
        const applied = await applyLive(fetched.feed, modelPayload, run);
        // applyLive may finish a snapshot write after clear started. Never
        // report success for a result that was invalidated by logout.
        if (!current(run)) return { status: "unavailable", reason: "cleared" };
        if (applied) {
          return {
            status: "succeeded",
            attestation: attestations.get(credentialId) ?? null,
          };
        }
      }
      if (!current(run)) return { status: "unavailable", reason: "cleared" };
      if (await applySnapshot(modelPayload, run)) {
        if (!current(run)) return { status: "unavailable", reason: "cleared" };
        return {
          status: fetched.reason === "timeout" ? "timeout" : "unavailable",
          reason: fetched.reason,
          attestation: attestations.get(credentialId) ?? null,
        };
      }
      if (!current(run)) return { status: "unavailable", reason: "cleared" };
      setUnverified(modelPayload, run);
      return {
        status: fetched.reason === "timeout" ? "timeout" : "unavailable",
        reason: fetched.reason,
        attestation: attestations.get(credentialId) ?? null,
      };
    })().finally(() => {
      if (pending.get(credentialId) === task) pending.delete(credentialId);
      if (current(run)) notify();
    });
    pending.set(credentialId, task);
    return task;
  };

  let onlineListener: (() => void) | null = null;
  const host: DshPassHost = {
    ensurePass(payload) {
      if (!payload || typeof payload.credentialId !== "string") return;
      modelPayloads.set(payload.credentialId, payload);
      if (!payloads.has(payload.credentialId) && !pending.has(payload.credentialId)) {
        void load(payload);
      }
    },
    getPayload(credentialId) {
      return payloads.get(credentialId) ?? null;
    },
    getAttestation(credentialId) {
      const attestation = attestations.get(credentialId);
      return attestation?.credentialId === credentialId ? attestation : null;
    },
    getLatestKnown(credentialId) {
      return latest.get(credentialId) ?? null;
    },
    isOnline: online,
    now,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    isQrPayloadAllowed,
    isIssuerLinkAllowed,
    clearEpoch() {
      return clearEpoch;
    },
    async refresh(credentialId) {
      const payload = payloads.get(credentialId) ?? modelPayloads.get(credentialId);
      if (!payload) return { status: "unavailable", reason: "no_payload" };
      return load(payload, true);
    },
    async refreshAll() {
      const results: PassRefreshResult[] = [];
      for (const payload of modelPayloads.values()) {
        results.push(await load(payload, true));
      }
      return results;
    },
    async clear() {
      if (clearing) return clearing;
      const operation = (async () => {
        clearEpoch++;
        generation++;
        const tasks = [...pending.values()];
        payloads.clear();
        modelPayloads.clear();
        attestations.clear();
        latest.clear();
        // Repaint after the first store wipe. A new mount's load waits on
        // `clearing`, so it cannot race the second wipe.
        await store.clear();
        notify();
        await Promise.allSettled(tasks);
        // An in-flight task can finish its IndexedDB write after the first clear;
        // clear once more after it settles so logout leaves no snapshot or key.
        payloads.clear();
        modelPayloads.clear();
        attestations.clear();
        latest.clear();
        await store.clear();
        notify();
      })();
      const wrapped = operation.finally(() => {
        if (clearing === wrapped) clearing = null;
      });
      clearing = wrapped;
      await wrapped;
    },
    dispose() {
      listeners.clear();
      if (typeof window !== "undefined" && onlineListener) {
        window.removeEventListener("online", onlineListener);
        onlineListener = null;
      }
    },
  };

  if (typeof window !== "undefined") {
    onlineListener = () => {
      void host.refreshAll();
    };
    window.addEventListener("online", onlineListener);
  }

  return host;
}
