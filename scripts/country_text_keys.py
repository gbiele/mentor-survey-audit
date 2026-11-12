#!/usr/bin/env python3
"""Apply country text keys to the master dictionary.

data/country_maps/<country>_headers.csv (variable, <language>_header) adds the
header text of a country-language export to variable.header_aliases.<country>.
data/country_maps/<country>_answers.csv (variables, <language>_label, value, ...)
adds an alias option per label to every matched variable, with the canonical
option's value; an older alias with the same label and another value is removed. Run without arguments to update the four dictionary copies.
"""

import csv
import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MAPS_DIR = ROOT / "data" / "country_maps"
DICTIONARY_COPIES = [
    ROOT / "data" / "master_dictionary.json",
    ROOT / "docs" / "describe" / "vfs" / "data" / "master_dictionary.json",
]
BUNDLE_COPIES = [
    ROOT / "src" / "master_dictionary_bundle.js",
    ROOT / "docs" / "src" / "master_dictionary_bundle.js",
]


def norm_key(text):
    """Label key like normKey in src/survey_validator.js."""
    s = unicodedata.normalize("NFKC", "" if text is None else str(text))
    s = re.sub(r"[  -​  ]", " ", s)
    s = re.sub(r"[–—]", "-", s).replace("…", "...")
    s = re.sub(r"[’‘`]", "'", s)
    s = re.sub(r"<[^>]+>", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    s = re.sub(r"\s+([.,;:])", r"\1", s)
    return s.lower()


def same_value(a, b):
    if a is None or b is None:
        return a == b
    return float(a) == float(b)


def read_rows(path):
    """(line, row) for each data row of a UTF-8 CSV with a header row. The text column
    is named after the language (german_header), so the caller reads it as row["text"]."""
    with open(path, encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            row["text"] = row[reader.fieldnames[1]]
            yield reader.line_num, row


def apply_headers(master_dict, path, country):
    by_name = {v["variable"]: v for v in master_dict["variables"]}
    for line, row in read_rows(path):
        name, text = row["variable"], row["text"]
        if name not in by_name:
            raise ValueError(f"{path.name}:{line}: variable {name!r} is not in the dictionary")
        texts = by_name[name].setdefault("header_aliases", {}).setdefault(country, [])
        if text not in texts:
            texts.append(text)


def matching_variables(master_dict, pattern):
    """Variables named by one pattern: a name, or prefix + * for prefix and digits only."""
    if pattern.endswith("*"):
        regex = re.compile("^" + re.escape(pattern[:-1]) + "[0-9]+$")
        return [v for v in master_dict["variables"] if regex.match(v["variable"])]
    return [v for v in master_dict["variables"] if v["variable"] == pattern]


def apply_answers(master_dict, path):
    given_values = {}  # (variable, label key) -> value an earlier row of this file gave
    for line, row in read_rows(path):
        where = f"{path.name}:{line}"
        label, patterns = row["text"], row["variables"]
        key = norm_key(label)
        for pattern in patterns.split():
            variables = matching_variables(master_dict, pattern)
            if not variables:
                raise ValueError(f"{where}: pattern {pattern!r} matches no variable ({label!r})")
            for var in variables:
                options = var["options"]
                canon = next((o for o in options
                              if not o.get("alias") and same_value(o["value"], float(row["value"]))), None)
                if canon is None:
                    raise ValueError(
                        f"{where}: value {row['value']} is not a canonical option value of "
                        f"{var['variable']} ({label!r})")
                same_label = [o for o in options if norm_key(o.get("label")) == key]
                given = given_values.setdefault((var["variable"], key), canon["value"])
                if not same_value(given, canon["value"]):
                    raise ValueError(
                        f"{where}: label {label!r} gets two values in {var['variable']} in this file")
                # After the row every option with this label has the row's value: the key
                # file wins over old aliases, never over a canonical label.
                for o in [o for o in same_label if not same_value(o["value"], canon["value"])]:
                    if not o.get("alias"):
                        raise ValueError(
                            f"{where}: label {label!r} already maps to another value in {var['variable']}")
                    options.remove(o)
                    same_label.remove(o)
                    print(f"removed alias {o['label']}={o['value']} in {var['variable']} "
                          f"(key file: {canon['value']})")
                if same_label:
                    continue
                last = max(i for i, o in enumerate(options) if same_value(o["value"], canon["value"]))
                options.insert(last + 1, {
                    "order": canon["order"],
                    "label": label,
                    "label_with_id": "",
                    "alias": label,
                    "eusurvey_answer_id": "",
                    "value": canon["value"],
                    "scale": canon["scale"],
                    "is_special": canon["is_special"],
                    "special_type": canon["special_type"],
                })


def apply_country_text_keys(master_dict, maps_dir):
    """Add header aliases and alias options from every <country>_headers.csv and
    <country>_answers.csv in maps_dir. Changes master_dict in place and returns it."""
    maps_dir = Path(maps_dir)
    for path in sorted(maps_dir.glob("*_headers.csv")):
        apply_headers(master_dict, path, path.name[: -len("_headers.csv")])
    for path in sorted(maps_dir.glob("*_answers.csv")):
        apply_answers(master_dict, path)
    master_dict["metadata"]["total_options"] = sum(len(v["options"]) for v in master_dict["variables"])
    return master_dict


def write_dictionary_copies(master_dict):
    """Write the dictionary to its four copies: two JSON files and two JS bundles."""
    for path in DICTIONARY_COPIES:
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(master_dict, f, indent=2, ensure_ascii=False)
    for path in BUNDLE_COPIES:
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            f.write(f"window.__MASTER_DICTIONARY__ = {json.dumps(master_dict, ensure_ascii=False)};\n")


def main():
    with open(DICTIONARY_COPIES[0], encoding="utf-8") as f:
        master_dict = json.load(f)
    apply_country_text_keys(master_dict, MAPS_DIR)
    write_dictionary_copies(master_dict)
    print(f"Applied country text keys: {master_dict['metadata']['total_options']} options in the dictionary copies.")


if __name__ == "__main__":
    main()
