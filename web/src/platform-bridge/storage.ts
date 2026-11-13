// ADD 4.1 — 스토리지 추상화 인터페이스 (StorageAdapter)
export interface StorageAdapter {
  getBoundaryCache(key: string): Promise<{ etag: string; topology: unknown } | null>;
  setBoundaryCache(key: string, etag: string, topology: unknown): Promise<void>;
  clearExpiredCache(): Promise<void>;
}

const DB_NAME = "res-boundary-cache";
const STORE = "boundaries";
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

interface CacheRecord {
  key: string;
  etag: string;
  topology: unknown;
  savedAt: number;
}

class IndexedDBStorage implements StorageAdapter {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private db(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "key" });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
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

  async getBoundaryCache(key: string) {
    try {
      const rec = await this.tx<CacheRecord>("readonly", (s) => s.get(key));
      return rec ? { etag: rec.etag, topology: rec.topology } : null;
    } catch {
      return null;
    }
  }

  async setBoundaryCache(key: string, etag: string, topology: unknown) {
    try {
      await this.tx("readwrite", (s) => s.put({ key, etag, topology, savedAt: Date.now() } satisfies CacheRecord));
    } catch {
      /* 캐시 실패는 무시 (기능 저하 없음) */
    }
  }

  async clearExpiredCache() {
    try {
      const all = (await this.tx<CacheRecord[]>("readonly", (s) => s.getAll())) ?? [];
      const expired = all.filter((r) => Date.now() - r.savedAt > MAX_AGE_MS);
      if (expired.length) await this.tx("readwrite", (s) => void expired.forEach((r) => s.delete(r.key)));
    } catch {
      /* noop */
    }
  }
}

// 네이티브 패키징 레이어(Tauri / Capacitor)에서는 플러그인 기반 파일 저장소로 교체합니다.
// 웹 프로토타입에서는 동일 인터페이스로 IndexedDB 구현을 재사용합니다.
class TauriFileSystemStorage extends IndexedDBStorage {}
class CapacitorFileSystemStorage extends IndexedDBStorage {}

export function createStorageAdapter(): StorageAdapter {
  if (typeof window !== "undefined" && "__TAURI__" in window) return new TauriFileSystemStorage();
  if (typeof window !== "undefined" && "Capacitor" in window) return new CapacitorFileSystemStorage();
  return new IndexedDBStorage();
}

export const storage = createStorageAdapter();
