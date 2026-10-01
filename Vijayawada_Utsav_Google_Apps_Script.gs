/**
 * =========================================================================
 * VIJAYAWADA UTSAV 2026 - AUTOMATIC REGISTRATION ID GENERATOR
 * =========================================================================
 * 
 * INSTRUCTIONS FOR USER:
 * 1. Open your Google Sheet in browser:
 *    - For General Competitions Sheet
 *    - For Wonder Women Sheet
 *    - For Crown of Vijayawada Sheet
 * 2. In Google Sheets top menu, click: "Extensions" > "Apps Script"
 * 3. Delete any code in the editor, and PASTE this entire script.
 * 4. Click the Save icon (💾).
 * 5. In the toolbar function dropdown, select "generateAndSaveAllIDs" and click "Run".
 *    - Grant permissions when prompted by Google.
 *    - All rows will instantly get their exact matching "Registration ID" in Column A!
 * 6. Set up the Automatic Trigger for New Submissions:
 *    - In the left sidebar of Apps Script, click the alarm clock icon ("Triggers").
 *    - Click "+ Add Trigger" (bottom right).
 *    - Choose which function to run: "onFormSubmitTrigger"
 *    - Select event source: "From spreadsheet"
 *    - Select event type: "On form submit"
 *    - Click "Save".
 * 
 * Done! Now every new entry will automatically receive its matched ID in Column A!
 * =========================================================================
 */

function generateAndSaveAllIDs() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return;

  var header = data[0];
  var idColIdx = -1;

  // Check if Registration ID column already exists
  for (var c = 0; c < header.length; c++) {
    if (header[c].toString().trim().toLowerCase() === 'registration id') {
      idColIdx = c;
      break;
    }
  }

  // If not found, insert Column A as "Registration ID"
  if (idColIdx === -1) {
    sheet.insertColumnBefore(1);
    sheet.getRange(1, 1).setValue('Registration ID');
    sheet.getRange(1, 1).setFontWeight('bold').setBackground('#F2B01E').setFontColor('#1C2145');
    idColIdx = 0;
    // Re-fetch data after column insertion
    data = sheet.getDataRange().getValues();
    header = data[0];
  }

  // Detect which sheet type this is based on headers
  var sheetType = detectSheetType(header);
  Logger.log('Detected Sheet Type: ' + sheetType);

  var colMap = findColumnIndices(header, sheetType);
  var personMap = {};
  var maxSeq = 0;

  // First pass: collect any already assigned IDs and track maximum sequence number
  for (var r = 1; r < data.length; r++) {
    var existingId = (data[r][idColIdx] || '').toString().trim().toUpperCase();
    var name = cleanName(data[r][colMap.nameIdx]);
    var phone = cleanPhone(data[r][colMap.phoneIdx]);

    if (existingId && existingId.startsWith('VU')) {
      var seqNum = parseInt(existingId.replace(/[^0-9]/g, ''), 10);
      if (!isNaN(seqNum) && seqNum > maxSeq) maxSeq = seqNum;
      if (phone) personMap['ph:' + phone] = existingId;
      if (name) personMap['nm:' + name] = existingId;
      if (phone && name) personMap['both:' + phone + '_' + name] = existingId;
    }
  }

  // Second pass: generate IDs for rows missing an ID
  var idsToWrite = [];
  for (var r = 1; r < data.length; r++) {
    var currentId = (data[r][idColIdx] || '').toString().trim().toUpperCase();
    var name = cleanName(data[r][colMap.nameIdx]);
    var phone = cleanPhone(data[r][colMap.phoneIdx]);
    var ageCat = (colMap.catIdx !== -1 && data[r][colMap.catIdx]) ? data[r][colMap.catIdx].toString() : '';
    var ageNum = (colMap.ageNumIdx !== -1 && data[r][colMap.ageNumIdx]) ? parseInt(data[r][colMap.ageNumIdx], 10) : null;

    if (!currentId) {
      // Check if person already exists (repeat submission by same person)
      var matchedId = (phone && name ? personMap['both:' + phone + '_' + name] : null) || 
                      personMap['nm:' + name] || 
                      (phone ? personMap['ph:' + phone] : null);

      if (matchedId) {
        currentId = matchedId;
      } else {
        // Generate new ID
        maxSeq++;
        currentId = formatID(sheetType, maxSeq, ageCat, ageNum);
        if (phone && name) personMap['both:' + phone + '_' + name] = currentId;
        if (name) personMap['nm:' + name] = currentId;
        if (phone) personMap['ph:' + phone] = currentId;
      }
    }

    idsToWrite.push([currentId]);
  }

  // Write all IDs back to sheet in Column A in one batch
  if (idsToWrite.length > 0) {
    sheet.getRange(2, idColIdx + 1, idsToWrite.length, 1).setValues(idsToWrite);
    sheet.autoResizeColumn(idColIdx + 1);
  }

  SpreadsheetApp.getActiveSpreadsheet().toast('Successfully generated Registration IDs for ' + idsToWrite.length + ' entries!', 'Vijayawada Utsav', 5);
}

/**
 * Trigger function for new form submissions
 */
function onFormSubmitTrigger(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var row = e ? e.range.getRow() : sheet.getLastRow();
  var header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  
  var idColIdx = -1;
  for (var c = 0; c < header.length; c++) {
    if (header[c].toString().trim().toLowerCase() === 'registration id') {
      idColIdx = c;
      break;
    }
  }

  // If Registration ID column does not exist, run full generator
  if (idColIdx === -1) {
    generateAndSaveAllIDs();
    return;
  }

  // Check if row already has an ID
  var currentId = sheet.getRange(row, idColIdx + 1).getValue().toString().trim();
  if (currentId) return;

  var sheetType = detectSheetType(header);
  var colMap = findColumnIndices(header, sheetType);

  var rowValues = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getValues()[0];
  var name = cleanName(rowValues[colMap.nameIdx]);
  var phone = cleanPhone(rowValues[colMap.phoneIdx]);
  var ageCat = (colMap.catIdx !== -1 && rowValues[colMap.catIdx]) ? rowValues[colMap.catIdx].toString() : '';
  var ageNum = (colMap.ageNumIdx !== -1 && rowValues[colMap.ageNumIdx]) ? parseInt(rowValues[colMap.ageNumIdx], 10) : null;

  // Search existing rows for matching person
  var allData = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  var maxSeq = 0;
  var matchedId = null;

  for (var i = 0; i < allData.length; i++) {
    var eid = (allData[i][idColIdx] || '').toString().trim().toUpperCase();
    if (eid && eid.startsWith('VU')) {
      var seq = parseInt(eid.replace(/[^0-9]/g, ''), 10);
      if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;

      var ename = cleanName(allData[i][colMap.nameIdx]);
      var ephone = cleanPhone(allData[i][colMap.phoneIdx]);

      if (phone && ephone && phone === ephone && name && ename && (name.indexOf(ename) !== -1 || ename.indexOf(name) !== -1)) {
        matchedId = eid;
      } else if (name && ename && name === ename) {
        matchedId = eid;
      }
    }
  }

  var newId = matchedId || formatID(sheetType, maxSeq + 1, ageCat, ageNum);
  sheet.getRange(row, idColIdx + 1).setValue(newId);
}

// -------------------------------------------------------------
// Helper Functions
// -------------------------------------------------------------
function detectSheetType(header) {
  var headerStr = header.join(' ').toLowerCase();
  if (headerStr.indexOf('crown of vijayawada') !== -1) return 'crown';
  if (headerStr.indexOf('wonder women') !== -1) return 'wonder';
  return 'general';
}

function findColumnIndices(header, sheetType) {
  var map = { nameIdx: 1, phoneIdx: -1, catIdx: -1, ageNumIdx: -1 };
  for (var c = 0; c < header.length; c++) {
    var h = header[c].toString().trim().toLowerCase();
    if (h.indexOf('full name') !== -1 || h.indexOf('name') !== -1) {
      if (map.nameIdx === 1) map.nameIdx = c;
    } else if (h.indexOf('contact') !== -1 || h.indexOf('phone') !== -1 || h.indexOf('mobile') !== -1) {
      map.phoneIdx = c;
    } else if (h.indexOf('age in number') !== -1) {
      map.ageNumIdx = c;
    } else if (h.indexOf('category') !== -1 || h.indexOf('age') !== -1) {
      if (map.catIdx === -1) map.catIdx = c;
    }
  }
  // Defaults if not matched
  if (map.phoneIdx === -1) map.phoneIdx = (sheetType === 'crown' ? 4 : (sheetType === 'wonder' ? 4 : 5));
  return map;
}

function formatID(sheetType, seqNum, ageCat, ageNum) {
  var numStr = ('0000' + seqNum).slice(-4);
  if (sheetType === 'crown') {
    return 'VUCR' + numStr;
  } else if (sheetType === 'wonder') {
    return 'VUWW' + numStr;
  } else {
    // General
    var catPrefix = 'J';
    var catLower = (ageCat || '').toLowerCase();
    if (catLower.indexOf('sub junior') !== -1 || (ageNum && ageNum <= 12)) catPrefix = 'SJ';
    else if (catLower.indexOf('senior') !== -1 || (ageNum && ageNum >= 19)) catPrefix = 'S';
    return 'VU' + catPrefix + numStr;
  }
}

function cleanName(n) {
  if (!n) return '';
  return n.toString().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function cleanPhone(p) {
  if (!p) return '';
  var num = p.toString().replace(/[^0-9]/g, '');
  return num.length >= 10 ? num.slice(-10) : num;
}
