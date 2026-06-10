const express = require('express');
const axios = require('axios');
const cors = require('cors');
const { Log } = require('../logging_middleware');

const app = express();
const PORT = Number(process.env.PORT || 5000);
const EVALUATION_BASE_URL =
  process.env.EVALUATION_BASE_URL ||
  'http://4.224.186.213/evaluation-service';

const AUTH_PAYLOAD = {
  email: process.env.EVALUATION_EMAIL || 'abhinav.varshney_cs.aiml23@gla.ac.in',
  name: process.env.EVALUATION_NAME || 'abhinav varshney',
  rollNo: process.env.EVALUATION_ROLL_NO || '2315510005',
  accessCode: process.env.EVALUATION_ACCESS_CODE || 'RPsgYt',
  clientID:
    process.env.EVALUATION_CLIENT_ID ||
    'f4c30496-7cc0-4e80-afcf-6fa2e8293999',
  clientSecret:
    process.env.EVALUATION_CLIENT_SECRET ||
    'MPNHCThxmrDBGpAy',
};

const PRIORITY_WEIGHT = { Placement: 3, Result: 2, Event: 1 };
const VALID_TYPES = new Set(Object.keys(PRIORITY_WEIGHT));
const CACHE_TTL_MS = 15000;

let cachedToken = '';
let tokenExpiresAt = 0;
let notificationCache = {
  data: [],
  fetchedAt: 0,
};

app.use(cors());
app.use(express.json());

function normalizeNotification(notification) {
  return {
    ID: notification.ID || notification.id,
    Type: notification.Type || notification.type,
    Message: notification.Message || notification.message,
    Timestamp: notification.Timestamp || notification.timestamp,
  };
}

function parseExpiry(expiresIn) {
  const numeric = Number(expiresIn);
  if (!Number.isFinite(numeric)) {
    return Date.now() + 45 * 60 * 1000;
  }

  if (numeric > 1000000000) {
    return numeric * 1000;
  }

  return Date.now() + numeric * 1000;
}

async function writeLog(level, pkg, message) {
  await Log('backend', level, pkg, message, cachedToken);
}

async function getAccessToken(forceRefresh = false) {
  const usableToken = cachedToken && Date.now() < tokenExpiresAt - 60000;

  if (!forceRefresh && usableToken) {
    return cachedToken;
  }

  const response = await axios.post(`${EVALUATION_BASE_URL}/auth`, AUTH_PAYLOAD, {
    timeout: 8000,
  });

  cachedToken = response.data.access_token;
  tokenExpiresAt = parseExpiry(response.data.expires_in);
  void writeLog('info', 'auth', 'evaluation access token refreshed');

  return cachedToken;
}

async function fetchRemoteNotifications(forceRefresh = false) {
  const freshCache =
    !forceRefresh &&
    notificationCache.data.length > 0 &&
    Date.now() - notificationCache.fetchedAt < CACHE_TTL_MS;

  if (freshCache) {
    return notificationCache.data;
  }

  let token = await getAccessToken();

  try {
    const response = await axios.get(`${EVALUATION_BASE_URL}/notifications`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 8000,
    });

    notificationCache = {
      data: (response.data.notifications || []).map(normalizeNotification),
      fetchedAt: Date.now(),
    };
    void writeLog('info', 'notifications', 'notifications fetched from evaluation api');
    return notificationCache.data;
  } catch (error) {
    if (error.response && error.response.status === 401) {
      token = await getAccessToken(true);
      const retry = await axios.get(`${EVALUATION_BASE_URL}/notifications`, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 8000,
      });

      notificationCache = {
        data: (retry.data.notifications || []).map(normalizeNotification),
        fetchedAt: Date.now(),
      };
      void writeLog('warn', 'notifications', 'notifications refetched after token refresh');
      return notificationCache.data;
    }

    void writeLog('error', 'notifications', 'failed to fetch notifications');
    throw error;
  }
}

function prioritySort(a, b) {
  const priorityDiff =
    (PRIORITY_WEIGHT[b.Type] || 0) - (PRIORITY_WEIGHT[a.Type] || 0);

  if (priorityDiff !== 0) {
    return priorityDiff;
  }

  return new Date(b.Timestamp).getTime() - new Date(a.Timestamp).getTime();
}

function countByType(notifications) {
  return notifications.reduce(
    (counts, notification) => ({
      ...counts,
      [notification.Type]: (counts[notification.Type] || 0) + 1,
    }),
    { All: notifications.length, Placement: 0, Result: 0, Event: 0 }
  );
}

function readPositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

app.get('/', async (req, res) => {
  void writeLog('info', 'health', 'health check requested');
  res.json({ message: 'Backend is running' });
});

app.get('/health', async (req, res) => {
  res.json({
    ok: true,
    cacheAgeMs: notificationCache.fetchedAt
      ? Date.now() - notificationCache.fetchedAt
      : null,
  });
});

app.get('/notifications', async (req, res) => {
  try {
    const page = readPositiveInt(req.query.page, 1);
    const limit = Math.min(readPositiveInt(req.query.limit, 10), 10);
    const requestedType = req.query.notification_type;
    const notificationType = VALID_TYPES.has(requestedType)
      ? requestedType
      : null;

    const notifications = await fetchRemoteNotifications(
      req.query.refresh === 'true'
    );
    const filtered = notificationType
      ? notifications.filter((notification) => notification.Type === notificationType)
      : notifications;
    const start = (page - 1) * limit;
    const paginated = filtered.slice(start, start + limit);

    void writeLog('info', 'notifications', 'paginated notifications served');
    res.json({
      notifications: paginated,
      total: filtered.length,
      page,
      limit,
      counts: countByType(notifications),
      fetchedAt: new Date(notificationCache.fetchedAt).toISOString(),
    });
  } catch (error) {
    res.status(502).json({
      error: 'Unable to fetch notifications right now',
      detail: error.response?.data?.message || error.message,
    });
  }
});

app.get('/priority-notifications', async (req, res) => {
  try {
    const notifications = await fetchRemoteNotifications(
      req.query.refresh === 'true'
    );
    const top10 = [...notifications].sort(prioritySort).slice(0, 10);

    void writeLog('info', 'priority', 'priority notifications served');
    res.json({
      total: notifications.length,
      top10,
      fetchedAt: new Date(notificationCache.fetchedAt).toISOString(),
    });
  } catch (error) {
    res.status(502).json({
      error: 'Unable to fetch priority notifications right now',
      detail: error.response?.data?.message || error.message,
    });
  }
});

app.post('/notify', async (req, res) => {
  const { title, message } = req.body;

  if (!title || !message) {
    void writeLog('error', 'handler', 'notification request missing fields');
    return res.status(400).json({ error: 'title and message required' });
  }

  void writeLog('info', 'handler', `notification accepted: ${title}`);
  return res.json({ success: true, title, message });
});

app.listen(PORT, () => {
  process.stdout.write(`Backend running on port ${PORT}\n`);
});
