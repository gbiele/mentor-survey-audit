#!/usr/bin/env python3
"""Issue #22: an Overview and tabs on the in-browser Survey results page.

Browser tests on a rendered copy of describe/index.qmd (contract Part A, B1-B6),
using the harness of tests/test_issue20_build_progress.py (render_page, serve,
make_workbooks, new_page, run_build). Needs quarto, Rscript, Playwright and
network access (webR is downloaded); takes several minutes; not part of npm test.

Run: python tests/test_issue22_overview_tabs.py [TestClass.test_name ...]

Scenarios (each run at most once per process, on first use):
- structure: a fresh page, no build: tab strip, sections, headings, clicking tabs.
- good:      the issue #20 good build (4 young people) with the Overview open;
             afterwards every tab is opened in turn and its figures are measured.
- broken:    a rendered copy whose render_overview_symptoms() (first cell of
             overview-bcfpi) and render_overview_cyrm() stop with an error. The
             KIDSCREEN tab is opened before Build the report is pressed and kept
             open during the build; afterwards the Overview tab is opened and measured.
"""

import re
import sys
import time
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import test_issue20_build_progress as h  # noqa: E402

ROOT = h.ROOT

# B1.2: the ten tab labels, in this order.
TABS = ["Overview", "Biography", "Living situation", "Socioeconomic", "BCFPI attention",
        "BCFPI functioning", "ACE-IQ", "KIDSCREEN", "Social media time", "Social media problems"]

OVERVIEW_IDS = h.SECTION_IDS[:7]
TAB_SECTIONS = h.SECTION_IDS[7:]
# B2: the tab of each section.
TAB_OF = {**{sid: "Overview" for sid in OVERVIEW_IDS}, **dict(zip(TAB_SECTIONS, TABS[1:]))}
SECTIONS_OF_TAB = {t: [sid for sid in h.SECTION_IDS if TAB_OF[sid] == t] for t in TABS}

# B2: headings of the Overview sections (as in report/pages/overview.qmd).
OVERVIEW_HEADINGS = {
    "overview-biography": "Biography",
    "overview-socioeconomic-position": "Socioeconomic position",
    "overview-bcfpi": "BCFPI",
    "overview-ace-iq": "ACE-IQ",
    "overview-quality-of-life": "Quality of life",
    "overview-resilience": "Resilience",
    "overview-social-media-time": "Social media time",
}
INTRO = "Selected background items and scale sums. Item charts are on the other tabs."

# B5: natural sizes in px = 110 dpi x fig-width/fig-height (inches) of each chunk
# in report/pages/overview.qmd (110 dpi: mentor_plot() in report/R/plots.R).
BIO_SES = (880, 374)        # 8 x 3.4 in
SYMPTOMS = (990, 396)       # 9 x 3.6 in
FUNCTIONING = (880, 374)    # 8 x 3.4 in
SMALL = (880, 352)          # 8 x 3.2 in (ACE, KIDSCREEN, CYRM)
MEDIA = (990, 374)          # 9 x 3.4 in
# B4.2 / B5: images per Overview section with the issue #20 fixture (4 young people).
OVERVIEW_SIZES = {
    "overview-biography": [BIO_SES] * 3,
    "overview-socioeconomic-position": [BIO_SES] * 3,
    "overview-bcfpi": [SYMPTOMS, FUNCTIONING],
    "overview-ace-iq": [SMALL],
    "overview-quality-of-life": [SMALL],
    "overview-resilience": [SMALL],
    "overview-social-media-time": [MEDIA],
}
PAGE_DEFAULT = (880, 374)   # the wrong answer B5 must reject
TAB_WIDTH = 880             # B5: charts in tabs 2-10 keep the default sizes
TAB_HEIGHTS = (374, 506)
PX = 2                      # B4.4 / B5 tolerance in px

BROKEN_OVERVIEW = {
    "overview.R": (
        'render_overview_symptoms <- function(survey) stop("Test failure in Overview symptoms")\n'
        'render_overview_cyrm <- function(survey) stop("Test failure in Overview resilience")'
    )
}

# ---------------------------------------------------------------------------
# Page probes
# ---------------------------------------------------------------------------

# Tab strip and panes: the first .nav-tabs on the page; each .nav-link's pane is
# found by data-bs-target, aria-controls or href.
TABS_JS = r'''
const __tabs = () => {
  const strips = [...document.querySelectorAll('.nav-tabs')];
  const paneOf = link => {
    let t = link.getAttribute('data-bs-target') || '';
    if (!t && link.getAttribute('aria-controls')) t = '#' + link.getAttribute('aria-controls');
    if (!t) t = link.getAttribute('href') || '';
    if (!t.startsWith('#') || t.length < 2) return null;
    return document.getElementById(t.slice(1));
  };
  const links = strips.length ? [...strips[0].querySelectorAll('.nav-link')] : [];
  return {strips, strip: strips[0] || null,
          tabs: links.map(l => ({label: l.textContent.trim(), link: l, pane: paneOf(l)}))};
};
const __open = tabs => tabs.filter(t => t.pane && getComputedStyle(t.pane).display !== 'none'
                                        && t.pane.getBoundingClientRect().height > 0).map(t => t.label);
'''

STRUCT_JS = "(ids) => {" + TABS_JS + r'''
  const H = window.__i20;
  const {strips, strip, tabs} = __tabs();
  const tabFor = el => tabs.find(t => t.pane && (t.pane === el || t.pane.contains(el)));
  const headings = [...document.querySelectorAll('h1, h2, h3, h4, h5, h6')];
  const headingOf = el => {
    let hd = el.querySelector('h1, h2, h3, h4, h5, h6');
    if (!hd) {
      const before = headings.filter(x => H.precedes(x, el));
      hd = before.length ? before[before.length - 1] : null;
    }
    return hd ? hd.textContent.trim() : null;
  };
  const secs = ids.map(id => {
    const el = document.getElementById(id);
    if (!el) return {id, exists: false};
    const t = tabFor(el);
    return {
      id, exists: true,
      count: document.querySelectorAll('[id="' + id + '"]').length,
      tab: t ? t.label : null,
      heading: headingOf(el),
      rest: t ? (t.pane === el ? '' : H.visText(t.pane, '#' + CSS.escape(id))) : null,
    };
  });
  const els = ids.map(id => document.getElementById(id)).filter(Boolean);
  const inOrder = els.length === ids.length && els.every((e, i) => i === 0 || H.precedes(els[i - 1], e));
  const controls = ['workbook-file', 'build-report', 'build-status'].map(id => {
    const e = document.getElementById(id);
    return {id, exists: !!e, before: H.precedes(e, strip), inTab: !!(e && e.closest('.tab-pane'))};
  });
  const ov = tabs.find(t => t.label === 'Overview');
  let introBefore = false, overviewText = '';
  if (ov && ov.pane) {
    overviewText = H.visText(ov.pane);
    const w = document.createTreeWalker(ov.pane, NodeFilter.SHOW_TEXT);
    const first = document.getElementById(ids[0]);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (n.data.includes('Selected background items')) { introBefore = H.precedes(n, first); break; }
    }
  }
  return {
    nStrips: strips.length,
    labels: tabs.map(t => t.label),
    active: tabs.filter(t => t.link.classList.contains('active')).map(t => t.label),
    open: __open(tabs),
    secs, inOrder, controls, introBefore, overviewText,
    bodyText: H.visText(document.body),
  };
}'''

OPEN_JS = "(ids) => {" + TABS_JS + r'''
  const {tabs} = __tabs();
  const shown = ids.filter(id => {
    const e = document.getElementById(id);
    if (!e) return false;
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
  return {open: __open(tabs), shown};
}'''

MEASURE_JS = r'''(ids) => {
  const H = window.__i20;
  const box = el => { const r = el.getBoundingClientRect(); return [r.width, r.height]; };
  const contentWidth = el => {
    let n = el.parentElement;
    while (n && getComputedStyle(n).display.startsWith('inline')) n = n.parentElement;
    if (!n) return null;
    const cs = getComputedStyle(n);
    return n.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  };
  const imgs = {};
  for (const id of ids) {
    const el = document.getElementById(id);
    imgs[id] = el ? [...el.querySelectorAll('img')].filter(H.vis).map(i => ({
      complete: i.complete, nw: i.naturalWidth, nh: i.naturalHeight,
      w: box(i)[0], h: box(i)[1], cw: contentWidth(i)})) : null;
  }
  const strip = document.querySelector('.nav-tabs');
  const shown = e => !!e && box(e)[0] > 0 && box(e)[1] > 0;
  const controls = ['workbook-file', 'build-report', 'build-status'].map(id => {
    const e = document.getElementById(id);
    return {id, shown: shown(e), before: H.precedes(e, strip)};
  });
  const loaded = [...document.querySelectorAll('p')]
    .filter(p => p.textContent.includes('The charts use the remaining'))
    .map(p => ({shown: shown(p), before: H.precedes(p, strip)}));
  return {imgs, controls, loaded};
}'''


def tab_link(page, label):
    loc = page.locator(".nav-tabs .nav-link").filter(
        has_text=re.compile(r"^\s*" + re.escape(label) + r"\s*$"))
    return loc.first if loc.count() else None


def click_tab(page, label):
    """Click the tab labelled `label`; False if there is no such tab."""
    link = tab_link(page, label)
    if link is None:
        return False
    link.click(timeout=10000)
    time.sleep(0.8)
    return True


def open_tabs(page):
    return page.evaluate(OPEN_JS, h.SECTION_IDS)["open"]


def measure_tab(page, label):
    """Open the tab `label` and measure its figures; None if there is no such tab."""
    if not click_tab(page, label):
        return None
    ids = SECTIONS_OF_TAB[label]
    deadline = time.monotonic() + 15
    while True:
        m = page.evaluate(MEASURE_JS, ids)
        pending = [i for v in m["imgs"].values() if v for i in v if not i["complete"]]
        if not pending or time.monotonic() > deadline:
            return m
        time.sleep(0.5)


def build_with_tab_open(url, workbook, tab):
    """Fresh page: open `tab`, build `workbook` with it open, then open the
    Overview and measure. Returns None if the page has no hooks."""
    page, _ = h.new_page(url)
    if not h.has_hooks(page):
        page.context.close()
        return None
    tab_clicked = click_tab(page, tab)
    build = h.run_build(page, workbook)
    build["tab_clicked"] = tab_clicked
    build["open_after"] = open_tabs(page)
    build["overview"] = measure_tab(page, "Overview")
    page.context.close()
    return build


# ---------------------------------------------------------------------------
# Scenarios (cached per process)
# ---------------------------------------------------------------------------

_C = {}


def structure_scenario():
    if "structure" not in _C:
        page, _ = h.new_page(h.site_url())
        try:
            page.wait_for_selector(".chart-placeholder", state="attached", timeout=10000)
        except Exception:
            pass
        time.sleep(1.0)
        res = {"struct": page.evaluate(STRUCT_JS, h.SECTION_IDS), "clicks": {}}
        for label in TABS:
            res["clicks"][label] = (page.evaluate(OPEN_JS, h.SECTION_IDS)
                                    if click_tab(page, label) else None)
        page.context.close()
        _C["structure"] = res
    return _C["structure"]


def good_scenario():
    """The issue #20 good build (Overview open), then every tab opened in turn."""
    if "good" not in _C:
        build = h.good_build()
        page, _ = h.main_page()
        build_tabs = {label: measure_tab(page, label) for label in TABS}
        _C["good"] = (build, build_tabs)
    return _C["good"]


def broken_scenario():
    if "broken" not in _C:
        good, _ = h.fixtures()
        url = h.serve(h.render_page(append=BROKEN_OVERVIEW))
        _C["broken"] = build_with_tab_open(url, good, "KIDSCREEN")
    return _C["broken"]


def tearDownModule():
    h.tearDownModule()
    _C.clear()


# ---------------------------------------------------------------------------
# Assertion helpers
# ---------------------------------------------------------------------------

class _Base(h._Base):
    def assertSize(self, img, size, where):
        self.assertTrue(abs(img["nw"] - size[0]) <= PX and abs(img["nh"] - size[1]) <= PX,
                        f"{where}: natural size {img['nw']}x{img['nh']}, expected {size[0]}x{size[1]} (+-{PX} px)")

    def assertRenderedSize(self, img, where):
        """B4.4: width > 0, = natural width or the container width if smaller;
        height keeps the natural aspect ratio."""
        self.assertGreater(img["nw"], 0, f"{where}: image has no natural size")
        self.assertGreater(img["w"], 0, f"{where}: drawn with width 0")
        expected_w = img["nw"] if img["cw"] is None else min(img["nw"], img["cw"])
        self.assertLessEqual(abs(img["w"] - expected_w), PX,
                             f"{where}: width {img['w']:.1f}, expected {expected_w:.1f} "
                             f"(natural {img['nw']}, container {img['cw']})")
        expected_h = img["w"] * img["nh"] / img["nw"]
        self.assertLessEqual(abs(img["h"] - expected_h), PX,
                             f"{where}: height {img['h']:.1f}, expected {expected_h:.1f} (aspect ratio)")


# ---------------------------------------------------------------------------
# B1, B2: structure of the page before a build
# ---------------------------------------------------------------------------

class TestStructure(_Base):
    @classmethod
    def setUpClass(cls):
        cls.r = structure_scenario()
        cls.s = cls.r["struct"]

    def test_one_tab_strip_with_ten_labels_in_order(self):
        self.assertEqual(self.s["nStrips"], 1, "number of .nav-tabs tab strips on the page")
        self.assertEqual(self.s["labels"], TABS)

    def test_overview_tab_open_when_page_opens(self):
        self.assertEqual(self.s["active"], ["Overview"], "active tab label(s) when the page opens")
        self.assertEqual(self.s["open"], ["Overview"], "displayed tab pane(s) when the page opens")

    def test_controls_before_tab_strip_outside_tabs(self):
        for c in self.s["controls"]:
            self.assertTrue(c["exists"], f"no #{c['id']}")
            self.assertTrue(c["before"], f"#{c['id']} does not come before the tab strip")
            self.assertFalse(c["inTab"], f"#{c['id']} is inside a tab pane")

    def test_sections_unique_in_page_order_and_in_their_tabs(self):
        for sec in self.s["secs"]:
            sid = sec["id"]
            self.assertTrue(sec["exists"], f"no element with id {sid}")
            self.assertEqual(sec["count"], 1, f"id {sid} is not unique in the page")
            self.assertEqual(sec["tab"], TAB_OF[sid], f"tab of section {sid}")
        self.assertTrue(self.s["inOrder"], "the 16 sections are not in the page order of B2")

    def test_overview_sections_have_local_headings(self):
        got = {sec["id"]: sec.get("heading") for sec in self.s["secs"] if sec["id"] in OVERVIEW_HEADINGS}
        self.assertEqual(got, OVERVIEW_HEADINGS)

    def test_scale_tabs_hold_only_their_section(self):
        for sec in self.s["secs"]:
            if sec["id"] in TAB_SECTIONS:
                self.assertTrue(sec["exists"], f"no element with id {sec['id']}")
                self.assertEqual(sec["rest"], "", f"tab {TAB_OF[sec['id']]} has content outside section {sec['id']}")

    def test_overview_intro_sentence_before_first_section(self):
        self.assertIn(INTRO, " ".join(self.s["overviewText"].split()), "Overview tab lacks the intro sentence")
        self.assertTrue(self.s["introBefore"], "the intro sentence does not come before overview-biography")

    def test_no_raw_inline_r_text(self):
        self.assertTrue(self.s["secs"][0]["exists"], "no element with id overview-biography")
        self.assertNotRegex(self.s["bodyText"], r"`r\s", "raw `r ...` text on the page")

    def test_resilience_only_in_overview(self):
        self.assertTrue(self.s["labels"], "no tab strip")
        for label in self.s["labels"]:
            self.assertNotRegex(label, r"(?i)resilience|cyrm", "a tab for Resilience (CYRM)")
        sec = next(x for x in self.s["secs"] if x["id"] == "overview-resilience")
        self.assertEqual(sec.get("tab"), "Overview")

    def test_clicking_tab_opens_it_and_hides_others(self):
        for label in TABS:
            res = self.r["clicks"][label]
            self.assertIsNotNone(res, f"no tab labelled {label!r}")
            self.assertEqual(res["open"], [label], f"displayed tab pane(s) after clicking {label!r}")
            self.assertEqual(res["shown"], SECTIONS_OF_TAB[label], f"sections shown after clicking {label!r}")


# ---------------------------------------------------------------------------
# B1.1, B4, B5: after a good build with the Overview open
# ---------------------------------------------------------------------------

class TestGoodBuildContent(_Base):
    @classmethod
    def setUpClass(cls):
        cls.b, cls.tabs = good_scenario()
        cls.f = cls.b["final"]

    def test_build_done(self):
        self.assertEqual(self.b["ended"], "done")

    def test_overview_figure_counts(self):
        got = {sid: self.f["secs"][sid]["imgs"] for sid in OVERVIEW_IDS}
        self.assertEqual(got, {sid: len(v) for sid, v in OVERVIEW_SIZES.items()})

    def test_overview_text_matches_local_report(self):
        expected = {
            "overview-ace-iq": ["Binary version", "Frequency version"],
            "overview-socioeconomic-position": ["Highest parental education", "Social ladder"],
            "overview-resilience": ["The sum runs from 0 to 48"],
        }
        for sid, phrases in expected.items():
            for phrase in phrases:
                self.assertIn(phrase, self.f["secs"][sid]["text"], f"{sid} lacks {phrase!r}")

    def test_overview_natural_figure_sizes(self):
        m = self.tabs["Overview"]
        self.assertIsNotNone(m, "no Overview tab")
        for sid, sizes in OVERVIEW_SIZES.items():
            imgs = m["imgs"][sid]
            self.assertIsNotNone(imgs, f"no element with id {sid}")
            self.assertEqual(len(imgs), len(sizes), f"{sid}: number of figures")
            for k, (img, size) in enumerate(zip(imgs, sizes)):
                self.assertSize(img, size, f"{sid} figure {k + 1}")
        # The page default must not pass for these calls.
        self.assertNotEqual(SYMPTOMS, PAGE_DEFAULT)
        self.assertNotEqual(SMALL, PAGE_DEFAULT)
        self.assertNotEqual(MEDIA, PAGE_DEFAULT)

    def test_scale_tab_figures_keep_default_sizes(self):
        for label in TABS[1:]:
            m = self.tabs[label]
            self.assertIsNotNone(m, f"no tab labelled {label!r}")
            for sid in SECTIONS_OF_TAB[label]:
                imgs = m["imgs"][sid]
                self.assertIsNotNone(imgs, f"no element with id {sid}")
                if sid in h.FIGURE_SECTIONS:
                    self.assertGreaterEqual(len(imgs), 1, f"{sid}: no figure")
                for k, img in enumerate(imgs):
                    where = f"{sid} figure {k + 1}"
                    self.assertLessEqual(abs(img["nw"] - TAB_WIDTH), PX, f"{where}: natural width {img['nw']}")
                    self.assertTrue(any(abs(img["nh"] - t) <= PX for t in TAB_HEIGHTS),
                                    f"{where}: natural height {img['nh']}, expected 374 or 506")

    def test_hidden_tab_figures_drawn_at_right_size_when_opened(self):
        for label in TABS[1:]:
            m = self.tabs[label]
            self.assertIsNotNone(m, f"no tab labelled {label!r}")
            for sid in SECTIONS_OF_TAB[label]:
                imgs = m["imgs"][sid]
                self.assertIsNotNone(imgs, f"no element with id {sid}")
                if sid in h.FIGURE_SECTIONS:
                    self.assertGreaterEqual(len(imgs), 1, f"{sid}: no figure")
                for k, img in enumerate(imgs):
                    self.assertRenderedSize(img, f"tab {label}, {sid} figure {k + 1}")

    def test_controls_and_loaded_line_above_tabs_whichever_tab_open(self):
        for label in TABS:
            m = self.tabs[label]
            self.assertIsNotNone(m, f"no tab labelled {label!r}")
            for c in m["controls"]:
                self.assertTrue(c["shown"], f"#{c['id']} not visible with tab {label!r} open")
                self.assertTrue(c["before"], f"#{c['id']} not before the tab strip")
            self.assertTrue(m["loaded"], "no 'Loaded ...' line")
            self.assertTrue(m["loaded"][0]["shown"], f"'Loaded' line not visible with tab {label!r} open")
            self.assertTrue(m["loaded"][0]["before"], "'Loaded' line not before the tab strip")


# ---------------------------------------------------------------------------
# B3.6, B4.4 (second half): Overview cells fail, built with KIDSCREEN open
# ---------------------------------------------------------------------------

class TestOverviewFailureWithOtherTabOpen(_Base):
    @classmethod
    def setUpClass(cls):
        cls.b = broken_scenario()

    def setUp(self):
        self.assertIsNotNone(self.b, "the page has no #build-report / #build-status hooks; build skipped")
        self.assertTrue(self.b["tab_clicked"], "no KIDSCREEN tab to open before the build")

    def test_failed_first_cell_shows_error_second_cell_drawn(self):
        sec = self.b["final"]["secs"]["overview-bcfpi"]
        self.assertTrue(sec["couldNot"], "overview-bcfpi does not say 'could not be drawn'")
        self.assertIn("This section could not be drawn: Test failure in Overview symptoms", sec["text"])
        self.assertFalse(sec["waiting"], "overview-bcfpi still waits")
        self.assertEqual(sec["imgs"], 1, "overview-bcfpi: figures of render_overview_functioning")
        m = self.b["overview"]
        self.assertIsNotNone(m, "no Overview tab")
        self.assertSize(m["imgs"]["overview-bcfpi"][0], FUNCTIONING, "overview-bcfpi functioning figure")

    def test_failed_single_cell_section_shows_error(self):
        sec = self.b["final"]["secs"]["overview-resilience"]
        self.assertTrue(sec["couldNot"], "overview-resilience does not say 'could not be drawn'")
        self.assertIn("This section could not be drawn: Test failure in Overview resilience", sec["text"])
        self.assertFalse(sec["waiting"], "overview-resilience still waits")

    def test_sections_after_failures_still_drawn(self):
        f = self.b["final"]
        for sid in h.SECTION_IDS:
            if sid in ("overview-bcfpi", "overview-resilience"):
                continue
            sec = f["secs"][sid]
            self.assertTrue(sec["exists"], f"no element with id {sid}")
            self.assertFalse(sec["waiting"], f"{sid} still waits")
            self.assertFalse(sec["couldNot"], f"{sid} says 'could not be drawn'")
            self.assertTrue(sec["imgs"] > 0 or sec["outLen"] > 0, f"{sid} has no output")
            if sid in h.FIGURE_SECTIONS:
                self.assertGreaterEqual(sec["imgs"], 1, f"{sid} shows no figure")

    def test_final_status_names_failed_overview_sections(self):
        f = self.b["final"]
        self.assertEqual(f["state"], "failed")
        self.assertIn("could not be drawn", f["text"])
        self.assertIn("Overview: BCFPI", f["text"])
        self.assertIn("Overview: Resilience", f["text"])
        self.assertNotIn("The report is complete", f["text"])
        for s in self.b["log"]:
            if s["state"] == "failed":
                self.assertEqual(h.n_drawn(s), 16, "state failed while sections are still waiting")

    def test_progress_in_page_order_with_other_tab_open(self):
        times = self.drawn_times(self.b)
        self.assertEqual(sorted(times), sorted(h.SECTION_IDS), "not every section was drawn during the build")
        order = [times[sid] for sid in h.SECTION_IDS]
        self.assertEqual(order, sorted(order), f"draw order (snapshot index per section): {order}")

    def test_overview_drawn_in_closed_tab_right_size_when_opened(self):
        self.assertEqual(self.b["open_after"], ["KIDSCREEN"], "harness: KIDSCREEN was not open during the build")
        m = self.b["overview"]
        self.assertIsNotNone(m, "no Overview tab")
        n = 0
        for sid in OVERVIEW_IDS:
            imgs = m["imgs"][sid]
            self.assertIsNotNone(imgs, f"no element with id {sid}")
            for k, img in enumerate(imgs):
                self.assertRenderedSize(img, f"{sid} figure {k + 1}")
                n += 1
        # 12 Overview figures minus symptoms (1) and resilience (1).
        self.assertEqual(n, 10, "number of Overview figures")


# ---------------------------------------------------------------------------
# B6.3: the duration phrase is the same in the page and in README.md
# ---------------------------------------------------------------------------

class TestDurationPhrase(unittest.TestCase):
    def test_same_drawing_duration_in_page_and_readme(self):
        pat = re.compile(r"drawing the charts takes about ([^.]+)\.")
        page = pat.findall((ROOT / "describe" / "index.qmd").read_text(encoding="utf-8"))
        readme = pat.findall((ROOT / "README.md").read_text(encoding="utf-8"))
        self.assertTrue(page, "describe/index.qmd has no 'drawing the charts takes about ...'")
        self.assertTrue(readme, "README.md has no 'drawing the charts takes about ...'")
        self.assertEqual(set(page), set(readme))


if __name__ == "__main__":
    unittest.main(verbosity=2)
