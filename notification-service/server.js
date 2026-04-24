const express = require('express');
const app = express();
app.use(express.json());

const notifications = [];
const MAX = 200;

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'notification-service' }));

app.get('/api/notifications', (req, res) => {
  res.json(notifications.slice(-50).reverse());
});

app.post('/api/notifications', (req, res) => {
  const notif = { ...req.body, receivedAt: new Date().toISOString() };
  notifications.push(notif);
  if (notifications.length > MAX) notifications.shift();
  console.log('Notification reçue:', notif);
  res.status(201).json(notif);
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`notification-service listening on ${PORT}`));
