"""Issue #23: scripts/country_text_keys.py applies the country text keys
(<country>_headers.csv, <country>_answers.csv) to the master dictionary.

Small in-memory dictionaries and temporary key files only. Expected values
follow the issue #23 contract, section 6.

Run: python tests/test_country_text_keys.py [-k name]
"""

import copy
import csv
import importlib
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

HEADER_FIELDS = ["variable", "german_header"]
ANSWER_FIELDS = ["variables", "german_label", "value", "status", "note"]

LIVE_TEXT = "Was beschreibt deine Situation am besten, wenn du an die Personen denkst, mit denen du lebst?"


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


def var(name, options, stem="Question"):
    return {
        "variable": name, "orig_variable": name, "group_id": name, "section": "Test",
        "question_stem": stem, "item_text": "", "scale": "nominal", "question_type": "single",
        "n_options": len(options), "multiple": False, "source": "canonical_en", "is_core": True,
        "options_complete": True, "scale_confidence": "high", "notes": "", "orig_aliases": {},
        "options": options, "keywords": [],
    }


def make_dict():
    variables = [
        var("gender1", [opt(0, "Boy", 1), opt(1, "Girl", 2), opt(2, "Chica.", 2, alias="Chica."),
                        opt(3, "Otro género.", 3, alias="Otro género.")]),
        var("live1", [opt(0, "I live with both my parents together", 1)]),
        var("livead1", [opt(0, "Relatives", 1)]),
        var("ks1", [opt(0, "Never", 0), opt(1, "Quite often", 2)]),
        var("ks10", [opt(0, "Never", 0), opt(1, "Quite often", 2)]),
        var("ksa1", [opt(0, "Not at all", 0), opt(1, "Quite", 2)]),
        var("mhl01", [opt(0, "very difficult", 0), opt(1, "Eher  Schwierig", 1)]),
        var("edumom1", [opt(0, "Less than high school", 0), opt(1, "High school diploma or equivalent", 1)]),
        var("edudad1", [opt(0, "Less than high school", 0), opt(1, "High school diploma or equivalent", 1)]),
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


GOOD_HEADERS = [
    ["gender1", "Mit welchem Geschlecht identifizierst Du Dich?"],
    ["live1", LIVE_TEXT],
    ["livead1", LIVE_TEXT],
]

GOOD_ANSWERS = [
    ["gender1", "Junge", "1", "observed", ""],
    ["gender1", "Mädchen", "2", "observed", ""],
    ["ks*", "manchmal", "2", "observed", "Quite often (by position)"],
    ["mhl*", "eher schwierig", "1", "observed", "already the canonical label"],
    ["edumom1 edudad1", "Fachhochschulreife; Abitur/Allgemeine Hochschulreife", "1", "observed", "semicolon"],
]


def var_of(d, name):
    return next(v for v in d["variables"] if v["variable"] == name)


def options_with_label(v, label):
    return [o for o in v["options"] if o.get("label") == label]


class CountryTextKeysTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.maps = Path(self._tmp.name)

    def tearDown(self):
        self._tmp.cleanup()

    def write(self, headers=GOOD_HEADERS, answers=GOOD_ANSWERS):
        write_csv(self.maps / "germany_headers.csv", HEADER_FIELDS, headers)
        write_csv(self.maps / "germany_answers.csv", ANSWER_FIELDS, answers)

    def apply(self, d):
        mod = load_module(self)
        return mod.apply_country_text_keys(d, self.maps)

    # -- headers --------------------------------------------------------

    def test_header_aliases_added_and_same_dict_returned(self):
        self.write()
        d = make_dict()
        out = self.apply(d)
        self.assertIs(out, d, "returns the same dict, changed in place")
        self.assertEqual(var_of(d, "gender1")["header_aliases"]["germany"],
                         ["Mit welchem Geschlecht identifizierst Du Dich?"])
        self.assertEqual(var_of(d, "live1")["header_aliases"]["germany"], [LIVE_TEXT])
        self.assertEqual(var_of(d, "livead1")["header_aliases"]["germany"], [LIVE_TEXT],
                         "a shared German header goes to both variables")
        self.assertEqual(var_of(d, "gender1")["orig_aliases"], {}, "orig_aliases not changed")

    # -- answers --------------------------------------------------------

    def test_answer_options_added_with_alias_label_value(self):
        self.write()
        d = make_dict()
        self.apply(d)
        g = var_of(d, "gender1")
        for label, value in (("Junge", 1), ("Mädchen", 2)):
            hits = options_with_label(g, label)
            self.assertEqual(len(hits), 1, f"one option {label}")
            self.assertEqual(hits[0]["alias"], label)
            self.assertEqual(str(hits[0]["value"]), str(value))

    def test_semicolon_label_is_one_option_for_each_listed_variable(self):
        self.write()
        d = make_dict()
        self.apply(d)
        label = "Fachhochschulreife; Abitur/Allgemeine Hochschulreife"
        for name in ("edumom1", "edudad1"):
            v = var_of(d, name)
            hits = options_with_label(v, label)
            self.assertEqual(len(hits), 1, f"{name}: semicolon label added once, whole")
            self.assertEqual(hits[0]["alias"], label)
            self.assertEqual(str(hits[0]["value"]), "1")
            self.assertFalse(options_with_label(v, "Fachhochschulreife"), f"{name}: label not split")

    def test_label_already_canonical_for_value_not_added(self):
        self.write()
        d = make_dict()
        self.apply(d)
        mhl = var_of(d, "mhl01")
        self.assertEqual(len(mhl["options"]), 2,
                         "eher schwierig = 1 equals the existing label 'Eher  Schwierig' after NFKC/case/space normalisation")

    def test_star_matches_digits_only(self):
        self.write()
        d = make_dict()
        self.apply(d)
        for name in ("ks1", "ks10"):
            hits = options_with_label(var_of(d, name), "manchmal")
            self.assertEqual(len(hits), 1, f"ks* matches {name}")
            self.assertEqual(str(hits[0]["value"]), "2")
        ksa = var_of(d, "ksa1")
        self.assertFalse(options_with_label(ksa, "manchmal"), "ks* must not match ksa1")
        self.assertEqual(len(ksa["options"]), 2, "ksa1 options unchanged")

    def test_total_options_metadata_counts_added_options(self):
        self.write()
        d = make_dict()
        before = d["metadata"]["total_options"]
        self.apply(d)
        total = sum(len(v["options"]) for v in d["variables"])
        self.assertEqual(d["metadata"]["total_options"], total)
        # Added: gender1 x2, ks1, ks10, edumom1, edudad1 = 6 (mhl01 already has the label).
        self.assertEqual(total, before + 6)

    def test_apply_twice_equals_apply_once(self):
        self.write()
        d = make_dict()
        self.apply(d)
        once = copy.deepcopy(d)
        self.apply(d)
        self.assertEqual(d, once, "no duplicate aliases on a second run")

    # -- errors ---------------------------------------------------------

    def assert_value_error(self, headers, answers, file_name, token):
        self.write(headers, answers)
        with self.assertRaises(ValueError) as ctx:
            self.apply(make_dict())
        msg = str(ctx.exception)
        self.assertIn(file_name, msg, "error names the file")
        self.assertIn(token, msg, "error names the row")

    def test_error_header_variable_not_in_dictionary(self):
        self.assert_value_error(GOOD_HEADERS + [["nosuch1", "Gibt es nicht?"]], GOOD_ANSWERS,
                                "germany_headers.csv", "nosuch1")

    def test_error_answer_pattern_matches_no_variable(self):
        self.assert_value_error(GOOD_HEADERS, GOOD_ANSWERS + [["zz*", "ja", "1", "observed", ""]],
                                "germany_answers.csv", "zz*")

    def test_error_value_not_a_canonical_option_value(self):
        self.assert_value_error(GOOD_HEADERS, GOOD_ANSWERS + [["gender1", "Divers", "7", "observed", ""]],
                                "germany_answers.csv", "Divers")

    def test_error_value_only_on_alias_option(self):
        # gender1 value 3 exists only as an alias option ("Otro género."), not a canonical one.
        self.assert_value_error(GOOD_HEADERS,
                                GOOD_ANSWERS + [["gender1", "Andere Geschlechtsidentität", "3", "observed", ""]],
                                "germany_answers.csv", "Andere Geschlechtsidentität")

    def test_error_label_maps_to_two_values_in_one_variable(self):
        self.assert_value_error(GOOD_HEADERS, GOOD_ANSWERS + [["gender1", "Mädchen", "1", "observed", ""]],
                                "germany_answers.csv", "Mädchen")

    # -- wiring ---------------------------------------------------------

    def test_extract_dictionary_calls_apply_country_text_keys(self):
        source = (ROOT / "scripts" / "extract_dictionary.py").read_text(encoding="utf-8")
        self.assertIn("country_text_keys", source, "extract_dictionary.py imports country_text_keys")
        self.assertIn("apply_country_text_keys(", source, "extract_dictionary.py calls apply_country_text_keys")


LADDER_EXCEPTIONS = {("ladder1", "Bottom of the ladder"), ("ladder1", "Top of the ladder")}

# Issue #28, section 5: canonical options that the questionnaire-derived
# codebook does not contain (variable, label, value).
NEW_CANONICAL = [
    ("edumom1", "College or university degree", 5), ("edumom1", "Vocational training", 6),
    ("edudad1", "College or university degree", 5), ("edudad1", "Vocational training", 6),
    ("grade1", "Vocational training", 8), ("byear1", "2012", 2012), ("aiuse1", "For getting information", 4),
]


def committed_dictionary():
    import json
    return json.loads((ROOT / "data" / "master_dictionary.json").read_text(encoding="utf-8"))


def core_option_set(d):
    out = set()
    for v in d["variables"]:
        if v.get("is_core") is not True:
            continue
        for o in v.get("options") or []:
            out.add((v["variable"], o.get("label"), float(o["value"])))
    return out


def strip_core_aliases(d, drop_new_canonical=False):
    """Copy of d without the alias options of core variables (except the two
    English ladder end labels); optionally without the issue #28 canonical additions."""
    d = copy.deepcopy(d)
    drop = {(n, lab, float(val)) for n, lab, val in NEW_CANONICAL} if drop_new_canonical else set()
    for v in d["variables"]:
        if v.get("is_core") is not True:
            continue
        kept = []
        for o in v.get("options") or []:
            if o.get("alias") and (v["variable"], o.get("label")) not in LADDER_EXCEPTIONS:
                continue
            if not o.get("alias") and (v["variable"], o.get("label"), float(o["value"])) in drop:
                continue
            kept.append(o)
        v["options"] = kept
    return d


class Issue28CommittedKeyFilesTest(unittest.TestCase):
    """Issue #28, section 6: the committed key files rebuild every core alias."""

    MAPS = ROOT / "data" / "country_maps"

    def apply(self, d):
        mod = load_module(self)
        return mod.apply_country_text_keys(d, self.MAPS)

    def test_key_files_exist_with_answer_layout(self):
        for name in ("hungary_answers.csv", "spain_answers.csv", "hungary_headers.csv", "canonical_additions.csv"):
            self.assertTrue((self.MAPS / name).is_file(), f"data/country_maps/{name} exists")
        for name in ("hungary_answers.csv", "spain_answers.csv"):
            with open(self.MAPS / name, encoding="utf-8-sig", newline="") as fh:
                head = next(csv.reader(fh))
            self.assertEqual(len(head), 5, f"{name}: five columns like germany_answers.csv")
            self.assertEqual(head[0], "variables")
            self.assertTrue(head[1].endswith("_label"), f"{name}: second column <language>_label")
            self.assertEqual(head[2:], ["value", "status", "note"])

    def test_core_aliases_rebuilt_from_key_files(self):
        committed = committed_dictionary()
        rebuilt = self.apply(strip_core_aliases(committed))
        want, got = core_option_set(committed), core_option_set(rebuilt)
        self.assertEqual(sorted(want - got)[:20], [], "core options missing after the rebuild")
        self.assertEqual(sorted(got - want)[:20], [], "core options the committed dictionary lacks")

    def test_canonical_additions_restored_on_questionnaire_dictionary(self):
        committed = committed_dictionary()
        stripped = strip_core_aliases(committed, drop_new_canonical=True)
        rebuilt = self.apply(stripped)
        by_name = {v["variable"]: v for v in rebuilt["variables"]}
        for name, label, value in NEW_CANONICAL:
            hits = [o for o in by_name[name]["options"]
                    if not o.get("alias") and o.get("label") == label and float(o["value"]) == float(value)]
            self.assertEqual(len(hits), 1, f"{name}: canonical option {label} = {value} added once")
        self.assertEqual(core_option_set(rebuilt), core_option_set(committed))

    def test_apply_twice_changes_nothing(self):
        d = self.apply(strip_core_aliases(committed_dictionary(), drop_new_canonical=True))
        once = copy.deepcopy(d)
        self.apply(d)
        self.assertEqual(d, once, "second run changes nothing")


def review_rows(country):
    from openpyxl import load_workbook
    wb = load_workbook(ROOT / "data" / "country_maps" / f"{country}_review.xlsx", read_only=True)
    ws = wb.worksheets[0]
    rows = list(ws.iter_rows(values_only=True))
    head = list(rows[0])
    i_id, i_var = head.index("country_orig_id"), head.index("canonical_variable")
    return [(r[i_id], r[i_var]) for r in rows[1:]]


def core_names():
    return {v["variable"] for v in committed_dictionary()["variables"] if v.get("is_core") is True}


class Issue28ReviewWorkbookTest(unittest.TestCase):
    """Issue #28, section 1: review workbooks record one country column per core variable."""

    def owners(self, country):
        core = core_names()
        owners = {}
        for cid, var in review_rows(country):
            if not cid:
                continue
            for name in str(var or "").replace(",", " ").split():
                if name in core:
                    owners.setdefault(name, set()).add(str(cid))
        return owners

    def recorded(self, country, cid):
        return {str(var or "").strip() for c, var in review_rows(country) if str(c) == cid}

    def test_no_core_variable_on_two_columns(self):
        for country in ("hungary", "spain"):
            dups = {k: sorted(v) for k, v in self.owners(country).items() if len(v) > 1}
            self.assertEqual(dups, {}, f"{country}: core variables recorded for two columns")

    def test_hungary_recorded_variables(self):
        for cid, want in (("grade1", "grade1"), ("some_week1:5_1", "smwd1"), ("some_weekend1:5_1", "smwda1")):
            self.assertEqual(self.recorded("hungary", cid), {want}, f"hungary {cid}")
        core = core_names()
        for cid in ("schooltype", "county", "sleep3", "some_week1:5_4", "some_weekend1:5_4"):
            got = self.recorded("hungary", cid)
            self.assertTrue(got, f"hungary_review.xlsx has a row for {cid}")
            self.assertFalse({g for g in got if g in core}, f"hungary {cid} carries no core variable: {got}")

    def test_spain_sleep7_carries_no_core_variable(self):
        got = self.recorded("spain", "sleep7")
        self.assertTrue(got, "spain_review.xlsx has a row for sleep7")
        self.assertFalse(got & core_names(), f"spain sleep7: {got}")


if __name__ == "__main__":
    unittest.main()
