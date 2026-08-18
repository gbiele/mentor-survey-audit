#!/usr/bin/env python3
"""Independent test for Step 1: Master Specification & Dictionary Extraction."""

import csv
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DICT_FILE = ROOT / "src" / "master_dictionary.json"
VARS_CSV = ROOT / "reference" / "output" / "codebook_variables.csv"
OPTS_CSV = ROOT / "reference" / "output" / "codebook_options.csv"


class TestMasterDictionary(unittest.TestCase):

    def setUp(self):
        self.assertTrue(DICT_FILE.exists(), f"Dictionary file missing: {DICT_FILE}")
        self.assertTrue(VARS_CSV.exists(), f"Variables CSV missing: {VARS_CSV}")
        self.assertTrue(OPTS_CSV.exists(), f"Options CSV missing: {OPTS_CSV}")

        with open(DICT_FILE, encoding="utf-8") as f:
            self.data = json.load(f)

        with open(VARS_CSV, encoding="utf-8") as f:
            self.ref_vars = list(csv.DictReader(f))

        with open(OPTS_CSV, encoding="utf-8") as f:
            self.ref_opts = list(csv.DictReader(f))

    def test_variable_and_option_counts(self):
        self.assertEqual(len(self.ref_vars), 229, "Expected 229 reference variables")
        self.assertEqual(len(self.ref_opts), 1148, "Expected 1,148 reference options")

        extracted_vars = self.data["variables"]
        self.assertEqual(len(extracted_vars), 229, f"Extracted {len(extracted_vars)} variables, expected 229")

        total_extracted_options = sum(len(v["options"]) for v in extracted_vars)
        self.assertEqual(total_extracted_options, 1148, f"Extracted {total_extracted_options} options, expected 1148")

        self.assertEqual(self.data["metadata"]["total_variables"], 229)
        self.assertEqual(self.data["metadata"]["total_options"], 1148)

    def test_variable_metadata_fidelity(self):
        var_by_name = {v["variable"]: v for v in self.data["variables"]}

        opts_by_var = {}
        for opt in self.ref_opts:
            opts_by_var.setdefault(opt["variable"], []).append(opt)

        for ref_var in self.ref_vars:
            name = ref_var["variable"]
            self.assertIn(name, var_by_name, f"Missing variable in dictionary: {name}")
            entry = var_by_name[name]

            self.assertEqual(entry["orig_variable"], ref_var["orig_variable"])
            self.assertEqual(entry["group_id"], ref_var["group_id"])
            self.assertEqual(entry["section"], ref_var["section"])
            self.assertEqual(entry["scale"], ref_var["scale"])
            self.assertEqual(entry["question_type"], ref_var["question_type"])

            expected_opts = opts_by_var.get(name, [])
            self.assertEqual(len(entry["options"]), len(expected_opts), f"Option count mismatch for variable {name}")

    def test_special_codes_handling(self):
        special_found = False
        for var in self.data["variables"]:
            for opt in var["options"]:
                if opt["value"] in (997, 998, 999):
                    special_found = True
                    self.assertTrue(opt["is_special"], f"Option {opt} should be marked is_special=True")
                    self.assertIn(opt["special_type"], ["Not applicable", "Don't know", "Prefer not to answer"])
        self.assertTrue(special_found, "Special codes (997, 998, 999) must be present and flagged")

    def test_clean_and_original_indexing(self):
        by_orig = self.data["index_by_orig_variable"]
        by_clean = self.data["index_by_clean_variable"]

        self.assertIn("gender1", by_orig)
        self.assertEqual(by_orig["gender1"], "gender1")
        self.assertIn("born1", by_orig)
        self.assertEqual(by_orig["born1"], "byear1")
        self.assertIn("raia1", by_orig)
        self.assertEqual(by_orig["raia1"], "bcfpi_raia1")


if __name__ == "__main__":
    unittest.main()
