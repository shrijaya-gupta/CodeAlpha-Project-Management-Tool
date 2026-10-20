const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/authRoutes');
const projectRoutes = require('./routes/projectRoutes');
const taskRoutes = require('./routes/taskRoutes');
const { notFoundHandler, errorHandler } = require('./middleware/errorMiddleware');

const app = express();

// ==========================================
// 1. Core Security & Parsing Middleware
// ==========================================

// Configure CORS using permitted frontend origin from environment
const permittedOrigin = process.env.FRONTEND_URL || process.env.CLIENT_URL || 'http://localhost:5173';
app.use(
  cors({
    origin: permittedOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// Body parsing with safe size limit
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// ==========================================
// 2. Health Check Endpoint
// ==========================================

app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'TaskFlow API is running smoothly',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
  });
});

// ==========================================
// 3. Application API Routes
// ==========================================

app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/tasks', taskRoutes);

// ==========================================
// 4. Centralized Error Handling
// ==========================================

// Handle 404 for undefined routes
app.use(notFoundHandler);

// Handle application errors
app.use(errorHandler);

module.exports = app;
