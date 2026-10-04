/**
 * Serverless Authentication Endpoint: /api/auth
 * Verifies team passcode and sets secure authentication cookie.
 */

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
    const passcode = (body && body.passcode ? String(body.passcode) : '').trim();

    if (passcode === config.teamPasscode) {
      // Set session cookie
      res.setHeader('Set-Cookie', `vu_passcode=${encodeURIComponent(config.teamPasscode)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`);
      return res.status(200).json({
        success: true,
        message: 'Passcode verified successfully'
      });
    } else {
      return res.status(401).json({
        success: false,
        error: 'Invalid team passcode'
      });
    }
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};
