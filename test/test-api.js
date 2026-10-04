/**
 * Integration Test for /api/data endpoint
 */

const dataHandler = require('../api/data');

async function testApi() {
  console.log('Testing /api/data serverless handler...');
  const req = {
    method: 'GET',
    headers: {},
    query: {}
  };

  let responseData = null;
  const res = {
    statusCode: 200,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(k, v) {
      this.headers[k] = v;
    },
    json(data) {
      responseData = data;
      console.log('Response status:', this.statusCode);
      console.log('Success:', data.success);
      if (data.data) {
        console.log('Overview metrics:');
        console.log('  Total Participants (All Forms):', data.data.overview.totalParticipants);
        console.log('  Approx Unique Individuals:', data.data.overview.approxUniqueIndividuals);
        console.log('  Submissions:', data.data.overview.submissions);
        console.log('  Competition Entries:', data.data.overview.competitionEntries);
        console.log('  Needs Follow-Up:', data.data.overview.needsFollowUp);
        console.log('  Summary text:', data.data.overview.summaryText);
        console.log('  General Participants:', data.data.general.participants.length);
        console.log('  Crown Participants:', data.data.crown.participants.length);
        console.log('  Wonder Women Participants:', data.data.wonderWomen.participants.length);
        console.log('  First General Participant:', {
          id: data.data.general.participants[0].id,
          name: data.data.general.participants[0].rawName,
          phone: data.data.general.participants[0].phone,
          isMasked: data.data.general.participants[0].isMasked
        });
      }
    }
  };

  await dataHandler(req, res);
}

testApi().catch(console.error);
