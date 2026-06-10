const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

const TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJNYXBDbGFpbXMiOnsiYXVkIjoiaHR0cDovLzIwLjI0NC41Ni4xNDQvZXZhbHVhdGlvbi1zZXJ2aWNlIiwiZW1haWwiOiJhYmhpbmF2LnZhcnNobmV5X2NzLmFpbWwyM0BnbGEuYWMuaW4iLCJleHAiOjE3ODEwNzYxMzcsImlhdCI6MTc4MTA3NTIzNywiaXNzIjoiQWZmb3JkIE1lZGljYWwgVGVjaG5vbG9naWVzIFByaXZhdGUgTGltaXRlZCIsImp0aSI6IjY4OTZmODljLTQwNDEtNDBmYS1hNDBkLTFmYjZiZWE1NDNiYiIsImxvY2FsZSI6ImVuLUlOIiwibmFtZSI6ImFiaGluYXYgdmFyc2huZXkiLCJzdWIiOiJmNGMzMDQ5Ni03Y2MwLTRlODAtYWZjZi02ZmEyZTgyOTM5OTkifSwiZW1haWwiOiJhYmhpbmF2LnZhcnNobmV5X2NzLmFpbWwyM0BnbGEuYWMuaW4iLCJuYW1lIjoiYWJoaW5hdiB2YXJzaG5leSIsInJvbGxObyI6IjIzMTU1MTAwMDUiLCJhY2Nlc3NDb2RlIjoiUlBzZ1l0IiwiY2xpZW50SUQiOiJmNGMzMDQ5Ni03Y2MwLTRlODAtYWZjZi02ZmEyZTgyOTM5OTkiLCJjbGllbnRTZWNyZXQiOiJNUE5IQ1RoeG1yREJHcEF5In0.aPNcF0Wgdhd_qZQz9Hh48MQH_3CCuWPeDUdo8QnBUt4";
const PRIORITY = { Placement: 3, Result: 2, Event: 1 };

app.get('/', (req, res) => {
  res.json({ message: 'Backend is running' });
});

app.get('/priority-notifications', async (req, res) => {
  try {
    const response = await axios.get(
      'http://4.224.186.213/evaluation-service/notifications',
      { headers: { Authorization: 'Bearer ' + TOKEN } }
    );
    const notifications = response.data.notifications;
    const sorted = notifications.sort((a, b) => {
      const pd = (PRIORITY[b.Type] || 0) - (PRIORITY[a.Type] || 0);
      if (pd !== 0) return pd;
      return new Date(b.Timestamp) - new Date(a.Timestamp);
    });
    const top10 = sorted.slice(0, 10);
    res.json({ total: notifications.length, top10 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(3000, () => console.log('Server running on port 3000'));
