/**
 * Issue #15, held-out cases for contract section 11a (unlabelled EU Survey
 * preamble). Synthetic fixtures only; expected values from the contract.
 *
 * Run: node tests/test_issue15_heldout2.js [testName ...]
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const SurveyAuditor = require('../src/survey_validator.js');

const ROOT = path.resolve(__dirname, '..');
const DICT = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'master_dictionary.json'), 'utf8'));

function audit(rows, options) {
  return new SurveyAuditor(DICT).auditSheet(rows, options);
}

function layoutOf(rows) {
  const got = SurveyAuditor.detectExportLayout(rows);
  return { format: got.format, headerRowIndex: got.headerRowIndex, dataStartIndex: got.dataStartIndex };
}

// Unlabelled preamble, alias mentor_NO in A1, export date number in A2,
// three-column header (country words in the header are absent).
function testUnlabelledPreambleMentorNoThreeColumns() {
  const rows = [
    ['mentor_NO'],
    [46001.5],
    [],
    ['What gender do you identify as? (gender1)', 'Where were you born? (born2)', 'Notes'],
    ['Boy', 'Norge', 'a'],
    ['Girl', 'Polen', null],
    ['Boy', null, 'c'],
    ['Girl', 'Norge', 'd']
  ];
  assert.deepStrictEqual(layoutOf(rows), { format: 'eusurvey', headerRowIndex: 3, dataStartIndex: 4 });
  assert.deepStrictEqual(SurveyAuditor.detectSurveyCountry(rows), { name: 'Norway', source: 'alias' });
  const meta = audit(rows).summary.metadata;
  assert.strictEqual(meta.dataRowCount, 4, `dataRowCount ${meta.dataRowCount}, expected 4 (wrong answer 7)`);
  assert.strictEqual(meta.country, 'Norway');
  assert.strictEqual(meta.countrySource, 'alias');
  const result = audit(rows, { country: 'Norway' });
  const g = result.columns.find(c => c.colIndex === 0);
  assert.ok(g && g.canonical && g.canonical.variable === 'gender1', 'gender1 column matched');
}

// Labelled A2 only ("Export Date") with an unlabelled alias in A1: also EU Survey.
function testExportDateLabelOnlyIsEuSurvey() {
  const rows = [
    ['MentorCY2026', null],
    ['Export Date', 46327],
    [null, null],
    ['What gender do you identify as? (gender1)', 'Notes'],
    ['Boy', 'x'],
    ['Girl', 'y']
  ];
  assert.deepStrictEqual(layoutOf(rows), { format: 'eusurvey', headerRowIndex: 3, dataStartIndex: 4 });
  assert.deepStrictEqual(SurveyAuditor.detectSurveyCountry(rows), { name: 'Cyprus', source: 'alias' });
  assert.strictEqual(audit(rows).summary.metadata.dataRowCount, 2);
}

// A plain file with a 2-column header and 3 rows (fewer than 4) stays plain.
function testPlainTwoColumnThreeRowsStaysPlain() {
  const rows = [
    ['What gender do you identify as? (gender1)', 'Notes'],
    ['Boy', 'x'],
    ['Girl', 'y']
  ];
  assert.deepStrictEqual(layoutOf(rows), { format: 'plain', headerRowIndex: 0, dataStartIndex: 1 });
  assert.strictEqual(audit(rows).summary.metadata.dataRowCount, 2);
}

const TESTS = [
  testUnlabelledPreambleMentorNoThreeColumns,
  testExportDateLabelOnlyIsEuSurvey,
  testPlainTwoColumnThreeRowsStaysPlain
];

function runTests() {
  console.log('--- Starting issue #15 held-out tests (2) ---');
  const only = process.argv.slice(2);
  let failed = 0;
  for (const test of TESTS) {
    if (only.length && !only.includes(test.name)) continue;
    try {
      test();
      console.log(`PASS ${test.name}`);
    } catch (err) {
      failed++;
      console.log(`FAIL ${test.name}: ${err.message.split('\n').slice(0, 12).join('\n    ')}`);
    }
  }
  if (failed) {
    console.log(`${failed} held-out test(s) failed.`);
    process.exit(1);
  }
  console.log('All held-out tests passed.');
}

if (require.main === module) runTests();
module.exports = { TESTS };
