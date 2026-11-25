/**
 * Issue #28: wrong and missing Hungarian and Spanish mappings in the cleaned
 * export (SurveyAuditor.cleanExportRows).
 *
 * Expected values come from the issue #28 contract (Part A). The answer
 * tables below (HU_TABLE, ES_TABLE) were written by hand from the meaning of
 * the Hungarian and Spanish answer labels of the questionnaires (the
 * `country_options` column of data/country_maps/hungary_review.xlsx and
 * spain_review.xlsx) and the canonical English labels of
 * data/master_dictionary.json. They do not come from the dictionary's
 * aliases, from any key file or from positions in the option lists.
 * Synthetic one-column sheets only.
 *
 * Run: node tests/test_issue28_mappings.js [testName ...]
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const SurveyAuditor = require('../src/survey_validator.js');

const ROOT = path.resolve(__dirname, '..');
const DICT = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'master_dictionary.json'), 'utf8'));

// Expected-value markers in the tables.
const KEEP = Symbol('stays as written'); // no same-meaning canonical option
const BLANK = null;                      // Hungarian non-answer: blank cell

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function dictVar(name) {
  const v = DICT.variables.find(x => x.variable === name);
  assert.ok(v, `dictionary has ${name}`);
  return v;
}

/** Header the cleaned export writes for a matched variable (stem [: item], country filled in). */
function canonHeader(name, country) {
  const v = dictVar(name);
  const text = v.item_text ? `${v.question_stem}: ${v.item_text}` : v.question_stem;
  return text.replace(/\[country\]/gi, country);
}

function euPre(alias, header, dataRows) {
  return [['Alias', alias], ['Export Date', '2026-03-03'], [], header, ...dataRows];
}

function audit(rows, options) {
  return new SurveyAuditor(DICT).auditSheet(rows, options);
}

function colVar(result, index) {
  const col = result.columns.find(c => c.colIndex === index);
  assert.ok(col, `column ${index} audited`);
  return col.canonical ? col.canonical.variable : null;
}

function exportHu(header, dataRows, extra) {
  return SurveyAuditor.cleanExportRows([header, ...dataRows],
    Object.assign({ dictionary: DICT, country: 'Hungary' }, extra || {}));
}

function failuresOf(cases, check) {
  const failures = [];
  for (const c of cases) {
    try {
      const msg = check(c);
      if (msg) failures.push(msg);
    } catch (err) {
      failures.push(`${JSON.stringify(c).slice(0, 80)}: ${err.message.split('\n')[0]}`);
    }
  }
  assert.strictEqual(failures.length, 0, `${failures.length} failure(s):\n${failures.slice(0, 40).join('\n')}`);
}

function show(x) {
  return x === KEEP ? '(as written)' : JSON.stringify(x);
}

/**
 * For each table group and each variable: one synthetic sheet with the
 * country column of that variable and one respondent per answer label. The
 * header must become the variable's canonical header, and each answer the
 * expected canonical label, the cell as written (KEEP) or a blank (BLANK).
 */
function checkTable(table, columns, country, makeRows) {
  const failures = [];
  for (const group of table) {
    for (const name of group.vars) {
      const col = columns[name];
      if (!col) { failures.push(`${name}: no ${country} column in the test table`); continue; }
      const rows = makeRows(col, group.answers.map(([label]) => [label]));
      let out;
      try {
        out = SurveyAuditor.cleanExportRows(rows, { dictionary: DICT, country });
      } catch (err) {
        failures.push(`${name}: export threw ${err.message}`);
        continue;
      }
      const wantHeader = canonHeader(name, country);
      if (out[0][0] !== wantHeader) {
        failures.push(`${name} (${col}): column not matched to ${name}; header written ${JSON.stringify(out[0][0])}`);
        continue;
      }
      group.answers.forEach(([label, expected], i) => {
        const got = out[i + 1][0];
        const want = expected === KEEP ? label : expected;
        if (got !== want) failures.push(`${name}: ${JSON.stringify(label)} -> ${JSON.stringify(got)}, expected ${show(expected)}`);
      });
    }
  }
  assert.strictEqual(failures.length, 0, `${failures.length} wrong answer(s):\n${failures.slice(0, 60).join('\n')}`);
}

function range(prefix, n, pad) {
  return Array.from({ length: n }, (_, i) => `${prefix}${pad ? String(i + 1).padStart(pad, '0') : i + 1}`);
}

// ---------------------------------------------------------------------------
// Hungary: column of each core variable (Qualtrics import IDs, from the
// country_orig_id column of hungary_review.xlsx and the contract, section 1).
// ---------------------------------------------------------------------------

const HU_COLUMNS = {
  gender1: 'gender1', grade1: 'grade1', byear1: 'born1', bmonth1: 'born2', bplace1: 'born3',
  bage1: 'born4', bmborn1: 'born5', bfborn1: 'born6', live1: 'living1', livead1: 'living2',
  livesp1: 'living3', momprt1: 'living4', dadprt1: 'living5', sibs1: 'siblings1',
  edumom1: 'edu1', edudad1: 'edu2', ladder1: 'soc1', afford1: 'soc2',
  gaming1: 'gaming1', ai1: 'ai1', aiuse1: 'ai2', smpos1: 'some_feel1', smneg1: 'some_feel2',
  apps1: 'some_apps1', bmo1: 'ace23'
};
for (const [prefix, block, n] of [['raia', 'raia1:6_', 6], ['coop', 'coop1:6_', 6], ['ma', 'ma1:6_', 6],
  ['sa', 'sa1:6_', 6], ['mood', 'mood1:6_', 6], ['af', 'af1:6_', 6]]) {
  for (let i = 1; i <= n; i++) HU_COLUMNS[`bcfpi_${prefix}${i}`] = `${block}${i}`;
}
for (let i = 1; i <= 12; i++) HU_COLUMNS[`bcfpi_yf${String(i).padStart(2, '0')}`] = `yf1:12_${i}`;
for (let i = 1; i <= 12; i++) HU_COLUMNS[`cyrm${String(i).padStart(2, '0')}`] = `cyrm1:12_${i}`;
for (let i = 1; i <= 8; i++) HU_COLUMNS[`ks${i}`] = `kidscreen 2-8 and 10_${i}`;
HU_COLUMNS.ksa1 = 'kidscreen 1 and 9_1';
HU_COLUMNS.ksa2 = 'kidscreen 1 and 9_2';
['5_1', '5_2', '5_3', '5_5', '5_6'].forEach((s, i) => {
  HU_COLUMNS[`smwd${i + 1}`] = `some_week1:${s}`;
  HU_COLUMNS[`smwda${i + 1}`] = `some_weekend1:${s}`;
});
for (let i = 1; i <= 6; i++) HU_COLUMNS[`smharm${i}`] = `some_use1:6_${i}`;
// ACE block: ace01 ... ace31 in questionnaire order.
const ACE_ORDER = ['rpginsfy1', 'rpginsfy2', 'dlup1', 'dlup2', 'dlup3', ...range('dlupa', 5),
  ...range('fetnqact', 3), ...range('tnqactmh', 8), 'pvtnqabb1', 'bmo1', 'nqapfpfo1',
  ...range('tnqaomhs', 3), ...range('ewcvtqaw', 4)];
ACE_ORDER.forEach((name, i) => { HU_COLUMNS[name] = `ace${String(i + 1).padStart(2, '0')}`; });

// Hungary offers these two on every question; both are blank (contract section 4).
const HU_NON = [['Nem szeretnék válaszolni', BLANK], ['Nem tudom / Nem vonatkozik rám', BLANK]];

// Birth countries and regions of the Hungarian questionnaire (52), complete.
// The Belarus label carries a soft hyphen (U+00AD) as in the questionnaire.
const HU_BIRTH = [
  ['Magyarország', 'Hungary'], // the survey country
  ['Albánia', 'Albania'],
  ['Andorra', 'Andorra'],
  ['Ausztria', 'Austria'],
  ['Belgium', 'Belgium'],
  ['Bosznia-Hercegovina', 'Bosnia and Herzegovina'],
  ['Bulgária', 'Bulgaria'],
  ['Csehország', 'Czech Republic'],
  ['Dánia', 'Denmark'],
  ['Egyesült Királyság', 'United Kingdom'],
  ['Észak-Macedónia', 'North Macedonia'],
  ['Észtország', 'Estonia'],
  ['Fehéroro­szország', 'Belarus'],
  ['Finnország', 'Finland'],
  ['Franciaország', 'France'],
  ['Görögország', 'Greece'],
  ['Hollandia', 'Netherlands'],
  ['Horvátország', 'Croatia'],
  ['Írország', 'Ireland'],
  ['Izland', 'Iceland'],
  ['Lengyelország', 'Poland'],
  ['Lettország', 'Latvia'],
  ['Liechtenstein', 'Liechtenstein'],
  ['Litvánia', 'Lithuania'],
  ['Luxemburg', 'Luxembourg'],
  ['Málta', 'Malta'],
  ['Moldova', 'Moldova'],
  ['Monaco', 'Monaco'],
  ['Montenegró', 'Montenegro'],
  ['Németország', 'Germany'],
  ['Norvégia', 'Norway'],
  ['Olaszország', 'Italy'],
  ['Oroszország', 'Russia'],
  ['Portugália', 'Portugal'],
  ['Románia', 'Romania'],
  ['San Marino', KEEP], // no canonical San Marino
  ['Spanyolország', 'Spain'],
  ['Svájc', 'Switzerland'],
  ['Svédország', 'Sweden'],
  ['Szerbia', 'Serbia'],
  ['Szlovákia', 'Slovakia'],
  ['Szlovénia', 'Slovenia'],
  ['Törökország', 'Turkey'],
  ['Ukrajna', 'Ukraine'],
  ['Vatikán', KEEP], // contract: no canonical option
  ['Egyéb európai terület', KEEP], // other European area; contract: no canonical option
  ['Közel-Kelet vagy Észak-Afrika', 'Middle East or North Africa'],
  ['Szubszaharai Afrika', 'Sub-Saharan Africa'],
  ['Ázsia', 'Asia'],
  ['Észak-Amerika', 'North America'],
  ['Dél- vagy Közép-Amerika', 'South or Central America'],
  ['Egyéb', 'Other'],
  ...HU_NON
];

const HU_BCFPI = [['SOHA nem igaz', 'NEVER true'], ['NÉHA igaz', 'SOMETIMES true'], ['GYAKRAN igaz', 'OFTEN true'], ...HU_NON];
const HU_ACE_FREQ = [['Sokszor', 'Many times'], ['Néhányszor', 'A few times'], ['Egyszer', 'Once'], ['Soha', 'Never'], ...HU_NON];
const HU_YES_NO = [['Igen', 'Yes'], ['Nem', 'No'], ...HU_NON];
const HU_SM_FREQ = [['Szinte mindig', 'Nearly all the time'], ['Gyakran', 'Often'], ['Néha', 'Sometimes'],
  ['Ritkán', 'Rarely'], ['Soha', 'Never'], ...HU_NON];
const HU_EDU = [
  ['Nincs középfokú végzettsége', 'Less than high school'],
  ['Érettségije vagy azzal egyenértékű végzettsége van', 'High school diploma or equivalent'],
  ['Járt főiskolára/egyetemre, de nem szerzett diplomát', 'Come college, no degree'],
  ['Főiskolán/egyetemen diplomát szerzett', 'College or university degree'],
  ['Nem tudom', BLANK],
  ['Nem vonatkozik rám', BLANK],
  ...HU_NON
];

const BCFPI_VARS = ['raia', 'coop', 'ma', 'sa', 'mood', 'af'].flatMap(p => range(`bcfpi_${p}`, 6))
  .concat(range('bcfpi_yf', 12, 2));

const HU_TABLE = [
  { vars: ['gender1'], answers: [['Fiú', 'Boy'], ['Lány', 'Girl'], ...HU_NON] },
  { vars: ['grade1'], answers: [
    ['9. évfolyam', '9th'], ['10. évfolyam', '10th'], ['11. évfolyam', '11th'], ['12. évfolyam', '12th'],
    ['13. évfolyam', '13th'], ['Abbahagytam az iskolát', 'Quit school before graduating'], ...HU_NON] },
  { vars: ['byear1'], answers: [
    ...['2004', '2005', '2006', '2007', '2008', '2009', '2010', '2011', '2012'].map(y => [y, y]), ...HU_NON] },
  { vars: ['bmonth1'], answers: [
    ['Január', 'January'], ['Február', 'February'], ['Március', 'March'], ['Április', 'April'],
    ['Május', 'May'], ['Június', 'June'], ['Július', 'July'], ['Augusztus', 'August'],
    ['Szeptember', 'September'], ['Október', 'October'], ['November', 'November'], ['December', 'December'],
    ...HU_NON] },
  { vars: ['bplace1', 'bmborn1', 'bfborn1'], answers: HU_BIRTH },
  { vars: ['bage1'], answers: [
    ...Array.from({ length: 19 }, (_, i) => [String(i), String(i)]), ['Nem tudom', BLANK], ...HU_NON] },
  { vars: ['live1'], answers: [
    ['Mindkét szülőmmel együtt élek', 'I live with both my parents together'],
    ['A szüleim külön élnek, csak az édesanyámmal élek', 'My parents live apart, and I live only with my mother'],
    ['A szüleim külön élnek, csak az édesapámmal élek', 'My parents live apart, and I live only with my father'],
    ['A szüleim külön élnek, de mindkettejükkel együtt élek (felváltva)', 'My parents live apart, and I live with both parents'],
    ['Nem a szüleimmel élek', 'I do not live with my parents'],
    ['Nem a szüleimmel, hanem mással/másokkal élek', 'I do not live with my parents'],
    ['Egyedül élek', 'I do not live with my parents'],
    ...HU_NON] },
  { vars: ['livead1'], answers: [
    ['Rokonokkal (pl. nagyszülők, nagynéni, nagybácsi)', 'Relatives (e.g., grandparents, aunt, uncle)'],
    ['Nevelőszülőkkel', 'Foster parents'],
    ['Nevelőotthonban élek', 'Supervised centre/Youth home'],
    ['Egyéb', 'Other'],
    ['Egyéb:', 'Other'],
    ...HU_NON] },
  { vars: ['livesp1'], answers: [
    ['Többnyire édesanyámmal élek', 'I live mostly with my mother'],
    ['Többnyire édesapámmal élek', 'I live mostly with my father'],
    ['Ugyanannyit élek édesanyámmal és édesapámmal is', 'I live equally with my mother and father'],
    ...HU_NON] },
  { vars: ['momprt1', 'dadprt1'], answers: [['Igen', 'Yes'], ['Nem', 'No'], ['Nem tudom', BLANK], ...HU_NON] },
  { vars: ['sibs1'], answers: [['Egy sem', 'None'], ['1', '1'], ['2', '2'], ['3 vagy több', '3 or more'], ...HU_NON] },
  { vars: ['edumom1', 'edudad1'], answers: HU_EDU },
  { vars: ['ladder1'], answers: [
    ['1 – A létra alja', '1'], ['1 - A létra alja', '1'], ['A létra alja', '1'],
    ...['2', '3', '4', '5', '6', '7', '8', '9'].map(x => [x, x]),
    ['10 – A létra teteje', '10'], ['10 - A létra teteje', '10'], ['A létra teteje', '10'], ...HU_NON] },
  { vars: ['afford1'], answers: [
    ['Egyáltalán nem értek egyet', 'Strongly disagree'], ['Inkább nem értek egyet', 'Somewhat disagree'],
    ['Inkább egyetértek', 'Somewhat agree'], ['Teljes mértékben egyetértek', 'Strongly agree'], ...HU_NON] },
  { vars: BCFPI_VARS, answers: HU_BCFPI },
  { vars: ['rpginsfy1', 'rpginsfy2'], answers: [
    ['Mindig', 'Always'], ['Legtöbbször', 'Most of the time'], ['Néha', 'Sometimes'], ['Ritkán', 'Rarely'],
    ['Soha', 'Never'], ...HU_NON] },
  { vars: ['dlup1', 'dlup2', 'dlup3', ...range('fetnqact', 3), ...range('tnqactmh', 8), 'pvtnqabb1',
    'nqapfpfo1', ...range('tnqaomhs', 3), ...range('ewcvtqaw', 4)], answers: HU_ACE_FREQ },
  { vars: range('dlupa', 5), answers: HU_YES_NO },
  { vars: ['bmo1'], answers: [
    ['Ütöttek, rúgtak, lenyomtak, lökdöstek vagy bezártak.', 'I was hit, kicked, pushed, shoved around, or locked indoors.'],
    ['Kigúnyoltak, a rasszom, a nemzetiségem vagy a bőrszínem miatt.', 'I was made fun of because of my race, nationality or colour'],
    ['Kigúnyoltak a vallásom miatt.', 'I was made fun of because of my religion'],
    ['Szexuális utalásokkal, megjegyzésekkel vagy mozdulatokkal gúnyoltak.', 'I was made fun of with sexual jokes, comments, or gestures'],
    ['Szándékosan kihagytak tevékenységekből vagy semmibe vettek.', 'I was left out of activities on purpose or completely ignored'],
    ['Kigúnyoltak a testem vagy az arcom kinézete miatt.', 'I was made fun of because of how my body or face looked'],
    ['Más módon kegyetlenkedtek velem.', 'I was bullied in some other way'],
    ...HU_NON] },
  { vars: range('cyrm', 12, 2), answers: [
    ['Egyáltalán nem', 'Not at all'], ['Egy kicsit', 'A little'], ['Valamennyire', 'Somewhat'],
    ['Eléggé', 'Quite a bit'], ['Nagyon', 'A lot'], ...HU_NON] },
  { vars: range('ks', 8), answers: [
    ['Soha', 'Never'], ['Ritkán', 'Rarely'], ['Gyakran', 'Quite often'], ['Nagyon gyakran', 'Very often'],
    ['Mindig', 'Always'], ...HU_NON] },
  { vars: ['ksa1', 'ksa2'], answers: [
    ['Egyáltalán nem', 'Not at all'], ['Alig', 'A little'], ['Kicsit', 'Quite'], ['Nagyon', 'Very'],
    ['Rendkívül', 'To a great extent'], ...HU_NON] },
  { vars: [...range('smwd', 5), ...range('smwda', 5)], answers: [
    ['Kevesebb mint 1 órát', 'Less than 1 hour'], ['1-2 órát', '1-2 hours'], ['3-4 órát', '3-4 hours'],
    ['5-6 órát', '5-6 hours'], ['7 órát vagy többet', '7 hours or more'], ...HU_NON] },
  { vars: ['gaming1'], answers: [
    ['... többnyire egyedül játszol', 'Mostly play games alone?'],
    ['... többnyire online játszol másokkal', 'Mostly play games online with others?'],
    ['... többnyire másokkal játszol, miközben beszélgetsz velük', 'Mostly play games with others while chatting with them?'],
    ...HU_NON] },
  { vars: ['ai1'], answers: HU_YES_NO },
  { vars: ['aiuse1'], answers: [
    ['Iskolai feladatokra', 'For schoolwork'], ['Szórakozásra', 'For entertainment'],
    ['Társaságként', 'For social company'], ['Információszerzésre', 'For getting information'], ...HU_NON] },
  { vars: ['smpos1', 'smneg1', ...range('smharm', 6)], answers: HU_SM_FREQ },
  { vars: ['apps1'], answers: [
    ...['Snapchat', 'Instagram', 'Facebook', 'Reddit', 'TikTok', 'Twitch', 'Messenger', 'Telegram',
      'WhatsApp', 'YouTube', 'X/Twitter', 'Pinterest'].map(x => [x, x]),
    ['AI alkalmazások (pl. ChatGPT, Gemini, Claude)', 'AI (e.g., ChatGPT, Gemini, Claude)'],
    ['Streaming szolgáltatások (pl. Netflix, Disney+)', 'Streaming services (e.g., Netflix, Disney+)'],
    ['Egyéb', 'Other'], ['Egyéb:', 'Other'], ...HU_NON] }
];

// ---------------------------------------------------------------------------
// Spain: column tag of each core variable (EU Survey answer IDs, from the
// country_orig_id column of spain_review.xlsx).
// ---------------------------------------------------------------------------

const ES_COLUMNS = {
  gender1: 'gender1', ident1: 'gender2', grade1: 'grade1', byear1: 'born1', bmonth1: 'born2',
  bplace1: 'born3', bmborn1: 'born5', bfborn1: 'born6', live1: 'living1', livead1: 'living2',
  livesp1: 'living3', momprt1: 'living4', dadprt1: 'living5', sibs1: 'siblings1', edumom1: 'edu1',
  edudad1: 'edu2', ladder1: 'soc1', afford1: 'soc2', rpginsfy1: 'ID391', rpginsfy2: 'ID392',
  dlup1: 'ID405', dlup2: 'ID406', dlup3: 'ID407', pvtnqabb1: 'ID435', bmo1: 'ace23', nqapfpfo1: 'ID307',
  gaming1: 'gaming1', ai1: 'ai1', aiuse1: 'ai2', smpos1: 'some_feel1', smneg1: 'some_feel2',
  apps1: 'some_apps1', ksa1: 'ks9', ksa2: 'ks10'
};
const ES_ID_BLOCKS = {
  bcfpi_raia: [233, 234, 235, 236, 251, 252], bcfpi_coop: [260, 261, 282, 283, 284, 297],
  bcfpi_ma: [194, 298, 299, 300, 301, 302], bcfpi_sa: [289, 326, 327, 328, 329, 330],
  bcfpi_mood: [347, 348, 349, 350, 351, 352], bcfpi_af: [358, 359, 360, 361, 362, 363],
  dlupa: [418, 419, 420, 424, 425], fetnqact: [291, 292, 323],
  tnqactmh: [401, 402, 403, 404, 414, 415, 416, 417], tnqaomhs: [379, 430, 431],
  ewcvtqaw: [438, 456, 457, 458], smwd: [490, 491, 492, 499, 500], smwda: [508, 509, 510, 511, 512],
  smharm: [541, 544, 545, 546, 580, 5]
};
for (const [prefix, ids] of Object.entries(ES_ID_BLOCKS)) ids.forEach((id, i) => { ES_COLUMNS[`${prefix}${i + 1}`] = `ID${id}`; });
[368, 369, 370, 371, 372, 373, 384, 148, 877, 878, 879, 880].forEach((id, i) => {
  ES_COLUMNS[`bcfpi_yf${String(i + 1).padStart(2, '0')}`] = `ID${id}`;
});
for (let i = 1; i <= 12; i++) ES_COLUMNS[`cyrm${String(i).padStart(2, '0')}`] = `ID${471 + i}`;
for (let i = 1; i <= 8; i++) ES_COLUMNS[`ks${i}`] = `ks${i}`;

const PNR = 'Prefer not to answer';

// Spanish birth countries and regions, complete.
const ES_BIRTH = [
  ['Alemania', 'Germany'], ['Austria', 'Austria'], ['Bulgaria', 'Bulgaria'], ['Bélgica', 'Belgium'],
  ['República Checa', 'Czech Republic'], ['Chipre', 'Cyprus'], ['Croacia', 'Croatia'],
  ['Dinamarca', 'Denmark'], ['Eslovaquia', 'Slovakia'], ['Eslovenia', 'Slovenia'],
  ['España', 'Spain'], // the survey country
  ['Estonia', 'Estonia'], ['Finlandia', 'Finland'], ['Francia', 'France'], ['Grecia', 'Greece'],
  ['Hungría', 'Hungary'], ['Irlanda', 'Ireland'], ['Italia', 'Italy'], ['Letonia', 'Latvia'],
  ['Lituania', 'Lithuania'], ['Luxemburgo', 'Luxembourg'], ['Malta', 'Malta'],
  ['Países Bajos', 'Netherlands'], ['Polonia', 'Poland'], ['Portugal', 'Portugal'],
  ['Rumanía', 'Romania'], ['Suecia', 'Sweden'], ['Albania', 'Albania'], ['Andorra', 'Andorra'],
  ['Bielorrusia', 'Belarus'], ['Reino Unido', 'United Kingdom'], ['Ucrania', 'Ukraine'],
  ['Suiza', 'Switzerland'], ['Serbia', 'Serbia'],
  ['San Marino', KEEP], // no canonical San Marino
  ['Rusia', 'Russia'], ['Noruega', 'Norway'], ['Bosnia y Herzegovina', 'Bosnia and Herzegovina'],
  ['Asia', 'Asia'],
  ['Australia', KEEP], // contract: stays as written
  ['Islandia', 'Iceland'], ['Kosovo', 'Kosovo'], ['Liechtenstein', 'Liechtenstein'],
  ['Oriente Medio o Norte de África', 'Middle East or North Africa'], ['Moldavia', 'Moldova'],
  ['Mónaco', 'Monaco'], ['Montenegro', 'Montenegro'], ['América del Norte', 'North America'],
  ['Macedonia del Norte', 'North Macedonia'],
  ['Oceanía', 'Oseania'], // canonical spelling
  ['- Otro', 'Other'], ['Otro', 'Other'],
  ['- Prefiero no responder', PNR], ['Prefiero no responder', PNR],
  ['América del Sur o Central', 'South or Central America'],
  ['Sur de África', 'Sub-Saharan Africa'] // contract
];

const ES_BCFPI = [['Nunca es cierto', 'NEVER true'], ['A veces es cierto', 'SOMETIMES true'], ['A menudo es cierto', 'OFTEN true']];
const ES_ACE_FREQ = [['Muchas veces', 'Many times'], ['Algunas veces', 'A few times'], ['Una vez', 'Once'], ['Nunca', 'Never']];
const ES_KS_FREQ = [['Nunca', 'Never'], ['Rara vez', 'Rarely'], ['A menudo', 'Quite often'], ['Muy a menudo', 'Very often'], ['Siempre', 'Always']];
const ES_KS_INTENSITY = [['Nada', 'Not at all'], ['Un poco', 'A little'], ['Moderadamente', 'Quite'], ['Mucho', 'Very'], ['Extremadamente', 'To a great extent']];
const ES_EDU = [
  ['Menos que el bachillerato.', 'Less than high school'],
  ['Título de bachillerato o equivalente.', 'High school diploma or equivalent'],
  ['Estudios universitarios parciales, sin título.', 'Come college, no degree'],
  ['Formación Profesional.', 'Vocational training'],
  ['Grado.', "Bachelor's degree"],
  ['Máster o título superior.', "Master's degree or more"]
];

const ES_TABLE = [
  { vars: ['gender1'], answers: [['Chico.', 'Boy'], ['Chica.', 'Girl'], ['Otro género.', 'Other gender identity'],
    ['Prefiero no responder.', PNR]] },
  { vars: ['ident1'], answers: [['No binario.', 'Non-binary'], ['Transgénero.', 'Transgender'],
    ['Intersexual.', 'Intersex'], ['En cuestionamiento.', 'Questioning'], ['No estoy seguro/a.', 'Unsure'],
    ['Prefiero no responder.', PNR]] },
  { vars: ['grade1'], answers: [
    ['2o de la ESO.', '8th'], ['3o de la ESO.', '9th'], ['4o de la ESO.', '10th'],
    ['1o de Bachillerato.', '11th'], ['2o de Bachillerato.', '12th'],
    ['Formación profesional.', 'Vocational training'],
    ['Ya terminé la escuela.', 'Graduated from school'],
    ['Dejé los estudios antes de finalizar.', 'Quit school before graduating']] },
  { vars: ['byear1'], answers: Array.from({ length: 12 }, (_, i) => [String(2000 + i), String(2000 + i)]) },
  { vars: ['bmonth1'], answers: [
    ['Enero.', 'January'], ['Febrero.', 'February'], ['Marzo.', 'March'], ['Abril.', 'April'], ['Mayo.', 'May'],
    ['Junio.', 'June'], ['Julio.', 'July'], ['Agosto.', 'August'], ['Septiembre.', 'September'],
    ['Octubre.', 'October'], ['Noviembre.', 'November'], ['Diciembre.', 'December'],
    ['Prefiero no responder.', KEEP]] }, // bmonth1 has no "Prefer not to answer"
  { vars: ['bplace1', 'bmborn1', 'bfborn1'], answers: ES_BIRTH },
  { vars: ['live1'], answers: [
    ['Vivo con mis dos padres juntos.', 'I live with both my parents together'],
    ['Mis padres viven separados y yo vivo solo con mi madre.', 'My parents live apart, and I live only with my mother'],
    ['Mis padres viven separados y yo vivo solo con mi padre.', 'My parents live apart, and I live only with my father'],
    ['Mis padres viven separados y yo vivo con ambos padres.', 'My parents live apart, and I live with both parents'],
    ['No vivo con mis padres.', 'I do not live with my parents']] },
  // "Padres adoptivos." (adoptive parents) is left out: foster and adoptive parents differ.
  { vars: ['livead1'], answers: [
    ['Familiares (por ejemplo, abuelos, tíos).', 'Relatives (e.g., grandparents, aunt, uncle)'],
    ['Centro de acogida.', 'Supervised centre/Youth home'],
    ['Otros.', 'Other']] },
  { vars: ['livesp1'], answers: [
    ['Vivo principalmente con mi madre.', 'I live mostly with my mother'],
    ['Vivo principalmente con mi padre.', 'I live mostly with my father'],
    ['Vivo por igual con mi madre y mi padre.', 'I live equally with my mother and father']] },
  { vars: ['momprt1', 'dadprt1'], answers: [['Sí.', 'Yes'], ['No.', 'No'], ['No lo sé.', "Don't know"]] },
  { vars: ['sibs1'], answers: [['Ninguno.', 'None'], ['1.', '1'], ['2.', '2'], ['3 o más.', '3 or more']] },
  { vars: ['edumom1', 'edudad1'], answers: ES_EDU },
  { vars: ['ladder1'], answers: [['Peor situación', '1'], ['5', '5'], ['Mejor situación', '10']] },
  { vars: ['afford1'], answers: [
    ['Totalmente en desacuerdo.', 'Strongly disagree'], ['Algo en desacuerdo.', 'Somewhat disagree'],
    ['Algo de acuerdo.', 'Somewhat agree'], ['Totalmente de acuerdo.', 'Strongly agree']] },
  // bcfpi_coop/ma/af have a "Prefer not to answer" option; raia/sa/mood/yf do not.
  { vars: ['coop', 'ma', 'af'].flatMap(p => range(`bcfpi_${p}`, 6)), answers: [...ES_BCFPI, ['Prefiero no responder', PNR]] },
  { vars: ['raia', 'sa', 'mood'].flatMap(p => range(`bcfpi_${p}`, 6)).concat(range('bcfpi_yf', 12, 2)),
    answers: [...ES_BCFPI, ['Prefiero no responder', KEEP]] },
  { vars: ['rpginsfy1', 'rpginsfy2'], answers: [
    ['Siempre', 'Always'], ['La mayoría de las veces', 'Most of the time'], ['A veces', 'Sometimes'],
    ['Rara vez', 'Rarely'], ['Nunca', 'Never'], ['Prefiero no responder', PNR]] },
  { vars: ['dlup1'], answers: [...ES_ACE_FREQ, ['Prefiero no responder', PNR]] },
  { vars: ['dlup2', 'dlup3', ...range('fetnqact', 3), ...range('tnqactmh', 8), 'pvtnqabb1', 'nqapfpfo1',
    ...range('tnqaomhs', 3), ...range('ewcvtqaw', 4)], answers: [...ES_ACE_FREQ, ['Prefiero no responder', KEEP]] },
  { vars: range('dlupa', 5), answers: [['Sí', 'Yes'], ['No', 'No'], ['Prefiero no responder', PNR]] },
  { vars: ['bmo1'], answers: [
    ['Me pegaban, me daban patadas, me empujaban, me zarandeaban o me encerraban en casa.', 'I was hit, kicked, pushed, shoved around, or locked indoors.'],
    ['Se burlaban de mí por mi raza, nacionalidad o color de piel.', 'I was made fun of because of my race, nationality or colour'],
    ['Se burlaban de mí por mi religión.', 'I was made fun of because of my religion'],
    ['Se burlaban de mí con bromas, comentarios o gestos de carácter sexual.', 'I was made fun of with sexual jokes, comments, or gestures'],
    ['Me dejaban fuera de las actividades a propósito o me ignoraban por completo.', 'I was left out of activities on purpose or completely ignored'],
    ['Se burlaban de mí por mi aspecto físico o mi cara.', 'I was made fun of because of how my body or face looked'],
    ['Me acosaban de alguna otra forma.', 'I was bullied in some other way'],
    ['Prefiero no responder.', KEEP]] },
  { vars: range('cyrm', 12, 2), answers: [
    ['En absoluto', 'Not at all'], ['Un poco', 'A little'], ['Algo', 'Somewhat'], ['Bastante', 'Quite a bit'],
    ['Mucho', 'A lot'], ['Prefiero no responder', PNR]] },
  // ks1-ks8 take the frequency labels only; the intensity labels stay as written.
  { vars: range('ks', 8), answers: [...ES_KS_FREQ, ['Prefiero no responder', KEEP],
    ...ES_KS_INTENSITY.map(([l]) => [l, KEEP])] },
  // ksa1/ksa2 take the intensity labels only; the frequency labels stay as written.
  { vars: ['ksa1', 'ksa2'], answers: [...ES_KS_INTENSITY, ['Prefiero no responder', PNR],
    ...ES_KS_FREQ.map(([l]) => [l, KEEP])] },
  { vars: [...range('smwd', 5), ...range('smwda', 5)], answers: [
    ['Menos de 1 hora', 'Less than 1 hour'], ['1-2 horas', '1-2 hours'], ['3-4 horas', '3-4 hours'],
    ['5-6 horas', '5-6 hours'], ['7 horas o más', '7 hours or more'], ['Prefiero no responder', KEEP]] },
  { vars: ['gaming1'], answers: [
    ['Sueles jugar solo.', 'Mostly play games alone?'],
    ['Juegas en línea con otras personas.', 'Mostly play games online with others?'],
    ['Sueles jugar con otros mientras chateas con ellos.', 'Mostly play games with others while chatting with them?']] },
  { vars: ['ai1'], answers: [['Sí.', 'Yes'], ['No.', 'No']] },
  { vars: ['aiuse1'], answers: [
    ['Para tareas escolares.', 'For schoolwork'], ['Para entretenimiento.', 'For entertainment'],
    ['Para compañía social.', 'For social company']] },
  { vars: ['smpos1', 'smneg1'], answers: [
    ['Casi siempre.', 'Nearly all the time'], ['A menudo.', 'Often'], ['A veces.', 'Sometimes'],
    ['Rara vez.', 'Rarely'], ['Nunca.', 'Never'], ['Prefiero no responder.', KEEP]] },
  { vars: range('smharm', 6), answers: [
    ['Casi siempre', 'Nearly all the time'], ['A menudo', 'Often'], ['A veces', 'Sometimes'],
    ['Rara vez', 'Rarely'], ['Nunca', 'Never'], ['Prefiero no responder', PNR]] },
  { vars: ['apps1'], answers: [
    ['Snapchat.', 'Snapchat'], ['Instagram.', 'Instagram'], ['Facebook.', 'Facebook'], ['Reddit.', 'Reddit'],
    ['TikTok.', 'TikTok'], ['Twitch.', 'Twitch'], ['Messenger.', 'Messenger'], ['Telegram.', 'Telegram'],
    ['WhatsApp.', 'WhatsApp'], ['YouTube.', 'YouTube'], ['X/ Twitter.', 'X/Twitter'], ['Pinterest.', 'Pinterest'],
    ['IA (por ejemplo, ChatGPT, Gemini, Claude).', 'AI (e.g., ChatGPT, Gemini, Claude)'],
    ['Servicios de streaming (por ejemplo, Netflix, Disney+).', 'Streaming services (e.g., Netflix, Disney+)'],
    ['Otros.', 'Other'], ['Prefiero no responder.', KEEP]] }
];

function huSheet(col, dataRows) {
  return [[col], ...dataRows];
}

function esSheet(col, dataRows) {
  return euPre('MENTOR_survey', [`Pregunta (${col})`], dataRows);
}

// ---------------------------------------------------------------------------
// Section 1: column mapping
// ---------------------------------------------------------------------------

const HU_LAYOUT = ['StartDate', 'EndDate', 'ResponseId', 'gender1', 'schooltype', 'grade1',
  'some_week1:5_1', 'some_week1:5_2', 'some_week1:5_3', 'some_week1:5_4', 'some_week1:5_5', 'some_week1:5_6',
  'some_weekend1:5_1', 'some_weekend1:5_2', 'some_weekend1:5_3', 'some_weekend1:5_4', 'some_weekend1:5_5',
  'some_weekend1:5_6', 'county', 'sleep3', 'born4'];

function huLayoutRows() {
  return [HU_LAYOUT, HU_LAYOUT.map((h, i) => (i < 3 ? `x${i}` : null))];
}

function isCore(name) {
  if (!name) return false;
  const v = DICT.variables.find(x => x.variable === name);
  return !!(v && v.is_core === true);
}

function testHungaryGradeColumnIsGrade1() {
  const result = audit(huLayoutRows(), { country: 'Hungary' });
  const g = colVar(result, HU_LAYOUT.indexOf('grade1'));
  const s = colVar(result, HU_LAYOUT.indexOf('schooltype'));
  assert.strictEqual(g, 'grade1', 'column grade1 is variable grade1');
  assert.notStrictEqual(s, 'grade1', 'column schooltype is not grade1');
  assert.ok(!isCore(s), `column schooltype is no core variable (got ${s})`);
}

function testHungaryGamingColumnsAreSmwd1AndSmwda1() {
  const result = audit(huLayoutRows(), { country: 'Hungary' });
  const want = {
    'some_week1:5_1': 'smwd1', 'some_week1:5_2': 'smwd2', 'some_week1:5_3': 'smwd3',
    'some_week1:5_5': 'smwd4', 'some_week1:5_6': 'smwd5',
    'some_weekend1:5_1': 'smwda1', 'some_weekend1:5_2': 'smwda2', 'some_weekend1:5_3': 'smwda3',
    'some_weekend1:5_5': 'smwda4', 'some_weekend1:5_6': 'smwda5'
  };
  failuresOf(Object.entries(want), ([hdr, v]) => {
    const got = colVar(result, HU_LAYOUT.indexOf(hdr));
    return got === v ? null : `${hdr} -> ${got}, expected ${v}`;
  });
}

function testHungaryAiChatColumnsNotCore() {
  const result = audit(huLayoutRows(), { country: 'Hungary' });
  for (const hdr of ['some_week1:5_4', 'some_weekend1:5_4', 'county', 'sleep3']) {
    const got = colVar(result, HU_LAYOUT.indexOf(hdr));
    assert.ok(!isCore(got), `${hdr} is no core variable (got ${got})`);
  }
  const core = SurveyAuditor.cleanExportRows(huLayoutRows(), { dictionary: DICT, country: 'Hungary', coreOnly: true });
  const smwdHeaders = ['smwd1', 'smwd2', 'smwd3', 'smwd4', 'smwd5', 'smwda1', 'smwda2', 'smwda3', 'smwda4', 'smwda5']
    .map(v => canonHeader(v, 'Hungary'));
  const kept = core[0].filter(h => smwdHeaders.includes(h));
  assert.deepStrictEqual(kept, smwdHeaders, 'core-only export keeps exactly the ten social-media time columns, in order');
  assert.ok(!core[0].includes('Gondolj egy átlagos hétköznapra. Mennyi időt töltesz naponta a következő tevékenységekkel?'),
    'AI chat column dropped');
  assert.strictEqual(core[0].length, new Set(core[0]).size, 'no header twice');
}

function testNoCountryGamingColumnIsSmwd1() {
  const rows = [['some_week1:5_1', 'some_weekend1:5_1'], ['x', 'y']];
  const result = audit(rows);
  assert.strictEqual(colVar(result, 0), 'smwd1', 'some_week1:5_1 without a country');
  assert.strictEqual(colVar(result, 1), 'smwda1', 'some_weekend1:5_1 without a country');
}

function testHungaryKidscreenRestoredNames() {
  const header = range('kidscreen ', 10);
  const want = ['ksa1', 'ks1', 'ks2', 'ks3', 'ks4', 'ks5', 'ks6', 'ks7', 'ksa2', 'ks8'];
  const rows = [header, header.map(() => null)];
  const result = audit(rows, { country: 'Hungary' });
  failuresOf(header.map((h, i) => [h, want[i], i]), ([h, v, i]) => {
    const got = colVar(result, i);
    return got === v ? null : `${h} -> ${got}, expected ${v}`;
  });
}

function testHungaryKidscreenSplitNamesStillMatch() {
  const header = ['kidscreen 1 and 9_1', 'kidscreen 1 and 9_2', ...range('kidscreen 2-8 and 10_', 8)];
  const want = ['ksa1', 'ksa2', ...range('ks', 8)];
  const result = audit([header, header.map(() => null)], { country: 'Hungary' });
  failuresOf(header.map((h, i) => [h, want[i], i]), ([h, v, i]) => {
    const got = colVar(result, i);
    return got === v ? null : `${h} -> ${got}, expected ${v}`;
  });
}

function testHungaryKidscreenRestoredAnswersTranslated() {
  const out = exportHu(['kidscreen 1', 'kidscreen 2'], [['Rendkívül', 'Nagyon gyakran']]);
  assert.deepStrictEqual(out[0], [canonHeader('ksa1', 'Hungary'), canonHeader('ks1', 'Hungary')]);
  assert.deepStrictEqual(out[1], ['To a great extent', 'Very often']);
}

// ---------------------------------------------------------------------------
// Section 2: answers
// ---------------------------------------------------------------------------

function testHungaryIssueExamples() {
  const cases = [
    ['gender1', 'Nem szeretnék válaszolni', BLANK],
    ['gender1', 'Nem tudom / Nem vonatkozik rám', BLANK],
    ['grade1', 'Abbahagytam az iskolát', 'Quit school before graduating'],
    ['grade1', '10. évfolyam', '10th'],
    ['edumom1', 'Nem szeretnék válaszolni', BLANK],
    ['bage1', 'Nem szeretnék válaszolni', BLANK],
    ['bplace1', 'Albánia', 'Albania'],
    ['bmborn1', 'Ausztria', 'Austria'],
    ['bfborn1', 'Nem szeretnék válaszolni', BLANK],
    ['ladder1', 'A létra teteje', '10'],
    ['edudad1', 'Főiskolán/egyetemen diplomát szerzett', 'College or university degree']
  ];
  failuresOf(cases, ([name, label, want]) => {
    const out = exportHu([HU_COLUMNS[name]], [[label]]);
    if (out[0][0] !== canonHeader(name, 'Hungary')) return `${name}: column not matched (${out[0][0]})`;
    return out[1][0] === want ? null : `${name}: ${label} -> ${JSON.stringify(out[1][0])}, expected ${JSON.stringify(want)}`;
  });
}

function testSpainIssueExamples() {
  const cases = [
    ['edumom1', 'Grado.', "Bachelor's degree"],
    ['edudad1', 'Máster o título superior.', "Master's degree or more"],
    ['edumom1', 'Formación Profesional.', 'Vocational training'],
    ['grade1', 'Formación profesional.', 'Vocational training'],
    ['bplace1', 'Bélgica', 'Belgium'],
    ['bmborn1', 'República Checa', 'Czech Republic'],
    ['bfborn1', 'Suecia', 'Sweden'],
    ['ladder1', 'Mejor situación', '10']
  ];
  failuresOf(cases, ([name, label, want]) => {
    const out = SurveyAuditor.cleanExportRows(esSheet(ES_COLUMNS[name], [[label]]), { dictionary: DICT, country: 'Spain' });
    if (out[0][0] !== canonHeader(name, 'Spain')) return `${name}: column not matched (${out[0][0]})`;
    return out[1][0] === want ? null : `${name}: ${label} -> ${JSON.stringify(out[1][0])}, expected ${JSON.stringify(want)}`;
  });
}

function testHungaryEveryAnswerOfEveryCoreVariable() {
  assert.strictEqual(HU_BIRTH.length - HU_NON.length, 52, 'all 52 Hungarian birth countries/regions in the table');
  checkTable(HU_TABLE, HU_COLUMNS, 'Hungary', huSheet);
}

function testSpainEveryAnswerOfEveryCoreVariable() {
  checkTable(ES_TABLE, ES_COLUMNS, 'Spain', esSheet);
}

const HU_COUNTIES = ['Baranya megye', 'Bács-Kiskun megye', 'Békés megye', 'Borsod-Abaúj-Zemplén megye', 'Budapest',
  'Csongrád-Csanád megye', 'Fejér megye', 'Győr-Moson-Sopron megye', 'Hajdú-Bihar megye', 'Heves megye',
  'Jász-Nagykun-Szolnok megye', 'Komárom-Esztergom megye', 'Nógrád megye', 'Pest megye', 'Somogy megye',
  'Szabolcs-Szatmár-Bereg megye', 'Tolna megye', 'Vas megye', 'Veszprém megye', 'Zala megye'];
const ES_BEDTIMES = ['Antes de las 20:00.', '20:00 - 20:29.', '20:30 - 20:59.', '21:00 - 21:29.', '21:30 - 21:59.',
  '22:00 - 22:29.', '22:30 - 22:59.', '23:00 - 23:29.', '23:30 - 23:59.', '00:00 - 00:29.', '00:30 - 00:59.',
  '01:00 - 01:29.', '01:30 - 01:59.', '02:00 - 02:29.', '02:30 - 02:59.', 'Después de las 03:00.'];
const HU_SLEEP_FREQ = ['Soha', 'Néhányszor', 'Heti 1 nap', 'Heti 2-3 nap', 'Heti 4-5 nap', 'Heti 6-7 nap'];

function testNoStrayAliasesInDictionary() {
  const norm = s => String(s == null ? '' : s).normalize('NFKC').trim().toLowerCase();
  const stray = [['livead1', HU_COUNTIES], ['bmborn1', ES_BEDTIMES], ['bage1', HU_SLEEP_FREQ]];
  const found = [];
  for (const [name, labels] of stray) {
    const keys = new Set(labels.map(norm));
    for (const o of dictVar(name).options) {
      if (o.alias && (keys.has(norm(o.alias)) || keys.has(norm(o.label)))) found.push(`${name}: ${o.label} = ${o.value}`);
    }
  }
  assert.deepStrictEqual(found, [], 'no stray alias options');
}

function testStrayLabelsStayAsWrittenInExport() {
  const huCounty = exportHu([HU_COLUMNS.livead1], HU_COUNTIES.map(x => [x]));
  assert.deepStrictEqual(huCounty.slice(1).map(r => r[0]), HU_COUNTIES, 'county names in a livead1 column stay as written');
  const huSleep = exportHu([HU_COLUMNS.bage1], HU_SLEEP_FREQ.map(x => [x]));
  assert.deepStrictEqual(huSleep.slice(1).map(r => r[0]), HU_SLEEP_FREQ, 'sleep labels in a bage1 column stay as written');
  const es = SurveyAuditor.cleanExportRows(esSheet(ES_COLUMNS.bmborn1, ES_BEDTIMES.map(x => [x])), { dictionary: DICT, country: 'Spain' });
  assert.strictEqual(es[0][0], canonHeader('bmborn1', 'Spain'));
  assert.deepStrictEqual(es.slice(1).map(r => r[0]), ES_BEDTIMES, 'bedtimes in a bmborn1 column stay as written');
}

// ---------------------------------------------------------------------------
// Section 3: multiple-choice cells
// ---------------------------------------------------------------------------

function testCommaSeparatedSelectionsSplit() {
  const out = exportHu([HU_COLUMNS.aiuse1, HU_COLUMNS.apps1, HU_COLUMNS.livead1], [
    ['Iskolai feladatokra,Szórakozásra,Információszerzésre',
      'TikTok,AI alkalmazások (pl. ChatGPT, Gemini, Claude),Egyéb:',
      'Rokonokkal (pl. nagyszülők, nagynéni, nagybácsi),Nevelőszülőkkel']
  ]);
  assert.deepStrictEqual(out[1], [
    'For schoolwork;For entertainment;For getting information',
    'TikTok;AI (e.g., ChatGPT, Gemini, Claude);Other',
    'Relatives (e.g., grandparents, aunt, uncle);Foster parents'
  ]);
}

function testUnmappedSelectionKeptAmongOthers() {
  const out = exportHu([HU_COLUMNS.apps1, HU_COLUMNS.aiuse1], [
    ['Instagram,Valami app', 'Szórakozásra,Másra'],
    ['Foo,Bar', 'semmi,más']
  ]);
  assert.deepStrictEqual(out[1], ['Instagram;Valami app', 'For entertainment;Másra']);
  assert.deepStrictEqual(out[2], ['Foo,Bar', 'semmi,más'], 'no selection maps: cell stays as it is');
}

function testNonMultipleNotSplitOnCommas() {
  const out = exportHu([HU_COLUMNS.ai1, HU_COLUMNS.gender1, HU_COLUMNS.bmo1], [
    ['Igen,Nem', 'Fiú,Lány', 'Kigúnyoltak a vallásom miatt.,Más módon kegyetlenkedtek velem.']
  ]);
  assert.deepStrictEqual(out[1], ['Igen,Nem', 'Fiú,Lány', 'Kigúnyoltak a vallásom miatt.,Más módon kegyetlenkedtek velem.']);
}

function testSemicolonCellsAsBefore() {
  const out = exportHu([HU_COLUMNS.apps1], [['Snapchat;Egyéb'], ['TikTok;Messenger']]);
  assert.deepStrictEqual(out.slice(1).map(r => r[0]), ['Snapchat;Other', 'TikTok;Messenger']);
}

// ---------------------------------------------------------------------------
// Section 4: Hungarian non-answers are blank
// ---------------------------------------------------------------------------

function testHungarianNonAnswersBlankEveryColumn() {
  const header = ['StartDate', HU_COLUMNS.gender1, HU_COLUMNS.momprt1, 'Q99_free_text', HU_COLUMNS.bage1];
  const out = exportHu(header, [
    ['2026-01-01', 'Nem szeretnék válaszolni', 'Nem tudom', 'Nem vonatkozik rám', 'Nem tudom / Nem vonatkozik rám'],
    ['2026-01-02', '  nem SZERETNÉK válaszolni ', 'nem tudom', '  NEM TUDOM / nem vonatkozik rám', 'Nem tudom']
  ]);
  assert.deepStrictEqual(out[1], ['2026-01-01', null, null, null, null]);
  assert.deepStrictEqual(out[2], ['2026-01-02', null, null, null, null], 'case and surrounding space ignored');
  const core = exportHu(header, [['x', 'Nem tudom', 'Nem szeretnék válaszolni', 'y', 'Nem vonatkozik rám']], { coreOnly: true });
  assert.deepStrictEqual(core[1], [null, null, null], 'core-only export blanks them too');
}

function testHungarianNonAnswersBlankWhenDetected() {
  const rows = euPre('Mentor HUN', ['gender1', 'Q7'], [['Nem szeretnék válaszolni', 'Nem tudom']]);
  const out = SurveyAuditor.cleanExportRows(rows, { dictionary: DICT });
  assert.deepStrictEqual(out[1], [null, null]);
}

function testHungarianNonAnswerSelectionsDropped() {
  const out = exportHu([HU_COLUMNS.apps1, HU_COLUMNS.aiuse1], [
    ['TikTok,Messenger,Nem szeretnék válaszolni', 'Nem tudom / Nem vonatkozik rám,Nem szeretnék válaszolni'],
    ['Nem tudom;Instagram', 'Nem szeretnék válaszolni']
  ]);
  assert.deepStrictEqual(out[1], ['TikTok;Messenger', null]);
  assert.deepStrictEqual(out[2], ['Instagram', null]);
}

function testHungarianHeadersAndLongerTextKept() {
  const out = exportHu(['Nem tudom', 'Q12_TEXT'], [['x', 'Nem tudom pontosan, talán kettő'], ['y', 'Azt mondom: nem szeretnék válaszolni']]);
  assert.strictEqual(out[0][0], 'Nem tudom', 'header cell never blanked');
  assert.strictEqual(out[1][1], 'Nem tudom pontosan, talán kettő');
  assert.strictEqual(out[2][1], 'Azt mondom: nem szeretnék válaszolni');
}

function testOtherCountriesKeepHungarianNonAnswers() {
  const es = SurveyAuditor.cleanExportRows(esSheet('gender1', [['Nem szeretnék válaszolni'], ['Nem tudom']]),
    { dictionary: DICT, country: 'Spain' });
  assert.deepStrictEqual(es.slice(1).map(r => r[0]), ['Nem szeretnék válaszolni', 'Nem tudom']);
  const de = SurveyAuditor.cleanExportRows(euPre('MENTORMasterGER1', ['Notizen'], [['Nem tudom']]), { dictionary: DICT });
  assert.strictEqual(de[1][0], 'Nem tudom');
}

// ---------------------------------------------------------------------------
// Section 5 and 6: dictionary options and copies
// ---------------------------------------------------------------------------

function canonicalPairs(name) {
  return dictVar(name).options.filter(o => !o.alias)
    .map(o => [Number(o.value), o.label]).sort((a, b) => a[0] - b[0]);
}

function testNewCanonicalOptions() {
  const edu = [[0, 'Less than high school'], [1, 'High school diploma or equivalent'], [2, 'Come college, no degree'],
    [3, "Bachelor's degree"], [4, "Master's degree or more"], [5, 'College or university degree'],
    [6, 'Vocational training'], [998, "Don't know"]];
  assert.deepStrictEqual(canonicalPairs('edumom1'), edu, 'edumom1');
  assert.deepStrictEqual(canonicalPairs('edudad1'), edu, 'edudad1');
  assert.deepStrictEqual(canonicalPairs('grade1'), [[0, '8th'], [1, '9th'], [2, '10th'], [3, '11th'], [4, '12th'],
    [5, '13th'], [6, 'Graduated from school'], [7, 'Quit school before graduating'], [8, 'Vocational training']], 'grade1');
  assert.deepStrictEqual(canonicalPairs('byear1'),
    Array.from({ length: 13 }, (_, i) => [2000 + i, String(2000 + i)]), 'byear1 2000-2012');
  assert.deepStrictEqual(canonicalPairs('aiuse1'), [[1, 'For schoolwork'], [2, 'For entertainment'],
    [3, 'For social company'], [4, 'For getting information']], 'aiuse1');
}

function testByear2012WrittenAsCanonical() {
  const out = exportHu([HU_COLUMNS.byear1], [['2012']]);
  assert.strictEqual(out[1][0], '2012');
  const opt = dictVar('byear1').options.find(o => !o.alias && o.label === '2012');
  assert.ok(opt && Number(opt.value) === 2012, 'byear1 has canonical option 2012');
}

function readBundle(rel) {
  const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const m = text.match(/window\.__MASTER_DICTIONARY__\s*=\s*([\s\S]*?);?\s*$/);
  assert.ok(m, `${rel} assigns window.__MASTER_DICTIONARY__`);
  return JSON.parse(m[1]);
}

function testDictionaryCopiesAndMetadata() {
  const copies = {
    'docs/describe/vfs/data/master_dictionary.json':
      JSON.parse(fs.readFileSync(path.join(ROOT, 'docs', 'describe', 'vfs', 'data', 'master_dictionary.json'), 'utf8')),
    'src/master_dictionary_bundle.js': readBundle('src/master_dictionary_bundle.js'),
    'docs/src/master_dictionary_bundle.js': readBundle('docs/src/master_dictionary_bundle.js')
  };
  for (const [rel, copy] of Object.entries(copies)) assert.deepStrictEqual(copy, DICT, `${rel} equals data/master_dictionary.json`);
  assert.strictEqual(DICT.metadata.total_variables, DICT.variables.length, 'metadata.total_variables');
  const total = DICT.variables.reduce((n, v) => n + (v.options || []).length, 0);
  assert.strictEqual(DICT.metadata.total_options, total, 'metadata.total_options');
}

function testSiteCopiesOfCode() {
  assert.strictEqual(
    fs.readFileSync(path.join(ROOT, 'docs', 'src', 'survey_validator.js'), 'utf8'),
    fs.readFileSync(path.join(ROOT, 'src', 'survey_validator.js'), 'utf8'),
    'docs/src/survey_validator.js equals src/survey_validator.js');
  const rDir = path.join(ROOT, 'report', 'R');
  for (const f of fs.readdirSync(rDir).filter(x => x.endsWith('.R'))) {
    const copy = path.join(ROOT, 'docs', 'describe', 'vfs', 'report', 'R', f);
    assert.ok(fs.existsSync(copy), `docs/describe/vfs/report/R/${f} exists`);
    assert.strictEqual(fs.readFileSync(copy, 'utf8'), fs.readFileSync(path.join(rDir, f), 'utf8'), `${f} copy equal`);
  }
}

const TESTS = [
  testHungaryGradeColumnIsGrade1,
  testHungaryGamingColumnsAreSmwd1AndSmwda1,
  testHungaryAiChatColumnsNotCore,
  testNoCountryGamingColumnIsSmwd1,
  testHungaryKidscreenRestoredNames,
  testHungaryKidscreenSplitNamesStillMatch,
  testHungaryKidscreenRestoredAnswersTranslated,
  testHungaryIssueExamples,
  testSpainIssueExamples,
  testHungaryEveryAnswerOfEveryCoreVariable,
  testSpainEveryAnswerOfEveryCoreVariable,
  testNoStrayAliasesInDictionary,
  testStrayLabelsStayAsWrittenInExport,
  testCommaSeparatedSelectionsSplit,
  testUnmappedSelectionKeptAmongOthers,
  testNonMultipleNotSplitOnCommas,
  testSemicolonCellsAsBefore,
  testHungarianNonAnswersBlankEveryColumn,
  testHungarianNonAnswersBlankWhenDetected,
  testHungarianNonAnswerSelectionsDropped,
  testHungarianHeadersAndLongerTextKept,
  testOtherCountriesKeepHungarianNonAnswers,
  testNewCanonicalOptions,
  testByear2012WrittenAsCanonical,
  testDictionaryCopiesAndMetadata,
  testSiteCopiesOfCode
];

function runTests() {
  console.log('--- Starting issue #28 mapping tests ---');
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
    console.log(`${failed} issue #28 mapping test(s) failed.`);
    process.exit(1);
  }
  console.log('All issue #28 mapping tests passed.');
}

if (require.main === module) runTests();

