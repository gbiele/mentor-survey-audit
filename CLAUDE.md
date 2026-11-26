# CLAUDE.md

## Testing the analysis pipeline

Test the analysis pipeline (auditor at `index.qmd`, cleaning in `src/survey_validator.js`, and the results report in `describe/`) with the `scrambled_raw_data.xlsx` files in the country folders:

- `data/Cyprus/scrambled_raw_data.xlsx`
- `data/germany/scrambled_raw_data.xlsx`
- `data/Romania/scrambled_raw_data.xlsx`
- `data/spain/scrambled_raw_data.xlsx`

These files are already scrambled (each column is shuffled independently), so they are only good for testing that the pipeline runs, not for analysis. Do not scramble anything again. The data folders are gitignored (`data/*`), so the files exist only locally.

From each `scrambled_raw_data.xlsx`, produce `data/<country>/scrambled_cleaned_data.xlsx` with the core items only. Use the same code as the auditor site (https://gbiele.github.io/mentor-survey-audit/): `SurveyAuditor.cleanExportRows(rows, { dictionary, country, coreOnly: true })` in `src/survey_validator.js`, i.e. the **Export cleaned data (core questions)** output. Then use `scrambled_cleaned_data.xlsx` to test that the processes on the describe page (https://gbiele.github.io/mentor-survey-audit/describe/) work.
