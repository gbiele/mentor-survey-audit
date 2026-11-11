/**
 * Issue #15: survey country detection, no-preamble / one-row Qualtrics
 * layouts, one country for alias priority and [country] substitution,
 * Hungary mapping, and the country selector wiring.
 *
 * Expected values come from the issue #15 contract (Part A) and from
 * data/master_dictionary.json read directly. Synthetic fixtures only.
 *
 * Run: node tests/test_issue15_country_layout.js [testName ...]
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const SurveyAuditor = require('../src/survey_validator.js');

const ROOT = path.resolve(__dirname, '..');
const DICT = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'master_dictionary.json'), 'utf8'));

function dictVar(name) {
  const v = DICT.variables.find(x => x.variable === name);
  if (!v) throw new Error(`dictionary has no ${name}`);
  return v;
}

// Canonical age-at-arrival stem from the dictionary, with the country filled in.
const BAGE_STEM = dictVar('bage1').question_stem; // "...came/moved to [country]?"
function bageHeaderFor(country) {
  return BAGE_STEM.replace(/\[country\]/gi, country);
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function euPre(alias, header, dataRows) {
  return [
    ['Alias', alias],
    ['Export Date', '2026-01-01'],
    [],
    header,
    ...dataRows
  ];
}

function plain(header, dataRows) {
  return [header, ...dataRows];
}

// English tagged headers in the Cyprus pattern (EU Survey). Without a country
// with orig_aliases, the tag is matched against orig_variable:
// ID289 -> bmonth1, born2 -> bplace1, born3 -> bage1, cyrm12 -> cyrm12.
const CY_HEADER = [
  'What gender do you identify as? (gender1)',
  'What month were you born? (ID289)',
  'Where were you born? (born2)',
  'Approximately how old were you when you came/moved to [country]? (born3)',
  'To what extent do the following statements apply to you?: I enjoy my cultural and family traditions (cyrm12)'
];
function cyData(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push([
      i % 2 ? 'Girl' : 'Boy',
      'March',
      i === 1 ? 'Ukraine' : '[COUNTRY]',
      i === 1 ? '5' : null,
      'A lot'
    ]);
  }
  return out;
}

const QX_META = ['StartDate', 'EndDate', 'ResponseId'];
const QX_TAGGED = [
  'Gender (gender1)',
  'Month (ID289)',
  'Birthplace (born2)',
  'Age at arrival (born3)'
];
function qxData(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push([`2020-01-0${i + 1}`, `2020-01-0${i + 1}`, `R_${i + 1}`, 'Girl', 'April', '[COUNTRY]', null]);
  }
  return out;
}
function qualtrics2(n) {
  return [
    [...QX_META, ...QX_TAGGED],
    ['Start Date', 'End Date', 'Response ID', 'What is your gender?', 'Month?', 'Where born?', 'Age?'],
    ...qxData(n)
  ];
}
function qualtrics3(n) {
  return [
    [...QX_META, ...QX_TAGGED],
    ['Start Date', 'End Date', 'Response ID', 'What is your gender?', 'Month?', 'Where born?', 'Age?'],
    ['{"ImportId":"startDate","timeZone":"Europe/Budapest"}', '{"ImportId":"endDate"}', '{"ImportId":"_recordId"}',
      '{"ImportId":"QID1"}', '{"ImportId":"QID2"}', '{"ImportId":"QID3"}', '{"ImportId":"QID4"}'],
    ...qxData(n)
  ];
}
function qualtrics1(n) {
  return [[...QX_META, ...QX_TAGGED], ...qxData(n)];
}

// Hungarian pattern: Qualtrics, one header row, bare variable IDs.
const HU_HEADER = ['StartDate', 'EndDate', 'ResponseId', 'gender1', 'born2', 'born3', 'born4', 'born5',
  'schooltype', 'grade1', 'cyrm1:12_12', 'CYRM12'];
function huRows(n) {
  const out = [HU_HEADER];
  for (let i = 0; i < n; i++) {
    out.push([`2020-02-0${i + 1}`, `2020-02-0${i + 1}`, `R_${i + 1}`, i % 2 ? 'Lány' : 'Fiú', 'March',
      'Magyarország', null, 'Magyarország', '9. évfolyam', 'x', 'Nagyon', 'y']);
  }
  return out;
}

function audit(rows, options) {
  return new SurveyAuditor(DICT).auditSheet(rows, options);
}

function colVar(result, index) {
  const col = result.columns.find(c => c.colIndex === index);
  assert.ok(col, `column ${index} audited`);
  return col.canonical ? col.canonical.variable : null;
}

function collectFailures(cases, check) {
  const failures = [];
  for (const c of cases) {
    try {
      const msg = check(c);
      if (msg) failures.push(msg);
    } catch (err) {
      failures.push(`${JSON.stringify(c)}: ${err.message.split('\n')[0]}`);
    }
  }
  assert.strictEqual(failures.length, 0, failures.join('\n'));
}

// ---------------------------------------------------------------------------
// Section 2: export layout
// ---------------------------------------------------------------------------

const LAYOUT_CASES = [
  { label: 'EU Survey with preamble', rows: () => euPre('DEMO', CY_HEADER, cyData(5)),
    expected: { format: 'eusurvey', headerRowIndex: 3, dataStartIndex: 4 }, n: 5 },
  { label: 'EU Survey preamble, alias cell in odd case/whitespace', rows: () => [[' alias ', 'DEMO'], ['Export Date', 'x'], [], CY_HEADER, ...cyData(2)],
    expected: { format: 'eusurvey', headerRowIndex: 3, dataStartIndex: 4 }, n: 2 },
  { label: 'Qualtrics with question-text row', rows: () => qualtrics2(4),
    expected: { format: 'qualtrics', headerRowIndex: 0, dataStartIndex: 2 }, n: 4 },
  { label: 'Qualtrics with question-text and ImportId rows', rows: () => qualtrics3(4),
    expected: { format: 'qualtrics', headerRowIndex: 0, dataStartIndex: 3 }, n: 4 },
  { label: 'Qualtrics with one header row (date string)', rows: () => qualtrics1(4),
    expected: { format: 'qualtrics', headerRowIndex: 0, dataStartIndex: 1 }, n: 4 },
  { label: 'Qualtrics bare-ID one header row (Hungarian pattern)', rows: () => huRows(6),
    expected: { format: 'qualtrics', headerRowIndex: 0, dataStartIndex: 1 }, n: 6 },
  { label: 'No preamble (plain EU file)', rows: () => plain(CY_HEADER, cyData(5)),
    expected: { format: 'plain', headerRowIndex: 0, dataStartIndex: 1 }, n: 5 }
];

function testDetectExportLayoutTable() {
  assert.strictEqual(typeof SurveyAuditor.detectExportLayout, 'function',
    'SurveyAuditor.detectExportLayout must be exported');
  collectFailures(LAYOUT_CASES, c => {
    const got = SurveyAuditor.detectExportLayout(c.rows());
    const picked = { format: got.format, headerRowIndex: got.headerRowIndex, dataStartIndex: got.dataStartIndex };
    try {
      assert.deepStrictEqual(picked, c.expected);
    } catch (e) {
      return `${c.label}: got ${JSON.stringify(picked)}, expected ${JSON.stringify(c.expected)}`;
    }
    return null;
  });
}

function rowCountCheck(c) {
  const rows = c.rows();
  const result = audit(rows);
  const count = result.summary.metadata.dataRowCount;
  if (count !== c.n) return `${c.label}: dataRowCount ${count}, expected ${c.n}`;
  return null;
}

function cleanedCountCheck(c) {
  const rows = c.rows();
  const out = SurveyAuditor.cleanExportRows(rows, { dictionary: DICT });
  // contract: rows.length - dataStartIndex + 1 = one header + one row per respondent
  if (out.length !== c.n + 1) return `${c.label}: cleaned export has ${out.length} rows, expected ${c.n + 1}`;
  const noDict = SurveyAuditor.cleanExportRows(rows);
  if (noDict.length !== c.n + 1) return `${c.label}: no-dictionary export has ${noDict.length} rows, expected ${c.n + 1}`;
  return null;
}

function testDataRowCountQualtricsOneHeaderRow() {
  collectFailures(LAYOUT_CASES.filter(c => c.expected.format === 'qualtrics' && c.expected.dataStartIndex === 1), rowCountCheck);
}

function testDataRowCountQualtricsImportIdRow() {
  collectFailures(LAYOUT_CASES.filter(c => c.expected.dataStartIndex === 3), rowCountCheck);
}

function testDataRowCountPlainNoPreamble() {
  collectFailures(LAYOUT_CASES.filter(c => c.expected.format === 'plain'), rowCountCheck);
}

function testDataRowCountUnchangedLayouts() {
  collectFailures(LAYOUT_CASES.filter(c => c.expected.format === 'eusurvey' ||
    (c.expected.format === 'qualtrics' && c.expected.dataStartIndex === 2)), rowCountCheck);
}

function testCleanedRowCountsAllLayouts() {
  collectFailures(LAYOUT_CASES, cleanedCountCheck);
}

function testPlainFileColumnsMatch() {
  // A no-preamble file must be read from row 0: gender1 and bage1 are found.
  const result = audit(plain(CY_HEADER, cyData(3)), { country: 'Cyprus' });
  assert.strictEqual(colVar(result, 0), 'gender1');
  assert.strictEqual(colVar(result, 3), 'bage1');
}

function assertIdempotent(rows, country, label) {
  for (const coreOnly of [false, true]) {
    const opts = { dictionary: DICT, country, coreOnly };
    const once = SurveyAuditor.cleanExportRows(rows, opts);
    const twice = SurveyAuditor.cleanExportRows(once, opts);
    assert.deepStrictEqual(twice, once, `${label} (coreOnly ${coreOnly}): cleaning the export again changes nothing`);
    assert.ok(once[0].includes(bageHeaderFor(country)),
      `${label} (coreOnly ${coreOnly}): age-at-arrival header names ${country}: ${JSON.stringify(once[0])}`);
    assert.ok(once[0].includes(dictVar('gender1').question_stem), `${label} (coreOnly ${coreOnly}) keeps gender1`);
    assert.ok(once[0].includes(dictVar('bmonth1').question_stem), `${label} (coreOnly ${coreOnly}) keeps the month item`);
  }
}

function testIdempotentEuPreamble() {
  assertIdempotent(euPre('MentorCY2026', CY_HEADER, cyData(4)), 'Cyprus', 'EU with preamble');
}

function testIdempotentQualtrics() {
  assertIdempotent(qualtrics2(4), 'Cyprus', 'Qualtrics');
}

function testIdempotentPlainEu() {
  assertIdempotent(plain(CY_HEADER, cyData(4)), 'Cyprus', 'plain EU');
}

// ---------------------------------------------------------------------------
// Section 3: survey country detection
// ---------------------------------------------------------------------------

const ALIAS_TABLE = [
  ['MentorCY2026', 'Cyprus'],
  ['Spain', 'Spain'], ['españa', 'Spain'], ['ESPAÑA', 'Spain'], ['  Spain  ', 'Spain'], ['ES', 'Spain'], ['es', 'Spain'],
  ['Hungary', 'Hungary'], ['hu', 'Hungary'], ['HU', 'Hungary'], ['  HU ', 'Hungary'],
  ['Germany', 'Germany'], ['DE', 'Germany'], ['deutschland', 'Germany'],
  ['NORWAY', 'Norway'], ['norge', 'Norway'], ['NO', 'Norway'], ['mentor_NO', 'Norway'],
  ['cyprus_test', 'Cyprus'], ['Spain2026', 'Spain'],
  ['survey for spain', 'Spain'], ['Spain–', 'Spain'],
  ['mentor_fhi', null], ['MENTORMasterGER1', null], ['DEMO', null], ['', null], ['Espana', null],
  ['no', null], ['Cy', null], ['Hungarian', null], ['Hungarycy', null],
  ['SpainHU', null], ['Spain_Norway', null],
  ['Spain_ES', 'Spain']
];

// Header without any country name, so only the Alias cell can give a country.
const NEUTRAL_HEADER = ['What gender do you identify as? (gender1)', 'Notes'];

function testDetectSurveyCountryAliasTable() {
  assert.strictEqual(typeof SurveyAuditor.detectSurveyCountry, 'function',
    'SurveyAuditor.detectSurveyCountry must be exported');
  collectFailures(ALIAS_TABLE, ([alias, name]) => {
    const got = SurveyAuditor.detectSurveyCountry(euPre(alias, NEUTRAL_HEADER, [['Boy', 'x']]));
    const want = { name, source: name ? 'alias' : null };
    if (got.name !== want.name || got.source !== want.source) {
      return `Alias ${JSON.stringify(alias)}: got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`;
    }
    return null;
  });
}

function testAuditSheetMetadataCountryFromAlias() {
  collectFailures(ALIAS_TABLE, ([alias, name]) => {
    const meta = audit(euPre(alias, NEUTRAL_HEADER, [['Boy', 'x']])).summary.metadata;
    if (meta.country !== name || meta.countrySource !== (name ? 'alias' : null)) {
      return `Alias ${JSON.stringify(alias)}: metadata country ${JSON.stringify(meta.country)} / ${JSON.stringify(meta.countrySource)}, expected ${JSON.stringify(name)}`;
    }
    return null;
  });
}

const NO_BAGE_HEADER = 'Approximately how old were you when you came/moved to Norway? (born3)';

function testDetectCountryFromSourceHeaderNorway() {
  const rows = euPre('mentor_fhi', ['What gender do you identify as? (gender1)', NO_BAGE_HEADER], [['Boy', null]]);
  assert.deepStrictEqual(SurveyAuditor.detectSurveyCountry(rows), { name: 'Norway', source: 'header' });
  const meta = audit(rows).summary.metadata;
  assert.strictEqual(meta.country, 'Norway');
  assert.strictEqual(meta.countrySource, 'header');
}

function testDetectCountryFromCleanedExportHeader() {
  const rows = plain(['What gender do you identify as?', bageHeaderFor('Cyprus')], [['Boy', null], ['Girl', '5']]);
  assert.deepStrictEqual(SurveyAuditor.detectSurveyCountry(rows), { name: 'Cyprus', source: 'header' });
}

function testHeaderCountryNormalisedAndPlaceholderIgnored() {
  const norge = plain(['Gender (gender1)', 'How old when you came/moved to norge? (born3)'], [['Boy', null]]);
  assert.deepStrictEqual(SurveyAuditor.detectSurveyCountry(norge), { name: 'Norway', source: 'header' });
  for (const ph of ['[country]', '[COUNTRY]', '[Country]']) {
    const rows = plain(['Gender (gender1)', `How old when you came/moved to ${ph}? (born3)`], [['Boy', null]]);
    assert.deepStrictEqual(SurveyAuditor.detectSurveyCountry(rows), { name: null, source: null },
      `placeholder ${ph} is not a country`);
  }
}

function testDetectCountryFromFileName() {
  const rows = plain(CY_HEADER, cyData(2)); // header says [country]: sources 1 and 2 give nothing
  const cases = [
    ['Hungary_cleaned_scrambled_sample.xlsx', 'Hungary'],
    ['Content_Export_MentorCY2026_CYPRUS (1)_cleaned.xlsx', 'Cyprus'],
    ['Content_Export_Spain_2026.10.29-Spain_cleaned.xlsx', 'Spain'],
    ['test_data.xlsx', null]
  ];
  collectFailures(cases, ([fileName, name]) => {
    const got = SurveyAuditor.detectSurveyCountry(rows, fileName);
    const want = { name, source: name ? 'filename' : null };
    if (got.name !== want.name || got.source !== want.source) {
      return `${fileName}: got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`;
    }
    return null;
  });
  assert.deepStrictEqual(SurveyAuditor.detectSurveyCountry(rows), { name: null, source: null },
    'no file name: no country');
}

function testCountrySourcePrecedence() {
  const header = ['What gender do you identify as? (gender1)', NO_BAGE_HEADER];
  assert.deepStrictEqual(SurveyAuditor.detectSurveyCountry(euPre('MentorCY2026', header, [['Boy', null]])),
    { name: 'Cyprus', source: 'alias' }, 'Alias beats the header');
  assert.deepStrictEqual(SurveyAuditor.detectSurveyCountry(euPre('mentor_fhi', header, [['Boy', null]])),
    { name: 'Norway', source: 'header' }, 'header used when Alias gives none');
  assert.deepStrictEqual(SurveyAuditor.detectSurveyCountry(euPre('Spain', NEUTRAL_HEADER, [['Boy', 'x']]), 'Hungary_cleaned.xlsx'),
    { name: 'Spain', source: 'alias' }, 'Alias beats the file name');
  assert.deepStrictEqual(SurveyAuditor.detectSurveyCountry(euPre('SpainHU', header, [['Boy', null]])),
    { name: 'Norway', source: 'header' }, 'two countries in Alias: fall through to the header');
  const cyHeader = plain(['Gender', bageHeaderFor('Cyprus')], [['Boy', null]]);
  assert.deepStrictEqual(SurveyAuditor.detectSurveyCountry(cyHeader, 'Hungary_cleaned.xlsx'),
    { name: 'Cyprus', source: 'header' }, 'header beats the file name');
}

function testQualtricsUserLanguageNotCountry() {
  const rows = [
    ['StartDate', 'Spain', 'UserLanguage', 'Gender (gender1)'],
    ['Start Date', 'country', 'User Language', 'What is your gender?'],
    ['2020-01-01', 'x', 'HU', 'Girl']
  ];
  assert.deepStrictEqual(SurveyAuditor.detectSurveyCountry(rows), { name: null, source: null });
  const meta = audit(rows).summary.metadata;
  assert.strictEqual(meta.country, null);
  assert.strictEqual(meta.countrySource, null);
}

// ---------------------------------------------------------------------------
// Section 1: options.country
// ---------------------------------------------------------------------------

function testOptionCountryNormalisedAndSelected() {
  const rows = euPre('DEMO', NEUTRAL_HEADER, [['Boy', 'x']]);
  const cases = [['hungary', 'Hungary'], ['Norge', 'Norway'], ['  spain ', 'Spain'], ['ESPAÑA', 'Spain'],
    ['deutschland', 'Germany'], ['Cyprus', 'Cyprus'], ['Malta', 'Malta']];
  collectFailures(cases, ([given, name]) => {
    const meta = audit(rows, { country: given }).summary.metadata;
    if (meta.country !== name || meta.countrySource !== 'selected') {
      return `country ${JSON.stringify(given)}: got ${JSON.stringify(meta.country)} / ${JSON.stringify(meta.countrySource)}, expected ${name} / selected`;
    }
    return null;
  });
}

function testEmptyOptionCountryFallsBackToDetection() {
  const rows = euPre('Spain', NEUTRAL_HEADER, [['Boy', 'x']]);
  for (const given of [undefined, null, '', '   ']) {
    const meta = audit(rows, given === undefined ? {} : { country: given }).summary.metadata;
    assert.strictEqual(meta.country, 'Spain', `country ${JSON.stringify(given)} -> detection`);
    assert.strictEqual(meta.countrySource, 'alias', `country ${JSON.stringify(given)} -> source alias`);
  }
  const none = audit(euPre('DEMO', NEUTRAL_HEADER, [['Boy', 'x']])).summary.metadata;
  assert.strictEqual(none.country, null, 'nothing detected: null');
  assert.strictEqual(none.countrySource, null);
}

// ---------------------------------------------------------------------------
// Section 4: one country for alias priority and substitution
// ---------------------------------------------------------------------------

function testNorwayExportKeepsCountryInHeaderAndAnswers() {
  // Regression from #9: NO export, Alias mentor_fhi, header names Norway.
  const rows = euPre('mentor_fhi', [NO_BAGE_HEADER, 'Where were you born? (born2)'], [[5, '[COUNTRY]'], [null, 'Ukraine']]);
  const out = SurveyAuditor.cleanExportRows(rows, { dictionary: DICT });
  assert.strictEqual(out[0][0], 'Approximately how old were you when you came/moved to Norway?');
  assert.notStrictEqual(out[0][0], BAGE_STEM, 'placeholder [country] must not be written');
  assert.strictEqual(out[1][1], 'Norway', '[COUNTRY] answer becomes Norway');
}

function testDetectedCyprusSubstitutedInExport() {
  const out = SurveyAuditor.cleanExportRows(euPre('MentorCY2026', CY_HEADER, cyData(2)), { dictionary: DICT });
  assert.strictEqual(out[0][3], bageHeaderFor('Cyprus'));
  assert.strictEqual(out[1][2], 'Cyprus', '[COUNTRY] answer becomes Cyprus');
}

function testCountryWithoutOrigAliasesMatchesAsNoCountry() {
  // Cyprus has no orig_aliases: born2 -> bplace1 (orig_variable), as with no country.
  const result = audit(euPre('MentorCY2026', CY_HEADER, cyData(2)));
  assert.strictEqual(colVar(result, 1), 'bmonth1');
  assert.strictEqual(colVar(result, 2), 'bplace1');
  assert.strictEqual(colVar(result, 3), 'bage1');
}

function testExplicitCountryBeatsAliasDetection() {
  // Alias says Spain; country Hungary uses Hungary's aliases (grade1: 'schooltype', cyrm12: 'cyrm1:12_12').
  assert.strictEqual(dictVar('grade1').orig_aliases.hungary, 'schooltype');
  const header = ['School type (schooltype)', 'Grade (grade1)', 'Age at arrival (born4)'];
  const rows = euPre('Spain', header, [['9. évfolyam', 'x', '5']]);
  const result = audit(rows, { country: 'Hungary' });
  assert.strictEqual(result.summary.metadata.country, 'Hungary');
  assert.strictEqual(result.summary.metadata.countrySource, 'selected');
  assert.strictEqual(colVar(result, 0), 'grade1', 'schooltype is Hungary\'s grade1');
  assert.notStrictEqual(colVar(result, 1), 'grade1', 'grade1 header is not Hungary\'s grade1');
  const out = SurveyAuditor.cleanExportRows(rows, { dictionary: DICT, country: 'Hungary' });
  assert.strictEqual(out[0][2], bageHeaderFor('Hungary'));
}

const HU_EXPECTED = [
  // [header, expected variable, must not be]
  ['gender1', 'gender1', null],
  ['born2', 'bmonth1', 'bplace1'],
  ['born3', 'bplace1', 'bage1'],
  ['born4', 'bage1', 'bmborn1'],
  ['born5', 'bmborn1', null],
  ['schooltype', 'grade1', null],
  ['grade1', undefined, 'grade1'],
  ['cyrm1:12_12', 'cyrm12', null],
  ['CYRM12', undefined, 'cyrm12']
];

function testHungaryMappingWithCountry() {
  // Expected variables are the dictionary's orig_aliases.hungary owners.
  for (const [hdr, want] of HU_EXPECTED) {
    if (want) assert.strictEqual(dictVar(want).orig_aliases.hungary, hdr, `dictionary: ${want} is Hungary's ${hdr}`);
  }
  const result = audit(huRows(3), { country: 'Hungary' });
  const failures = [];
  for (const [hdr, want, notWant] of HU_EXPECTED) {
    const got = colVar(result, HU_HEADER.indexOf(hdr));
    if (want !== undefined && got !== want) failures.push(`${hdr} -> ${got}, expected ${want}`);
    if (notWant && got === notWant) failures.push(`${hdr} -> ${got}, must not be ${notWant}`);
  }
  assert.strictEqual(failures.length, 0, failures.join('\n'));
}

function testHungaryNoDuplicateCoreAssignment() {
  const result = audit(huRows(3), { country: 'Hungary' });
  const counts = new Map();
  for (const c of result.columns) {
    if (c.canonical && c.canonical.is_core === true) {
      counts.set(c.canonical.variable, (counts.get(c.canonical.variable) || 0) + 1);
    }
  }
  const dups = [...counts].filter(([, k]) => k > 1).map(([v]) => v);
  assert.deepStrictEqual(dups, [], 'no core variable is assigned to two columns');
}

function testHungaryCleanedExportHeaders() {
  const out = SurveyAuditor.cleanExportRows(huRows(3), { dictionary: DICT, country: 'Hungary' });
  assert.strictEqual(out.length, 4, 'header + 3 respondents');
  assert.strictEqual(out[0][HU_HEADER.indexOf('born2')], dictVar('bmonth1').question_stem);
  assert.strictEqual(out[0][HU_HEADER.indexOf('born3')], dictVar('bplace1').question_stem);
  assert.strictEqual(out[0][HU_HEADER.indexOf('born4')], bageHeaderFor('Hungary'));
  assert.strictEqual(out[1][HU_HEADER.indexOf('born3')], 'Hungary', 'Magyarország -> [COUNTRY] -> Hungary');
  assert.strictEqual(out[1][HU_HEADER.indexOf('gender1')], 'Boy');
}

// ---------------------------------------------------------------------------
// Section 7: UI source wiring
// ---------------------------------------------------------------------------

function tagWithId(source, id) {
  const at = source.indexOf(`id="${id}"`);
  if (at === -1) return null;
  const start = source.lastIndexOf('<', at);
  return { at, start, tag: source.slice(start, source.indexOf('>', at) + 1) };
}

function assertCountrySelectorMarkup(rel) {
  const source = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const cardAt = source.indexOf('class="action-card"');
  const emptyAt = source.indexOf('id="empty-state-view"');
  assert.notStrictEqual(cardAt, -1, `${rel} has the upload action card`);

  const select = tagWithId(source, 'country-select');
  assert.ok(select, `${rel} has #country-select`);
  assert.ok(select.tag.startsWith('<select'), `${rel}: #country-select is a <select>`);
  assert.ok(select.at > cardAt && select.at < emptyAt, `${rel}: #country-select is inside the upload action card`);
  const body = source.slice(select.at, source.indexOf('</select>', select.at));
  for (const name of ['Cyprus', 'Germany', 'Hungary', 'Norway', 'Spain']) {
    assert.ok(new RegExp(`<option[^>]*>\\s*${name}\\s*</option>`).test(body), `${rel}: option ${name}`);
  }
  assert.ok(/<option[^>]*value="other"[^>]*>\s*Other/.test(body), `${rel}: "Other…" option with value other`);
  assert.ok(/<option[^>]*value=""[^>]*>[^<]*not detected/.test(body), `${rel}: empty "not detected — choose" option`);

  const other = tagWithId(source, 'country-other');
  assert.ok(other, `${rel} has #country-other`);
  assert.ok(other.tag.startsWith('<input'), `${rel}: #country-other is an <input>`);
  assert.ok(/type="text"/.test(other.tag), `${rel}: #country-other is a text field`);
  assert.ok(/\shidden(\s|>|=)|display:\s*none/.test(other.tag), `${rel}: #country-other is hidden until Other is chosen`);

  assert.ok(tagWithId(source, 'country-source'), `${rel} has #country-source`);

  for (const id of ['btn-export-cleaned', 'btn-export-cleaned-core']) {
    const btn = tagWithId(source, id);
    assert.ok(btn, `${rel} has #${id}`);
    assert.ok(/\sdisabled(\s|>|=)/.test(btn.tag), `${rel}: #${id} is disabled in the markup`);
  }
}

function testCountrySelectorMarkup() {
  assertCountrySelectorMarkup('index.qmd');
  assertCountrySelectorMarkup('docs/index.html');
}

function callSnippets(source, name) {
  const out = [];
  let at = source.indexOf(`${name}(`);
  while (at !== -1) {
    out.push(source.slice(at, source.indexOf(';', at)));
    at = source.indexOf(`${name}(`, at + 1);
  }
  return out;
}

function testAppCountryWiring() {
  for (const rel of ['src/app.js', 'docs/src/app.js']) {
    const source = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    const detect = callSnippets(source, 'SurveyAuditor.detectSurveyCountry');
    assert.ok(detect.length > 0, `${rel} calls SurveyAuditor.detectSurveyCountry`);
    assert.ok(detect.some(s => /detectSurveyCountry\(\s*\w+\s*,\s*[^)]*[Nn]ame/.test(s)),
      `${rel} passes the file name to detectSurveyCountry`);
    const audits = callSnippets(source, '.auditSheet');
    assert.ok(audits.length > 0 && audits.every(s => s.includes('country')), `${rel}: auditSheet receives country`);
    const cleans = callSnippets(source, 'cleanExportRows').filter(s => s.includes('dictionary'));
    assert.ok(cleans.length >= 2, `${rel}: two cleanExportRows calls with a dictionary`);
    assert.ok(cleans.every(s => s.includes('country')), `${rel}: cleanExportRows with dictionary receives country`);
    assert.ok(source.includes('country-select'), `${rel} reads #country-select`);
    assert.ok(source.includes('country-other'), `${rel} reads #country-other`);
  }
  for (const [pub, src] of [
    ['docs/src/app.js', 'src/app.js'],
    ['docs/src/survey_validator.js', 'src/survey_validator.js'],
    ['docs/describe/vfs/report/R/load_survey.R', 'report/R/load_survey.R']
  ]) {
    assert.strictEqual(fs.readFileSync(path.join(ROOT, pub), 'utf8'), fs.readFileSync(path.join(ROOT, src), 'utf8'),
      `${pub} is identical to ${src}`);
  }
}

// ---------------------------------------------------------------------------
// Section 11a: unlabelled EU Survey preamble
// ---------------------------------------------------------------------------

// Real EU Survey exports exist with no preamble labels: A1 holds the alias
// value itself, A2 an export date as an Excel date number, row 2 blank,
// header on row index 3 (contract section 11a).
function euPreUnlabelled(alias, header, dataRows) {
  return [
    [alias],
    [46327],
    [],
    header,
    ...dataRows
  ];
}

const EU_LAYOUT = { format: 'eusurvey', headerRowIndex: 3, dataStartIndex: 4 };
const PLAIN_LAYOUT = { format: 'plain', headerRowIndex: 0, dataStartIndex: 1 };

function pickLayout(rows) {
  const got = SurveyAuditor.detectExportLayout(rows);
  return { format: got.format, headerRowIndex: got.headerRowIndex, dataStartIndex: got.dataStartIndex };
}

function testUnlabelledPreambleLayoutAndRowCount() {
  const rows = euPreUnlabelled('mentor_fhi', CY_HEADER, cyData(5));
  assert.deepStrictEqual(pickLayout(rows), EU_LAYOUT, 'unlabelled preamble is an EU Survey layout');
  const count = audit(rows).summary.metadata.dataRowCount;
  // wrong answer from the contract: 8 (rows 1-3 read as respondents)
  assert.strictEqual(count, 5, `dataRowCount ${count}, expected 5 respondent rows`);
  const out = SurveyAuditor.cleanExportRows(rows, { dictionary: DICT });
  assert.strictEqual(out.length, 6, `cleaned export has ${out.length} rows, expected header + 5`);
}

function testUnlabelledPreambleColumnsMatch() {
  const result = audit(euPreUnlabelled('mentor_fhi', CY_HEADER, cyData(3)), { country: 'Cyprus' });
  assert.strictEqual(colVar(result, 0), 'gender1');
  assert.strictEqual(colVar(result, 3), 'bage1');
}

function testUnlabelledPreambleAliasFromA1() {
  const rows = euPreUnlabelled('MentorCY2026', NEUTRAL_HEADER, [['Boy', 'x']]);
  assert.deepStrictEqual(SurveyAuditor.detectSurveyCountry(rows), { name: 'Cyprus', source: 'alias' });
  const meta = audit(rows).summary.metadata;
  assert.strictEqual(meta.country, 'Cyprus');
  assert.strictEqual(meta.countrySource, 'alias');
  assert.strictEqual(meta.alias, 'MentorCY2026', 'metadata.alias is read from A1 when A1 is not the Alias label');
  assert.strictEqual(meta.dataRowCount, 1);
}

function testUnlabelledPreambleNorwayFromHeader() {
  const rows = euPreUnlabelled('mentor_fhi', ['What gender do you identify as? (gender1)', NO_BAGE_HEADER],
    [['Boy', null], ['Girl', '7']]);
  assert.deepStrictEqual(SurveyAuditor.detectSurveyCountry(rows), { name: 'Norway', source: 'header' });
  const meta = audit(rows).summary.metadata;
  assert.strictEqual(meta.country, 'Norway');
  assert.strictEqual(meta.countrySource, 'header');
  assert.strictEqual(meta.dataRowCount, 2);
}

function testPlainTwoColumnTwoRowsStaysPlain() {
  const rows = [['What gender do you identify as? (gender1)', 'Notes'], ['Boy', 'x']];
  assert.deepStrictEqual(pickLayout(rows), PLAIN_LAYOUT);
  assert.strictEqual(audit(rows).summary.metadata.dataRowCount, 1);
}

function testPlainWideHeaderStaysPlain() {
  // Row 0 has 5 non-empty cells (> 2), so the unlabelled-preamble rule does not apply.
  const rows = plain(CY_HEADER, cyData(6));
  assert.deepStrictEqual(pickLayout(rows), PLAIN_LAYOUT);
  assert.strictEqual(audit(rows).summary.metadata.dataRowCount, 6);
}

// ---------------------------------------------------------------------------
// Section 11c: scrambled cleaned sample is canonical
// ---------------------------------------------------------------------------

function functionBody(source, marker) {
  const at = source.indexOf(marker);
  assert.notStrictEqual(at, -1, `defines ${marker}`);
  const open = source.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}' && --depth === 0) return source.slice(open, i + 1);
  }
  throw new Error(`unterminated body for ${marker}`);
}

function buttonLabel(source, tag) {
  const end = source.indexOf('</button>', tag.start);
  return source.slice(tag.start + tag.tag.length, end).trim();
}

function testScrambledCleanedMarkup() {
  for (const rel of ['index.qmd', 'docs/index.html']) {
    const source = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    const cleanedBtn = tagWithId(source, 'btn-export-scrambled-cleaned');
    assert.ok(cleanedBtn, `${rel} has #btn-export-scrambled-cleaned`);
    assert.ok(/\sdisabled(\s|>|=)/.test(cleanedBtn.tag), `${rel}: #btn-export-scrambled-cleaned is disabled in the markup`);
    assert.strictEqual(buttonLabel(source, cleanedBtn), 'Scrambled cleaned sample', `${rel}: label kept`);
    const raw = tagWithId(source, 'btn-export-scrambled');
    assert.ok(raw, `${rel} has #btn-export-scrambled`);
    assert.ok(!/\sdisabled(\s|>|=)/.test(raw.tag), `${rel}: #btn-export-scrambled (raw) is not disabled`);
    assert.strictEqual(buttonLabel(source, raw), 'Scrambled sample', `${rel}: label kept`);
    const ids = ['btn-export-issues', 'btn-export-cleaned', 'btn-export-cleaned-core', 'btn-export-scrambled', 'btn-export-scrambled-cleaned'];
    const pos = ids.map(id => { const t = tagWithId(source, id); assert.ok(t, `${rel} has #${id}`); return t.at; });
    for (let i = 1; i < pos.length; i++) assert.ok(pos[i - 1] < pos[i], `${rel}: #${ids[i - 1]} comes before #${ids[i]}`);
  }
}

function testAppScrambledCleanedWiring() {
  for (const rel of ['src/app.js', 'docs/src/app.js']) {
    const source = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    const body = functionBody(source, 'window.exportScrambledCleanedSample');
    const cleans = callSnippets(body, 'cleanExportRows');
    assert.ok(cleans.length > 0, `${rel}: exportScrambledCleanedSample calls cleanExportRows`);
    assert.ok(cleans.every(s => s.includes('currentSheetRows') && s.includes('dictionary') && s.includes('country') && !s.includes('coreOnly')),
      `${rel}: exportScrambledCleanedSample cleans currentSheetRows with dictionary and country (full export): ${JSON.stringify(cleans)}`);
    assert.ok(/scrambleExportSample\([^)]*layout/.test(body), `${rel}: scrambles with the cleaned layout`);
    assert.ok(/!\s*currentCountry/.test(body), `${rel}: exportScrambledCleanedSample refuses without a country`);
    const rawBody = functionBody(source, 'window.exportScrambledSample =');
    assert.ok(/scrambleExportSample\(\s*currentSheetRows\s*\)/.test(rawBody), `${rel}: raw scrambled sample unchanged`);
    // Enabled together with the two cleaned-export buttons: every place that
    // names the core cleaned button also names the scrambled cleaned button.
    let at = source.indexOf("'btn-export-cleaned-core'");
    assert.notStrictEqual(at, -1, `${rel} enables #btn-export-cleaned-core`);
    while (at !== -1) {
      const near = source.slice(Math.max(0, at - 300), at + 300);
      assert.ok(near.includes('btn-export-scrambled-cleaned'),
        `${rel}: #btn-export-scrambled-cleaned is enabled together with the cleaned-export buttons`);
      at = source.indexOf("'btn-export-cleaned-core'", at + 1);
    }
  }
}

// ---------------------------------------------------------------------------

const TESTS = [
  testDetectExportLayoutTable,
  testDataRowCountQualtricsOneHeaderRow,
  testDataRowCountQualtricsImportIdRow,
  testDataRowCountPlainNoPreamble,
  testDataRowCountUnchangedLayouts,
  testCleanedRowCountsAllLayouts,
  testPlainFileColumnsMatch,
  testIdempotentEuPreamble,
  testIdempotentQualtrics,
  testIdempotentPlainEu,
  testDetectSurveyCountryAliasTable,
  testAuditSheetMetadataCountryFromAlias,
  testDetectCountryFromSourceHeaderNorway,
  testDetectCountryFromCleanedExportHeader,
  testHeaderCountryNormalisedAndPlaceholderIgnored,
  testDetectCountryFromFileName,
  testCountrySourcePrecedence,
  testQualtricsUserLanguageNotCountry,
  testOptionCountryNormalisedAndSelected,
  testEmptyOptionCountryFallsBackToDetection,
  testNorwayExportKeepsCountryInHeaderAndAnswers,
  testDetectedCyprusSubstitutedInExport,
  testCountryWithoutOrigAliasesMatchesAsNoCountry,
  testExplicitCountryBeatsAliasDetection,
  testHungaryMappingWithCountry,
  testHungaryNoDuplicateCoreAssignment,
  testHungaryCleanedExportHeaders,
  testCountrySelectorMarkup,
  testAppCountryWiring,
  testUnlabelledPreambleLayoutAndRowCount,
  testUnlabelledPreambleColumnsMatch,
  testUnlabelledPreambleAliasFromA1,
  testUnlabelledPreambleNorwayFromHeader,
  testPlainTwoColumnTwoRowsStaysPlain,
  testPlainWideHeaderStaysPlain,
  testScrambledCleanedMarkup,
  testAppScrambledCleanedWiring
];

function runTests() {
  console.log('--- Starting issue #15 country/layout tests ---');
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
    console.log(`${failed} issue #15 test(s) failed.`);
    process.exit(1);
  }
  console.log('All issue #15 tests passed.');
}

if (require.main === module) runTests();
module.exports = { TESTS };
