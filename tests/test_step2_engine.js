/**
 * Independent automated test for Step 2: Client-Side Validation & Mapping Engine
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const SurveyAuditor = require('../src/survey_validator.js');

const ROOT = path.resolve(__dirname, '..');
const DICT_PATH = path.join(ROOT, 'src', 'master_dictionary.json');
const GER_PLAIN_PATH = path.join(ROOT, 'data', 'Content_Export_MENTORMasterGER1_Test-GER-1.xlsx');

function loadExcelRows(filePath) {
  const workbook = XLSX.readFile(filePath);
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  return XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null });
}

function runTests() {
  console.log('--- Starting Step 2 Validation Engine Test Suite ---');

  // Test 1: Load Master Dictionary
  assert(fs.existsSync(DICT_PATH), 'Master dictionary file exists');
  const dict = JSON.parse(fs.readFileSync(DICT_PATH, 'utf-8'));
  assert.strictEqual(dict.variables.length, 229, 'Dictionary contains 229 canonical variables');
  console.log('✓ Master dictionary loaded successfully');

  // Initialize Auditor
  const auditor = new SurveyAuditor(dict);

  // Test 2: Audit Plain Label Export (Content_Export_MENTORMasterGER1_Test-GER-1.xlsx)
  assert(fs.existsSync(GER_PLAIN_PATH), 'Plain test export exists');
  const plainRows = loadExcelRows(GER_PLAIN_PATH);
  const plainResult = auditor.auditSheet(plainRows);

  console.log('Plain export audit summary:', plainResult.summary);
  assert.strictEqual(plainResult.summary.totalColumns, 174, 'Plain export should have 174 columns');
  assert.strictEqual(plainResult.summary.metadata.dataRowCount, 5, 'Should detect 5 survey data rows');
  assert.strictEqual(plainResult.summary.fullyIdentified, 153, 'Expected 153 fully identified columns');
  assert.strictEqual(plainResult.summary.incomplete, 11, 'Expected 11 incomplete columns');
  assert.strictEqual(plainResult.summary.missingOptions, 6, 'Expected 6 missing options columns');
  assert.strictEqual(plainResult.summary.openEnded, 4, 'Expected 4 open-ended columns');
  assert.strictEqual(plainResult.summary.totalIssues, 17, 'Expected 17 total flagged issues');
  console.log('✓ Plain label export audit passed with exact status distribution');

  // Test 3: Header Matching & Disambiguation of Duplicate Question Stems (smafreq1 vs igdfreq1)
  const col134 = plainResult.columns[133];
  const col147 = plainResult.columns[146];

  assert.strictEqual(col134.canonical.variable, 'smafreq1', 'Column 134 must resolve to smafreq1');
  assert.strictEqual(col134.canonical.orig_variable, 'ID27');
  assert.strictEqual(col134.canonical.section, 'German-only · Social media follow-up');

  assert.strictEqual(col147.canonical.variable, 'igdfreq1', 'Column 147 must resolve to igdfreq1');
  assert.strictEqual(col147.canonical.orig_variable, 'ID383');
  assert.strictEqual(col147.canonical.section, 'German-only · Gaming follow-up (DE)');
  console.log('✓ Duplicate question stem disambiguation verified (smafreq1 vs igdfreq1)');

  // Test 4: Variable Header Matching & Option Resolution
  const genderCol = plainResult.columns[0];
  assert.strictEqual(genderCol.cleanedText, 'What gender do you identify as?');
  assert.strictEqual(genderCol.status, 'fully_identified');
  assert.strictEqual(genderCol.canonical.variable, 'gender1');
  assert.strictEqual(genderCol.canonical.scale, 'nominal');
  console.log('✓ Header matching and canonical resolution verified');

  // Test 5: Incomplete and Missing Option Classifications
  const missingCols = plainResult.columns.filter(c => c.status === 'missing_options');
  assert.strictEqual(missingCols.length, 6);
  for (const c of missingCols) {
    assert(c.issues.length > 0, 'Missing options columns must contain issue descriptions');
  }

  const incompleteCols = plainResult.columns.filter(c => c.status === 'incomplete');
  assert.strictEqual(incompleteCols.length, 11);
  for (const c of incompleteCols) {
    assert(c.issues.length > 0, 'Incomplete columns must contain issue descriptions');
  }
  console.log('✓ Flagged discrepancies and issue descriptions verified');

  console.log('\n========================================');
  console.log('ALL STEP 2 TESTS PASSED GREEN (5/5)');
  console.log('========================================\n');
}

try {
  runTests();
  process.exit(0);
} catch (err) {
  console.error('Test failed with error:', err);
  process.exit(1);
}
