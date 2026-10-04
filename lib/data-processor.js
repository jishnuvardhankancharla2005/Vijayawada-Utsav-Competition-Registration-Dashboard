/**
 * Core Data Processing Engine for Vijayawada Utsav 2026
 * Processes General, Crown, and Wonder Women response sheets with:
 * - Dynamic column header resolution
 * - Phone cleaning & flag detection
 * - Messy age and category resolution
 * - Identity matching, exact repeat removal, and multi-entry merge
 * - Sequential participant ID assignment & preservation
 * - Cross-form unique individual computation
 * - Plain language live summary generation
 */

const {
  cleanPhone,
  parseAgeAndCategory,
  normalizeName,
  isSamePerson,
  parseMultiSelect,
  validateCrownEntry,
  validateWonderWomenLink,
  parseTimestamp
} = require('./data-rules');

/**
 * Helper to locate column index by candidate header names (case-insensitive, trimmed)
 */
function getColIdx(headers, ...candidates) {
  if (!headers || !headers.length) return -1;
  const list = candidates.map(c => c.toLowerCase().trim());
  for (let i = 0; i < headers.length; i++) {
    const h = String(headers[i] || '').toLowerCase().trim();
    if (list.some(c => h === c || h.includes(c))) {
      return i;
    }
  }
  return -1;
}

/**
 * Categorize location into: "Vijayawada", "Rest of AP", or "Outside AP"
 */
function classifyLocation(locRaw) {
  if (!locRaw) return 'Vijayawada';
  const l = String(locRaw).trim().toLowerCase();
  if (l.includes('vijayawada') || l.includes('vja') || l.includes('bezawada') || l.includes('bza') || l.includes('gannavaram') || l.includes('kanchika') || l.includes('poranki') || l.includes('kanuru') || l.includes('penamaluru') || l.includes('kondapalli') || l.includes('ibrahimpatnam') || l.includes('mangalagiri') || l.includes('tadepalli')) {
    return 'Vijayawada';
  }
  const apCities = [
    'guntur', 'visakhapatnam', 'vizag', 'rajahmundry', 'kakinada', 'tirupati',
    'nellore', 'kurnool', 'kadapa', 'anantapur', 'eluru', 'ongole', 'machilipatnam',
    'chittoor', 'tenali', 'proddatur', 'nandyal', 'srikakulam', 'vizianagaram',
    'bhimavaram', 'gudivada', 'narasaraopet', 'tadepalligudem', 'amaravati', 'andhra'
  ];
  if (apCities.some(c => l.includes(c))) {
    return 'Rest of AP';
  }
  return 'Outside AP';
}

/**
 * Format a Date object to YYYY-MM-DD string
 */
function formatDateKey(d) {
  if (!d || isNaN(d.getTime())) return '2026-09-25';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Process General Competitions Sheet
 */
function processGeneralSheet(rows, savedStatusMap = {}, idRegistry = {}) {
  if (!rows || rows.length < 2) {
    return { participants: [], stats: { totalSubmissions: 0, removedRepeats: 0, mergedPeople: 0 } };
  }

  const headers = rows[0];
  const idIdx = getColIdx(headers, 'registration id', 'reg id', 'id');
  const tsIdx = getColIdx(headers, 'timestamp');
  const nameIdx = getColIdx(headers, 'full name', 'name');
  const ageCatIdx = getColIdx(headers, 'age (category)', 'age category', 'age');
  const ageNumIdx = getColIdx(headers, 'age in number', 'age in numbers', 'number');
  const genderIdx = getColIdx(headers, 'gender');
  const phoneIdx = getColIdx(headers, 'contact number', 'phone', 'mobile');
  const locIdx = getColIdx(headers, 'location', 'city');
  const instIdx = getColIdx(headers, 'institution/organisation', 'institution', 'organisation', 'school', 'college');
  const linkIdx = getColIdx(headers, 'upload video/artwork', 'link', 'social media profile link');

  // Multi-select competition columns
  const idolIdx = getColIdx(headers, 'vijayawada idol', 'idol');
  const champsIdx = getColIdx(headers, 'vijayawada champs', 'champs');
  const talentIdx = getColIdx(headers, 'vijayawada got talent', 'got talent');
  const quizIdx = getColIdx(headers, 'the vijayawada quiz', 'quiz');
  const familyIdx = getColIdx(headers, 'family talent', 'family');

  let rawEntries = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row.some(c => String(c || '').trim().length > 0)) continue;

    const rawName = String(nameIdx >= 0 ? row[nameIdx] : '').trim();
    if (!rawName) continue;

    const ts = parseTimestamp(tsIdx >= 0 ? row[tsIdx] : '');
    const phoneRes = cleanPhone(phoneIdx >= 0 ? row[phoneIdx] : '');
    const ageRes = parseAgeAndCategory(ageNumIdx >= 0 ? row[ageNumIdx] : '', ageCatIdx >= 0 ? row[ageCatIdx] : '');

    // Competitions
    const competitions = {};
    const compCols = [
      { key: 'Idol', name: 'Vijayawada Idol (Solo)', idx: idolIdx },
      { key: 'Champs', name: 'Vijayawada Champs (Group)', idx: champsIdx },
      { key: 'Talent', name: 'Vijayawada Got Talent', idx: talentIdx },
      { key: 'Quiz', name: 'The Vijayawada Quiz', idx: quizIdx },
      { key: 'Family', name: 'Family Talent', idx: familyIdx }
    ];

    compCols.forEach(col => {
      if (col.idx >= 0 && row[col.idx]) {
        const parsed = parseMultiSelect(row[col.idx]);
        if (parsed.length > 0) {
          competitions[col.key] = parsed;
        }
      }
    });

    const existingId = idIdx >= 0 && row[idIdx] && String(row[idIdx]).startsWith('VU') ? String(row[idIdx]).trim() : null;

    rawEntries.push({
      rowIndex: i + 1,
      timestamp: ts,
      rawName,
      normName: normalizeName(rawName),
      phone: phoneRes.phone,
      rawPhone: phoneRes.raw,
      phoneFlags: phoneRes.flags,
      age: ageRes.parsedAge,
      ageCategory: ageRes.categoryName,
      categoryCode: ageRes.categoryCode,
      ageFlags: ageRes.flags,
      gender: genderIdx >= 0 ? String(row[genderIdx] || 'Unspecified').trim() : 'Unspecified',
      location: locIdx >= 0 ? String(row[locIdx] || 'Vijayawada').trim() : 'Vijayawada',
      classifiedLoc: classifyLocation(locIdx >= 0 ? row[locIdx] : ''),
      institution: instIdx >= 0 ? String(row[instIdx] || '').trim() : '',
      link: linkIdx >= 0 ? String(row[linkIdx] || '').trim() : '',
      competitions,
      existingId,
      form: 'General'
    });
  }

  // Sort chronologically by submission timestamp
  rawEntries.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  // Deduplication & Merging
  const participants = [];
  let removedRepeats = 0;
  let mergedPeople = 0;

  for (const entry of rawEntries) {
    const existing = participants.find(p => isSamePerson(p, entry));
    if (!existing) {
      // First submission for this person
      participants.push({
        ...entry,
        submissions: [entry.timestamp],
        submissionCount: 1,
        allRows: [entry.rowIndex]
      });
    } else {
      // Compare competition entries
      const compKeys1 = Object.keys(existing.competitions).sort().join(',');
      const compKeys2 = Object.keys(entry.competitions).sort().join(',');
      const allSub1 = Object.values(existing.competitions).flat().map(e => e.fullName).sort().join('|');
      const allSub2 = Object.values(entry.competitions).flat().map(e => e.fullName).sort().join('|');

      const isExactRepeat = (compKeys1 === compKeys2) && (allSub1 === allSub2);

      if (isExactRepeat) {
        // Exact repeat: keep latest timestamp and latest info, remove duplicate
        removedRepeats++;
        existing.timestamp = entry.timestamp; // update to latest
        existing.submissions.push(entry.timestamp);
        existing.submissionCount++;
        existing.allRows.push(entry.rowIndex);
        if (entry.institution && !existing.institution) existing.institution = entry.institution;
        if (entry.link && !existing.link) existing.link = entry.link;
      } else {
        // Different competitions: merge into single participant with union of entries
        mergedPeople++;
        existing.submissions.push(entry.timestamp);
        existing.submissionCount++;
        existing.allRows.push(entry.rowIndex);
        for (const [k, list] of Object.entries(entry.competitions)) {
          if (!existing.competitions[k]) {
            existing.competitions[k] = list;
          } else {
            const currentNames = new Set(existing.competitions[k].map(e => e.fullName));
            for (const item of list) {
              if (!currentNames.has(item.fullName)) {
                existing.competitions[k].push(item);
                currentNames.add(item.fullName);
              }
            }
          }
        }
        if (entry.institution && !existing.institution) existing.institution = entry.institution;
        if (entry.link && !existing.link) existing.link = entry.link;
      }
    }
  }

  // Assign sequential Registration IDs
  // Sub Junior: VUSJ0001, Junior: VUJ0001, Senior: VUS0001
  // Single running sequence ordered by first timestamp
  let seq = 1;
  for (const p of participants) {
    const personKey = `gen_${p.normName}_${p.phone}`;
    let id = p.existingId || idRegistry[personKey];
    if (!id) {
      const code = p.categoryCode || 'S';
      const numPart = String(seq).padStart(4, '0');
      id = `VU${code}${numPart}`;
      idRegistry[personKey] = id;
    }
    p.id = id;
    p.status = savedStatusMap[id] || 'New';
    seq++;

    // Calculate total competition entries for this participant
    p.entryCount = Object.values(p.competitions).reduce((sum, list) => sum + list.length, 0);

    // Aggregate flags
    p.allFlags = [...(p.phoneFlags || []), ...(p.ageFlags || [])];
    if (!p.institution) p.allFlags.push('missing institution');
    p.hasIssues = p.allFlags.length > 0;
  }

  return {
    participants,
    stats: {
      totalSubmissions: rawEntries.length,
      removedRepeats,
      mergedPeople,
      uniqueParticipants: participants.length
    }
  };
}

/**
 * Process Crown of Vijayawada Sheet
 */
function processCrownSheet(rows, savedStatusMap = {}, idRegistry = {}) {
  if (!rows || rows.length < 2) {
    return { participants: [], stats: { totalSubmissions: 0, removedRepeats: 0 } };
  }

  const headers = rows[0];
  const idIdx = getColIdx(headers, 'registration id', 'reg id', 'id');
  const tsIdx = getColIdx(headers, 'timestamp');
  const nameIdx = getColIdx(headers, 'full name', 'name');
  const ageIdx = getColIdx(headers, 'age in number', 'age', 'number');
  const genderIdx = getColIdx(headers, 'gender');
  const phoneIdx = getColIdx(headers, 'contact number', 'phone');
  const locIdx = getColIdx(headers, 'location');
  const catIdx = getColIdx(headers, 'select category - crown of vijayawada', 'category', 'crown');

  let rawEntries = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row.some(c => String(c || '').trim().length > 0)) continue;

    const rawName = String(nameIdx >= 0 ? row[nameIdx] : '').trim();
    if (!rawName) continue;

    const ts = parseTimestamp(tsIdx >= 0 ? row[tsIdx] : '');
    const phoneRes = cleanPhone(phoneIdx >= 0 ? row[phoneIdx] : '');
    const ageRaw = ageIdx >= 0 ? row[ageIdx] : '';
    const ageRes = parseAgeAndCategory(ageRaw, '');
    const gender = genderIdx >= 0 ? String(row[genderIdx] || 'Unspecified').trim() : 'Unspecified';
    const category = catIdx >= 0 ? String(row[catIdx] || '').trim() : '';

    const crownValidation = validateCrownEntry(category, ageRes.parsedAge, gender, rawName);
    const existingId = idIdx >= 0 && row[idIdx] && String(row[idIdx]).startsWith('VUCR') ? String(row[idIdx]).trim() : null;

    rawEntries.push({
      rowIndex: i + 1,
      timestamp: ts,
      rawName,
      normName: normalizeName(rawName),
      phone: phoneRes.phone,
      rawPhone: phoneRes.raw,
      phoneFlags: phoneRes.flags,
      age: ageRes.parsedAge,
      gender,
      location: locIdx >= 0 ? String(row[locIdx] || 'Vijayawada').trim() : 'Vijayawada',
      classifiedLoc: classifyLocation(locIdx >= 0 ? row[locIdx] : ''),
      category,
      crownFlags: crownValidation.flags,
      existingId,
      form: 'Crown'
    });
  }

  rawEntries.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  const participants = [];
  let removedRepeats = 0;

  for (const entry of rawEntries) {
    const existing = participants.find(p => isSamePerson(p, entry));
    if (!existing) {
      participants.push({
        ...entry,
        submissions: [entry.timestamp],
        submissionCount: 1,
        allRows: [entry.rowIndex]
      });
    } else {
      removedRepeats++;
      existing.submissions.push(entry.timestamp);
      existing.submissionCount++;
      existing.allRows.push(entry.rowIndex);
      existing.timestamp = entry.timestamp;
      if (entry.category && !existing.category) existing.category = entry.category;
    }
  }

  let seq = 1;
  for (const p of participants) {
    const personKey = `crown_${p.normName}_${p.phone}`;
    let id = p.existingId || idRegistry[personKey];
    if (!id) {
      id = `VUCR${String(seq).padStart(4, '0')}`;
      idRegistry[personKey] = id;
    }
    p.id = id;
    p.status = savedStatusMap[id] || 'New';
    seq++;

    p.allFlags = [...(p.phoneFlags || []), ...(p.crownFlags || [])];
    p.hasIssues = p.allFlags.length > 0;
    p.entryCount = 1;
  }

  return {
    participants,
    stats: {
      totalSubmissions: rawEntries.length,
      removedRepeats,
      uniqueParticipants: participants.length
    }
  };
}

/**
 * Process Wonder Women of Vijayawada Sheet
 */
function processWonderWomenSheet(rows, savedStatusMap = {}, idRegistry = {}) {
  if (!rows || rows.length < 2) {
    return { participants: [], stats: { totalSubmissions: 0, removedRepeats: 0 } };
  }

  const headers = rows[0];
  const idIdx = getColIdx(headers, 'registration id', 'reg id', 'id');
  const tsIdx = getColIdx(headers, 'timestamp');
  const nameIdx = getColIdx(headers, 'full name', 'name');
  const ageIdx = getColIdx(headers, 'age');
  const genderIdx = getColIdx(headers, 'gender');
  const phoneIdx = getColIdx(headers, 'contact number', 'phone');
  const locIdx = getColIdx(headers, 'location');
  const wwCatIdx = getColIdx(headers, 'wonder women of vijayawada', 'wonder women');
  const linkIdx = getColIdx(headers, 'upload video/artwork', 'link');

  let rawEntries = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row.some(c => String(c || '').trim().length > 0)) continue;

    const rawName = String(nameIdx >= 0 ? row[nameIdx] : '').trim();
    if (!rawName) continue;

    const ts = parseTimestamp(tsIdx >= 0 ? row[tsIdx] : '');
    const phoneRes = cleanPhone(phoneIdx >= 0 ? row[phoneIdx] : '');
    const rawCategories = wwCatIdx >= 0 ? row[wwCatIdx] : '';
    const parsedCategories = parseMultiSelect(rawCategories);
    const rawLink = linkIdx >= 0 ? String(row[linkIdx] || '').trim() : '';
    const linkValidation = validateWonderWomenLink(rawLink);

    const existingId = idIdx >= 0 && row[idIdx] && String(row[idIdx]).startsWith('VUWW') ? String(row[idIdx]).trim() : null;

    rawEntries.push({
      rowIndex: i + 1,
      timestamp: ts,
      rawName,
      normName: normalizeName(rawName),
      phone: phoneRes.phone,
      rawPhone: phoneRes.raw,
      phoneFlags: phoneRes.flags,
      age: 18,
      ageCategory: '18+',
      gender: genderIdx >= 0 ? String(row[genderIdx] || 'Female').trim() : 'Female',
      location: locIdx >= 0 ? String(row[locIdx] || 'Vijayawada').trim() : 'Vijayawada',
      classifiedLoc: classifyLocation(locIdx >= 0 ? row[locIdx] : ''),
      categories: parsedCategories.map(c => c.shortName),
      link: rawLink,
      linkValid: linkValidation.isValidLink,
      linkFlag: linkValidation.flag,
      existingId,
      form: 'Wonder Women'
    });
  }

  rawEntries.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  const participants = [];
  let removedRepeats = 0;

  for (const entry of rawEntries) {
    const existing = participants.find(p => isSamePerson(p, entry));
    if (!existing) {
      participants.push({
        ...entry,
        submissions: [entry.timestamp],
        submissionCount: 1,
        allRows: [entry.rowIndex]
      });
    } else {
      // Merge categories
      removedRepeats++;
      existing.submissions.push(entry.timestamp);
      existing.submissionCount++;
      existing.allRows.push(entry.rowIndex);
      existing.timestamp = entry.timestamp;
      const catSet = new Set(existing.categories);
      entry.categories.forEach(c => catSet.add(c));
      existing.categories = Array.from(catSet);
      if (entry.link && !existing.link) {
        existing.link = entry.link;
        existing.linkValid = entry.linkValid;
        existing.linkFlag = entry.linkFlag;
      }
    }
  }

  let seq = 1;
  for (const p of participants) {
    const personKey = `ww_${p.normName}_${p.phone}`;
    let id = p.existingId || idRegistry[personKey];
    if (!id) {
      id = `VUWW${String(seq).padStart(4, '0')}`;
      idRegistry[personKey] = id;
    }
    p.id = id;
    p.status = savedStatusMap[id] || 'New';
    seq++;

    p.allFlags = [...(p.phoneFlags || [])];
    if (p.linkFlag) p.allFlags.push(p.linkFlag);
    p.hasIssues = p.allFlags.length > 0;
    p.entryCount = p.categories.length;
  }

  return {
    participants,
    stats: {
      totalSubmissions: rawEntries.length,
      removedRepeats,
      uniqueParticipants: participants.length
    }
  };
}

/**
 * Generate auto-summary sentence in plain language
 */
function generateAutoSummary(overviewData) {
  const topComp = overviewData.topCompetitions[0] || { name: 'Vijayawada Idol', count: 0 };
  const todayCount = overviewData.todayRegistrations || 0;
  const peak = overviewData.peakDay || { date: '25 Sep', count: 0 };
  const vjaPercent = overviewData.geo.vjaPct || 0;

  return `${topComp.name} is the most popular event (${topComp.count} people). ${todayCount} new registrations today, down from a peak of ${peak.count} on ${peak.date}. ${vjaPercent}% of participants are from Vijayawada.`;
}

/**
 * Master aggregation function combining all 3 sheets
 */
function aggregateAllSheets(rawGeneralRows, rawCrownRows, rawWonderRows, savedStatusMap = {}, idRegistry = {}) {
  const genResult = processGeneralSheet(rawGeneralRows, savedStatusMap, idRegistry);
  const crownResult = processCrownSheet(rawCrownRows, savedStatusMap, idRegistry);
  const wwResult = processWonderWomenSheet(rawWonderRows, savedStatusMap, idRegistry);

  const allParticipants = [
    ...genResult.participants,
    ...crownResult.participants,
    ...wwResult.participants
  ];

  // Combined totals
  const totalSubmissions = genResult.stats.totalSubmissions + crownResult.stats.totalSubmissions + wwResult.stats.totalSubmissions;
  const totalEntries = allParticipants.reduce((sum, p) => sum + (p.entryCount || 1), 0);
  const combinedTotal = allParticipants.length;

  // Compute ≈ unique individuals across forms (deduping by phone + name)
  const crossFormPeople = [];
  for (const p of allParticipants) {
    if (!crossFormPeople.some(x => isSamePerson(x, p))) {
      crossFormPeople.push(p);
    }
  }
  const approxUniqueIndividuals = crossFormPeople.length;

  // Needs follow-up count
  const needsFollowUpCount = allParticipants.filter(p => p.hasIssues || p.status === 'Needs Correction').length;

  // Geographic Breakdown
  let vjaCount = 0, apCount = 0, outsideCount = 0;
  allParticipants.forEach(p => {
    if (p.classifiedLoc === 'Vijayawada') vjaCount++;
    else if (p.classifiedLoc === 'Rest of AP') apCount++;
    else outsideCount++;
  });
  const totalP = allParticipants.length || 1;
  const geo = {
    vijayawada: vjaCount,
    vjaPct: Math.round((vjaCount / totalP) * 100),
    restOfAP: apCount,
    apPct: Math.round((apCount / totalP) * 100),
    outsideAP: outsideCount,
    outsidePct: Math.round((outsideCount / totalP) * 100)
  };

  // Daily Registration Pace (Trend)
  const dailyCounts = {};
  allParticipants.forEach(p => {
    (p.submissions || [p.timestamp]).forEach(ts => {
      const key = formatDateKey(ts);
      dailyCounts[key] = (dailyCounts[key] || 0) + 1;
    });
  });

  const sortedDates = Object.keys(dailyCounts).sort();
  let peakDay = { date: '', count: 0 };
  const dailyTrend = sortedDates.map(date => {
    const count = dailyCounts[date];
    if (count > peakDay.count) {
      const parts = date.split('-');
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const mStr = monthNames[parseInt(parts[1], 10) - 1];
      peakDay = { date: `${parseInt(parts[2], 10)} ${mStr}`, count };
    }
    return { date, count };
  });

  const todayKey = formatDateKey(new Date('2026-10-02'));
  const todayRegistrations = dailyCounts[todayKey] || dailyTrend[dailyTrend.length - 1]?.count || 0;

  // Competitions Filling Up (Sorted Horizontal Bar Chart)
  const compCountMap = {};
  // 1. General sub-competitions
  genResult.participants.forEach(p => {
    Object.entries(p.competitions).forEach(([mainCat, list]) => {
      list.forEach(item => {
        const name = `${mainCat}: ${item.shortName}`;
        compCountMap[name] = (compCountMap[name] || 0) + 1;
      });
    });
  });
  // 2. Crown categories
  crownResult.participants.forEach(p => {
    if (p.category) {
      const name = `Crown: ${p.category.split('(')[0].trim()}`;
      compCountMap[name] = (compCountMap[name] || 0) + 1;
    }
  });
  // 3. Wonder Women categories
  wwResult.participants.forEach(p => {
    (p.categories || []).forEach(cat => {
      const name = `WW: ${cat}`;
      compCountMap[name] = (compCountMap[name] || 0) + 1;
    });
  });

  const topCompetitions = Object.entries(compCountMap)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const overview = {
    totalParticipants: combinedTotal,
    approxUniqueIndividuals,
    formCounts: {
      general: genResult.participants.length,
      crown: crownResult.participants.length,
      wonderWomen: wwResult.participants.length
    },
    submissions: totalSubmissions,
    competitionEntries: totalEntries,
    needsFollowUp: needsFollowUpCount,
    geo,
    dailyTrend,
    peakDay,
    todayRegistrations,
    topCompetitions
  };

  overview.summaryText = generateAutoSummary(overview);

  return {
    overview,
    general: {
      participants: genResult.participants,
      stats: genResult.stats
    },
    crown: {
      participants: crownResult.participants,
      stats: crownResult.stats
    },
    wonderWomen: {
      participants: wwResult.participants,
      stats: wwResult.stats
    },
    allParticipants,
    quality: {
      totalSubmissions,
      exactRepeatsRemoved: genResult.stats.removedRepeats + crownResult.stats.removedRepeats + wwResult.stats.removedRepeats,
      multiSubmissionPeople: genResult.stats.mergedPeople,
      invalidPhones: allParticipants.filter(p => (p.phoneFlags || []).includes('invalid phone')).length,
      twoNumberPhones: allParticipants.filter(p => (p.phoneFlags || []).includes('two numbers')).length,
      missingInstitution: genResult.participants.filter(p => !p.institution).length,
      ageUnclear: genResult.participants.filter(p => (p.ageFlags || []).includes('age unclear')).length,
      ageCategoryMismatches: genResult.participants.filter(p => (p.ageFlags || []).includes('age_category_mismatch')).length
    }
  };
}

module.exports = {
  classifyLocation,
  processGeneralSheet,
  processCrownSheet,
  processWonderWomenSheet,
  aggregateAllSheets,
  generateAutoSummary
};
