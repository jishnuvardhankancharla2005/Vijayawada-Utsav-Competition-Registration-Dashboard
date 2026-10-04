/**
 * Serverless Status Update Endpoint: /api/status
 * Updates a participant's status in the persistent pipeline store.
 * Requires team passcode authentication.
 */

const { updateStatus } = require('../lib/id-registry');
const config = require('../lib/config');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { body = {}; }
    }

    const authHeader = req.headers['x-team-passcode'] || '';
    const cookieHeader = req.headers['cookie'] || '';
    const isAuthed = authHeader === config.teamPasscode ||
                     cookieHeader.includes(`vu_passcode=${encodeURIComponent(config.teamPasscode)}`) ||
                     (body && body.passcode === config.teamPasscode);

    if (!isAuthed) {
      return res.status(401).json({ success: false, error: 'Unauthorized: Team passcode required' });
    }

    const { participantId, status } = body || {};
    if (!participantId || !status) {
      return res.status(400).json({ success: false, error: 'Missing participantId or status' });
    }

    const updated = await updateStatus(participantId, status);
    return res.status(200).json({ success: true, ...updated });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};
