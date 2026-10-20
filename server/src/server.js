const dotenv = require('dotenv');
const path = require('path');

// Load environment variables before any other imports
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const app = require('./app');
const connectDB = require('./config/db');

// ==========================================
// 1. Validate Critical Environment Variables
// ==========================================

const validateEnvironment = () => {
  const missingVars = [];

  if (!process.env.MONGO_URI) {
    missingVars.push('MONGO_URI');
  }

  if (!process.env.JWT_SECRET) {
    missingVars.push('JWT_SECRET');
  } else if (
    process.env.NODE_ENV === 'production' &&
    (process.env.JWT_SECRET === 'replace_with_a_long_random_secret' ||
      process.env.JWT_SECRET.length < 32)
  ) {
    console.error('[Configuration Error] JWT_SECRET is too weak or using default placeholder in production.');
    process.exit(1);
  }

  if (missingVars.length > 0) {
    console.error(
      `[Configuration Error] Missing required environment variables: ${missingVars.join(', ')}`
    );
    console.error('Please configure your .env file before starting the server.');
    process.exit(1);
  }
};

validateEnvironment();

const PORT = parseInt(process.env.PORT, 10) || 5000;

// ==========================================
// 2. Start Server After DB Connection
// ==========================================

let server;

const startServer = async () => {
  try {
    // Connect to database first
    console.log('[TaskFlow Server] Connecting to database...');
    await connectDB();

    // Start listening only after database connection is verified
    server = app.listen(PORT, () => {
      console.log(`==============================================`);
      console.log(`🚀 TaskFlow Server is running on port ${PORT}`);
      console.log(`📡 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🩺 Health check: http://localhost:${PORT}/api/health`);
      console.log(`🔑 Auth endpoints: http://localhost:${PORT}/api/auth`);
      console.log(`==============================================`);
    });
  } catch (error) {
    console.error(`[TaskFlow Server] Failed to initialize server: ${error.message}`);
    process.exit(1);
  }
};

// Graceful shutdown handlers
const handleShutdown = (signal) => {
  console.log(`\n[TaskFlow Server] Received ${signal}. Gracefully shutting down...`);
  if (server) {
    server.close(() => {
      console.log('[TaskFlow Server] HTTP server closed.');
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
};

process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));

startServer();
