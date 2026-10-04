/**
 * Sheet Fetcher Module
 * Handles server-side fetching of Google Sheets with:
 * - Redirect-following HTTP/HTTPS client with automatic retry & backoff
 * - Google Sheets API v4 support (when API key is present)
 * - CSV export parser handling quoted values & newlines
 * - Memory & fallback caching for 100% uptime
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const config = require('./config');

// In-memory cache for edge/serverless reuse
const memoryCache = {
  data: null,
  timestamp: 0,
  rawSheets: {}
};

/**
 * Standard RFC 4180 compliant CSV parser
 */
function parseCSV(text) {
  if (!text || typeof text !== 'string') return [];
  const lines = [];
  let row = [];
  let cur = '';
  let inQ = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (inQ && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQ = !inQ;
      }
    } else if (c === ',' && !inQ) {
      row.push(cur.trim());
      cur = '';
    } else if ((c === '\r' || c === '\n') && !inQ) {
      if (c === '\r' && text[i + 1] === '\n') {
        i++;
      }
      row.push(cur.trim());
      if (row.some(cell => cell.length > 0)) {
        lines.push(row);
      }
      row = [];
      cur = '';
    } else {
      cur += c;
    }
  }

  if (cur.length > 0 || row.length > 0) {
    row.push(cur.trim());
    if (row.some(cell => cell.length > 0)) {
      lines.push(row);
    }
  }

  return lines;
}

/**
 * HTTP GET following up to 5 redirects with timeout
 */
function httpGetWithRedirect(url, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    function fetchUrl(currentUrl, redirectsLeft) {
      if (redirectsLeft < 0) {
        return reject(new Error('Too many HTTP redirects'));
      }

      const client = currentUrl.startsWith('https') ? https : http;
      const req = client.get(currentUrl, {
        timeout: 15000
      }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return fetchUrl(res.headers.location, redirectsLeft - 1);
        }

        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP GET failed with status code ${res.statusCode}`));
        }

        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => resolve(body));
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timed out'));
      });

      req.on('error', reject);
    }

    fetchUrl(url, maxRedirects);
  });
}

/**
 * Fetch with retry and exponential backoff
 */
async function fetchWithRetry(url, maxRetries = 3) {
  let lastErr = null;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const data = await httpGetWithRedirect(url);
      return data;
    } catch (err) {
      lastErr = err;
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, attempt * 600));
      }
    }
  }
  throw lastErr;
}

/**
 * Fetch a single sheet either via API v4 or CSV export
 */
async function fetchSheetData(sheetId, gid = '0') {
  // If API key is configured, try Google Sheets API v4 first
  if (config.googleApiKey) {
    try {
      const apiUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/A:Z?key=${config.googleApiKey}`;
      const jsonStr = await fetchWithRetry(apiUrl, 2);
      const json = JSON.parse(jsonStr);
      if (json.values && json.values.length > 0) {
        return json.values;
      }
    } catch (err) {
      console.warn(`[Sheets API v4 failed for ${sheetId}, falling back to CSV: ${err.message}]`);
    }
  }

  // Direct CSV export URL
  let csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;
  if (gid && gid !== '0') {
    csvUrl += `&gid=${gid}`;
  }

  const csvText = await fetchWithRetry(csvUrl, 3);
  return parseCSV(csvText);
}

/**
 * Read backup CSV from workspace if Google is completely unreachable
 */
function readBackupSheet(name) {
  try {
    const filenameMap = {
      general: 'General_Competitions_Responses_with_IDs.csv',
      crown: 'Crown_of_Vijayawada_Responses_with_IDs.csv',
      wonderWomen: 'Wonder_Women_Responses_with_IDs.csv'
    };
    const p = path.join(__dirname, '..', filenameMap[name] || '');
    if (fs.existsSync(p)) {
      const content = fs.readFileSync(p, 'utf8');
      return parseCSV(content);
    }
  } catch (e) {
    console.warn('[Could not read backup CSV]', e.message);
  }
  return [];
}

/**
 * Fetch all three sheets sequentially to respect Google rate limits
 */
async function fetchAllRawSheets(forceRefresh = false) {
  const now = Date.now();
  const cacheAge = (now - memoryCache.timestamp) / 1000;

  if (!forceRefresh && memoryCache.rawSheets.general && cacheAge < config.cacheDurationSeconds) {
    return {
      sheets: memoryCache.rawSheets,
      fromCache: true,
      cacheAge
    };
  }

  try {
    const genRows = await fetchSheetData(config.sheetIds.general, config.gids.general);
    const crownRows = await fetchSheetData(config.sheetIds.crown, config.gids.crown);
    const wwRows = await fetchSheetData(config.sheetIds.wonderWomen, config.gids.wonderWomen);

    const rawSheets = {
      general: genRows,
      crown: crownRows,
      wonderWomen: wwRows
    };

    memoryCache.rawSheets = rawSheets;
    memoryCache.timestamp = now;

    return {
      sheets: rawSheets,
      fromCache: false,
      cacheAge: 0
    };
  } catch (err) {
    console.warn('[Fetch error, checking cache/backup]', err.message);
    // 1. Check memory cache
    if (memoryCache.rawSheets && memoryCache.rawSheets.general) {
      return {
        sheets: memoryCache.rawSheets,
        fromCache: true,
        stale: true,
        error: err.message
      };
    }
    // 2. Check local backup files
    const backupGeneral = readBackupSheet('general');
    const backupCrown = readBackupSheet('crown');
    const backupWW = readBackupSheet('wonderWomen');
    if (backupGeneral.length > 0) {
      return {
        sheets: {
          general: backupGeneral,
          crown: backupCrown,
          wonderWomen: backupWW
        },
        fromCache: true,
        stale: true,
        backup: true,
        error: err.message
      };
    }
    throw err;
  }
}

module.exports = {
  parseCSV,
  httpGetWithRedirect,
  fetchWithRetry,
  fetchSheetData,
  fetchAllRawSheets,
  memoryCache
};
