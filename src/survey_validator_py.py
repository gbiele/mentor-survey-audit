"""Helper to build realistic column generators for synthetic survey data generation."""

import random
import re
import unicodedata

GAMING_LIKERT = [
    "0 = strongly disagree",
    "1 = somewhat disagree",
    "2 = partially agree / partially disagree",
    "3 = somewhat agree",
    "4 = strongly agree"
]

SMA_FOLLOWUP_OPTIONS = [
    "not at all",
    "only on single days"
]


def norm(text):
    if text is None:
        return ""
    s = unicodedata.normalize("NFKC", str(text))
    s = re.sub(r"\s+", " ", s).strip()
    return s


def norm_key(text):
    return norm(text).lower()


def split_stem_item(text):
    raw = norm(text)
    is_matrix = raw.startswith("Matrix:")
    if is_matrix:
        raw = norm(raw[7:])
    if ":" in raw:
        parts = raw.split(":")
        stem = norm(":".join(parts[:-1]))
        item = norm(parts[-1])
        return stem or raw, item, is_matrix
    return raw, "", is_matrix


def parse_header(header_str):
    raw = norm(header_str)
    m = re.match(r"^(.*)\s+\(([A-Za-z0-9_.-]{1,32})\)\s*$", raw)
    if m:
        return norm(m.group(1)), norm(m.group(2))
    return raw, ""


def build_column_generators(headers, master_dict, original_data_rows):
    vars_list = master_dict.get("variables", [])
    by_clean_var = {v["variable"].lower(): v for v in vars_list if v.get("variable")}
    by_orig_var = {v["orig_variable"].lower(): v for v in vars_list if v.get("orig_variable")}

    by_stem_key = {}
    by_item_key = {}
    for v in vars_list:
        if v.get("question_stem"):
            skey = norm_key(v["question_stem"])
            by_stem_key.setdefault(skey, []).append(v)
        if v.get("item_text"):
            ikey = norm_key(v["item_text"])
            by_item_key.setdefault(ikey, []).append(v)

    generators = []
    matched_vars = set()
    prev_canonical = None

    for col_idx, header in enumerate(headers):
        text, var_id = parse_header(header)
        stem, item_text, is_matrix = split_stem_item(text)

        canonical = None

        # 1. Match by varId
        if var_id:
            vid_low = var_id.lower()
            if vid_low in by_orig_var:
                canonical = by_orig_var[vid_low]
            elif vid_low in by_clean_var:
                canonical = by_clean_var[vid_low]

        # 2. Match by item_text
        if not canonical and item_text:
            ikey = norm_key(item_text)
            if ikey in by_item_key:
                cands = by_item_key[ikey]
                canonical = cands[0]

        # 3. Match by stem
        if not canonical and stem:
            skey = norm_key(stem)
            if skey in by_stem_key:
                cands = by_stem_key[skey]
                if len(cands) == 1:
                    canonical = cands[0]
                else:
                    # Disambiguate smafreq1 vs igdfreq1
                    if prev_canonical and (prev_canonical["variable"].startswith("igd") or "gaming" in prev_canonical.get("section", "").lower()):
                        canonical = next((c for c in cands if c["variable"].startswith("igd") and c["variable"] not in matched_vars), cands[0])
                    elif prev_canonical and (prev_canonical["variable"].startswith("sma") or "social" in prev_canonical.get("section", "").lower()):
                        canonical = next((c for c in cands if c["variable"].startswith("sma") and c["variable"] not in matched_vars), cands[0])
                    else:
                        canonical = next((c for c in cands if c["variable"] not in matched_vars), cands[0])

        if canonical:
            matched_vars.add(canonical["variable"])
            prev_canonical = canonical

        # Build generator function for this column
        gen = create_generator_for_column(col_idx, header, canonical, original_data_rows)
        generators.append(gen)

    return generators


def create_generator_for_column(col_idx, header, canonical, original_data_rows):
    # Extract template observed values as fallback
    template_vals = []
    for r in original_data_rows:
        if r and col_idx < len(r) and r[col_idx] is not None and str(r[col_idx]).strip():
            template_vals.append(str(r[col_idx]).strip())

    if not canonical:
        # Unmatched column: sample from template values
        return lambda resp_id: random.choice(template_vals) if template_vals and random.random() < 0.4 else None

    var_name = canonical["variable"]

    # Special handling for gaming matrix items (German plain labels)
    if var_name.startswith("igd") and var_name[3:].isdigit():
        return lambda resp_id: random.choice(GAMING_LIKERT)

    # Special handling for follow-up frequency items
    if var_name in ("smafreq1", "igdfreq1"):
        return lambda resp_id: random.choice(SMA_FOLLOWUP_OPTIONS)

    # Special handling for missing-options branch follow-up items
    if var_name in ("smayr1", "smaonce1", "smadur1", "igdyr1", "igdonce1", "igddur1"):
        # These are branch follow-ups; return empty or rare response
        return lambda resp_id: random.choice(template_vals) if template_vals and random.random() < 0.2 else None

    # Free text / describe
    if var_name == "catsoth1" or canonical.get("question_type") == "text":
        samples = ["", "", "", "Sports injury", "Car accident", "Hospital stay", ""]
        return lambda resp_id: random.choice(samples) if random.random() < 0.3 else ""

    # Regular categorical / interval with canonical options
    opts = canonical.get("options", [])
    if opts:
        standard_opts = [o["label"] for o in opts if not o.get("is_special") and o.get("label")]
        special_opts = [o["label"] for o in opts if o.get("is_special") and o.get("label")]

        if not standard_opts and special_opts:
            standard_opts = special_opts

        if standard_opts:
            # Weighted distribution: 96% standard options, 4% special codes
            def generator(resp_id):
                if special_opts and random.random() < 0.04:
                    val = random.choice(special_opts)
                else:
                    val = random.choice(standard_opts)
                # Convert string numeric integer representation if applicable
                try:
                    if str(val).isdigit():
                        return int(val)
                except (ValueError, TypeError):
                    pass
                return val

            return generator

    # Fallback
    return lambda resp_id: random.choice(template_vals) if template_vals else None
