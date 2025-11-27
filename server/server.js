const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve Static Files (Frontend) from Parent Directory
// This allows accessing pyq.html, pyq.js, pyq.css, etc.
app.use(express.static(path.join(__dirname, '../')));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/papers', require('./routes/papers'));

// Serve pyq.html for root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../pyq.html'));
});

// Bind to 0.0.0.0 to allow access from other devices (like phone)
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Access locally: http://localhost:${PORT}`);
});
