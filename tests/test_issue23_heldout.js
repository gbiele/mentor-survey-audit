/**
 * Issue #23 held-out cases: the same contract as the visible tests, with
 * other inputs. Expected values follow the issue #23 contract (Part A),
 * data/country_maps/germany_answers.csv and the canonical (non-alias)
 * options of data/master_dictionary.json.
 *
 * Run: node tests/test_issue23_heldout.js [testName ...]
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const SurveyAuditor = require('../src/survey_validator.js');

const ROOT = path.resolve(__dirname, '..');
const DICT = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'master_dictionary.json'), 'utf8'));
const GERMAN_HEADERS_CSV = path.join(ROOT, 'data', 'country_maps', 'germany_headers.csv');

function euPre(alias, header, dataRows) {
  return [['Alias', alias], ['Export Date', '2026-03-03'], [], header, ...dataRows];
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

function dictVar(name) {
  const v = DICT.variables.find(x => x.variable === name);
  assert.ok(v, `dictionary has ${name}`);
  return v;
}

/** Canonical English label: the non-alias option with this value. */
function canonicalLabel(name, value) {
  const o = dictVar(name).options.find(x => !x.alias && String(x.value) === String(value));
  assert.ok(o, `${name} has a canonical option ${value}`);
  return o.label;
}

/** Minimal CSV reader (quoted fields, doubled quotes, BOM). */
function parseCsv(text) {
  const src = text.replace(/^﻿/, '');
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field); field = '';
      rows.push(row); row = [];
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const nonEmpty = rows.filter(r => r.some(c => c !== ''));
  const head = nonEmpty[0];
  return nonEmpty.slice(1).map(r => Object.fromEntries(head.map((h, i) => [h, r[i] == null ? '' : r[i]])));
}

function germanHeaderRows() {
  assert.ok(fs.existsSync(GERMAN_HEADERS_CSV), 'data/country_maps/germany_headers.csv is missing');
  return parseCsv(fs.readFileSync(GERMAN_HEADERS_CSV, 'utf8'));
}

function germanHeaderOf(rows, name) {
  const r = rows.find(x => x.variable === name);
  assert.ok(r, `germany_headers.csv has ${name}`);
  return r.german_header;
}

// Section 1: other three-letter code positions and spellings.
function testHeldoutThreeLetterAliasCodes() {
  const header = ['What gender do you identify as? (gender1)'];
  const cases = [
    ['DEU', 'Germany'],
    ['Survey GER 2', 'Germany'],
    ['NOR_mentor', 'Norway'],
    ['Mentor-CYP-2027', 'Cyprus'],
    ['Mentor HUN', 'Hungary'],
    ['ESP', 'Spain'],
    ['MentorDeu1', null],
    ['GERMAN', null],
    ['MentorHUN_DEU', null],
    ['nor2026', null]
  ];
  failuresOf(cases, ([alias, name]) => {
    const rows = euPre(alias, header, [['Girl']]);
    const got = SurveyAuditor.detectSurveyCountry(rows);
    const src = name ? 'alias' : null;
    if (got.name !== name || got.source !== src) return `${alias}: detect ${JSON.stringify(got)}, expected ${name}/${src}`;
    const meta = new SurveyAuditor(DICT).auditSheet(rows).summary.metadata;
    if (meta.country !== name || meta.countrySource !== src) return `${alias}: metadata ${meta.country}/${meta.countrySource}`;
    return null;
  });
}

// Section 3: other rows of germany_answers.csv, on other variables and with
// the country selected instead of read from the Alias.
function testHeldoutOtherGermanAnswers() {
  const keyRows = germanHeaderRows();
  const vars = ['gender1', 'grade1', 'bplace1', 'bmonth1', 'cyrm01', 'live1', 'edudad1', 'momprt1'];
  const header = vars.map(v => germanHeaderOf(keyRows, v));
  const rows = euPre('Survey1', header, [
    ['Andere Geschlechtsidentität', '10. Klasse', 'Österreich', 'Dezember', 'ziemlich',
      'Ich wohne nicht mit meinen Eltern zusammen', 'Hochschule ohne Abschluss', 'Nein'],
    ['Junge', '13. Klasse', 'Vereinigtes Königreich', 'Mai', 'gar nicht',
      'Ich wohne mit meinen beiden Eltern zusammen', 'Weiß ich nicht', 'Ja']
  ]);
  const out = SurveyAuditor.cleanExportRows(rows, { dictionary: DICT, country: 'Germany' });
  assert.deepStrictEqual(out[1], [
    canonicalLabel('gender1', 3), canonicalLabel('grade1', 2), canonicalLabel('bplace1', 5),
    'December', 'Quite a bit', canonicalLabel('live1', 5), canonicalLabel('edudad1', 2), canonicalLabel('momprt1', 0)
  ], 'first respondent');
  assert.deepStrictEqual(out[2], [
    'Boy', canonicalLabel('grade1', 5), canonicalLabel('bplace1', 46),
    'May', canonicalLabel('cyrm01', 0), canonicalLabel('live1', 1), canonicalLabel('edudad1', 998), canonicalLabel('momprt1', 1)
  ], 'second respondent');
  assert.strictEqual(out[0][0], 'What gender do you identify as?');
}

// Sections 3 and 5: '*' is digits only through the committed dictionary.
// ks* rows do not reach ksa1; a German KIDSCREEN answer in a ksa1 column stays.
function testHeldoutStarDigitsOnlyInDictionary() {
  const ksa1 = dictVar('ksa1');
  for (const label of ['nie', 'selten', 'manchmal', 'oft', 'immer']) {
    assert.ok(!ksa1.options.some(o => o.alias === label), `ksa1 has no ks* alias ${label}`);
    assert.ok(dictVar('ks8').options.some(o => o.alias === label), `ks8 has the ks* alias ${label}`);
  }
  assert.ok(dictVar('cyrm12').options.some(o => o.alias === 'ziemlich' && String(o.value) === '3'), 'cyrm* reaches cyrm12');
  const rows = euPre('MENTORMasterGER1', ['Fit (ksa1)', 'Energie (ks1)'], [['manchmal', 'manchmal']]);
  const out = SurveyAuditor.cleanExportRows(rows, { dictionary: DICT });
  assert.strictEqual(out[1][0], 'manchmal', 'ksa1 answer not translated by a ks* row');
  assert.notStrictEqual(out[1][0], canonicalLabel('ksa1', 2));
  assert.strictEqual(out[1][1], 'Quite often');
}

// Section 3: coreOnly on the full German sheet keeps exactly the core
// canonical columns, in file order, with canonical English headers.
function testHeldoutCoreOnlyColumnSet() {
  const keyRows = germanHeaderRows();
  const header = keyRows.map(r => r.german_header);
  const rows = euPre('MENTORMasterGER1', header, [header.map(() => null)]);
  const byName = new Map(DICT.variables.map(v => [v.variable, v]));
  const expected = [];
  for (const r of keyRows) {
    const v = byName.get(r.variable);
    if (!v || v.is_core !== true || v.source !== 'canonical_en') continue;
    const text = v.item_text ? `${v.question_stem}: ${v.item_text}` : v.question_stem;
    expected.push(text.replace(/\[country\]/gi, 'Germany'));
  }
  const core = SurveyAuditor.cleanExportRows(rows, { dictionary: DICT, coreOnly: true });
  assert.deepStrictEqual(core[0], expected, 'core header set and order');
  assert.strictEqual(core.length, 2, 'header + one respondent');
}

const TESTS = [
  testHeldoutThreeLetterAliasCodes,
  testHeldoutOtherGermanAnswers,
  testHeldoutStarDigitsOnlyInDictionary,
  testHeldoutCoreOnlyColumnSet
];

function runTests() {
  console.log('--- Starting issue #23 held-out tests ---');
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
    console.log(`${failed} issue #23 held-out test(s) failed.`);
    process.exit(1);
  }
  console.log('All issue #23 held-out tests passed.');
}

runTests();
