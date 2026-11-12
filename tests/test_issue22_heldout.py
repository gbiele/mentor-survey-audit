#!/usr/bin/env python3
"""Issue #22, held-out cases: the Overview/tabs contract with other inputs and order.

One rendered copy whose render_overview_functioning() (the second cell of
overview-bcfpi) stops with an error. On a fresh page the last tab, Social media
problems, is opened before Build the report is pressed and kept open during the
build. The workbook is the six-row one of tests/test_issue20_heldout.py (rows
1-4, 1, 2 of the base respondents; the sixth declined, so 5 young people remain).
Afterwards the Overview tab is opened and its figures are measured.

Uses the harness of tests/test_issue20_build_progress.py and the probes of
tests/test_issue22_overview_tabs.py. Needs network access; takes a few minutes.
Run: python tests/test_issue22_heldout.py
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import test_issue20_build_progress as h  # noqa: E402
import test_issue22_overview_tabs as v  # noqa: E402

GOOD_NAME = "six rows.xlsx"
OPEN_TAB = "Social media problems"
BROKEN = {"overview.R": 'render_overview_functioning <- function(survey) stop("Held-out failure in functioning")'}
_C = {}


def scenario():
    if "s" not in _C:
        d = h.tmpdir("issue22_hx_")
        good, _ = h.make_workbooks(d, good_name=GOOD_NAME, rows=(1, 2, 3, 4, 1, 2),
                                   participation=("Yes",) * 5 + ("No",))
        url = h.serve(h.render_page(append=BROKEN))
        _C["s"] = v.build_with_tab_open(url, good, OPEN_TAB)
    return _C["s"]


def tearDownModule():
    v.tearDownModule()


class TestHeldOut(v._Base):
    @classmethod
    def setUpClass(cls):
        cls.b = scenario()

    def setUp(self):
        self.assertIsNotNone(self.b, "the page has no #build-report / #build-status hooks; build skipped")
        self.assertTrue(self.b["tab_clicked"], f"no {OPEN_TAB!r} tab to open before the build")

    def test_failed_second_cell_keeps_first_cell_output(self):
        f = self.b["final"]
        sec = f["secs"]["overview-bcfpi"]
        self.assertTrue(sec["couldNot"], "overview-bcfpi does not say 'could not be drawn'")
        self.assertIn("This section could not be drawn: Held-out failure in functioning", sec["text"])
        self.assertFalse(sec["waiting"], "overview-bcfpi still waits")
        self.assertEqual(sec["imgs"], 1, "overview-bcfpi: figures of render_overview_symptoms")
        m = self.b["overview"]
        self.assertIsNotNone(m, "no Overview tab")
        self.assertSize(m["imgs"]["overview-bcfpi"][0], v.SYMPTOMS, "overview-bcfpi symptoms figure")
        self.assertEqual(f["state"], "failed")
        self.assertIn("Overview: BCFPI", f["text"])
        self.assertNotIn("The report is complete", f["text"])

    def test_all_other_sections_drawn_and_failed_only_at_end(self):
        f = self.b["final"]
        for sid in h.SECTION_IDS:
            if sid == "overview-bcfpi":
                continue
            sec = f["secs"][sid]
            self.assertTrue(sec["exists"], f"no element with id {sid}")
            self.assertFalse(sec["waiting"], f"{sid} still waits")
            self.assertFalse(sec["couldNot"], f"{sid} says 'could not be drawn'")
            self.assertTrue(sec["imgs"] > 0 or sec["outLen"] > 0, f"{sid} has no output")
        failed = [s for s in self.b["log"] if s["state"] == "failed"]
        self.assertTrue(failed, "state never became failed")
        for s in failed:
            self.assertEqual(h.n_drawn(s), 16, "state failed while sections are still waiting")

    def test_overview_drawn_in_closed_tab_sizes(self):
        self.assertEqual(self.b["open_after"], [OPEN_TAB], f"harness: {OPEN_TAB!r} was not open during the build")
        m = self.b["overview"]
        self.assertIsNotNone(m, "no Overview tab")
        expected = dict(v.OVERVIEW_SIZES)
        expected["overview-bcfpi"] = [v.SYMPTOMS]
        for sid, sizes in expected.items():
            imgs = m["imgs"][sid]
            self.assertIsNotNone(imgs, f"no element with id {sid}")
            self.assertEqual(len(imgs), len(sizes), f"{sid}: number of figures")
            for k, (img, size) in enumerate(zip(imgs, sizes)):
                self.assertSize(img, size, f"{sid} figure {k + 1}")
                self.assertRenderedSize(img, f"{sid} figure {k + 1}")

    def test_loaded_line_and_draw_order_with_last_tab_open(self):
        lines = self.b["loaded"]
        self.assertTrue(lines, "no 'Loaded ...' line")
        self.assertIn(f"Loaded {GOOD_NAME}.", lines[0]["text"])
        self.assertIn("The charts use the remaining 5 young people.", lines[0]["text"])
        self.assertTrue(lines[0]["before"], "the 'Loaded' line is not before the tab strip and overview-biography")
        times = self.drawn_times(self.b)
        self.assertEqual(sorted(times), sorted(h.SECTION_IDS), "not every section was drawn during the build")
        order = [times[sid] for sid in h.SECTION_IDS]
        self.assertEqual(order, sorted(order), f"draw order (snapshot index per section): {order}")
        smp = self.b["log"][times["overview-biography"]]["secs"]["social-media-problems"]
        self.assertTrue(smp["phVis"] and h.WAITING in smp["phText"],
                        "when Overview: Biography is drawn, Social media problems no longer waits")


if __name__ == "__main__":
    unittest.main(verbosity=2)
