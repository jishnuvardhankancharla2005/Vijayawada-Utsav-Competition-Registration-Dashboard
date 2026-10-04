/**
 * Persistent ID Registry and Participant Status Pipeline Store
 * Supports:
 * - Local filesystem persistence (data/registry.json)
 * - Vercel KV / Upstash Redis persistence (when env vars KV_REST_API_URL/TOKEN are set)
 * - In-memory fallback
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const DATA_DIR = path.join(__dirname, '..', 'data');
const REGISTRY_FILE = path.join(DATA_DIR, 'registry.json');

// In-memory state
let localState = {
  idMap: {},        // personKey -> assigned ID
  statusMap: {},    // participantId -> status ('New', 'Verified', etc.)
  lastUpdated: new Date().toISOString()
};

// Ensure data directory exists
try {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (fs.existsSync(REGISTRY_FILE)) {
    const content = fs.readFileSync(REGISTRY_FILE, 'utf8');
    localState = { ...localState, ...JSON.parse(content) };
  }
} catch (e) {
  console.warn('[Local registry init error]', e.message);
}

function saveLocalState() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(REGISTRY_FILE, JSON.stringify(localState, null, 2), 'utf8');
  } catch (e) {
    console.warn('[Could not save local registry file]', e.message);
  }
}

/**
 * KV store adapter (supports Upstash/Vercel KV REST API)
 */
async function kvGet(key) {
  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;
  if (!kvUrl || !kvToken) return null;

  return new Promise((resolve) => {
    const url = `${kvUrl}/get/${encodeURIComponent(key)}`;
    const req = https.get(url, {
      headers: { Authorization: `Bearer ${kvToken}` }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.result ? JSON.parse(json.result) : null);
        } catch {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
  });
}

async function kvSet(key, value) {
  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;
  if (!kvUrl || !kvToken) return false;

  return new Promise((resolve) => {
    const url = `${kvUrl}/set/${encodeURIComponent(key)}`;
    const body = JSON.stringify(value);
    const req = https.request(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${kvToken}`,
        'Content-Type': 'application/json'
      }
    }, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.write(body);
    req.end();
  });
}

async function getRegistry() {
  const remote = await kvGet('vu_registry_v1');
  if (remote) {
    localState = { ...localState, ...remote };
  }
  return localState;
}

async function updateStatus(participantId, newStatus) {
  const validStatuses = ['New', 'Verified', 'Contacted', 'Confirmed', 'Needs Correction', 'Withdrawn'];
  if (!validStatuses.includes(newStatus)) {
    throw new Error(`Invalid status: ${newStatus}`);
  }

  localState.statusMap[participantId] = newStatus;
  localState.lastUpdated = new Date().toISOString();
  saveLocalState();
  await kvSet('vu_registry_v1', localState);

  return { participantId, status: newStatus, lastUpdated: localState.lastUpdated };
}

async function saveRegistryState(idMap) {
  localState.idMap = { ...localState.idMap, ...idMap };
  saveLocalState();
  await kvSet('vu_registry_v1', localState);
}

module.exports = {
  getRegistry,
  updateStatus,
  saveRegistryState,
  localState
};
