import { useSyncExternalStore } from "react";

type Listener = () => void;

class SimpleStore<T> {
  private state: T;
  private listeners = new Set<Listener>();
  constructor(initial: T) {
    this.state = initial;
  }
  get = () => this.state;
  set = (partial: Partial<T> | ((s: T) => Partial<T>)) => {
    const p = typeof partial === "function" ? (partial as any)(this.state) : partial;
    this.state = { ...this.state, ...p };
    this.listeners.forEach((l) => l());
  };
  subscribe = (l: Listener) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
}

export type NotificationType = "info" | "success" | "warning" | "error";

export interface AppNotification {
  id: string;
  title: string;
  message?: string;
  type: NotificationType;
  createdAt: string;
  read: boolean;
}

interface NotificationState {
  items: AppNotification[];
}

const store = new SimpleStore<NotificationState>({
  items: [],
});

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export const notificationActions = {
  add: (n: Omit<AppNotification, "id" | "createdAt" | "read">) => {
    const item: AppNotification = {
      ...n,
      id: generateId(),
      createdAt: new Date().toISOString(),
      read: false,
    };
    store.set((s) => ({ items: [item, ...s.items].slice(0, 50) }));
    return item.id;
  },
  markRead: (id: string) => {
    store.set((s) => ({
      items: s.items.map((it) => (it.id === id ? { ...it, read: true } : it)),
    }));
  },
  markAllRead: () => {
    store.set((s) => ({
      items: s.items.map((it) => ({ ...it, read: true })),
    }));
  },
  dismiss: (id: string) => {
    store.set((s) => ({
      items: s.items.filter((it) => it.id !== id),
    }));
  },
  clearAll: () => {
    store.set({ items: [] });
  },
  unreadCount: () => store.get().items.filter((it) => !it.read).length,
};

export function useNotificationStore<S>(selector: (s: NotificationState) => S): S {
  return useSyncExternalStore(store.subscribe, () => selector(store.get()), () => selector(store.get()));
}
