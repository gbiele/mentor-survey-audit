// Writes data/<folder>/scrambled_cleaned_data.xlsx from data/<folder>/scrambled_raw_data.xlsx
// with the code behind "Export cleaned data (core questions)" on the auditor site.
// Usage: node scripts/make_scrambled_cleaned_data.js [folder ...]
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const SurveyAuditor = require('../src/survey_validator.js');

const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
// The dictionary bundle the auditor site loads, so the output matches the site's export.
const bundle = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'src', 'master_dictionary_bundle.js'), 'utf-8'), bundle);
const dictionary = bundle.window.__MASTER_DICTIONARY__;

// Survey country per data folder. Romania is not detected from its file.
const COUNTRY = { Cyprus: 'Cyprus', germany: 'Germany', Romania: 'Romania', spain: 'Spain', NO: 'Norway' };
// NO is left out until the real Norwegian raw export replaces its placeholder.
const DEFAULT_FOLDERS = ['Cyprus', 'germany', 'Romania', 'spain'];

for (const folder of process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_FOLDERS) {
  const input = path.join(ROOT, 'data', folder, 'scrambled_raw_data.xlsx');
  const output = path.join(ROOT, 'data', folder, 'scrambled_cleaned_data.xlsx');
  const country = COUNTRY[folder];
  if (!country) { console.error(`${folder}: no country configured`); process.exitCode = 1; continue; }
  if (!fs.existsSync(input)) { console.error(`${folder}: ${input} not found`); process.exitCode = 1; continue; }

  const book = XLSX.readFile(input);
  const rows = XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], { header: 1, defval: null });
  const cleaned = SurveyAuditor.cleanExportRows(rows, { dictionary, country, coreOnly: true });

  const out = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(out, XLSX.utils.aoa_to_sheet(cleaned), 'Cleaned');
  XLSX.writeFile(out, output);
  console.log(`${folder}: ${country}, ${cleaned.length - 1} respondents x ${cleaned[0].length} core columns -> ${path.relative(ROOT, output)}`);
}
