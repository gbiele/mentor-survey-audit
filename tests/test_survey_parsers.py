#!/usr/bin/env python3
"""Tests for Qualtrics export parsing."""

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCRIPTS = ROOT / "scripts"
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

from survey_parsers import (  # noqa: E402
    is_qualtrics_export,
    merge_qualtrics_variable_files,
    parse_qualtrics_headers,
)

HU_DIR = ROOT / "data" / "hungary"
GER_V = ROOT / "data" / "germany" / "variables_ids.xlsx"


class TestSurveyParsers(unittest.TestCase):
    @unittest.skipUnless(HU_DIR.exists(), "Hungary data not present")
    def test_hungary_files_are_qualtrics(self):
        self.assertTrue(is_qualtrics_export(HU_DIR / "variables_ids_a.xlsx"))
        self.assertTrue(is_qualtrics_export(HU_DIR / "variables_ids_b.xlsx"))

    @unittest.skipUnless(GER_V.exists(), "Germany variables file missing")
    def test_germany_is_not_qualtrics(self):
        self.assertFalse(is_qualtrics_export(GER_V))

    @unittest.skipUnless(HU_DIR.exists(), "Hungary data not present")
    def test_union_a_and_b_includes_b_only_column(self):
        merged = merge_qualtrics_variable_files(
            [
                HU_DIR / "variables_ids_a.xlsx",
                HU_DIR / "variables_ids_b.xlsx",
            ]
        )
        vids = {v.vid for v in merged}
        self.assertIn("grade1", vids)
        self.assertIn("schooltype_1_TEXT", vids)
        self.assertIn("gender1", vids)
        self.assertGreater(len(vids), len(parse_qualtrics_headers(HU_DIR / "variables_ids_b.xlsx")))

    @unittest.skipUnless(HU_DIR.exists(), "Hungary data not present")
    def test_matrix_id_parsed(self):
        merged = merge_qualtrics_variable_files([HU_DIR / "variables_ids_a.xlsx"])
        raia = next(v for v in merged if v.vid == "raia1:6_1")
        self.assertTrue(raia.is_mx)
        self.assertIn(" - ", raia.header)
        self.assertTrue(len(raia.item) > 10)


if __name__ == "__main__":
    unittest.main()
