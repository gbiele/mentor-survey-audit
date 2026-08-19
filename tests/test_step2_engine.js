/**
 * Independent automated test for Step 2: Client-Side Validation & Mapping Engine
 * (Canonical MENTOR Master Specification)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const SurveyAuditor = require('../src/survey_validator.js');

const ROOT = path.resolve(__dirname, '..');
const DICT_PATH = path.join(ROOT, 'src', 'master_dictionary.json');
const FHI_EXPORT_PATH = path.join(ROOT, 'data', 'Content_Export_mentor_fhi_variabler_og_id.xlsx');

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
  assert.strictEqual(dict.variables.length, 143, 'Dictionary contains 143 canonical variables');
  console.log('✓ Master dictionary loaded successfully (143 variables)');

  // Initialize Auditor
  const auditor = new SurveyAuditor(dict);

  // Test 2: Audit Canonical FHI Export (Content_Export_mentor_fhi_variabler_og_id.xlsx)
  assert(fs.existsSync(FHI_EXPORT_PATH), 'FHI export exists');
  const fhiRows = loadExcelRows(FHI_EXPORT_PATH);
  const fhiResult = auditor.auditSheet(fhiRows);

  console.log('FHI export audit summary:', fhiResult.summary);
  assert.strictEqual(fhiResult.summary.totalColumns, 143, 'FHI export should have 143 columns');
  assert.strictEqual(fhiResult.summary.fullyIdentified, 142, 'Expected 142 fully identified columns');
  assert.strictEqual(fhiResult.summary.incomplete, 0, 'Expected 0 incomplete columns in canonical FHI export');
  assert.strictEqual(fhiResult.summary.missingOptions, 0, 'Expected 0 missing options in canonical FHI export');
  assert.strictEqual(fhiResult.summary.openEnded, 1, 'Expected 1 open-ended free text column (ID27)');
  assert.strictEqual(fhiResult.summary.totalIssues, 0, 'Expected 0 total issues in canonical FHI export');
  console.log('✓ Canonical FHI export audit passed with 100% recognition and 0 issues');

  // Test 3: Check variable identification
  const colGender = fhiResult.columns[0];
  assert.strictEqual(colGender.cleanedText, 'What gender do you identify as?');
  assert.strictEqual(colGender.extractedId, 'gender1');
  assert.strictEqual(colGender.canonical.variable, 'gender1');

  const colAce01 = fhiResult.columns.find(c => c.extractedId === 'ace01');
  assert(colAce01, 'ace01 must be recognized');
  assert.strictEqual(colAce01.canonical.section, 'Adverse childhood experiences');

  const colCyrm01 = fhiResult.columns.find(c => c.extractedId === 'cyrm01');
  assert(colCyrm01, 'cyrm01 must be recognized');
  assert.strictEqual(colCyrm01.canonical.section, 'Resilience');

  const colKs01 = fhiResult.columns.find(c => c.extractedId === 'ks01');
  assert(colKs01, 'ks01 must be recognized');
  assert.strictEqual(colKs01.canonical.section, 'Quality of life');

  const colSmwd1 = fhiResult.columns.find(c => c.extractedId === 'some_week1');
  assert(colSmwd1, 'some_week1 must be recognized');
  assert.strictEqual(colSmwd1.canonical.section, 'Social media and gaming');

  console.log('✓ Key canonical module variables verified across sections');
  console.log('\n========================================');
  console.log('ALL STEP 2 VALIDATION ENGINE TESTS PASSED');
  console.log('========================================\n');
}

runTests();
