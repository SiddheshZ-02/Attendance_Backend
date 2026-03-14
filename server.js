require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/database');

const authRoutes = require('./routes/authRoutes');
const attendanceRoutes = require('./routes/attendanceRoutes');
const adminRoutes = require('./routes/adminRoutes');
const leaveRoutes = require('./routes/leaveRoutes');
const ownerRoutes = require('./routes/ownerRoutes');
const activityRoutes = require('./routes/activityRoutes');
const holidayRoutes = require('./routes/holidayRoutes');

// Initialize express app
const app = express();

// Connect to MongoDB
connectDB();

// Basic Security and CORS
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10mb' })); // Set body size limit
app.use(express.urlencoded({ extended: true, limit: '10mb' })); // Set URL encoded limit

// ─── TEMP DEBUG LOGGING ───
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  if (req.method === 'POST') {
    console.log('Body:', JSON.stringify(req.body, null, 2));
  }
  next();
});

app.use('/api/auth', authRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/holidays', holidayRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/leave', leaveRoutes);
app.use('/api/owner', ownerRoutes);
app.use('/api/activity', activityRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Attendance API Server is running',
    timestamp: new Date().toISOString()
  });
});

// Root endpoint
app.get('/api', (req, res) => {
  res.json({ 
    message: 'Employee Attendance System API',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth',
      attendance: '/api/attendance',
      admin: '/api/admin',
      leave: '/api/leave',
      activity: '/api/activity',
      holidays: '/api/holidays'
    }
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: 'Something went wrong',
    code: 'SERVER_ERROR'
  });
});

const PORT = process.env.PORT || 8001;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
  console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
});
