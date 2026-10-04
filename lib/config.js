/**
 * Configuration module for Vijayawada Utsav 2026 Registration Dashboard
 * Sheet IDs and options driven by environment variables with fallback defaults.
 */
module.exports = {
  sheetIds: {
    general: process.env.SHEET_ID_GENERAL || '19TGx08ZSiWVrelAQ2esXTTwb0r82Z-5wUbuexBJYdLQ',
    crown: process.env.SHEET_ID_CROWN || '1z6zOxFS349r1mBOVR3G7o6IEZADdv1sL05ucKpTiJkY',
    wonderWomen: process.env.SHEET_ID_WW || '1KbDhfum05VTqvbGqRSWYdwXYKhIT0jFciATFq7naI-o'
  },
  gids: {
    general: process.env.GID_GENERAL || '0',
    crown: process.env.GID_CROWN || '0',
    wonderWomen: process.env.GID_WW || '0'
  },
  googleApiKey: process.env.GOOGLE_SHEETS_API_KEY || null,
  teamPasscode: process.env.TEAM_PASSCODE || 'utsav2026',
  referenceDate: new Date('2026-10-02T13:00:00+05:30'),
  cacheDurationSeconds: 30,
  staleDurationSeconds: 120
};
