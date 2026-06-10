# Notification System Design

## Stage 1

### REST API Endpoints

#### 1. Get All Notifications
- **Method:** GET
- **Endpoint:** /api/notifications
- **Headers:** Authorization: Bearer <token>
- **Response:**
`json
{
  "notifications": [
    {
      "id": "uuid",
      "type": "Event|Result|Placement",
      "message": "string",
      "isRead": false,
      "timestamp": "2024-01-01T00:00:00Z"
    }
  ]
}
`

#### 2. Mark Notification as Read
- **Method:** PATCH
- **Endpoint:** /api/notifications/:id/read
- **Headers:** Authorization: Bearer <token>
- **Response:**
`json
{ "success": true, "message": "Notification marked as read" }
`

#### 3. Get Unread Count
- **Method:** GET
- **Endpoint:** /api/notifications/unread-count
- **Response:**
`json
{ "unreadCount": 5 }
`

### Real-time Notifications
- Use **WebSockets** (Socket.io) for real-time delivery
- Server emits event on new notification
- Client listens and updates UI instantly

## Stage 2

### Database Choice: PostgreSQL
PostgreSQL choose kiya kyunki:
- ACID compliant - data integrity guaranteed
- JSON support for flexible notification metadata
- Better for complex queries and joins
- Scales well with indexes

### DB Schema

`sql
CREATE TABLE students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES students(id),
  type VARCHAR(50) CHECK (type IN ('Event', 'Result', 'Placement')),
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);
`

### REST API Queries

`sql
-- Get all notifications for a student
SELECT * FROM notifications 
WHERE student_id =  
ORDER BY created_at DESC;

-- Mark as read
UPDATE notifications 
SET is_read = true 
WHERE id = ;

-- Get unread count
SELECT COUNT(*) FROM notifications 
WHERE student_id =  AND is_read = false;
`

### Scaling Problems & Solutions
- **Problem:** As data grows, queries slow down
- **Solution:** Add indexes on student_id and created_at
- **Problem:** Too many connections
- **Solution:** Use connection pooling (pg-pool)

## Stage 2

### Database Choice: PostgreSQL
PostgreSQL choose kiya kyunki:
- ACID compliant - data integrity guaranteed
- JSON support for flexible notification metadata
- Better for complex queries and joins
- Scales well with indexes

### DB Schema

`sql
CREATE TABLE students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES students(id),
  type VARCHAR(50) CHECK (type IN ('Event', 'Result', 'Placement')),
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);
`

### REST API Queries

`sql
-- Get all notifications for a student
SELECT * FROM notifications 
WHERE student_id =  
ORDER BY created_at DESC;

-- Mark as read
UPDATE notifications 
SET is_read = true 
WHERE id = ;

-- Get unread count
SELECT COUNT(*) FROM notifications 
WHERE student_id =  AND is_read = false;
`

### Scaling Problems & Solutions
- **Problem:** As data grows, queries slow down
- **Solution:** Add indexes on student_id and created_at
- **Problem:** Too many connections
- **Solution:** Use connection pooling (pg-pool)

## Stage 3

### Slow Query Analysis
Original query:
SELECT * FROM notifications WHERE studentID = 1042 AND isRead = false ORDER BY createdAt ASC;

**Why it is slow:**
- No index on studentID, isRead, createdAt
- SELECT * fetches all columns unnecessarily
- 5 million rows = full table scan

**Fix:**
CREATE INDEX idx_notifications_student_read ON notifications(studentID, isRead, createdAt);

**Adding indexes on every column is BAD** because:
- Slows down INSERT/UPDATE/DELETE
- Wastes disk space
- Only index columns used in WHERE/ORDER BY

**Students with Placement notification in last 7 days:**
SELECT DISTINCT studentID FROM notifications
WHERE notification_type = 'Placement'
AND createdAt >= NOW() - INTERVAL '7 days';

## Stage 4

### Performance Solution: Caching with Redis

**Problem:** DB hit on every page load for 50,000 students

**Solution:** Cache notifications in Redis with TTL

**Strategy:**
- On first load: fetch from DB, store in Redis with 60s TTL
- On subsequent loads: serve from Redis cache
- On new notification: invalidate cache for that student

**Tradeoffs:**
- Pro: Very fast reads, reduces DB load
- Con: Slight staleness (up to 60s), extra infrastructure cost

## Stage 5

### Bulk Notification Problem

**Shortcomings of original implementation:**
- send_email is synchronous - if it fails at student 200, remaining 49800 dont get notified
- No retry mechanism
- Saving to DB and sending email in same flow - if DB fails, email already sent

**Revised Approach: Queue-based system**

Use a message queue (like Bull/Redis):
1. Push all student_ids to queue
2. Workers process each job independently
3. Failed jobs are retried automatically
4. DB save and email are separate jobs

**Revised Pseudocode:**
function notify_all(student_ids, message):
  for student_id in student_ids:
    queue.add('send_notification', { student_id, message })

worker.process('send_notification', async (job):
  save_to_db(job.student_id, job.message)
  send_email(job.student_id, job.message)
  push_to_app(job.student_id, job.message)
)

## Stage 3

### Slow Query Analysis
Original query:
SELECT * FROM notifications WHERE studentID = 1042 AND isRead = false ORDER BY createdAt ASC;

**Why it is slow:**
- No index on studentID, isRead, createdAt
- SELECT * fetches all columns unnecessarily
- 5 million rows = full table scan

**Fix:**
CREATE INDEX idx_notifications_student_read ON notifications(studentID, isRead, createdAt);

**Adding indexes on every column is BAD** because:
- Slows down INSERT/UPDATE/DELETE
- Wastes disk space
- Only index columns used in WHERE/ORDER BY

**Students with Placement notification in last 7 days:**
SELECT DISTINCT studentID FROM notifications
WHERE notification_type = 'Placement'
AND createdAt >= NOW() - INTERVAL '7 days';

## Stage 4

### Performance Solution: Caching with Redis

**Problem:** DB hit on every page load for 50,000 students

**Solution:** Cache notifications in Redis with TTL

**Strategy:**
- On first load: fetch from DB, store in Redis with 60s TTL
- On subsequent loads: serve from Redis cache
- On new notification: invalidate cache for that student

**Tradeoffs:**
- Pro: Very fast reads, reduces DB load
- Con: Slight staleness (up to 60s), extra infrastructure cost

## Stage 5

### Bulk Notification Problem

**Shortcomings of original implementation:**
- send_email is synchronous - if it fails at student 200, remaining 49800 dont get notified
- No retry mechanism
- Saving to DB and sending email in same flow - if DB fails, email already sent

**Revised Approach: Queue-based system**

Use a message queue (like Bull/Redis):
1. Push all student_ids to queue
2. Workers process each job independently
3. Failed jobs are retried automatically
4. DB save and email are separate jobs

**Revised Pseudocode:**
function notify_all(student_ids, message):
  for student_id in student_ids:
    queue.add('send_notification', { student_id, message })

worker.process('send_notification', async (job):
  save_to_db(job.student_id, job.message)
  send_email(job.student_id, job.message)
  push_to_app(job.student_id, job.message)
)
