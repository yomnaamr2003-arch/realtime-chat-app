require('dotenv').config();

const path = require('path');
const http = require('http');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const { Server } = require('socket.io');

const authRoutes = require('./src/routes/auth');
const userRoutes = require('./src/routes/users');
const conversationRoutes = require('./src/routes/conversations');
const notificationRoutes = require('./src/routes/notifications');
const messagesRouteFactory = require('./src/routes/messages');
const { registerSocketHandlers } = require('./src/sockets');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: process.env.CORS_ORIGIN || '*' },
});

// --- Core middleware ---
app.use(
  helmet({
    contentSecurityPolicy: false, // relaxed for the bundled static demo frontend
  })
);
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// --- Health check (used by deployment platforms + rollback verification) ---
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
});

// --- API routes ---
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/messages', messagesRouteFactory(io));

// --- Fallback to the SPA shell for any non-API GET request ---
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- Central error handler ---
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error.' });
});

// --- Real-time layer ---
registerSocketHandlers(io);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Chat server listening on http://localhost:${PORT}`);
});

module.exports = { app, server, io };
