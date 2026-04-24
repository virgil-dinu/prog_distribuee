const express = require('express');
const { Pool } = require('pg');
const axios = require('axios');

const app = express();
app.use(express.json());

const pool = new Pool({
  host: process.env.DB_HOST || 'postgres',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

const NOTIFICATION_URL = process.env.NOTIFICATION_URL || 'http://notification-service:4000';

async function initDB() {
  let retries = 15;
  while (retries > 0) {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS tasks (
          id SERIAL PRIMARY KEY,
          title VARCHAR(255) NOT NULL,
          status VARCHAR(50) DEFAULT 'pending',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('DB initialized');
      return;
    } catch (err) {
      console.log(`DB not ready (${retries} retries left):`, err.message);
      retries--;
      await new Promise(r => setTimeout(r, 3000));
    }
  }
  console.error('DB init failed after retries');
}

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'task-service' }));

app.get('/api/tasks', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM tasks ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/tasks/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM tasks WHERE id=$1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/tasks', async (req, res) => {
  const { title } = req.body;
  if (!title) return res.status(400).json({ error: 'title required' });
  try {
    const result = await pool.query(
      'INSERT INTO tasks (title) VALUES ($1) RETURNING *',
      [title]
    );
    const task = result.rows[0];
    axios.post(`${NOTIFICATION_URL}/api/notifications`, {
      event: 'task.created',
      taskId: task.id,
      title: task.title
    }).catch(e => console.error('Notification call failed:', e.message));
    res.status(201).json(task);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/tasks/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM tasks WHERE id=$1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'not found' });
    axios.post(`${NOTIFICATION_URL}/api/notifications`, {
      event: 'task.deleted',
      taskId: parseInt(req.params.id, 10)
    }).catch(e => console.error('Notification call failed:', e.message));
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`task-service listening on ${PORT}`);
  await initDB();
});
