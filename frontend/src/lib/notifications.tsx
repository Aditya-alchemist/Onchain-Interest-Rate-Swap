import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AlertTriangle, CheckCircle2, ExternalLink, Info, Loader2, X } from "lucide-react";

/**
 * ============================================================
 * Notifications — toasts + a persistent activity feed
 * ============================================================
 *
 * Every write in the protocol goes through `runTx` in useProtocol, which
 * drives one toast through its whole lifecycle:
 *
 *   pending ("confirm in your wallet") -> pending ("mining") -> success | error
 *
 * When a toast reaches a terminal state it is also committed to the activity
 * feed, which survives reloads via localStorage and is rendered on the
 * Portfolio page (the bell in the side rail).
 */

export type NoticeKind = "pending" | "success" | "error" | "info";

export interface Notice {
  id: string;
  kind: NoticeKind;
  title: string;
  message?: string;
  /** Transaction hash, rendered as a Sepolia Etherscan link. */
  hash?: string;
  /** Step progress, e.g. { current: 1, total: 2 }. */
  step?: { current: number; total: number };
  ts: number;
}

export interface NotificationsApi {
  toasts: Notice[];
  feed: Notice[];
  unreadCount: number;
  push: (notice: Omit<Notice, "id" | "ts"> & { id?: string }) => string;
  update: (id: string, patch: Partial<Omit<Notice, "id">>) => void;
  dismiss: (id: string) => void;
  markFeedRead: () => void;
  clearFeed: () => void;
}

const STORAGE_KEY = "hedgefi.activity.v1";
const READ_KEY = "hedgefi.activity.read.v1";
const FEED_LIMIT = 60;
const AUTO_DISMISS_MS: Partial<Record<NoticeKind, number>> = {
  success: 7000,
  info: 5000,
  // pending and error stay until they are replaced or dismissed by hand.
};

const NotificationsContext = createContext<NotificationsApi | null>(null);

// ------------------------------------------------------------
// Persistence (best-effort — private browsing can block it)
// ------------------------------------------------------------

function loadFeed(): Notice[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item && typeof item.id === "string").slice(0, FEED_LIMIT);
  } catch {
    return [];
  }
}

function saveFeed(feed: Notice[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(feed.slice(0, FEED_LIMIT)));
  } catch {
    /* storage unavailable — the feed just becomes session-only */
  }
}

function loadReadAt(): number {
  try {
    return Number(window.localStorage.getItem(READ_KEY) || "0") || 0;
  } catch {
    return 0;
  }
}

let counter = 0;
function nextId(): string {
  counter += 1;
  return `n${Date.now().toString(36)}${counter}`;
}

// ------------------------------------------------------------
// Provider
// ------------------------------------------------------------

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Notice[]>([]);
  const [feed, setFeed] = useState<Notice[]>(() => loadFeed());
  const [readAt, setReadAt] = useState<number>(() => loadReadAt());

  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const clearTimer = useCallback((id: string) => {
    const handle = timers.current.get(id);
    if (handle) {
      clearTimeout(handle);
      timers.current.delete(id);
    }
  }, []);

  const dismiss = useCallback(
    (id: string) => {
      clearTimer(id);
      setToasts((current) => current.filter((item) => item.id !== id));
    },
    [clearTimer]
  );

  const scheduleDismiss = useCallback(
    (id: string, kind: NoticeKind) => {
      clearTimer(id);
      const delay = AUTO_DISMISS_MS[kind];
      if (!delay) return;
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), delay)
      );
    },
    [clearTimer, dismiss]
  );

  /** Terminal notices are the ones worth keeping in history. */
  const commitToFeed = useCallback((notice: Notice) => {
    if (notice.kind !== "success" && notice.kind !== "error") return;
    setFeed((current) => {
      const withoutDuplicate = current.filter((item) => item.id !== notice.id);
      const next = [{ ...notice }, ...withoutDuplicate].slice(0, FEED_LIMIT);
      saveFeed(next);
      return next;
    });
  }, []);

  const push = useCallback<NotificationsApi["push"]>(
    (notice) => {
      const id = notice.id ?? nextId();
      const full: Notice = { ...notice, id, ts: Date.now() };
      setToasts((current) => [full, ...current.filter((item) => item.id !== id)].slice(0, 4));
      scheduleDismiss(id, full.kind);
      commitToFeed(full);
      return id;
    },
    [commitToFeed, scheduleDismiss]
  );

  const update = useCallback<NotificationsApi["update"]>(
    (id, patch) => {
      setToasts((current) => {
        let updated: Notice | null = null;
        const next = current.map((item) => {
          if (item.id !== id) return item;
          updated = { ...item, ...patch, ts: patch.kind && patch.kind !== item.kind ? Date.now() : item.ts };
          return updated;
        });
        if (updated) {
          scheduleDismiss(id, (updated as Notice).kind);
          commitToFeed(updated as Notice);
        }
        return next;
      });
    },
    [commitToFeed, scheduleDismiss]
  );

  const markFeedRead = useCallback(() => {
    const now = Date.now();
    setReadAt(now);
    try {
      window.localStorage.setItem(READ_KEY, String(now));
    } catch {
      /* ignore */
    }
  }, []);

  const clearFeed = useCallback(() => {
    setFeed([]);
    saveFeed([]);
    markFeedRead();
  }, [markFeedRead]);

  // Clean up any outstanding timers on unmount.
  useEffect(
    () => () => {
      timers.current.forEach((handle) => clearTimeout(handle));
      timers.current.clear();
    },
    []
  );

  const unreadCount = useMemo(
    () => feed.filter((item) => item.ts > readAt).length,
    [feed, readAt]
  );

  const value = useMemo<NotificationsApi>(
    () => ({ toasts, feed, unreadCount, push, update, dismiss, markFeedRead, clearFeed }),
    [toasts, feed, unreadCount, push, update, dismiss, markFeedRead, clearFeed]
  );

  return (
    <NotificationsContext.Provider value={value}>
      {children}
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </NotificationsContext.Provider>
  );
}

export function useNotifications(): NotificationsApi {
  const context = useContext(NotificationsContext);
  if (!context) {
    throw new Error("useNotifications must be used inside <NotificationProvider>.");
  }
  return context;
}

// ------------------------------------------------------------
// Presentation
// ------------------------------------------------------------

export function noticeIcon(kind: NoticeKind, size = 16) {
  switch (kind) {
    case "pending":
      return <Loader2 size={size} className="spin" />;
    case "success":
      return <CheckCircle2 size={size} />;
    case "error":
      return <AlertTriangle size={size} />;
    default:
      return <Info size={size} />;
  }
}

export function etherscanTx(hash: string): string {
  return `https://sepolia.etherscan.io/tx/${hash}`;
}

export function shortHash(hash: string): string {
  return `${hash.slice(0, 8)}…${hash.slice(-6)}`;
}

export function relativeTime(ts: number): string {
  const seconds = Math.max(1, Math.round((Date.now() - ts) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function ToastStack({ toasts, onDismiss }: { toasts: Notice[]; onDismiss: (id: string) => void }) {
  if (toasts.length === 0) return null;

  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast--${toast.kind}`}>
          <span className="toast__icon">{noticeIcon(toast.kind)}</span>

          <div className="toast__body">
            <div className="toast__title">
              {toast.title}
              {toast.step && toast.step.total > 1 && (
                <span className="toast__step">
                  {toast.step.current}/{toast.step.total}
                </span>
              )}
            </div>

            {toast.message && <p className="toast__message">{toast.message}</p>}

            {toast.hash && (
              <a
                className="toast__link"
                href={etherscanTx(toast.hash)}
                target="_blank"
                rel="noreferrer"
              >
                {shortHash(toast.hash)} <ExternalLink size={11} />
              </a>
            )}
          </div>

          <button
            type="button"
            className="toast__close"
            aria-label="Dismiss notification"
            onClick={() => onDismiss(toast.id)}
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

export default NotificationProvider;
