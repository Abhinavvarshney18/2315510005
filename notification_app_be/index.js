const express = require('express');
const app = express();
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ message: 'Backend is running' });
});

app.post('/notify', (req, res) => {
  const { title, message } = req.body;
  if (!title || !message) {
    return res.status(400).json({ error: 'title and message required' });
  }
  res.json({ success: true, title, message });
});

app.listen(3000, () => {
  console.log('Server running on port 3000');
});
