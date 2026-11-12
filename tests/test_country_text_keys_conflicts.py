"""Issue #23: a country answer key row wins over an existing alias option with
the same (normalised) label and a different value; a canonical option with the
same label and a different value is still an error.

Real case: bplace1/bmborn1/bfborn1 have the alias "Luxemburg" = 25 and the key
row "bplace1 bmborn1 bfborn1,Luxemburg,27,...". Small in-memory dictionaries
and temporary key files only.

Run: python tests/test_country_text_keys_conflicts.py [-k name]
"""

import contextlib
import copy
import csv
import importlib
import io
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

HEADER_FIELDS = ["variable", "german_header"]
ANSWER_FIELDS = ["variables", "german_label", "value", "status", "note"]


def load_module(test):
    try:
        return importlib.import_module("country_text_keys")
    except ModuleNotFoundError as err:
        test.fail(f"scripts/country_text_keys.py cannot be imported: {err}")


def opt(order, label, value, alias=""):
    return {
        "order": order, "label": label, "label_with_id": "", "alias": alias,
        "eusurvey_answer_id": "", "value": value, "scale": "nominal",
        "is_special": False, "special_type": "",
    }


def var(name, options, stem="Where were you born?"):
    return {
        "variable": name, "orig_variable": name, "group_id": name, "section": "Test",
        "question_stem": stem, "item_text": "", "scale": "nominal", "question_type": "single",
        "n_options": len(options), "multiple": False, "source": "canonical_en", "is_core": True,
        "options_complete": True, "scale_confidence": "high", "notes": "", "orig_aliases": {},
        "options": options, "keywords": [],
    }


def birth_options(alias_label="Luxemburg"):
    # Canonical 25 = Germany, 27 = Luxembourg; an older alias maps "Luxemburg" to 25.
    return [opt(0, "Germany", 25), opt(1, alias_label, 25, alias=alias_label),
            opt(2, "Luxembourg", 27)]


def make_dict():
    variables = [
        var("bplace1", birth_options()),
        # Same alias, differently written: equal after NFKC / lower case / whitespace collapse.
        var("bmborn1", birth_options(alias_label="  LUXEMBURG ")),
        # Not matched by the key row below: must stay untouched.
        var("bfborn1", birth_options()),
    ]
    total = sum(len(v["options"]) for v in variables)
    return {"metadata": {"title": "test", "total_variables": len(variables), "total_options": total},
            "variables": variables}


def write_csv(path, fields, rows):
    with open(path, "w", encoding="utf-8", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(fields)
        for r in rows:
            w.writerow(r)


def var_of(d, name):
    return next(v for v in d["variables"] if v["variable"] == name)


def norm(text):
    return " ".join(str(text).split()).lower()


def options_with_norm_label(v, label):
    return [o for o in v["options"] if norm(o.get("label", "")) == norm(label)]


ALIAS_CONFLICT_ROW = ["bplace1 bmborn1", "Luxemburg", "27", "observed", "key wins over old alias"]


class CountryTextKeysConflictTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.maps = Path(self._tmp.name)

    def tearDown(self):
        self._tmp.cleanup()

    def write(self, answers):
        write_csv(self.maps / "germany_headers.csv", HEADER_FIELDS, [])
        write_csv(self.maps / "germany_answers.csv", ANSWER_FIELDS, answers)

    def apply(self, d):
        mod = load_module(self)
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            mod.apply_country_text_keys(d, self.maps)
        return out.getvalue()

    def test_key_row_replaces_alias_with_other_value_in_each_matched_variable(self):
        self.write([ALIAS_CONFLICT_ROW])
        d = make_dict()
        printed = self.apply(d)
        for name in ("bplace1", "bmborn1"):
            v = var_of(d, name)
            hits = options_with_norm_label(v, "Luxemburg")
            self.assertEqual(len(hits), 1, f"{name}: exactly one option labelled Luxemburg")
            self.assertEqual(hits[0]["label"], "Luxemburg", f"{name}: label is the German key label")
            self.assertEqual(hits[0]["alias"], "Luxemburg", f"{name}: alias is the German key label")
            self.assertEqual(float(hits[0]["value"]), 27.0, f"{name}: new value from the key row")
            self.assertNotEqual(float(hits[0]["value"]), 25.0, f"{name}: old alias value 25 is gone")
            canon = [(o["label"], float(o["value"])) for o in v["options"] if not o.get("alias")]
            self.assertEqual(canon, [("Germany", 25.0), ("Luxembourg", 27.0)],
                             f"{name}: canonical options unchanged")
        self.assertEqual(var_of(d, "bfborn1"), make_dict()["variables"][2],
                         "a variable the row does not match is untouched")
        total = sum(len(v["options"]) for v in d["variables"])
        self.assertEqual(d["metadata"]["total_options"], total, "total_options matches the options")
        self.assertEqual(total, 9, "one alias removed and one added per matched variable")
        for token in ("bplace1", "bmborn1", "Luxemburg", "25", "27"):
            self.assertIn(token, printed, f"removal reported on stdout (missing {token!r})")

    def test_canonical_label_with_other_value_still_raises(self):
        self.write([["bplace1", "Germany", "27", "observed", "conflicts with canonical Germany = 25"]])
        with self.assertRaises(ValueError) as ctx:
            self.apply(make_dict())
        msg = str(ctx.exception)
        self.assertIn("germany_answers.csv", msg, "error names the file")
        self.assertIn("Germany", msg, "error names the row label")

    def test_apply_twice_after_alias_removal_equals_apply_once(self):
        self.write([ALIAS_CONFLICT_ROW])
        d = make_dict()
        self.apply(d)
        once = copy.deepcopy(d)
        self.apply(d)
        self.assertEqual(d, once, "second run changes nothing")

    def test_key_row_removes_other_value_aliases_when_canonical_with_key_value_exists(self):
        # Real case (bplace1): canonical Andorra = 4, shifted aliases "Andorra" = 3 and 29;
        # key row "Andorra" = 4. The row's value already exists, the other aliases must go.
        def andorra_dict():
            options = [opt(0, "Albania", 3), opt(1, "Andorra", 4), opt(2, "Moldova", 29),
                       opt(3, "Andorra", 3, alias="Andorra"),
                       opt(4, "andorra ", 29, alias="andorra ")]
            return {"metadata": {"title": "test", "total_variables": 1, "total_options": len(options)},
                    "variables": [var("bplace1", options)]}

        self.write([["bplace1", "Andorra", "4", "unobserved", ""]])
        d = andorra_dict()
        printed = self.apply(d)
        v = var_of(d, "bplace1")
        hits = options_with_norm_label(v, "Andorra")
        self.assertEqual(len(hits), 1, "exactly one option labelled Andorra")
        self.assertEqual(hits[0]["alias"], "", "the remaining Andorra option is the canonical one")
        self.assertEqual(float(hits[0]["value"]), 4.0, "Andorra has the key value 4")
        self.assertEqual([(o["label"], float(o["value"])) for o in v["options"] if not o.get("alias")],
                         [("Albania", 3.0), ("Andorra", 4.0), ("Moldova", 29.0)],
                         "canonical options unchanged")
        self.assertFalse([o for o in v["options"] if o.get("alias")], "both aliases removed")
        self.assertEqual(d["metadata"]["total_options"], len(v["options"]), "total_options matches the options")
        for token in ("bplace1", "Andorra", "3", "29", "4"):
            self.assertIn(token, printed, f"removals reported on stdout (missing {token!r})")
        self.assertGreaterEqual(printed.count("bplace1"), 2, "each removal reported on its own")
        once = copy.deepcopy(d)
        self.apply(d)
        self.assertEqual(d, once, "second run changes nothing")


if __name__ == "__main__":
    unittest.main()
