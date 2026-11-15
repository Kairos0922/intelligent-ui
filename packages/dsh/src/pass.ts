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

export interface DshPassOptions {
  /** Base URL of the test/real issuer. Omit to render only unverified model data. */
  issuerUrl?: string;
  /** Optional pinned Ed25519 SPKI base64 key; otherwise /config is fetched once. */
  publicKey?: string;
  fetcher?: typeof fetch;
  now?: () => number;
  online?: () => boolean;
  timeoutMs?: number;
}

export interface DshPassHost extends PassHost {
  ensurePass(payload: PassPayload): void;
  getPayload(credentialId: string): PassPayload | null;
  getAttestation(credentialId: string): PassAttestation | null;
  getLatestKnown(credentialId: string): PassLatestKnown | null;
  isOnline(): boolean;
  now(): number;
  subscribe(listener: () => void): () => void;
  refresh(credentialId: string): Promise<void>;
  refreshAll(): Promise<void>;
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

function globalConfig(): { url?: string; publicKey?: string } {
  const value = (globalThis as { __IUI_PASS_ISSUER__?: unknown }).__IUI_PASS_ISSUER__;
  if (!value || typeof value !== "object") return {};
  const raw = value as { url?: unknown; publicKey?: unknown };
  return {
    ...(typeof raw.url === "string" && raw.url ? { url: raw.url } : {}),
    ...(typeof raw.publicKey === "string" && raw.publicKey ? { publicKey: raw.publicKey } : {}),
  };
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

  const payloads = new Map<string, PassPayload>();
  const modelPayloads = new Map<string, PassPayload>();
  const attestations = new Map<string, PassAttestation>();
  const latest = new Map<string, PassLatestKnown>();
  const pending = new Map<string, Promise<void>>();
  const listeners = new Set<() => void>();
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

  const setInvalid = (payload: PassPayload, reason: string) => {
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

  const setUnverified = (payload: PassPayload) => {
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

  const fetchFeed = async (credentialId: string): Promise<PassFeedResponse | null> => {
    if (!issuerUrl) return null;
    try {
      const url = `${issuerUrl}/pass?credentialId=${encodeURIComponent(credentialId)}`;
      const response = await fetcher(url, {
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) return null;
      const raw = (await response.json()) as unknown;
      if (!raw || typeof raw !== "object") return null;
      const feed = raw as PassFeedResponse;
      if (!feed.payload || !feed.signature) return null;
      if (feed.status !== "live" && feed.status !== "revoked") return null;
      return feed;
    } catch {
      return null;
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

  const applyLive = async (feed: PassFeedResponse, requested: PassPayload): Promise<boolean> => {
    const checked = validatePassPayload(feed.payload);
    if (!checked.payload || checked.payload.credentialId !== requested.credentialId) {
      setInvalid(requested, "issuer payload does not match the requested credential");
      return true;
    }
    const payload = checked.payload;
    const configValue = await loadConfig();
    if (!configValue) {
      return false;
    }
    const signatureOk = await verifyPassSignature(payload, feed.signature, configValue.publicKey);
    if (!signatureOk) {
      setInvalid(payload, "issuer signature verification failed");
      return true;
    }
    await store.putIssuerKey(payload.issuer.keyId, configValue.publicKey);
    const checkedAt = new Date(now()).toISOString();
    const staleAfter = instant(
      feed.staleAfter,
      new Date(Math.min(Date.parse(payload.validUntil), Date.parse(checkedAt) + SNAPSHOT_TTL_MS)).toISOString(),
    );
    const integrity: PassIntegrity = feed.status === "revoked" ? "revoked" : "verified";
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
    notify();
    return true;
  };

  const applySnapshot = async (requested: PassPayload): Promise<boolean> => {
    const snapshot = await store.getSnapshot(requested.credentialId);
    if (!snapshot) return false;
    const hostKey = await store.getHostKey();
    if (!hostKey || !(await verifySnapshotMetadata(snapshot, hostKey.key, hostKey.keyId))) {
      setInvalid(snapshot.payload, "snapshot metadata seal is invalid");
      return true;
    }
    const publicKey =
      (await store.getIssuerKey(snapshot.payload.issuer.keyId)) ?? config?.publicKey ?? pinnedKey ?? null;
    if (!publicKey || !(await verifySnapshotCredential(snapshot, publicKey))) {
      setInvalid(snapshot.payload, "snapshot credential seal is invalid");
      return true;
    }
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
    notify();
    return true;
  };

  const load = async (modelPayload: PassPayload, force = false): Promise<void> => {
    const credentialId = modelPayload.credentialId;
    if (!force && (payloads.has(credentialId) || pending.has(credentialId))) return;
    modelPayloads.set(credentialId, modelPayload);
    if (pending.has(credentialId)) return;
    const task = (async () => {
      const canFetch = online() && issuerUrl;
      if (canFetch) {
        const feed = await fetchFeed(credentialId);
        if (feed && (await applyLive(feed, modelPayload))) return;
      }
      if (await applySnapshot(modelPayload)) return;
      setUnverified(modelPayload);
    })().finally(() => {
      pending.delete(credentialId);
      notify();
    });
    pending.set(credentialId, task);
    await task;
  };

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
    async refresh(credentialId) {
      const payload = payloads.get(credentialId) ?? modelPayloads.get(credentialId);
      if (payload) await load(payload, true);
    },
    async refreshAll() {
      for (const payload of modelPayloads.values()) {
        await load(payload, true);
      }
    },
    async clear() {
      payloads.clear();
      modelPayloads.clear();
      attestations.clear();
      latest.clear();
      await store.clear();
      notify();
    },
    dispose() {
      listeners.clear();
    },
  };

  if (typeof window !== "undefined") {
    window.addEventListener("online", () => {
      void host.refreshAll();
    });
  }

  return host;
}
