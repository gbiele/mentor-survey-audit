#!/usr/bin/env python3
"""Parse Qualtrics data exports for codebook building."""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

from openpyxl import load_workbook

QUALTRICS_META_IDS = frozenset(
    {
        "StartDate",
        "EndDate",
        "Status",
        "IPAddress",
        "Progress",
        "Duration (in seconds)",
        "Finished",
        "RecordedDate",
        "ResponseId",
        "RecipientLastName",
        "RecipientFirstName",
        "RecipientEmail",
        "ExternalReference",
        "LocationLatitude",
        "LocationLongitude",
        "DistributionChannel",
        "UserLanguage",
        "Last Seen Flow Element ID",
        "Last Seen Question IDs",
    }
)

QUALTRICS_DETECT_IDS = frozenset({"StartDate", "ResponseId", "RecordedDate"})


@dataclass
class ParsedExportVar:
    col: int
    vid: str
    header: str
    stem: str
    item: str
    is_mx: bool


def _split_qualtrics_label(label: str) -> tuple[str, str, bool]:
    """Split Qualtrics row-2 label into stem, item (matrix uses ' - ')."""
    raw = (label or "").strip()
    if not raw:
        return "", "", False
    if " - " in raw:
        stem, item = raw.split(" - ", 1)
        return stem.strip(), item.strip(), True
    return raw, "", False


def is_qualtrics_export(path: Path) -> bool:
    wb = load_workbook(path, data_only=True, read_only=True)
    try:
        ws = wb[wb.sheetnames[0]]
        row1 = [
            str(ws.cell(1, c).value or "").strip()
            for c in range(1, min(ws.max_column + 1, 30))
        ]
        return bool(QUALTRICS_DETECT_IDS & set(row1))
    finally:
        wb.close()


def parse_qualtrics_headers(path: Path) -> list[ParsedExportVar]:
    wb = load_workbook(path, data_only=True)
    ws = wb[wb.sheetnames[0]]
    max_col = ws.max_column
    vars_: list[ParsedExportVar] = []
    col_idx = 0
    for c in range(1, max_col + 1):
        vid = ws.cell(1, c).value
        if vid is None or str(vid).strip() == "":
            continue
        vid_s = str(vid).strip()
        if vid_s in QUALTRICS_META_IDS:
            continue
        label = "" if ws.cell(2, c).value is None else str(ws.cell(2, c).value)
        stem, item, is_mx = _split_qualtrics_label(label)
        col_idx += 1
        header = label or vid_s
        is_matrix_vid = bool(re.search(r":\d+_\d+$", vid_s))
        vars_.append(
            ParsedExportVar(
                col=col_idx,
                vid=vid_s,
                header=header,
                stem=stem or header,
                item=item,
                is_mx=is_mx or is_matrix_vid,
            )
        )
    wb.close()
    return vars_


def merge_qualtrics_variable_files(paths: list[Path]) -> list[ParsedExportVar]:
    """Union Qualtrics columns by import ID (first file wins for duplicate IDs)."""
    by_vid: dict[str, ParsedExportVar] = {}
    order: list[str] = []
    for path in sorted(paths, key=lambda p: p.name.lower()):
        for ev in parse_qualtrics_headers(path):
            if ev.vid not in by_vid:
                by_vid[ev.vid] = ev
                order.append(ev.vid)
            else:
                existing = by_vid[ev.vid]
                if not existing.item and ev.item:
                    by_vid[ev.vid] = ParsedExportVar(
                        col=existing.col,
                        vid=ev.vid,
                        header=ev.header or existing.header,
                        stem=ev.stem or existing.stem,
                        item=ev.item,
                        is_mx=ev.is_mx or existing.is_mx,
                    )
    out: list[ParsedExportVar] = []
    for i, vid in enumerate(order, 1):
        ev = by_vid[vid]
        out.append(
            ParsedExportVar(
                col=i,
                vid=ev.vid,
                header=ev.header,
                stem=ev.stem,
                item=ev.item,
                is_mx=ev.is_mx,
            )
        )
    return out
