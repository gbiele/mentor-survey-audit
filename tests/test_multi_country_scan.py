#!/usr/bin/env python3
"""Automated tests for Multi-Country Subdirectory Survey Extraction & Master Dictionary Merging."""

import csv
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
DICT_FILE = DATA_DIR / "master_dictionary.json"
VARS_CSV = ROOT / "reference" / "output" / "codebook_variables.csv"
OPTS_CSV = ROOT / "reference" / "output" / "codebook_options.csv"


class TestMultiCountryScan(unittest.TestCase):
    """Test multi-country survey subdirectory discovery and codebook merging logic."""

    def test_country_subdirectories_present(self):
        """Verify that expected country subdirectories and files exist in data/."""
        self.assertTrue(DATA_DIR.exists(), f"Missing data directory: {DATA_DIR}")
        
        # Base files (or renamed canonical files)
        has_base_pair = (
            (DATA_DIR / "questions_response_options.xlsx").exists() and
            (DATA_DIR / "variables_ids.xlsx").exists()
        ) or (
            (DATA_DIR / "mentor_fhi-EN.xlsx").exists() and
            (DATA_DIR / "Content_Export_mentor_fhi_variabler_og_id.xlsx").exists()
        )
        self.assertTrue(has_base_pair, "Base survey questionnaire and variables files must exist in data/")

        # Germany subdirectory check
        ger_dir = DATA_DIR / "germany"
        if ger_dir.exists():
            self.assertTrue(
                (ger_dir / "questions_response_options.xlsx").exists(),
                f"Missing questions_response_options.xlsx in {ger_dir}"
            )
            self.assertTrue(
                (ger_dir / "variables_ids.xlsx").exists(),
                f"Missing variables_ids.xlsx in {ger_dir}"
            )

    def test_codebook_core_and_non_core_partition(self):
        """Verify that codebook_variables.csv properly tags core and non-core variables."""
        if not VARS_CSV.exists():
            self.skipTest(f"Codebook CSV not yet generated at {VARS_CSV}")

        with open(VARS_CSV, encoding="utf-8") as f:
            variables = list(csv.DictReader(f))

        core_vars = [v for v in variables if str(v.get("is_core", "")).strip().lower() in ("true", "1")]
        non_core_vars = [v for v in variables if str(v.get("is_core", "")).strip().lower() in ("false", "0")]

        # Core count must always be 143
        self.assertEqual(len(core_vars), 143, f"Expected 143 core variables, found {len(core_vars)}")
        for v in core_vars:
            source = v.get("source", "")
            self.assertIn(source, ("canonical_en", "base", "fhi", ""), f"Core variable {v['variable']} has unexpected source: {source}")

        # If country subdirectories are included (e.g. Germany), verify non-core variables
        ger_dir = DATA_DIR / "germany"
        if ger_dir.exists() and len(non_core_vars) > 0:
            for v in non_core_vars:
                self.assertFalse(str(v.get("is_core", "")).strip().lower() in ("true", "1"))
                self.assertTrue(len(v.get("source", "")) > 0, f"Non-core variable {v['variable']} must have a source tag")
                self.assertTrue(len(v.get("variable", "")) > 0, "Variable name cannot be empty")
                self.assertTrue(len(v.get("group_id", "")) > 0, f"Variable {v['variable']} must have a group_id")

        # Variable names must be unique
        var_names = [v["variable"] for v in variables]
        self.assertEqual(len(var_names), len(set(var_names)), "All variable names in codebook must be unique (no duplicates)")

    def test_master_dictionary_multi_country_structure(self):
        """Verify that master_dictionary.json has valid multi-country metadata and schema."""
        if not DICT_FILE.exists():
            self.skipTest(f"Master dictionary not yet generated at {DICT_FILE}")

        with open(DICT_FILE, encoding="utf-8") as f:
            data = json.load(f)

        meta = data.get("metadata", {})
        variables = data.get("variables", [])

        # Check metadata fields
        self.assertIn("total_variables", meta)
        self.assertIn("total_core_variables", meta)
        self.assertEqual(meta["total_core_variables"], 143, "total_core_variables must be 143")
        self.assertEqual(meta["total_variables"], len(variables))

        # Check core vs non-core partitioning in JSON
        core_vars = [v for v in variables if v.get("is_core") is True]
        non_core_vars = [v for v in variables if v.get("is_core") is False]

        self.assertEqual(len(core_vars), 143, f"Expected 143 core variables in JSON, found {len(core_vars)}")
        self.assertEqual(len(core_vars) + len(non_core_vars), len(variables), "Every variable must have is_core as boolean")

        # If sources list is present in metadata, verify it contains canonical and any country
        if "sources" in meta:
            self.assertIsInstance(meta["sources"], list)
            self.assertTrue(any("canonical" in s or "base" in s or "fhi" in s for s in meta["sources"]))
            if (DATA_DIR / "germany").exists():
                self.assertIn("germany", meta["sources"])

        # Check index integrity
        by_orig = data.get("index_by_orig_variable", {})
        by_clean = data.get("index_by_clean_variable", {})

        for v in variables:
            clean_name = v["variable"]
            self.assertIn(clean_name, by_clean, f"Missing {clean_name} in index_by_clean_variable")
            self.assertEqual(by_clean[clean_name], clean_name)
            
            orig = v.get("orig_variable")
            if orig:
                self.assertIn(orig, by_orig, f"Missing original variable {orig} in index_by_orig_variable")

        # Validate options structure for all variables
        for v in variables:
            self.assertIsInstance(v.get("options", []), list)
            for opt in v["options"]:
                self.assertIn("value", opt)
                self.assertIn("label", opt)
                self.assertIn("is_special", opt)


if __name__ == "__main__":
    unittest.main()
