/**
 * Issue #31: an empty or nearly unmatched core export is reported on the
 * auditor page instead of being written silently.
 *
 * A1: SurveyAuditor.checkCoreExport(coreRows, dictionary) -> { status, columns, total, message }.
 * A2: window.exportCleanedCoreData() alerts and does not write an empty core
 *     export; it alerts and writes a "few" export; it writes an "ok" export
 *     without an alert. app.js runs in a Node vm with stubbed browser globals.
 * Thresholds and message words come from the issue #31 contract. Synthetic
 * sheets only; no real survey file is read.
 *
 * Run: node tests/test_issue31_export_check.js [testName ...]
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const SurveyAuditor = require('../src/survey_validator.js');

const ROOT = path.resolve(__dirname, '..');
const DICT = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'master_dictionary.json'), 'utf8'));
const CORE_VARS = DICT.variables.filter(v => v.is_core === true && v.source === 'canonical_en');

function eu(alias, header, dataRows) {
  return [['Alias', alias], ['Export Date', '2026-01-01'], ['Preamble', 'drop me'], header, ...dataRows];
}

// Core-export-shaped rows: a header of n columns and one respondent row.
function coreRowsOf(n) {
  const header = [];
  const data = [];
  for (let i = 0; i < n; i++) {
    header.push(`Header ${i + 1}`);
    data.push(`answer ${i + 1}`);
  }
  return [header, data];
}

function canonHeader(v, country) {
  const text = v.item_text ? `${v.question_stem}: ${v.item_text}` : v.question_stem;
  return text.replace(/\[country\]/gi, country);
}

function hasWord(text, word) {
  return new RegExp(`\\b${word}\\b`, 'i').test(text);
}

function assertEmptyMessage(message, total, label) {
  assert.strictEqual(typeof message, 'string', `${label}: message is a string`);
  assert.ok(message.includes('No file was written'), `${label}: says no file was written: ${message}`);
  assert.ok(message.includes(`0 of ${total}`), `${label}: says 0 of ${total}: ${message}`);
  assert.ok(hasWord(message, 'country'), `${label}: mentions the country: ${message}`);
  assert.ok(hasWord(message, 'file'), `${label}: mentions the file: ${message}`);
}

function assertFewMessage(message, columns, total, label) {
  assert.strictEqual(typeof message, 'string', `${label}: message is a string`);
  assert.ok(message.includes(`${columns} of ${total}`), `${label}: says ${columns} of ${total}: ${message}`);
  assert.ok(hasWord(message, 'country'), `${label}: mentions the country: ${message}`);
  assert.ok(hasWord(message, 'file'), `${label}: mentions the file: ${message}`);
  assert.ok(message.includes('written'), `${label}: says the file is written: ${message}`);
  assert.ok(!message.includes('No file was written'), `${label}: does not say no file was written: ${message}`);
}

function check(coreRows) {
  assert.strictEqual(typeof SurveyAuditor.checkCoreExport, 'function', 'SurveyAuditor.checkCoreExport is a function');
  return SurveyAuditor.checkCoreExport(coreRows, DICT);
}

// ---- A1: checkCoreExport ---------------------------------------------------

function testRealDictionaryHas143CoreVariables() {
  // Contract: 143 core variables in the real dictionary.
  assert.strictEqual(CORE_VARS.length, 143);
}

function testZeroColumnsIsEmpty() {
  const failures = [];
  for (const [label, rows] of [['header and data rows of []', [[], []]], ['no rows', []], ['one []', [[]]]]) {
    try {
      const r = check(rows);
      assert.strictEqual(r.status, 'empty', `${label}: status`);
      assert.strictEqual(r.columns, 0, `${label}: columns`);
      assert.strictEqual(r.total, 143, `${label}: total`);
      assertEmptyMessage(r.message, 143, label);
    } catch (err) {
      failures.push(err.message);
    }
  }
  assert.strictEqual(failures.length, 0, failures.join('\n'));
}

function testFewColumnsBelowHalf() {
  const failures = [];
  for (const n of [1, 71]) {
    try {
      const r = check(coreRowsOf(n));
      assert.strictEqual(r.status, 'few', `${n} columns: status`);
      assert.strictEqual(r.columns, n, `${n} columns: columns`);
      assert.strictEqual(r.total, 143, `${n} columns: total`);
      assertFewMessage(r.message, n, 143, `${n} columns`);
    } catch (err) {
      failures.push(err.message);
    }
  }
  assert.strictEqual(failures.length, 0, failures.join('\n'));
}

function testHalfOrMoreIsOk() {
  const failures = [];
  for (const n of [72, 143]) {
    try {
      const r = check(coreRowsOf(n));
      assert.strictEqual(r.status, 'ok', `${n} columns: status`);
      assert.strictEqual(r.columns, n, `${n} columns: columns`);
      assert.strictEqual(r.total, 143, `${n} columns: total`);
      assert.strictEqual(r.message, null, `${n} columns: message is null`);
    } catch (err) {
      failures.push(err.message);
    }
  }
  assert.strictEqual(failures.length, 0, failures.join('\n'));
}

function testNonCoreOnlySheetIsEmpty() {
  // Headers that all match Germany-only (non-core) variables: the core
  // export has no columns, so the check is "empty".
  const names = ['catsev01', 'catsev02', 'catsym01'];
  for (const n of names) {
    const v = DICT.variables.find(x => x.variable === n);
    assert.ok(v && v.is_core === false, `${n} is a non-core dictionary variable`);
  }
  const rows = eu('MENTOR GER', names.map(n => `Frage (${n})`), [names.map(() => 'Ja')]);
  const audit = new SurveyAuditor(DICT).auditSheet(rows, { country: 'Germany' });
  const matched = audit.columns.filter(c => c.canonical).length;
  assert.strictEqual(matched, names.length, 'fixture: every header matches a dictionary variable');
  const core = SurveyAuditor.cleanExportRows(rows, { dictionary: DICT, country: 'Germany', coreOnly: true });
  const r = check(core);
  assert.strictEqual(r.status, 'empty');
  assert.strictEqual(r.columns, 0);
  assertEmptyMessage(r.message, 143, 'non-core only');
}

// ---- A2: the auditor page in a vm ---------------------------------------

function fakeElement() {
  const store = { style: {}, dataset: {}, value: '', textContent: '', innerHTML: '', disabled: false, checked: false };
  const classList = { add() {}, remove() {}, toggle() {}, contains() { return false; } };
  let proxy;
  proxy = new Proxy(function () {}, {
    get(target, prop) {
      if (prop === 'classList') return classList;
      if (prop === 'length') return 0;
      if (typeof prop === 'symbol') return undefined;
      if (prop in store) return store[prop];
      if (prop === 'querySelectorAll' || prop === 'getElementsByClassName' || prop === 'getElementsByTagName') return () => [];
      if (prop === 'children' || prop === 'childNodes') return [];
      return function () { return proxy; };
    },
    set(target, prop, value) {
      store[prop] = value;
      return true;
    }
  });
  return proxy;
}

// Load survey_validator.js and app.js as the browser does, then fire DOMContentLoaded.
async function loadPage(dictionary) {
  const listeners = {};
  const alerts = [];
  const writes = [];
  const elements = new Map();
  const document = {
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, fakeElement());
      return elements.get(id);
    },
    querySelectorAll() { return []; },
    querySelector() { return fakeElement(); },
    createElement() { return fakeElement(); },
    body: fakeElement()
  };
  const XLSX = {
    utils: {
      aoa_to_sheet(rows) { return { __rows: JSON.parse(JSON.stringify(rows)) }; },
      book_new() { return { SheetNames: [], Sheets: {} }; },
      book_append_sheet(wb, ws, name) { wb.SheetNames.push(name); wb.Sheets[name] = ws; }
    },
    writeFile(wb, fileName) {
      writes.push({ fileName, sheetNames: wb.SheetNames.slice(), rows: wb.Sheets[wb.SheetNames[0]].__rows });
    }
  };
  const sandbox = {
    document,
    XLSX,
    alert(msg) { alerts.push(String(msg)); },
    console: { log() {}, warn() {}, error() {}, info() {} },
    fetch() { throw new Error('fetch is not available in the test'); },
    setTimeout, clearTimeout
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.__MASTER_DICTIONARY__ = dictionary;
  vm.createContext(sandbox);
  for (const rel of ['src/survey_validator.js', 'src/app.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), sandbox, { filename: rel });
  }
  for (const fn of listeners.DOMContentLoaded || []) await fn();
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(sandbox.SurveyApp && typeof sandbox.SurveyApp.processAudit === 'function', 'page exposes SurveyApp.processAudit');
  return { window: sandbox, alerts, writes };
}

async function loadSheet(rows, filename, dictionary) {
  const page = await loadPage(dictionary || DICT);
  page.window.SurveyApp.processAudit(rows, filename);
  assert.deepStrictEqual(page.alerts, [], `loading the sheet raised no alert: ${page.alerts.join(' | ')}`);
  return page;
}

// An EU Survey export in a language the dictionary does not know (Swedish),
// with the country in the Alias.
function unknownLanguageSheet() {
  return eu('MENTOR NOR', ['Vilket kön identifierar du dig som?', 'Vilken månad är du född?', 'Hur gammal är du?'],
    [['Pojke', 'Maj', '14'], ['Flicka', 'Juni', '15']]);
}

// Two tagged headers that match core variables, one unmatched header.
function fewSheet() {
  return eu('MENTOR NOR', ['Kjønn (gender1)', 'Alder ved flytting (born3)', 'Annet'],
    [['Boy', '5', 'x'], ['Girl', '7', 'y']]);
}

async function testEmptyCoreExportAlertsAndWritesNothing() {
  const rows = unknownLanguageSheet();
  const core = SurveyAuditor.cleanExportRows(rows, { dictionary: DICT, country: 'Norway', coreOnly: true });
  assert.ok(core.every(r => r.length === 0), 'fixture: the core export has no columns');
  const page = await loadSheet(rows, 'mentor_export.xlsx');
  page.window.exportCleanedCoreData();
  const problems = [];
  if (page.writes.length !== 0) problems.push(`XLSX.writeFile called ${page.writes.length} time(s) (${page.writes.map(w => w.fileName).join(', ')}); expected none`);
  if (page.alerts.length !== 1) {
    problems.push(`alert called ${page.alerts.length} time(s); expected once`);
  } else {
    try { assertEmptyMessage(page.alerts[0], 143, 'alert'); } catch (err) { problems.push(err.message); }
  }
  assert.strictEqual(problems.length, 0, problems.join('\n'));
}

async function testFewCoreExportAlertsAndWrites() {
  const rows = fewSheet();
  const core = SurveyAuditor.cleanExportRows(rows, { dictionary: DICT, country: 'Norway', coreOnly: true });
  assert.strictEqual(core[0].length, 2, 'fixture: the core export has 2 columns');
  const page = await loadSheet(rows, 'mentor_export.xlsx');
  page.window.exportCleanedCoreData();
  const problems = [];
  if (page.alerts.length !== 1) {
    problems.push(`alert called ${page.alerts.length} time(s); expected once`);
  } else {
    try { assertFewMessage(page.alerts[0], 2, 143, 'alert'); } catch (err) { problems.push(err.message); }
  }
  if (page.writes.length !== 1) {
    problems.push(`XLSX.writeFile called ${page.writes.length} time(s); expected once`);
  } else {
    const w = page.writes[0];
    if (!w.fileName.endsWith('_cleaned_core.xlsx')) problems.push(`file name ${w.fileName}`);
    try {
      assert.deepStrictEqual(w.rows, JSON.parse(JSON.stringify(core)), 'written content is the core export');
    } catch (err) { problems.push(err.message); }
  }
  assert.strictEqual(problems.length, 0, problems.join('\n'));
}

async function testOkCoreExportWritesWithoutAlert() {
  // All 143 core variables under their canonical English headers.
  const header = CORE_VARS.map(v => canonHeader(v, 'Norway'));
  const rows = [header, header.map(() => null)];
  const core = SurveyAuditor.cleanExportRows(rows, { dictionary: DICT, country: 'Norway', coreOnly: true });
  assert.strictEqual(core[0].length, 143, 'fixture: the core export has all 143 columns');
  const page = await loadSheet(rows, 'mentor_export.xlsx');
  page.window.exportCleanedCoreData();
  assert.deepStrictEqual(page.alerts, [], 'no alert');
  assert.strictEqual(page.writes.length, 1, 'file written once');
  assert.ok(page.writes[0].fileName.endsWith('_cleaned_core.xlsx'), page.writes[0].fileName);
  assert.deepStrictEqual(page.writes[0].rows, JSON.parse(JSON.stringify(core)), 'written content is the core export');
}

async function testUploadFirstAlertUnchanged() {
  const page = await loadPage(DICT);
  page.window.exportCleanedCoreData();
  assert.deepStrictEqual(page.alerts, ['Please upload or load a survey export before exporting cleaned data.']);
  assert.strictEqual(page.writes.length, 0);
}

async function testChooseCountryAlertUnchanged() {
  // No Alias, header or file name names a country.
  const rows = eu('Survey1', ['Kön (gender1)', 'Annat'], [['Boy', 'x']]);
  const page = await loadSheet(rows, 'export.xlsx');
  page.window.exportCleanedCoreData();
  assert.deepStrictEqual(page.alerts, ['Please choose the survey country before exporting cleaned data.']);
  assert.strictEqual(page.writes.length, 0);
}

async function testOtherExportButtonsHaveNoNewAlert() {
  const failures = [];
  for (const [label, rows] of [['empty core export', unknownLanguageSheet()], ['few core columns', fewSheet()]]) {
    const page = await loadSheet(rows, 'mentor_export.xlsx');
    for (const [fn, suffix] of [
      ['exportCleanedData', '_cleaned.xlsx'],
      ['exportScrambledSample', '_scrambled_sample.xlsx'],
      ['exportScrambledCleanedSample', '_cleaned_scrambled_sample.xlsx']
    ]) {
      page.alerts.length = 0;
      page.writes.length = 0;
      page.window[fn]();
      if (page.alerts.length) failures.push(`${label}, ${fn}: alert ${JSON.stringify(page.alerts)}`);
      if (page.writes.length !== 1 || !page.writes[0].fileName.endsWith(suffix)) {
        failures.push(`${label}, ${fn}: writes ${JSON.stringify(page.writes.map(w => w.fileName))}`);
      }
    }
  }
  assert.strictEqual(failures.length, 0, failures.join('\n'));
}

const TESTS = [
  testRealDictionaryHas143CoreVariables,
  testZeroColumnsIsEmpty,
  testFewColumnsBelowHalf,
  testHalfOrMoreIsOk,
  testNonCoreOnlySheetIsEmpty,
  testEmptyCoreExportAlertsAndWritesNothing,
  testFewCoreExportAlertsAndWrites,
  testOkCoreExportWritesWithoutAlert,
  testUploadFirstAlertUnchanged,
  testChooseCountryAlertUnchanged,
  testOtherExportButtonsHaveNoNewAlert
];

async function runTests() {
  console.log('--- Starting issue #31 export check tests ---');
  const only = process.argv.slice(2);
  let failed = 0;
  for (const test of TESTS) {
    if (only.length && !only.includes(test.name)) continue;
    try {
      await test();
      console.log(`PASS ${test.name}`);
    } catch (err) {
      failed++;
      console.log(`FAIL ${test.name}: ${String(err.message).split('\n').slice(0, 30).join('\n    ')}`);
    }
  }
  if (failed) {
    console.log(`${failed} issue #31 export check test(s) failed.`);
    process.exit(1);
  }
  console.log('All issue #31 export check tests passed.');
}

runTests();
