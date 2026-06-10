import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import "./App.css";

const API_BASE_URL =
  process.env.REACT_APP_API_BASE_URL || "http://localhost:5000";
const PAGE_SIZE = 10;
const TYPES = ["All", "Placement", "Result", "Event"] as const;
const PRIORITY_WEIGHT: Record<NotificationType, number> = {
  Placement: 3,
  Result: 2,
  Event: 1,
};

type NotificationType = "Placement" | "Result" | "Event";
type FilterType = (typeof TYPES)[number];
type View = "priority" | "notifications";

interface NotificationItem {
  ID: string;
  Type: NotificationType;
  Message: string;
  Timestamp: string;
}

interface NotificationResponse {
  notifications: NotificationItem[];
  total: number;
  page: number;
  limit: number;
  counts: Record<FilterType, number>;
  fetchedAt: string;
}

interface PriorityResponse {
  top10: NotificationItem[];
  total: number;
  fetchedAt: string;
}

const routeToView = (): View =>
  window.location.pathname.includes("priority") ? "priority" : "notifications";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value.replace(" ", "T")));
}

function typeClass(type: string) {
  return `type-${type.toLowerCase()}`;
}

function App() {
  const [view, setView] = useState<View>(routeToView);
  const [filter, setFilter] = useState<FilterType>("All");
  const [page, setPage] = useState(1);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [priorityItems, setPriorityItems] = useState<NotificationItem[]>([]);
  const [counts, setCounts] = useState<Record<FilterType, number>>({
    All: 0,
    Placement: 0,
    Result: 0,
    Event: 0,
  });
  const [total, setTotal] = useState(0);
  const [lastUpdated, setLastUpdated] = useState("");
  const [seen, setSeen] = useState<Set<string>>(() => {
    const saved = window.localStorage.getItem("seen_notifications");
    return new Set(saved ? JSON.parse(saved) : []);
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const unreadCount = useMemo(
    () => counts.All - Array.from(seen).filter((id) => id).length,
    [counts.All, seen]
  );

  const loadNotifications = useCallback(
    async (forceRefresh = false) => {
      setRefreshing(true);
      setError("");

      try {
        const params: Record<string, string | number> = {
          page,
          limit: PAGE_SIZE,
        };

        if (filter !== "All") {
          params.notification_type = filter;
        }

        if (forceRefresh) {
          params.refresh = "true";
        }

        const [notificationResult, priorityResult] = await Promise.all([
          axios.get<NotificationResponse>(`${API_BASE_URL}/notifications`, {
            params,
          }),
          axios.get<PriorityResponse>(`${API_BASE_URL}/priority-notifications`, {
            params: forceRefresh ? { refresh: "true" } : undefined,
          }),
        ]);

        setNotifications(notificationResult.data.notifications);
        setPriorityItems(priorityResult.data.top10);
        setCounts(notificationResult.data.counts);
        setTotal(notificationResult.data.total);
        setLastUpdated(notificationResult.data.fetchedAt);
      } catch (requestError) {
        setError(
          axios.isAxiosError(requestError)
            ? requestError.response?.data?.error || requestError.message
            : "Unable to load notifications"
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [filter, page]
  );

  useEffect(() => {
    const handleRouteChange = () => setView(routeToView());
    window.addEventListener("popstate", handleRouteChange);
    return () => window.removeEventListener("popstate", handleRouteChange);
  }, []);

  useEffect(() => {
    void loadNotifications();
    const interval = window.setInterval(() => {
      void loadNotifications(true);
    }, 30000);

    return () => window.clearInterval(interval);
  }, [loadNotifications]);

  useEffect(() => {
    window.localStorage.setItem(
      "seen_notifications",
      JSON.stringify(Array.from(seen))
    );
  }, [seen]);

  function navigate(nextView: View) {
    setView(nextView);
    window.history.pushState(
      null,
      "",
      nextView === "priority" ? "/priority" : "/"
    );
  }

  function markSeen(id: string) {
    setSeen((current) => new Set(current).add(id));
  }

  function clearSeen() {
    setSeen(new Set());
  }

  function NotificationCard({
    item,
    priorityRank,
  }: {
    item: NotificationItem;
    priorityRank?: number;
  }) {
    const isSeen = seen.has(item.ID);
    const score = PRIORITY_WEIGHT[item.Type] || 0;

    return (
      <article
        className={`notification-card ${isSeen ? "is-seen" : "is-new"}`}
        onClick={() => markSeen(item.ID)}
      >
        <div className="card-main">
          <div className="card-copy">
            <div className="card-meta">
              {priorityRank ? (
                <span className="rank">#{priorityRank}</span>
              ) : null}
              <span className={`type-pill ${typeClass(item.Type)}`}>
                {item.Type}
              </span>
              <span className="timestamp">{formatDate(item.Timestamp)}</span>
            </div>
            <h3>{item.Message}</h3>
          </div>
          <div className="card-state">
            <span className="score">{score}</span>
            <span>{isSeen ? "Viewed" : "New"}</span>
          </div>
        </div>
      </article>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Campus notifications</p>
          <h1>Notification Center</h1>
        </div>
        <button
          className="icon-button"
          onClick={() => void loadNotifications(true)}
          disabled={refreshing}
          title="Refresh notifications"
        >
          {refreshing ? "Refreshing" : "Refresh"}
        </button>
      </header>

      <section className="metric-row" aria-label="Notification totals">
        <div className="metric">
          <span>Total</span>
          <strong>{counts.All}</strong>
        </div>
        <div className="metric">
          <span>New locally</span>
          <strong>{Math.max(unreadCount, 0)}</strong>
        </div>
        <div className="metric">
          <span>Priority feed</span>
          <strong>{priorityItems.length}</strong>
        </div>
        <div className="metric">
          <span>Updated</span>
          <strong>{lastUpdated ? formatDate(lastUpdated) : "Pending"}</strong>
        </div>
      </section>

      <nav className="view-tabs" aria-label="Notification views">
        <button
          className={view === "priority" ? "active" : ""}
          onClick={() => navigate("priority")}
        >
          Priority Inbox
        </button>
        <button
          className={view === "notifications" ? "active" : ""}
          onClick={() => navigate("notifications")}
        >
          All Notifications
        </button>
      </nav>

      {error ? (
        <section className="status-panel error-panel">
          <strong>Unable to load notifications.</strong>
          <span>{error}</span>
        </section>
      ) : null}

      {loading ? (
        <section className="status-panel">Loading notifications...</section>
      ) : null}

      {!loading && view === "priority" ? (
        <section className="content-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Sorted by type weight and recency</p>
              <h2>Top 10 Priority Inbox</h2>
            </div>
          </div>

          <div className="notification-list">
            {priorityItems.map((item, index) => (
              <NotificationCard
                key={item.ID}
                item={item}
                priorityRank={index + 1}
              />
            ))}
          </div>
        </section>
      ) : null}

      {!loading && view === "notifications" ? (
        <section className="content-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Browse and mark locally viewed items</p>
              <h2>All Notifications</h2>
            </div>
            <button className="ghost-button" onClick={clearSeen}>
              Reset viewed
            </button>
          </div>

          <div className="filter-row">
            {TYPES.map((type) => (
              <button
                key={type}
                className={filter === type ? "active" : ""}
                onClick={() => {
                  setFilter(type);
                  setPage(1);
                }}
              >
                {type}
                <span>{counts[type]}</span>
              </button>
            ))}
          </div>

          <div className="notification-list">
            {notifications.length ? (
              notifications.map((item) => (
                <NotificationCard key={item.ID} item={item} />
              ))
            ) : (
              <div className="empty-state">No notifications found.</div>
            )}
          </div>

          <div className="pagination">
            <button
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page === 1}
            >
              Previous
            </button>
            <span>
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() =>
                setPage((current) => Math.min(totalPages, current + 1))
              }
              disabled={page === totalPages}
            >
              Next
            </button>
          </div>
        </section>
      ) : null}
    </main>
  );
}

export default App;
