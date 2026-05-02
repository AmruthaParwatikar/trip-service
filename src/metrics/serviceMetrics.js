const os = require('os');

const serviceName = process.env.SERVICE_NAME || 'trip-service';

const requestMetrics = {
  startedAt: new Date().toISOString(),
  totalRequestsStarted: 0,
  totalRequestsCompleted: 0,
  activeRequests: 0,
  totalResponseTimeMs: 0,
  maxResponseTimeMs: 0,
  lastResponseTimeMs: 0,
  statusCodes: {},
  routes: {}
};

function round(value) {
  return Number(Number(value || 0).toFixed(2));
}

function beginRequest(method, path) {
  if (path === '/metrics' || path === '/metrics/prometheus') {
    return () => {};
  }

  requestMetrics.totalRequestsStarted += 1;
  requestMetrics.activeRequests += 1;
  const routeKey = `${method} ${path || '/'}`;
  const startedAt = process.hrtime.bigint();
  let completed = false;

  return (statusCode) => {
    if (completed) return;
    completed = true;

    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    const routeMetrics = requestMetrics.routes[routeKey] || {
      count: 0,
      totalResponseTimeMs: 0,
      maxResponseTimeMs: 0,
      lastResponseTimeMs: 0,
      lastStatusCode: null,
      statusCodes: {}
    };

    requestMetrics.activeRequests -= 1;
    requestMetrics.totalRequestsCompleted += 1;
    requestMetrics.totalResponseTimeMs += durationMs;
    requestMetrics.maxResponseTimeMs = Math.max(requestMetrics.maxResponseTimeMs, durationMs);
    requestMetrics.lastResponseTimeMs = durationMs;
    requestMetrics.statusCodes[statusCode] = (requestMetrics.statusCodes[statusCode] || 0) + 1;

    routeMetrics.count += 1;
    routeMetrics.totalResponseTimeMs += durationMs;
    routeMetrics.maxResponseTimeMs = Math.max(routeMetrics.maxResponseTimeMs, durationMs);
    routeMetrics.lastResponseTimeMs = durationMs;
    routeMetrics.lastStatusCode = statusCode;
    routeMetrics.statusCodes[statusCode] = (routeMetrics.statusCodes[statusCode] || 0) + 1;
    requestMetrics.routes[routeKey] = routeMetrics;
  };
}

function getCpuMetrics() {
  const cpuUsage = process.cpuUsage();
  const cpuCount = typeof os.availableParallelism === 'function'
    ? os.availableParallelism()
    : os.cpus().length || 1;
  const totalCpuMs = (cpuUsage.user + cpuUsage.system) / 1000;
  const possibleCpuMs = process.uptime() * 1000 * cpuCount;

  return {
    cores: cpuCount,
    user_ms: round(cpuUsage.user / 1000),
    system_ms: round(cpuUsage.system / 1000),
    total_ms: round(totalCpuMs),
    utilization_percentage: round(possibleCpuMs > 0 ? (totalCpuMs / possibleCpuMs) * 100 : 0),
    load_average: os.loadavg().map(round)
  };
}

function getMemoryMetrics() {
  const memoryUsage = process.memoryUsage();
  return {
    rss_bytes: memoryUsage.rss,
    heap_total_bytes: memoryUsage.heapTotal,
    heap_used_bytes: memoryUsage.heapUsed,
    external_bytes: memoryUsage.external,
    array_buffers_bytes: memoryUsage.arrayBuffers
  };
}

function getRouteMetricsSnapshot() {
  return Object.fromEntries(Object.entries(requestMetrics.routes).map(([route, metrics]) => [
    route,
    {
      count: metrics.count,
      average_response_time_ms: round(metrics.totalResponseTimeMs / metrics.count),
      max_response_time_ms: round(metrics.maxResponseTimeMs),
      last_response_time_ms: round(metrics.lastResponseTimeMs),
      last_status_code: metrics.lastStatusCode,
      status_codes: metrics.statusCodes
    }
  ]));
}

function getMetricsSnapshot() {
  const averageResponseTimeMs = requestMetrics.totalRequestsCompleted > 0
    ? requestMetrics.totalResponseTimeMs / requestMetrics.totalRequestsCompleted
    : 0;

  return {
    health: {
      status: 'ok',
      service: serviceName,
      started_at: requestMetrics.startedAt,
      timestamp: new Date().toISOString()
    },
    uptime_seconds: round(process.uptime()),
    cpu: getCpuMetrics(),
    memory: getMemoryMetrics(),
    response_time: {
      total_requests_started: requestMetrics.totalRequestsStarted,
      total_requests_completed: requestMetrics.totalRequestsCompleted,
      active_requests: requestMetrics.activeRequests,
      average_response_time_ms: round(averageResponseTimeMs),
      max_response_time_ms: round(requestMetrics.maxResponseTimeMs),
      last_response_time_ms: round(requestMetrics.lastResponseTimeMs),
      status_codes: requestMetrics.statusCodes,
      by_route: getRouteMetricsSnapshot()
    }
  };
}

function escapeLabelValue(value) {
  return String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\n', '\\n');
}

function metricLine(name, value, labels = {}) {
  const entries = Object.entries(labels);
  const normalizedValue = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  if (entries.length === 0) return `${name} ${normalizedValue}`;
  return `${name}{${entries.map(([key, labelValue]) => `${key}="${escapeLabelValue(labelValue)}"`).join(',')}} ${normalizedValue}`;
}

function metricPrefix() {
  return serviceName.replace(/[^a-zA-Z0-9]/g, '_');
}

function getPrometheusMetrics() {
  const metrics = getMetricsSnapshot();
  const prefix = metricPrefix();
  const lines = [
    `# HELP ${prefix}_up Service health status.`,
    `# TYPE ${prefix}_up gauge`,
    metricLine(`${prefix}_up`, 1, { service: serviceName }),
    `# HELP ${prefix}_uptime_seconds Process uptime in seconds.`,
    `# TYPE ${prefix}_uptime_seconds gauge`,
    metricLine(`${prefix}_uptime_seconds`, metrics.uptime_seconds, { service: serviceName }),
    `# HELP ${prefix}_cpu_utilization_percentage Approximate CPU utilization percentage.`,
    `# TYPE ${prefix}_cpu_utilization_percentage gauge`,
    metricLine(`${prefix}_cpu_utilization_percentage`, metrics.cpu.utilization_percentage, { service: serviceName }),
    `# HELP ${prefix}_cpu_time_ms_total Total process CPU time in milliseconds.`,
    `# TYPE ${prefix}_cpu_time_ms_total counter`,
    metricLine(`${prefix}_cpu_time_ms_total`, metrics.cpu.user_ms, { service: serviceName, mode: 'user' }),
    metricLine(`${prefix}_cpu_time_ms_total`, metrics.cpu.system_ms, { service: serviceName, mode: 'system' }),
    `# HELP ${prefix}_memory_bytes Process memory usage in bytes.`,
    `# TYPE ${prefix}_memory_bytes gauge`,
    metricLine(`${prefix}_memory_bytes`, metrics.memory.rss_bytes, { service: serviceName, area: 'rss' }),
    metricLine(`${prefix}_memory_bytes`, metrics.memory.heap_used_bytes, { service: serviceName, area: 'heap_used' }),
    `# HELP ${prefix}_requests_total Total completed HTTP requests.`,
    `# TYPE ${prefix}_requests_total counter`,
    metricLine(`${prefix}_requests_total`, metrics.response_time.total_requests_completed, { service: serviceName }),
    `# HELP ${prefix}_active_requests Active HTTP requests.`,
    `# TYPE ${prefix}_active_requests gauge`,
    metricLine(`${prefix}_active_requests`, metrics.response_time.active_requests, { service: serviceName }),
    `# HELP ${prefix}_response_time_ms HTTP response time in milliseconds.`,
    `# TYPE ${prefix}_response_time_ms gauge`,
    metricLine(`${prefix}_response_time_ms`, metrics.response_time.average_response_time_ms, {
      service: serviceName,
      aggregation: 'average'
    })
  ];

  for (const [status, count] of Object.entries(metrics.response_time.status_codes)) {
    lines.push(metricLine(`${prefix}_response_status_total`, count, { service: serviceName, status }));
  }

  for (const [route, routeMetrics] of Object.entries(metrics.response_time.by_route)) {
    lines.push(metricLine(`${prefix}_route_requests_total`, routeMetrics.count, { service: serviceName, route }));
    lines.push(metricLine(`${prefix}_route_response_time_ms`, routeMetrics.average_response_time_ms, {
      service: serviceName,
      route,
      aggregation: 'average'
    }));
    for (const [status, count] of Object.entries(routeMetrics.status_codes)) {
      lines.push(metricLine(`${prefix}_route_response_status_total`, count, { service: serviceName, route, status }));
    }
  }

  return `${lines.join('\n')}\n`;
}

module.exports = {
  beginRequest,
  getMetricsSnapshot,
  getPrometheusMetrics
};
