const express = require('express');
const tripRoutes = require('./routes/tripRoutes');
const { metricsMiddleware } = require('./middleware/metrics');
const { getMetricsSnapshot, getPrometheusMetrics } = require('./metrics/serviceMetrics');

const app = express();
app.use(express.json());
app.use(metricsMiddleware);

app.use('/v1/trips', tripRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'Trip Service is running' });
});

app.get('/metrics', (req, res) => {
  res.json(getMetricsSnapshot());
});

app.get('/metrics/prometheus', (req, res) => {
  res.type('text/plain').send(getPrometheusMetrics());
});

module.exports = app;
