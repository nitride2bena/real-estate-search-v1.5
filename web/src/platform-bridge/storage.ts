// ADD 4.1 & FR-15 — 스토리지 추상화 인터페이스 (StorageAdapter)
// 웹(IndexedDB), 데스크톱(Tauri Filesystem), 모바일(Capacitor Filesystem) 단일 인터페이스 통합
export interface StorageAdapter {
  getBoundaryCache(key: string): Promise<{ etag: string; topology: unknown } | null>;
  setBoundaryCache(key: string, etag: string, topology: unknown): Promise<void>;
  clearExpiredCache(): Promise<void>;
}

const DB_NAME = "res-boundary-cache";
const STORE = "boundaries";
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30일 보관

export interface CacheRecord {
  key: string;
  etag: string;
  topology: unknown;
  savedAt: number;
}

const memoryFallback = new Map<string, CacheRecord>();

export class IndexedDBStorage implements StorageAdapter {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private db(): Promise<IDBDatabase> {
    if (typeof indexedDB === "undefined") {
      return Promise.reject(new Error("IndexedDB를 지원하지 않는 환경입니다."));
    }
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
          if (!req.result.objectStoreNames.contains(STORE)) {
            req.result.createObjectStore(STORE, { keyPath: "key" });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => {
          this.dbPromise = null;
          reject(req.error);
        };
      });
    }
    return this.dbPromise;
  }

  private async tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
    const db = await this.db();
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const req = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(req ? (req.result as T) : undefined);
      t.onerror = () => reject(t.error);
    });
  }

  async getBoundaryCache(key: string): Promise<{ etag: string; topology: unknown } | null> {
    try {
      const rec = await this.tx<CacheRecord>("readonly", (s) => s.get(key));
      if (!rec) return memoryFallback.get(key) ?? null;
      if (Date.now() - rec.savedAt > MAX_AGE_MS) {
        void this.tx("readwrite", (s) => s.delete(key)).catch(() => {});
        memoryFallback.delete(key);
        return null;
      }
      return { etag: rec.etag, topology: rec.topology };
    } catch {
      const mem = memoryFallback.get(key);
      if (mem && Date.now() - mem.savedAt <= MAX_AGE_MS) {
        return { etag: mem.etag, topology: mem.topology };
      }
      return null;
    }
  }

  async setBoundaryCache(key: string, etag: string, topology: unknown): Promise<void> {
    const record: CacheRecord = { key, etag, topology, savedAt: Date.now() };
    memoryFallback.set(key, record);
    try {
      await this.tx("readwrite", (s) => s.put(record));
    } catch {
      /* 캐시 실패 시 메모리 폴백 유지 (기능 저하 없음) */
    }
  }

  async clearExpiredCache(): Promise<void> {
    const now = Date.now();
    for (const [k, v] of memoryFallback.entries()) {
      if (now - v.savedAt > MAX_AGE_MS) memoryFallback.delete(k);
    }
    try {
      const all = (await this.tx<CacheRecord[]>("readonly", (s) => s.getAll())) ?? [];
      const expired = all.filter((r) => now - r.savedAt > MAX_AGE_MS);
      if (expired.length) {
        await this.tx("readwrite", (s) => void expired.forEach((r) => s.delete(r.key)));
      }
    } catch {
      /* noop */
    }
  }
}

// ADD 2.1 & 4.1 — Tauri v2 (Windows / macOS) 로컬 디스크 캐시 어댑터
export class TauriFileSystemStorage extends IndexedDBStorage {
  private sanitizeKey(key: string): string {
    return `boundary_${key.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`;
  }

  override async getBoundaryCache(key: string): Promise<{ etag: string; topology: unknown } | null> {
    const tauriFs = (window as unknown as { __TAURI__?: { fs?: { readTextFile?: (p: string) => Promise<string> } } }).__TAURI__?.fs;
    if (tauriFs?.readTextFile) {
      try {
        const raw = await tauriFs.readTextFile(this.sanitizeKey(key));
        const rec = JSON.parse(raw) as CacheRecord;
        if (Date.now() - rec.savedAt <= MAX_AGE_MS) {
          return { etag: rec.etag, topology: rec.topology };
        }
      } catch {
        /* 파일 캐시 미존재 시 IndexedDB 폴백 */
      }
    }
    return super.getBoundaryCache(key);
  }

  override async setBoundaryCache(key: string, etag: string, topology: unknown): Promise<void> {
    const tauriFs = (window as unknown as { __TAURI__?: { fs?: { writeTextFile?: (p: string, c: string) => Promise<void> } } }).__TAURI__?.fs;
    if (tauriFs?.writeTextFile) {
      try {
        const rec: CacheRecord = { key, etag, topology, savedAt: Date.now() };
        await tauriFs.writeTextFile(this.sanitizeKey(key), JSON.stringify(rec));
      } catch {
        /* noop */
      }
    }
    await super.setBoundaryCache(key, etag, topology);
  }
}

// ADD 2.1 & 4.1 — Capacitor v6 (Android / iOS) 파일시스템 어댑터 (iOS ITP 7일 캐시 삭제 우회)
export class CapacitorFileSystemStorage extends IndexedDBStorage {
  private sanitizeKey(key: string): string {
    return `boundary_${key.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`;
  }

  override async getBoundaryCache(key: string): Promise<{ etag: string; topology: unknown } | null> {
    const capFs = (window as unknown as {
      Capacitor?: { Plugins?: { Filesystem?: { readFile?: (opts: { path: string; directory?: string }) => Promise<{ data: string }> } } };
    }).Capacitor?.Plugins?.Filesystem;
    if (capFs?.readFile) {
      try {
        const res = await capFs.readFile({ path: this.sanitizeKey(key), directory: "DATA" });
        const rec = JSON.parse(res.data) as CacheRecord;
        if (Date.now() - rec.savedAt <= MAX_AGE_MS) {
          return { etag: rec.etag, topology: rec.topology };
        }
      } catch {
        /* 파일 캐시 미존재 시 IndexedDB 폴백 */
      }
    }
    return super.getBoundaryCache(key);
  }

  override async setBoundaryCache(key: string, etag: string, topology: unknown): Promise<void> {
    const capFs = (window as unknown as {
      Capacitor?: { Plugins?: { Filesystem?: { writeFile?: (opts: { path: string; data: string; directory?: string }) => Promise<void> } } };
    }).Capacitor?.Plugins?.Filesystem;
    if (capFs?.writeFile) {
      try {
        const rec: CacheRecord = { key, etag, topology, savedAt: Date.now() };
        await capFs.writeFile({ path: this.sanitizeKey(key), data: JSON.stringify(rec), directory: "DATA" });
      } catch {
        /* noop */
      }
    }
    await super.setBoundaryCache(key, etag, topology);
  }
}

export function createStorageAdapter(): StorageAdapter {
  let adapter: StorageAdapter;
  if (typeof window !== "undefined" && "__TAURI__" in window) {
    adapter = new TauriFileSystemStorage();
  } else if (typeof window !== "undefined" && "Capacitor" in window) {
    adapter = new CapacitorFileSystemStorage();
  } else {
    adapter = new IndexedDBStorage();
  }
  // 초기화 시 만료된 로컬 경계 캐시 비동기 정리
  if (typeof window !== "undefined") {
    void adapter.clearExpiredCache();
  }
  return adapter;
}

export const storage = createStorageAdapter();
