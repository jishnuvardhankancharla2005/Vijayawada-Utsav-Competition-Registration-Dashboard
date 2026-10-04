/**
 * Vercel Serverless Function: /api/data
 * Fetches all 3 Google Sheets server-side, processes data according to competition rules,
 * masks sensitive phone numbers by default (unless team passcode is verified),
 * and caches at the edge (s-maxage=30, stale-while-revalidate=120).
 */

const { fetchAllRawSheets } = require('../lib/sheet-fetcher');
const { aggregateAllSheets } = require('../lib/data-processor');
const { getRegistry, saveRegistryState } = require('../lib/id-registry');
const config = require('../lib/config');

function maskPhone(phone) {
  if (!phone || typeof phone !== 'string') return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length >= 4) {
    return '•••••• ' + digits.slice(-4);
  }
  return '••••••';
}

function verifyAuth(req) {
  // Check header, query, or cookie
  const authHeader = req.headers['x-team-passcode'] || req.headers['authorization'];
  if (authHeader) {
    const val = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (val === config.teamPasscode) return true;
  }

  // Cookie check
  const cookieHeader = req.headers['cookie'] || '';
  if (cookieHeader.includes(`vu_passcode=${encodeURIComponent(config.teamPasscode)}`)) {
    return true;
  }

  return false;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const isAuthenticated = verifyAuth(req);
  const forceRefresh = req.query.refresh === 'true' || req.query.refresh === '1';

  try {
    const { sheets, fromCache, stale } = await fetchAllRawSheets(forceRefresh);
    const registry = await getRegistry();

    const result = aggregateAllSheets(
      sheets.general,
      sheets.crown,
      sheets.wonderWomen,
      registry.statusMap,
      registry.idMap
    );

    // Save any newly registered IDs to persistence
    await saveRegistryState(registry.idMap);

    // Privacy masking: mask phone numbers unless verified
    if (!isAuthenticated) {
      result.allParticipants.forEach(p => {
        p.phone = maskPhone(p.phone);
        p.rawPhone = maskPhone(p.rawPhone);
        p.isMasked = true;
      });
      result.general.participants.forEach(p => {
        p.phone = maskPhone(p.phone);
        p.rawPhone = maskPhone(p.rawPhone);
        p.isMasked = true;
      });
      result.crown.participants.forEach(p => {
        p.phone = maskPhone(p.phone);
        p.rawPhone = maskPhone(p.rawPhone);
        p.isMasked = true;
      });
      result.wonderWomen.participants.forEach(p => {
        p.phone = maskPhone(p.phone);
        p.rawPhone = maskPhone(p.rawPhone);
        p.isMasked = true;
      });
    } else {
      result.allParticipants.forEach(p => { p.isMasked = false; });
      result.general.participants.forEach(p => { p.isMasked = false; });
      result.crown.participants.forEach(p => { p.isMasked = false; });
      result.wonderWomen.participants.forEach(p => { p.isMasked = false; });
    }

    // Set cache headers
    if (isAuthenticated) {
      res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    } else {
      res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=120');
    }

    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('Access-Control-Allow-Origin', '*');

    return res.status(200).json({
      success: true,
      lastSynced: new Date().toISOString(),
      fromCache,
      stale: !!stale,
      isAuthenticated,
      data: result
    });
  } catch (err) {
    console.error('[API /api/data Error]', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch live sheet data: ' + err.message
    });
  }
};
