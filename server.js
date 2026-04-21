require('dotenv').config();
// Validates JWT_SECRET + REFRESH_TOKEN_SECRET before the app loads route modules.
require('./config/authSecrets');

const express = require('express');
const cors = require('cors');
const path = require('path');
const connectDB = require('./config/database');

const authRoutes = require('./routes/authRoutes');
const attendanceRoutes = require('./routes/attendanceRoutes');
const adminRoutes = require('./routes/adminRoutes');
const leaveRoutes = require('./routes/leaveRoutes');
const ownerRoutes = require('./routes/ownerRoutes');
const activityRoutes = require('./routes/activityRoutes');
const holidayRoutes = require('./routes/holidayRoutes');

const { expireLeavesJob } = require('./controllers/leaveController');

// Initialize express app
const app = express();

// Connect to MongoDB
connectDB();

// CORS: `origin: '*'` is typical for a mobile-only API (React Native does not send browser Origin).
// If you add a browser SPA to this API, replace with an allowlist, e.g. origin: ['https://app.example.com'].
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/leave', leaveRoutes); 
app.use('/api/holidays', holidayRoutes);
app.use('/api/admin', adminRoutes);
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
    version: '1.0.0'
  });
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found on this server`,
    code: 'NOT_FOUND'
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
  
  // Start the expiry job (runs once on startup, then every 24 hours)
  expireLeavesJob();
  setInterval(expireLeavesJob, 24 * 60 * 60 * 1000);
});
