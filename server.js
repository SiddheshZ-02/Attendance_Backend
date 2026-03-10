const express = require('express');
const cors = require('cors');
const connectDB = require('./config/database');
require('dotenv').config();

const authRoutes = require('./routes/authRoutes');
const attendanceRoutes = require('./routes/attendanceRoutes');
const adminRoutes = require('./routes/adminRoutes');
const leaveRoutes = require('./routes/leaveRoutes');
const ownerRoutes = require('./routes/ownerRoutes');

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

app.use('/api/auth', authRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/leave', leaveRoutes);
app.use('/api/owner', ownerRoutes);

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
      leave: '/api/leave'
    }
  });
});

app.use((req, res, next) => {
  if (req.path.startsWith('/api/') && !req.path.match(/^\/api\/(auth|attendance|admin|leave|owner|health)/)) {
    return res.status(404).json({ message: 'API endpoint not found' });
  }
  next();
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
