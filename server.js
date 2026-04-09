require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3470;
const API_KEY = process.env.APPGROWTH_API_KEY;
const BI2_URL = 'https://app.appgrowth.com/bi2/';

// Cache configuration
let cachedData = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Q2 2026 constants
const Q2_START = new Date('2026-04-01T00:00:00');
const Q2_END = new Date('2026-06-30T23:59:59');
const Q2_DAYS = 91;
const TARGET_PROFIT = 110000;
const ROLE_QUERY = "(role='revenue_ops' OR role='competitors')";

// Utility: sanitize NaN/Infinity from BI2 JSON
function sanitizeJSON(text) {
  return text
    .replace(/-Infinity/g, 'null')
    .replace(/Infinity/g, 'null')
    .replace(/NaN/g, 'null');
}

function sanitizeValue(val) {
  if (val === null || val === undefined || isNaN(val)) return 0;
  return Number(val);
}

function extractRows(data) {
  return data.rows || data.data || (Array.isArray(data) ? data : []);
}

// "Nd" offset from today for a given date
function dayOffsetFromDate(date) {
  const now = new Date();
  now.setHours(12, 0, 0, 0);
  const target = new Date(date);
  target.setHours(12, 0, 0, 0);
  const diffMs = now - target;
  return `${Math.round(diffMs / (1000 * 60 * 60 * 24))}d`;
}

function q2StartOff() { return dayOffsetFromDate(Q2_START); }
function q2EndOff() {
  const now = new Date();
  if (now > Q2_END) return dayOffsetFromDate(Q2_END);
  return '0d';
}

function getDaysElapsed() {
  const now = new Date();
  const endRef = now > Q2_END ? Q2_END : now;
  return Math.max(1, Math.floor((endRef - Q2_START) / (1000 * 60 * 60 * 24)));
}

// Fetch from BI2 API (same pattern as Q1 dashboard)
async function appgrowthFetch(body) {
  console.log(`[BI2] POST ${JSON.stringify(body)}`);
  const res = await fetch(BI2_URL, {
    method: 'POST',
    headers: {
      'Authorization': API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const raw = await res.text();
  if (!res.ok) throw new Error(`BI2 API ${res.status}: ${raw.slice(0, 300)}`);
  return JSON.parse(sanitizeJSON(raw));
}

// Fetch data from BI2 API
async function fetchBI2Data() {
  const [dailyData, bundleData] = await Promise.all([
    // Daily profit data
    appgrowthFetch({
      start: q2StartOff(),
      end: q2EndOff(),
      by: ['time_1d'],
      measures: ['profit', 'revenue', 'gross_spend'],
      date_column: 'bid_timestamp',
      query: ROLE_QUERY,
    }),
    // Bundle breakdown
    appgrowthFetch({
      start: q2StartOff(),
      end: q2EndOff(),
      by: ['payload__tag'],
      measures: ['profit'],
      date_column: 'bid_timestamp',
      query: ROLE_QUERY,
    }),
  ]);
  return { dailyData, bundleData };
}

// Process and format data
function processData(dailyData, bundleData) {
  const dailyRows = extractRows(dailyData);
  const bundleRows = extractRows(bundleData);

  // Process daily data — BI2 returns time_1d as Date strings; normalize to YYYY-MM-DD
  const dailyProfit = dailyRows.map(row => {
    let d = row.time_1d || '';
    if (d && d.includes(',')) {
      // Full date string like "Wed, 01 Apr 2026 00:00:00 GMT" → YYYY-MM-DD
      try { d = new Date(d).toISOString().slice(0, 10); } catch {}
    }
    return { date: d, profit: sanitizeValue(row.profit) };
  }).sort((a, b) => a.date.localeCompare(b.date));

  // Calculate total profit
  const totalProfit = dailyProfit.reduce((sum, day) => sum + day.profit, 0);

  // Process bundle data — top 3 by profit
  const bundles = bundleRows
    .map(row => ({
      name: row.payload__tag || 'Unknown',
      profit: sanitizeValue(row.profit)
    }))
    .filter(b => b.profit > 0)
    .sort((a, b) => b.profit - a.profit)
    .slice(0, 3);

  // Calculate pacing
  const daysElapsed = getDaysElapsed();
  const daysRemaining = Q2_DAYS - daysElapsed;
  const dailyRate = daysElapsed > 0 ? totalProfit / daysElapsed : 0;
  const requiredRate = daysRemaining > 0 ? (TARGET_PROFIT - totalProfit) / daysRemaining : 0;
  
  // Determine status
  let status = 'On Track';
  const progressRatio = totalProfit / TARGET_PROFIT;
  const timeRatio = daysElapsed / Q2_DAYS;
  
  if (progressRatio < timeRatio - 0.1) {
    status = 'Behind';
  } else if (progressRatio > timeRatio + 0.1) {
    status = 'Ahead';
  }

  return {
    totalProfit,
    target: TARGET_PROFIT,
    dailyData: dailyProfit,
    topBundles: bundles,
    pacing: {
      daysElapsed,
      daysRemaining,
      dailyRate,
      requiredRate,
      status
    }
  };
}

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API endpoint
app.get('/api/profit', async (req, res) => {
  try {
    const now = Date.now();
    
    // Check cache
    if (cachedData && (now - cacheTimestamp < CACHE_TTL)) {
      return res.json(cachedData);
    }

    // Fetch fresh data
    const { dailyData, bundleData } = await fetchBI2Data();
    const processed = processData(dailyData, bundleData);

    // Update cache
    cachedData = processed;
    cacheTimestamp = now;

    res.json(processed);
  } catch (error) {
    console.error('Error in /api/profit:', error);
    res.status(500).json({ 
      error: 'Failed to fetch profit data',
      message: error.message 
    });
  }
});

// Serve dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Q2 Profit Dashboard running on http://localhost:${PORT}`);
});
