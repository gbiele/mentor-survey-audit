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
const GER_ID_TAGGED_PATH = path.join(ROOT, 'data', 'MENTORMaster_TEST_GER_2.xlsx');

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
  assert(plainResult.summary.metadata.dataRowCount >= 5, 'Should detect survey data rows');
  assert.strictEqual(plainResult.summary.metadata.detectedFormat, 'plain_text', 'Format A must be detected as plain_text');
  assert.strictEqual(plainResult.summary.fullyIdentified, 156, 'Expected 156 fully identified columns');
  assert.strictEqual(plainResult.summary.incomplete, 11, 'Expected 11 incomplete columns');
  assert.strictEqual(plainResult.summary.missingOptions, 6, 'Expected 6 missing options columns');
  assert.strictEqual(plainResult.summary.openEnded, 1, 'Expected 1 open-ended free text column (catsoth1)');
  assert.strictEqual(plainResult.summary.totalIssues, 17, 'Expected 17 total flagged issues');
  console.log('✓ Plain label export audit passed with exact status distribution');

  // Test 3: Audit ID-Tagged Platform Export (MENTORMaster_TEST_GER_2.xlsx)
  assert(fs.existsSync(GER_ID_TAGGED_PATH), 'ID-tagged test export exists');
  const idTaggedRows = loadExcelRows(GER_ID_TAGGED_PATH);
  const idTaggedResult = auditor.auditSheet(idTaggedRows);

  console.log('ID-tagged export audit summary:', idTaggedResult.summary);
  assert.strictEqual(idTaggedResult.summary.totalColumns, 174, 'ID-tagged export should have 174 columns');
  assert.strictEqual(idTaggedResult.summary.metadata.detectedFormat, 'id_tagged', 'Format B must be detected as id_tagged');
  assert.strictEqual(idTaggedResult.summary.fullyIdentified, 156, 'Expected 156 fully identified columns in Format B');
  assert.strictEqual(idTaggedResult.summary.incomplete, 11, 'Expected 11 incomplete columns in Format B');
  assert.strictEqual(idTaggedResult.summary.missingOptions, 6, 'Expected 6 missing options columns in Format B');
  assert.strictEqual(idTaggedResult.summary.openEnded, 1, 'Expected 1 open-ended free text column in Format B');
  assert.strictEqual(idTaggedResult.summary.totalIssues, 17, 'Expected 17 total flagged issues in Format B');

  // Verify that observed values are clean labels without raw (IDxxx) string pollution
  const idTaggedGender = idTaggedResult.columns[0];
  assert.strictEqual(idTaggedGender.cleanedText, 'What gender do you identify as?');
  assert.strictEqual(idTaggedGender.extractedId, 'gender1');
  const observedLabels = idTaggedGender.observedValues.map(v => v.label);
  assert(observedLabels.includes('Girl'), 'Observed values must contain clean label "Girl"');
  assert(!observedLabels.includes('Girl (ID3)'), 'Observed values must NOT contain unparsed "Girl (ID3)"');
  console.log('✓ ID-tagged export audit (MENTORMaster_TEST_GER_2.xlsx) passed with clean value normalization');

  // Test 4: Cross-Format Equivalence (All 174 columns match canonically)
  for (let i = 0; i < 174; i++) {
    const colA = plainResult.columns[i];
    const colB = idTaggedResult.columns[i];
    assert(colA.canonical, `Format A column ${i} must have canonical match`);
    assert(colB.canonical, `Format B column ${i} must have canonical match`);
    assert.strictEqual(
      colA.canonical.variable,
      colB.canonical.variable,
      `Column ${i} canonical variable mismatch between Format A and Format B (${colA.canonical.variable} vs ${colB.canonical.variable})`
    );
    assert.strictEqual(
      colA.status,
      colB.status,
      `Column ${i} (${colA.canonical.variable}) status mismatch between Format A and Format B`
    );
  }
  console.log('✓ Cross-format 100% canonical equivalence verified across all 174 columns');

  // Test 5: Disambiguation of Duplicate Question Stems (smafreq1 vs igdfreq1)
  const col134 = plainResult.columns[133];
  const col147 = plainResult.columns[146];

  assert.strictEqual(col134.canonical.variable, 'smafreq1', 'Column 134 must resolve to smafreq1');
  assert.strictEqual(col134.canonical.orig_variable, 'ID27');
  assert.strictEqual(col134.canonical.section, 'German-only · Social media follow-up');

  assert.strictEqual(col147.canonical.variable, 'igdfreq1', 'Column 147 must resolve to igdfreq1');
  assert.strictEqual(col147.canonical.orig_variable, 'ID383');
  assert.strictEqual(col147.canonical.section, 'German-only · Gaming follow-up (DE)');
  console.log('✓ Duplicate question stem disambiguation verified (smafreq1 vs igdfreq1)');

  console.log('\n========================================');
  console.log('ALL STEP 2 DUAL-FORMAT TESTS PASSED GREEN (6/6)');
  console.log('========================================\n');
}

try {
  runTests();
  process.exit(0);
} catch (err) {
  console.error('Test failed with error:', err);
  process.exit(1);
}
