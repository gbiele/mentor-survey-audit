# Issue #30: an Overview section whose items are not in the file shows a note
# ("This question is / These questions are not in this file (...), so there is
# no chart.") instead of failing, and a partly present scale gets the note, not
# a sum over fewer items. Expected names, order and wording come from the
# issue #30 contract (Part A). Synthetic CSV fixtures only; no real survey file.
# Held-out cases: the same rules with other items and positions.
# Run from the repo root: Rscript report/tests/test_issue30_heldout.R
# Optional: pass test-name fragments to run only matching tests.

args <- commandArgs(trailingOnly = FALSE)
file_arg <- grep("^--file=", args, value = TRUE)
script_dir <- if (length(file_arg)) {
  dirname(normalizePath(sub("^--file=", "", file_arg)))
} else {
  file.path(getwd(), "report", "tests")
}
report_dir <- normalizePath(file.path(script_dir, ".."))
repo_root <- normalizePath(file.path(report_dir, ".."))
.only <- commandArgs(trailingOnly = TRUE)

suppressPackageStartupMessages({
  library(testthat)
  library(ggplot2)
  library(dplyr)
  library(tidyr)
  library(knitr)
})
# Path (a): the in-browser page sources these files in this order.
for (f in c("load_survey.R", "scores.R", "plots.R", "scales.R", "scale_page.R", "sections.R", "overview.R")) {
  source(file.path(report_dir, "R", f))
}
grDevices::pdf(NULL)

# Count every chart the sections draw.
.rec <- new.env()
.rec$n <- 0L
.orig_mentor_plot <- mentor_plot
mentor_plot <- function(p) {
  .rec$n <- .rec$n + 1L
  .orig_mentor_plot(p)
}

# ---- needed items, written out from the contract ---------------------------

SYMPTOM_ITEMS <- c(
  paste0("bcfpi_raia", 1:6), paste0("bcfpi_coop", 1:6), paste0("bcfpi_ma", 1:6),
  paste0("bcfpi_sa", 1:6), paste0("bcfpi_mood", 1:6), paste0("bcfpi_af", 1:6)
)
FUNCTIONING_ITEMS <- sprintf("bcfpi_yf%02d", 1:12)
ACE_ITEMS <- c(
  "tnqactmh3", "tnqactmh4", "tnqactmh1", "tnqactmh2", "tnqactmh5", "tnqactmh6",
  "tnqactmh7", "tnqactmh8", "dlupa1", "dlupa2", "dlupa3", "fetnqact1", "fetnqact2",
  "fetnqact3", "dlupa4", "dlupa5", "rpginsfy1", "rpginsfy2", "dlup1", "dlup2", "dlup3",
  "pvtnqabb1", "tnqaomhs1", "tnqaomhs2", "tnqaomhs3", "ewcvtqaw1", "ewcvtqaw2",
  "ewcvtqaw3", "ewcvtqaw4"
)
KIDSCREEN_ITEMS <- c(paste0("ks", 1:8), "ksa1", "ksa2")
CYRM_ITEMS <- sprintf("cyrm%02d", 1:12)
MEDIA_ITEMS <- c(paste0("smwd", 1:5), paste0("smwda", 1:5))
BIO_ITEMS <- c("bplace1", "bmborn1", "bfborn1", "live1")
SES_ITEMS <- c("edumom1", "edudad1", "ladder1", "afford1")

# Prose that describes or counts each section's chart (present today).
PROSE <- list(
  symptoms = c("Six sums, each from 0 to 12"),
  functioning = c("Three domains, four items each"),
  ace = c("World Health Organization guidance asks for two totals", "have both totals",
          "Each cell is the percent positive"),
  kidscreen = c("The sum runs from 0 to 40", "have a sum"),
  cyrm = c("The sum runs from 0 to 48", "have a sum"),
  media = c("Mean hours on a normal weekday", "Less than 1 hour is scored 0.5")
)
SECTIONS <- names(PROSE)
render_fn <- function(section) get(paste0("render_overview_", section), mode = "function")

# ---- fixture helpers --------------------------------------------------------

META <- load_dictionary(file.path(repo_root, "data", "master_dictionary.json"), extra = paste0("smadd", 1:9))
CORE <- setdiff(names(META), c(paste0("smadd", 1:9), "consent1"))
stopifnot(all(c(SYMPTOM_ITEMS, FUNCTIONING_ITEMS, ACE_ITEMS, KIDSCREEN_ITEMS, CYRM_ITEMS,
                MEDIA_ITEMS, BIO_ITEMS, SES_ITEMS, "bmo1", "nqapfpfo1", "smpos1", "smneg1") %in% CORE))
N_ROWS <- 4L

header_of <- function(v) gsub("[country]", "Norway", META[[v]]$full, fixed = TRUE)

first_label <- function(v) {
  o <- META[[v]]$options
  o <- o[!o$special, , drop = FALSE]
  if (nrow(o)) o$label[[1]] else ""
}

# Four respondents: Boy, Girl, Boy, Other gender identity. So the excluded
# gender note reads 1 other gender identity, 0 prefer not to answer, 0 missing.
base_values <- function() {
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
  vals$live1 <- rep("I live with both my parents together", N_ROWS)
  vals$livead1 <- rep("", N_ROWS)
  vals$livesp1 <- rep("", N_ROWS)
  vals$momprt1 <- rep("", N_ROWS)
  vals$dadprt1 <- rep("", N_ROWS)
  vals$ladder1 <- c("3", "5", "7", "0")
  vals
}

# blank: variables kept as columns whose every data cell is empty.
make_csv <- function(drop = character(), blank = character()) {
  values <- base_values()
  for (v in blank) values[[v]] <- rep("", N_ROWS)
  vars <- setdiff(names(values), drop)
  df <- as.data.frame(lapply(vars, function(v) values[[v]]), stringsAsFactors = FALSE,
                      col.names = paste0("c", seq_along(vars)))
  names(df) <- vapply(vars, header_of, character(1))
  path <- tempfile(fileext = ".csv")
  utils::write.csv(df, path, row.names = FALSE, fileEncoding = "UTF-8", na = "")
  path
}
load_fixture <- function(drop = character(), blank = character()) {
  load_survey(make_csv(drop, blank), report_dir = report_dir)
}

# A German core-only export: no ACE-IQ block (including the unscored bmo1 and
# nqapfpfo1), no ksa1/ksa2, no weekday/weekend screen-time block.
GERMAN_DROP <- c(ACE_ITEMS, "bmo1", "nqapfpfo1", "ksa1", "ksa2", MEDIA_ITEMS)

note_for <- function(vars) {
  if (length(vars) == 1) {
    paste0("This question is not in this file (", vars, "), so there is no chart.")
  } else {
    paste0("These questions are not in this file (", paste(vars, collapse = ", "), "), so there is no chart.")
  }
}

count_of <- function(text, pattern) lengths(regmatches(text, gregexpr(pattern, text, fixed = TRUE)))

# Web mode (path a): render the tag list to HTML. Headings become "### " lines
# so blocks can be cut out the same way as in local mode.
web_page <- function(fn, survey) {
  old <- options(mentor.webr = TRUE)
  on.exit(options(old), add = TRUE)
  .rec$n <- 0L
  res <- tryCatch(fn(survey), error = function(e) e)
  if (inherits(res, "error")) {
    return(list(error = conditionMessage(res), text = "", lines = character(), plots = .rec$n, imgs = 0L))
  }
  html <- as.character(htmltools::renderTags(res)$html)
  text <- gsub("<h3>([^<]*)</h3>", "\n### \\1\n", html)
  list(error = NULL, text = text, lines = strsplit(text, "\n", fixed = TRUE)[[1]],
       plots = .rec$n, imgs = count_of(html, "<img"))
}

# Local mode (path b): a separate R process sources report/R/setup.R alone, with
# report/ as working directory and REPORT_XLSX pointing at the fixture, then
# prints every render_overview_* function.
LOCAL_FNS <- paste0("render_overview_", c(SECTIONS, "biography", "ses"))
CHILD <- '
a <- commandArgs(trailingOnly = TRUE)
setwd(a[[1]])
source(file.path("R", "setup.R"))
grDevices::pdf(NULL)
.n <- 0L
.orig_plot <- mentor_plot
mentor_plot <- function(p) { .n <<- .n + 1L; .orig_plot(p) }
res <- list()
for (fn in a[-(1:2)]) {
  .n <- 0L
  out <- tryCatch(utils::capture.output(get(fn, mode = "function")(survey)), error = function(e) e)
  res[[fn]] <- if (inherits(out, "error")) {
    list(error = conditionMessage(out), lines = character(), plots = .n)
  } else {
    list(error = NULL, lines = out, plots = .n)
  }
}
saveRDS(res, a[[2]])
'
local_pages <- function(csv) {
  script <- tempfile(fileext = ".R")
  writeLines(CHILD, script)
  out_rds <- tempfile(fileext = ".rds")
  old <- Sys.getenv("REPORT_XLSX", unset = NA)
  Sys.setenv(REPORT_XLSX = csv)
  on.exit(if (is.na(old)) Sys.unsetenv("REPORT_XLSX") else Sys.setenv(REPORT_XLSX = old), add = TRUE)
  log <- suppressWarnings(system2(file.path(R.home("bin"), "Rscript"),
                                  c(shQuote(script), shQuote(report_dir), shQuote(out_rds), LOCAL_FNS),
                                  stdout = TRUE, stderr = TRUE))
  if (!file.exists(out_rds)) stop("setup.R child process failed:\n", paste(log, collapse = "\n"))
  res <- readRDS(out_rds)
  lapply(res, function(r) {
    r$text <- paste(r$lines, collapse = "\n")
    r$imgs <- 0L
    r
  })
}

# Text from the "### <heading>" line to the next "### " line.
segment <- function(page, heading) {
  lines <- page$lines
  start <- which(trimws(lines) == paste0("### ", heading))
  if (length(start) != 1) return(NA_character_)
  idx <- seq_along(lines)
  nxt <- idx[idx > start & startsWith(trimws(lines), "### ")]
  end <- if (length(nxt)) nxt[[1]] - 1L else length(lines)
  paste(lines[start:end], collapse = "\n")
}

expect_no_error_page <- function(page, what) {
  expect_null(page$error, info = paste(what, "raised:", paste(page$error, collapse = " ")))
}

expect_section_note <- function(page, section, absent) {
  expect_no_error_page(page, section)
  if (!is.null(page$error)) return(invisible())
  expect_true(grepl(note_for(absent), page$text, fixed = TRUE),
              info = paste(section, "should show:", note_for(absent)))
  expect_equal(count_of(page$text, "not in this file"), 1L, info = section)
  expect_equal(page$plots, 0L, info = paste(section, "mentor_plot calls"))
  expect_equal(page$imgs, 0L, info = paste(section, "<img>"))
  expect_equal(count_of(page$text, "<table"), 0L, info = paste(section, "<table>"))
  for (p in PROSE[[section]]) expect_false(grepl(p, page$text, fixed = TRUE), info = paste(section, "keeps:", p))
}

expect_section_drawn <- function(page, section) {
  expect_no_error_page(page, section)
  if (!is.null(page$error)) return(invisible())
  expect_equal(page$plots, 1L, info = paste(section, "mentor_plot calls"))
  expect_false(grepl("not in this file", page$text, fixed = TRUE), info = section)
  for (p in PROSE[[section]]) expect_true(grepl(p, page$text, fixed = TRUE), info = paste(section, "lacks:", p))
  expect_equal(count_of(page$text, "<table"), if (section == "ace") 2L else 0L, info = paste(section, "<table>"))
}

GENDER_NOTE <- paste(
  "The gender bars are Boy and Girl only. Left out of those bars: 1 other gender identity,",
  "0 prefer not to answer, 0 missing gender."
)
LATER_GROUPS <- "The later score charts on this page use those same two groups. The social media chart is not split by gender."

# ---- reporter -----------------------------------------------------------------

.reporter <- ListReporter$new()
.reporter$start_reporter()
.reporter$start_file("test_issue30_heldout")
invisible(set_reporter(.reporter))

it <- function(name, code) {
  if (length(.only) && !any(vapply(.only, function(o) grepl(o, name, fixed = TRUE), logical(1)))) {
    return(invisible())
  }
  eval(bquote(test_that(.(name), .(substitute(code)))), parent.frame())
}

expect_block_note <- function(page, heading, absent, prose = character()) {
  seg <- segment(page, heading)
  expect_false(is.na(seg), info = paste("heading kept:", heading))
  if (is.na(seg)) return(invisible())
  expect_true(grepl(note_for(absent), seg, fixed = TRUE), info = paste(heading, "should show:", note_for(absent)))
  expect_equal(count_of(seg, "not in this file"), 1L, info = heading)
  expect_equal(count_of(seg, "<img"), 0L, info = paste(heading, "<img>"))
  expect_equal(count_of(seg, "<table"), 0L, info = paste(heading, "<table>"))
  for (p in prose) expect_false(grepl(p, seg, fixed = TRUE), info = paste(heading, "keeps:", p))
}
expect_block_drawn <- function(page, heading) {
  seg <- segment(page, heading)
  expect_false(is.na(seg), info = heading)
  if (is.na(seg)) return(invisible())
  expect_equal(count_of(seg, "<img"), 1L, info = paste(heading, "<img>"))
  expect_equal(count_of(seg, "<table"), 1L, info = paste(heading, "<table>"))
  expect_false(grepl("not in this file", seg, fixed = TRUE), info = heading)
}

# ---- held-out cases -----------------------------------------------------------

it("ACE note lists absent items in the contract order (tnqactmh3 before tnqactmh1)", {
  s <- load_fixture(drop = c("tnqactmh1", "tnqactmh3", "ewcvtqaw4"))
  expect_section_note(web_page(render_overview_ace, s), "ace", c("tnqactmh3", "tnqactmh1", "ewcvtqaw4"))
  # Other sections are not affected.
  expect_section_drawn(web_page(render_overview_kidscreen, s), "kidscreen")
})

it("symptoms across two scales and media with only smwda5 absent get notes; CYRM unaffected", {
  s <- load_fixture(drop = c("bcfpi_af6", "bcfpi_coop2", "smwda5"))
  page <- web_page(render_overview_symptoms, s)
  expect_section_note(page, "symptoms", c("bcfpi_coop2", "bcfpi_af6"))
  expect_true(grepl(GENDER_NOTE, page$text, fixed = TRUE))
  expect_true(grepl(LATER_GROUPS, page$text, fixed = TRUE))
  expect_section_note(web_page(render_overview_media, s), "media", "smwda5")
  expect_section_drawn(web_page(render_overview_cyrm, s), "cyrm")
})

it("KIDSCREEN with only ks5 absent and functioning with only bcfpi_yf01 absent get notes", {
  s <- load_fixture(drop = c("ks5", "bcfpi_yf01"))
  expect_section_note(web_page(render_overview_kidscreen, s), "kidscreen", "ks5")
  fun <- web_page(render_overview_functioning, s)
  expect_section_note(fun, "functioning", "bcfpi_yf01")
  expect_true(grepl(note_for("bcfpi_yf01"), segment(fun, "Functioning"), fixed = TRUE))
  expect_section_drawn(web_page(render_overview_ace, s), "ace")
})

it("setup.R: biography and ses blocks with several absent items, other blocks drawn", {
  pages <- local_pages(make_csv(drop = c("bfborn1", "bplace1", "edudad1", "edumom1", "afford1", "cyrm05")))
  bio <- pages$render_overview_biography
  expect_no_error_page(bio, "biography")
  expect_block_note(bio, "Migration background", c("bplace1", "bfborn1"), "Born in Norway means")
  expect_true(grepl("<table", segment(bio, "Living situation"), fixed = TRUE))
  expect_true(grepl("Who the young person lives with", segment(bio, "Living situation"), fixed = TRUE))
  expect_equal(bio$plots, 2L)
  ses <- pages$render_overview_ses
  expect_no_error_page(ses, "ses")
  expect_block_note(ses, "Highest parental education", c("edumom1", "edudad1"), "The level is the higher of")
  expect_block_note(ses, "Family can afford what it needs", "afford1")
  expect_true(grepl("The ladder runs from 1 to 10", segment(ses, "Social ladder"), fixed = TRUE))
  expect_true(grepl("<table", segment(ses, "Social ladder"), fixed = TRUE))
  expect_equal(ses$plots, 1L)
  expect_section_note(pages$render_overview_cyrm, "cyrm", "cyrm05")
  expect_section_drawn(pages$render_overview_media, "media")
})

# ---- summary ------------------------------------------------------------------

grDevices::dev.off()
.results <- .reporter$get_results()
.failed <- 0L
for (r in .results) {
  bad <- Filter(function(e) inherits(e, c("expectation_failure", "expectation_error")), r$results)
  if (length(bad)) {
    .failed <- .failed + 1L
    cat("FAIL:", r$test, "\n")
    for (e in bad) cat("   ", gsub("\n", "\n    ", conditionMessage(e)), "\n")
  } else {
    cat("PASS:", r$test, "\n")
  }
}
cat(length(.results) - .failed, "passed,", .failed, "failed\n")
if (.failed > 0) quit(status = 1)
