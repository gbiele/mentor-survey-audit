/**
 * Export cleaned data: strip trailing ID tags and drop preamble rows.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const SurveyAuditor = require('../src/survey_validator.js');

const ROOT = path.resolve(__dirname, '..');

function assertCleanedExportButton(relativePath) {
  const source = fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
  const issuesAt = source.indexOf('id="btn-export-issues"');
  const cleanedAt = source.indexOf('id="btn-export-cleaned"');
  const sampleAt = source.indexOf('id="btn-load-sample"');
  assert.notStrictEqual(issuesAt, -1, `${relativePath} keeps Export Audit Issues`);
  assert.notStrictEqual(cleanedAt, -1, `${relativePath} contains #btn-export-cleaned`);
  assert.ok(cleanedAt > issuesAt, `${relativePath}: cleaned export follows audit-issues export`);
  assert.ok(sampleAt > cleanedAt, `${relativePath}: cleaned export precedes Load sample data`);
  const button = source.slice(cleanedAt, source.indexOf('</button>', cleanedAt));
  assert.ok(button.includes('Export cleaned data'), `${relativePath} button label`);
  assert.ok(button.includes('window.exportCleanedData'), `${relativePath} click handler`);
  assert.ok(button.includes('btn-export'), `${relativePath} uses the export button style`);

  // Issue #9: the full export is labelled "all columns"; a second button
  // exports the core questions only, between the full export and the
  // scrambled samples.
  assert.ok(button.includes('onclick="window.exportCleanedData()"'), `${relativePath} full export onclick`);
  assert.ok(button.includes('btn btn-export'), `${relativePath} full export class`);
  assert.ok(button.includes('all columns'), `${relativePath} full export label mentions all columns`);
  const coreAt = source.indexOf('id="btn-export-cleaned-core"');
  assert.notStrictEqual(coreAt, -1, `${relativePath} contains #btn-export-cleaned-core`);
  assert.ok(coreAt > cleanedAt, `${relativePath}: core export follows the full cleaned export`);
  const coreButton = source.slice(coreAt, source.indexOf('</button>', coreAt));
  assert.ok(coreButton.includes('Export cleaned data'), `${relativePath} core button label`);
  assert.ok(coreButton.includes('core questions'), `${relativePath} core button label mentions core questions`);
  assert.ok(coreButton.includes('onclick="window.exportCleanedCoreData()"'), `${relativePath} core click handler`);
  assert.ok(coreButton.includes('btn btn-export'), `${relativePath} core button uses the export button style`);

  const scrambledAt = source.indexOf('id="btn-export-scrambled"');
  const scrambledCleanedAt = source.indexOf('id="btn-export-scrambled-cleaned"');
  assert.notStrictEqual(scrambledAt, -1, `${relativePath} contains the scrambled original download`);
  assert.notStrictEqual(scrambledCleanedAt, -1, `${relativePath} contains the scrambled cleaned download`);
  assert.ok(scrambledAt > cleanedAt, `${relativePath}: scrambled sample follows cleaned export`);
  assert.ok(scrambledAt > coreAt, `${relativePath}: scrambled sample follows the core export`);
  assert.ok(scrambledCleanedAt > scrambledAt, `${relativePath}: scrambled cleaned sample follows scrambled sample`);
  assert.ok(sampleAt > scrambledCleanedAt, `${relativePath}: scrambled downloads precede Load sample data`);

  const scrambledButton = source.slice(scrambledAt, source.indexOf('</button>', scrambledAt));
  const scrambledCleanedButton = source.slice(scrambledCleanedAt, source.indexOf('</button>', scrambledCleanedAt));
  assert.ok(scrambledButton.includes('window.exportScrambledSample'), `${relativePath} scrambled click handler`);
  assert.ok(scrambledCleanedButton.includes('window.exportScrambledCleanedSample'), `${relativePath} scrambled cleaned click handler`);
  assert.ok(scrambledButton.includes('btn-sm'), `${relativePath} scrambled sample uses btn-sm`);
  assert.ok(scrambledCleanedButton.includes('btn-sm'), `${relativePath} scrambled cleaned sample uses btn-sm`);
  assert.ok(scrambledButton.includes('Scrambled sample'), `${relativePath} scrambled sample label`);
  assert.ok(scrambledCleanedButton.includes('Scrambled cleaned sample'), `${relativePath} scrambled cleaned label`);
}

// Output position reads source (n - 1 - out + column). Column 0 is a
// reversal, so a value past row 50 can land in the kept sample and a
// value from the original first 50 can be cut. Later columns shift, so
// one respondent's answers do not stay on the same row.
function fixedPermutation(n, columnIndex) {
  const order = new Array(n);
  for (let out = 0; out < n; out++) {
    order[out] = (n - 1 - out + columnIndex) % n;
  }
  return order;
}

function withoutRandom(fn) {
  const original = Math.random;
  Math.random = function () {
    throw new Error('scramble result depended on Math.random');
  };
  try {
    return fn();
  } finally {
    Math.random = original;
  }
}

function buildSheet(responseCount, format) {
  const columnCount = 3;
  const responses = [];
  for (let r = 0; r < responseCount; r++) {
    responses.push([
      `r${r}c0`,
      `Choice ${r} (ID${r + 1})`,
      `r${r}c2`
    ]);
  }
  if (format === 'qualtrics') {
    return [
      ['StartDate', 'What is your gender? (gender1)', `Notes ${columnCount}`],
      ['Start Date', 'question text', 'notes text'],
      ...responses
    ];
  }
  return [
    ['Alias', 'DEMO'],
    ['Export Date', '2026-01-01'],
    ['Preamble', 'keep me'],
    ['What gender do you identify as? (gender1)', 'City (city1)', 'Notes'],
    ...responses
  ];
}

function assertScrambledSample(actual, sourceRows, layout, label) {
  const dataStart = layout.dataStartIndex;
  const responses = sourceRows.slice(dataStart);
  const kept = Math.min(50, responses.length);
  assert.strictEqual(actual.length, dataStart + kept, `${label} keeps the prefix and the sample only`);
  for (let i = 0; i < dataStart; i++) {
    assert.deepStrictEqual(actual[i], sourceRows[i], `${label} leaves prefix row ${i} unchanged`);
  }
  assert.deepStrictEqual(
    actual[layout.headerRowIndex],
    sourceRows[layout.headerRowIndex],
    `${label} leaves the header unchanged`
  );

  const width = sourceRows[layout.headerRowIndex].length;
  const actualResponses = actual.slice(dataStart);
  for (let c = 0; c < width; c++) {
    const order = fixedPermutation(responses.length, c);
    for (let out = 0; out < kept; out++) {
      assert.strictEqual(
        actualResponses[out][c],
        responses[order[out]][c],
        `${label} permutes column ${c} before keeping row ${out}`
      );
    }
    if (responses.length > 50) {
      const dropped = responses[order[50]][c];
      const keptValues = actualResponses.map(row => row[c]);
      assert.ok(
        !keptValues.includes(dropped),
        `${label} drops the column value that the full permutation places past row 50`
      );
      assert.ok(
        keptValues.includes(responses[responses.length - 1][c]) || order.indexOf(responses.length - 1) >= 50,
        `${label} can keep a response from past the first 50 rows`
      );
    }
  }

  if (responses.length >= 2 && width >= 2) {
    const originalRows = new Set(responses.map(row => JSON.stringify(row)));
    for (const row of actualResponses) {
      assert.ok(
        !originalRows.has(JSON.stringify(row)),
        `${label}: values from one respondent do not stay on the same row`
      );
    }
  }
}

function assertUploadedAndCleaned(format, responseCount) {
  const uploaded = buildSheet(responseCount, format);
  const uploadedLayout = format === 'qualtrics'
    ? { headerRowIndex: 0, dataStartIndex: 2 }
    : { headerRowIndex: 3, dataStartIndex: 4 };
  const cleanedLayout = { headerRowIndex: 0, dataStartIndex: 1 };
  const label = `${format} ${responseCount} responses`;

  const uploadedSample = withoutRandom(() => SurveyAuditor.scrambleExportSample(uploaded, {
    permutation: fixedPermutation
  }));
  assertScrambledSample(uploadedSample, uploaded, uploadedLayout, `${label} uploaded`);

  const cleaned = SurveyAuditor.cleanExportRows(uploaded);
  const cleanedSample = withoutRandom(() => SurveyAuditor.scrambleExportSample(cleaned, {
    permutation: fixedPermutation,
    layout: cleanedLayout
  }));
  assertScrambledSample(cleanedSample, cleaned, cleanedLayout, `${label} cleaned`);

  const flatCleaned = cleanedSample.flat();
  assert.ok(!flatCleaned.includes('Alias'), `${label} cleaned sample has no EU Survey preamble`);
  assert.ok(!flatCleaned.includes('Start Date'), `${label} cleaned sample has no Qualtrics question-text row`);
  assert.ok(!flatCleaned.some(value => typeof value === 'string' && /\(ID\d+\)/.test(value)),
    `${label} cleaned sample is scrambled after tags are stripped`);
  assert.ok(uploadedSample.flat().some(value => typeof value === 'string' && /\(ID\d+\)/.test(value)),
    `${label} uploaded sample keeps answer tags`);
}

function testExportButtons() {
  assertCleanedExportButton('index.qmd');
  assertCleanedExportButton('docs/index.html');
  console.log('✓ Export cleaned data button is beside Export Audit Issues');
}

function testNoDictionaryExport() {
  assert.strictEqual(
    typeof SurveyAuditor.cleanExportRows,
    'function',
    'SurveyAuditor.cleanExportRows must be exported'
  );

  const euRows = [
    ['Alias', 'DEMO'],
    ['Export Date', '2026-01-01'],
    ['Preamble', 'drop me'],
    [
      'What gender do you identify as? (gender1)',
      'Age',
      'Notes',
      'City',
      'Being overly careful or on guard (checking to see who is around you)',
      'Where were you born?',
      'Refusal',
      'Uncertainty'
    ],
    ['Girl (ID3)', 14, 'free text', null, 'ok', '[COUNTRY]', 'Prefer not to answer', "Don't know"],
    ['Boy [ID4]', null, '', 'Oslo {ID9}', 'x', 'Germany', 'No', 'Yes'],
    ['(ID3)', 12.5, 'Girl (ID3) extra', '   ', 'y', 'Spain', 'No', 'Yes'],
    ['Only']
  ];

  const cleaned = SurveyAuditor.cleanExportRows(euRows);
  assert.deepStrictEqual(cleaned, [
    [
      'What gender do you identify as?',
      'Age',
      'Notes',
      'City',
      'Being overly careful or on guard',
      'Where were you born?',
      'Refusal',
      'Uncertainty'
    ],
    ['Girl', 14, 'free text', null, 'ok', '[COUNTRY]', 'Prefer not to answer', "Don't know"],
    ['Boy', null, '', 'Oslo', 'x', 'Germany', 'No', 'Yes'],
    ['', 12.5, 'Girl (ID3) extra', '   ', 'y', 'Spain', 'No', 'Yes'],
    ['Only', null, null, null, null, null, null, null]
  ]);

  const flat = cleaned.flat();
  assert.ok(!flat.includes('Alias'), 'EU Survey alias preamble is omitted');
  assert.ok(!flat.includes('2026-01-01'), 'EU Survey export date is omitted');
  assert.ok(!flat.includes('DEMO'), 'preamble values are omitted');
  assert.strictEqual(typeof cleaned[1][1], 'number');
  assert.strictEqual(cleaned[1][1], 14);
  assert.strictEqual(typeof cleaned[3][1], 'number');
  assert.strictEqual(cleaned[3][1], 12.5);
  console.log('✓ EU Survey preamble dropped and trailing tags stripped without recoding');

  const qualtricsRows = [
    ['StartDate', 'gender1', 'What is your gender? (gender1)'],
    ['Start Date', 'gender', 'question text row'],
    ['2020-01-01', 'Girl (ID3)', 7]
  ];
  assert.deepStrictEqual(SurveyAuditor.cleanExportRows(qualtricsRows), [
    ['StartDate', 'gender1', 'What is your gender?'],
    ['2020-01-01', 'Girl', 7]
  ]);
  console.log('✓ Qualtrics metadata row dropped; header and answer tags stripped');

  // Issue #9: an empty options object is the same as no options.
  assert.deepStrictEqual(SurveyAuditor.cleanExportRows(euRows, {}), cleaned, 'empty options keep the old export');
  assert.deepStrictEqual(SurveyAuditor.cleanExportRows(qualtricsRows, {}), [
    ['StartDate', 'gender1', 'What is your gender?'],
    ['2020-01-01', 'Girl', 7]
  ], 'empty options keep the old Qualtrics export');
}

function testScrambledSamples() {
  assert.strictEqual(
    typeof SurveyAuditor.scrambleExportSample,
    'function',
    'SurveyAuditor.scrambleExportSample must be exported'
  );
  for (const format of ['eusurvey', 'qualtrics']) {
    for (const responseCount of [4, 60]) {
      assertUploadedAndCleaned(format, responseCount);
    }
  }
  console.log('✓ Scrambled samples permute each response column, then keep at most 50 rows');
}

// ---------------------------------------------------------------------------
// Issue #9: canonical English headers/answers and core-only export.
// Expected strings are literal stems/labels from data/master_dictionary.json
// or the issue #9 contract table.
// ---------------------------------------------------------------------------

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

function exportWith(rows, extra) {
  return SurveyAuditor.cleanExportRows(rows, Object.assign({ dictionary: DICT }, extra || {}));
}

function column(out, c) {
  return out.map(row => row[c]);
}

function testGenderHeaderAndAnswers() {
  const rows = eu('Spain', ['¿Con qué género te identificas? (gender1)'], [
    ['Chico.'],
    ['Chica. (ID12)'],
    ['Prefiero no responder.'],
    ['Prefiero no responder']
  ]);
  const out = exportWith(rows);
  assert.strictEqual(out.length, 5, 'header + 4 respondents');
  assert.strictEqual(out[0][0], 'What gender do you identify as?');
  assert.deepStrictEqual(column(out, 0).slice(1), ['Boy', 'Girl', 'Prefer not to answer', 'Prefer not to answer'],
    'Spanish gender answers become canonical English labels, in respondent order');
}

function testCountryPlaceholderInHeader() {
  const rows = eu('Spain', ['¿Aproximadamente qué edad tenías cuando llegaste a España? (born4)'], [['13 años']]);
  const out = exportWith(rows);
  assert.strictEqual(out[0][0], 'Approximately how old were you when you came/moved to Spain?');
  assert.strictEqual(out[1][0], '13', 'alias "13 años" becomes canonical label "13" (string)');
}

function testMonthTranslated() {
  const out = exportWith(eu('Spain', ['¿En qué mes naciste? (born2)'], [['Abril.']]));
  assert.deepStrictEqual(out, [['What month were you born?'], ['April']]);
}

function testBirthCountryTranslated() {
  const out = exportWith(eu('Spain', ['¿Dónde naciste? (born3)'], [['- España (ES)'], ['Lituania (LT)']]));
  assert.strictEqual(out[0][0], 'Where were you born?');
  assert.strictEqual(out[1][0], 'Spain', 'España -> [COUNTRY] -> Spain');
  assert.strictEqual(out[2][0], 'Lithuania');
}

function testMultiSelectSegments() {
  const out = exportWith(eu('Spain', ['¿Qué aplicaciones usas? (some_apps1)'], [
    ['Instagram.;TikTok.;Otros.'],
    ['Instagram.;Foo (ID99)']
  ]));
  assert.strictEqual(out[0][0], 'Please select up to three apps or services you use most often');
  assert.strictEqual(out[1][0], 'Instagram;TikTok;Other');
  assert.strictEqual(out[2][0], 'Instagram;Foo', 'unknown segment kept tag-stripped');
}

function testMultiSelectSpanishAliases() {
  const cell = 'Me pegaban, me daban patadas, me empujaban, me zarandeaban o me encerraban en casa.;' +
    'Se burlaban de mí por mi aspecto físico o mi cara.';
  const out = exportWith(eu('Spain', ['¿Cómo te acosaban? (ace23)'], [[cell]]));
  assert.strictEqual(out[0][0], 'How were you bullied most often?');
  assert.strictEqual(out[1][0],
    'I was hit, kicked, pushed, shoved around, or locked indoors.;I was made fun of because of how my body or face looked');
}

function testMatrixItemAndUnmappedAnswers() {
  const out = exportWith(eu('Spain', ['Piensa en la última semana: ¿Te has sentido lleno de energía? (ks1)'], [
    ['Prefiero no responder'],
    ['Algo raro (ID77)'],
    ['Nunca']
  ]));
  assert.strictEqual(out[0][0], 'When you think about the past week...: Have you felt full of energy?');
  assert.strictEqual(out[1][0], 'Prefiero no responder', 'no English label invented when ks1 has no 999 option');
  assert.strictEqual(out[2][0], 'Algo raro', 'unmapped answer is tag-stripped');
  assert.strictEqual(out[3][0], 'Never');
}

function testNumbersAndBlanksUnchanged() {
  const out = exportWith(eu('Spain', ['¿En qué año naciste? (born1)', '¿Con qué género te identificas? (gender1)'], [
    [2006, null],
    [null, ''],
    [2007, '   ']
  ]));
  assert.strictEqual(out[0][0], 'What year were you born?');
  assert.strictEqual(out[1][0], 2006);
  assert.strictEqual(typeof out[1][0], 'number', 'numbers are not turned into strings');
  assert.strictEqual(out[1][1], null);
  assert.strictEqual(out[2][0], null);
  assert.strictEqual(out[2][1], '');
  assert.strictEqual(out[3][0], 2007);
  assert.strictEqual(out[3][1], '   ');
}

function testUnmatchedAndNationalColumns() {
  const header = [
    'Escuela: Mis profesores se preocupan por mí. (ID198)',
    '¿Con qué género te identificas? (gender1)',
    '¿Con qué frecuencia te despiertas durante la noche? (sleep3)', // spain-source cqftddln1
    '¿En qué mes naciste? (born2)'
  ];
  const rows = eu('Spain', header, [
    ['De acuerdo (ID4)', 'Chico.', null, 'Abril.'],
    ['Nada', 'Chica.', null, 'Mayo.']
  ]);
  const full = exportWith(rows);
  assert.deepStrictEqual(full, [
    [
      'Escuela: Mis profesores se preocupan por mí.',
      'What gender do you identify as?',
      '¿Con qué frecuencia te despiertas durante la noche?',
      'What month were you born?'
    ],
    ['De acuerdo', 'Boy', null, 'April'],
    ['Nada', 'Girl', null, 'May']
  ]);

  const core = exportWith(rows, { coreOnly: true });
  assert.deepStrictEqual(core, [
    ['What gender do you identify as?', 'What month were you born?'],
    ['Boy', 'April'],
    ['Girl', 'May']
  ], 'core export drops unmatched and national columns, keeps order and rows');
}

function testDefaultIsFullExport() {
  const rows = eu('Spain', ['Escuela (ID198)', '¿Con qué género te identificas? (gender1)'], [['x', 'Chico.']]);
  assert.deepStrictEqual(exportWith(rows), [['Escuela', 'What gender do you identify as?'], ['x', 'Boy']]);
  assert.deepStrictEqual(exportWith(rows, { coreOnly: false }), exportWith(rows));
}

function testTrailingEmptyColumnsKeptInFullExport() {
  const rows = eu('Spain', ['¿Con qué género te identificas? (gender1)', null, null], [['Chico.', null, null]]);
  assert.deepStrictEqual(exportWith(rows), [['What gender do you identify as?', null, null], ['Boy', null, null]]);
  assert.deepStrictEqual(exportWith(rows, { coreOnly: true }), [['What gender do you identify as?'], ['Boy']]);
}

function testNoCountryKeepsPlaceholders() {
  // Under alias DEMO (no survey country) the auditor assigns born3 -> bage1 and born2 -> bplace1.
  const rows = eu('DEMO', ['Edad al llegar (born3)', 'Lugar de nacimiento (born2)'], [['13 años', 'España']]);
  const out = exportWith(rows);
  assert.deepStrictEqual(out, [
    ['Approximately how old were you when you came/moved to [country]?', 'Where were you born?'],
    ['13', '[COUNTRY]']
  ]);
}

function testQualtricsLayout() {
  const rows = [
    ['StartDate', 'Gender (gender1)', 'Age moved (born3)'],
    ['Start Date', 'What is your gender?', 'How old?'],
    ['2020-01-01', 'Chica.', '13 años'],
    ['2020-01-02', 'Chico. (ID1)', 7]
  ];
  assert.deepStrictEqual(exportWith(rows), [
    ['StartDate', 'What gender do you identify as?', 'Approximately how old were you when you came/moved to [country]?'],
    ['2020-01-01', 'Girl', '13'],
    ['2020-01-02', 'Boy', 7]
  ]);
}

function testCoreOnlyWithoutDictionaryThrows() {
  const rows = eu('Spain', ['¿Con qué género te identificas? (gender1)'], [['Chico.']]);
  assert.throws(() => SurveyAuditor.cleanExportRows(rows, { coreOnly: true }), Error);
}

function testShortSheet() {
  const rows = [['¿Con qué género te identificas? (gender1)', 'Notes']];
  // Contract: a sheet the auditor cannot audit has no matched column; the
  // full export equals the no-dictionary export.
  assert.deepStrictEqual(exportWith(rows), SurveyAuditor.cleanExportRows(rows),
    'full export equals the no-dictionary result');
  const core = exportWith(rows, { coreOnly: true });
  assert.ok(Array.isArray(core), 'core export returns rows');
  for (const row of core) assert.strictEqual(row.length, 0, 'core export has zero columns per row');
}

// Small hand-built dictionary for cases the real dictionary cannot show.
function opt(order, label, alias, value) {
  return {
    order, label, label_with_id: '', alias, eusurvey_answer_id: '', value,
    scale: 'nominal', is_special: false, special_type: ''
  };
}

function variable(name, stem, item, source, isCore, options) {
  return {
    variable: name, orig_variable: name, group_id: name, section: 'Test',
    question_stem: stem, item_text: item, scale: 'nominal', question_type: 'single',
    n_options: options.length, multiple: false, source, is_core: isCore,
    options_complete: true, scale_confidence: 'high', notes: '', orig_aliases: {},
    options, keywords: []
  };
}

const HAND_DICT = {
  variables: [
    variable('hamb1', 'Ambiguous question', '', 'canonical_en', true, [
      opt(0, 'Yes', '', 1),
      opt(1, 'Yes indeed', '', 1),
      opt(2, 'Sí', 'Sí', 1),
      opt(3, 'No', '', 2),
      opt(4, 'Huérfano', 'Huérfano', 3),
      opt(5, 'Uno;Dos', 'Uno;Dos', 1)
    ]),
    variable('hnoopt1', 'Free text in [Country]', 'Detail', 'canonical_en', true, []),
    variable('hnoncore1', 'Optional question', '', 'canonical_en', false, [opt(0, 'Yes', '', 1)]),
    variable('hnat1', 'National question', '', 'spain', true, [opt(0, 'Yes', '', 1)])
  ]
};

function testHandDictionaryEdgeCases() {
  const header = ['Amb (hamb1)', 'Texto (hnoopt1)', 'Opcional (hnoncore1)', 'Nacional (hnat1)'];
  const rows = eu('Spain', header, [
    ['Sí (ID5)', 'hola (ID3)', 'Yes', 'Yes'],
    ['Huérfano', 'adiós', 'Yes', 'Yes'],
    ['Uno;Dos', null, null, null],
    ['Sí;No', null, null, null],
    ['No', null, null, null]
  ]);
  const full = SurveyAuditor.cleanExportRows(rows, { dictionary: HAND_DICT });
  assert.deepStrictEqual(full[0], ['Ambiguous question', 'Free text in Spain: Detail', 'Optional question', 'National question']);
  assert.deepStrictEqual(column(full, 0).slice(1), ['Sí', 'Huérfano', 'Uno;Dos', 'Sí;No', 'No'],
    'alias with two or zero canonical options stays tag-stripped; ambiguous whole cell is not split');
  assert.deepStrictEqual(column(full, 1).slice(1), ['hola', 'adiós', null, null, null],
    'variable without options: answers tag-stripped');

  const core = SurveyAuditor.cleanExportRows(rows, { dictionary: HAND_DICT, coreOnly: true });
  assert.deepStrictEqual(core[0], ['Ambiguous question', 'Free text in Spain: Detail'],
    'non-core canonical_en and national core variables are dropped');
  assert.strictEqual(core.length, 6);
  for (const row of core) assert.strictEqual(row.length, 2);
}

function optWithId(order, label, alias, value, answerId) {
  return Object.assign(opt(order, label, alias, value), { eusurvey_answer_id: answerId });
}

const ID_DICT = {
  variables: [
    variable('mid1', 'Pick options', '', 'canonical_en', true, [
      optWithId(0, 'Alpha', '', 1, 'ID1'),
      optWithId(1, 'Beta', '', 2, 'ID2')
    ])
  ]
};

function testMultiSegmentTrailingAnswerId() {
  // Contract: a cell with several ';' segments in a non-multi-select header has
  // no answer ID (only labels), so a trailing '(IDn)' on the last segment must
  // not make the whole cell map to that one option. A single-segment cell keeps
  // its answer ID, which wins over an unknown label.
  const rows = eu('Spain', ['Elige (mid1)'], [
    ['Alpha;Beta (ID2)'],
    ['Alpha (ID1);Beta (ID2)'],
    ['Beta (ID2)'],
    ['Beeta (ID2)']
  ]);
  const out = SurveyAuditor.cleanExportRows(rows, { dictionary: ID_DICT });
  assert.strictEqual(out.length, 5, 'header + 4 respondents');
  assert.strictEqual(out[0][0], 'Pick options');
  assert.strictEqual(out[1][0], 'Alpha;Beta', 'multi-segment cell with trailing ID is split per segment');
  assert.notStrictEqual(out[1][0], 'Beta', 'trailing answer ID must not map the whole multi-segment cell to one option');
  assert.strictEqual(out[2][0], 'Alpha;Beta', 'each segment ID tag stripped and mapped');
  assert.strictEqual(out[3][0], 'Beta', 'single-segment cell matched by answer ID');
  assert.strictEqual(out[4][0], 'Beta', 'single-segment answer ID match wins over unknown label');
}

function testAppSourceWiring() {
  for (const rel of ['src/app.js', 'docs/src/app.js']) {
    const source = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    assert.ok(/window\.exportCleanedData\s*=/.test(source), `${rel} defines window.exportCleanedData`);
    assert.ok(/window\.exportCleanedCoreData\s*=/.test(source), `${rel} defines window.exportCleanedCoreData`);
    assert.ok(/cleanExportRows\([^)]*dictionary/.test(source), `${rel} passes the dictionary to cleanExportRows`);
    assert.ok(/coreOnly\s*:\s*true/.test(source), `${rel} requests the core-only export`);
    assert.ok(/['"]_cleaned\.xlsx['"]/.test(source), `${rel} full export file name`);
    assert.ok(/['"]_cleaned_core\.xlsx['"]/.test(source), `${rel} core export file name`);
  }
  for (const rel of ['survey_validator.js', 'app.js']) {
    assert.strictEqual(
      fs.readFileSync(path.join(ROOT, 'docs', 'src', rel), 'utf8'),
      fs.readFileSync(path.join(ROOT, 'src', rel), 'utf8'),
      `docs/src/${rel} is identical to src/${rel}`
    );
  }
}

function testRealSpainCoreHeaders() {
  const file = path.join(ROOT, 'data', 'spain', 'Content_Export_Spain_2026.10.29-Spain.xlsx');
  if (!fs.existsSync(file)) {
    console.log('  (note) Spain export not present; real-data core header check skipped');
    return;
  }
  const XLSX = require('xlsx');
  const wb = XLSX.readFile(file);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null });
  // Expected header texts computed from the dictionary JSON directly.
  const allowed = new Set();
  for (const v of DICT.variables) {
    if (v.is_core !== true || v.source !== 'canonical_en') continue;
    const text = v.item_text ? `${v.question_stem}: ${v.item_text}` : v.question_stem;
    allowed.add(text.replace(/\[country\]/gi, 'Spain'));
  }
  const core = exportWith(rows, { coreOnly: true });
  const header = core[0];
  assert.ok(header.length > 0, 'core export has columns');
  const seen = new Set();
  for (const h of header) {
    assert.strictEqual(typeof h, 'string', 'header is text');
    assert.ok(!/\(ID\d+\)/.test(h), `no ID tag in header: ${h}`);
    assert.ok(!h.includes('¿'), `no Spanish header text: ${h}`);
    assert.ok(allowed.has(h), `header is canonical core text: ${h}`);
    assert.ok(!seen.has(h), `header appears once: ${h}`);
    seen.add(h);
  }
}

// ---------------------------------------------------------------------------
// Issue #15: round trip auditor export -> R load_survey().
// Synthetic workbooks only. Answers are English labels or Hungarian aliases
// taken from data/master_dictionary.json.
// ---------------------------------------------------------------------------

const BAGE_STEM_15 = DICT.variables.find(v => v.variable === 'bage1').question_stem;

function rscriptRoundTrip(rows, country, label) {
  const os = require('os');
  const { spawnSync } = require('child_process');
  const XLSX = require('xlsx');
  const options = { dictionary: DICT };
  if (country) options.country = country;
  const cleaned = SurveyAuditor.cleanExportRows(rows, options);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'issue15-'));
  const file = path.join(dir, `${label}_cleaned.xlsx`);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(cleaned), 'Cleaned');
  XLSX.writeFile(wb, file);

  const fwd = p => p.replace(/\\/g, '/');
  const script = path.join(dir, 'load.R');
  fs.writeFileSync(script, [
    'args <- commandArgs(trailingOnly = TRUE)',
    'source(file.path(args[[2]], "report", "R", "load_survey.R"))',
    'res <- tryCatch({',
    '  s <- load_survey(args[[1]], report_dir = file.path(args[[2]], "report"))',
    '  list(ok = TRUE, country = s$country, n = s$n, matched = names(s$code),',
    '       gender = if ("gender1" %in% names(s$code)) I(s$code$gender1) else NULL)',
    '}, error = function(e) list(ok = FALSE, error = conditionMessage(e)))',
    'cat("JSON:", jsonlite::toJSON(res, auto_unbox = TRUE), "\\n", sep = "")'
  ].join('\n'), 'utf8');

  const run = spawnSync('Rscript', [fwd(script), fwd(file), fwd(ROOT)], { encoding: 'utf8', timeout: 300000 });
  if (run.error && run.error.code === 'ENOENT') {
    if (process.env.SKIP_R === '1') {
      console.log(`  SKIPPED ${label}: Rscript not found and SKIP_R=1`);
      return null;
    }
    throw new Error('Rscript was not found on PATH. Install R (with readxl and jsonlite) or set SKIP_R=1 to skip the round-trip test.');
  }
  if (run.error) throw run.error;
  const line = (run.stdout || '').split(/\r?\n/).find(l => l.startsWith('JSON:'));
  assert.ok(line, `${label}: Rscript gave no result. stderr: ${(run.stderr || '').slice(0, 500)}`);
  const res = JSON.parse(line.slice(5));
  assert.ok(res.ok, `${label}: load_survey failed: ${res.error}`);
  res.cleanedRowCount = cleaned.length;
  return res;
}

function testRoundTripHungaryQualtricsOneHeaderRow() {
  const N = 5;
  const header = ['StartDate', 'EndDate', 'ResponseId', 'gender1', 'born2', 'born3', 'born4', 'born5',
    'schooltype', 'grade1', 'cyrm1:12_12', 'CYRM12'];
  const rows = [header];
  for (let i = 0; i < N; i++) {
    rows.push([`2020-03-0${i + 1}`, `2020-03-0${i + 1}`, `R_${i + 1}`, i % 2 ? 'Lány' : 'Fiú', 'March',
      i === 2 ? 'Ukraine' : 'Magyarország', i === 2 ? '5' : null, 'Magyarország', '9. évfolyam', 'x', 'Nagyon', 'y']);
  }
  const res = rscriptRoundTrip(rows, 'Hungary', 'hungary_qualtrics');
  if (!res) return;
  assert.strictEqual(res.country, 'Hungary');
  assert.strictEqual(res.n, N, `all ${N} respondents load (not ${N - 1})`);
  for (const v of ['gender1', 'bage1', 'bplace1', 'bmonth1', 'bmborn1', 'grade1', 'cyrm12']) {
    assert.ok(res.matched.includes(v), `${v} matched; matched: ${res.matched.join(', ')}`);
  }
}

function testRoundTripCyprusPlainEu() {
  const N = 4;
  const header = [
    'What gender do you identify as? (gender1)',
    'Where were you born? (born2)',
    'Approximately how old were you when you came/moved to [country]? (born3)'
  ];
  const rows = [header];
  for (let i = 0; i < N; i++) rows.push([i % 2 ? 'Girl' : 'Boy', i === 1 ? 'Ukraine' : '[COUNTRY]', i === 1 ? '5' : null]);
  const res = rscriptRoundTrip(rows, 'Cyprus', 'cyprus_plain');
  if (!res) return;
  assert.strictEqual(res.country, 'Cyprus');
  assert.notStrictEqual(res.country, '[country]');
  assert.strictEqual(res.n, N, `all ${N} respondents load (not ${N - 3})`);
  for (const v of ['gender1', 'bage1']) assert.ok(res.matched.includes(v), `${v} matched`);
}

function testRoundTripNorwayAliasDetected() {
  const N = 3;
  const rows = [
    ['Alias', 'mentor_fhi'],
    ['Export Date', '2026-01-01'],
    [],
    [
      'What gender do you identify as? (gender1)',
      'Where were you born? (born2)',
      `${BAGE_STEM_15.replace('[country]', 'Norway')} (born3)`
    ]
  ];
  for (let i = 0; i < N; i++) rows.push([i % 2 ? 'Girl' : 'Boy', i === 0 ? 'Ukraine' : '[COUNTRY]', i === 0 ? '7' : null]);
  const res = rscriptRoundTrip(rows, null, 'norway_eu');
  if (!res) return;
  assert.strictEqual(res.country, 'Norway', 'country read from the header, not [country]');
  assert.strictEqual(res.n, N);
}

// ---------------------------------------------------------------------------
// Issue #23: German-language EU Survey exports (German header text and
// German answers, no ID tags). Expected values are the issue #23 contract
// (verbatim headers and answers) and the committed key files in
// data/country_maps/. Synthetic sheets only.
// ---------------------------------------------------------------------------

const COUNTRY_MAPS = path.join(ROOT, 'data', 'country_maps');
const GERMAN_HEADERS_CSV = path.join(COUNTRY_MAPS, 'germany_headers.csv');
const GERMAN_ANSWERS_CSV = path.join(COUNTRY_MAPS, 'germany_answers.csv');

// Verbatim German headers from the contract table.
const DE = {
  gender1: 'Mit welchem Geschlecht identifizierst Du Dich?',
  grade1: 'Welche Klassenstufe besuchst Du?',
  byear1: 'Wann bist Du geboren?',
  bmonth1: 'In welchem Monat bist Du geboren?',
  bplace1: 'Wo bist Du geboren?',
  bage1: 'Wie alt warst Du ungefähr, als Du nach Deutschland gekommen bist?'
};
const DE_VARS = Object.keys(DE);

// Canonical English headers (data/master_dictionary.json stems, [country] = Germany).
const EN_DE = {
  gender1: 'What gender do you identify as?',
  grade1: 'What grade are you in?',
  byear1: 'What year were you born?',
  bmonth1: 'What month were you born?',
  bplace1: 'Where were you born?',
  bage1: 'Approximately how old were you when you came/moved to Germany?'
};

/** Minimal RFC 4180 CSV reader (quoted fields, doubled quotes, BOM). */
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

/** Rows of data/country_maps/germany_headers.csv, read when a test needs them. */
function germanHeaderRows() {
  assert.ok(fs.existsSync(GERMAN_HEADERS_CSV),
    'data/country_maps/germany_headers.csv is missing (issue #23 key file: variable,german_header)');
  const rows = parseCsv(fs.readFileSync(GERMAN_HEADERS_CSV, 'utf8'));
  assert.ok(rows.length > 0, 'germany_headers.csv has rows');
  assert.ok('variable' in rows[0] && 'german_header' in rows[0], 'germany_headers.csv columns are variable,german_header');
  return rows;
}

function germanHeaderOf(rows, variableName) {
  const row = rows.find(r => r.variable === variableName);
  assert.ok(row, `germany_headers.csv has a row for ${variableName}`);
  return row.german_header;
}

function germanAnswerRows() {
  return parseCsv(fs.readFileSync(GERMAN_ANSWERS_CSV, 'utf8'));
}

/** Contract: a pattern is a variable name, or a prefix + '*' where '*' is one or more digits. */
function patternMatches(pattern, name) {
  if (pattern.endsWith('*')) {
    const prefix = pattern.slice(0, -1);
    return name.startsWith(prefix) && /^\d+$/.test(name.slice(prefix.length));
  }
  return name === pattern;
}

/** Contract normalisation for label comparison: NFKC, lower case, whitespace collapsed. */
function normLabel(s) {
  return String(s == null ? '' : s).normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

function auditDe(rows, options) {
  return new SurveyAuditor(DICT).auditSheet(rows, options);
}

function colOf(result, index) {
  const col = result.columns.find(c => c.colIndex === index);
  assert.ok(col, `column ${index} audited`);
  return col;
}

// Three ways the country can be known: Alias, selected, unknown.
const DE_CONTEXTS = [
  ['Alias MENTORMasterGER1', 'MENTORMasterGER1', undefined],
  ['Alias Survey1, country selected', 'Survey1', { country: 'Germany' }],
  ['Alias Survey1, no country', 'Survey1', undefined]
];

function testGermanHeadersMatchedWithoutIdTags() {
  const header = DE_VARS.map(v => DE[v]);
  const failures = [];
  for (const [label, alias, options] of DE_CONTEXTS) {
    const result = auditDe(eu(alias, header, [header.map(() => null)]), options);
    DE_VARS.forEach((v, i) => {
      const col = colOf(result, i);
      const got = col.canonical ? col.canonical.variable : null;
      if (got !== v) failures.push(`${label}: "${DE[v]}" matched ${got}, expected ${v}`);
      else if (!String(col.matchType).startsWith('country_header')) {
        failures.push(`${label}: ${v} matchType ${col.matchType}, expected country_header*`);
      }
    });
  }
  assert.strictEqual(failures.length, 0, failures.join('\n'));
}

function testGermanAllKeyFileHeadersMatched() {
  const keyRows = germanHeaderRows();
  const header = keyRows.map(r => r.german_header);
  const result = auditDe(eu('MENTORMasterGER1', header, [header.map(() => null)]));
  const failures = [];
  keyRows.forEach((r, i) => {
    const col = colOf(result, i);
    const got = col.canonical ? col.canonical.variable : null;
    if (got !== r.variable) failures.push(`column ${i} "${r.german_header}" matched ${got}, expected ${r.variable}`);
  });
  assert.strictEqual(failures.length, 0, failures.slice(0, 20).join('\n'));

  // Expected coverage: distinct core canonical variables named in the key file.
  const core = new Set(DICT.variables.filter(v => v.is_core === true && v.source === 'canonical_en').map(v => v.variable));
  const expected = new Set(keyRows.map(r => r.variable).filter(v => core.has(v))).size;
  assert.strictEqual(expected, 88, 'contract: the committed germany_headers.csv names 88 core variables');
  assert.strictEqual(result.summary.coverage.coveredCoreCount, expected,
    `coveredCoreCount is the number of core variables in germany_headers.csv (${expected}), not 0`);
}

function testGermanSharedLiveHeaderSequential() {
  const keyRows = germanHeaderRows();
  const text = germanHeaderOf(keyRows, 'live1');
  assert.strictEqual(germanHeaderOf(keyRows, 'livead1'), text, 'live1 and livead1 share one German header');
  assert.ok(text.startsWith('Was beschreibt deine Situation am besten, wenn du an die Personen denkst'),
    'shared live1/livead1 text starts as the contract says');
  for (const [label, alias, options] of DE_CONTEXTS) {
    const result = auditDe(eu(alias, [text, text], [[null, null]]), options);
    const first = colOf(result, 0);
    const second = colOf(result, 1);
    assert.strictEqual(first.canonical && first.canonical.variable, 'live1', `${label}: first shared column is live1`);
    assert.strictEqual(second.canonical && second.canonical.variable, 'livead1', `${label}: second shared column is livead1`);
    assert.ok(String(first.matchType).startsWith('country_header'), `${label}: live1 matchType ${first.matchType}`);
    assert.ok(String(second.matchType).startsWith('country_header'), `${label}: livead1 matchType ${second.matchType}`);
  }
}

function testGermanHeaderWithParenthesisedWord() {
  const dict = {
    variables: [
      Object.assign(variable('hwie1', 'How often', '', 'canonical_en', true, [opt(0, 'Often', '', 1)]),
        { header_aliases: { germany: ['Wie oft (abc)'] } }),
      variable('hother1', 'Other question', '', 'canonical_en', true, [opt(0, 'Yes', '', 1)])
    ]
  };
  for (const [label, alias, options] of DE_CONTEXTS) {
    const result = new SurveyAuditor(dict).auditSheet(eu(alias, ['Wie oft (abc)'], [[null]]), options);
    const col = colOf(result, 0);
    assert.strictEqual(col.canonical && col.canonical.variable, 'hwie1',
      `${label}: "Wie oft (abc)" matched by its full text`);
    assert.ok(String(col.matchType).startsWith('country_header'), `${label}: matchType ${col.matchType}`);
  }
}

function testEnglishGermanyExportUnchanged() {
  const rows = eu('MentorDE1', ['What gender do you identify as? (gender1)', 'What month were you born? (ID289)'], [['Girl', 'March']]);
  for (const options of [{ country: 'Germany' }, undefined]) {
    const result = auditDe(rows, options);
    assert.strictEqual(colOf(result, 0).canonical.variable, 'gender1');
    assert.strictEqual(colOf(result, 0).matchType, 'id_exact');
    assert.strictEqual(colOf(result, 1).canonical && colOf(result, 1).canonical.variable, 'bmonth1');
  }
  assert.deepStrictEqual(exportWith(rows, { country: 'Germany' }), [
    ['What gender do you identify as?', 'What month were you born?'],
    ['Girl', 'March']
  ]);
}

function germanLiteralSheet() {
  const header = DE_VARS.map(v => DE[v]);
  // Columns: gender1, grade1, byear1, bmonth1, bplace1, bage1
  return eu('MENTORMasterGER1', header, [
    ['Mädchen', null, 2009, 'März', 'Deutschland', 0],
    ['Junge', null, 2010, 'keine Angabe', 'keine Angabe', null],
    ['Mädchen', null, null, null, null, null]
  ]);
}

function testGermanCleanedExportHeadersAndAnswers() {
  const rows = germanLiteralSheet();
  const expected = [
    DE_VARS.map(v => EN_DE[v]),
    ['Girl', null, 2009, 'March', 'Germany', 0],
    ['Boy', null, 2010, 'keine Angabe', 'Prefer not to answer', null],
    ['Girl', null, null, null, null, null]
  ];
  const fromAlias = exportWith(rows);
  assert.deepStrictEqual(fromAlias, expected, 'country from the Alias');
  assert.notStrictEqual(fromAlias[1][4], '[COUNTRY]', 'Deutschland becomes Germany, not the placeholder');
  assert.deepStrictEqual(exportWith(rows, { country: 'Germany' }), expected, 'country selected: same output');
}

function testGermanCleanedExportKeyFileColumns() {
  const keyRows = germanHeaderRows();
  const ks1 = DICT.variables.find(v => v.variable === 'ks1');
  const edumom1 = DICT.variables.find(v => v.variable === 'edumom1');
  const sibs1 = DICT.variables.find(v => v.variable === 'sibs1');
  const header = [germanHeaderOf(keyRows, 'ks1'), germanHeaderOf(keyRows, 'edumom1'), germanHeaderOf(keyRows, 'sibs1')];
  const rows = eu('MENTORMasterGER1', header, [
    ['manchmal', 'Fachhochschulreife; Abitur/Allgemeine Hochschulreife', 1]
  ]);
  const expected = [
    [`${ks1.question_stem}: ${ks1.item_text}`, edumom1.question_stem, sibs1.question_stem],
    ['Quite often', 'High school diploma or equivalent', 1]
  ];
  assert.deepStrictEqual(exportWith(rows), expected, 'country from the Alias');
  assert.deepStrictEqual(exportWith(rows, { country: 'Germany' }), expected, 'country selected: same output');
}

function testGermanCoreOnlyKeepsMatchedCoreColumns() {
  const header = ['Bemerkungen', DE.gender1, 'Lieblingsfarbe?', DE.bmonth1, DE.bage1];
  const rows = eu('MENTORMasterGER1', header, [
    ['frei', 'Junge', 'blau', 'März', 3],
    [null, 'Mädchen', 'rot', null, null]
  ]);
  const expected = [
    [EN_DE.gender1, EN_DE.bmonth1, EN_DE.bage1],
    ['Boy', 'March', 3],
    ['Girl', null, null]
  ];
  assert.deepStrictEqual(exportWith(rows, { coreOnly: true }), expected, 'country from the Alias');
  assert.deepStrictEqual(exportWith(rows, { coreOnly: true, country: 'Germany' }), expected, 'country selected');
}

function testDictionaryGermanHeaderAliases() {
  const keyRows = germanHeaderRows();
  const byName = new Map(DICT.variables.map(v => [v.variable, v]));
  const failures = [];
  for (const r of keyRows) {
    const v = byName.get(r.variable);
    if (!v) { failures.push(`${r.variable}: not in the dictionary`); continue; }
    const list = v.header_aliases && v.header_aliases.germany;
    if (!Array.isArray(list) || !list.every(x => typeof x === 'string')) {
      failures.push(`${r.variable}: header_aliases.germany is not a list of strings`);
    } else if (!list.includes(r.german_header)) {
      failures.push(`${r.variable}: header_aliases.germany lacks "${r.german_header}"`);
    }
  }
  assert.strictEqual(failures.length, 0, failures.slice(0, 20).join('\n'));
}

function testDictionaryGermanAnswerOptions() {
  const answers = germanAnswerRows();
  assert.ok(answers.length > 100, 'germany_answers.csv read');
  const failures = [];
  for (const r of answers) {
    const patterns = r.variables.split(/\s+/).filter(Boolean);
    for (const p of patterns) {
      const hits = DICT.variables.filter(v => patternMatches(p, v.variable));
      if (!hits.length) failures.push(`pattern ${p} matches no variable`);
      for (const v of hits) {
        const opts = v.options || [];
        const added = opts.some(o => o.alias === r.german_label && o.label === r.german_label &&
          String(o.value) === String(r.value));
        const already = opts.some(o => String(o.value) === String(r.value) &&
          normLabel(o.label) === normLabel(r.german_label));
        if (!added && !already) failures.push(`${v.variable}: no option "${r.german_label}" = ${r.value}`);
      }
    }
  }
  assert.strictEqual(failures.length, 0, `${failures.length} missing:\n${failures.slice(0, 20).join('\n')}`);

  // The semicolon label is one option, not two.
  const edu = DICT.variables.find(v => v.variable === 'edumom1').options;
  assert.ok(!edu.some(o => o.alias === 'Fachhochschulreife' || o.alias === 'Abitur/Allgemeine Hochschulreife'),
    'semicolon label is not split into two aliases');
}

function testDictionaryGermanOrigAliasesUnchanged() {
  const { execFileSync } = require('child_process');
  const head = JSON.parse(execFileSync('git', ['show', 'HEAD:data/master_dictionary.json'],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }));
  const before = new Map(head.variables.map(v => [v.variable, (v.orig_aliases || {}).germany]));
  const failures = [];
  for (const v of DICT.variables) {
    const now = (v.orig_aliases || {}).germany;
    const was = before.get(v.variable);
    if (now !== was) failures.push(`${v.variable}: orig_aliases.germany ${JSON.stringify(was)} -> ${JSON.stringify(now)}`);
  }
  assert.strictEqual(failures.length, 0, failures.slice(0, 20).join('\n'));
}

function readBundle(rel) {
  const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const m = text.match(/window\.__MASTER_DICTIONARY__\s*=\s*([\s\S]*?);?\s*$/);
  assert.ok(m, `${rel} assigns window.__MASTER_DICTIONARY__`);
  return JSON.parse(m[1]);
}

function testDictionaryCopiesIdentical() {
  const copies = {
    'docs/describe/vfs/data/master_dictionary.json':
      JSON.parse(fs.readFileSync(path.join(ROOT, 'docs', 'describe', 'vfs', 'data', 'master_dictionary.json'), 'utf8')),
    'src/master_dictionary_bundle.js': readBundle('src/master_dictionary_bundle.js'),
    'docs/src/master_dictionary_bundle.js': readBundle('docs/src/master_dictionary_bundle.js')
  };
  for (const [rel, copy] of Object.entries(copies)) {
    assert.deepStrictEqual(copy, DICT, `${rel} holds the same dictionary as data/master_dictionary.json`);
  }
  assert.strictEqual(
    fs.readFileSync(path.join(ROOT, 'docs', 'src', 'survey_validator.js'), 'utf8'),
    fs.readFileSync(path.join(ROOT, 'src', 'survey_validator.js'), 'utf8'),
    'docs/src/survey_validator.js is identical to src/survey_validator.js'
  );
}

function testRoundTripGermanLanguageExport() {
  const keyRows = germanHeaderRows();
  const header = keyRows.map(r => r.german_header);
  const at = name => {
    const i = keyRows.findIndex(r => r.variable === name);
    assert.ok(i >= 0, `germany_headers.csv has ${name}`);
    return i;
  };
  // Answers from germany_answers.csv and canonical numbers; other cells blank.
  const answers = [
    { gender1: 'Mädchen', byear1: 2010, bmonth1: 'März', bplace1: 'Deutschland', grade1: '9. Klasse' },
    { gender1: 'Junge', byear1: 2009, bmonth1: 'Januar', bplace1: 'Ukraine', bage1: 5 },
    { gender1: 'Mädchen', byear1: 2011, bmonth1: 'Dezember', bplace1: 'Deutschland' },
    { gender1: 'Junge', byear1: 2010, bmonth1: 'Mai', bplace1: 'Deutschland' }
  ];
  const rows = [['Alias', 'MENTORMasterGER1'], ['Export Date', '2026-01-01'], [], header];
  for (const a of answers) {
    const row = header.map(() => null);
    for (const [name, value] of Object.entries(a)) row[at(name)] = value;
    rows.push(row);
  }
  const res = rscriptRoundTrip(rows, null, 'germany_language_eu');
  if (!res) return;
  assert.strictEqual(res.country, 'Germany');
  assert.strictEqual(res.n, answers.length, `all ${answers.length} respondents load`);
  for (const v of ['gender1', 'bage1']) assert.ok(res.matched.includes(v), `${v} matched; matched: ${res.matched.join(', ')}`);
  // germany_answers.csv: Mädchen = 2, Junge = 1.
  assert.deepStrictEqual(res.gender, [2, 1, 2, 1], 'gender codes are the canonical values of the German answers');
}

// Issue #23, key file wins over an existing alias: for every key row and every
// variable it matches, every option with the row's normalised label has the
// row's value, also when an option with that label and value already existed.
function testDictionaryGermanAnswerLabelsHaveOnlyKeyValue() {
  const answers = germanAnswerRows();
  assert.ok(answers.length > 100, 'germany_answers.csv read');
  const failures = [];
  for (const r of answers) {
    const patterns = r.variables.split(/\s+/).filter(Boolean);
    for (const p of patterns) {
      for (const v of DICT.variables.filter(x => patternMatches(p, x.variable))) {
        for (const o of v.options || []) {
          if (normLabel(o.label) === normLabel(r.german_label) && Number(o.value) !== Number(r.value)) {
            failures.push(`${v.variable}: "${o.label}" = ${o.value}${o.alias ? ' (alias)' : ''}, key row says ${r.value}`);
          }
        }
      }
    }
  }
  assert.strictEqual(failures.length, 0, `${failures.length} other-value options:\n${failures.slice(0, 20).join('\n')}`);
}

// Issue #23: Andorra/Kosovo/Liechtenstein/Montenegro already exist with the key
// value in bplace1; shifted aliases with the same labels on other values must not win.
function testGermanBirthCountriesWithShiftedAliases() {
  const bplace1 = DICT.variables.find(v => v.variable === 'bplace1');
  const canonical = value => {
    const hits = bplace1.options.filter(o => !o.alias && Number(o.value) === value);
    assert.strictEqual(hits.length, 1, `bplace1 has one canonical option with value ${value}`);
    return hits[0].label;
  };
  // Values from data/country_maps/germany_answers.csv rows for bplace1 bmborn1 bfborn1.
  const expectedLabels = [4, 23, 25, 31].map(canonical);
  assert.deepStrictEqual(expectedLabels, ['Andorra', 'Kosovo', 'Liechtenstein', 'Montenegro'],
    'canonical English labels of values 4, 23, 25, 31');
  const rows = eu('MENTORMasterGER1', [DE.bplace1], [['Andorra'], ['Kosovo'], ['Liechtenstein'], ['Montenegro']]);
  const out = exportWith(rows);
  assert.strictEqual(out[0][0], bplace1.question_stem, 'header matched to bplace1');
  assert.deepStrictEqual(column(out, 0).slice(1), expectedLabels, 'answers become the canonical labels of the key values');
}

const TESTS = [
  testExportButtons,
  testNoDictionaryExport,
  testScrambledSamples,
  testGenderHeaderAndAnswers,
  testCountryPlaceholderInHeader,
  testMonthTranslated,
  testBirthCountryTranslated,
  testMultiSelectSegments,
  testMultiSelectSpanishAliases,
  testMatrixItemAndUnmappedAnswers,
  testNumbersAndBlanksUnchanged,
  testUnmatchedAndNationalColumns,
  testDefaultIsFullExport,
  testTrailingEmptyColumnsKeptInFullExport,
  testNoCountryKeepsPlaceholders,
  testQualtricsLayout,
  testCoreOnlyWithoutDictionaryThrows,
  testShortSheet,
  testHandDictionaryEdgeCases,
  testMultiSegmentTrailingAnswerId,
  testAppSourceWiring,
  testRealSpainCoreHeaders,
  testRoundTripHungaryQualtricsOneHeaderRow,
  testRoundTripCyprusPlainEu,
  testRoundTripNorwayAliasDetected,
  testGermanHeadersMatchedWithoutIdTags,
  testGermanAllKeyFileHeadersMatched,
  testGermanSharedLiveHeaderSequential,
  testGermanHeaderWithParenthesisedWord,
  testEnglishGermanyExportUnchanged,
  testGermanCleanedExportHeadersAndAnswers,
  testGermanCleanedExportKeyFileColumns,
  testGermanCoreOnlyKeepsMatchedCoreColumns,
  testDictionaryGermanHeaderAliases,
  testDictionaryGermanAnswerOptions,
  testDictionaryGermanOrigAliasesUnchanged,
  testDictionaryCopiesIdentical,
  testRoundTripGermanLanguageExport,
  testDictionaryGermanAnswerLabelsHaveOnlyKeyValue,
  testGermanBirthCountriesWithShiftedAliases
];

// Optional CLI arguments: run only the named tests.
function runTests() {
  console.log('--- Starting cleaned-export tests ---');
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
    console.log(`${failed} cleaned-export test(s) failed.`);
    process.exit(1);
  }
  console.log('All cleaned-export tests passed.');
}

runTests();
