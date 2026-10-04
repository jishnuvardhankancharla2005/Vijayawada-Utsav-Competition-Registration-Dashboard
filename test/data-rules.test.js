/**
 * Comprehensive Unit Tests for Data Rules
 * Run with: node test/data-rules.test.js
 */

const assert = require('assert');
const {
  cleanPhone,
  parseAgeAndCategory,
  normalizeName,
  isSamePerson,
  parseMultiSelect,
  validateCrownEntry,
  validateWonderWomenLink,
  parseTimestamp
} = require('../lib/data-rules');

let passedTests = 0;
let totalTests = 0;

function it(desc, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✓ ${desc}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ ${desc}`);
    console.error(`    Error: ${err.message}`);
    throw err;
  }
}

console.log('=== Running Data Rules Unit Tests ===\n');

// 1. Phone Cleaning & Flagging
console.log('[Phone Tests]');
it('strips +91, spaces, and dashes to return last 10 digits', () => {
  assert.strictEqual(cleanPhone('+91 98480-12345').phone, '9848012345');
  assert.strictEqual(cleanPhone('+919848012345').phone, '9848012345');
  assert.strictEqual(cleanPhone('98480 12345').phone, '9848012345');
  assert.strictEqual(cleanPhone('(984) 801-2345').phone, '9848012345');
});

it('flags cell with two numbers without deleting primary number', () => {
  const res1 = cleanPhone('9848012345 / 9848067890');
  assert.strictEqual(res1.isTwoNumbers, true);
  assert.strictEqual(res1.flags.includes('two numbers'), true);
  assert.strictEqual(res1.phone, '9848012345');

  const res2 = cleanPhone('9848012345, 9848067890');
  assert.strictEqual(res2.isTwoNumbers, true);
  assert.strictEqual(res2.phone, '9848012345');
});

it('flags fewer than 10 digits as invalid phone', () => {
  const res = cleanPhone('98480123');
  assert.strictEqual(res.isInvalid, true);
  assert.strictEqual(res.flags.includes('invalid phone'), true);
});

// 2. Age and Category Parsing
console.log('\n[Age & Category Tests]');
it('parses messy age numbers: 12years, 10 years, 8 yrs', () => {
  const r1 = parseAgeAndCategory('12years', 'Sub Junior 6-12');
  assert.strictEqual(r1.parsedAge, 12);
  assert.strictEqual(r1.categoryCode, 'SJ');

  const r2 = parseAgeAndCategory('10 years', 'Sub Junior 6-12');
  assert.strictEqual(r2.parsedAge, 10);
  assert.strictEqual(r2.categoryCode, 'SJ');

  const r3 = parseAgeAndCategory('8 yrs', 'Sub Junior 6-12');
  assert.strictEqual(r3.parsedAge, 8);
  assert.strictEqual(r3.categoryCode, 'SJ');
});

it('parses word numbers: Eleven, Twenty six', () => {
  const r1 = parseAgeAndCategory('Eleven', 'Sub Junior 6-12');
  assert.strictEqual(r1.parsedAge, 11);
  assert.strictEqual(r1.categoryCode, 'SJ');

  const r2 = parseAgeAndCategory('Twenty six', 'Senior 19+');
  assert.strictEqual(r2.parsedAge, 26);
  assert.strictEqual(r2.categoryCode, 'S');
});

it('calculates age from Date of Birth (29/08/2015 -> 11 years as of Oct 2026)', () => {
  const ref = new Date('2026-10-02');
  const res = parseAgeAndCategory('29/08/2015', 'Sub Junior 6-12', ref);
  assert.strictEqual(res.parsedAge, 11);
  assert.strictEqual(res.categoryCode, 'SJ');
});

it('falls back to form category when age is ambiguous range (13 18)', () => {
  const res = parseAgeAndCategory('13 18', 'Junior 13-18');
  assert.strictEqual(res.categoryCode, 'J');
  assert.strictEqual(res.flags.includes('ambiguous age input'), true);
});

it('categorizes age 5 as Sub Junior but flags below minimum age', () => {
  const res = parseAgeAndCategory('5', 'Sub Junior 6-12');
  assert.strictEqual(res.parsedAge, 5);
  assert.strictEqual(res.categoryCode, 'SJ');
  assert.strictEqual(res.flags.includes('below minimum age'), true);
});

it('trusts number over form category and flags category mismatch', () => {
  // Participant selected Sub Junior, but entered age 15 (Junior)
  const res = parseAgeAndCategory('15', 'Sub Junior 6-12');
  assert.strictEqual(res.parsedAge, 15);
  assert.strictEqual(res.categoryCode, 'J');
  assert.strictEqual(res.flags.includes('age_category_mismatch'), true);
});

// 3. Participant Identity & Merging
console.log('\n[Participant Identity & Deduplication Tests]');
it('identifies same person with normalized name and same phone', () => {
  const p1 = { normName: 'sairagamalika', phone: '9550554378', rawName: 'Sai Ragamalika', age: 20 };
  const p2 = { normName: 'sairagamalika', phone: '9550554378', rawName: 'Sai Ragamalika', age: 20 };
  assert.strictEqual(isSamePerson(p1, p2), true);
});

it('identifies same person when one name is contained in other (Sai Ragamalika vs Sai Ragamalika Tolety)', () => {
  const p1 = { normName: 'sairagamalika', phone: '9550554378', rawName: 'Sai Ragamalika', age: 20 };
  const p2 = { normName: 'sairagamalikatolety', phone: '9550554378', rawName: 'Sai Ragamalika Tolety', age: 20 };
  assert.strictEqual(isSamePerson(p1, p2), true);
});

it('does NOT merge siblings who share parent phone with different names and ages', () => {
  const child1 = { normName: 'aaravsharma', phone: '9848011223', rawName: 'Aarav Sharma', age: 8 };
  const child2 = { normName: 'ananyasharma', phone: '9848011223', rawName: 'Ananya Sharma', age: 14 };
  assert.strictEqual(isSamePerson(child1, child2), false);
});

// 4. Multi-Select Parsing
console.log('\n[Multi-Select Parsing Tests]');
it('splits multi-select string with comma inside description properly', () => {
  const raw = 'Nritya - Classical Dance, Swaram - Singing';
  const parsed = parseMultiSelect(raw);
  assert.strictEqual(parsed.length, 2);
  assert.strictEqual(parsed[0].shortName, 'Nritya');
  assert.strictEqual(parsed[0].fullName, 'Nritya - Classical Dance');
  assert.strictEqual(parsed[1].shortName, 'Swaram');
  assert.strictEqual(parsed[1].fullName, 'Swaram - Singing');
});

it('accepts Wonder Women items without hyphen (e.g. Bommala Koluvu)', () => {
  const raw = 'Bommala Koluvu, Avakai';
  const parsed = parseMultiSelect(raw);
  assert.strictEqual(parsed.length, 2);
  assert.strictEqual(parsed[0].shortName, 'Bommala Koluvu');
  assert.strictEqual(parsed[1].shortName, 'Avakai');
});

// 5. Crown Categories Validation
console.log('\n[Crown Category Tests]');
it('validates Crown category age and gender requirements and flags violations', () => {
  // Mr. Vijayawada requires age 20-60 and male
  const mrOk = validateCrownEntry('Mr. Vijayawada', 25, 'Male', 'Rajesh Kumar');
  assert.strictEqual(mrOk.flags.length, 0);

  const mrWrongGender = validateCrownEntry('Mr. Vijayawada', 25, 'Female', 'Geetha Rani');
  assert.strictEqual(mrWrongGender.flags.includes('gender mismatch (expected male)'), true);

  const mrUnderage = validateCrownEntry('Mr. Vijayawada', 17, 'Male', 'Kishore');
  assert.strictEqual(mrUnderage.flags.includes('age outside range (20-60)'), true);

  // Two names in single non-couple entry
  const twoNames = validateCrownEntry('Miss Vijayawada', 22, 'Female', 'Sita and Gita');
  assert.strictEqual(twoNames.flags.includes('two names in single entry'), true);
});

// 6. Wonder Women Link Validation
console.log('\n[Wonder Women Link Tests]');
it('flags unclear link values such as Yes, No, N/A, None', () => {
  assert.strictEqual(validateWonderWomenLink('Yes').isValidLink, false);
  assert.strictEqual(validateWonderWomenLink('No').isValidLink, false);
  assert.strictEqual(validateWonderWomenLink('N/A').isValidLink, false);
  assert.strictEqual(validateWonderWomenLink('none').isValidLink, false);

  const validUrl = validateWonderWomenLink('https://drive.google.com/open?id=12345');
  assert.strictEqual(validUrl.isValidLink, true);
  assert.strictEqual(validUrl.flag, null);
});

// 7. Aggregation & Deduplication vs Merge Tests
console.log('\n[Aggregation, Merge & ID Tests]');
const { processGeneralSheet, aggregateAllSheets } = require('../lib/data-processor');

it('removes exact repeats and keeps latest row', () => {
  const headers = ['Registration ID', 'Timestamp', 'Full name', 'Age (category)', 'Age in Number', 'Gender', 'Contact number', 'Location', 'Vijayawada Idol (Solo)', 'Vijayawada Champs (Group)', 'Vijayawada Got Talent', 'The Vijayawada Quiz', 'Family Talent', 'Link', 'Col14', 'Col15', 'Col16', 'Institution/Organisation'];
  const row1 = ['', '24/09/2026 10:00:00', 'Ravi Varma', 'Senior 19+', '22', 'Male', '9848011111', 'Vijayawada', 'Swaram - Classical Singing', '', '', '', '', '', '', '', '', 'KL University'];
  const row2 = ['', '24/09/2026 12:00:00', 'Ravi Varma', 'Senior 19+', '22', 'Male', '9848011111', 'Vijayawada', 'Swaram - Classical Singing', '', '', '', '', '', '', '', '', 'KL University'];

  const res = processGeneralSheet([headers, row1, row2]);
  assert.strictEqual(res.participants.length, 1);
  assert.strictEqual(res.stats.removedRepeats, 1);
  assert.strictEqual(res.participants[0].submissions.length, 2);
  assert.strictEqual(res.participants[0].timestamp.getHours(), 12);
});

it('merges different competition submissions into one participant with union of entries', () => {
  const headers = ['Registration ID', 'Timestamp', 'Full name', 'Age (category)', 'Age in Number', 'Gender', 'Contact number', 'Location', 'Vijayawada Idol (Solo)', 'Vijayawada Champs (Group)', 'Vijayawada Got Talent', 'The Vijayawada Quiz', 'Family Talent', 'Link', 'Col14', 'Col15', 'Col16', 'Institution/Organisation'];
  const row1 = ['', '24/09/2026 10:00:00', 'Ananya Rao', 'Junior 13-18', '15', 'Female', '9848022222', 'Vijayawada', 'Nritya - Classical Dance', '', '', '', '', '', '', '', '', 'Nalanda'];
  const row2 = ['', '25/09/2026 11:00:00', 'Ananya Rao', 'Junior 13-18', '15', 'Female', '9848022222', 'Vijayawada', '', '', 'Abhinaya - Mono Acting', '', '', '', '', '', '', 'Nalanda'];

  const res = processGeneralSheet([headers, row1, row2]);
  assert.strictEqual(res.participants.length, 1);
  assert.strictEqual(res.stats.mergedPeople, 1);
  assert.strictEqual(res.participants[0].competitions.Idol.length, 1);
  assert.strictEqual(res.participants[0].competitions.Talent.length, 1);
  assert.strictEqual(res.participants[0].entryCount, 2);
});

it('assigns running sequence IDs ordered by first timestamp and preserves category prefix', () => {
  const headers = ['Registration ID', 'Timestamp', 'Full name', 'Age (category)', 'Age in Number', 'Gender', 'Contact number', 'Location', 'Vijayawada Idol (Solo)', 'Vijayawada Champs (Group)', 'Vijayawada Got Talent', 'The Vijayawada Quiz', 'Family Talent', 'Link', 'Col14', 'Col15', 'Col16', 'Institution/Organisation'];
  const row1 = ['', '24/09/2026 09:00:00', 'Senior Person', 'Senior 19+', '25', 'Female', '9848033331', 'Vijayawada', 'Swaram - Classical Singing', '', '', '', '', '', '', '', '', ''];
  const row2 = ['', '24/09/2026 09:10:00', 'SubJunior Person', 'Sub Junior 6-12', '9', 'Male', '9848033332', 'Vijayawada', 'Swaram - Classical Singing', '', '', '', '', '', '', '', '', ''];
  const row3 = ['', '24/09/2026 09:20:00', 'Junior Person', 'Junior 13-18', '14', 'Female', '9848033333', 'Vijayawada', 'Swaram - Classical Singing', '', '', '', '', '', '', '', '', ''];

  const res = processGeneralSheet([headers, row1, row2, row3]);
  assert.strictEqual(res.participants[0].id, 'VUS0001');
  assert.strictEqual(res.participants[1].id, 'VUSJ0002');
  assert.strictEqual(res.participants[2].id, 'VUJ0003');
});

console.log(`\n🎉 All ${passedTests}/${totalTests} Unit Tests Passed!`);
