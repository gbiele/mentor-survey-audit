/**
 * Issue 8: Spain dictionary alignment and country-alias priority.
 * Expected values are the issue contract, not the auditor's current output.
 *
 * node tests/test_spain_alignment.js [test name ...]
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const SurveyAuditor = require('../src/survey_validator.js');

const ROOT = path.resolve(__dirname, '..');
const DICT_PATH = path.join(ROOT, 'data', 'master_dictionary.json');
const SPAIN_PATH = path.join(ROOT, 'data', 'spain', 'Content_Export_Spain_2026.10.29-Spain.xlsx');
const REVIEW_PATH = path.join(ROOT, 'data', 'country_maps', 'spain_review.xlsx');

// Contract table. Not read from the dictionary.
const SPAIN_ALIASES = {
  livesp1: 'living3',
  bcfpi_coop1: 'ID260',
  bcfpi_ma1: 'ID194',
  bcfpi_af1: 'ID358',
  rpginsfy1: 'ID391',
  rpginsfy2: 'ID392',
  dlup1: 'ID405',
  cyrm01: 'ID472',
  smharm1: 'ID541',
  smharm6: 'ID5'
};

// Pre-fix Hungary aliases copied from data/master_dictionary.json.
// The contract says these stay; Spain ids above are not taken from the file.
const HUNGARY_ALIASES = {
  livesp1: 'living3',
  bcfpi_coop1: 'coop1:6_1',
  bcfpi_ma1: 'ma1:6_1',
  bcfpi_af1: 'af1:6_1',
  rpginsfy1: 'ace01',
  rpginsfy2: 'ace02',
  dlup1: 'ace03',
  cyrm01: 'cyrm1:12_1',
  smharm1: 'some_use1:6_1',
  smharm6: 'some_use1:6_6'
};

const REVIEW_WRONG = [
  ['ID5', 'livesp1'],
  ['ID198', 'bcfpi_coop1'],
  ['ID206', 'bcfpi_ma1'],
  ['ID642', 'bcfpi_af1'],
  ['ID392', 'dlup1'],
  ['ID657', 'cyrm01'],
  ['ID486', 'smharm1']
];

// header id, canonical variable, named wrong variable (or null)
const HEADER_MAP = [
  ['born2', 'bmonth1', 'bplace1'],
  ['born3', 'bplace1', 'bage1'],
  ['born4', 'bage1', 'bmborn1'],
  ['ks10', 'ksa2', 'ks8'],
  ['living3', 'livesp1', null],
  ['ID260', 'bcfpi_coop1', null],
  ['ID194', 'bcfpi_ma1', null],
  ['ID358', 'bcfpi_af1', null],
  ['ID391', 'rpginsfy1', null],
  ['ID392', 'rpginsfy2', null],
  ['ID405', 'dlup1', null],
  ['ID472', 'cyrm01', null],
  ['ID541', 'smharm1', null],
  ['ID5', 'smharm6', 'livesp1'],
  ['ID289', 'bcfpi_sa1', 'bmonth1'],
  ['ID330', 'bcfpi_sa6', 'catsev05'],
  ['ID370', 'bcfpi_yf03', 'mhl07'],
  ['ID406', 'dlup2', 'catsym06'],
  ['ID407', 'dlup3', 'catsym07'],
  ['ID418', 'dlupa1', 'catsym14'],
  ['ID419', 'dlupa2', 'catsym15'],
  ['ID291', 'fetnqact1', 'smadd5'],
  ['ID292', 'fetnqact2', 'smadd6'],
  ['ID401', 'tnqactmh1', 'catsym03'],
  ['ID403', 'tnqactmh3', 'catsym04'],
  ['ID404', 'tnqactmh4', 'catsym05'],
  ['ID416', 'tnqactmh7', 'catsym12'],
  ['ID417', 'tnqactmh8', 'catsym13'],
  ['ID430', 'tnqaomhs2', 'mhl05'],
  ['ID431', 'tnqaomhs3', 'mhl08'],
  ['ID456', 'ewcvtqaw2', 'mhl18'],
  ['ID457', 'ewcvtqaw3', 'mhl19'],
  ['ID458', 'ewcvtqaw4', 'mhl20']
];

const BCFPI_SCALE = [
  ['Nunca es cierto', 0],
  ['A veces es cierto', 1],
  ['A menudo es cierto', 2]
];
const RPG_SCALE = [
  ['Siempre', 4],
  ['La mayoría de las veces', 3],
  ['A veces', 2],
  ['Rara vez', 1],
  ['Nunca', 0]
];
const DLUP_SCALE = [
  ['Nunca', 0],
  ['Algunas veces', 2]
];
const DLUPA_SCALE = [
  ['Sí', 1],
  ['No', 0]
];
const CYRM_SCALE = [
  ['En absoluto', 0],
  ['Un poco', 1],
  ['Algo', 2],
  ['Bastante', 3],
  ['Mucho', 4]
];
const KSA_SCALE = [
  ['Nada', 0],
  ['Un poco', 1],
  ['Moderadamente', 2],
  ['Mucho', 3],
  ['Extremadamente', 4]
];
const SMHARM_SCALE = [
  ['Casi siempre', 4],
  ['A menudo', 3],
  ['A veces', 2],
  ['Rara vez', 1],
  ['Nunca', 0]
];
const BIRTH_SCALE = [
  ['España', 1],
  ['Alemania', 17],
  ['Francia', 16],
  ['Lituania', 26],
  ['Polonia', 35],
  ['Reino Unido', 46],
  ['Rumanía', 37],
  ['América del Sur o Central', 51],
  ['Otro', 53]
];
const BMO_SCALE = [
  ['Me pegaban, me daban patadas, me empujaban, me zarandeaban o me encerraban en casa.', 1],
  ['Se burlaban de mí por mi raza, nacionalidad o color de piel.', 2],
  ['Se burlaban de mí por mi religión.', 3],
  ['Se burlaban de mí con bromas, comentarios o gestos de carácter sexual.', 4],
  ['Me dejaban fuera de las actividades a propósito o me ignoraban por completo.', 5],
  ['Se burlaban de mí por mi aspecto físico o mi cara.', 6],
  ['Me acosaban de alguna otra forma.', 7]
];
const AI_SCALE = [
  ['Para tareas escolares.', 1],
  ['Para entretenimiento.', 2],
  ['Para compañía social.', 3]
];
const APPS_SCALE = [
  ['Snapchat.', 1],
  ['Instagram.', 2],
  ['Reddit.', 4],
  ['TikTok.', 5],
  ['Twitch.', 6],
  ['WhatsApp.', 9],
  ['YouTube.', 10],
  ['X/ Twitter.', 11],
  ['Pinterest.', 12],
  ['IA (por ejemplo, ChatGPT, Gemini, Claude).', 13],
  ['Servicios de streaming (por ejemplo, Netflix, Disney+).', 14]
];
const GRADE_SCALE = [
  ['2º de Bachillerato.', 4]
];
const BAGE_SCALE = [
  ['13 años', 13]
];

const PREFIERO_FORMS = [
  'Prefiero no responder',
  'Prefiero no responder.',
  '- Prefiero no responder',
  '- Prefiero no responder.',
  'pREFIERO nO rESPONDER'
];

function fold(str) {
  if (str == null) return '';
  let s = String(str).normalize('NFKC');
  s = s.replace(/[\u00a0\u2000-\u200b\u202f\u205f]/g, ' ');
  s = s.replace(/[\u2013\u2014]/g, '-');
  s = s.replace(/\s+/g, ' ').trim().toLowerCase();
  return s;
}

function birthKey(label) {
  let s = String(label == null ? '' : label).normalize('NFKC');
  s = s.replace(/[\u00a0\u2000-\u200b\u202f\u205f]/g, ' ');
  s = s.replace(/[\u2013\u2014]/g, '-');
  s = s.replace(/\s+/g, ' ').trim();
  if (s.startsWith('- ')) s = s.slice(2);
  s = s.replace(/ \([A-Za-z]{2}\)$/, '');
  return fold(s);
}

function isPrefiero(label) {
  const s = fold(label);
  return /^- prefiero no responder\.?$/.test(s) || /^prefiero no responder\.?$/.test(s);
}

function seqNames(prefix, from, to, pad) {
  const names = [];
  for (let i = from; i <= to; i++) {
    names.push(prefix + (pad ? String(i).padStart(pad, '0') : String(i)));
  }
  return names;
}

function scaleMap(pairs) {
  const map = new Map();
  for (const [label, value] of pairs) map.set(fold(label), value);
  return map;
}

function labelMaps() {
  const maps = new Map();
  const birth = scaleMap(BIRTH_SCALE);
  for (const name of ['bplace1', 'bmborn1', 'bfborn1']) maps.set(name, { kind: 'birth', map: birth });
  const groups = [
    [seqNames('bcfpi_coop', 1, 6), BCFPI_SCALE],
    [seqNames('bcfpi_ma', 1, 6), BCFPI_SCALE],
    [seqNames('bcfpi_af', 1, 6), BCFPI_SCALE],
    [['rpginsfy1', 'rpginsfy2'], RPG_SCALE],
    [['dlup1'], DLUP_SCALE],
    [seqNames('dlupa', 1, 5), DLUPA_SCALE],
    [seqNames('cyrm', 1, 12, 2), CYRM_SCALE],
    [['ksa1', 'ksa2'], KSA_SCALE],
    [seqNames('smharm', 1, 6), SMHARM_SCALE],
    [['bmo1'], BMO_SCALE],
    [['aiuse1'], AI_SCALE],
    [['apps1'], APPS_SCALE],
    [['grade1'], GRADE_SCALE],
    [['bage1'], BAGE_SCALE]
  ];
  for (const [names, pairs] of groups) {
    const map = scaleMap(pairs);
    for (const name of names) maps.set(name, { kind: 'plain', map });
  }
  return maps;
}

const LABEL_MAPS = labelMaps();

function refusalNames() {
  return [
    ...seqNames('bcfpi_coop', 1, 6),
    ...seqNames('bcfpi_ma', 1, 6),
    ...seqNames('bcfpi_af', 1, 6),
    'rpginsfy1',
    'rpginsfy2',
    'dlup1',
    ...seqNames('dlupa', 1, 5),
    ...seqNames('cyrm', 1, 12, 2),
    'ksa1',
    'ksa2',
    ...seqNames('smharm', 1, 6),
    'bplace1',
    'bmborn1',
    'bfborn1'
  ];
}

function tinyDict(extraOnB) {
  return {
    variables: [
      {
        variable: 'A',
        orig_variable: 'born2',
        is_core: true,
        orig_aliases: { spain: 'born3' },
        options: []
      },
      {
        variable: 'B',
        orig_variable: 'born3',
        is_core: true,
        orig_aliases: Object.assign({ spain: 'born2' }, extraOnB || {}),
        options: []
      },
      {
        variable: 'G',
        orig_variable: 'ID330',
        is_core: false,
        orig_aliases: {},
        options: []
      },
      {
        variable: 'C',
        orig_variable: '',
        is_core: true,
        orig_aliases: { spain: 'ID330' },
        options: []
      }
    ]
  };
}

function euSheet(aliasCell, headers, dataRows) {
  return [
    ['Alias', aliasCell],
    ['Export Date', '2026-10-29'],
    ['Preamble', 'drop'],
    headers,
    ...dataRows
  ];
}

function loadExcelRows(filePath) {
  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
}

function loadDictionary() {
  return JSON.parse(fs.readFileSync(DICT_PATH, 'utf8'));
}

function loadBundleObject(rel) {
  const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const marker = 'window.__MASTER_DICTIONARY__ = ';
  const at = text.indexOf(marker);
  assert.notStrictEqual(at, -1, rel + ' exposes window.__MASTER_DICTIONARY__');
  let body = text.slice(at + marker.length).trim();
  if (body.endsWith(';')) body = body.slice(0, -1).trim();
  return JSON.parse(body);
}

let spainAudit = null;
function getSpainAudit() {
  if (!spainAudit) {
    const auditor = new SurveyAuditor(loadDictionary());
    spainAudit = auditor.auditSheet(loadExcelRows(SPAIN_PATH));
  }
  return spainAudit;
}

function variableByName(dict, name) {
  return (dict.variables || []).find(v => v.variable === name);
}

function valuesForText(variable, text) {
  const key = fold(text);
  const values = [];
  for (const opt of variable.options || []) {
    const texts = [];
    if (opt.label) texts.push(opt.label);
    if (opt.alias) texts.push(opt.alias);
    if (texts.some(t => fold(t) === key)) values.push(opt.value);
  }
  return values;
}

function assertOnlyValue(variable, text, value, failures) {
  const unique = [...new Set(valuesForText(variable, text))];
  if (unique.length !== 1 || unique[0] !== value) {
    failures.push(
      `${variable.variable}: ${JSON.stringify(text)} expected only value ${value}, found ${unique.join(', ') || 'none'}`
    );
  }
}

function assertTextAbsent(variable, text, failures) {
  const unique = [...new Set(valuesForText(variable, text))];
  if (unique.length) {
    failures.push(`${variable.variable} must not carry ${JSON.stringify(text)} (values ${unique.join(', ')})`);
  }
}

function assertTextAbsentOnValue(variable, text, value, failures) {
  if (valuesForText(variable, text).includes(value)) {
    failures.push(`${variable.variable} must not have ${JSON.stringify(text)} on value ${value}`);
  }
}

function checkSpainAliasOwners(dict, source) {
  const failures = [];
  const idOwner = new Map();
  for (const [name, id] of Object.entries(SPAIN_ALIASES)) {
    idOwner.set(id.toLowerCase(), name);
    const variable = variableByName(dict, name);
    if (!variable) {
      failures.push(`${source} missing ${name}`);
      continue;
    }
    const spain = variable.orig_aliases && variable.orig_aliases.spain;
    if (spain !== id) {
      failures.push(`${source} ${name} orig_aliases.spain is ${JSON.stringify(spain)}, expected ${JSON.stringify(id)}`);
    }
    const hungary = variable.orig_aliases && variable.orig_aliases.hungary;
    if (hungary !== HUNGARY_ALIASES[name]) {
      failures.push(
        `${source} ${name} orig_aliases.hungary is ${JSON.stringify(hungary)}, expected ${JSON.stringify(HUNGARY_ALIASES[name])}`
      );
    }
  }
  for (const variable of dict.variables || []) {
    if (variable.is_core === false) continue;
    const spain = variable.orig_aliases && variable.orig_aliases.spain;
    if (!spain) continue;
    const owner = idOwner.get(String(spain).toLowerCase());
    if (owner && owner !== variable.variable) {
      failures.push(`${source} ${variable.variable} also keeps orig_aliases.spain ${JSON.stringify(spain)}; only ${owner} may`);
    }
  }
  assert.strictEqual(failures.length, 0, failures.join('\n'));
}

function columnByExtractedId(result, id) {
  return result.columns.find(c => fold(c.extractedId) === fold(id));
}

function mappedHit(col, label) {
  const key = fold(label);
  return (col.mappedOptions || []).find(m => fold(m.observedLabel) === key);
}

function expectedFor(variable, label) {
  const spec = LABEL_MAPS.get(variable);
  if (!spec) return null;
  const key = spec.kind === 'birth' ? birthKey(label) : fold(label);
  if (!spec.map.has(key)) return null;
  return spec.map.get(key);
}

function cleanedCell(header, value) {
  const cleaned = SurveyAuditor.cleanExportRows(euSheet('Spain', [header], [[value]]));
  return cleaned[1][0];
}

function auditOne(dict, header, labels, aliasCell) {
  const result = new SurveyAuditor(dict).auditSheet(
    euSheet(aliasCell == null ? 'DEMO' : aliasCell, [header], labels.map(label => [label]))
  );
  assert.strictEqual(result.columns.length, 1, header);
  return result.columns[0];
}

const tests = {
  test_spain_born2_country_alias_beats_orig() {
    const hit = new SurveyAuditor(tinyDict()).matchVariable('(born2)', 0, { country: 'spain' });
    assert.notStrictEqual(hit.canonical && hit.canonical.variable, 'A', 'born2 must not match the orig_variable owner');
    assert.strictEqual(hit.canonical && hit.canonical.variable, 'B');
    assert.strictEqual(hit.matchType, 'country_alias');
  },

  test_spain_id330_country_alias_beats_noncore_orig() {
    const hit = new SurveyAuditor(tinyDict()).matchVariable('(ID330)', 1, { country: 'spain' });
    assert.notStrictEqual(hit.canonical && hit.canonical.variable, 'G', 'ID330 must not match the non-core orig_variable');
    assert.strictEqual(hit.canonical && hit.canonical.variable, 'C');
    assert.strictEqual(hit.matchType, 'country_alias');
  },

  test_null_country_orig_variable_wins() {
    const auditor = new SurveyAuditor(tinyDict());
    const absent = auditor.matchVariable('(born2)', 0, {});
    const nulled = auditor.matchVariable('(born2)', 0, { country: null });
    const id330 = auditor.matchVariable('(ID330)', 1, { country: null });
    assert.strictEqual(absent.canonical && absent.canonical.variable, 'A');
    assert.strictEqual(absent.matchType, 'id_exact');
    assert.strictEqual(nulled.canonical && nulled.canonical.variable, 'A');
    assert.strictEqual(nulled.matchType, 'id_exact');
    assert.strictEqual(id330.canonical && id330.canonical.variable, 'G');
    assert.strictEqual(id330.matchType, 'id_exact');
  },

  test_country_without_alias_keeps_orig_variable() {
    const hit = new SurveyAuditor(tinyDict()).matchVariable('(born2)', 0, { country: 'hungary' });
    assert.strictEqual(hit.canonical && hit.canonical.variable, 'A');
    assert.strictEqual(hit.matchType, 'id_exact');
  },

  test_core_beats_noncore_with_same_country_alias() {
    const dict = {
      variables: [
        {
          variable: 'G',
          orig_variable: 'xx',
          is_core: false,
          orig_aliases: { spain: 'ID330' },
          options: []
        },
        {
          variable: 'C',
          orig_variable: 'yy',
          is_core: true,
          orig_aliases: { spain: 'ID330' },
          options: []
        }
      ]
    };
    const hit = new SurveyAuditor(dict).matchVariable('(ID330)', 0, { country: 'spain' });
    assert.strictEqual(hit.canonical && hit.canonical.variable, 'C');
    assert.strictEqual(hit.matchType, 'country_alias');
  },

  test_country_alias_is_case_insensitive() {
    const auditor = new SurveyAuditor(tinyDict());
    const born = auditor.matchVariable('(Born2)', 0, { country: 'spain' });
    const id = auditor.matchVariable('(id330)', 1, { country: 'spain' });
    assert.strictEqual(born.canonical && born.canonical.variable, 'B');
    assert.strictEqual(born.matchType, 'country_alias');
    assert.strictEqual(id.canonical && id.canonical.variable, 'C');
    assert.strictEqual(id.matchType, 'country_alias');
  },

  test_audit_sheet_recognized_alias_sets_country() {
    const dict = tinyDict({ hungary: 'born2', germany: 'born2' });
    const recognized = [
      'Spain',
      'españa',
      'ES',
      '  Spain  ',
      'ESPAÑA',
      'Hungary',
      'hu',
      'Germany',
      'DE',
      'deutschland'
    ];
    const failures = [];
    for (const alias of recognized) {
      const result = new SurveyAuditor(dict).auditSheet(euSheet(alias, ['Month (born2)'], [['x']]));
      const col = result.columns[0];
      const actual = col.canonical && col.canonical.variable;
      if (actual !== 'B' || col.matchType !== 'country_alias') {
        failures.push(`Alias ${JSON.stringify(alias)} mapped born2 to ${actual} (${col.matchType}), expected B country_alias`);
      }
    }
    assert.strictEqual(failures.length, 0, failures.join('\n'));
  },

  test_audit_sheet_unrecognized_alias_leaves_country_null() {
    const dict = tinyDict({ hungary: 'born2', germany: 'born2' });
    const unrecognized = [
      'mentor_fhi',
      'MENTORMasterGER1',
      'DEMO',
      '',
      'survey for spain',
      'Espana',
      'Spain\u2013'
    ];
    const failures = [];
    for (const alias of unrecognized) {
      const result = new SurveyAuditor(dict).auditSheet(euSheet(alias, ['Month (born2)'], [['x']]));
      const col = result.columns[0];
      const actual = col.canonical && col.canonical.variable;
      if (actual !== 'A' || col.matchType !== 'id_exact') {
        failures.push(`Alias ${JSON.stringify(alias)} mapped born2 to ${actual} (${col.matchType}), expected A id_exact`);
      }
    }
    assert.strictEqual(failures.length, 0, failures.join('\n'));
  },

  test_qualtrics_layout_does_not_read_country() {
    const rows = [
      ['StartDate', 'Spain', 'Where (born2)'],
      ['Start Date', 'country', 'text'],
      ['2020-01-01', 'x', 'y']
    ];
    const result = new SurveyAuditor(tinyDict()).auditSheet(rows);
    assert.strictEqual(result.summary.metadata.exportFormat, 'qualtrics');
    const col = result.columns.find(c => c.extractedId && fold(c.extractedId) === 'born2');
    assert.ok(col, 'born2 column');
    assert.strictEqual(col.canonical && col.canonical.variable, 'A');
    assert.strictEqual(col.matchType, 'id_exact');
  },

  test_spain_export_core_coverage() {
    const result = getSpainAudit();
    const cov = result.summary.coverage;
    const coreCols = result.columns.filter(c => c.canonical && c.canonical.is_core !== false);
    const counts = new Map();
    for (const col of coreCols) {
      const name = col.canonical.variable;
      counts.set(name, (counts.get(name) || 0) + 1);
    }
    const dupes = [...counts.entries()].filter(([, n]) => n > 1).map(([name]) => name).sort();
    const failures = [];
    for (const name of ['bmborn1', 'livesp1', 'ks8']) {
      if (dupes.includes(name)) failures.push(`${name} is a duplicate core assignment`);
    }
    if (dupes.length) failures.push(`duplicate core assignments: ${dupes.join(', ')}`);
    if (cov.coveredCoreCount === 118) {
      failures.push('covered core count is the pre-fix wrong answer 118');
    }
    if (cov.coveredCoreCount !== 141) failures.push(`covered core count is ${cov.coveredCoreCount}, expected 141`);
    if (coreCols.length !== 141) failures.push(`core column assignments ${coreCols.length}, expected 141`);
    if (counts.size !== 141) failures.push(`distinct core variables ${counts.size}, expected 141`);
    const missing = (cov.missingCoreVars || []).map(v => v.variable).sort();
    if (missing.join(',') !== 'consent1,ident1') {
      failures.push(`missing core variables ${JSON.stringify(missing)}, expected ["consent1","ident1"]`);
    }
    assert.strictEqual(failures.length, 0, failures.join('\n'));
  },

  test_spain_export_header_identity() {
    const result = getSpainAudit();
    const failures = [];
    for (const [id, expected, wrong] of HEADER_MAP) {
      const col = columnByExtractedId(result, id);
      if (!col) {
        failures.push(`${id} column is missing`);
        continue;
      }
      const actual = col.canonical && col.canonical.variable;
      if (wrong && actual === wrong) {
        failures.push(`${id} must not map to ${wrong}`);
      }
      if (actual !== expected) {
        failures.push(`${id} must map to ${expected}, mapped to ${actual}`);
      } else if (id !== 'living3' && col.matchType !== 'country_alias') {
        failures.push(`${id} matchType is ${col.matchType}, expected country_alias`);
      }
    }
    assert.strictEqual(failures.length, 0, failures.join('\n'));
  },

  test_dictionary_spain_aliases() {
    checkSpainAliasOwners(loadDictionary(), 'master_dictionary.json');
  },

  test_bundle_spain_aliases() {
    checkSpainAliasOwners(loadBundleObject('src/master_dictionary_bundle.js'), 'master_dictionary_bundle.js');
  },

  test_spain_review_pairs() {
    const rows = loadExcelRows(REVIEW_PATH);
    const headers = (rows[0] || []).map(h => String(h || ''));
    const idCol = headers.indexOf('country_orig_id');
    const canonCol = headers.indexOf('canonical_variable');
    assert.notStrictEqual(idCol, -1, 'country_orig_id column');
    assert.notStrictEqual(canonCol, -1, 'canonical_variable column');
    const pairs = [];
    for (let i = 1; i < rows.length; i++) {
      const id = rows[i][idCol] == null ? '' : String(rows[i][idCol]).trim();
      const canon = rows[i][canonCol] == null ? '' : String(rows[i][canonCol]).trim();
      if (id && canon) pairs.push([id, canon]);
    }
    const has = (id, canon) => pairs.some(([a, b]) => a === id && b === canon);
    const failures = [];
    for (const [id, canon] of REVIEW_WRONG) {
      if (has(id, canon)) failures.push(`review still records wrong pair ${id} → ${canon}`);
    }
    for (const [name, id] of Object.entries(SPAIN_ALIASES)) {
      if (!has(id, name)) failures.push(`review missing pair ${id} → ${name}`);
    }
    assert.strictEqual(failures.length, 0, failures.join('\n'));
  },

  test_dictionary_spanish_option_values() {
    const dict = loadDictionary();
    const failures = [];
    const groups = [
      [['bplace1', 'bmborn1', 'bfborn1'], BIRTH_SCALE],
      [seqNames('bcfpi_coop', 1, 6), BCFPI_SCALE],
      [seqNames('bcfpi_ma', 1, 6), BCFPI_SCALE],
      [seqNames('bcfpi_af', 1, 6), BCFPI_SCALE],
      [['rpginsfy1', 'rpginsfy2'], RPG_SCALE],
      [['dlup1'], DLUP_SCALE],
      [seqNames('dlupa', 1, 5), DLUPA_SCALE],
      [seqNames('cyrm', 1, 12, 2), CYRM_SCALE],
      [['ksa1', 'ksa2'], KSA_SCALE],
      [seqNames('smharm', 1, 6), SMHARM_SCALE]
    ];
    for (const [names, pairs] of groups) {
      for (const name of names) {
        const variable = variableByName(dict, name);
        if (!variable) {
          failures.push(`missing variable ${name}`);
          continue;
        }
        for (const [label, value] of pairs) assertOnlyValue(variable, label, value, failures);
      }
    }
    const grade = variableByName(dict, 'grade1');
    const bage = variableByName(dict, 'bage1');
    assertOnlyValue(grade, '2º de Bachillerato.', 4, failures);
    assertOnlyValue(grade, '2o de Bachillerato.', 4, failures);
    if (!((grade.options || []).some(opt => opt.value === 4 && (opt.label === '2o de Bachillerato.' || opt.alias === '2o de Bachillerato.')))) {
      failures.push('grade1 must keep the exact label 2o de Bachillerato. on value 4');
    }
    assertOnlyValue(grade, '12th', 4, failures);
    assertOnlyValue(bage, '13 años', 13, failures);
    assertOnlyValue(bage, '13', 13, failures);
    for (const text of ['España', 'Hungría', 'Bélgica']) assertTextAbsent(bage, text, failures);
    const bmborn = variableByName(dict, 'bmborn1');
    assertTextAbsent(bmborn, 'Antes de las 20:00.', failures);
    assertTextAbsent(bmborn, 'Después de las 03:00.', failures);
    for (const name of ['bplace1', 'bfborn1']) {
      assertTextAbsentOnValue(variableByName(dict, name), 'Prefiero no responder', 52, failures);
    }
    for (const name of ['bplace1', 'bmborn1', 'bfborn1']) {
      const variable = variableByName(dict, name);
      const espana = [...new Set(valuesForText(variable, 'España'))];
      if (espana.includes(11) || espana.includes(42)) {
        failures.push(`${name} España is on ${espana.join(', ')}; wrong answers are value 11 (Cyprus) and value 42 (Spain)`);
      }
    }
    assert.strictEqual(failures.length, 0, failures.slice(0, 30).join('\n'));
  },

  test_dictionary_has_refusal_999() {
    const dict = loadDictionary();
    const failures = [];
    for (const name of refusalNames()) {
      const variable = variableByName(dict, name);
      if (!variable) {
        failures.push(`missing ${name}`);
        continue;
      }
      const has = (variable.options || []).some(opt => opt.value === 999);
      if (!has) failures.push(`${name} has no option with value 999`);
    }
    assert.strictEqual(failures.length, 0, failures.slice(0, 30).join('\n'));
  },

  test_iso_parentheticals_preserved() {
    const es = cleanedCell('Where (born3)', '- España (ES)');
    const lt = cleanedCell('Where (born3)', 'Lituania (LT)');
    assert.notStrictEqual(es, '- España', 'must not strip (ES)');
    assert.strictEqual(es, '- España (ES)');
    assert.notStrictEqual(lt, 'Lituania', 'must not strip (LT)');
    assert.strictEqual(lt, 'Lituania (LT)');
  },

  test_trailing_id_tags_only() {
    assert.strictEqual(cleanedCell('Gender (gender1)', 'Girl (ID3)'), 'Girl');
    assert.strictEqual(cleanedCell('Gender (gender1)', 'Boy [ID4]'), 'Boy');
    assert.strictEqual(cleanedCell('City (city1)', 'Oslo {ID9}'), 'Oslo');
    assert.strictEqual(cleanedCell('Gender (gender1)', '(ID3)'), '');
    assert.strictEqual(cleanedCell('Gender (gender1)', 'Girl (ID3) extra'), 'Girl (ID3) extra');
  },

  test_semicolon_untagged_stays() {
    assert.strictEqual(cleanedCell('Notes (notes1)', 'a; b'), 'a; b');
  },

  test_semicolon_id_tags_rewritten_without_added_space() {
    const tight = cleanedCell('Apps (some_apps1)', 'Instagram. (ID556);TikTok. (ID559)');
    const spaced = cleanedCell('Apps (some_apps1)', 'Instagram. (ID556); TikTok. (ID559)');
    assert.notStrictEqual(tight, 'Instagram. (ID556);TikTok.');
    assert.strictEqual(tight, 'Instagram.;TikTok.');
    assert.notStrictEqual(spaced, 'Instagram. (ID556); TikTok.');
    assert.strictEqual(spaced, 'Instagram.;TikTok.');
  },

  test_audit_splits_only_named_multiselect_headers() {
    const cell = 'Instagram. (ID556); TikTok. (ID559)';
    const result = new SurveyAuditor({ variables: [] }).auditSheet(euSheet('DEMO', [
      'Bullied (ace23)',
      'AI (ai2)',
      'Apps (some_apps1)',
      'Grade (grade1)'
    ], [[cell, cell, cell, cell]]));
    const byId = new Map(result.columns.map(col => [fold(col.extractedId), col.observedValues.map(v => v.label)]));
    const failures = [];
    for (const id of ['ace23', 'ai2', 'some_apps1']) {
      const labels = byId.get(id) || [];
      if (labels.length === 1 && labels[0] === 'Instagram. (ID556); TikTok.') {
        failures.push(`${id} left the earlier (ID...) tag in one unsplit label`);
      }
      if (labels.join('|') !== 'Instagram.|TikTok.') {
        failures.push(`${id} observed ${JSON.stringify(labels)}, expected ["Instagram.","TikTok."]`);
      }
    }
    const grade = byId.get('grade1') || [];
    if (grade.length !== 1) failures.push(`grade1 split a semicolon into ${JSON.stringify(grade)}`);
    if (grade[0] !== 'Instagram.;TikTok.') {
      failures.push(`grade1 observed ${JSON.stringify(grade[0])}, expected one rewritten label Instagram.;TikTok.`);
    }
    assert.strictEqual(failures.length, 0, failures.join('\n'));
  },

  test_prefiero_maps_to_999() {
    const dict = {
      variables: [{
        variable: 'bcfpi_coop1',
        orig_variable: 'q1',
        is_core: true,
        options_complete: true,
        question_type: 'single',
        scale: 'ordinal',
        options: [
          { label: 'NEVER true', value: 0 },
          { label: 'Other', value: 52 },
          { label: 'Prefer not to answer', value: 999 }
        ]
      }]
    };
    const col = auditOne(dict, 'Item (q1)', PREFIERO_FORMS, 'DEMO');
    const failures = [];
    for (const form of PREFIERO_FORMS) {
      const hit = mappedHit(col, form);
      const unmapped = (col.unmappedObserved || []).some(u => fold(u.label || u) === fold(form));
      if (!hit) failures.push(`${JSON.stringify(form)} left unmapped`);
      else if (hit.canonicalOption.value !== 999) {
        failures.push(`${JSON.stringify(form)} mapped to ${hit.canonicalOption.value}, expected 999`);
      }
      if (hit && (hit.canonicalOption.value === 52 || hit.canonicalOption.value === 53)) {
        failures.push(`${JSON.stringify(form)} mapped to substantive value ${hit.canonicalOption.value}`);
      }
      if (unmapped) failures.push(`${JSON.stringify(form)} remains in unmappedObserved`);
    }
    assert.strictEqual(failures.length, 0, failures.join('\n'));
  },

  test_prefiero_not_invented_without_999() {
    const dict = {
      variables: [{
        variable: 'bcfpi_coop1',
        orig_variable: 'q1',
        is_core: true,
        options_complete: true,
        question_type: 'single',
        scale: 'ordinal',
        options: [
          { label: 'NEVER true', value: 0 },
          { label: 'Other', value: 52 }
        ]
      }]
    };
    const col = auditOne(dict, 'Item (q1)', ['Prefiero no responder'], 'DEMO');
    const unmapped = (col.unmappedObserved || []).map(u => (u && u.label) || u);
    assert.ok(unmapped.some(label => fold(label) === fold('Prefiero no responder')));
    const hit = mappedHit(col, 'Prefiero no responder');
    assert.ok(!hit || (hit.canonicalOption.value !== 52 && hit.canonicalOption.value !== 53));
  },

  test_english_special_labels_need_existing_option() {
    const withCodes = {
      variables: [{
        variable: 'q',
        orig_variable: 'q1',
        is_core: true,
        options_complete: true,
        question_type: 'single',
        scale: 'nominal',
        options: [
          { label: 'Yes', value: 1 },
          { label: 'Not applicable', value: 997 },
          { label: "Don't know", value: 998 },
          { label: 'Prefer not to answer', value: 999 }
        ]
      }]
    };
    const mapped = auditOne(
      withCodes,
      'Item (q1)',
      ['Prefer not to answer', "Don't know", 'Not applicable'],
      'DEMO'
    );
    assert.strictEqual(mappedHit(mapped, 'Prefer not to answer').canonicalOption.value, 999);
    assert.strictEqual(mappedHit(mapped, "Don't know").canonicalOption.value, 998);
    assert.strictEqual(mappedHit(mapped, 'Not applicable').canonicalOption.value, 997);

    const without = {
      variables: [{
        variable: 'q',
        orig_variable: 'q1',
        is_core: true,
        options_complete: true,
        question_type: 'single',
        scale: 'nominal',
        options: [
          { label: 'Yes', value: 1 },
          { label: 'Other', value: 52 }
        ]
      }]
    };
    const open = auditOne(
      without,
      'Item (q1)',
      ['Prefer not to answer', "Don't know", 'Not applicable'],
      'DEMO'
    );
    for (const label of ['Prefer not to answer', "Don't know", 'Not applicable']) {
      const hit = mappedHit(open, label);
      assert.ok(!hit, `${label} must stay unmapped when its special value is absent`);
      if (hit) assert.notStrictEqual(hit.canonicalOption.value, 52);
    }
  },

  test_birth_country_keeps_iso_and_maps_value_1() {
    const dict = {
      variables: [{
        variable: 'bplace1',
        orig_variable: 'born3',
        is_core: true,
        options_complete: true,
        question_type: 'single',
        scale: 'nominal',
        options: [
          { label: '[COUNTRY]', alias: 'España', value: 1 },
          { label: 'Cyprus', value: 11 },
          { label: 'Spain', value: 42 },
          { label: 'Lithuania', alias: 'Lituania', value: 26 },
          { label: 'Other', value: 53 }
        ]
      }]
    };
    const col = auditOne(dict, 'Where (born3)', [
      '- España (ES)',
      'Lituania (LT)',
      '- España',
      'España'
    ], 'DEMO');
    const failures = [];
    const expect = [
      ['- España (ES)', 1],
      ['Lituania (LT)', 26],
      ['- España', 1],
      ['España', 1]
    ];
    for (const [label, value] of expect) {
      const seen = col.observedValues.map(v => v.label);
      if (!seen.includes(label)) {
        failures.push(`observed ${JSON.stringify(seen)} missing ${JSON.stringify(label)}`);
        continue;
      }
      const hit = mappedHit(col, label);
      if (!hit) failures.push(`${JSON.stringify(label)} unmapped`);
      else if (hit.canonicalOption.value !== value) {
        failures.push(`${JSON.stringify(label)} mapped to ${hit.canonicalOption.value}, expected ${value}`);
      }
      if (hit && (hit.canonicalOption.value === 11 || hit.canonicalOption.value === 42)) {
        failures.push(`${JSON.stringify(label)} mapped to Cyprus (11) or Spain code (42)`);
      }
    }
    assert.strictEqual(failures.length, 0, failures.join('\n'));
  },

  test_other_variables_do_not_strip_iso() {
    const dict = {
      variables: [{
        variable: 'livesp1',
        orig_variable: 'living3',
        is_core: true,
        options_complete: true,
        question_type: 'single',
        scale: 'nominal',
        options: [
          { label: 'Lituania', value: 26 },
          { label: 'España', value: 1 }
        ]
      }]
    };
    const col = auditOne(dict, 'Live (living3)', ['Lituania (LT)'], 'DEMO');
    const labels = col.observedValues.map(v => v.label);
    assert.ok(labels.includes('Lituania (LT)'), `livesp1 observed ${JSON.stringify(labels)}`);
    assert.notStrictEqual(labels[0], 'Lituania');
    const hit = mappedHit(col, 'Lituania (LT)');
    assert.ok(!hit, 'Lituania (LT) must stay unmapped on a non-birth variable');
  },

  test_spain_export_observed_labels_map() {
    const result = getSpainAudit();
    const failures = [];
    const show = [
      ['bplace1', '- España (ES)', 1],
      ['bplace1', 'Lituania (LT)', 26],
      ['grade1', '2º de Bachillerato.', 4],
      ['bage1', '13 años', 13],
      ['bmo1', BMO_SCALE[0][0], 1],
      ['aiuse1', 'Para tareas escolares.', 1],
      ['apps1', 'Instagram.', 2]
    ];
    for (const [name, label, value] of show) {
      const cols = result.columns.filter(c => c.canonical && c.canonical.variable === name);
      if (cols.length !== 1) {
        failures.push(`${name} has ${cols.length} columns, expected 1, so ${JSON.stringify(label)} cannot map to ${value}`);
        continue;
      }
      const seen = cols[0].observedValues.map(v => v.label);
      // auditSheet matches on normKey (NFKC), so masculine ordinal º folds to o.
      if (!seen.some(s => fold(s) === fold(label))) {
        failures.push(`${name} must observe ${JSON.stringify(label)}; saw ${seen.slice(0, 6).map(s => JSON.stringify(s)).join(', ')}`);
        continue;
      }
      const hit = mappedHit(cols[0], label);
      if (!hit) failures.push(`${name} left ${JSON.stringify(label)} unmapped`);
      else if (hit.canonicalOption.value !== value) {
        failures.push(`${name} ${JSON.stringify(label)} mapped to ${hit.canonicalOption.value}, expected ${value}`);
      }
      if (hit && label.indexOf('España') !== -1 && (hit.canonicalOption.value === 11 || hit.canonicalOption.value === 42)) {
        failures.push(`${name} España mapped to ${hit.canonicalOption.value}; wrong answers are 11 and 42`);
      }
    }
    for (const [name, spec] of LABEL_MAPS) {
      const cols = result.columns.filter(c => c.canonical && c.canonical.variable === name);
      if (cols.length !== 1) {
        failures.push(`${name} column count ${cols.length}`);
        continue;
      }
      const col = cols[0];
      for (const obs of col.observedValues) {
        const label = obs.label;
        if (name === 'bage1' && fold(label) === '19') continue;
        if (isPrefiero(label)) {
          const hit = mappedHit(col, label);
          if (!hit) failures.push(`${name} left Prefiero unmapped: ${JSON.stringify(label)}`);
          else if (hit.canonicalOption.value !== 999) {
            failures.push(`${name} Prefiero mapped to ${hit.canonicalOption.value}, expected 999`);
          }
          if (hit && (hit.canonicalOption.value === 52 || hit.canonicalOption.value === 53)) {
            failures.push(`${name} Prefiero mapped to substantive value ${hit.canonicalOption.value}`);
          }
          continue;
        }
        const expected = expectedFor(name, label);
        if (expected == null) {
          const unmapped = (col.unmappedObserved || []).some(u => fold((u && u.label) || u) === fold(label));
          if (unmapped) failures.push(`${name} left ${JSON.stringify(label)} unmapped`);
          continue;
        }
        const hit = mappedHit(col, label);
        if (!hit) failures.push(`${name} left ${JSON.stringify(label)} unmapped, expected ${expected}`);
        else if (hit.canonicalOption.value !== expected) {
          failures.push(`${name} ${JSON.stringify(label)} mapped to ${hit.canonicalOption.value}, expected ${expected}`);
        }
        if (spec.kind === 'birth' && birthKey(label) === 'españa' && hit && (hit.canonicalOption.value === 11 || hit.canonicalOption.value === 42)) {
          failures.push(`${name} España mapped to ${hit.canonicalOption.value}`);
        }
      }
    }
    assert.strictEqual(failures.length, 0, failures.slice(0, 25).join('\n'));
  },

  test_docs_sources_match_src() {
    for (const name of ['survey_validator.js', 'master_dictionary_bundle.js']) {
      const src = fs.readFileSync(path.join(ROOT, 'src', name));
      const docs = fs.readFileSync(path.join(ROOT, 'docs', 'src', name));
      assert.ok(src.equals(docs), `${name} docs copy drifted from src`);
    }
  }
};

function run() {
  const names = process.argv.slice(2);
  const selected = names.length ? names : Object.keys(tests);
  let failed = 0;
  for (const name of selected) {
    if (typeof tests[name] !== 'function') {
      failed++;
      console.error('Unknown test: ' + name);
      continue;
    }
    try {
      tests[name]();
      console.log('✓ ' + name);
    } catch (err) {
      failed++;
      console.error('✗ ' + name);
      console.error(err && err.stack ? err.stack : err);
    }
  }
  if (failed) process.exit(1);
}

run();
