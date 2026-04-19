const express = require('express');
const tripRoutes = require('./routes/tripRoutes');

const app = express();
app.use(express.json());

app.use('/v1/trips', tripRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'Trip Service is running' });
});

module.exports = app;