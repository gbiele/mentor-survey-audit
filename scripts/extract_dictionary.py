#!/usr/bin/env python3
"""Extract master survey dictionary from canonical codebook specifications."""

import csv
import json
from pathlib import Path
from enrich_keywords import enrich_variables_with_llm

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
REF_OUT_DIR = ROOT / "reference" / "output"
OUT_FILE = ROOT / "data" / "master_dictionary.json"

SPECIAL_CODES = {997: "Not applicable", 998: "Don't know", 999: "Prefer not to answer"}


def parse_int_safe(val):
    if val is None or val == "":
        return None
    try:
        return int(val)
    except (ValueError, TypeError):
        return None


def parse_bool_safe(val):
    if isinstance(val, bool):
        return val
    if isinstance(val, str):
        return val.strip().lower() in ("true", "1", "yes")
    return False


def build_master_dictionary(force_refresh_keywords=False):
    # Read variables
    vars_csv = REF_OUT_DIR / "codebook_variables.csv"
    opts_csv = REF_OUT_DIR / "codebook_options.csv"

    if not vars_csv.exists() or not opts_csv.exists():
        raise FileNotFoundError("Reference codebook CSV files not found!")

    with open(vars_csv, encoding="utf-8") as f:
        vars_rows = list(csv.DictReader(f))

    with open(opts_csv, encoding="utf-8") as f:
        opts_rows = list(csv.DictReader(f))

    # Group options by variable
    options_by_var = {}
    for opt in opts_rows:
        var_name = opt["variable"]
        if var_name not in options_by_var:
            options_by_var[var_name] = []

        val = parse_int_safe(opt.get("value"))
        is_special = val in SPECIAL_CODES

        options_by_var[var_name].append({
            "order": parse_int_safe(opt.get("option_order")),
            "label": opt.get("option_label", ""),
            "label_with_id": opt.get("option_label_with_id", ""),
            "alias": opt.get("option_alias", ""),
            "eusurvey_answer_id": opt.get("eusurvey_answer_id", ""),
            "value": val,
            "scale": opt.get("scale", ""),
            "is_special": is_special,
            "special_type": SPECIAL_CODES.get(val, "") if is_special else ""
        })

    # Assemble dictionary
    variables = []
    by_orig_variable = {}
    by_clean_variable = {}
    by_eusurvey_id = {}

    for row in vars_rows:
        var_name = row["variable"]
        orig_var = row["orig_variable"]
        opts = options_by_var.get(var_name, [])

        is_core_raw = row.get("is_core")
        is_core = parse_bool_safe(is_core_raw) if is_core_raw is not None and is_core_raw != "" else True

        var_entry = {
            "variable": var_name,
            "orig_variable": orig_var,
            "group_id": row.get("group_id", ""),
            "section": row.get("section", ""),
            "question_stem": row.get("question_stem", ""),
            "item_text": row.get("item_text", ""),
            "scale": row.get("scale", ""),
            "question_type": row.get("question_type", ""),
            "n_options": parse_int_safe(row.get("n_options")),
            "multiple": parse_bool_safe(row.get("multiple")),
            "source": row.get("source", ""),
            "is_core": is_core,
            "options_complete": parse_bool_safe(row.get("options_complete")),
            "scale_confidence": row.get("scale_confidence", ""),
            "notes": row.get("notes", ""),
            "options": opts
        }

        variables.append(var_entry)
        by_clean_variable[var_name] = var_entry
        if orig_var:
            by_orig_variable[orig_var] = var_entry
            if orig_var.startswith("ID"):
                by_eusurvey_id[orig_var] = var_entry

    # Enrich variables with LLM keywords (cached)
    variables = enrich_variables_with_llm(variables, force_refresh=force_refresh_keywords)

    # Add metadata
    sections = sorted(list({v["section"] for v in variables if v["section"]}))
    sources = sorted(list({v["source"] for v in variables if v.get("source")}))
    total_core = sum(1 for v in variables if v.get("is_core", True))
    master_dict = {
        "metadata": {
            "title": "JA-MENTOR Master Survey Dictionary",
            "version": "1.0.0",
            "source_specification": "data/questions_response_options.xlsx",
            "sources": sources,
            "total_variables": len(variables),
            "total_core_variables": total_core,
            "total_options": len(opts_rows),
            "sections": sections,
            "special_codes": SPECIAL_CODES
        },
        "variables": variables,
        "index_by_orig_variable": {k: v["variable"] for k, v in by_orig_variable.items()},
        "index_by_clean_variable": {k: v["variable"] for k, v in by_clean_variable.items()}
    }

    OUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_FILE, "w", encoding="utf-8") as f:
        json.dump(master_dict, f, indent=2, ensure_ascii=False)

    # Also bundle as JS for browser usage
    bundle_file = ROOT / "src" / "master_dictionary_bundle.js"
    with open(bundle_file, "w", encoding="utf-8") as f:
        f.write(f"window.__MASTER_DICTIONARY__ = {json.dumps(master_dict, ensure_ascii=False)};\n")

    # Mirror to docs/ if present
    docs_data_dir = ROOT / "docs" / "data"
    docs_src_dir = ROOT / "docs" / "src"
    if docs_data_dir.exists() or (ROOT / "docs").exists():
        docs_data_dir.mkdir(parents=True, exist_ok=True)
        with open(docs_data_dir / "master_dictionary.json", "w", encoding="utf-8") as f:
            json.dump(master_dict, f, indent=2, ensure_ascii=False)
    if docs_src_dir.exists() or (ROOT / "docs").exists():
        docs_src_dir.mkdir(parents=True, exist_ok=True)
        with open(docs_src_dir / "master_dictionary_bundle.js", "w", encoding="utf-8") as f:
            f.write(f"window.__MASTER_DICTIONARY__ = {json.dumps(master_dict, ensure_ascii=False)};\n")

    print(f"Extracted {len(variables)} variables and {len(opts_rows)} options into {OUT_FILE} and bundles.")
    return master_dict


if __name__ == "__main__":
    build_master_dictionary()
