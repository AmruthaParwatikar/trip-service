const { beginRequest } = require('../metrics/serviceMetrics');

function metricsMiddleware(req, res, next) {
  const completeRequest = beginRequest(req.method, req.path);
  res.on('finish', () => completeRequest(res.statusCode));
  next();
}

module.exports = { metricsMiddleware };
