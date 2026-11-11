#!/usr/bin/env python3
"""Issue #20: the Survey results page shows whether the report is still being built.

Browser tests on a rendered copy of describe/index.qmd (contract items 1-9).

The page is rendered the way render_site.ps1 renders it, but into a temporary
directory, so docs/ is not touched. It is served over http://127.0.0.1 and driven
with Playwright (Chromium, headless). The page downloads webR and the R packages
from the internet, so these tests need network access. They take several minutes
and are not part of `npm test`.

Run: python tests/test_issue20_build_progress.py [TestClass.test_name ...]

Scenarios (each run at most once per process, on first use):
- idle:       a fresh page, no build (item 1).
- main:       a fresh page; the good workbook is chosen and built right after the
              page has loaded (items 2-6, 9). The unreadable workbook is then
              built on the same page (item 7), so it runs after the good build.
- broken:     a second rendered copy whose render_living() stops with an error;
              the good workbook is built (item 8).
Each build is recorded in the page: a snapshot of the status element, the button
and every section every 0.4 s, plus a snapshot on every change of the status
element. The tests assert on that timeline and on a final snapshot.
"""

import functools
import http.server
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

SECTIONS = [
    ("biography", "Biography"),
    ("living-situation", "Living situation"),
    ("socioeconomic", "Socioeconomic"),
    ("bcfpi-attention", "BCFPI attention"),
    ("bcfpi-functioning", "BCFPI functioning"),
    ("ace-iq", "ACE-IQ"),
    ("kidscreen", "KIDSCREEN"),
    ("social-media-time", "Social media time"),
    ("social-media-problems", "Social media problems"),
]
SECTION_IDS = [s for s, _ in SECTIONS]
SECTION_NAMES = dict(SECTIONS)
# Contract item 6: these eight sections show at least one figure; Social media
# problems draws text only with the fixture.
FIGURE_SECTIONS = SECTION_IDS[:-1]

FILE_INPUT = "#workbook-file input[type=file]"
WAITING = "Waiting for this chart"
BUILD_TIMEOUT_S = 400
GOOD_NAME = "good_workbook.xlsx"
BAD_NAME = "unreadable_workbook.xlsx"
BROKEN_LIVING = '\nrender_living <- function(survey) stop("Test failure in Living situation")\n'

# ---------------------------------------------------------------------------
# Fixtures (synthetic, written to a temporary directory)
# ---------------------------------------------------------------------------

# Recipe from report/tests/test_issue10_missing_columns.R: base_values() with
# consent1 removed (render_values()), headers = full dictionary question text with
# [country] -> Norway, a first participation column. `rows` picks rows of the four
# base respondents (1-based), `participation` gives the participation answers.
FIXTURE_R = r'''
args <- commandArgs(trailingOnly = TRUE)
repo <- args[[1]]
out_good <- args[[2]]
out_bad <- args[[3]]
rows <- as.integer(strsplit(args[[4]], ",", fixed = TRUE)[[1]])
participation <- strsplit(args[[5]], ",", fixed = TRUE)[[1]]
source(file.path(repo, "report", "R", "load_survey.R"))
META <- load_dictionary(file.path(repo, "data", "master_dictionary.json"), extra = paste0("smadd", 1:9))
CORE <- setdiff(names(META), paste0("smadd", 1:9))
N_ROWS <- 4L
header_of <- function(v) gsub("[country]", "Norway", META[[v]]$full, fixed = TRUE)
first_label <- function(v) {
  o <- META[[v]]$options
  o <- o[!o$special, , drop = FALSE]
  if (nrow(o)) o$label[[1]] else ""
}
vals <- lapply(CORE, function(v) rep(first_label(v), N_ROWS))
names(vals) <- CORE
vals$gender1 <- c("Boy", "Girl", "Boy", "Other gender identity")
vals$ident1 <- c("", "", "", "Non-binary")
vals$grade1 <- rep("9th", N_ROWS)
vals$byear1 <- rep("2010", N_ROWS)
vals$bmonth1 <- rep("March", N_ROWS)
vals$bplace1 <- c("Norway", "Ukraine", "Norway", "Norway")
vals$bage1 <- c("", "5", "", "")
vals$bmborn1 <- rep("Norway", N_ROWS)
vals$bfborn1 <- rep("Norway", N_ROWS)
vals$live1 <- c(
  "I live with both my parents together",
  "I live with both my parents together",
  "My parents live apart, and I live with both parents",
  "I live with both my parents together"
)
vals$livead1 <- rep("", N_ROWS)
vals$livesp1 <- c("", "", "I live mostly with my mother", "")
vals$momprt1 <- c("", "", "No", "")
vals$dadprt1 <- c("", "", "No", "")
vals$ladder1 <- c("3", "5", "7", "0")
vals$consent1 <- NULL
cols <- c(list(participation), lapply(vals, function(x) x[rows]))
headers <- c("Do you wish to participate in MENTOR?", vapply(names(vals), header_of, character(1)))
df <- as.data.frame(cols, stringsAsFactors = FALSE, col.names = paste0("c", seq_along(cols)))
names(df) <- headers
writexl::write_xlsx(list(Cleaned = df), out_good)
bad <- data.frame(foo = c("a", "b"), bar = c("1", "2"), stringsAsFactors = FALSE)
writexl::write_xlsx(list(Cleaned = bad), out_bad)
'''


def make_workbooks(directory, good_name=GOOD_NAME, bad_name=BAD_NAME,
                   rows=(1, 2, 3, 4), participation=("Yes", "Yes", "Yes", "Yes")):
    """Write the good and the unreadable workbook; return their paths."""
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True)
    script = directory / "make_fixtures.R"
    script.write_text(FIXTURE_R, encoding="utf-8")
    good = directory / good_name
    bad = directory / bad_name
    rscript = shutil.which("Rscript")
    if not rscript:
        raise RuntimeError("Rscript not found; it is needed to write the xlsx fixtures")
    res = subprocess.run(
        [rscript, str(script), str(ROOT), str(good), str(bad),
         ",".join(str(r) for r in rows), ",".join(participation)],
        capture_output=True, text=True, timeout=300,
    )
    if res.returncode != 0 or not good.exists() or not bad.exists():
        raise RuntimeError("Writing the xlsx fixtures failed:\n" + res.stdout + res.stderr)
    return good, bad


# ---------------------------------------------------------------------------
# Render and serve
# ---------------------------------------------------------------------------

_TMP = []


def tmpdir(prefix):
    d = Path(tempfile.mkdtemp(prefix=prefix))
    _TMP.append(d)
    return d


def render_page(break_living=False):
    """Render describe/ as render_site.ps1 does, into a temp dir; return the output dir."""
    tmp = tmpdir("issue20_site_")
    desc = tmp / "describe"
    shutil.copytree(ROOT / "describe", desc,
                    ignore=shutil.ignore_patterns("vfs", "vendor", ".quarto", "_freeze", "index_files"))
    vfs_r = desc / "vfs" / "report" / "R"
    vfs_data = desc / "vfs" / "data"
    vendor = desc / "vendor"
    for d in (vfs_r, vfs_data, vendor):
        d.mkdir(parents=True, exist_ok=True)
    for f in (ROOT / "report" / "R").glob("*.R"):
        shutil.copy2(f, vfs_r / f.name)
    shutil.copy2(ROOT / "data" / "master_dictionary.json", vfs_data / "master_dictionary.json")
    shutil.copy2(ROOT / "src" / "xlsx.full.min.js", vendor / "xlsx.full.min.js")
    if break_living:
        with open(vfs_r / "sections.R", "a", encoding="utf-8") as fh:
            fh.write(BROKEN_LIVING)
    quarto = shutil.which("quarto")
    if not quarto:
        raise RuntimeError("quarto not found")
    res = subprocess.run([quarto, "render"], cwd=str(desc), capture_output=True, text=True, timeout=900)
    out = tmp / "docs" / "describe"
    if res.returncode != 0 or not (out / "index.html").exists():
        raise RuntimeError("quarto render failed:\n" + res.stdout[-3000:] + res.stderr[-3000:])
    return out


class _Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "application/javascript",
        ".mjs": "application/javascript",
        ".wasm": "application/wasm",
        ".json": "application/json",
        ".css": "text/css",
        ".html": "text/html",
        ".svg": "image/svg+xml",
    }

    def log_message(self, *args):
        pass


_SERVERS = []


def serve(directory):
    handler = functools.partial(_Handler, directory=str(directory))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    _SERVERS.append(server)
    return f"http://127.0.0.1:{server.server_address[1]}/index.html"


# ---------------------------------------------------------------------------
# In-page recorder
# ---------------------------------------------------------------------------

INIT_JS = r'''
(() => {
  const IDS = %s;
  const vis = el => {
    if (!el || !el.isConnected) return false;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    return getComputedStyle(el).visibility !== 'hidden';
  };
  const sec = (id, full) => {
    const s = document.querySelector('section#' + id);
    if (!s) return {exists: false, ph: false, phCount: 0, phVis: false, phText: '', imgs: 0,
                    out: '', outLen: 0, waiting: false, couldNot: false, text: ''};
    const ph = s.querySelector('.chart-placeholder');
    const phVis = vis(ph);
    const text = vis(s) ? s.innerText : '';
    const out = [...s.children]
      .filter(c => !c.matches('h2, .chart-placeholder') && vis(c))
      .map(c => c.innerText).join('\n').trim();
    const lim = full ? 100000 : 160;
    return {
      exists: true, ph: !!ph, phCount: s.querySelectorAll('.chart-placeholder').length,
      phVis, phText: phVis ? ph.innerText.slice(0, 300) : '',
      imgs: [...s.querySelectorAll('img')].filter(vis).length,
      out: out.slice(0, lim), outLen: out.length,
      waiting: text.includes('Waiting for this chart'),
      couldNot: text.includes('could not be drawn'),
      text: text.slice(0, lim),
    };
  };
  const snap = full => {
    const st = document.getElementById('build-status');
    const btn = document.getElementById('build-report');
    return {
      t: performance.now(),
      status: !!st,
      state: st ? st.getAttribute('data-state') : null,
      text: st ? st.innerText : '',
      spin: st ? [...st.querySelectorAll('.spinner-border')].some(vis) : false,
      btn: !!btn,
      btnTag: btn ? btn.tagName : null,
      btnDisabled: btn ? btn.hasAttribute('disabled') : null,
      btnText: btn ? btn.innerText : '',
      secs: Object.fromEntries(IDS.map(id => [id, sec(id, full)])),
    };
  };
  const loadedLines = () => {
    const bio = document.querySelector('section#biography');
    return [...document.querySelectorAll('p')]
      .filter(p => vis(p) && p.innerText.includes('The charts use the remaining'))
      .map(p => ({text: p.innerText,
                  before: !!(bio && (p.compareDocumentPosition(bio) & Node.DOCUMENT_POSITION_FOLLOWING))}));
  };
  const start = () => {
    if (window.__i20rec) return;
    const rec = window.__i20rec = {log: []};
    let last = '';
    const push = () => {
      const s = snap(false);
      rec.log.push(s);
      last = s.state + '|' + s.text;
    };
    push();
    setInterval(push, 400);
    new MutationObserver(() => {
      const st = document.getElementById('build-status');
      const key = st ? st.getAttribute('data-state') + '|' + st.innerText : 'null|';
      if (key !== last) push();
    }).observe(document.documentElement,
               {subtree: true, childList: true, attributes: true, characterData: true});
  };
  window.__i20 = {snap, start, loadedLines};
})();
''' % (str(SECTION_IDS).replace("'", '"'))

_PW = {}


def browser():
    if "browser" not in _PW:
        from playwright.sync_api import sync_playwright
        _PW["pw"] = sync_playwright().start()
        _PW["browser"] = _PW["pw"].chromium.launch(headless=True)
    return _PW["browser"]


def new_page(url):
    """Fresh browser context (so webR is downloaded again), page loaded, recorder started."""
    ctx = browser().new_context()
    ctx.add_init_script(INIT_JS)
    page = ctx.new_page()
    page.set_default_timeout(30000)
    page.goto(url, wait_until="load", timeout=120000)
    t_goto = time.monotonic()
    # The file input is drawn by an OJS cell; wait for it (bounded).
    page.wait_for_selector(FILE_INPUT, state="attached", timeout=60000)
    page.evaluate("window.__i20.start()")
    return page, t_goto


def snap(page, full=True):
    return page.evaluate("f => window.__i20.snap(f)", full)


def has_hooks(page):
    return page.evaluate(
        "() => !!document.getElementById('build-report') && !!document.getElementById('build-status')")


def click_build(page, allow_fallback=False):
    """Click #build-report. With allow_fallback, click the button labelled
    'Build the report' when the id is missing (unmodified page), so that the
    unchanged behaviour (item 9) can still be observed."""
    loc = page.locator("#build-report")
    if loc.count() == 0 and allow_fallback:
        loc = page.locator("button", has_text="Build the report")
    if loc.count() == 0:
        return False
    loc.first.click(timeout=10000)
    return True


def _all_output(s):
    return all(sec["imgs"] > 0 or sec["outLen"] > 0 for sec in s["secs"].values())


def run_build(page, path, allow_fallback=False, timeout=BUILD_TIMEOUT_S):
    """Choose `path`, click the build button and record until the build ends.

    The build ends when #build-status reaches done/failed after having been busy.
    Fail-fast: if the state never becomes busy within 20 s, recording stops.
    Without #build-status (only with allow_fallback), the build counts as ended
    when every section has output and nothing changed for 8 s (bounded by timeout).
    """
    start_idx = page.evaluate("window.__i20rec.log.length")
    page.set_input_files(FILE_INPUT, str(path))
    t_click = page.evaluate("performance.now()")
    clicked = click_build(page, allow_fallback=allow_fallback)
    after_click = snap(page, full=False)
    t0 = time.monotonic()
    ended = "timeout"
    stable_since = None
    last_sig = None
    if not clicked:
        ended = "no-button"
    while clicked and time.monotonic() - t0 < timeout:
        states = page.evaluate("i => window.__i20rec.log.slice(i).map(s => s.state)", start_idx)
        cur = snap(page, full=False)
        if cur["status"]:
            busy_seen = "busy" in states or cur["state"] == "busy"
            if busy_seen and cur["state"] in ("done", "failed"):
                ended = cur["state"]
                break
            if not busy_seen and time.monotonic() - t0 > 20:
                ended = "never-busy"
                break
        else:
            if not allow_fallback:
                ended = "no-status"
                break
            sig = (tuple((v["imgs"], v["outLen"]) for v in cur["secs"].values()),)
            if _all_output(cur) and sig == last_sig:
                if stable_since is None:
                    stable_since = time.monotonic()
                elif time.monotonic() - stable_since > 8:
                    ended = "fallback-stable"
                    break
            else:
                stable_since = None
            last_sig = sig
        time.sleep(0.5)
    time.sleep(1.5)
    log = page.evaluate("i => window.__i20rec.log.slice(i)", start_idx)
    final = snap(page, full=True)
    return {
        "t_click": t_click,
        "after_click": after_click,
        "log": [s for s in log if s["t"] >= t_click],
        "final": final,
        "loaded": page.evaluate("window.__i20.loadedLines()"),
        "ended": ended,
        "seconds": time.monotonic() - t0,
    }


# ---------------------------------------------------------------------------
# Scenarios (cached per process)
# ---------------------------------------------------------------------------

_CACHE = {}


def fixtures():
    if "fx" not in _CACHE:
        _CACHE["fx"] = make_workbooks(tmpdir("issue20_fx_"))
    return _CACHE["fx"]


def site_url():
    if "url" not in _CACHE:
        _CACHE["url"] = serve(render_page())
    return _CACHE["url"]


def idle_scenario():
    if "idle" not in _CACHE:
        good, _ = fixtures()
        page, _ = new_page(site_url())
        # Give the page's own scripts a moment to draw the placeholders (bounded).
        try:
            page.wait_for_selector(".chart-placeholder", state="attached", timeout=10000)
        except Exception:
            pass
        time.sleep(1.0)
        res = {"hooks": has_hooks(page), "no_file": snap(page)}
        page.locator("#build-report").click(timeout=5000) if page.locator("#build-report").count() else None
        time.sleep(1.5)
        res["after_empty_click"] = snap(page)
        page.set_input_files(FILE_INPUT, str(good))
        time.sleep(1.0)
        res["chosen"] = snap(page)
        page.context.close()
        _CACHE["idle"] = res
    return _CACHE["idle"]


def main_page():
    if "main_page" not in _CACHE:
        fixtures()
        page, t_goto = new_page(site_url())
        _CACHE["main_page"] = (page, t_goto)
    return _CACHE["main_page"]


def good_build():
    if "good" not in _CACHE:
        good, _ = fixtures()
        page, t_goto = main_page()
        hooks = has_hooks(page)
        delay = time.monotonic() - t_goto
        build = run_build(page, good, allow_fallback=True)
        build["hooks"] = hooks
        build["goto_to_click_s"] = delay
        _CACHE["good"] = build
    return _CACHE["good"]


def unreadable_build():
    """Runs on the main page, after the good build (order-dependent by design)."""
    if "bad" not in _CACHE:
        good_build()
        _, bad = fixtures()
        page, _ = main_page()
        before = snap(page)
        if not has_hooks(page):
            _CACHE["bad"] = None
        else:
            build = run_build(page, bad)
            build["before"] = before
            _CACHE["bad"] = build
    return _CACHE["bad"]


def broken_build():
    if "broken" not in _CACHE:
        good, _ = fixtures()
        url = serve(render_page(break_living=True))
        page, _ = new_page(url)
        if not has_hooks(page):
            _CACHE["broken"] = None
        else:
            _CACHE["broken"] = run_build(page, good)
        page.context.close()
    return _CACHE["broken"]


def tearDownModule():
    if "browser" in _PW:
        try:
            _PW["browser"].close()
            _PW["pw"].stop()
        except Exception:
            pass
        _PW.clear()
    for s in _SERVERS:
        s.shutdown()
        s.server_close()
    _SERVERS.clear()
    for d in _TMP:
        shutil.rmtree(d, ignore_errors=True)
    _TMP.clear()
    _CACHE.clear()


# ---------------------------------------------------------------------------
# Assertion helpers
# ---------------------------------------------------------------------------

def drawn(s, sid):
    return not s["secs"][sid]["phVis"]


def n_drawn(s):
    return sum(drawn(s, sid) for sid in SECTION_IDS)


class _Base(unittest.TestCase):
    maxDiff = None

    def assertHooks(self, s, where):
        self.assertTrue(s["btn"], f"{where}: no #build-report button on the page")
        self.assertEqual(s["btnTag"], "BUTTON", f"{where}: #build-report is not a <button>")
        self.assertTrue(s["status"], f"{where}: no #build-status element on the page")

    def assertPlaceholders(self, s, where):
        missing = [sid for sid in SECTION_IDS if not s["secs"][sid]["ph"]]
        self.assertEqual(missing, [], f"{where}: sections without a .chart-placeholder")

    def assertIdleButton(self, s, where):
        self.assertFalse(s["btnDisabled"], f"{where}: the button is disabled")
        self.assertEqual(s["btnText"].strip(), "Build the report", f"{where}: button label")

    def assertNoSpinner(self, s, where):
        self.assertFalse(s["spin"], f"{where}: a visible spinner is shown in state {s['state']!r}")

    def busy_window(self, build):
        """Snapshots from 1 s after the click until the build ended."""
        out = []
        for s in build["log"]:
            if s["t"] < build["t_click"] + 1000:
                continue
            if s["state"] in ("done", "failed"):
                break
            out.append(s)
        return out

    def first_all_waiting(self, build):
        for i, s in enumerate(build["log"]):
            if s["state"] == "busy" and all(
                    s["secs"][sid]["phVis"] and WAITING in s["secs"][sid]["phText"] for sid in SECTION_IDS):
                return i
        return None

    def drawn_times(self, build):
        """Index of the first snapshot (from the all-waiting snapshot on) in which
        each section's placeholder is no longer visible."""
        start = self.first_all_waiting(build)
        self.assertIsNotNone(start, "no snapshot during the build in which all nine sections "
                                    "show a visible placeholder with 'Waiting for this chart'")
        log = build["log"]
        times = {}
        for i in range(start, len(log)):
            for sid in SECTION_IDS:
                if sid not in times and drawn(log[i], sid):
                    times[sid] = i
        return times


# ---------------------------------------------------------------------------
# Item 1: before any build
# ---------------------------------------------------------------------------

class TestBeforeBuild(_Base):
    @classmethod
    def setUpClass(cls):
        cls.r = idle_scenario()

    def test_idle_status_without_file(self):
        s = self.r["no_file"]
        self.assertHooks(s, "page loaded, no file")
        self.assertEqual(s["state"], "idle")
        self.assertIn("Choose a cleaned workbook", s["text"])
        self.assertNoSpinner(s, "page loaded, no file")
        self.assertIdleButton(s, "page loaded, no file")

    def test_idle_placeholders_visible_without_waiting_text(self):
        s = self.r["no_file"]
        self.assertPlaceholders(s, "page loaded, no file")
        for sid in SECTION_IDS:
            sec = s["secs"][sid]
            self.assertTrue(sec["phVis"], f"{sid}: placeholder not visible before a build")
            self.assertNotIn(WAITING, sec["phText"], f"{sid}: placeholder says it is waiting before a build")

    def test_click_without_file_changes_nothing(self):
        s = self.r["after_empty_click"]
        self.assertHooks(s, "click without file")
        self.assertEqual(s["state"], "idle")
        self.assertIn("Choose a cleaned workbook", s["text"])
        self.assertNoSpinner(s, "click without file")
        self.assertIdleButton(s, "click without file")

    def test_status_names_chosen_file_before_build(self):
        s = self.r["chosen"]
        self.assertHooks(s, "file chosen")
        self.assertEqual(s["state"], "idle")
        self.assertIn(GOOD_NAME, s["text"])
        self.assertNoSpinner(s, "file chosen")
        self.assertIdleButton(s, "file chosen")


# ---------------------------------------------------------------------------
# Items 2-6 and 9: a build of the good workbook, clicked right after loading
# ---------------------------------------------------------------------------

class TestGoodBuild(_Base):
    @classmethod
    def setUpClass(cls):
        cls.b = good_build()

    def setUp(self):
        self.assertTrue(self.b["hooks"], "the page has no #build-report / #build-status hooks")

    def test_click_before_r_ready_shows_downloading(self):
        b = self.b
        self.assertLess(b["goto_to_click_s"], 10, "harness: click came too late after goto")
        early = [s for s in b["log"] if s["t"] <= b["t_click"] + 3000] + [b["after_click"]]
        ok = [s for s in early if s["state"] == "busy" and s["spin"] and "Downloading R" in s["text"]]
        self.assertTrue(ok, "within 3 s of the click: no busy state with a visible spinner and "
                            f"'Downloading R'; seen: {[(s['state'], s['text'][:80]) for s in early][:5]}")

    def test_busy_with_spinner_throughout_build(self):
        self.assertEqual(self.b["ended"], "done", "the build did not end in state done")
        win = self.busy_window(self.b)
        self.assertTrue(win)
        bad = [(s["state"], s["spin"], s["text"][:80]) for s in win if s["state"] != "busy" or not s["spin"]]
        self.assertEqual(bad, [], "snapshots during the build that are not busy with a visible spinner")

    def test_button_disabled_during_build(self):
        win = self.busy_window(self.b)
        self.assertTrue(win)
        bad = [(s["btnDisabled"], s["btnText"]) for s in win
               if not s["btnDisabled"] or "Building the report" not in s["btnText"]]
        self.assertEqual(bad[:5], [], "button not disabled / not labelled 'Building the report' during the build")

    def test_status_names_steps_in_order(self):
        busy = [s for s in self.b["log"] if s["state"] == "busy"]

        def first(word):
            for i, s in enumerate(busy):
                if word in s["text"]:
                    return i
            return None
        steps = {w: first(w) for w in ("Downloading R", "Reading", "Drawing the charts")}
        for w, i in steps.items():
            self.assertIsNotNone(i, f"the status never said {w!r} while busy")
        self.assertLess(steps["Downloading R"], steps["Reading"])
        self.assertLess(steps["Reading"], steps["Drawing the charts"])

    def test_drawing_status_counts_drawn_sections(self):
        log = self.b["log"]
        drawing = [i for i, s in enumerate(log) if s["state"] == "busy" and "Drawing the charts" in s["text"]]
        self.assertTrue(drawing, "the status never said 'Drawing the charts'")
        checked = 0
        for i in drawing:
            s = log[i]
            k = n_drawn(s)
            # Skip snapshots taken while a section is changing (the count differs
            # in the neighbouring snapshots), to avoid a race between two updates.
            if 0 < i < len(log) - 1 and n_drawn(log[i - 1]) == k == n_drawn(log[i + 1]):
                self.assertLess(k, 9, "status says drawing while all nine sections are drawn")
                self.assertIn(f"{k} of 9", s["text"], f"{k} sections drawn")
                checked += 1
        self.assertGreater(checked, 0)

    def test_undrawn_sections_show_waiting_placeholder_without_figure(self):
        b = self.b
        self.assertPlaceholders(b["final"], "after the build")
        self.assertIsNotNone(self.first_all_waiting(b),
                             "no snapshot in which all nine sections wait with a visible placeholder")
        for s in b["log"]:
            if s["state"] != "busy":
                continue
            for sid in SECTION_IDS:
                sec = s["secs"][sid]
                if sec["phVis"]:
                    self.assertEqual(sec["imgs"], 0, f"{sid}: figure visible while the section waits")
        for s in self.busy_window(b):
            for sid in SECTION_IDS:
                sec = s["secs"][sid]
                if sec["phVis"]:
                    self.assertIn(WAITING, sec["phText"], f"{sid}: placeholder text during the build")

    def test_biography_drawn_before_social_media_problems(self):
        times = self.drawn_times(self.b)
        self.assertIn("biography", times, "Biography was never drawn")
        s = self.b["log"][times["biography"]]
        smp = s["secs"]["social-media-problems"]
        self.assertTrue(smp["phVis"] and WAITING in smp["phText"],
                        "when Biography is drawn, Social media problems no longer waits "
                        "(all sections appear at the same moment)")

    def test_sections_drawn_in_page_order(self):
        times = self.drawn_times(self.b)
        self.assertEqual(sorted(times), sorted(SECTION_IDS), "not every section was drawn during the build")
        order = [times[sid] for sid in SECTION_IDS]
        self.assertEqual(order, sorted(order), f"draw order (snapshot index per section): {order}")
        log = self.b["log"]
        start = self.first_all_waiting(self.b)
        for i in range(start + 1, len(log)):
            for sid in SECTION_IDS:
                if drawn(log[i - 1], sid) and log[i]["state"] == "busy":
                    self.assertTrue(drawn(log[i], sid), f"{sid} went back to waiting during the build")

    def test_completion_status_and_button(self):
        f = self.b["final"]
        self.assertHooks(f, "after the build")
        self.assertEqual(f["state"], "done")
        self.assertIn("The report is complete", f["text"])
        self.assertNoSpinner(f, "after the build")
        self.assertIdleButton(f, "after the build")

    def test_completion_all_sections_have_output(self):
        f = self.b["final"]
        for sid in SECTION_IDS:
            sec = f["secs"][sid]
            self.assertFalse(sec["waiting"], f"{sid} still shows 'Waiting for this chart'")
            self.assertTrue(sec["imgs"] > 0 or sec["outLen"] > 0, f"{sid} has no visible output")
        for sid in FIGURE_SECTIONS:
            self.assertGreaterEqual(f["secs"][sid]["imgs"], 1, f"{sid} shows no visible figure")

    def test_done_only_after_last_section(self):
        done = [s for s in self.b["log"] if s["state"] == "done"]
        self.assertTrue(done, "state never became done")
        for s in done:
            self.assertEqual(n_drawn(s), 9, "state done while sections are still waiting")


class TestLoadedLineUnchanged(_Base):
    """Item 9 (unchanged behaviour). Runs on the good build of TestGoodBuild; if
    #build-report is missing, the build button is found by its label, so this
    test also checks the harness (render, serve, fixture, upload) on its own."""

    @classmethod
    def setUpClass(cls):
        cls.b = good_build()

    def test_loaded_line_still_shown(self):
        lines = self.b["loaded"]
        self.assertTrue(lines, f"no 'Loaded ...' line (build ended: {self.b['ended']})")
        line = lines[0]
        self.assertIn(f"Loaded {GOOD_NAME}.", line["text"])
        self.assertIn("The charts use the remaining 4 young people.", line["text"])
        self.assertTrue(line["before"], "the 'Loaded' line is not above the sections")


# ---------------------------------------------------------------------------
# Item 7: unreadable workbook, after the good build on the same page
# ---------------------------------------------------------------------------

class TestUnreadableAfterGood(_Base):
    @classmethod
    def setUpClass(cls):
        cls.b = unreadable_build()

    def setUp(self):
        self.assertIsNotNone(self.b, "the page has no #build-report / #build-status hooks; build skipped")

    def test_second_build_hides_earlier_figures_while_waiting(self):
        b = self.b
        self.assertGreater(sum(b["before"]["secs"][sid]["imgs"] for sid in SECTION_IDS), 0,
                           "harness: the good build left no figures")
        self.assertIsNotNone(self.first_all_waiting(b),
                             "no snapshot in which all sections wait ('Waiting for this chart')")
        for s in b["log"]:
            if s["state"] != "busy":
                continue
            for sid in SECTION_IDS:
                if s["secs"][sid]["phVis"]:
                    self.assertEqual(s["secs"][sid]["imgs"], 0,
                                     f"{sid}: earlier figure visible while the section waits")

    def test_unreadable_failed_status(self):
        f = self.b["final"]
        self.assertEqual(self.b["ended"], "failed")
        self.assertEqual(f["state"], "failed")
        self.assertIn("could not be read", f["text"])
        self.assertIn("gender1", f["text"])
        self.assertNoSpinner(f, "after the failed load")

    def test_unreadable_button_enabled_again(self):
        self.assertIdleButton(self.b["final"], "after the failed load")

    def test_unreadable_no_waiting_and_no_figures(self):
        f = self.b["final"]
        for sid in SECTION_IDS:
            self.assertFalse(f["secs"][sid]["waiting"], f"{sid} still shows 'Waiting for this chart'")
            self.assertEqual(f["secs"][sid]["imgs"], 0, f"{sid} shows a figure of the earlier workbook")


# ---------------------------------------------------------------------------
# Item 8: one section fails (render_living stops), the build goes on
# ---------------------------------------------------------------------------

class TestSectionFailure(_Base):
    @classmethod
    def setUpClass(cls):
        cls.b = broken_build()

    def setUp(self):
        self.assertIsNotNone(self.b, "the page has no #build-report / #build-status hooks; build skipped")

    def test_failed_section_shows_error_in_section(self):
        sec = self.b["final"]["secs"]["living-situation"]
        self.assertTrue(sec["couldNot"], "Living situation does not say 'could not be drawn'")
        self.assertIn("Test failure in Living situation", sec["text"])
        self.assertFalse(sec["waiting"], "Living situation still shows 'Waiting for this chart'")

    def test_other_sections_still_drawn(self):
        f = self.b["final"]
        for sid in SECTION_IDS:
            if sid == "living-situation":
                continue
            self.assertFalse(f["secs"][sid]["waiting"], f"{sid} still shows 'Waiting for this chart'")
            self.assertFalse(f["secs"][sid]["couldNot"], f"{sid} says 'could not be drawn'")
        for sid in ("biography", "kidscreen"):
            self.assertGreaterEqual(f["secs"][sid]["imgs"], 1, f"{sid} shows no visible figure")

    def test_final_status_names_failed_section(self):
        f = self.b["final"]
        self.assertEqual(f["state"], "failed")
        self.assertIn("could not be drawn", f["text"])
        self.assertIn("Living situation", f["text"])
        self.assertNotIn("The report is complete", f["text"])
        self.assertNoSpinner(f, "after the build with a failed section")

    def test_button_enabled_after_failed_section(self):
        self.assertIdleButton(self.b["final"], "after the build with a failed section")


if __name__ == "__main__":
    unittest.main(verbosity=2)
