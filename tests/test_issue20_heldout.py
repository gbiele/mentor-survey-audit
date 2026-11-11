#!/usr/bin/env python3
"""Issue #20, held-out cases: the build-progress contract with other inputs and order.

One fresh page on a normal rendered copy:
1. The unreadable workbook (a file name with spaces) is chosen and built right
   after the page has loaded, so the failed load happens while R is still
   downloading and before any successful build.
2. Then a different good workbook (six rows, the last one declined to take part,
   so 5 young people remain) is built on the same page.

Uses the harness of tests/test_issue20_build_progress.py. Needs network access;
takes a few minutes. Run: python tests/test_issue20_heldout.py
"""

import sys
import time
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import test_issue20_build_progress as h  # noqa: E402

BAD_NAME = "export with spaces (v2).xlsx"
GOOD_NAME = "second country.xlsx"
_C = {}


def scenario():
    if "s" not in _C:
        d = h.tmpdir("issue20_hx_")
        # Rows 1-4 of the base respondents, then rows 1 and 2 again; the sixth
        # answers "No" to participation: 6 rows read, 1 excluded, 5 remain.
        good, bad = h.make_workbooks(d, good_name=GOOD_NAME, bad_name=BAD_NAME,
                                     rows=(1, 2, 3, 4, 1, 2),
                                     participation=("Yes",) * 5 + ("No",))
        page, t_goto = h.new_page(h.site_url())
        hooks = h.has_hooks(page)
        page.set_input_files(h.FILE_INPUT, str(bad))
        time.sleep(0.3)
        chosen = h.snap(page)
        res = {"hooks": hooks, "chosen": chosen, "bad": None, "good": None}
        if hooks:
            res["goto_to_click_s"] = time.monotonic() - t_goto
            res["bad"] = h.run_build(page, bad)
            res["good"] = h.run_build(page, good)
        page.context.close()
        _C["s"] = res
    return _C["s"]


def tearDownModule():
    h.tearDownModule()


class TestHeldOut(h._Base):
    @classmethod
    def setUpClass(cls):
        cls.r = scenario()

    def setUp(self):
        self.assertTrue(self.r["hooks"], "the page has no #build-report / #build-status hooks")

    def test_status_names_chosen_file_with_spaces(self):
        s = self.r["chosen"]
        self.assertEqual(s["state"], "idle")
        self.assertIn(BAD_NAME, s["text"])
        self.assertNoSpinner(s, "file chosen")
        self.assertIdleButton(s, "file chosen")

    def test_unreadable_first_build_downloads_then_fails(self):
        b = self.r["bad"]
        self.assertLess(self.r["goto_to_click_s"], 10, "harness: click came too late after goto")
        early = [s for s in b["log"] if s["t"] <= b["t_click"] + 3000] + [b["after_click"]]
        self.assertTrue([s for s in early if s["state"] == "busy" and s["spin"] and "Downloading R" in s["text"]],
                        "no busy state with a spinner and 'Downloading R' right after the click")
        busy = [s for s in b["log"] if s["state"] == "busy"]
        self.assertTrue(all(s["btnDisabled"] and "Building the report" in s["btnText"] for s in busy
                            if s["t"] >= b["t_click"] + 1000), "button not disabled during the build")
        f = b["final"]
        self.assertEqual(f["state"], "failed")
        self.assertIn("could not be read", f["text"])
        self.assertIn("gender1", f["text"])
        self.assertNotIn("The report is complete", f["text"])
        self.assertNoSpinner(f, "after the failed load")
        self.assertIdleButton(f, "after the failed load")
        for sid in h.SECTION_IDS:
            self.assertFalse(f["secs"][sid]["waiting"], f"{sid} still shows 'Waiting for this chart'")
            self.assertEqual(f["secs"][sid]["imgs"], 0, f"{sid} shows a figure after a failed load")

    def test_build_after_failed_load_completes(self):
        b = self.r["good"]
        f = b["final"]
        self.assertEqual(f["state"], "done")
        self.assertIn("The report is complete", f["text"])
        self.assertNotIn("could not be read", f["text"])
        self.assertNoSpinner(f, "after the second build")
        self.assertIdleButton(f, "after the second build")
        for sid in h.SECTION_IDS:
            sec = f["secs"][sid]
            self.assertFalse(sec["waiting"], f"{sid} still shows 'Waiting for this chart'")
            self.assertTrue(sec["imgs"] > 0 or sec["outLen"] > 0, f"{sid} has no visible output")
        for sid in h.FIGURE_SECTIONS:
            self.assertGreaterEqual(f["secs"][sid]["imgs"], 1, f"{sid} shows no visible figure")
        for s in b["log"]:
            if s["state"] == "done":
                self.assertEqual(h.n_drawn(s), 9, "state done while sections are still waiting")

    def test_remaining_count_and_draw_order_with_declined_row(self):
        b = self.r["good"]
        lines = b["loaded"]
        self.assertTrue(lines, "no 'Loaded ...' line")
        self.assertIn(f"Loaded {GOOD_NAME}.", lines[0]["text"])
        self.assertIn("The charts use the remaining 5 young people.", lines[0]["text"])
        self.assertTrue(lines[0]["before"], "the 'Loaded' line is not above the sections")
        times = self.drawn_times(b)
        self.assertEqual(sorted(times), sorted(h.SECTION_IDS), "not every section was drawn during the build")
        order = [times[sid] for sid in h.SECTION_IDS]
        self.assertEqual(order, sorted(order), f"draw order (snapshot index per section): {order}")
        smp = b["log"][times["biography"]]["secs"]["social-media-problems"]
        self.assertTrue(smp["phVis"] and h.WAITING in smp["phText"],
                        "when Biography is drawn, Social media problems no longer waits")


if __name__ == "__main__":
    unittest.main(verbosity=2)
