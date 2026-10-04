/**
 * Data Cleaning, Normalization, Deduplication, and ID Generation Rules
 * for Vijayawada Utsav 2026 Registration Dashboard.
 */

// Mapping English words to numbers (0 - 99)
const WORD_TO_NUM = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, 'twenty one': 21, 'twenty two': 22,
  'twenty three': 23, 'twenty four': 24, 'twenty five': 25, 'twenty six': 26, 'twenty seven': 27,
  'twenty eight': 28, 'twenty nine': 29, thirty: 30, 'thirty one': 31, 'thirty two': 32,
  'thirty three': 33, 'thirty four': 34, 'thirty five': 35, 'thirty six': 36, 'thirty seven': 37,
  'thirty eight': 38, 'thirty nine': 39, forty: 40, 'forty one': 41, 'forty two': 42,
  'forty three': 43, 'forty four': 44, 'forty five': 45, 'forty six': 46, 'forty seven': 47,
  'forty eight': 48, 'forty nine': 49, fifty: 50, 'fifty one': 51, 'fifty two': 52,
  'fifty three': 53, 'fifty four': 54, 'fifty five': 55, 'fifty six': 56, 'fifty seven': 57,
  'fifty eight': 58, 'fifty nine': 59, sixty: 60, 'sixty one': 61, 'sixty two': 62,
  'sixty three': 63, 'sixty four': 64, 'sixty five': 65, 'sixty six': 66, 'sixty seven': 67,
  'sixty eight': 68, 'sixty nine': 69, seventy: 70, eighty: 80, ninety: 90
};

/**
 * Clean and normalize phone numbers.
 * Keep last 10 digits. Flag two numbers or invalid phones.
 */
function cleanPhone(rawPhone) {
  if (!rawPhone || typeof rawPhone !== 'string') {
    rawPhone = String(rawPhone || '');
  }
  const raw = rawPhone.trim();
  const flags = [];

  // Check for two numbers indicators (slashes, commas, &, and, newline, or multiple 10-digit chunks)
  const matches = raw.match(/\b\d{10}\b/g) || [];
  const hasSeparators = /[\/,\n&]|(?:\s+and\s+)|\bor\b/i.test(raw);

  if (matches.length > 1 || (hasSeparators && raw.replace(/\D/g, '').length >= 18)) {
    flags.push('two numbers');
  }

  // Extract clean digits
  const allDigits = raw.replace(/\D/g, '');
  let phone = '';

  if (matches.length > 0) {
    phone = matches[0];
  } else if (allDigits.length >= 10) {
    phone = allDigits.slice(-10);
  } else {
    phone = allDigits;
  }

  if (phone.length < 10) {
    flags.push(phone.length === 0 ? 'missing phone' : 'invalid phone');
  }

  return {
    raw,
    phone,
    flags,
    isTwoNumbers: flags.includes('two numbers'),
    isInvalid: flags.includes('invalid phone') || flags.includes('missing phone')
  };
}

/**
 * Parse messy age inputs into a numeric age and age category.
 * Handles "12years", "10 years", "8 yrs", words ("Eleven", "Twenty six"),
 * dates of birth ("29/08/2015"), and ambiguous category ranges ("13 18").
 */
function parseAgeAndCategory(ageNumberRaw, ageCatRaw, refDate = new Date('2026-10-02')) {
  let parsedAge = null;
  let categoryCode = null; // 'SJ', 'J', 'S'
  let categoryName = null; // 'Sub Junior', 'Junior', 'Senior'
  const flags = [];

  // Clean raw inputs
  const numStr = String(ageNumberRaw || '').trim();
  const catStr = String(ageCatRaw || '').trim();

  // Normalize category fallback from form input if available
  let fallbackCatCode = null;
  if (/sub\s*junior|6\s*[-–to]\s*12/i.test(catStr)) {
    fallbackCatCode = 'SJ';
  } else if (/junior|13\s*[-–to]\s*18/i.test(catStr)) {
    fallbackCatCode = 'J';
  } else if (/senior|19\s*\+/i.test(catStr)) {
    fallbackCatCode = 'S';
  }

  // Check if age input is ambiguous range like "13 18", "6 12", "13-18"
  if (/^(?:6\s*[-–to\s]\s*12|13\s*[-–to\s]\s*18|19\s*\+)$/i.test(numStr)) {
    categoryCode = fallbackCatCode || (numStr.startsWith('6') ? 'SJ' : numStr.startsWith('13') ? 'J' : 'S');
    flags.push('ambiguous age input');
  } else {
    // 1. Check Date of Birth format (e.g. 29/08/2015, 29-08-2015, 2015-08-29)
    const dobMatch = numStr.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/) ||
                     numStr.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
    if (dobMatch) {
      let d, m, y;
      if (dobMatch[1].length === 4) {
        y = parseInt(dobMatch[1], 10);
        m = parseInt(dobMatch[2], 10) - 1;
        d = parseInt(dobMatch[3], 10);
      } else {
        d = parseInt(dobMatch[1], 10);
        m = parseInt(dobMatch[2], 10) - 1;
        y = parseInt(dobMatch[3], 10);
      }
      const dob = new Date(y, m, d);
      if (!isNaN(dob.getTime())) {
        let age = refDate.getFullYear() - dob.getFullYear();
        const mDiff = refDate.getMonth() - dob.getMonth();
        if (mDiff < 0 || (mDiff === 0 && refDate.getDate() < dob.getDate())) {
          age--;
        }
        if (age >= 0 && age < 120) {
          parsedAge = age;
        }
      }
    }

    // 2. Check Words (e.g. "eleven", "twenty six", "twenty-six")
    if (parsedAge === null) {
      const lower = numStr.toLowerCase().replace(/[-]/g, ' ').replace(/\s+/g, ' ').trim();
      if (WORD_TO_NUM[lower] !== undefined) {
        parsedAge = WORD_TO_NUM[lower];
      }
    }

    // 3. Check Regex for standard number + optional years suffix ("12years", "10 years", "8 yrs")
    if (parsedAge === null) {
      const digitMatch = numStr.match(/^(\d{1,2})(?:\s*(?:years?|yrs?|yr|y))?$/i) ||
                         numStr.match(/(\d{1,2})/);
      if (digitMatch) {
        const val = parseInt(digitMatch[1], 10);
        if (val > 0 && val < 110) {
          parsedAge = val;
        }
      }
    }

    // Assign category based on parsed numeric age (Always trust number over form category)
    if (parsedAge !== null) {
      if (parsedAge < 6) {
        categoryCode = 'SJ';
        flags.push('below minimum age');
      } else if (parsedAge <= 12) {
        categoryCode = 'SJ';
      } else if (parsedAge <= 18) {
        categoryCode = 'J';
      } else {
        categoryCode = 'S';
      }

      // Check category mismatch
      if (fallbackCatCode && fallbackCatCode !== categoryCode) {
        flags.push('age_category_mismatch');
      }
    } else {
      // Unparseable age: fall back to form category
      categoryCode = fallbackCatCode || 'S';
      flags.push('age unclear');
    }
  }

  // Map category code to human readable name
  categoryName = categoryCode === 'SJ' ? 'Sub Junior' : categoryCode === 'J' ? 'Junior' : 'Senior';

  return {
    parsedAge,
    categoryCode,
    categoryName,
    flags
  };
}

/**
 * Normalize names for deduplication & comparisons:
 * lowercase, alphanumeric only.
 */
function normalizeName(name) {
  if (!name) return '';
  return String(name).toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Check if two records represent the exact same person.
 * Criteria:
 * 1. Same normalized name + same 10-digit phone
 * 2. OR same phone + same age + (same last name token OR one name contains the other)
 * 3. Crucially: Do NOT merge siblings who share parent phone (different names and ages).
 */
function isSamePerson(p1, p2) {
  // If phones are different (and valid), not the same person
  if (p1.phone && p2.phone && p1.phone.length === 10 && p2.phone.length === 10) {
    if (p1.phone !== p2.phone) return false;
  } else {
    // If no valid phone, must match normalized name exactly
    return p1.normName && p2.normName && p1.normName === p2.normName;
  }

  // Phones match here!
  // Exact name match
  if (p1.normName && p2.normName && p1.normName === p2.normName) {
    return true;
  }

  // Fuzzy match on same phone:
  // Must have same age (or both missing)
  const ageMatch = (p1.age !== null && p2.age !== null && p1.age === p2.age) ||
                   (p1.age === null && p2.age === null);

  if (ageMatch && p1.normName && p2.normName) {
    // Check if one name is a substring of the other (e.g. "Sai Ragamalika" vs "Sai Ragamalika Tolety")
    if (p1.normName.includes(p2.normName) || p2.normName.includes(p1.normName)) {
      return true;
    }

    // Check last name token
    const tokens1 = String(p1.rawName || '').trim().toLowerCase().split(/\s+/);
    const tokens2 = String(p2.rawName || '').trim().toLowerCase().split(/\s+/);
    const last1 = tokens1[tokens1.length - 1];
    const last2 = tokens2[tokens2.length - 1];

    if (last1 && last2 && last1 === last2 && last1.length > 2) {
      return true;
    }
  }

  // Different names and different ages on same phone = Siblings (Do NOT merge)
  return false;
}

/**
 * Split multi-select competition entries.
 * Splitting regex: /,\s*(?=[^,-]+ - )/ when items have descriptions like "Nritya - Classical Dance"
 * When items do not contain " - " (like Wonder Women categories), split by comma.
 * Returns array of objects with shortName and fullText.
 */
function parseMultiSelect(rawText) {
  if (!rawText || typeof rawText !== 'string') return [];
  const trimmed = rawText.trim();
  if (!trimmed) return [];

  let splitItems = [];
  if (trimmed.includes(' - ')) {
    splitItems = trimmed.split(/,\s*(?=[^,-]+ - )/);
  } else {
    splitItems = trimmed.split(/,\s*/);
  }

  return splitItems.map(item => {
    const full = item.trim();
    if (full.includes(' - ')) {
      const parts = full.split(' - ');
      const shortName = parts[0].trim();
      return { shortName, fullName: full };
    }
    return { shortName: full, fullName: full };
  }).filter(item => item.shortName.length > 0);
}

/**
 * Validate and flag Crown of Vijayawada categories.
 * 7 categories:
 * - Little Vijayawada (6–12)
 * - Teen Vijayawada (13–19)
 * - Miss Vijayawada (20+ unmarried women)
 * - Mrs. Vijayawada (18+ married women)
 * - Mr. Vijayawada (men 20–60)
 * - Couple Vijayawada
 * - Golden Face Vijayawada (60+)
 */
function validateCrownEntry(categoryRaw, age, gender, rawName) {
  const flags = [];
  const cat = String(categoryRaw || '').trim();
  const lowerCat = cat.toLowerCase();
  const g = String(gender || '').trim().toLowerCase();
  const isFemale = g.startsWith('f') || g.includes('woman') || g.includes('women');
  const isMale = !isFemale && (g.startsWith('m') || g.includes('man') || g.includes('men'));

  if (!cat) {
    flags.push('category missing');
  }

  // Two names in one entry (unless Couple)
  const isCouple = lowerCat.includes('couple');
  if (!isCouple && rawName && /(&|\band\b|\/|\+|\bwith\b|,)/i.test(rawName)) {
    flags.push('two names in single entry');
  }

  if (lowerCat.includes('little')) {
    if (age !== null && (age < 6 || age > 12)) flags.push('age outside range (6-12)');
  } else if (lowerCat.includes('teen')) {
    if (age !== null && (age < 13 || age > 19)) flags.push('age outside range (13-19)');
  } else if (lowerCat.includes('miss')) {
    if (age !== null && age < 20) flags.push('age outside range (20+)');
    if (!isFemale) flags.push('gender mismatch (expected female)');
  } else if (lowerCat.includes('mrs')) {
    if (age !== null && age < 18) flags.push('age outside range (18+)');
    if (!isFemale) flags.push('gender mismatch (expected female)');
  } else if (lowerCat.includes('mr.')) {
    if (age !== null && (age < 20 || age > 60)) flags.push('age outside range (20-60)');
    if (!isMale) flags.push('gender mismatch (expected male)');
  } else if (lowerCat.includes('golden')) {
    if (age !== null && age < 60) flags.push('age outside range (60+)');
  }

  return {
    category: cat,
    flags
  };
}

/**
 * Validate Wonder Women link field.
 * Flags unclear values like "Yes", "No", "N/A", "Nil", etc.
 */
function validateWonderWomenLink(rawLink) {
  if (!rawLink || typeof rawLink !== 'string') {
    return { link: '', isValidLink: false, flag: 'missing link' };
  }
  const clean = rawLink.trim();
  const lower = clean.toLowerCase();
  const unclearWords = ['yes', 'no', 'na', 'n/a', 'nil', 'none', 'ok', 'applied', 'submitted'];
  if (unclearWords.includes(lower) || clean.length <= 3) {
    return { link: clean, isValidLink: false, flag: 'unclear link value' };
  }
  const isUrl = /^https?:\/\//i.test(clean) || /^(?:drive\.google|instagram|youtube|youtu\.be|facebook|facebook\.com)/i.test(clean);
  return {
    link: clean,
    isValidLink: true,
    flag: isUrl ? null : 'social handle/non-standard link'
  };
}

/**
 * Parse timestamp format: dd/MM/yyyy HH:mm:ss or ISO
 */
function parseTimestamp(tsStr) {
  if (!tsStr) return new Date();
  const s = String(tsStr).trim();
  // dd/MM/yyyy HH:mm:ss
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
  if (m) {
    const day = parseInt(m[1], 10);
    const month = parseInt(m[2], 10) - 1;
    const year = parseInt(m[3], 10);
    const hour = parseInt(m[4] || '0', 10);
    const min = parseInt(m[5] || '0', 10);
    const sec = parseInt(m[6] || '0', 10);
    return new Date(year, month, day, hour, min, sec);
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? new Date() : d;
}

module.exports = {
  cleanPhone,
  parseAgeAndCategory,
  normalizeName,
  isSamePerson,
  parseMultiSelect,
  validateCrownEntry,
  validateWonderWomenLink,
  parseTimestamp,
  WORD_TO_NUM
};
