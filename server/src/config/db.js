const mongoose = require('mongoose');

/**
 * Connect to MongoDB database using Mongoose
 * Reads connection URI from process.env.MONGO_URI
 */
const connectDB = async () => {
  const mongoUri = process.env.MONGO_URI;

  if (!mongoUri) {
    console.error('[Database Error] MONGO_URI environment variable is not defined.');
    throw new Error('MONGO_URI is required to establish database connection.');
  }

  try {
    const conn = await mongoose.connect(mongoUri, {
      autoIndex: true, // Build unique indexes automatically
    });

    console.log(`[Database] MongoDB Connected successfully: ${conn.connection.host}/${conn.connection.name}`);
    return conn;
  } catch (error) {
    console.error(`[Database Error] Connection failed: ${error.message}`);
    throw error;
  }
};

// Monitor connection events
mongoose.connection.on('disconnected', () => {
  console.warn('[Database Warning] MongoDB disconnected. Attempting to reconnect...');
});

mongoose.connection.on('error', (err) => {
  console.error(`[Database Error] Unexpected MongoDB error: ${err.message}`);
});

module.exports = connectDB;
