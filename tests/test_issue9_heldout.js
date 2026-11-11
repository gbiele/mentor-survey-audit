/**
 * Issue #9 held-out cases: canonical English export with other inputs
 * (other survey countries, Qualtrics core export, [COUNTRY] in multi-select
 * segments). Expected strings are literal stems/labels from
 * data/master_dictionary.json or the issue #9 contract.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const SurveyAuditor = require('../src/survey_validator.js');

const ROOT = path.resolve(__dirname, '..');
const DICT = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'master_dictionary.json'), 'utf8'));

function eu(alias, header, dataRows) {
  return [
    ['Alias', alias],
    ['Export Date', '2026-01-01'],
    ['Preamble', 'drop me'],
    header,
    ...dataRows
  ];
}

function column(out, c) {
  return out.map(row => row[c]);
}

// Hungary survey: [COUNTRY] / [country] become "Hungary", Hungarian aliases
// become canonical English labels.
function testHungarySurveyCountryAndAliases() {
  const rows = eu('Hungary', ['Hol születtél? (born3)', 'Milyen nemű vagy? (gender1)'], [
    ['- Magyarország (HU)', 'Lány'],
    ['Magyarország', 'Fiú'],
    ['Germany (DE)', null]
  ]);
  const out = SurveyAuditor.cleanExportRows(rows, { dictionary: DICT });
  assert.deepStrictEqual(out[0], ['Where were you born?', 'What gender do you identify as?']);
  // Magyarország is the alias of value 1, whose canonical label is [COUNTRY].
  assert.deepStrictEqual(column(out, 0).slice(1), ['Hungary', 'Hungary', 'Germany']);
  assert.deepStrictEqual(column(out, 1).slice(1), ['Girl', 'Boy', null]);
}

// German survey, hand-built multi-select variable: [COUNTRY] inside a
// canonical label of a segment is replaced; unmapped segments stay tag-stripped.
function testCountryPlaceholderInMultiSelectSegments() {
  const opt = (order, label, alias, value) => ({
    order, label, label_with_id: '', alias, eusurvey_answer_id: '', value,
    scale: 'nominal', is_special: false, special_type: ''
  });
  const dict = {
    variables: [{
      variable: 'hmulti1', orig_variable: 'hmulti1', group_id: 'hmulti1', section: 'Test',
      question_stem: 'Where have you lived?', item_text: 'In [COUNTRY] or elsewhere',
      scale: 'nominal', question_type: 'multi', n_options: 4, multiple: true,
      source: 'canonical_en', is_core: true, options_complete: true, scale_confidence: 'high',
      notes: '', orig_aliases: {}, keywords: [],
      options: [
        opt(0, 'In [COUNTRY]', '', 1),
        opt(1, 'Hier', 'Hier', 1),
        opt(2, 'Abroad', '', 2),
        opt(3, 'Im Ausland', 'Im Ausland', 2)
      ]
    }]
  };
  const rows = eu('Germany', ['Wo hast du gelebt? (hmulti1)'], [
    ['Hier;Im Ausland (ID4);Mond'],
    ['Hier'],
    ['Mond (ID9)']
  ]);
  const out = SurveyAuditor.cleanExportRows(rows, { dictionary: dict });
  assert.deepStrictEqual(out, [
    ['Where have you lived?: In Germany or elsewhere'],
    ['In Germany;Abroad;Mond'],
    ['In Germany'],
    ['Mond']
  ]);
}

// Qualtrics core export: original relative column order, unmatched and
// national columns dropped, rows kept in order, placeholders kept (no country).
function testQualtricsCoreExportOrder() {
  const rows = [
    ['StartDate', 'Place (born2)', 'Notes', 'Gender (gender1)', 'Sleep (sleep3)'],
    ['Start Date', 'Where?', 'Notes', 'Gender?', 'Sleep?'],
    ['2020-01-01', 'España', 'n1', 'Chica.', 'x'],
    ['2020-01-02', 'Alemania', 'n2', 'Prefiero no responder', 'y'],
    ['2020-01-03', null, 'n3', 'Fiú', 'z']
  ];
  const core = SurveyAuditor.cleanExportRows(rows, { dictionary: DICT, coreOnly: true });
  assert.deepStrictEqual(core, [
    ['Where were you born?', 'What gender do you identify as?'],
    ['[COUNTRY]', 'Girl'],
    ['Germany', 'Prefer not to answer'],
    [null, 'Boy']
  ]);
  const full = SurveyAuditor.cleanExportRows(rows, { dictionary: DICT });
  assert.strictEqual(full.length, 4, 'header + 3 respondents');
  assert.deepStrictEqual(column(full, 2), ['Notes', 'n1', 'n2', 'n3'], 'unmatched column kept in full export');
  assert.deepStrictEqual(column(full, 0), ['StartDate', '2020-01-01', '2020-01-02', '2020-01-03']);
}

const TESTS = [
  testHungarySurveyCountryAndAliases,
  testCountryPlaceholderInMultiSelectSegments,
  testQualtricsCoreExportOrder
];

function runTests() {
  console.log('--- Starting issue #9 held-out tests ---');
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
  console.log('All issue #9 held-out tests passed.');
}

runTests();
