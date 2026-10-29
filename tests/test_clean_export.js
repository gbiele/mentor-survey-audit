/**
 * Export cleaned data: strip trailing ID tags and drop preamble rows.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const SurveyAuditor = require('../src/survey_validator.js');

const ROOT = path.resolve(__dirname, '..');

function assertCleanedExportButton(relativePath) {
  const source = fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
  const issuesAt = source.indexOf('id="btn-export-issues"');
  const cleanedAt = source.indexOf('id="btn-export-cleaned"');
  const sampleAt = source.indexOf('id="btn-load-sample"');
  assert.notStrictEqual(issuesAt, -1, `${relativePath} keeps Export Audit Issues`);
  assert.notStrictEqual(cleanedAt, -1, `${relativePath} contains #btn-export-cleaned`);
  assert.ok(cleanedAt > issuesAt, `${relativePath}: cleaned export follows audit-issues export`);
  assert.ok(sampleAt > cleanedAt, `${relativePath}: cleaned export precedes Load sample data`);
  const button = source.slice(cleanedAt, source.indexOf('</button>', cleanedAt));
  assert.ok(button.includes('Export cleaned data'), `${relativePath} button label`);
  assert.ok(button.includes('window.exportCleanedData'), `${relativePath} click handler`);
  assert.ok(button.includes('btn-export'), `${relativePath} uses the export button style`);

  const scrambledAt = source.indexOf('id="btn-export-scrambled"');
  const scrambledCleanedAt = source.indexOf('id="btn-export-scrambled-cleaned"');
  assert.notStrictEqual(scrambledAt, -1, `${relativePath} contains the scrambled original download`);
  assert.notStrictEqual(scrambledCleanedAt, -1, `${relativePath} contains the scrambled cleaned download`);
  assert.ok(scrambledAt > cleanedAt, `${relativePath}: scrambled sample follows cleaned export`);
  assert.ok(scrambledCleanedAt > scrambledAt, `${relativePath}: scrambled cleaned sample follows scrambled sample`);
  assert.ok(sampleAt > scrambledCleanedAt, `${relativePath}: scrambled downloads precede Load sample data`);

  const scrambledButton = source.slice(scrambledAt, source.indexOf('</button>', scrambledAt));
  const scrambledCleanedButton = source.slice(scrambledCleanedAt, source.indexOf('</button>', scrambledCleanedAt));
  assert.ok(scrambledButton.includes('window.exportScrambledSample'), `${relativePath} scrambled click handler`);
  assert.ok(scrambledCleanedButton.includes('window.exportScrambledCleanedSample'), `${relativePath} scrambled cleaned click handler`);
  assert.ok(scrambledButton.includes('btn-sm'), `${relativePath} scrambled sample uses btn-sm`);
  assert.ok(scrambledCleanedButton.includes('btn-sm'), `${relativePath} scrambled cleaned sample uses btn-sm`);
  assert.ok(scrambledButton.includes('Scrambled sample'), `${relativePath} scrambled sample label`);
  assert.ok(scrambledCleanedButton.includes('Scrambled cleaned sample'), `${relativePath} scrambled cleaned label`);
}

// Output position reads source (n - 1 - out + column). Column 0 is a
// reversal, so a value past row 50 can land in the kept sample and a
// value from the original first 50 can be cut. Later columns shift, so
// one respondent's answers do not stay on the same row.
function fixedPermutation(n, columnIndex) {
  const order = new Array(n);
  for (let out = 0; out < n; out++) {
    order[out] = (n - 1 - out + columnIndex) % n;
  }
  return order;
}

function withoutRandom(fn) {
  const original = Math.random;
  Math.random = function () {
    throw new Error('scramble result depended on Math.random');
  };
  try {
    return fn();
  } finally {
    Math.random = original;
  }
}

function buildSheet(responseCount, format) {
  const columnCount = 3;
  const responses = [];
  for (let r = 0; r < responseCount; r++) {
    responses.push([
      `r${r}c0`,
      `Choice ${r} (ID${r + 1})`,
      `r${r}c2`
    ]);
  }
  if (format === 'qualtrics') {
    return [
      ['StartDate', 'What is your gender? (gender1)', `Notes ${columnCount}`],
      ['Start Date', 'question text', 'notes text'],
      ...responses
    ];
  }
  return [
    ['Alias', 'DEMO'],
    ['Export Date', '2026-01-01'],
    ['Preamble', 'keep me'],
    ['What gender do you identify as? (gender1)', 'City (city1)', 'Notes'],
    ...responses
  ];
}

function assertScrambledSample(actual, sourceRows, layout, label) {
  const dataStart = layout.dataStartIndex;
  const responses = sourceRows.slice(dataStart);
  const kept = Math.min(50, responses.length);
  assert.strictEqual(actual.length, dataStart + kept, `${label} keeps the prefix and the sample only`);
  for (let i = 0; i < dataStart; i++) {
    assert.deepStrictEqual(actual[i], sourceRows[i], `${label} leaves prefix row ${i} unchanged`);
  }
  assert.deepStrictEqual(
    actual[layout.headerRowIndex],
    sourceRows[layout.headerRowIndex],
    `${label} leaves the header unchanged`
  );

  const width = sourceRows[layout.headerRowIndex].length;
  const actualResponses = actual.slice(dataStart);
  for (let c = 0; c < width; c++) {
    const order = fixedPermutation(responses.length, c);
    for (let out = 0; out < kept; out++) {
      assert.strictEqual(
        actualResponses[out][c],
        responses[order[out]][c],
        `${label} permutes column ${c} before keeping row ${out}`
      );
    }
    if (responses.length > 50) {
      const dropped = responses[order[50]][c];
      const keptValues = actualResponses.map(row => row[c]);
      assert.ok(
        !keptValues.includes(dropped),
        `${label} drops the column value that the full permutation places past row 50`
      );
      assert.ok(
        keptValues.includes(responses[responses.length - 1][c]) || order.indexOf(responses.length - 1) >= 50,
        `${label} can keep a response from past the first 50 rows`
      );
    }
  }

  if (responses.length >= 2 && width >= 2) {
    const originalRows = new Set(responses.map(row => JSON.stringify(row)));
    for (const row of actualResponses) {
      assert.ok(
        !originalRows.has(JSON.stringify(row)),
        `${label}: values from one respondent do not stay on the same row`
      );
    }
  }
}

function assertUploadedAndCleaned(format, responseCount) {
  const uploaded = buildSheet(responseCount, format);
  const uploadedLayout = format === 'qualtrics'
    ? { headerRowIndex: 0, dataStartIndex: 2 }
    : { headerRowIndex: 3, dataStartIndex: 4 };
  const cleanedLayout = { headerRowIndex: 0, dataStartIndex: 1 };
  const label = `${format} ${responseCount} responses`;

  const uploadedSample = withoutRandom(() => SurveyAuditor.scrambleExportSample(uploaded, {
    permutation: fixedPermutation
  }));
  assertScrambledSample(uploadedSample, uploaded, uploadedLayout, `${label} uploaded`);

  const cleaned = SurveyAuditor.cleanExportRows(uploaded);
  const cleanedSample = withoutRandom(() => SurveyAuditor.scrambleExportSample(cleaned, {
    permutation: fixedPermutation,
    layout: cleanedLayout
  }));
  assertScrambledSample(cleanedSample, cleaned, cleanedLayout, `${label} cleaned`);

  const flatCleaned = cleanedSample.flat();
  assert.ok(!flatCleaned.includes('Alias'), `${label} cleaned sample has no EU Survey preamble`);
  assert.ok(!flatCleaned.includes('Start Date'), `${label} cleaned sample has no Qualtrics question-text row`);
  assert.ok(!flatCleaned.some(value => typeof value === 'string' && /\(ID\d+\)/.test(value)),
    `${label} cleaned sample is scrambled after tags are stripped`);
  assert.ok(uploadedSample.flat().some(value => typeof value === 'string' && /\(ID\d+\)/.test(value)),
    `${label} uploaded sample keeps answer tags`);
}

function runTests() {
  console.log('--- Starting cleaned-export tests ---');

  assertCleanedExportButton('index.qmd');
  assertCleanedExportButton('docs/index.html');
  console.log('✓ Export cleaned data button is beside Export Audit Issues');

  assert.strictEqual(
    typeof SurveyAuditor.cleanExportRows,
    'function',
    'SurveyAuditor.cleanExportRows must be exported'
  );

  const euRows = [
    ['Alias', 'DEMO'],
    ['Export Date', '2026-01-01'],
    ['Preamble', 'drop me'],
    [
      'What gender do you identify as? (gender1)',
      'Age',
      'Notes',
      'City',
      'Being overly careful or on guard (checking to see who is around you)',
      'Where were you born?',
      'Refusal',
      'Uncertainty'
    ],
    ['Girl (ID3)', 14, 'free text', null, 'ok', '[COUNTRY]', 'Prefer not to answer', "Don't know"],
    ['Boy [ID4]', null, '', 'Oslo {ID9}', 'x', 'Germany', 'No', 'Yes'],
    ['(ID3)', 12.5, 'Girl (ID3) extra', '   ', 'y', 'Spain', 'No', 'Yes'],
    ['Only']
  ];

  const cleaned = SurveyAuditor.cleanExportRows(euRows);
  assert.deepStrictEqual(cleaned, [
    [
      'What gender do you identify as?',
      'Age',
      'Notes',
      'City',
      'Being overly careful or on guard',
      'Where were you born?',
      'Refusal',
      'Uncertainty'
    ],
    ['Girl', 14, 'free text', null, 'ok', '[COUNTRY]', 'Prefer not to answer', "Don't know"],
    ['Boy', null, '', 'Oslo', 'x', 'Germany', 'No', 'Yes'],
    ['', 12.5, 'Girl (ID3) extra', '   ', 'y', 'Spain', 'No', 'Yes'],
    ['Only', null, null, null, null, null, null, null]
  ]);

  const flat = cleaned.flat();
  assert.ok(!flat.includes('Alias'), 'EU Survey alias preamble is omitted');
  assert.ok(!flat.includes('2026-01-01'), 'EU Survey export date is omitted');
  assert.ok(!flat.includes('DEMO'), 'preamble values are omitted');
  assert.strictEqual(typeof cleaned[1][1], 'number');
  assert.strictEqual(cleaned[1][1], 14);
  assert.strictEqual(typeof cleaned[3][1], 'number');
  assert.strictEqual(cleaned[3][1], 12.5);
  console.log('✓ EU Survey preamble dropped and trailing tags stripped without recoding');

  const qualtricsRows = [
    ['StartDate', 'gender1', 'What is your gender? (gender1)'],
    ['Start Date', 'gender', 'question text row'],
    ['2020-01-01', 'Girl (ID3)', 7]
  ];
  assert.deepStrictEqual(SurveyAuditor.cleanExportRows(qualtricsRows), [
    ['StartDate', 'gender1', 'What is your gender?'],
    ['2020-01-01', 'Girl', 7]
  ]);
  console.log('✓ Qualtrics metadata row dropped; header and answer tags stripped');

  assert.strictEqual(
    typeof SurveyAuditor.scrambleExportSample,
    'function',
    'SurveyAuditor.scrambleExportSample must be exported'
  );
  for (const format of ['eusurvey', 'qualtrics']) {
    for (const responseCount of [4, 60]) {
      assertUploadedAndCleaned(format, responseCount);
    }
  }
  console.log('✓ Scrambled samples permute each response column, then keep at most 50 rows');

  console.log('All cleaned-export tests passed.');
}

runTests();
