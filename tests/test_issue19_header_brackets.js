/**
 * Issue #19: the cleaned export keeps bracketed words that belong to the
 * question text. A trailing bracket is removed only when its content is a
 * variable ID, so cleaning a cleaned export again changes nothing.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const SurveyAuditor = require('../src/survey_validator.js');

const ROOT = path.resolve(__dirname, '..');
const DICT = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'master_dictionary.json'), 'utf8'));

function clean(rows, options) {
  return SurveyAuditor.cleanExportRows(rows, options);
}

function eu(header, dataRows) {
  return [
    ['Alias', 'DEMO'],
    ['Export Date', '2026-01-01'],
    ['Preamble', 'drop me'],
    header,
    ...dataRows
  ];
}

// [source header, header after one and after two cleanings]
const QUESTION_WORDS = [
  'Zzz qqq (snus)',
  'Zzz qqq [snus]',
  'Zzz qqq {snus}',
  'Duration (in seconds)',
  'Being overly careful or on guard (checking to see who is around you)',
  'Zzz qqq (past 30 days)',
  'Zzz qqq (COVID-19)',
  'Zzz qqq (2025)'
].map(h => [h, h]);

const TAG_AFTER_WORDS = [
  ['Zzz qqq (snus) (ID999999)', 'Zzz qqq (snus)'],
  ['Zzz qqq (in seconds) [zzvar1]', 'Zzz qqq (in seconds)']
];

// No dictionary variable has these IDs, so the columns stay unmatched.
const UNKNOWN_TAGS = [
  '(ID999999)', '(zzvar1)', '(zz_week1)', '[zzabuse6.1]', '{zzia1:6_1}',
  '(zz4_1_TEXT)', '(zz_elfogadas)', '(zzscreen 2-8 and 10_1)'
].map(tag => [`Zzz qqq ${tag}`, 'Zzz qqq']);

// The tags listed in the issue plan; without a dictionary nothing is matched.
const LISTED_TAGS = [
  '(ID289)', '(gender1)', '(some_week1)', '[suicide6.1]', '{raia1:6_1}',
  '(born4_1_TEXT)', '(taj_elfogadas)', '(kidscreen 2-8 and 10_1)'
].map(tag => [`Zzz qqq ${tag}`, 'Zzz qqq']);

function checkHeaders(cases, options, label) {
  const failures = [];
  for (const [source, expected] of cases) {
    const rows = eu([source], [['free text (snus)']]);
    const once = clean(rows, options);
    const twice = clean(once, options);
    for (const [pass, out] of [['once', once], ['twice', twice]]) {
      if (out[0][0] !== expected) {
        failures.push(`${label}, ${pass}: ${JSON.stringify(source)} -> ${JSON.stringify(out[0][0])}, expected ${JSON.stringify(expected)}`);
      }
      if (out.length !== 2 || out[1][0] !== 'free text (snus)') {
        failures.push(`${label}, ${pass}: answer cell changed for ${JSON.stringify(source)}: ${JSON.stringify(out.slice(1))}`);
      }
    }
  }
  assert.strictEqual(failures.length, 0, '\n' + failures.join('\n'));
}

const BOTH = [[undefined, 'no dictionary'], [{ dictionary: DICT }, 'with dictionary']];

const tests = {
  testQuestionWordsStay() {
    for (const [options, label] of BOTH) checkHeaders(QUESTION_WORDS, options, label);
  },

  testOnlyTheTagIsRemoved() {
    for (const [options, label] of BOTH) checkHeaders(TAG_AFTER_WORDS, options, label);
  },

  testUnknownVariableTagsAreStripped() {
    for (const [options, label] of BOTH) checkHeaders(UNKNOWN_TAGS, options, label);
  },

  testListedVariableTagsAreStripped() {
    checkHeaders(LISTED_TAGS, undefined, 'no dictionary');
  },

  testHungarianDictionaryTextSurvivesSecondCleaning() {
    const headers = [
      'Milyen gyakran használtad az alábbi dohánytermékeket az elmúlt 30 nap során? - Szájba helyezett dohány (snus)',
      'Egy átlagos hétköznapon mennyi időt töltesz a következő tevékenységekkel? - A közösségi media aktív használata (nem csak bejelentkezve lenni)'
    ];
    const options = { dictionary: DICT, country: 'Hungary' };
    const once = clean([headers, ['x', 'y']], options);
    assert.deepStrictEqual(once[0], headers, 'first cleaning keeps the Hungarian header text');
    assert.deepStrictEqual(clean(once, options), once, 'second cleaning changes nothing');
  },

  testCoreOnlyExportUnchanged() {
    const rows = eu(
      ['What gender do you identify as? (gender1)', 'Zzz qqq (snus) (ID999999)'],
      [['Girl (ID3)', 'free text']]
    );
    const options = { dictionary: DICT, coreOnly: true };
    const expected = [['What gender do you identify as?'], ['Girl']];
    const once = clean(rows, options);
    assert.deepStrictEqual(once, expected);
    assert.deepStrictEqual(clean(once, options), expected);
  },

  testDocsCopyIdentical() {
    const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
    assert.strictEqual(read('docs/src/survey_validator.js'), read('src/survey_validator.js'),
      'docs/src/survey_validator.js is identical to src/survey_validator.js');
  }
};

let failed = 0;
for (const [name, test] of Object.entries(tests)) {
  try {
    test();
    console.log(`PASS ${name}`);
  } catch (err) {
    failed++;
    console.log(`FAIL ${name}: ${err.message}`);
  }
}
if (failed) {
  console.log(`${failed} issue #19 test(s) failed.`);
  process.exit(1);
}
