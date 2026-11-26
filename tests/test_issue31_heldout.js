/**
 * Issue #31 held-out cases: the same contract as tests/test_issue31_export_check.js
 * with other inputs (a 4-variable dictionary, 71/72/88 core columns, a
 * non-core-only sheet on the auditor page). Thresholds and message words come
 * from the issue #31 contract. Synthetic sheets only.
 *
 * Run: node tests/test_issue31_heldout.js [testName ...]
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
  return [['Alias', alias], ['Export Date', '2026-03-03'], ['Preamble', 'drop me'], header, ...dataRows];
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

function check(coreRows, dictionary) {
  assert.strictEqual(typeof SurveyAuditor.checkCoreExport, 'function', 'SurveyAuditor.checkCoreExport is a function');
  return SurveyAuditor.checkCoreExport(coreRows, dictionary);
}

function variable(name, source, isCore) {
  return {
    variable: name, orig_variable: name, group_id: name, section: 'Test',
    question_stem: `Question ${name}`, item_text: '', scale: 'nominal', question_type: 'single',
    n_options: 0, multiple: false, source, is_core: isCore,
    options_complete: true, scale_confidence: 'high', notes: '', orig_aliases: {},
    options: [], keywords: []
  };
}

// 4 core variables; the non-core and the national core variable are not counted.
const SMALL_DICT = {
  variables: [
    variable('ha1', 'canonical_en', true),
    variable('hb1', 'canonical_en', true),
    variable('hc1', 'canonical_en', true),
    variable('hd1', 'canonical_en', true),
    variable('hoptional1', 'canonical_en', false),
    variable('hnational1', 'spain', true)
  ]
};

function testHeldoutFourCoreVariables() {
  const one = check([['Question ha1'], ['x'], ['y']], SMALL_DICT);
  assert.strictEqual(one.total, 4, 'total counts core canonical_en variables only');
  assert.strictEqual(one.columns, 1);
  assert.strictEqual(one.status, 'few', '1 of 4 is few');
  assertFewMessage(one.message, 1, 4, '1 of 4');

  const two = check([['Question ha1', 'Question hc1'], ['x', 'y']], SMALL_DICT);
  assert.strictEqual(two.total, 4);
  assert.strictEqual(two.columns, 2);
  assert.strictEqual(two.status, 'ok', '2 of 4 is ok');
  assert.strictEqual(two.message, null);

  const none = check([[], [], []], SMALL_DICT);
  assert.strictEqual(none.status, 'empty');
  assertEmptyMessage(none.message, 4, '0 of 4');
}

function testHeldoutEightyEightColumnsOk() {
  const header = Array.from({ length: 88 }, (_, i) => `H${i}`);
  const r = check([header, header.map(() => null), header.map(() => 'z')], DICT);
  assert.strictEqual(r.status, 'ok');
  assert.strictEqual(r.columns, 88);
  assert.strictEqual(r.total, 143);
  assert.strictEqual(r.message, null);
}

// ---- auditor page in a vm -----------------------------------------------

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
      writes.push({ fileName, rows: wb.Sheets[wb.SheetNames[0]].__rows });
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
  return { window: sandbox, alerts, writes };
}

async function exportCore(rows, filename) {
  const page = await loadPage(DICT);
  page.window.SurveyApp.processAudit(rows, filename);
  assert.deepStrictEqual(page.alerts, [], `loading the sheet raised no alert: ${page.alerts.join(' | ')}`);
  page.window.exportCleanedCoreData();
  return page;
}

function canonSheet(n) {
  // The first n core variables under their canonical English headers; the
  // age-at-arrival header (within the first 7) names Norway.
  const header = CORE_VARS.slice(0, n).map(v =>
    (v.item_text ? `${v.question_stem}: ${v.item_text}` : v.question_stem).replace(/\[country\]/gi, 'Norway'));
  return [header, header.map(() => null)];
}

async function testHeldoutPageNonCoreOnlySheet() {
  // Every header matches a Germany-only (non-core) variable: nothing to write.
  const names = ['catsev05', 'catsym07', 'catsym12', 'smadd2'];
  const rows = eu('MENTORMasterGER1', names.map(n => `Frage (${n})`), [names.map(() => 'Ja'), names.map(() => 'Nein')]);
  const core = SurveyAuditor.cleanExportRows(rows, { dictionary: DICT, country: 'Germany', coreOnly: true });
  assert.ok(core.every(r => r.length === 0), 'fixture: the core export has no columns');
  const page = await exportCore(rows, 'germany_export.xlsx');
  const problems = [];
  if (page.writes.length) problems.push(`XLSX.writeFile called ${page.writes.length} time(s); expected none`);
  if (page.alerts.length !== 1) problems.push(`alert called ${page.alerts.length} time(s); expected once`);
  else {
    try { assertEmptyMessage(page.alerts[0], 143, 'alert'); } catch (err) { problems.push(err.message); }
  }
  assert.strictEqual(problems.length, 0, problems.join('\n'));
}

async function testHeldoutPageThresholdAt71And72() {
  const problems = [];
  for (const n of [71, 72]) {
    const rows = canonSheet(n);
    const core = SurveyAuditor.cleanExportRows(rows, { dictionary: DICT, country: 'Norway', coreOnly: true });
    assert.strictEqual(core[0].length, n, `fixture: the core export has ${n} columns`);
    const page = await exportCore(rows, 'MENTOR_Norway_wave2.xlsx');
    if (page.writes.length !== 1) {
      problems.push(`${n}: XLSX.writeFile called ${page.writes.length} time(s); expected once`);
    } else {
      if (page.writes[0].fileName !== 'MENTOR_Norway_wave2_cleaned_core.xlsx') problems.push(`${n}: file name ${page.writes[0].fileName}`);
      try {
        assert.deepStrictEqual(page.writes[0].rows, JSON.parse(JSON.stringify(core)));
      } catch (err) { problems.push(`${n}: written content differs from the core export`); }
    }
    if (n === 71) {
      if (page.alerts.length !== 1) problems.push(`71: alert called ${page.alerts.length} time(s); expected once`);
      else {
        try { assertFewMessage(page.alerts[0], 71, 143, '71'); } catch (err) { problems.push(err.message); }
      }
    } else if (page.alerts.length !== 0) {
      problems.push(`72: unexpected alert ${JSON.stringify(page.alerts)}`);
    }
  }
  assert.strictEqual(problems.length, 0, problems.join('\n'));
}

const TESTS = [
  testHeldoutFourCoreVariables,
  testHeldoutEightyEightColumnsOk,
  testHeldoutPageNonCoreOnlySheet,
  testHeldoutPageThresholdAt71And72
];

async function runTests() {
  console.log('--- Starting issue #31 held-out tests ---');
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
    console.log(`${failed} issue #31 held-out test(s) failed.`);
    process.exit(1);
  }
  console.log('All issue #31 held-out tests passed.');
}

runTests();
