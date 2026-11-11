/**
 * Issue #15 held-out cases: the same contract as the visible tests, with
 * other inputs. Expected values follow the contract rules (Part A, sections
 * 1-4) and data/master_dictionary.json.
 *
 * Run: node tests/test_issue15_heldout.js [testName ...]
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const SurveyAuditor = require('../src/survey_validator.js');

const ROOT = path.resolve(__dirname, '..');
const DICT = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'master_dictionary.json'), 'utf8'));
const BAGE_STEM = DICT.variables.find(v => v.variable === 'bage1').question_stem;

function euPre(alias, header, dataRows) {
  return [['Alias', alias], ['Export Date', '2026-02-02'], [], header, ...dataRows];
}

function failuresOf(cases, check) {
  const failures = [];
  for (const c of cases) {
    try {
      const msg = check(c);
      if (msg) failures.push(msg);
    } catch (err) {
      failures.push(`${Array.isArray(c) ? c[0] : JSON.stringify(c)}: ${err.message.split('\n')[0]}`);
    }
  }
  assert.strictEqual(failures.length, 0, failures.join('\n'));
}

// Section 3, source 1: word splitting at case changes, digits and separators;
// whole words only; ISO codes only in upper case.
function testHeldoutAliasSpellings() {
  const header = ['What gender do you identify as? (gender1)'];
  const cases = [
    ['Mentor_HU_2026', 'Hungary'],
    ['NorgeSurvey', 'Norway'],
    ['cyprus-2026', 'Cyprus'],
    ['mentorEspaña', 'Spain'],
    ['HUNGARY', 'Hungary'],
    ['Survey DE 2026', 'Germany'],
    ['Cyprus_CY', 'Cyprus'],
    ['Hungary_Germany', null],
    ['nO', null],
    ['Norwegian', null],
    ['mentor_es_v2', null]
  ];
  failuresOf(cases, ([alias, name]) => {
    const rows = euPre(alias, header, [['Girl']]);
    const got = SurveyAuditor.detectSurveyCountry(rows);
    const meta = new SurveyAuditor(DICT).auditSheet(rows).summary.metadata;
    const src = name ? 'alias' : null;
    if (got.name !== name || got.source !== src) return `${alias}: detect ${JSON.stringify(got)}, expected ${name}/${src}`;
    if (meta.country !== name || meta.countrySource !== src) return `${alias}: metadata ${meta.country}/${meta.countrySource}, expected ${name}/${src}`;
    return null;
  });
}

// Section 2: Qualtrics with an ImportId row and other columns; one-row
// Qualtrics with Excel date numbers under StartDate.
function testHeldoutQualtricsLayouts() {
  const header = ['StartDate', 'Progress', 'Finished', 'Gender (gender1)', 'Birth year (born1)'];
  const data = [];
  for (let i = 0; i < 7; i++) data.push([45000 + i, 100, 1, i % 2 ? 'Boy' : 'Girl', 2010]);
  const three = [
    header,
    ['Start Date', 'Progress', 'Finished', 'Your gender', 'Year'],
    ['{"ImportId":"startDate","timeZone":"America/Denver"}', '{"ImportId":"progress"}', '{"ImportId":"finished"}',
      '{"ImportId":"QID7"}', '{"ImportId":"QID8"}'],
    ...data
  ];
  const one = [header, ...data];
  const cases = [
    ['three header rows', three, { format: 'qualtrics', headerRowIndex: 0, dataStartIndex: 3 }],
    ['one header row, Excel dates', one, { format: 'qualtrics', headerRowIndex: 0, dataStartIndex: 1 }]
  ];
  failuresOf(cases, ([label, rows, want]) => {
    const got = SurveyAuditor.detectExportLayout(rows);
    const picked = { format: got.format, headerRowIndex: got.headerRowIndex, dataStartIndex: got.dataStartIndex };
    if (JSON.stringify(picked) !== JSON.stringify(want)) return `${label}: layout ${JSON.stringify(picked)}`;
    const count = new SurveyAuditor(DICT).auditSheet(rows).summary.metadata.dataRowCount;
    if (count !== 7) return `${label}: dataRowCount ${count}, expected 7`;
    const out = SurveyAuditor.cleanExportRows(rows, { dictionary: DICT });
    if (out.length !== 8) return `${label}: cleaned rows ${out.length}, expected 8`;
    if (out[1][0] !== 45000) return `${label}: first respondent lost (row 1 starts ${out[1][0]})`;
    return null;
  });
}

// Sections 1 and 4: an "Other…" country is used as given for the substitution.
function testHeldoutOtherCountrySubstitution() {
  const rows = euPre('DEMO', ['Age at arrival (born3)', 'Birthplace (born2)'], [[4, '[COUNTRY]'], [null, 'Ukraine']]);
  const meta = new SurveyAuditor(DICT).auditSheet(rows, { country: 'Malta' }).summary.metadata;
  assert.strictEqual(meta.country, 'Malta');
  assert.strictEqual(meta.countrySource, 'selected');
  const out = SurveyAuditor.cleanExportRows(rows, { dictionary: DICT, country: 'Malta' });
  assert.strictEqual(out[0][0], BAGE_STEM.replace('[country]', 'Malta'));
  assert.strictEqual(out[1][1], 'Malta', '[COUNTRY] answer becomes Malta');
  assert.strictEqual(out[2][1], 'Ukraine');
  const again = SurveyAuditor.cleanExportRows(out, { dictionary: DICT, country: 'Malta' });
  assert.deepStrictEqual(again, out, 're-cleaning with the same country changes nothing');
}

// Section 3, sources 2 and 3 in other contexts.
function testHeldoutHeaderAndFileNameSources() {
  const plainNo = [
    ['What gender do you identify as?', 'Approximately how old were you when you came/moved to NORWAY?'],
    ['Boy', null], ['Girl', 3]
  ];
  assert.deepStrictEqual(SurveyAuditor.detectSurveyCountry(plainNo, 'export_HU.xlsx'), { name: 'Norway', source: 'header' });
  const meta = new SurveyAuditor(DICT).auditSheet(plainNo).summary.metadata;
  assert.strictEqual(meta.country, 'Norway');
  assert.strictEqual(meta.countrySource, 'header');
  assert.strictEqual(meta.dataRowCount, 2, 'plain file: two respondents');

  const qx = [
    ['StartDate', 'Gender (gender1)', 'Age when you came/moved to Hungary? (born4)'],
    ['2021-05-05', 'Boy', 4]
  ];
  assert.deepStrictEqual(SurveyAuditor.detectSurveyCountry(qx), { name: 'Hungary', source: 'header' });

  const none = [['What gender do you identify as?'], ['Boy']];
  const fileCases = [
    ['export_HU_2026.xlsx', null],
    ['norge_cleaned_core.xlsx', 'Norway'],
    ['MENTOR-Deutschland-final.xlsx', 'Germany'],
    ['Spanish_sample.xlsx', null]
  ];
  failuresOf(fileCases, ([fileName, name]) => {
    const got = SurveyAuditor.detectSurveyCountry(none, fileName);
    const src = name ? 'filename' : null;
    if (got.name !== name || got.source !== src) return `${fileName}: ${JSON.stringify(got)}, expected ${name}/${src}`;
    return null;
  });
}

const TESTS = [
  testHeldoutAliasSpellings,
  testHeldoutQualtricsLayouts,
  testHeldoutOtherCountrySubstitution,
  testHeldoutHeaderAndFileNameSources
];

function runTests() {
  console.log('--- Starting issue #15 held-out tests ---');
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
    console.log(`${failed} issue #15 held-out test(s) failed.`);
    process.exit(1);
  }
  console.log('All issue #15 held-out tests passed.');
}

runTests();
