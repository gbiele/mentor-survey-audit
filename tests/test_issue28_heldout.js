/**
 * Issue #28 held-out cases: the same contract as tests/test_issue28_mappings.js,
 * with other inputs (answer-ID tags, the º ordinal, a detected Hungarian
 * survey with several columns, restored KIDSCREEN names, other multiple-choice
 * cells). Expected labels are hand translations of the questionnaire labels
 * and the canonical English labels of data/master_dictionary.json.
 * Synthetic sheets only.
 *
 * Run: node tests/test_issue28_heldout.js [testName ...]
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const SurveyAuditor = require('../src/survey_validator.js');

const ROOT = path.resolve(__dirname, '..');
const DICT = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'master_dictionary.json'), 'utf8'));

function dictVar(name) {
  const v = DICT.variables.find(x => x.variable === name);
  assert.ok(v, `dictionary has ${name}`);
  return v;
}

function canonHeader(name, country) {
  const v = dictVar(name);
  const text = v.item_text ? `${v.question_stem}: ${v.item_text}` : v.question_stem;
  return text.replace(/\[country\]/gi, country);
}

function euPre(alias, header, dataRows) {
  return [['Alias', alias], ['Export Date', '2026-04-04'], [], header, ...dataRows];
}

function compareColumns(out, header, names, country, wantRows) {
  const failures = [];
  names.forEach((name, i) => {
    if (!name) return;
    if (out[0][i] !== canonHeader(name, country)) failures.push(`${header[i]}: header ${JSON.stringify(out[0][i])}, expected ${name}`);
  });
  wantRows.forEach((want, r) => {
    want.forEach((w, i) => {
      if (w === undefined) return;
      const got = out[r + 1][i];
      if (got !== w) failures.push(`row ${r + 1} ${header[i]}: ${JSON.stringify(got)}, expected ${JSON.stringify(w)}`);
    });
  });
  assert.strictEqual(failures.length, 0, `${failures.length} failure(s):\n${failures.join('\n')}`);
}

// Section 2 (Spain): trailing (ID…) tags and the º ordinal behave as the plain label.
function testHeldoutSpanishTaggedAnswers() {
  const cols = [['grade1', 'grade1'], ['edu2', 'edudad1'], ['born6', 'bfborn1'], ['born5', 'bmborn1'],
    ['soc1', 'ladder1'], ['edu1', 'edumom1']];
  const header = cols.map(([tag]) => `Pregunta (${tag})`);
  const rows = euPre('MENTOR_survey', header, [
    ['3º de la ESO. (ID55)', 'Grado. (ID4)', 'Bélgica (ID12)', 'Oceanía (ID3)', 'Peor situación (ID1)', 'Formación Profesional. (ID31)'],
    ['Formación profesional. (ID77)', 'Formación Profesional. (ID8)', 'Australia (ID9)', 'Sur de África (ID5)', 'Mejor situación (ID2)', 'Máster o título superior. (ID32)'],
    ['1º de Bachillerato.', 'Estudios universitarios parciales, sin título. (ID6)', 'República Checa (ID13)', '- Prefiero no responder (ID14)', '7', 'Menos que el bachillerato.']
  ]);
  const out = SurveyAuditor.cleanExportRows(rows, { dictionary: DICT, country: 'Spain' });
  compareColumns(out, header, cols.map(c => c[1]), 'Spain', [
    ['9th', "Bachelor's degree", 'Belgium', 'Oseania', '1', 'Vocational training'],
    ['Vocational training', 'Vocational training', 'Australia', 'Sub-Saharan Africa', '10', "Master's degree or more"],
    ['11th', 'Come college, no degree', 'Czech Republic', 'Prefer not to answer', '7', 'Less than high school']
  ]);
}

// Sections 1, 2 and 4 (Hungary): a detected Hungarian survey with several
// columns, restored KIDSCREEN names, and non-answers in other columns.
function testHeldoutDetectedHungarianSurvey() {
  const cols = [
    ['StartDate', null], ['born5', 'bmborn1'], ['born6', 'bfborn1'], ['born3', 'bplace1'],
    ['living5', 'dadprt1'], ['some_weekend1:5_3', 'smwda3'], ['kidscreen 9', 'ksa2'], ['kidscreen 10', 'ks8'],
    ['grade1', 'grade1'], ['soc1', 'ladder1'], ['cyrm1:12_5', 'cyrm05'], ['Q42', null], ['edu2', 'edudad1']
  ];
  const header = cols.map(c => c[0]);
  const rows = euPre('Mentor HUN', header, [
    ['2026-02-02', 'Csehország', 'Spanyolország', 'Vatikán', 'Nem tudom', '7 órát vagy többet', 'Alig', 'Gyakran',
      '13. évfolyam', '10 – A létra teteje', ' NEM SZERETNÉK VÁLASZOLNI', 'nem tudom / nem vonatkozik rám', 'Nem vonatkozik rám'],
    ['2026-02-03', 'Magyarország', 'Szubszaharai Afrika', 'Dél- vagy Közép-Amerika', 'Igen', 'Kevesebb mint 1 órát', 'Rendkívül', 'Mindig',
      '9. évfolyam', '1 – A létra alja', 'Valamennyire', 'szabad szöveg', 'Járt főiskolára/egyetemre, de nem szerzett diplomát']
  ]);
  const out = SurveyAuditor.cleanExportRows(rows, { dictionary: DICT });
  compareColumns(out, header, cols.map(c => c[1]), 'Hungary', [
    ['2026-02-02', 'Czech Republic', 'Spain', 'Vatikán', null, '7 hours or more', 'A little', 'Quite often',
      '13th', '10', null, null, null],
    ['2026-02-03', 'Hungary', 'Sub-Saharan Africa', 'South or Central America', 'Yes', 'Less than 1 hour', 'To a great extent', 'Always',
      '9th', '1', 'Somewhat', 'szabad szöveg', 'Come college, no degree']
  ]);
}

// Section 3 (and 4): other multiple-choice variables and cells.
function testHeldoutOtherMultipleChoiceCells() {
  const header = ['living2', 'ai2', 'some_apps1', 'gaming1'];
  const out = SurveyAuditor.cleanExportRows([header,
    ['Egyéb:,Nevelőotthonban élek,Nem tudom', 'Társaságként,Valami egyéb cél', 'Streaming szolgáltatások (pl. Netflix, Disney+),YouTube,X/Twitter', '... többnyire egyedül játszol'],
    ['Nem szeretnék válaszolni,Nem vonatkozik rám', 'Információszerzésre', 'Pinterest,Nem tudom / Nem vonatkozik rám', 'Fiú,Lány']
  ], { dictionary: DICT, country: 'Hungary' });
  compareColumns(out, header, ['livead1', 'aiuse1', 'apps1', 'gaming1'], 'Hungary', [
    ['Other;Supervised centre/Youth home', 'For social company;Valami egyéb cél',
      'Streaming services (e.g., Netflix, Disney+);YouTube;X/Twitter', 'Mostly play games alone?'],
    [null, 'For getting information', 'Pinterest', 'Fiú,Lány']
  ]);
  // Spanish multiple-choice cell joined with commas.
  const es = SurveyAuditor.cleanExportRows(euPre('MENTOR_survey', ['Pregunta (some_apps1)', 'Pregunta (ai2)'], [
    ['Snapchat.,Otros.', 'Para entretenimiento.,Para compañía social.']
  ]), { dictionary: DICT, country: 'Spain' });
  assert.deepStrictEqual(es[1], ['Snapchat;Other', 'For entertainment;For social company']);
}

const TESTS = [
  testHeldoutSpanishTaggedAnswers,
  testHeldoutDetectedHungarianSurvey,
  testHeldoutOtherMultipleChoiceCells
];

function runTests() {
  console.log('--- Starting issue #28 held-out tests ---');
  const only = process.argv.slice(2);
  let failed = 0;
  for (const test of TESTS) {
    if (only.length && !only.includes(test.name)) continue;
    try {
      test();
      console.log(`PASS ${test.name}`);
    } catch (err) {
      failed++;
      console.log(`FAIL ${test.name}: ${err.message.split('\n').slice(0, 30).join('\n    ')}`);
    }
  }
  if (failed) {
    console.log(`${failed} issue #28 held-out test(s) failed.`);
    process.exit(1);
  }
  console.log('All issue #28 held-out tests passed.');
}

runTests();
