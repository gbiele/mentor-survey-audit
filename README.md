# JA-MENTOR Youth Survey Option Auditor & Validator

An interactive, client-side quality assurance and harmonization tool for the **JA-MENTOR Youth Mental Health Survey**.

**Live Application:** [https://gbiele.github.io/mentor-survey-audit/](https://gbiele.github.io/mentor-survey-audit/)

---

## Harmonization Objective

In the **JA-MENTOR** project, youth mental health surveys are fielded across multiple European partner countries in different languages and regional adaptations. 

The primary objective of this auditor is to evaluate whether national survey implementations can be reliably mapped into a unified common data format prior to data freezing and joint epidemiological analysis.

The application comes pre-configured with the authoritative **Core Master Survey Dictionary (143 standardized variables)**. Researchers and data managers simply drag-and-drop their national EU Survey export file (`.xlsx`) to perform an immediate, comprehensive audit.

---

## Key Capabilities

1. **Survey Coverage & Completeness Summary**:
   - **Core Survey Coverage**: Real-time calculation of the percentage and number of standard core questions fielded.
   - **Missing Scales Breakdown**: Aggregates missing items into clear scale and sub-scale blocks (e.g., *Adverse Childhood Experiences*, *Social Media Negative Impacts*, *Quality of Life*) with exact variable ranges and item counts.
   - **Extra / Country-Specific Scales**: Identifies and groups national additions and unmapped survey modules (e.g., *CATS Trauma*, *PTSD Symptoms*, *Addiction Scales*).

2. **Categorization & Issue Detection**:
   - **Fully Identified**: Canonical response options fully defined and verified against observed codes.
   - **Incomplete / Inferred Options**: Options inferred from sample responses or parallel scales, highlighting unobserved categories.
   - **Missing Options**: Variables lacking canonical option definitions in the master specification.
   - **Open-Ended**: Free-text fields where discrete categorical options do not apply.
   - **Flagged Issues**: Immediate sum of all problematic variables requiring programmer review.

3. **Multi-Item Matrix Scale Condensation**:
   - Multi-item battery questions (e.g., *BCFPI Mental Health*, *CYRM Resilience*, *KIDSCREEN Quality of Life*) automatically condense into single summary rows, reducing table clutter while supporting drill-down inspection.

4. **Response Distribution & Missing Data Auditing**:
   - Interactive item modal displays canonical recodes, observed response frequencies, and exact levels of item non-response / skipped questions.

5. **Discrepancy Export (CSV)**:
   - Export an actionable spreadsheet of all flagged variables and harmonization discrepancies to share directly with survey programmers and field teams.

---

## Data Privacy & Security

- **Strictly Client-Side Execution**: All spreadsheet parsing, validation logic, and frequency calculations run entirely inside the web browser's local memory (RAM).
- **No External Servers**: Survey responses, participant data, and uploaded files are never uploaded to external servers or transmitted across the network.

---

## Quick Start & Local Development

### Using the Live Application
Visit [https://gbiele.github.io/mentor-survey-audit/](https://gbiele.github.io/mentor-survey-audit/) and:
- Drag-and-drop your country survey export file (`.xlsx`, `.xls`), or
- Click **"Load sample data"** to explore the auditor with pre-loaded demo data.

### Running Locally

Clone the repository and preview with [Quarto](https://quarto.org/):

```bash
# Clone the repository
git clone https://github.com/gbiele/mentor-survey-audit.git
cd mentor-survey-audit

# Start local live preview server
quarto preview index.qmd --port 4200
```

Open your browser at `http://localhost:4200/index.html`.

### Running Automated Tests

```bash
# Test Master Dictionary fidelity & is_core tagging
python tests/test_step1_dictionary.py

# Test Client-side Validation Engine & Coverage Math
node tests/test_step2_engine.js

# Test Matrix Grouping & Table Condensation
node tests/test_step3_grouping.js
```

---

## Architecture & Technology Stack

- **Frontend**: Vanilla JavaScript (ES6+), HTML5, CSS3 with custom JA-MENTOR theme.
- **Spreadsheet Parsing**: [SheetJS (xlsx)](https://sheetjs.com/) for high-speed client-side workbook decoding.
- **Site Generation**: [Quarto](https://quarto.org/) static site compilation (`docs/` deployment target for GitHub Pages).
- **Automated Testing**: Python `unittest` & Node.js test suites.

---

## License & Attribution

Developed for the **JA-MENTOR (Joint Action on Mental Health)** Consortium.
