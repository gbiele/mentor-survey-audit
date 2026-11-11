# Issue #10, held-out cases: same contract as test_issue10_missing_columns.R,
# other inputs (other scales, subsections and absent variables).
# Synthetic CSV fixtures only; no real survey file is read.
# Run from the repo root: Rscript report/tests/test_issue10_heldout.R

args <- commandArgs(trailingOnly = FALSE)
file_arg <- grep("^--file=", args, value = TRUE)
script_dir <- if (length(file_arg)) {
  dirname(normalizePath(sub("^--file=", "", file_arg)))
} else {
  file.path(getwd(), "report", "tests")
}
report_dir <- normalizePath(file.path(script_dir, ".."))
repo_root <- normalizePath(file.path(report_dir, ".."))

suppressPackageStartupMessages({
  library(testthat)
  library(ggplot2)
  library(dplyr)
  library(tidyr)
  library(knitr)
})
for (f in c("load_survey.R", "scores.R", "plots.R", "scales.R", "scale_page.R", "sections.R")) {
  source(file.path(report_dir, "R", f))
}
grDevices::pdf(NULL)

# Record every chart the pages print, so the tests can see which charts appear.
.rec <- new.env()
.rec$plots <- list()
.orig_mentor_plot <- mentor_plot
mentor_plot <- function(p) {
  .rec$plots[[length(.rec$plots) + 1L]] <- p
  .orig_mentor_plot(p)
}

# ---- fixture helpers ------------------------------------------------------

META <- load_dictionary(file.path(repo_root, "data", "master_dictionary.json"), extra = paste0("smadd", 1:9))
CORE <- setdiff(names(META), paste0("smadd", 1:9))
PARTICIPATION <- "Do you wish to participate in MENTOR?"
N_ROWS <- 4L

header_of <- function(v) gsub("[country]", "Norway", META[[v]]$full, fixed = TRUE)

first_label <- function(v) {
  o <- META[[v]]$options
  o <- o[!o$special, , drop = FALSE]
  if (nrow(o)) o$label[[1]] else ""
}

# Four respondents. Hand-derived facts used below:
# gender Boy, Girl, Boy, Other gender identity -> ident1 asked only of row 4.
# born 2010, March -> completed age 16 on 1 July 2026 for every row.
# row 2 born in Ukraine (bage1 asked), others born in Norway (bage1 not asked).
# row 3 parents live apart, lives with both -> livesp1, momprt1, dadprt1 asked
# only of row 3; livead1 asked of nobody.
# ladder 3, 5, 7, 0: one 0 outside the 1-10 list; mean of 3, 5, 7 is 5.00,
# sd 2, 95% CI 5 -/+ 1.96 * 2 / sqrt(3) = 2.74 to 7.26.
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
  vals$consent1 <- rep("No", N_ROWS)
  vals
}

# Write a CSV fixture. participation = NULL leaves the column out.
# extra: named list of header -> values, appended after the core columns.
make_csv <- function(values = base_values(),
                     participation = rep("Yes", length(values[[1]])),
                     drop = character(),
                     extra = list(),
                     vars = names(values)) {
  vars <- setdiff(vars, drop)
  cols <- list()
  headers <- character()
  if (!is.null(participation)) {
    cols <- c(cols, list(participation))
    headers <- c(headers, PARTICIPATION)
  }
  for (v in vars) {
    cols <- c(cols, list(values[[v]]))
    headers <- c(headers, header_of(v))
  }
  for (h in names(extra)) {
    cols <- c(cols, list(extra[[h]]))
    headers <- c(headers, h)
  }
  df <- as.data.frame(cols, stringsAsFactors = FALSE, col.names = paste0("c", seq_along(cols)))
  names(df) <- headers
  path <- tempfile(fileext = ".csv")
  utils::write.csv(df, path, row.names = FALSE, fileEncoding = "UTF-8")
  path
}

load_csv <- function(path) load_survey(path, report_dir = report_dir)

# Render fixtures leave out consent1 so that a page failure is about the page,
# not about the loader mistaking consent1 for consent (covered in section 1).
render_values <- function() {
  v <- base_values()
  v$consent1 <- NULL
  v
}
load_render <- function(drop = character(), participation = rep("Yes", N_ROWS)) {
  load_csv(make_csv(render_values(), participation = participation, drop = drop))
}

capture_page <- function(expr) {
  .rec$plots <- list()
  out <- utils::capture.output(force(expr))
  list(text = paste(out, collapse = "\n"), lines = out, plots = .rec$plots)
}

plot_lab <- function(p, what) {
  x <- tryCatch(p$labels[[what]], error = function(e) NULL)
  if (is.null(x)) "" else paste(as.character(x), collapse = " ")
}
norm_ws <- function(x) gsub("\\s+", " ", trimws(x))
mean_charts <- function(page) Filter(function(p) plot_lab(p, "title") == "Mean score by gender", page$plots)
item_charts <- function(page) Filter(function(p) startsWith(plot_lab(p, "subtitle"), "Percent within each gender"), page$plots)
chart_titles <- function(plots) vapply(plots, function(p) norm_ws(plot_lab(p, "title")), character(1))
has_item_chart <- function(page, survey, v) {
  label <- norm_ws(survey$meta[[v]]$plot_label)
  any(endsWith(chart_titles(item_charts(page)), label))
}

# Text between "### <heading>" and the next "### " heading.
segment <- function(page, heading) {
  lines <- page$lines
  start <- which(lines == paste0("### ", heading))
  if (length(start) != 1) return(NA_character_)
  rest <- seq_len(length(lines))[seq_len(length(lines)) > start]
  nxt <- rest[startsWith(lines[rest], "### ")]
  end <- if (length(nxt)) nxt[[1]] - 1L else length(lines)
  paste(lines[start:end], collapse = "\n")
}
opening <- function(page) {
  lines <- page$lines
  first <- which(startsWith(lines, "### "))[1]
  paste(lines[seq_len(first - 1L)], collapse = "\n")
}
names_var <- function(text, v) grepl(paste0("\\b", v, "\\b"), text)
count_tables <- function(text) lengths(regmatches(text, gregexpr("<table", text, fixed = TRUE)))

expect_absent_note <- function(seg, absent, present = character()) {
  expect_false(is.na(seg))
  expect_true(grepl("not in this file", seg, fixed = TRUE), info = substr(seg, 1, 120))
  for (v in absent) expect_true(names_var(seg, v), info = paste("note should name", v))
  for (v in present) expect_false(names_var(seg, v), info = paste("note should not name", v))
  expect_equal(count_tables(seg), 0L)
}

# ---- reporter -------------------------------------------------------------

.reporter <- ListReporter$new()
.reporter$start_reporter()
.reporter$start_file("test_issue10_heldout")
invisible(set_reporter(.reporter))

expect_partial_likert <- function(page, s, items, absent) {
  expect_false(grepl("have a score", page$text, fixed = TRUE))
  expect_false(grepl("Sum scores:", page$text, fixed = TRUE))
  expect_length(mean_charts(page), 0L)
  present <- setdiff(items, absent)
  expect_length(item_charts(page), length(present))
  for (v in present) expect_true(has_item_chart(page, s, v), info = v)
  expect_true(grepl("not in this file", page$text, fixed = TRUE))
  for (v in absent) expect_true(names_var(page$text, v), info = v)
  expect_true(grepl("## What the scale measures", page$text, fixed = TRUE))
  expect_true(grepl("## How the score is calculated", page$text, fixed = TRUE))
}

test_that("held-out: CYRM-12 with first and last items absent has no sum, charts the other 10", {
  s <- load_render(drop = c("cyrm01", "cyrm12"))
  page <- capture_page(render_scale(s, "cyrm"))
  expect_partial_likert(page, s, cyrm_items(), c("cyrm01", "cyrm12"))
})

test_that("held-out: functioning with yf01 and yf12 absent scores only Social participation", {
  s <- load_render(drop = c("bcfpi_yf01", "bcfpi_yf12"))
  page <- capture_page(render_scale(s, "functioning"))
  expect_true(grepl("Social participation: 4 of 4 have a score", page$text, fixed = TRUE))
  for (d in c("Quality of relationships", "School participation and achievement")) {
    expect_false(grepl(paste0(d, ": [^\n]*have a score"), page$text), info = d)
    line <- grep(paste0("^", d, ":"), page$lines, value = TRUE)
    expect_length(line, 1L)
    expect_true(all(grepl("no sum", line, fixed = TRUE)), info = d)
  }
  expect_true(grepl("not in this file", page$text, fixed = TRUE))
  for (v in c("bcfpi_yf01", "bcfpi_yf12")) expect_true(names_var(page$text, v), info = v)
  means <- mean_charts(page)
  expect_length(means, 1L)
  shown <- norm_ws(as.character(unique(means[[1]]$data$score_name)))
  expect_false(any(grepl("Quality of relationships", shown, fixed = TRUE)))
  expect_false(any(grepl("School participation", shown, fixed = TRUE)))
  expect_length(item_charts(page), 10L)
})

test_that("held-out: section pages with live1, grade1, edudad1 and afford1 absent", {
  s <- load_render(drop = c("live1", "grade1", "edudad1", "afford1"))
  # live1 is the trigger: its follow-ups keep their own status (blank = missing).
  expect_identical(s$status$livead1, rep("missing", N_ROWS))
  expect_identical(s$status$livesp1, c("missing", "missing", "answered", "missing"))
  expect_identical(s$status$momprt1, c("missing", "missing", "answered", "missing"))
  expect_false("live1" %in% names(s$status))
  liv <- capture_page(render_living(s))
  expect_absent_note(segment(liv, "Household"), "live1")
  expect_true(grepl("<table", segment(liv, "Siblings in the home"), fixed = TRUE))
  expect_true(grepl("<table", segment(liv, "Time with each parent"), fixed = TRUE))
  bio <- capture_page(render_biography(s))
  expect_absent_note(segment(bio, "Grade"), "grade1")
  expect_false("What grade are you in?" %in% chart_titles(bio$plots))
  expect_true(grepl("<table", segment(bio, "Gender identity"), fixed = TRUE))
  ses <- capture_page(render_socioeconomic(s))
  expect_absent_note(segment(ses, "Father's education"), "edudad1", present = "edumom1")
  expect_absent_note(segment(ses, "Family can afford what it needs"), "afford1", present = "edudad1")
  expect_true(grepl("<table", segment(ses, "Mother's education"), fixed = TRUE))
  expect_true(grepl("<table", segment(ses, "Social ladder"), fixed = TRUE))
})

test_that("held-out: consent1 with mixed answers, extra columns, and ACE with tnqactmh8 absent", {
  vals <- base_values()
  # Filtering on consent1 would keep rows 1-3 (n = 3); participation keeps rows 2 and 4.
  vals$consent1 <- c("Yes", "Yes", "Yes", "No")
  extra <- list("Q7_ES: Comunidad" = c("x", "y", "z", "w"), "weight" = c("1", "1", "2", "2"))
  s <- load_csv(make_csv(vals, participation = c("No", "Yes", "No", "Yes"), extra = extra))
  expect_identical(s$n, 2L)
  expect_identical(s$n_declined, 2L)
  expect_identical(s$label$gender1, c("Girl", "Other gender identity"))
  expect_identical(s$label$consent1, c("Yes", "No"))
  expect_identical(s$ignored_columns, c("Q7_ES: Comunidad", "weight"))
  s0 <- load_csv(make_csv(vals, participation = NULL))
  expect_identical(s0$n, N_ROWS)
  expect_identical(s0$n_declined, 0L)
  expect_identical(s0$has_consent, FALSE)

  a <- load_render(drop = c("tnqactmh8", "bmo1", "nqapfpfo1"))
  summ <- capture_page(render_scale(a, "ace", parts = "summary"))
  expect_false(grepl("ACE totals:", summ$text, fixed = TRUE))
  expect_false(grepl("Percent in each category", summ$text, fixed = TRUE))
  expect_length(mean_charts(summ), 0L)
  expect_true(grepl("not in this file", summ$text, fixed = TRUE))
  expect_true(names_var(summ$text, "tnqactmh8"))
  items <- capture_page(render_scale(a, "ace", parts = "items"))
  expect_length(item_charts(items), length(ace_page_items()) - 3L)
  for (v in c("tnqactmh8", "bmo1", "nqapfpfo1")) expect_true(names_var(items$text, v), info = v)
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
