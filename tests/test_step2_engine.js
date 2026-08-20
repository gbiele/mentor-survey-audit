/**
 * Independent automated test for Step 2: Client-Side Validation & Mapping Engine
 * (Canonical MENTOR Master Specification & Core Survey Coverage Metrics)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const SurveyAuditor = require('../src/survey_validator.js');

const ROOT = path.resolve(__dirname, '..');
const DICT_PATH = path.join(ROOT, 'data', 'master_dictionary.json');
const FHI_EXPORT_PATH = path.join(ROOT, 'data', 'Content_Export_mentor_fhi_variabler_og_id.xlsx');
const GER_EXPORT_PATH = path.join(ROOT, 'data', 'MENTORMaster_TEST_GER_2.xlsx');

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
  const coreVars = dict.variables.filter(v => v.is_core !== false);
  assert.strictEqual(coreVars.length, 143, 'Dictionary contains 143 core canonical variables');
  assert.strictEqual(dict.metadata.total_core_variables, 143, 'Dictionary contains 143 core variables');
  assert(dict.variables.length >= 143, 'Dictionary contains at least 143 total variables');
  console.log(`✓ Master dictionary loaded successfully (143 core variables, ${dict.variables.length} total)`);

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

  // Verify Coverage Metrics on Canonical FHI Export
  const covFhi = fhiResult.summary.coverage;
  assert(covFhi, 'coverage object must be present in audit summary');
  assert.strictEqual(covFhi.totalCore, 143, 'Core total should be 143');
  assert.strictEqual(covFhi.coveredCoreCount, 143, 'All 143 core variables should be covered');
  assert.strictEqual(covFhi.coveredCorePct, '100.0', 'Core coverage should be 100.0%');
  assert.strictEqual(covFhi.missingCoreCount, 0, 'Missing core count should be 0');
  assert.strictEqual(covFhi.missingCorePct, '0.0', 'Missing core percentage should be 0.0%');
  assert.strictEqual(covFhi.extraCount, 0, 'Extra unmapped columns should be 0');
  assert.strictEqual(covFhi.extraPct, '0.0', 'Extra unmapped percentage should be 0.0%');
  console.log('✓ Canonical FHI export audit passed with 100% Core coverage and 0 issues');

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

  // Test 4: Coverage Metrics on German Test Export (MENTORMaster_TEST_GER_2.xlsx)
  if (fs.existsSync(GER_EXPORT_PATH)) {
    const gerRows = loadExcelRows(GER_EXPORT_PATH);
    const gerResult = auditor.auditSheet(gerRows);
    const covGer = gerResult.summary.coverage;

    assert(covGer, 'coverage object must be present for German export');
    assert.strictEqual(covGer.totalCore, 143);
    assert.strictEqual(covGer.coveredCoreCount, 88, 'German test export fielded 88 core survey variables');
    assert.strictEqual(covGer.coveredCorePct, '61.5', '88 / 143 = 61.5%');
    assert.strictEqual(covGer.missingCoreCount, 55, '55 core survey variables were not fielded');
    assert.strictEqual(covGer.missingCorePct, '38.5', '55 / 143 = 38.5%');
    assert.strictEqual(covGer.extraCount, 86, 'German test export has 86 country-specific/unmapped columns');
    assert.strictEqual(covGer.extraPct, '49.4', '86 / 174 = 49.4%');
    console.log('✓ German test export coverage calculation verified (88 covered, 55 missing core, 86 extra/unmapped)');
  }

  console.log('\n========================================');
  console.log('ALL STEP 2 VALIDATION ENGINE TESTS PASSED');
  console.log('========================================\n');
}

runTests();
