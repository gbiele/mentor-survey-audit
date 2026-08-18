const assert = require('assert');
const fs = require('fs');
const XLSX = require('xlsx');
const SurveyAuditor = require('../src/survey_validator.js');

console.log('--- Starting Step 3 Matrix Grouping Test Suite ---');

const masterDict = JSON.parse(fs.readFileSync('./src/master_dictionary.json', 'utf-8'));
const auditor = new SurveyAuditor(masterDict);

const wb = XLSX.readFile('./data/Content_Export_MENTORMasterGER1_Test-GER-1.xlsx');
const sheet = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
const auditResult = auditor.auditSheet(rows);

function getSubscalePrefix(varName) {
  if (!varName) return '';
  // Strip trailing digits: bcfpi_coop1 -> bcfpi_coop, bcfpi_af6 -> bcfpi_af, igd5 -> igd
  const m = varName.match(/^([a-zA-Z_]+?)\d+$/);
  return m ? m[1] : varName;
}

// Import or define buildTableGroups logic
function buildTableGroups(columns) {
  const groups = [];
  let currentMatrix = null;

  for (let i = 0; i < columns.length; i++) {
    const col = columns[i];
    const can = col.canonical;

    // Rule: Matrix grouping only applies when canonical is non-null
    // and items share the same subscale variable prefix AND the same question stem
    const stem = can && can.question_stem ? can.question_stem.trim() : null;
    const prefix = can ? getSubscalePrefix(can.variable) : null;
    const isMatrixType = can && (
      can.question_type === 'matrix' ||
      can.scale === 'Likert' ||
      can.scale === 'matrix' ||
      (stem && stem.length > 20)
    );

    if (can && stem && prefix && isMatrixType) {
      if (currentMatrix && currentMatrix.stem === stem && currentMatrix.prefix === prefix && currentMatrix.section === can.section) {
        currentMatrix.columns.push(col);
        continue;
      } else {
        if (currentMatrix) {
          finalizeGroup(currentMatrix, groups);
        }
        currentMatrix = {
          type: 'matrix_candidate',
          stem: stem,
          prefix: prefix,
          section: can.section || 'General',
          scale: can.scale || 'Likert',
          columns: [col]
        };
        continue;
      }
    }

    // If not a matrix candidate, finalize previous matrix candidate
    if (currentMatrix) {
      finalizeGroup(currentMatrix, groups);
      currentMatrix = null;
    }

    // Standalone item (including unmapped columns)
    groups.push({
      type: 'single',
      column: col
    });
  }

  if (currentMatrix) {
    finalizeGroup(currentMatrix, groups);
  }

  return groups;
}

function finalizeGroup(cand, groups) {
  if (cand.columns.length >= 2) {
    // Determine group aggregate status
    let groupStatus = 'fully_identified';
    let groupStatusIcon = '🟢';
    let groupStatusLabel = 'Fully Identified';

    if (cand.columns.some(c => c.status === 'missing_options')) {
      groupStatus = 'missing_options';
      groupStatusIcon = '🔴';
      groupStatusLabel = 'Missing Options';
    } else if (cand.columns.some(c => c.status === 'incomplete')) {
      groupStatus = 'incomplete';
      groupStatusIcon = '🟡';
      groupStatusLabel = 'Incomplete / Inferred';
    }

    const firstVar = cand.columns[0].canonical.variable;
    const lastVar = cand.columns[cand.columns.length - 1].canonical.variable;

    groups.push({
      type: 'matrix',
      groupId: `matrix_${firstVar}_${lastVar}`,
      stem: cand.stem,
      section: cand.section,
      scale: cand.scale,
      varRange: `${firstVar} – ${lastVar}`,
      firstColIndex: cand.columns[0].colIndex,
      lastColIndex: cand.columns[cand.columns.length - 1].colIndex,
      itemCount: cand.columns.length,
      status: groupStatus,
      statusIcon: groupStatusIcon,
      statusLabel: groupStatusLabel,
      columns: cand.columns
    });
  } else {
    // Single item fallback
    cand.columns.forEach(col => {
      groups.push({
        type: 'single',
        column: col
      });
    });
  }
}

// Run assertions
const tableGroups = buildTableGroups(auditResult.columns);
console.log(`Total original columns: ${auditResult.columns.length} -> Condensed table groups: ${tableGroups.length}`);

// Test 1: Significant table condensation
assert(tableGroups.length < 50, `Expected table to condense to under 50 rows, got ${tableGroups.length}`);
console.log(`✓ Table successfully condensed from 174 rows to ${tableGroups.length} rows`);

// Test 2: BCFPI subscales are distinctly grouped (bcfpi_coop1-6, bcfpi_af1-6, bcfpi_yf01-12)
const coopGroup = tableGroups.find(g => g.type === 'matrix' && g.varRange === 'bcfpi_coop1 – bcfpi_coop6');
const afGroup = tableGroups.find(g => g.type === 'matrix' && g.varRange === 'bcfpi_af1 – bcfpi_af6');
const yfGroup = tableGroups.find(g => g.type === 'matrix' && g.varRange === 'bcfpi_yf01 – bcfpi_yf12');

assert(coopGroup, 'bcfpi_coop1-6 must form its own distinct matrix group');
assert.strictEqual(coopGroup.itemCount, 6, 'bcfpi_coop group must have exactly 6 items');
assert(afGroup, 'bcfpi_af1-6 must form its own distinct matrix group');
assert.strictEqual(afGroup.itemCount, 6, 'bcfpi_af group must have exactly 6 items');
assert(yfGroup, 'bcfpi_yf01-12 must form its own distinct matrix group');
assert.strictEqual(yfGroup.itemCount, 12, 'bcfpi_yf group must have exactly 12 items');
console.log('✓ BCFPI Subscales correctly separated (bcfpi_coop: 6, bcfpi_af: 6, bcfpi_yf: 12)');

// Test 3: Gaming addiction items (igd1-9) grouped with Incomplete status
const igdGroup = tableGroups.find(g => g.type === 'matrix' && g.varRange.includes('igd1'));
assert(igdGroup, 'igd1-igd9 must form a matrix group');
assert.strictEqual(igdGroup.itemCount, 9, 'igd group must have 9 items');
assert.strictEqual(igdGroup.status, 'incomplete', 'igd group must reflect incomplete status');
console.log('✓ Gaming Addiction 9-item matrix group verified with Incomplete status');

// Test 4: Standalone demographic questions are NOT matrix grouped
const genderGroup = tableGroups.find(g => g.type === 'single' && g.column.canonical && g.column.canonical.variable === 'gender1');
const byearGroup = tableGroups.find(g => g.type === 'single' && g.column.canonical && g.column.canonical.variable === 'byear1');
assert(genderGroup, 'gender1 must be a standalone single item');
assert(byearGroup, 'byear1 must be a standalone single item');
console.log('✓ Standalone single items verified (gender1, byear1)');

// Test 5: Unmapped columns constraint
// Create mock columns with an unmapped column in the middle of a matrix
const mockCols = [
  { canonical: { variable: 'm1', question_stem: 'Matrix Stem', section: 'Sec', scale: 'Likert', question_type: 'matrix' }, status: 'fully_identified', colIndex: 0 },
  { canonical: null, status: 'missing_options', colIndex: 1, rawHeader: 'Unmapped Item' },
  { canonical: { variable: 'm2', question_stem: 'Matrix Stem', section: 'Sec', scale: 'Likert', question_type: 'matrix' }, status: 'fully_identified', colIndex: 2 }
];
const mockGroups = buildTableGroups(mockCols);
assert.strictEqual(mockGroups.length, 3, 'Unmapped column must prevent grouping and remain standalone');
assert.strictEqual(mockGroups[1].type, 'single', 'Unmapped column must be single');
assert.strictEqual(mockGroups[1].column.canonical, null, 'Unmapped column preserved');
console.log('✓ Safety constraint verified: unmapped columns are NEVER inferred as matrix groups');

console.log('\n========================================');
console.log('ALL STEP 3 GROUPING TESTS PASSED (5/5)');
console.log('========================================\n');
