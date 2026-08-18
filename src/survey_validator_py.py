"""Helper to build realistic column generators reflecting German youth demographics."""

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
    s = s.replace("–", "-").replace("—", "-").replace("…", "...")
    s = s.replace("’", "'").replace("‘", "'").replace("`", "'")
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
        return lambda resp_id: random.choice(template_vals) if template_vals and random.random() < 0.4 else None

    var_name = canonical["variable"]

    # Special handling for gaming matrix items (German plain labels)
    if var_name.startswith("igd") and var_name[3:].isdigit():
        weights = [0.45, 0.25, 0.15, 0.10, 0.05]
        return lambda resp_id: random.choices(GAMING_LIKERT, weights=weights)[0]

    # Special handling for follow-up frequency items
    if var_name in ("smafreq1", "igdfreq1"):
        return lambda resp_id: random.choices(SMA_FOLLOWUP_OPTIONS, weights=[0.65, 0.35])[0]

    # Special handling for missing-options branch follow-up items
    if var_name in ("smayr1", "smaonce1", "smadur1", "igdyr1", "igdonce1", "igddur1"):
        return lambda resp_id: random.choice(template_vals) if template_vals and random.random() < 0.15 else None

    # Free text / describe
    if var_name == "catsoth1" or canonical.get("question_type") == "text":
        samples = ["Sports accident", "Car crash", "Fell from bicycle", "Dog bite", "Surgery/Hospital stay"]
        return lambda resp_id: random.choice(samples) if random.random() < 0.2 else ""

    opts = canonical.get("options", [])
    if not opts:
        return lambda resp_id: random.choice(template_vals) if template_vals else None

    # Demographic & Specific question weighting for Germany
    labels = [o["label"] for o in opts if o.get("label")]

    # 1. Gender (gender1)
    if var_name == "gender1":
        weights_map = {"Boy": 51, "Girl": 47, "Other gender identity": 1.5, "Prefer not to answer": 0.5}
        w = [weights_map.get(l, 1) for l in labels]
        return lambda resp_id: random.choices(labels, weights=w)[0]

    # 2. Grade in school (grade1)
    if var_name == "grade1":
        weights_map = {"8th": 18, "9th": 22, "10th": 24, "11th": 18, "12th": 12, "13th": 5, "Graduated from school": 0.5, "Quit school before graduating": 0.5}
        w = [weights_map.get(l, 1) for l in labels]
        return lambda resp_id: random.choices(labels, weights=w)[0]

    # 3. Birth year (byear1) - youth aged 13-18 (2007-2012)
    if var_name == "byear1":
        weights_map = {
            "2000": 0.1, "2001": 0.1, "2002": 0.2, "2003": 0.3, "2004": 0.5, "2005": 1.5,
            "2006": 4.0, "2007": 14.0, "2008": 26.0, "2009": 30.0, "2010": 18.0, "2011": 5.0, "2012": 0.3
        }
        w = [weights_map.get(l, 1) for l in labels]
        return lambda resp_id: int(random.choices(labels, weights=w)[0]) if random.choices(labels, weights=w)[0].isdigit() else random.choices(labels, weights=w)[0]

    # 4. Birth month (bmonth1)
    if var_name == "bmonth1":
        return lambda resp_id: random.choice(labels)

    # 5. Birthplace of respondent (bplace1)
    if var_name == "bplace1":
        weights_map = {
            "Germany": 78, "Syria": 4, "Turkey": 3, "Ukraine": 3, "Poland": 2,
            "Russia": 2, "Romania": 2, "Afghanistan": 2, "Iraq": 1, "Italy": 1
        }
        w = [weights_map.get(l, 0.2) for l in labels]
        return lambda resp_id: random.choices(labels, weights=w)[0]

    # 6. Age moved to Germany (bage1)
    if var_name == "bage1":
        # 80% born in Germany / infant (0), remaining distributed 1-15
        weights_map = {"0": 80, "1": 3, "2": 2, "3": 2, "4": 2, "5": 2, "6": 2, "7": 1.5, "8": 1.5, "9": 1, "10": 1, "11": 1, "12": 0.5, "13": 0.3, "14": 0.1, "15": 0.1}
        w = [weights_map.get(l, 0.1) for l in labels]
        return lambda resp_id: int(random.choices(labels, weights=w)[0]) if random.choices(labels, weights=w)[0].isdigit() else random.choices(labels, weights=w)[0]

    # 7. Mother / Father Birthplace (bmborn1, bfborn1)
    if var_name in ("bmborn1", "bfborn1"):
        weights_map = {
            "Germany": 62, "Turkey": 8, "Poland": 5, "Russia": 4, "Syria": 4,
            "Romania": 3, "Ukraine": 3, "Italy": 2, "Afghanistan": 2, "Iraq": 1,
            "Prefer not to answer": 1
        }
        w = [weights_map.get(l, 0.3) for l in labels]
        return lambda resp_id: random.choices(labels, weights=w)[0]

    # 8. Living situation (live1)
    if var_name == "live1":
        weights_map = {
            "Both my mother and father in the same home": 72,
            "Only with my mother": 14,
            "Only with my father": 4,
            "I live in two homes-shared residency (with both mother and father)": 7,
            "Foster parents, an institution, or another situation": 2,
            "Prefer not to answer": 1
        }
        w = [weights_map.get(l, 1) for l in labels]
        return lambda resp_id: random.choices(labels, weights=w)[0]

    # 9. Number of siblings (sibs1)
    if var_name == "sibs1":
        weights_map = {"None": 22, "1": 48, "2": 20, "3 or more": 10}
        w = [weights_map.get(l, 1) for l in labels]
        return lambda resp_id: random.choices(labels, weights=w)[0]

    # 10. MacArthur Socioeconomic Ladder (ladder1)
    if var_name == "ladder1":
        weights_map = {
            "1": 1, "2": 2, "3": 5, "4": 10, "5": 22, "6": 28, "7": 18, "8": 9, "9": 4, "10": 1,
            "Bottom of the ladder": 0.5, "Top of the ladder": 0.5
        }
        w = [weights_map.get(l, 1) for l in labels]
        def generator(resp_id):
            chosen = random.choices(labels, weights=w)[0]
            if str(chosen).isdigit():
                return int(chosen)
            return chosen
        return generator

    # 11. Family Affordability (afford1)
    if var_name == "afford1":
        weights_map = {"Always": 32, "Most of the time": 48, "Sometimes": 16, "Never": 3, "Rarely": 1}
        w = [weights_map.get(l, 1) for l in labels]
        return lambda resp_id: random.choices(labels, weights=w)[0]

    # 12. Mental Health Symptom Scales (BCFPI, PTSD CATS)
    if var_name.startswith(("bcfpi", "ptsd", "negaff", "smharm")):
        # Skewed towards lower frequencies
        weights_map = {
            "Never": 58, "Rarely": 22, "Sometimes": 14, "Often": 5, "Always": 1,
            "NEVER true": 58, "SOMETIMES true": 32, "OFTEN true": 10,
            "Not at all": 60, "Once in a while": 24, "Half the time": 12, "Almost always": 4,
            "No": 82, "Yes": 18
        }
        w = [weights_map.get(l, 1) for l in labels]
        return lambda resp_id: random.choices(labels, weights=w)[0]

    # 13. Resilience / Positive Well-being / Literacy (CYRM, PosAff, MHLS)
    if var_name.startswith(("cyrm", "posaff", "mhls", "qol", "ks")):
        weights_map = {
            "Not at all": 5, "A little": 12, "Somewhat": 32, "Quite a bit": 36, "A lot": 15,
            "Very difficult": 8, "eher schwierig": 22, "eher einfach": 48, "Very easy": 22
        }
        w = [weights_map.get(l, 1) for l in labels]
        return lambda resp_id: random.choices(labels, weights=w)[0]

    # Default weighted generator
    standard_opts = [o["label"] for o in opts if not o.get("is_special") and o.get("label")]
    special_opts = [o["label"] for o in opts if o.get("is_special") and o.get("label")]

    if not standard_opts and special_opts:
        standard_opts = special_opts

    if standard_opts:
        def generator(resp_id):
            if special_opts and random.random() < 0.03:
                val = random.choice(special_opts)
            else:
                val = random.choice(standard_opts)
            try:
                if str(val).isdigit():
                    return int(val)
            except (ValueError, TypeError):
                pass
            return val

        return generator

    return lambda resp_id: random.choice(template_vals) if template_vals else None
