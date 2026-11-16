import { create } from "zustand";
import type { Property } from "../api/mockServer";

export const BOOKMARK_STORAGE_KEY = "re_search_v16_bookmarks";
export const MAX_COMPARE_COUNT = 4;

interface PersistedBookmarkState {
  bookmarks: Property[];
  compareIds: number[];
}

function loadPersisted(): PersistedBookmarkState {
  if (typeof window === "undefined") {
    return { bookmarks: [], compareIds: [] };
  }
  try {
    const raw = window.localStorage.getItem(BOOKMARK_STORAGE_KEY);
    if (!raw) return { bookmarks: [], compareIds: [] };
    const parsed = JSON.parse(raw) as Partial<PersistedBookmarkState> | Property[];
    if (Array.isArray(parsed)) {
      return { bookmarks: parsed, compareIds: [] };
    }
    const bookmarks = Array.isArray(parsed.bookmarks) ? parsed.bookmarks : [];
    const bookmarkIdSet = new Set(bookmarks.map((b) => b.property_id));
    const compareIds = Array.isArray(parsed.compareIds)
      ? parsed.compareIds
          .filter((id): id is number => typeof id === "number" && bookmarkIdSet.has(id))
          .slice(0, MAX_COMPARE_COUNT)
      : [];
    return { bookmarks, compareIds };
  } catch {
    return { bookmarks: [], compareIds: [] };
  }
}

function savePersisted(state: PersistedBookmarkState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(BOOKMARK_STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* private mode 또는 스토리지 용량 초과 시 메모리 상태 유지 */
  }
}

export interface BookmarkStore {
  bookmarks: Property[];
  compareIds: number[];
  toggleBookmark(p: Property): void;
  removeBookmark(id: number): void;
  isBookmarked(id: number): boolean;
  clearBookmarks(): void;
  /** 비교 목록 토글 (최대 4건). 상한 초과로 추가 실패 시 false 반환 */
  toggleCompare(id: number): boolean;
  isCompared(id: number): boolean;
  clearCompare(): void;
}

const initial = loadPersisted();

export const useBookmarkStore = create<BookmarkStore>((set, get) => ({
  bookmarks: initial.bookmarks,
  compareIds: initial.compareIds,

  toggleBookmark: (p) => {
    const { bookmarks, compareIds } = get();
    const exists = bookmarks.some((b) => b.property_id === p.property_id);
    const nextBookmarks = exists
      ? bookmarks.filter((b) => b.property_id !== p.property_id)
      : [p, ...bookmarks];
    const nextCompareIds = exists
      ? compareIds.filter((id) => id !== p.property_id)
      : compareIds;
    savePersisted({ bookmarks: nextBookmarks, compareIds: nextCompareIds });
    set({ bookmarks: nextBookmarks, compareIds: nextCompareIds });
  },

  removeBookmark: (id) => {
    const { bookmarks, compareIds } = get();
    const nextBookmarks = bookmarks.filter((b) => b.property_id !== id);
    const nextCompareIds = compareIds.filter((cid) => cid !== id);
    savePersisted({ bookmarks: nextBookmarks, compareIds: nextCompareIds });
    set({ bookmarks: nextBookmarks, compareIds: nextCompareIds });
  },

  isBookmarked: (id) => get().bookmarks.some((b) => b.property_id === id),

  clearBookmarks: () => {
    savePersisted({ bookmarks: [], compareIds: [] });
    set({ bookmarks: [], compareIds: [] });
  },

  toggleCompare: (id) => {
    const { bookmarks, compareIds } = get();
    if (compareIds.includes(id)) {
      const nextCompareIds = compareIds.filter((cid) => cid !== id);
      savePersisted({ bookmarks, compareIds: nextCompareIds });
      set({ compareIds: nextCompareIds });
      return true;
    }
    if (compareIds.length >= MAX_COMPARE_COUNT) {
      return false;
    }
    const nextCompareIds = [...compareIds, id];
    savePersisted({ bookmarks, compareIds: nextCompareIds });
    set({ compareIds: nextCompareIds });
    return true;
  },

  isCompared: (id) => get().compareIds.includes(id),

  clearCompare: () => {
    const { bookmarks } = get();
    savePersisted({ bookmarks, compareIds: [] });
    set({ compareIds: [] });
  },
}));
