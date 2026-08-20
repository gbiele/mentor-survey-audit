# JA-MENTOR Youth Survey Option Auditor & Validator

An interactive, browser-based auditing tool for the **JA-MENTOR youth mental health questionnaire**.

### 💡 Purpose & Core Question
In the JA-MENTOR project, surveys are implemented across multiple countries in different languages. **The core purpose of this tool is to determine whether national survey implementations can be reliably mapped into a unified, common data format** for cross-country harmonization and joint analysis.

The application comes pre-configured with the **English Master Specification (`mentor_fhi-EN.xlsx`)** as the built-in reference baseline containing all canonical response options. **Users only need to upload their single country survey data export file (`Content_Export_*.xlsx`)**—no setup or configuration required.

---

## 🎯 Project Goals

1. **Cross-Country Harmonization Check:** Verify whether country-specific survey exports and language adaptations map cleanly into the canonical common data model.
2. **Automated Option Verification:** Check if every variable in a country's survey export has an exact, known set of response options defined in the master specification.
3. **Coverage & Gap Detection:** Flag unobserved branches, missing categories, unmapped free-text strings, or translation discrepancies before data freezing and analysis.
4. **Zero-Install Client-Side Web App:** Run completely inside the web browser via Quarto HTML / WebAssembly or JavaScript—enabling researchers without Python/R environments to audit new survey export files locally and securely.
5. **Deployable on GitHub Pages:** Fully static architecture with zero backend server dependencies, allowing one-click publishing to GitHub Pages while maintaining complete data privacy (files are processed in local browser RAM, never uploaded to external servers).

---

## ✨ Key Features & User Experience

1. **📖 Clear On-Page Context & Motivation:**
   * Prominent header and explanation banner outlining the tool's purpose: evaluating whether country-specific survey exports can be harmonized into a single common data format.
2. **🚀 One-Click Demo / Sample Data Loader:**
   * Built-in *"Load Sample Data"* button to instantly test and explore the auditor using the bundled sample export without needing to find or prepare local files first.
3. **📥 One-Click Discrepancy & Issue Export (CSV / Excel):**
   * Download a dedicated audit report of flagged issues (🔴 *Missing Options*, 🟡 *Observed Only / Incomplete*, unmapped values, translation gaps) to easily share with survey programmers and national field teams.
4. **🔍 Summary Status KPI Cards & Instant Filters:**
   * Interactive overview badges at the top showing real-time counts across all validation statuses.
   * Clicking any badge immediately filters the variable table to focus on specific problem areas (e.g., viewing only missing or incomplete variables).

---

## 📁 Repository Structure

```
mentor-survey-audit/
├── data/                                 # Example survey specifications and test exports
│   ├── mentor_fhi-EN.xlsx                # Pre-loaded Master English survey instrument specification
│   └── Content_Export_MENTORMasterGER1_Test-GER-1.xlsx  # Raw plain-label EUSurvey export
│
├── reference/                            # Existing baseline scripts and generated codebooks
│   ├── build_codebook.py                 # Python codebook construction pipeline
│   ├── recode_mentor.R                   # R script generating haven::labelled datasets
│   └── output/
│       ├── codebook_variables.csv        # 229 audited variables metadata
│       ├── codebook_options.csv          # 1,148 enumerated option mappings
│       └── codebook.html                 # Interactive codebook reference
│
├── index.qmd                             # (Coming soon) Quarto source for the interactive web app
├── implementation_guidelines.md          # Step-by-step roadmap and independent verification protocol
└── README.md                             # This documentation
```

---

## 🔍 Validation Logic & Status Categorization

When a user drops or selects an export file, the auditor classifies each column into one of four statuses against the pre-loaded master specification:

| Status | Icon | Description & Harmonization Risk |
| :--- | :---: | :--- |
| **Fully Identified** | 🟢 | All canonical response options exist in the master specification and match observed responses with verified numerical codes. |
| **Observed Only / Incomplete** | 🟡 | Options are inferred solely from sample responses or parallel scale patterns. *Risk:* unobserved answer branches not selected by sample respondents risk being omitted from the canonical data model. |
| **Missing Options** | 🔴 | Variable is present in the survey export but lacks option definitions in the master specification (e.g., conditional branching follow-ups). Cannot be harmonized until options and value codes are explicitly added. |
| **Open-Ended / Continuous** | ⚪ | Free-text, date, or numeric/interval variables (e.g. birth year, MacArthur ladder) where categorical options do not apply. |

> [!IMPORTANT]
> **Flagged Issues (⚠️)** is the exact sum of **Observed Only / Incomplete (🟡)** and **Missing Options (🔴)** variables (`Issues = 🟡 Incomplete + 🔴 Missing`). These represent the actionable set of variables requiring review or specification updates before data freezing.

---

## 🚀 GitHub Pages Deployment

To host this tool publicly or within an organization on GitHub Pages:

1. Render the Quarto project:
   ```bash
   quarto render index.qmd --output-dir docs
   ```
2. Push to GitHub:
   ```bash
   git add .
   git commit -m "Build survey auditor tool"
   git push origin main
   ```
3. In GitHub repository settings:
   * Navigate to **Settings** → **Pages**
   * Under **Build and deployment**, select **Deploy from a branch** → `main` branch and `/docs` folder.

---

## 🔒 Data Privacy & GDPR Compliance

All file processing occurs **entirely within the client's web browser memory**. No survey responses, participant data, or uploaded spreadsheets are transmitted across the network or stored on GitHub servers.
