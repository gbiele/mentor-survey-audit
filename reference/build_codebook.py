#!/usr/bin/env python3
"""Build a union codebook from the FHI-EN questionnaire and German EUSurvey exports."""

from __future__ import annotations

import csv
import re
import unicodedata
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import date
from html import escape
from pathlib import Path

from openpyxl import load_workbook

ROOT = Path(__file__).resolve().parent
FHI_PATH = ROOT / "mentor_fhi-EN.xlsx"
GER_ID_PATH = ROOT / "MENTORMaster_TEST_GER_2.xlsx"
GER_PLAIN_PATH = ROOT / "Content_Export_MENTORMasterGER1_Test-GER-1.xlsx"
OUT_DIR = ROOT / "output"

META_KEYS = {"TITLE", "LOGOTEXT", "ESCAPEPAGE", "CONFIRMATIONPAGE"}
HEADER_RE = re.compile(r"^(.*)\s+\(([^)]+)\)\s*$")
ANSWER_ID_RE = re.compile(r"^(.*)\s+\((ID\d+)\)\s*$")
NUMBERED_LABEL_RE = re.compile(r"^(\d+)\s*=")
PREFER_NOT_RE = re.compile(
    r"prefer not to (answer|say|respond|tell)|would rather not (answer|say)|"
    r"keine angabe",
    re.I,
)
DONT_KNOW_RE = re.compile(
    r"^(i )?((don't|dont|do not) know|dk|weiß nicht|weiss nicht|weiß es nicht)\.?$",
    re.I,
)
NOT_APPLICABLE_RE = re.compile(
    r"^(not applicable|n/?a|n\. ?a\.?|does not apply|not relevant|"
    r"nicht zutreffend|trifft nicht zu)\.?$",
    re.I,
)
NA_CODE = 997
DONT_KNOW_CODE = 998
PREFER_NOT_CODE = 999
SPECIAL_CODES = frozenset({NA_CODE, DONT_KNOW_CODE, PREFER_NOT_CODE})

# Low rank = low frequency. Longer phrases first so "never true" wins over "never".
FREQUENCY_RANKS: list[tuple[int, tuple[str, ...]]] = [
    (0, ("never true", "not at all", "never", "none")),
    (1, ("once in a while", "only on single days", "a few times", "rarely", "once")),
    (2, ("sometimes true", "half the time", "sometimes", "somewhat")),
    (3, ("often true", "quite often", "most of the time", "many times", "often")),
    (4, ("nearly all the time", "almost always", "very often", "always", "a lot")),
]
FREQ_HINTS = (
    "never", "rarely", "often", "always", "sometimes",
    "once in a while", "half the time", "many times", "a few times",
    "quite often", "very often", "almost always", "nearly all the time",
    "most of the time", "once",
)
UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I
)

KNOWN_SCALES: list[list[str]] = [
    ["Yes", "No", "Don't know"],
    ["Yes", "No"],
    ["NEVER true", "SOMETIMES true", "OFTEN true"],
    ["Not at all", "A little", "Somewhat", "Quite a bit", "A lot"],
    ["Never", "Rarely", "Quite often", "Very often", "Always"],
    ["Not at all", "A little", "Quite", "Very", "To a great extent"],
    ["Less than 1 hour", "1-2 hours", "3-4 hours", "5-6 hours", "7 hours or more"],
    ["Nearly all the time", "Often", "Sometimes", "Rarely", "Never"],
    ["Always", "Most of the time", "Sometimes", "Rarely", "Never"],
    ["Many times", "A few times", "Once", "Never"],
    ["Strongly disagree", "Somewhat disagree", "Somewhat agree", "Strongly agree"],
    ["Bottom of the ladder", "Top of the ladder"],
]

# Canonical option orders for German-only scales (plain labels).
SMA_LIKERT = [
    "strongly disagree",
    "somewhat disagree",
    "partially agree / partially disagree",
    "somewhat agree",
    "strongly agree",
]
GAMING_LIKERT = [
    "0 = strongly disagree",
    "1 = somewhat disagree",
    "2 = partially agree / partially disagree",
    "3 = somewhat agree",
    "4 = strongly agree",
]
PTSD_FREQ = [
    "Never",
    "Once in a while",
    "Half the time",
    "Almost always",
]
CATS_YN = ["No", "Yes"]
MHLS_SCALE = [
    "very difficult",
    "eher schwierig",
    "eher einfach",
    "very easy",
]
MHLS_ALIASES = {
    "very difficult": [],
    "eher schwierig": ["rather difficult", "somewhat difficult"],
    "eher einfach": ["rather easy", "somewhat easy"],
    "very easy": [],
}

SKIP_TEXT_PREFIXES = (
    "thank you",
    "do you wish to participate in a gift",
    "do you want to talk to someone",
    "background and purpose",
    "this survey has not yet been published",
)

NEW_QUESTION_RE = re.compile(
    r"^(please indicate|please select up to|when gaming|"
    r"how were you bullied most often|peer violence|"
    r"family environment|exposure to war|"
    r"this next question|these next questions|these questions are about)",
    re.I,
)

MULTIPLE_RE = re.compile(
    r"(which adults|select up to|what you usually use|"
    r"what do you identify as|please indicate what you usually)",
    re.I,
)

INTERVAL_VAR_HINTS = {"born1", "born3", "soc1"}
TEXT_VAR_HINTS = {"ID346"}
MATRIX_TITLE_VARS = {"ID426"}

ORDINAL_SCALE_NORMS = {
    tuple(n.lower() for n in scale) for scale in KNOWN_SCALES if scale[0] != "Yes"
}
ORDINAL_SCALE_NORMS.add(tuple(x.lower() for x in SMA_LIKERT))
ORDINAL_SCALE_NORMS.add(tuple(x.lower() for x in GAMING_LIKERT))
ORDINAL_SCALE_NORMS.add(tuple(x.lower() for x in PTSD_FREQ))
ORDINAL_SCALE_NORMS.add(tuple(x.lower() for x in MHLS_SCALE))
ORDINAL_SCALE_NORMS.add(("never true", "sometimes true", "often true"))
ORDINAL_SCALE_NORMS.add(
    ("less than high school", "high school diploma or equivalent",
     "come college, no degree", "bachelor's degree", "master's degree or more",
     "don't know")
)
ORDINAL_SCALE_NORMS.add(
    ("8th", "9th", "10th", "11th", "12th", "13th",
     "graduated from school", "quit school before graduating")
)
ORDINAL_SCALE_NORMS.add(("none", "1", "2", "3 or more"))


def norm(text: str | None) -> str:
    if text is None:
        return ""
    s = unicodedata.normalize("NFKC", str(text))
    s = s.replace("\xa0", " ").replace("&#xa0;", " ").replace("&nbsp;", " ")
    s = s.replace("–", "-").replace("—", "-").replace("…", "...")
    s = s.replace("’", "'").replace("‘", "'").replace("`", "'")
    s = re.sub(r"<[^>]+>", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    s = re.sub(r"\s+([.,;:])", r"\1", s)
    return s


def norm_key(text: str | None) -> str:
    return norm(text).casefold()


def slugify(text: str, fallback: str = "item") -> str:
    s = norm_key(text)
    s = re.sub(r"[^a-z0-9]+", "_", s).strip("_")
    return (s[:48] or fallback)


def looks_like_skip(text: str) -> bool:
    k = norm_key(text)
    return any(k.startswith(p) for p in SKIP_TEXT_PREFIXES)


def looks_like_new_question(text: str) -> bool:
    return bool(NEW_QUESTION_RE.match(norm(text)))


def strip_html_keep_text(text: str) -> str:
    return norm(text)


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class Option:
    label: str
    order: int
    value: int | None
    eusurvey_answer_id: str | None = None
    label_with_id: str | None = None
    aliases: list[str] = field(default_factory=list)


@dataclass
class Item:
    variable: str  # original EUSurvey / generated id
    item_text: str
    source: str  # both | fhi_only | ger_only
    ger_header: str = ""
    short_name: str = ""  # analysis name: ≤8 letter stem + item number


@dataclass
class Question:
    group_id: str
    section: str
    stem: str
    question_type: str  # single | matrix | text | interval
    scale: str
    scale_confidence: str
    multiple: bool
    options: list[Option]
    items: list[Item]
    options_complete: str  # true | false | inferred
    source: str
    notes: str = ""


@dataclass
class GerVar:
    variable: str
    header: str
    stem: str
    item_text: str
    is_matrix_prefix: bool
    col: int
    observed_plain: dict[str, None] = field(default_factory=dict)
    observed_ids: dict[str, str] = field(default_factory=dict)  # plain -> IDnnn
    all_empty: bool = True


# ---------------------------------------------------------------------------
# German export
# ---------------------------------------------------------------------------

def parse_header(header: str) -> tuple[str, str]:
    header = header or ""
    m = HEADER_RE.match(header.strip())
    if m:
        return m.group(1).strip(), m.group(2).strip()
    return header.strip(), "?"


def split_stem_item(text: str) -> tuple[str, str, bool]:
    """Return (stem, item_text, is_matrix_prefix)."""
    raw = (text or "").strip()
    is_matrix = raw.startswith("Matrix:")
    if is_matrix:
        raw = raw[len("Matrix:"):].strip()
    if ":" in raw:
        stem, item = raw.rsplit(":", 1)
        stem, item = stem.strip(), item.strip()
        if not item:
            return stem or raw, "", is_matrix
        return stem, item, is_matrix
    if is_matrix:
        return "", raw, True
    return raw, "", False


def parse_answer_with_id(val) -> tuple[str, str | None]:
    if val is None:
        return "", None
    s = str(val).strip()
    if not s:
        return "", None
    m = ANSWER_ID_RE.match(s)
    if m:
        return m.group(1).strip(), m.group(2).strip()
    return s, None


def load_sheet_rows(path: Path):
    wb = load_workbook(path, data_only=True)
    ws = wb[wb.sheetnames[0]]
    rows = list(ws.iter_rows(values_only=True))
    return rows


def parse_german() -> list[GerVar]:
    id_rows = load_sheet_rows(GER_ID_PATH)
    plain_rows = load_sheet_rows(GER_PLAIN_PATH)
    headers = list(id_rows[3])
    vars_: list[GerVar] = []
    for col, header in enumerate(headers):
        text, vid = parse_header(str(header or ""))
        stem, item, is_mx = split_stem_item(text)
        gv = GerVar(
            variable=vid,
            header=text,
            stem=stem,
            item_text=item,
            is_matrix_prefix=is_mx,
            col=col,
        )
        vars_.append(gv)

    # Observed answers from both files (same column order).
    def iter_data(rows):
        for row in rows[4:]:
            if row is None:
                continue
            yield row

    for row in iter_data(id_rows):
        for gv, val in zip(vars_, row):
            label, aid = parse_answer_with_id(val)
            if not label:
                continue
            gv.all_empty = False
            gv.observed_ids[label] = aid or gv.observed_ids.get(label, "")
            # If the label itself contains "N = ...", keep full label as key.

    for row in iter_data(plain_rows):
        for gv, val in zip(vars_, row):
            if val is None:
                continue
            label = str(val).strip()
            if not label:
                continue
            gv.all_empty = False
            gv.observed_plain[label] = None
            # Map numbered/plain forms onto id map when possible.
            if label not in gv.observed_ids:
                # try matching a key that startswith this label
                for k, aid in list(gv.observed_ids.items()):
                    if k == label or k.startswith(label + " "):
                        break
                else:
                    gv.observed_ids.setdefault(label, "")

    # Fill observed_plain from id-file labels too.
    for gv in vars_:
        for lab in gv.observed_ids:
            gv.observed_plain[lab] = None

    return vars_


def infer_group_stem(grp: list[GerVar]) -> str:
    title = next((gv for gv in grp if gv.variable in MATRIX_TITLE_VARS), None)
    if title and (title.stem or title.header):
        return title.stem or title.header
    members = [gv for gv in grp if gv.variable not in MATRIX_TITLE_VARS]
    if not members:
        return "Matrix"
    if any(gv.is_matrix_prefix for gv in members):
        texts = [(gv.item_text or gv.header or "") for gv in members]
        sm = sum(
            1
            for t in texts
            if "social media" in t.lower()
            and "gaming" not in t.lower()
            and "play games" not in t.lower()
        )
        gm = sum(
            1
            for t in texts
            if any(w in t.lower() for w in ("gaming", "play games", "spielen"))
        )
        if gm > sm:
            return "Gaming (addiction matrix)"
        if sm >= 3:
            return "Social media use (addiction matrix)"
        if members[0].stem:
            return members[0].stem
        return members[0].item_text or members[0].header
    stems = [gv.stem for gv in members if gv.stem]
    if stems:
        return stems[0]
    return members[0].header


def group_german_vars(vars_: list[GerVar]) -> list[list[GerVar]]:
    """Group consecutive matrix-prefix columns, or columns that share a stem."""
    groups: list[list[GerVar]] = []
    i = 0
    n = len(vars_)
    while i < n:
        gv = vars_[i]
        if gv.variable in MATRIX_TITLE_VARS:
            buf = [gv]
            i += 1
            while i < n and vars_[i].is_matrix_prefix:
                buf.append(vars_[i])
                i += 1
            groups.append(buf)
            continue
        if gv.is_matrix_prefix:
            buf = [gv]
            i += 1
            while i < n and vars_[i].is_matrix_prefix:
                buf.append(vars_[i])
                i += 1
            groups.append(buf)
            continue
        if gv.stem and gv.item_text:
            buf = [gv]
            i += 1
            while (
                i < n
                and vars_[i].stem == gv.stem
                and vars_[i].item_text
                and not vars_[i].is_matrix_prefix
            ):
                buf.append(vars_[i])
                i += 1
            groups.append(buf)
            continue
        groups.append([gv])
        i += 1
    return groups


# ---------------------------------------------------------------------------
# FHI translation
# ---------------------------------------------------------------------------

@dataclass
class FhiRow:
    idx: int  # 1-based spreadsheet row
    uid: str
    raw: str
    text: str
    key: str


def load_fhi_rows() -> list[FhiRow]:
    wb = load_workbook(FHI_PATH, data_only=True)
    ws = wb["Translation"]
    out: list[FhiRow] = []
    for i, row in enumerate(ws.iter_rows(min_row=1, values_only=True), 1):
        a, b, c = (list(row) + [None, None, None])[:3]
        uid = str(a or "")
        raw = "" if c is None else str(c)
        text = strip_html_keep_text(raw)
        out.append(FhiRow(idx=i, uid=uid, raw=raw, text=text, key=norm_key(text)))
    return out


def match_known_scale(rows: list[FhiRow], i: int) -> list[str] | None:
    for scale in KNOWN_SCALES:
        end = i + len(scale)
        if end > len(rows):
            continue
        got = [rows[i + j].text for j in range(len(scale))]
        if got == scale:
            return scale
    return None


def parse_fhi(ger_stems: set[str], ger_questions: set[str]) -> tuple[list[dict], list[str]]:
    """Return (questions, section_order_notes).

    Each question dict: section, stem, options (list[str]), items (list[str]),
    kind (single|matrix), row.
    """
    rows = load_fhi_rows()
    n = len(rows)

    section_at = {}
    current_section = "Background"
    stem_flags = [False] * n

    ger_stem_keys = {norm_key(s) for s in ger_stems if s}
    ger_q_keys = {norm_key(s) for s in ger_questions if s}

    for i, r in enumerate(rows):
        if i + 1 < n and rows[i + 1].text == "[Section]":
            current_section = r.text or current_section
            section_at[i] = current_section
            continue
        if r.uid in META_KEYS or r.text == "[Section]" or not r.text:
            continue
        if UUID_RE.match(r.uid) is None and r.uid not in META_KEYS:
            # first data uuid row is survey id; still a label row
            pass
        if looks_like_skip(r.text):
            continue
        nxt_scale = match_known_scale(rows, i + 1) if i + 1 < n else None
        if nxt_scale:
            stem_flags[i] = True
        if r.key in ger_stem_keys or r.key in ger_q_keys:
            stem_flags[i] = True

    # Walk sections
    questions: list[dict] = []
    current_section = "Background"
    i = 0
    while i < n:
        r = rows[i]
        if i + 1 < n and rows[i + 1].text == "[Section]":
            current_section = r.text or current_section
            i += 2
            continue
        if r.uid in META_KEYS or r.text == "[Section]" or not r.text:
            i += 1
            continue
        if looks_like_skip(r.text):
            i += 1
            continue
        if not stem_flags[i] and not match_known_scale(rows, i + 1 if i + 1 < n else n):
            i += 1
            continue

        stem = r.text
        i += 1
        scale = match_known_scale(rows, i)
        options: list[str] = []
        items: list[str] = []
        if scale:
            options = list(scale)
            i += len(scale)
            while i < n:
                rr = rows[i]
                if rr.text == "[Section]":
                    break
                if i + 1 < n and rows[i + 1].text == "[Section]":
                    break
                if stem_flags[i]:
                    break
                if looks_like_skip(rr.text):
                    break
                if looks_like_new_question(rr.text) and items:
                    break
                if looks_like_new_question(rr.text) and not items and rr.key not in ger_q_keys:
                    # inserted question that stole no items yet — only break if
                    # this is clearly not the first item of *this* matrix.
                    # First-item "How often were you bullied?" is a stem already.
                    break
                if not rr.text:
                    i += 1
                    continue
                items.append(rr.text)
                i += 1
        else:
            while i < n:
                rr = rows[i]
                if rr.text == "[Section]":
                    break
                if i + 1 < n and rows[i + 1].text == "[Section]":
                    break
                if stem_flags[i]:
                    break
                if looks_like_skip(rr.text):
                    break
                if looks_like_new_question(rr.text) and options:
                    break
                if not rr.text:
                    i += 1
                    continue
                options.append(rr.text)
                i += 1

        # Split leftover inserted questions that were not flagged as stems.
        questions.append(
            {
                "section": current_section,
                "stem": stem,
                "options": options,
                "items": items,
                "row": r.idx,
            }
        )

        # If we broke on looks_like_new_question, parse that as its own single
        # question (options until next stem/section/skip).
        while i < n and looks_like_new_question(rows[i].text) and not stem_flags[i]:
            ins = rows[i]
            if looks_like_skip(ins.text):
                break
            i += 1
            ins_opts: list[str] = []
            while i < n:
                rr = rows[i]
                if rr.text == "[Section]" or (
                    i + 1 < n and rows[i + 1].text == "[Section]"
                ):
                    break
                if stem_flags[i]:
                    break
                if looks_like_skip(rr.text) or looks_like_new_question(rr.text):
                    break
                if not rr.text:
                    i += 1
                    continue
                ins_opts.append(rr.text)
                i += 1
            questions.append(
                {
                    "section": current_section,
                    "stem": ins.text,
                    "options": ins_opts,
                    "items": [],
                    "row": ins.idx,
                }
            )

    return questions, []


def merge_empty_intro_questions(questions: list[dict]) -> list[dict]:
    """Fold 0-option intro blocks (e.g. Peer Violence blurb) into the next question."""
    out: list[dict] = []
    pending = ""
    for q in questions:
        empty = not q["options"] and not q["items"]
        if empty and not looks_like_skip(q["stem"]):
            pending = (pending + " " + q["stem"]).strip()
            continue
        if pending:
            q = dict(q)
            q["stem"] = f"{pending} {q['stem']}".strip()
            pending = ""
        out.append(q)
    if pending:
        out.append(
            {
                "section": questions[-1]["section"] if questions else "",
                "stem": pending,
                "options": [],
                "items": [],
                "row": 0,
            }
        )
    return out


# ---------------------------------------------------------------------------
# Scale typing and codes
# ---------------------------------------------------------------------------

def is_prefer_not(label: str) -> bool:
    return bool(PREFER_NOT_RE.search(norm(label)))


def special_missing_code(label: str) -> int | None:
    text = norm(label)
    if not text:
        return None
    if is_prefer_not(text):
        return PREFER_NOT_CODE
    if DONT_KNOW_RE.match(text):
        return DONT_KNOW_CODE
    if NOT_APPLICABLE_RE.match(text):
        return NA_CODE
    return None


def is_special_missing(label: str) -> bool:
    return special_missing_code(label) is not None


def frequency_rank(label: str) -> int | None:
    k = norm_key(label)
    for rank, phrases in FREQUENCY_RANKS:
        for p in phrases:
            if k == p or k.startswith(p + " ") or k.endswith(" " + p):
                return rank
    return None


def is_frequency_scale(labels: list[str]) -> bool:
    keys = [norm_key(x) for x in labels if not is_special_missing(x)]
    if len(keys) < 2:
        return False
    blob = " ".join(keys)
    return any(h in blob for h in FREQ_HINTS)


def reverse_frequency_values(labels: list[str]) -> bool:
    """True if questionnaire order puts high frequency before low frequency."""
    if not is_frequency_scale(labels):
        return False
    ranks = [frequency_rank(x) for x in labels if not is_special_missing(x)]
    ranks = [r for r in ranks if r is not None]
    if len(ranks) < 2:
        return False
    return ranks[0] > ranks[-1]


def option_value(label: str, order: int, scale: str) -> int | None:
    special = special_missing_code(label)
    if special is not None:
        return special
    m = NUMBERED_LABEL_RE.match(label.strip())
    if m:
        return int(m.group(1))
    # Pure integers (years, ages, ladder rungs, sibling counts).
    if re.fullmatch(r"-?\d+", label.strip()):
        return int(label.strip())
    if scale == "text":
        return None
    if scale == "interval":
        if label.lower().startswith("bottom"):
            return 1
        if label.lower().startswith("top"):
            return 10
        return None
    if scale == "ordinal":
        return order  # 0..k-1
    if scale == "nominal":
        return order + 1  # 1..k
    return order


def classify_scale(
    stem: str,
    items: list[str],
    options: list[str],
    variables: list[str],
) -> tuple[str, str, str, str]:
    """Return (scale, question_type, confidence, options_complete_hint)."""
    vars_l = {v for v in variables}
    stem_k = norm_key(stem)
    opt_tuple = tuple(norm_key(o) for o in options)
    opt_set = set(opt_tuple)

    if any(v in TEXT_VAR_HINTS for v in vars_l) or stem_k in {"describe", "describe:"}:
        return "text", "text", "high", "true"
    if not options and not any(v in INTERVAL_VAR_HINTS for v in vars_l):
        if any("describe" in (it or "").lower() for it in items + [stem]):
            return "text", "text", "high", "true"
        return "nominal", "single", "medium", "false"

    if any(v in INTERVAL_VAR_HINTS for v in vars_l) or opt_tuple == (
        "bottom of the ladder",
        "top of the ladder",
    ):
        return "interval", "interval", "high", "true"

    # Consecutive integer options (years, ages) → interval.
    ints = []
    if options and all(re.fullmatch(r"-?\d+", o.strip()) for o in options):
        ints = [int(o.strip()) for o in options]
        if ints == list(range(ints[0], ints[0] + len(ints))):
            return "interval", "interval", "high", "true"

    if opt_tuple in ORDINAL_SCALE_NORMS or opt_tuple[::-1] in ORDINAL_SCALE_NORMS:
        qtype = "matrix" if len(items) > 1 else "single"
        return "ordinal", qtype, "high", "true"

    # Months
    months = {
        "january", "february", "march", "april", "may", "june",
        "july", "august", "september", "october", "november", "december",
    }
    if opt_set <= months and len(opt_set) >= 10:
        return "ordinal", "single", "high", "true"

    # Education / grade fragments
    if "education" in stem_k or "grade are you in" in stem_k:
        return "ordinal", "single", "high", "true"
    if "siblings" in stem_k:
        return "ordinal", "single", "high", "true"

    core_opts = {k for k in opt_set if special_missing_code(k) is None}
    yes_no = core_opts <= {"yes", "no"} and "yes" in core_opts and "no" in core_opts
    if yes_no:
        qtype = "matrix" if len(items) > 1 else "single"
        return "nominal", qtype, "high", "true"

    # Likert-ish wording
    joined = " | ".join(opt_tuple)
    if any(w in joined for w in (
        "agree", "disagree", "never", "often", "rarely", "always",
        "somewhat", "strongly", "difficult", "einfach", "schwierig",
        "not at all", "quite a bit", "once in a while", "half the time",
    )):
        qtype = "matrix" if len(items) > 1 else "single"
        return "ordinal", qtype, "high", "true"

    if len(items) > 1:
        return "nominal", "matrix", "medium", "true"
    return "nominal", "single", "high", "true"


def is_multiple(stem: str, item_text: str = "") -> bool:
    blob = f"{stem} {item_text}"
    return bool(MULTIPLE_RE.search(blob))


def make_options(
    labels: list[str],
    scale: str,
    id_map: dict[str, str] | None = None,
    aliases: dict[str, list[str]] | None = None,
) -> list[Option]:
    id_map = id_map or {}
    aliases = aliases or {}
    out: list[Option] = []
    # Month special-case: January=1
    month_order = [
        "january", "february", "march", "april", "may", "june",
        "july", "august", "september", "october", "november", "december",
    ]
    is_months = {norm_key(x) for x in labels} <= set(month_order) and len(labels) >= 10
    core_keys = {norm_key(x) for x in labels if not is_special_missing(x)}
    is_yes_no = core_keys == {"yes", "no"} or core_keys == {"ja", "nein"}
    reverse_freq = scale == "ordinal" and reverse_frequency_values(labels)
    freq_idx = [
        i for i, lab in enumerate(labels)
        if frequency_rank(lab) is not None and not is_special_missing(lab)
    ]
    n_freq = len(freq_idx)
    freq_pos = {i: j for j, i in enumerate(freq_idx)}
    regular_i = 0

    for order, lab in enumerate(labels):
        special = special_missing_code(lab)
        if special is not None:
            value = special
        elif is_yes_no:
            value = 0 if norm_key(lab) in {"no", "nein"} else 1
        elif is_months:
            value = month_order.index(norm_key(lab)) + 1 if norm_key(lab) in month_order else order + 1
        elif scale == "interval" and re.fullmatch(r"-?\d+", lab.strip()):
            value = int(lab.strip())
        elif reverse_freq and order in freq_pos:
            value = n_freq - 1 - freq_pos[order]
        else:
            value = option_value(lab, regular_i, scale)
            regular_i += 1
        aid = ""
        # lookup by exact, then casefold
        if lab in id_map:
            aid = id_map[lab]
        else:
            for k, v in id_map.items():
                if norm_key(k) == norm_key(lab):
                    aid = v
                    break
        with_id = f"{lab} ({aid})" if aid else ""
        als = list(aliases.get(lab, []))
        out.append(
            Option(
                label=lab,
                order=order,
                value=value,
                eusurvey_answer_id=aid or None,
                label_with_id=with_id or None,
                aliases=als,
            )
        )
    return out


def id_map_from_group(gvars: list[GerVar]) -> dict[str, str]:
    """Merge observed label→ID maps within a group (same scale)."""
    merged: dict[str, str] = {}
    for gv in gvars:
        for lab, aid in gv.observed_ids.items():
            if aid:
                merged.setdefault(lab, aid)
                merged.setdefault(norm_key(lab), aid)
    return merged


def observed_labels(gvars: list[GerVar]) -> list[str]:
    seen = []
    got = set()
    for gv in gvars:
        for lab in gv.observed_plain:
            k = norm_key(lab)
            if k not in got:
                got.add(k)
                seen.append(lab)
    return seen


def complete_ger_options(stem: str, items_text: list[str], observed: list[str]) -> tuple[list[str], str, dict[str, list[str]]]:
    """Return (labels, options_complete, aliases)."""
    obs_k = {norm_key(x) for x in observed}
    blob = norm_key(stem + " " + " ".join(items_text))
    sma_keys = {norm_key(x) for x in SMA_LIKERT}
    numbered = any(NUMBERED_LABEL_RE.match(o.strip()) for o in observed)

    if numbered or "gaming (addiction" in blob:
        nums = {int(m.group(1)) for o in observed if (m := NUMBERED_LABEL_RE.match(o.strip()))}
        complete = "true" if {0, 1, 2, 3, 4} <= nums else "inferred"
        return list(GAMING_LIKERT), complete, {}

    if "social media use (addiction" in blob or (
        obs_k and obs_k <= sma_keys and "social media" in blob and not numbered
    ):
        n_hit = len(obs_k & sma_keys)
        if n_hit >= 3:
            complete = "true" if n_hit >= 5 else "inferred"
            return list(SMA_LIKERT), complete, {}

    if obs_k and obs_k <= {norm_key(x) for x in PTSD_FREQ}:
        if "bothered you" in blob or obs_k & {"once in a while", "half the time", "almost always"}:
            return list(PTSD_FREQ), "true", {}

    if obs_k and obs_k <= {"yes", "no"}:
        if "stressful" in blob or "scary" in blob or "happened to you" in blob:
            return list(CATS_YN), "true", {}
        return list(CATS_YN), "true", {}

    if obs_k & {"eher einfach", "eher schwierig", "very easy", "very difficult"}:
        return list(MHLS_SCALE), "true" if len(obs_k) >= 4 else "inferred", MHLS_ALIASES

    if not observed:
        return [], "false", {}

    return observed, "false", {}


# ---------------------------------------------------------------------------
# Union
# ---------------------------------------------------------------------------

def unique_group_id(used: set[str], stem: str, fallback: str) -> str:
    base = slugify(stem, fallback)
    gid = base
    n = 2
    while gid in used:
        gid = f"{base}_{n}"
        n += 1
    used.add(gid)
    return gid


def fhi_generated_id(section: str, n: int) -> str:
    return f"{slugify(section, 'fhi')}_{n:02d}"


def attach_ids_to_options(options: list[Option], id_map: dict[str, str]) -> None:
    for opt in options:
        if opt.eusurvey_answer_id:
            continue
        aid = id_map.get(opt.label) or id_map.get(norm_key(opt.label))
        if not aid:
            for k, v in id_map.items():
                if norm_key(k) == norm_key(opt.label):
                    aid = v
                    break
        if aid:
            opt.eusurvey_answer_id = aid
            opt.label_with_id = f"{opt.label} ({aid})"


def build_codebook() -> tuple[list[Question], list[GerVar]]:
    ger_vars = parse_german()
    ger_groups = group_german_vars(ger_vars)

    ger_stems = {gv.stem for gv in ger_vars if gv.stem}
    ger_questions = set()
    for gv in ger_vars:
        if gv.stem and not gv.item_text:
            ger_questions.add(gv.stem)
        ger_questions.add(gv.header)

    fhi_qs, _ = parse_fhi(ger_stems, ger_questions)
    fhi_qs = merge_empty_intro_questions(fhi_qs)

    # Indexes for matching
    fhi_by_item: dict[str, list[int]] = defaultdict(list)
    fhi_by_stem: dict[str, list[int]] = defaultdict(list)
    for i, q in enumerate(fhi_qs):
        fhi_by_stem[norm_key(q["stem"])].append(i)
        if q["items"]:
            for it in q["items"]:
                fhi_by_item[norm_key(it)].append(i)
        else:
            fhi_by_item[norm_key(q["stem"])].append(i)

    used_fhi: set[int] = set()
    used_ger_vars: set[str] = set()
    used_gids: set[str] = set()
    codebook: list[Question] = []

    def ger_group_for_fhi(fq: dict) -> list[GerVar] | None:
        """Find German vars whose items/stems match this FHI question."""
        matched: list[GerVar] = []
        item_keys = [norm_key(it) for it in fq["items"]]
        stem_k = norm_key(fq["stem"])
        for gv in ger_vars:
            if gv.variable in used_ger_vars or gv.variable in MATRIX_TITLE_VARS:
                continue
            ik = norm_key(gv.item_text)
            sk = norm_key(gv.stem)
            hk = norm_key(gv.header)
            if fq["items"]:
                if ik and ik in item_keys and (not sk or sk == stem_k or stem_k in sk or sk in stem_k):
                    matched.append(gv)
                elif ik and ik in item_keys and len(ik) >= 12:
                    matched.append(gv)
            else:
                if (sk == stem_k or hk == stem_k) and not gv.item_text:
                    matched.append(gv)
                elif not gv.item_text and ik == stem_k:
                    matched.append(gv)
        return matched or None

    # Walk FHI in order (preserves questionnaire flow).
    section_counters: dict[str, int] = defaultdict(int)
    for fi, fq in enumerate(fhi_qs):
        gmatch = ger_group_for_fhi(fq) or []
        # Keep questionnaire order of FHI items; attach GER variable when matched.
        items: list[Item] = []
        g_by_item = {norm_key(gv.item_text): gv for gv in gmatch if gv.item_text}
        g_singles = [gv for gv in gmatch if not gv.item_text]

        if fq["items"]:
            for it in fq["items"]:
                gv = g_by_item.get(norm_key(it))
                if gv:
                    used_ger_vars.add(gv.variable)
                    items.append(
                        Item(
                            variable=gv.variable,
                            item_text=it,
                            source="both",
                            ger_header=gv.header,
                        )
                    )
                else:
                    section_counters[fq["section"]] += 1
                    vid = fhi_generated_id(fq["section"], section_counters[fq["section"]])
                    items.append(Item(variable=vid, item_text=it, source="fhi_only"))
            source = "both" if any(it.source == "both" for it in items) else "fhi_only"
            if source == "both" and any(it.source == "fhi_only" for it in items):
                source = "both"
        else:
            if g_singles:
                gv = g_singles[0]
                used_ger_vars.add(gv.variable)
                items.append(
                    Item(
                        variable=gv.variable,
                        item_text="",
                        source="both",
                        ger_header=gv.header,
                    )
                )
                source = "both"
            else:
                section_counters[fq["section"]] += 1
                vid = fhi_generated_id(fq["section"], section_counters[fq["section"]])
                items.append(Item(variable=vid, item_text="", source="fhi_only"))
                source = "fhi_only"

        used_fhi.add(fi)
        variables = [it.variable for it in items]
        scale, qtype, conf, _ = classify_scale(
            fq["stem"], [it.item_text for it in items], fq["options"], variables
        )
        if len(items) > 1:
            qtype = "matrix"
        elif scale == "interval":
            qtype = "interval"
        elif scale == "text":
            qtype = "text"
        else:
            qtype = "single"

        if qtype == "interval" and fq["options"] == ["Bottom of the ladder", "Top of the ladder"]:
            labels = [str(i) for i in range(1, 11)]
            notes = "MacArthur ladder 1 (bottom) to 10 (top). FHI only stores endpoint labels."
            opts = make_options(labels, "interval")
            opts[0].label = "1"
            opts[0].aliases = ["Bottom of the ladder"]
            opts[-1].label = "10"
            opts[-1].aliases = ["Top of the ladder"]
            options_complete = "true"
        elif "what grade are you in" in norm_key(fq["stem"]):
            notes = (
                "Options 'graduated from school' (code 6) and 'quit school before graduating' "
                "(code 7) are terminal non-enrolled statuses; exclude or handle separately when "
                "treating grade level as continuous/ordinal."
            )
            id_map = id_map_from_group(gmatch)
            opts = make_options(fq["options"], scale, id_map)
            options_complete = "true" if fq["options"] else ("true" if scale == "text" else "false")
        else:
            notes = ""
            id_map = id_map_from_group(gmatch)
            opts = make_options(fq["options"], scale, id_map)
            options_complete = "true" if fq["options"] else ("true" if scale == "text" else "false")

        multiple = is_multiple(fq["stem"]) or any(
            is_multiple(fq["stem"], it.item_text) for it in items
        )
        gid = unique_group_id(used_gids, fq["stem"], f"q{fi}")
        codebook.append(
            Question(
                group_id=gid,
                section=fq["section"],
                stem=fq["stem"],
                question_type=qtype,
                scale=scale,
                scale_confidence=conf,
                multiple=multiple,
                options=opts,
                items=items,
                options_complete=options_complete,
                source=source,
                notes=notes,
            )
        )

    # Remaining German variables → ger_only, grouped.
    for grp in ger_groups:
        rest = [
            gv
            for gv in grp
            if gv.variable not in used_ger_vars and gv.variable not in MATRIX_TITLE_VARS
        ]
        if not rest:
            continue
        stem = infer_group_stem(grp)
        item_texts = []
        items = []
        for gv in rest:
            itext = gv.item_text or ""
            item_texts.append(itext)
            items.append(
                Item(
                    variable=gv.variable,
                    item_text=itext,
                    source="ger_only",
                    ger_header=gv.header,
                )
            )
        observed = observed_labels(rest)
        labels, completeness, aliases = complete_ger_options(stem, item_texts, observed)
        variables = [it.variable for it in items]
        scale, qtype, conf, _ = classify_scale(stem, item_texts, labels, variables)
        if any(gv.variable in TEXT_VAR_HINTS for gv in rest) or (
            not labels and any("describe" in (gv.header or "").lower() for gv in rest)
        ):
            scale, qtype, conf = "text", "text", "high"
            labels, completeness = [], "true"
        if len(items) > 1 and qtype not in {"text"}:
            qtype = "matrix"
        elif qtype not in {"text", "interval"}:
            qtype = "single"
        id_map = id_map_from_group(rest)
        opts = make_options(labels, scale, id_map, aliases)
        # Attach alias label_with_id variants for MHLS
        if aliases:
            for opt in opts:
                extra = []
                for a in opt.aliases:
                    aid = id_map.get(a) or id_map.get(norm_key(a))
                    if aid:
                        extra.append(f"{a} ({aid})")
                    # also map observed German labels onto this option
                for lab, aid in id_map.items():
                    if norm_key(lab) == norm_key(opt.label) or lab in opt.aliases:
                        opt.eusurvey_answer_id = opt.eusurvey_answer_id or aid
                        opt.label_with_id = opt.label_with_id or (f"{lab} ({aid})" if aid else None)
        multiple = is_multiple(stem)
        gid = unique_group_id(used_gids, stem, rest[0].variable)
        section = infer_ger_section(stem, rest)
        notes = ""
        if "how often did you experience such problems" in norm_key(stem):
            notes = (
                "Observed test export options: 'not at all' (0), 'only on single days' (1). "
                "Full questionnaire scale includes 'longer periods of several days or months' (2) "
                "and 'almost daily' (3)."
            )
        elif completeness == "false" and not labels:
            notes = "Follow-up routing question. Unanswered in test export (0 options observed)."
        elif completeness == "inferred":
            notes = "Option list inferred from a parallel scale / incomplete test answers."
        elif completeness == "false":
            notes = "Option list from observed test answers only; may be incomplete."
        codebook.append(
            Question(
                group_id=gid,
                section=section,
                stem=stem,
                question_type=qtype,
                scale=scale,
                scale_confidence=conf,
                multiple=multiple,
                options=opts,
                items=items,
                options_complete=completeness,
                source="ger_only",
                notes=notes,
            )
        )

    assign_short_names(codebook)
    return codebook, ger_vars


# ---------------------------------------------------------------------------
# Short analysis names (≤8 letter/underscore stem + item number on that scale)
# ---------------------------------------------------------------------------

STEM_MAX = 8
SHORT_NAME_RE = re.compile(r"^(?:bcfpi_[a-z]+|[a-z_]{1,8})\d+$")


def _shared_letter_prefix(items: list[Item]) -> str | None:
    prefs: list[str] = []
    for it in items:
        m = re.fullmatch(r"([a-z][a-z_]{0,7})(\d+)$", it.variable, re.I)
        if not m:
            return None
        p = m.group(1).lower()
        if p in {"id", "item"}:
            return None
        prefs.append(p)
    if prefs and len(set(prefs)) == 1:
        return prefs[0]
    return None


def _abbrev_stem(text: str) -> str:
    words = re.findall(r"[a-z]+", norm_key(text))
    stop = {
        "the", "a", "an", "of", "and", "or", "to", "in", "your", "you", "do",
        "did", "how", "what", "when", "for", "with", "that", "this", "are",
        "is", "was", "were", "best", "please", "select",
    }
    keep = [w for w in words if w not in stop] or words
    acro = "".join(w[0] for w in keep)[:STEM_MAX]
    if len(acro) >= 3:
        return acro
    return (keep[0] if keep else "var")[:STEM_MAX]


def propose_stem(q: Question) -> str:
    first = q.items[0].variable if q.items else ""
    stem_k = norm_key(q.stem)
    item0 = norm_key(q.items[0].item_text if q.items else "")
    blob = f"{stem_k} {item0}"
    sec = q.section

    if "wish to participate" in stem_k:
        return "consent"
    if "what gender do you identify" in stem_k:
        return "gender"
    if "what do you identify as" in stem_k:
        return "ident"
    if "what grade are you in" in stem_k:
        return "grade"
    if "what year were you born" in stem_k:
        return "byear"
    if "what month were you born" in stem_k:
        return "bmonth"
    if "where were you born" in stem_k and "mother" not in stem_k and "father" not in stem_k:
        return "bplace"
    if "how old were you when you came" in stem_k:
        return "bage"
    if "mother born" in stem_k:
        return "bmborn"
    if "father born" in stem_k:
        return "bfborn"
    if "thinking about the people you live with" in stem_k:
        return "live"
    if "which adults do you live with" in stem_k:
        return "livead"
    if "what best describes your situation" in stem_k:
        return "livesp"
    if "mother have a new partner" in stem_k:
        return "momprt"
    if "father have a new partner" in stem_k:
        return "dadprt"
    if "siblings" in stem_k:
        return "sibs"
    if "mother" in stem_k and "education" in stem_k:
        return "edumom"
    if "father" in stem_k and "education" in stem_k:
        return "edudad"
    if "imagine a ladder" in stem_k:
        return "ladder"
    if "usually afford" in stem_k:
        return "afford"

    if sec == "Mental health":
        m = re.fullmatch(r"([a-z][a-z_]{0,7})\d+$", first.lower())
        if m and m.group(1) != "id":
            return f"bcfpi_{m.group(1)}"

    if sec.startswith("Adverse"):
        ace_needles = (
            ("understand your problems", "acepar"),
            ("not give you enough food", "aceneg"),
            ("problem drinker", "acehh"),
            ("yelled at, screamed at, sworn at", "acefam"),
            ("swear at you, insult", "aceyou"),
            ("how often were you bullied", "acebull"),
            ("how were you bullied", "acehow"),
            ("physical fight", "acefght"),
            ("beaten up in real life", "acenbr"),
            ("forced to go and live", "acewar"),
        )
        for needle, st in ace_needles:
            if needle in blob:
                return st
        return "ace"

    if "to what extent do the following" in stem_k:
        return "cyrm"
    if sec == "Quality of life":
        return "qol" if first.lower().startswith("quality") else "ks"
    if "normal weekday" in stem_k:
        return "smwd"
    if "normal weekend" in stem_k:
        return "smwe"
    if "when gaming on your console" in stem_k:
        return "playwith"
    if "do you ever use ai" in stem_k:
        return "ai"
    if "usually use ai" in stem_k:
        return "aiuse"
    if "positive feelings after" in stem_k:
        return "smpos"
    if "negative feelings after" in stem_k:
        return "smneg"
    if "negative effect" in stem_k:
        return "smharm"
    if "apps or services" in stem_k:
        return "apps"
    if "stressful or scary" in stem_k:
        return "cats"
    if stem_k.startswith("describe"):
        return "catsoth"
    if "bothered you in the last two weeks" in stem_k:
        return "ptsd"
    if "social media use (addiction" in stem_k:
        return "sma"
    if "gaming (addiction" in stem_k:
        return "igd"
    if "easy or difficult" in stem_k:
        return "mhls"
    if "how often did you experience such problems" in stem_k:
        return "igdfreq" if first == "ID383" else "smafreq"
    if "have you been experiencing the problems" in stem_k:
        return "smayr"
    if "have you often experienced such prolonged" in stem_k:
        return "smaonce"
    if "how long did a period like that last" in stem_k:
        return "smadur"
    if "erlebst du die unter" in stem_k:
        return "igdyr"
    if "hattest du solch" in stem_k:
        return "igdonce"
    if "wie lange dauerte" in stem_k:
        return "igddur"

    pref = _shared_letter_prefix(q.items)
    if pref:
        return pref
    return _abbrev_stem(q.stem)


def _unique_stem(base: str, used: set[str]) -> str:
    raw = re.sub(r"[^a-z_]", "", (base or "var").lower()) or "var"
    if raw.startswith("bcfpi_"):
        s = raw
        limit = None
    else:
        s = raw[:STEM_MAX]
        limit = STEM_MAX
    if s not in used:
        return s
    for ch in "abcdefghijklmnopqrstuvwxyz":
        if limit is None:
            cand = s + ch
        else:
            cand = (s[: limit - 1] + ch) if len(s) >= limit else s + ch
        if cand not in used:
            return cand
    raise RuntimeError(f"Could not uniquify stem {base!r}")


def assign_short_names(codebook: list[Question]) -> None:
    used_stems: set[str] = set()
    used_names: set[str] = set()
    for q in codebook:
        stem = _unique_stem(propose_stem(q), used_stems)
        used_stems.add(stem)
        n = len(q.items)
        width = 2 if n >= 10 else 1
        for i, it in enumerate(q.items, 1):
            name = f"{stem}{i:0{width}d}"
            if name in used_names:
                raise RuntimeError(f"Duplicate short name {name} for {it.variable}")
            if not SHORT_NAME_RE.match(name):
                raise RuntimeError(f"Invalid short name {name!r}")
            it.short_name = name
            used_names.add(name)


def short_name_range(q: Question) -> str:
    names = [it.short_name or it.variable for it in q.items]
    if not names:
        return ""
    if len(names) == 1:
        return names[0]
    return f"{names[0]}–{names[-1]}"


def infer_ger_section(stem: str, gvars: list[GerVar]) -> str:
    var_ids = {gv.variable for gv in gvars}
    blob = norm_key(stem + " " + " ".join(gv.item_text or gv.header for gv in gvars))
    if "stressful or scary" in blob or blob.startswith("describe"):
        return "German-only · CATS trauma"
    if "bothered you in the last two weeks" in blob:
        return "German-only · PTSD symptoms"
    if "gaming (addiction" in blob:
        return "German-only · Gaming addiction"
    if "social media use (addiction" in blob:
        return "German-only · Social media addiction"
    if "ID383" in var_ids or any("spiel" in (gv.header or "").lower() for gv in gvars):
        return "German-only · Gaming follow-up (DE)"
    if "easy or difficult" in blob or "eher" in blob:
        return "German-only · Mental health literacy"
    if "social media" in blob:
        return "German-only · Social media follow-up"
    return "German-only"


# ---------------------------------------------------------------------------
# CSV
# ---------------------------------------------------------------------------

def write_csv(codebook: list[Question]) -> None:
    OUT_DIR.mkdir(exist_ok=True)
    var_path = OUT_DIR / "codebook_variables.csv"
    opt_path = OUT_DIR / "codebook_options.csv"

    with var_path.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(
            f,
            fieldnames=[
                "variable",
                "orig_variable",
                "group_id",
                "section",
                "question_stem",
                "item_text",
                "scale",
                "question_type",
                "n_options",
                "multiple",
                "source",
                "options_complete",
                "scale_confidence",
                "notes",
            ],
        )
        w.writeheader()
        for q in codebook:
            for it in q.items:
                w.writerow(
                    {
                        "variable": it.short_name or it.variable,
                        "orig_variable": it.variable,
                        "group_id": q.group_id,
                        "section": q.section,
                        "question_stem": q.stem,
                        "item_text": it.item_text,
                        "scale": q.scale,
                        "question_type": q.question_type,
                        "n_options": len(q.options),
                        "multiple": str(q.multiple).lower(),
                        "source": it.source if it.source != q.source else q.source,
                        "options_complete": q.options_complete,
                        "scale_confidence": q.scale_confidence,
                        "notes": q.notes,
                    }
                )

    with opt_path.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(
            f,
            fieldnames=[
                "variable",
                "orig_variable",
                "group_id",
                "option_order",
                "option_label",
                "option_label_with_id",
                "option_alias",
                "eusurvey_answer_id",
                "value",
                "scale",
                "multiple",
                "source",
                "options_complete",
            ],
        )
        w.writeheader()
        for q in codebook:
            for it in q.items:
                if not q.options:
                    continue
                for opt in q.options:
                    aliases = opt.aliases or [""]
                    # Primary row uses the canonical label; extra alias rows
                    # let R match either export language/wording.
                    labels_to_write = [(opt.label, "")]
                    for a in opt.aliases:
                        if a and norm_key(a) != norm_key(opt.label):
                            labels_to_write.append((a, a))
                    for lab, alias in labels_to_write:
                        with_id = opt.label_with_id
                        if alias and opt.eusurvey_answer_id:
                            with_id = f"{lab} ({opt.eusurvey_answer_id})"
                        elif alias:
                            with_id = ""
                        w.writerow(
                            {
                                "variable": it.short_name or it.variable,
                                "orig_variable": it.variable,
                                "group_id": q.group_id,
                                "option_order": opt.order,
                                "option_label": lab,
                                "option_label_with_id": with_id or "",
                                "option_alias": alias,
                                "eusurvey_answer_id": opt.eusurvey_answer_id or "",
                                "value": "" if opt.value is None else opt.value,
                                "scale": q.scale,
                                "multiple": str(q.multiple).lower(),
                                "source": it.source,
                                "options_complete": q.options_complete,
                            }
                        )


# ---------------------------------------------------------------------------
# HTML
# ---------------------------------------------------------------------------

def toc_question_label(q: Question, codebook: list[Question]) -> str:
    stem_k = norm_key(q.stem)
    dup = sum(1 for x in codebook if norm_key(x.stem) == stem_k) > 1
    label = q.stem
    if dup and q.items and q.items[0].item_text:
        label = f"{q.stem} — {q.items[0].item_text}"
    if len(label) > 80:
        label = label[:77] + "..."
    return label


TYPE_LABELS = {
    "single": "Single",
    "matrix": "Matrix",
    "interval": "Numeric",
    "text": "Free text",
}
SOURCE_LABELS = {
    "both": "Both sources",
    "fhi_only": "FHI only",
    "ger_only": "German only",
}
SCALE_LABELS = {
    "interval": "Interval",
    "ordinal": "Ordinal",
    "nominal": "Nominal",
    "text": "Free text",
}
CONF_LABELS = {
    "high": "High confidence",
    "medium": "Medium confidence",
    "low": "Low confidence",
}
BCFPI_NOTE = (
    "These items are from the youth version of the Brief Child and Family Phone "
    "Interview (BCFPI)."
)


def numeric_range_note(q: Question) -> str:
    vals = [
        o.value for o in q.options
        if o.value is not None and o.value not in SPECIAL_CODES
    ]
    if vals:
        lo, hi = min(vals), max(vals)
        return (
            f"Numeric response stored as-is (range {lo}–{hi}). "
            "Individual listed values are omitted here; see the CSV for recoding."
        )
    return "Numeric response stored as-is. See the CSV for recoding."


def option_table(q: Question) -> str:
    if q.scale == "interval":
        return f"<p class='note'>{escape(numeric_range_note(q))}</p>"
    if not q.options:
        if q.scale == "text":
            return "<p class='note'>Free-text response — no numeric codes.</p>"
        return (
            "<p class='note'>No response options recovered "
            "(not answered in the test export).</p>"
        )
    body = []
    show_alias = any(o.aliases for o in q.options)
    show_id = any(o.eusurvey_answer_id for o in q.options)
    for o in q.options:
        alias = ", ".join(escape(a) for a in o.aliases) if o.aliases else ""
        aid = escape(o.eusurvey_answer_id or "")
        val = "" if o.value is None else o.value
        cells = [
            f"<td>{o.order}</td>",
            f"<td>{escape(o.label)}</td>",
            f"<td>{val}</td>",
        ]
        if show_id:
            cells.append(f"<td class='mono'>{aid}</td>")
        if show_alias:
            cells.append(f"<td>{alias}</td>")
        row_cls = " class='special'" if o.value in SPECIAL_CODES else ""
        body.append(f"<tr{row_cls}>" + "".join(cells) + "</tr>")
    heads = ["#", "Response option", "Value"]
    if show_id:
        heads.append("EUSurvey ID")
    if show_alias:
        heads.append("Aliases")
    thead = "".join(f"<th>{h}</th>" for h in heads)
    return (
        "<p class='block-label'>Response options</p>"
        "<table class='opts'><thead><tr>"
        + thead
        + "</tr></thead><tbody>"
        + "".join(body)
        + "</tbody></table>"
    )


def name_chip(short: str) -> str:
    return f"<span class='vnew'>{escape(short)}</span>"


def orig_note(orig: str) -> str:
    return f"<span class='vorig'>original: {escape(orig)}</span>"


def item_block(q: Question) -> str:
    is_matrix = q.question_type == "matrix" or len(q.items) > 1
    if is_matrix:
        rows = []
        for it in q.items:
            short = it.short_name or it.variable
            rows.append(
                "<tr>"
                f"<td>{name_chip(short)}</td>"
                f"<td class='mono vorig-cell'>{escape(it.variable)}</td>"
                f"<td>{escape(it.item_text)}</td>"
                "</tr>"
            )
        return (
            "<p class='block-label'>Items</p>"
            "<table class='items'><thead><tr>"
            "<th>Name</th><th>Original</th><th>Item</th>"
            "</tr></thead><tbody>"
            + "".join(rows)
            + "</tbody></table>"
        )
    it = q.items[0]
    short = it.short_name or it.variable
    extra = f" — {escape(it.item_text)}" if it.item_text else ""
    return (
        f"<p class='varline'>{name_chip(short)} {orig_note(it.variable)}"
        f"{extra}</p>"
    )


def write_html(codebook: list[Question]) -> None:
    OUT_DIR.mkdir(exist_ok=True)
    n_items = sum(len(q.items) for q in codebook)
    n_q = len(codebook)
    by_source = Counter(q.source for q in codebook)
    n_incomplete = sum(1 for q in codebook if q.options_complete != "true")
    sections = []
    for q in codebook:
        if q.section not in sections:
            sections.append(q.section)

    cards = []
    for q in codebook:
        type_key = "single"
        if q.multiple:
            type_label = "Multi-select"
            type_key = "multi"
        elif q.question_type == "matrix" or len(q.items) > 1:
            type_label = "Matrix"
            type_key = "matrix"
        else:
            type_label = TYPE_LABELS.get(q.question_type, q.question_type.title())
            type_key = q.question_type if q.question_type in TYPE_LABELS else "single"

        conf = q.scale_confidence if q.scale_confidence in CONF_LABELS else "medium"
        flags = [
            f'<span class="box type-{escape(type_key)}">{escape(type_label)}</span>',
            f'<span class="box conf-{escape(conf)}">{escape(CONF_LABELS[conf])}</span>',
            f'<span class="box scale-{escape(q.scale)}">'
            f'{escape(SCALE_LABELS.get(q.scale, q.scale))}</span>',
            f'<span class="box src-{escape(q.source)}">'
            f'{escape(SOURCE_LABELS.get(q.source, q.source))}</span>',
        ]
        if q.options_complete == "inferred":
            flags.append('<span class="box warn">Options inferred</span>')
        elif q.options_complete == "false":
            flags.append('<span class="box bad">Options incomplete</span>')

        opt_rows = option_table(q)
        items_html = item_block(q)
        is_matrix = q.question_type == "matrix" or len(q.items) > 1
        body_html = f"{opt_rows}{items_html}" if is_matrix else f"{items_html}{opt_rows}"

        extra_notes = []
        bcfpi = ""
        if q.section == "Mental health":
            bcfpi = f"<p class='instrument'>{escape(BCFPI_NOTE)}</p>"
        if q.notes:
            extra_notes.append(q.notes)
        note = "".join(f"<p class='note'>{escape(n)}</p>" for n in extra_notes)

        cards.append(
            f"<article class='card' id='{escape(q.group_id)}' "
            f"data-section='{escape(q.section)}' data-source='{escape(q.source)}' "
            f"data-complete='{escape(q.options_complete)}' data-scale='{escape(q.scale)}'>"
            f"<header><div class='flags'>{''.join(flags)}</div>"
            f"<h2>{escape(q.stem)}</h2>"
            f"<p class='sec'>{escape(q.section)}</p></header>"
            f"{bcfpi}{body_html}{note}"
            f"</article>"
        )

    sec_nav = "".join(
        f"<button type='button' class='chip' data-section='{escape(s)}'>{escape(s)}</button>"
        for s in sections
    )

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>JA-MENTOR youth mental health codebook</title>
<style>
:root {{
  --bg: #f4f1ea;
  --paper: #fffcf7;
  --ink: #1c1914;
  --muted: #5c564c;
  --line: #d9d2c5;
  --accent: #6b3f1d;
  --both: #1f4d3a;
  --fhi: #1d3f6b;
  --ger: #6b1d2a;
  --ord: #3d4a1f;
  --nom: #4a2f1d;
  --int: #1d3f4a;
}}
* {{ box-sizing: border-box; }}
html, body {{ margin: 0; padding: 0; background: var(--bg); color: var(--ink);
  font: 16px/1.45 "Source Serif 4", "Iowan Old Style", Palatino, "Palatino Linotype", serif; }}
code, .mono {{ font-family: "IBM Plex Mono", "Source Code Pro", Consolas, monospace;
  font-size: 0.86em; }}
.wrap {{ max-width: 1280px; margin: 0 auto; padding: 32px 20px 80px; }}
header.hero h1 {{ font-size: 2rem; font-weight: 600; letter-spacing: -0.02em; margin: 0 0 8px; }}
header.hero .lede {{ color: var(--ink); font-size: 1.12rem; margin: 0 0 8px; max-width: 68ch; }}
header.hero .when {{ color: var(--muted); font-size: 0.88rem; margin: 0 0 18px; }}
.guide {{ display: grid; gap: 14px; margin: 0 0 8px; }}
.guide section {{ background: var(--paper); border: 1px solid var(--line);
  padding: 14px 18px 16px; }}
.guide h2 {{ font-size: 1.05rem; font-weight: 600; margin: 0 0 8px; }}
.guide p {{ color: var(--ink); margin: 0 0 8px; max-width: 72ch; }}
.guide p:last-child, .guide ul:last-child, .guide table:last-child {{ margin-bottom: 0; }}
.guide ul {{ margin: 4px 0 8px; padding-left: 1.2em; }}
.guide li {{ margin: 0 0 5px; max-width: 72ch; }}
.guide .codes {{ width: auto; max-width: 40rem; margin: 8px 0 0; }}
.guide .codes th, .guide .codes td {{ padding-right: 16px; }}
.guide .codes td:first-child {{
  font-family: "IBM Plex Mono", Consolas, monospace; font-weight: 600; white-space: nowrap; }}
.guide .vnew {{ font-size: inherit; }}
.guide .key {{ display: grid; gap: 14px; margin-top: 6px; }}
.guide .key-dim {{ font: 0.72rem/1.2 system-ui, sans-serif; text-transform: uppercase;
  letter-spacing: 0.04em; color: var(--muted); font-weight: 600; margin: 0 0 6px; }}
.guide .key-row .flags {{ margin-bottom: 6px; }}
.guide .key-row p {{ margin: 0; max-width: 72ch; }}
.filters {{ position: sticky; top: 0; z-index: 5; background: var(--bg);
  padding: 10px 0 12px; border-bottom: 1px solid var(--line); margin-bottom: 18px; }}
.filters h2 {{ font-size: 1.05rem; font-weight: 600; margin: 0 0 4px; }}
.filters .hint {{ color: var(--muted); font-size: 0.9rem; margin: 0 0 10px; max-width: 62ch; }}
.filters input {{ width: 100%; max-width: 420px; padding: 8px 10px; border: 1px solid var(--line);
  background: var(--paper); color: var(--ink); font: inherit; }}
.chips {{ display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }}
.chip {{ border: 1px solid var(--line); background: var(--paper); color: var(--ink);
  padding: 4px 10px; font: 0.82rem/1.3 system-ui, sans-serif; cursor: pointer; }}
.chip.on, .chip:hover {{ border-color: var(--accent); color: var(--accent); }}
.questions-label {{ font: 0.72rem/1.2 system-ui, sans-serif; text-transform: uppercase;
  letter-spacing: 0.04em; color: var(--muted); margin: 0 0 10px; }}
.body-grid {{ display: grid; grid-template-columns: minmax(0, 1fr) 280px;
  gap: 0 28px; align-items: start; }}
.col-main {{ min-width: 0; }}
.card {{ background: var(--paper); border: 1px solid var(--line); padding: 18px 20px 20px;
  margin: 0 0 16px; }}
.card.hidden {{ display: none; }}
.card h2 {{ font-size: 1.12rem; font-weight: 600; margin: 8px 0 4px; }}
.card .sec {{ color: var(--muted); font-size: 0.88rem; margin: 0 0 12px; }}
.flags {{ display: flex; flex-wrap: wrap; gap: 6px; }}
.box {{ font: 0.72rem/1.2 system-ui, sans-serif; letter-spacing: 0.03em; text-transform: uppercase;
  padding: 5px 8px; color: #fff; }}
.type-single {{ background: #a67c52; }}
.type-matrix {{ background: #7a4a1f; }}
.type-multi {{ background: #c47b17; }}
.type-interval {{ background: #8d6e4c; }}
.type-text {{ background: #5c4033; }}
.conf-high {{ background: #1e8449; }}
.conf-medium {{ background: #d4a017; color: #1c1914; }}
.conf-low {{ background: #c0392b; }}
.scale-interval {{ background: #aed6f1; color: #1b4f72; }}
.scale-ordinal {{ background: #5dade2; color: #0b2e4a; }}
.scale-nominal {{ background: #1a5276; }}
.scale-text {{ background: #0b2e4a; }}
.src-both {{ background: #117a65; }}
.src-fhi_only {{ background: #6c3483; }}
.src-ger_only {{ background: #922b21; }}
.box.warn {{ background: #e67e22; color: #1c1914; }}
.box.bad {{ background: #7b241c; }}
.block-label {{ font: 0.72rem/1.2 system-ui, sans-serif; text-transform: uppercase;
  letter-spacing: 0.04em; color: var(--muted); margin: 14px 0 4px; }}
table {{ width: 100%; border-collapse: collapse; font-size: 0.92rem; margin: 8px 0 4px; }}
th, td {{ text-align: left; vertical-align: top; padding: 6px 8px 6px 0; border-bottom: 1px solid var(--line); }}
th {{ font: 0.72rem/1.2 system-ui, sans-serif; text-transform: uppercase; letter-spacing: 0.04em;
  color: var(--muted); font-weight: 600; }}
.varline {{ margin: 0 0 10px; display: flex; flex-wrap: wrap; gap: 8px 14px; align-items: baseline; }}
.vnew {{
  display: inline-block;
  font-family: "IBM Plex Mono", "Source Code Pro", Consolas, monospace;
  font-size: 1rem;
  font-weight: 700;
  background: #ffe566;
  color: #1c1914;
  padding: 0 0.3em;
  border-radius: 2px;
  line-height: inherit;
}}
.vorig, .vorig-cell {{
  font-family: "IBM Plex Mono", "Source Code Pro", Consolas, monospace;
  font-size: 0.82rem;
  color: var(--muted);
}}
nav.toc .vnew {{ font-size: 1rem; padding: 0 0.3em; margin: 0 0 2px; }}
nav.toc {{
  position: sticky; top: 12px; max-height: calc(100vh - 24px); overflow: auto;
  font-size: 0.82rem; margin: 0; padding: 4px 0 16px 0;
  border-left: 1px solid var(--line); padding-left: 16px;
}}
nav.toc .toc-label {{ font: 0.72rem/1.2 system-ui, sans-serif; text-transform: uppercase;
  letter-spacing: 0.04em; color: var(--muted); margin: 0 0 10px; }}
nav.toc a {{ display: block; color: var(--accent); text-decoration: none;
  padding: 5px 0 6px; border-bottom: 1px solid var(--line); }}
nav.toc a:hover {{ text-decoration: none; }}
nav.toc .toc-q {{ display: block; color: var(--muted); font-size: 0.78rem; line-height: 1.3;
  margin-top: 2px; }}
nav.toc a.hidden {{ display: none; }}
@media (max-width: 960px) {{
  .body-grid {{ grid-template-columns: 1fr; }}
  nav.toc {{ position: static; max-height: none; border-left: 0; padding-left: 0;
    margin-top: 28px; border-top: 1px solid var(--line); padding-top: 16px; }}
}}
.note {{ color: var(--muted); font-size: 0.9rem; margin: 8px 0 0; }}
.opts tr.special td {{ color: var(--ger); }}
.opts tr.special td:nth-child(3) {{ font-family: "IBM Plex Mono", Consolas, monospace;
  font-weight: 600; }}
.instrument {{ background: #eaf2f8; color: #1b4f72; padding: 8px 10px; margin: 0 0 12px;
  font-size: 0.9rem; }}
.empty {{ color: var(--muted); padding: 24px 0; }}
</style>
</head>
<body>
<div class="wrap">
<header class="hero">
  <h1>JA-MENTOR codebook</h1>
  <p class="lede">This is the codebook for the <strong>youth mental health
  questionnaire</strong> used in the <strong>JA-MENTOR</strong> project.
  For every question it shows the wording, the allowed answers, and the numbers
  used to store those answers in a data file.</p>
  <p class="when">This page lists {n_q} questions ({n_items} items).
  Generated {date.today().isoformat()}.</p>

  <div class="guide">
    <section>
      <h2>What a codebook is for</h2>
      <p>Survey software stores answers as text (“Girl”, “Sometimes”). Analysis
      software needs numbers. A codebook records the mapping: which question is
      which column, and which answer becomes which number.</p>
      <p>Use the yellow name in analysis. The grey “original” name is what the
      German survey software (EUSurvey) called that column in the export.</p>
    </section>

    <section>
      <h2>Two versions of the questionnaire</h2>
      <p>The JA-MENTOR youth questionnaire exists in more than one draft.
      This codebook combines:</p>
      <ul>
        <li><strong>FHI English</strong> — the English questionnaire
        ({by_source.get("fhi_only", 0)} questions only in this version).</li>
        <li><strong>German test</strong> — a version run in EUSurvey, with a
        small set of test answers
        ({by_source.get("ger_only", 0)} questions only in this version).</li>
      </ul>
      <p>{by_source.get("both", 0)} questions appear in both. They are not
      identical overall. Each card is tagged so you can see which version a
      question comes from.</p>
    </section>

    <section>
      <h2>How to read a yellow name</h2>
      <p>Each analysis name is a short nickname for the scale, then a number for
      the item on that scale. Example: <span class="vnew">bcfpi_mood3</span> is
      item 3 of the BCFPI mood questions. Names are usually at most 8 letters
      plus that number. If a scale has 10 or more items, the number has a
      leading zero (<span class="vnew">cats01</span>).</p>
      <p>Mental health items come from the youth version of the Brief Child and
      Family Phone Interview (BCFPI), a standard questionnaire about feelings
      and behaviour. Those names start with <code>bcfpi_</code>.</p>
    </section>

    <section>
      <h2>How answers become numbers</h2>
      <ul>
        <li><strong>Ordered answers</strong> (Never, Sometimes, Often) are numbered
        0, 1, 2, … so that the “lowest” end of the scale is 0. For
        <em>how often</em> questions, Never is always 0, even if the
        questionnaire listed Always first.</li>
        <li><strong>Named categories</strong> with no natural order (country,
        gender) are numbered 1, 2, 3, …</li>
        <li><strong>True numbers</strong> (year of birth, age, a 1–10 ladder)
        are stored as entered.</li>
        <li><strong>Typed comments</strong> stay as text, not a number.</li>
      </ul>
      <p>A few answers are kept out of the scale on purpose:</p>
      <table class="codes">
        <thead><tr><th>Number</th><th>Meaning</th></tr></thead>
        <tbody>
          <tr><td>997</td><td>Not applicable (only if that option was actually offered)</td></tr>
          <tr><td>998</td><td>Don’t know</td></tr>
          <tr><td>999</td><td>Prefer not to answer</td></tr>
          <tr><td>blank / NA</td><td>Skipped or empty — not the same as 997</td></tr>
        </tbody>
      </table>
    </section>

    <section>
      <h2>The colored labels on each question</h2>
      <div class="key">
        <div class="key-row">
          <p class="key-dim">Question type</p>
          <div class="flags">
            <span class="box type-single">Single</span>
            <span class="box type-matrix">Matrix</span>
            <span class="box type-multi">Multi-select</span>
          </div>
          <p>What kind of question this is. <em>Single</em> is one question.
          <em>Matrix</em> is a block of similar items that share the same answer
          list. <em>Multi-select</em> allows more than one tick.</p>
        </div>
        <div class="key-row">
          <p class="key-dim">Confidence</p>
          <div class="flags">
            <span class="box conf-high">High</span>
            <span class="box conf-medium">Medium</span>
            <span class="box conf-low">Low</span>
          </div>
          <p>How complete the answer list is. Green means the full list was
          recovered. Amber or red means the German test file did not contain
          every option. {n_incomplete} questions are tagged that way.</p>
        </div>
        <div class="key-row">
          <p class="key-dim">Variable level</p>
          <div class="flags">
            <span class="box scale-interval">Interval</span>
            <span class="box scale-ordinal">Ordinal</span>
            <span class="box scale-nominal">Nominal</span>
            <span class="box scale-text">Free text</span>
          </div>
          <p>How answers are numbered. <em>Ordinal</em> = ordered categories.
          <em>Nominal</em> = named categories with no order.
          <em>Interval</em> = a real number.
          <em>Free text</em> = written words.</p>
        </div>
        <div class="key-row">
          <p class="key-dim">Source</p>
          <div class="flags">
            <span class="box src-fhi_only">FHI only</span>
            <span class="box src-ger_only">German only</span>
            <span class="box src-both">Both sources</span>
          </div>
          <p>Which questionnaire version the question comes from.</p>
        </div>
      </div>
    </section>
  </div>
</header>

<div class="body-grid">
<div class="col-main">
<div class="filters">
  <h2>Search and filter</h2>
  <p class="hint">Show only one version, one section, or incomplete questions.
  The yellow names on the right jump to a question.</p>
  <input type="search" id="q" placeholder="Search questions, items, names…">
  <div class="chips" id="src">
    <button type="button" class="chip on" data-source="all">All sources</button>
    <button type="button" class="chip" data-source="both">Both</button>
    <button type="button" class="chip" data-source="fhi_only">FHI only</button>
    <button type="button" class="chip" data-source="ger_only">German only</button>
    <button type="button" class="chip" data-complete="nottrue">Incomplete / inferred</button>
  </div>
  <div class="chips" id="secs">
    <button type="button" class="chip on" data-section="all">All sections</button>
    {sec_nav}
  </div>
</div>
<p class="questions-label">Questions</p>
<div id="cards">
{"".join(cards)}
<p class="empty hidden" id="none">No questions match these filters.</p>
</div>
</div>
<nav class="toc">
<p class="toc-label">Jump to a question</p>
{"".join(
    f'<a href="#{escape(q.group_id)}">'
    f'<span class="vnew">{escape(short_name_range(q))}</span>'
    f'<span class="toc-q">{escape(toc_question_label(q, codebook))}</span></a>'
    for q in codebook
)}
</nav>
</div>
</div>
<script>
const cards = [...document.querySelectorAll(".card")];
const none = document.getElementById("none");
let source = "all", section = "all", complete = "all", query = "";
document.getElementById("q").addEventListener("input", e => {{
  query = e.target.value.trim().toLowerCase();
  apply();
}});
document.getElementById("src").addEventListener("click", e => {{
  const b = e.target.closest(".chip"); if (!b) return;
  [...e.currentTarget.children].forEach(x => x.classList.remove("on"));
  b.classList.add("on");
  source = b.dataset.source || "all";
  complete = b.dataset.complete || "all";
  apply();
}});
document.getElementById("secs").addEventListener("click", e => {{
  const b = e.target.closest(".chip"); if (!b) return;
  [...e.currentTarget.children].forEach(x => x.classList.remove("on"));
  b.classList.add("on");
  section = b.dataset.section || "all";
  apply();
}});
function apply() {{
  let n = 0;
  for (const c of cards) {{
    const okSrc = source === "all" || c.dataset.source === source;
    const okSec = section === "all" || c.dataset.section === section;
    const okComp = complete === "all" || c.dataset.complete !== "true";
    const hay = c.innerText.toLowerCase();
    const okQ = !query || hay.includes(query);
    const show = okSrc && okSec && okComp && okQ;
    c.classList.toggle("hidden", !show);
    const link = document.querySelector('nav.toc a[href="#' + c.id + '"]');
    if (link) link.classList.toggle("hidden", !show);
    if (show) n++;
  }}
  none.classList.toggle("hidden", n !== 0);
}}
</script>
</body>
</html>
"""
    (OUT_DIR / "codebook.html").write_text(html, encoding="utf-8")


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

def validate(codebook: list[Question], ger_vars: list[GerVar]) -> None:
    coded_vars = {it.variable for q in codebook for it in q.items}
    ger_all = [gv for gv in ger_vars if gv.variable not in MATRIX_TITLE_VARS]
    unmatched = [gv.variable for gv in ger_all if gv.variable not in coded_vars]
    zero_opt = [
        q.group_id
        for q in codebook
        if not q.options and q.scale not in {"text"}
    ]
    matrix_no_items = [
        q.group_id for q in codebook if q.question_type == "matrix" and len(q.items) < 2
    ]
    incomplete = [
        (q.group_id, q.options_complete, q.stem[:60])
        for q in codebook
        if q.options_complete != "true"
    ]
    by_source = Counter(q.source for q in codebook)
    by_scale = Counter(q.scale for q in codebook)
    item_source = Counter(it.source for q in codebook for it in q.items)

    shorts = [it.short_name for q in codebook for it in q.items]
    bad_short = [n for n in shorts if not n or not SHORT_NAME_RE.match(n)]
    dup_short = [n for n, c in Counter(shorts).items() if c > 1]

    print("=== codebook validation ===")
    print(f"questions: {len(codebook)}")
    print(f"items:     {sum(len(q.items) for q in codebook)}")
    print(f"by question source: {dict(by_source)}")
    print(f"by item source:     {dict(item_source)}")
    print(f"by scale:           {dict(by_scale)}")
    print(f"unmatched GER vars ({len(unmatched)}): {unmatched}")
    print(f"questions with 0 options (excl. text) ({len(zero_opt)}): {zero_opt}")
    print(f"matrix with <2 items ({len(matrix_no_items)}): {matrix_no_items}")
    print(f"incomplete/inferred option lists ({len(incomplete)}):")
    for gid, comp, stem in incomplete:
        print(f"  [{comp:9s}] {gid}: {stem}")
    print(f"invalid short names ({len(bad_short)}): {bad_short}")
    print(f"duplicate short names ({len(dup_short)}): {dup_short}")

    print("\n=== question stems ===")
    for q in codebook:
        n_it = len(q.items)
        n_op = len(q.options)
        print(
            f"{q.source:9s} {q.question_type:8s} {q.scale:8s} "
            f"items={n_it:2d} opts={n_op:2d} "
            f"{short_name_range(q):16s} | {q.stem[:72]}"
        )


def main() -> None:
    codebook, ger_vars = build_codebook()
    write_csv(codebook)
    write_html(codebook)
    validate(codebook, ger_vars)
    print(f"\nWrote {OUT_DIR / 'codebook.html'}")
    print(f"Wrote {OUT_DIR / 'codebook_variables.csv'}")
    print(f"Wrote {OUT_DIR / 'codebook_options.csv'}")


if __name__ == "__main__":
    main()
