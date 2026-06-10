# Notification System Design

## Stage 1

### REST API Contract

#### Get Notifications

```http
GET /api/notifications?limit=10&page=1&notification_type=Placement
Authorization: Bearer <token>
```

Response:

```json
{
  "notifications": [
    {
      "id": "uuid",
      "type": "Event|Result|Placement",
      "message": "string",
      "isRead": false,
      "timestamp": "2026-06-10T10:00:00Z"
    }
  ],
  "total": 20,
  "page": 1,
  "limit": 10
}
```

#### Mark Notification As Read

```http
PATCH /api/notifications/:id/read
Authorization: Bearer <token>
```

Response:

```json
{ "success": true, "message": "Notification marked as read" }
```

#### Get Unread Count

```http
GET /api/notifications/unread-count
Authorization: Bearer <token>
```

Response:

```json
{ "unreadCount": 5 }
```

### Real-Time Delivery

Use WebSockets or Server-Sent Events for active sessions. The server emits newly created notifications, and the client inserts them into the current page without forcing a full reload.

## Stage 2

### Database Choice

PostgreSQL is the preferred primary store because notifications require reliable writes, filtered reads, ordering, indexing, and relational joins back to students. It also supports JSONB metadata if notification payloads become richer later.

### Schema

```sql
CREATE TABLE students (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id BIGINT NOT NULL REFERENCES students(id),
  notification_type VARCHAR(20) NOT NULL
    CHECK (notification_type IN ('Event', 'Result', 'Placement')),
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Core Queries

```sql
SELECT id, notification_type, message, is_read, created_at
FROM notifications
WHERE student_id = $1
ORDER BY created_at DESC
LIMIT $2 OFFSET $3;

UPDATE notifications
SET is_read = true
WHERE id = $1 AND student_id = $2;

SELECT COUNT(*)
FROM notifications
WHERE student_id = $1 AND is_read = false;
```

## Stage 3

Original query:

```sql
SELECT *
FROM notifications
WHERE studentID = 1042 AND isRead = false
ORDER BY createdAt ASC;
```

The query is slow because it can scan a very large table, fetches all columns, and has no index that matches both the filter and the ordering.

Recommended index:

```sql
CREATE INDEX idx_notifications_student_unread_created
ON notifications (studentID, isRead, createdAt);
```

Adding indexes on every column is not effective. Each index adds storage cost and slows writes because every insert, update, and delete must maintain more index structures. Indexes should match real query patterns.

Placement query:

```sql
SELECT DISTINCT studentID
FROM notifications
WHERE notification_type = 'Placement'
  AND createdAt >= NOW() - INTERVAL '7 days';
```

Recommended supporting index:

```sql
CREATE INDEX idx_notifications_type_created_student
ON notifications (notification_type, createdAt DESC, studentID);
```

## Stage 4

Fetching notifications on every page load for every student will overload the database. The first improvement is a short-lived cache keyed by student and filter.

Strategy:

- Cache the first page of notifications and unread count in Redis for 30 to 60 seconds.
- Invalidate the student's cache when a new notification is created or a notification is marked as read.
- Keep the database as the source of truth.

Tradeoffs:

- Reads become much faster and database load drops.
- Users can briefly see stale data if invalidation fails or the TTL has not expired.
- Redis adds an operational dependency but is simpler and safer than pushing every page load to PostgreSQL.

## Stage 5

The original `notify_all` pseudocode is unreliable because email, database writes, and in-app pushes happen synchronously in one loop. If email fails at student 200, the remaining students may never receive the notification.

Revised approach:

```text
function notify_all(student_ids, message):
  notification_batch_id = save_batch(message)

  for student_id in student_ids:
    queue.enqueue("create_notification", {
      notification_batch_id,
      student_id,
      message
    })

worker create_notification(job):
  save_notification(job.student_id, job.message)
  queue.enqueue("send_email", job)
  queue.enqueue("push_in_app", job)

worker send_email(job):
  retry_with_backoff(() => send_email(job.student_id, job.message))

worker push_in_app(job):
  retry_with_backoff(() => push_to_app(job.student_id, job.message))
```

Saving to the database should happen independently from email delivery. Email should be retried with backoff and dead-letter handling, while the in-app notification can be available immediately.

## Stage 6

The Priority Inbox ranks notifications by:

1. Type weight: `Placement = 3`, `Result = 2`, `Event = 1`
2. Recency: newest notification first when two notifications have the same type weight

Implemented approach:

```js
const PRIORITY_WEIGHT = { Placement: 3, Result: 2, Event: 1 };

function prioritySort(a, b) {
  const priorityDiff =
    (PRIORITY_WEIGHT[b.Type] || 0) - (PRIORITY_WEIGHT[a.Type] || 0);

  if (priorityDiff !== 0) {
    return priorityDiff;
  }

  return new Date(b.Timestamp).getTime() - new Date(a.Timestamp).getTime();
}
```

The backend exposes `GET /priority-notifications`, fetches the protected notification API, sorts the latest notification set with this comparator, and returns the top 10. To keep the top 10 efficient as new notifications arrive, the backend uses a short in-memory cache and the frontend refreshes periodically. In production, the same ranking can be maintained with a Redis sorted set or a database materialized view updated when notifications are created.

## Stage 7

The frontend runs on `http://localhost:3000` and uses the local backend proxy on port `5000` so credentials and token refresh logic are not placed in the browser bundle.

Pages:

- `/priority`: displays the top 10 priority notifications.
- `/`: displays all notifications with type filters and pagination.

Frontend behavior:

- Distinguishes new and viewed notifications with local browser state.
- Supports `All`, `Placement`, `Result`, and `Event` filters.
- Refreshes notification data every 30 seconds.
- Uses responsive CSS for desktop and mobile layouts.

Backend behavior:

- Authenticates against the evaluation service on demand instead of relying on an expiring hardcoded bearer token.
- Proxies `GET /notifications` with `limit`, `page`, and `notification_type` support.
- Proxies `GET /priority-notifications` for the Stage 6 priority inbox.
- Uses the shared logging middleware for API activity and error paths.
