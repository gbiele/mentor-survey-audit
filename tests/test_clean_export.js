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

  console.log('All cleaned-export tests passed.');
}

runTests();
