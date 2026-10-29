/**
 * Held-out cases for issue 8. Same contract as tests/test_spain_alignment.js,
 * different inputs. Expected values are the contract, not the auditor's output.
 *
 * node tests/test_issue8_heldout.js [test name ...]
 */

const assert = require('assert');
const SurveyAuditor = require('../src/survey_validator.js');

function euSheet(aliasCell, headers, dataRows) {
  return [
    ['Alias', aliasCell],
    ['Export Date', '2026-10-29'],
    ['Preamble', 'drop'],
    headers,
    ...dataRows
  ];
}

function cleanedCell(header, value) {
  const cleaned = SurveyAuditor.cleanExportRows(euSheet('Spain', [header], [[value]]));
  return cleaned[1][0];
}

const tests = {
  test_germany_ks10_alias_beats_orig() {
    const dict = {
      variables: [
        {
          variable: 'A',
          orig_variable: 'ks10',
          is_core: true,
          orig_aliases: { germany: 'ks8' },
          options: []
        },
        {
          variable: 'B',
          orig_variable: 'ks8',
          is_core: true,
          orig_aliases: { germany: 'ks10' },
          options: []
        }
      ]
    };
    const hit = new SurveyAuditor(dict).matchVariable('(ks10)', 0, { country: 'germany' });
    assert.notStrictEqual(hit.canonical && hit.canonical.variable, 'A', 'ks10 must not match the orig_variable owner');
    assert.strictEqual(hit.canonical && hit.canonical.variable, 'B');
    assert.strictEqual(hit.matchType, 'country_alias');
  },

  test_alias_cell_nbsp_and_whitespace_sets_hungary() {
    const dict = {
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
          orig_aliases: { hungary: 'born2' },
          options: []
        }
      ]
    };
    const result = new SurveyAuditor(dict).auditSheet(
      euSheet('  HU\u00a0', ['Month (born2)'], [['x']])
    );
    const col = result.columns[0];
    assert.notStrictEqual(col.canonical && col.canonical.variable, 'A');
    assert.strictEqual(col.canonical && col.canonical.variable, 'B');
    assert.strictEqual(col.matchType, 'country_alias');
  },

  test_clean_other_iso_and_spaced_segments() {
    const francia = cleanedCell('Where (born3)', 'Francia (FR)');
    const apps = cleanedCell('Apps (some_apps1)', 'Snapchat. (ID555); Instagram. (ID556)');
    assert.notStrictEqual(francia, 'Francia', 'must not strip (FR)');
    assert.strictEqual(francia, 'Francia (FR)');
    assert.notStrictEqual(apps, 'Snapchat. (ID555); Instagram.');
    assert.strictEqual(apps, 'Snapchat.;Instagram.');
  },

  test_prefiero_all_caps_with_dash_and_period_maps_to_999() {
    const dict = {
      variables: [{
        variable: 'dlupa1',
        orig_variable: 'q1',
        is_core: true,
        options_complete: true,
        question_type: 'single',
        scale: 'nominal',
        options: [
          { label: 'Yes', value: 1 },
          { label: 'Other', value: 53 },
          { label: 'Prefer not to answer', value: 999 }
        ]
      }]
    };
    const label = '- PREFIERO NO RESPONDER.';
    const result = new SurveyAuditor(dict).auditSheet(euSheet('DEMO', ['Item (q1)'], [[label]]));
    const col = result.columns[0];
    const hit = (col.mappedOptions || []).find(m => m.observedLabel === label);
    const unmapped = (col.unmappedObserved || []).some(u => (u.label || u) === label);
    assert.ok(!unmapped, 'Prefiero must not stay in unmappedObserved');
    assert.ok(hit, `${JSON.stringify(label)} must map to value 999`);
    assert.notStrictEqual(hit && hit.canonicalOption.value, 53);
    assert.notStrictEqual(hit && hit.canonicalOption.value, 52);
    assert.strictEqual(hit && hit.canonicalOption.value, 999);
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
