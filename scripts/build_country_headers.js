#!/usr/bin/env node
/**
 * Build data/country_maps/<country>_headers.csv from two exports of the same
 * questionnaire: one in English with ID tags, one in the country language.
 *
 * Usage: node scripts/build_country_headers.js <tagged.xlsx> <untagged.xlsx> <out.csv>
 *
 * The tagged export is audited to name the variable of each column; its columns
 * pair by position with the header row of the untagged export (EU Survey layout).
 * Matrix-title columns (ID tags in MATRIX_TITLE_VARS of src/survey_validator.js)
 * are not in the untagged export and are dropped.
 */

const fs = require('fs');
const XLSX = require('xlsx');
const SurveyAuditor = require('../src/survey_validator.js');
const dictionary = require('../data/master_dictionary.json');

const MATRIX_TITLE_VARS = new Set(['ID426']); // as in src/survey_validator.js

function fail(message) {
  console.error(message);
  process.exit(1);
}

function readRows(file) {
  const book = XLSX.readFile(file);
  return XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], { header: 1, defval: null });
}

function csvCell(text) {
  return `"${String(text).replace(/"/g, '""')}"`;
}

const [taggedFile, untaggedFile, outFile] = process.argv.slice(2);
if (!taggedFile || !untaggedFile || !outFile) {
  fail('Usage: node scripts/build_country_headers.js <tagged.xlsx> <untagged.xlsx> <out.csv>');
}

const audit = new SurveyAuditor(dictionary).auditSheet(readRows(taggedFile));
const tagged = audit.columns.filter(col => !MATRIX_TITLE_VARS.has(col.extractedId));
const missing = tagged.filter(col => !(col.canonical && col.canonical.variable));
if (missing.length) {
  fail(`Tagged columns without a variable: ${missing.map(c => c.rawHeader).join(' | ')}`);
}

const untaggedRows = readRows(untaggedFile);
const untaggedRow = untaggedRows[SurveyAuditor.detectExportLayout(untaggedRows).headerRowIndex] || [];
let last = untaggedRow.length;
while (last > 0 && (untaggedRow[last - 1] == null || untaggedRow[last - 1] === '')) last--;
const untagged = untaggedRow.slice(0, last);
if (untagged.length !== tagged.length) {
  fail(`Column counts differ: ${tagged.length} tagged (without matrix titles), ${untagged.length} untagged.`);
}

const lines = ['variable,german_header'];
tagged.forEach((col, i) => lines.push(`${csvCell(col.canonical.variable)},${csvCell(untagged[i])}`));
fs.writeFileSync(outFile, lines.join('\n') + '\n', 'utf8');
console.log(`Wrote ${tagged.length} rows to ${outFile}`);
