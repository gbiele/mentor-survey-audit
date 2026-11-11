# Issue #10: the results analyser tolerates a missing participation column,
# extra (country-specific) columns, and absent core items.
# Synthetic CSV fixtures only; no real survey file is read.
# Run from the repo root: Rscript report/tests/test_issue10_missing_columns.R

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
.reporter$start_file("test_issue10_missing_columns")
invisible(set_reporter(.reporter))

# ---- 1. participation column ----------------------------------------------

test_that("1a: participation column filters rows, consent1 is an ordinary variable", {
  vals <- lapply(base_values(), `[`, 1:3)
  vals$consent1 <- rep("No", 3)
  s <- load_csv(make_csv(vals, participation = c("Yes", "Yes", "No")))
  # Filtering on consent1 ("No" everywhere) would give n = 0.
  expect_identical(s$n, 2L)
  expect_identical(s$n_declined, 1L)
  expect_equal(s$n_file, 3)
  expect_true("consent1" %in% names(s$code))
  expect_identical(s$label$consent1, c("No", "No"))
  expect_identical(s$label$gender1, c("Boy", "Girl"))
  expect_true(isTRUE(s$has_consent))
})

test_that("1b: no participation column with consent1 keeps all rows and n_declined is 0L", {
  s <- load_csv(make_csv(base_values(), participation = NULL))
  expect_identical(s$n, N_ROWS)
  expect_equal(s$n_file, N_ROWS)
  expect_identical(s$n_declined, 0L)
  expect_true("consent1" %in% names(s$code))
  expect_identical(s$has_consent, FALSE)
})

test_that("1b: no participation column and no consent1 keeps all rows and n_declined is 0L", {
  s <- load_csv(make_csv(render_values(), participation = NULL))
  expect_identical(s$n, N_ROWS)
  expect_equal(s$n_file, N_ROWS)
  expect_identical(s$n_declined, 0L)
  expect_identical(s$has_consent, FALSE)
})

test_that("1d: two participation columns still stop", {
  path <- make_csv(render_values(), extra = setNames(list(rep("Yes", N_ROWS)), PARTICIPATION))
  expect_error(load_csv(path))
})

test_that("1e: participation values are trimmed and compared case-insensitively", {
  s <- load_csv(make_csv(base_values(), participation = c(" yes ", "YES", "No", "")))
  expect_identical(s$n, 2L)
  expect_identical(s$n_declined, 2L)
  expect_identical(s$label$gender1, c("Boy", "Girl"))
})

# ---- 2. extra columns ------------------------------------------------------

test_that("2a/2b: a column matching no dictionary variable is ignored and listed", {
  extra <- list("Region (ES only)" = c("A", "B", "C", "D"))
  s <- load_csv(make_csv(render_values(), extra = extra))
  expect_identical(s$ignored_columns, "Region (ES only)")
  for (part in c("code", "label", "status")) {
    expect_false("Region (ES only)" %in% names(s[[part]]))
    expect_equal(ncol(s[[part]]), length(CORE) - 1L) # every core variable except consent1
  }
})

test_that("2b: ignored_columns keeps the headers exactly, in file order", {
  extra <- list("School ID" = as.character(1:4), "Region (ES only)" = c("A", "B", "C", "D"))
  s <- load_csv(make_csv(render_values(), extra = extra))
  expect_identical(s$ignored_columns, c("School ID", "Region (ES only)"))
})

test_that("2b: ignored_columns is character(0) when nothing is ignored", {
  s <- load_csv(make_csv(render_values()))
  expect_identical(s$ignored_columns, character(0))
})

test_that("2c: other variables load as before next to an extra column", {
  s <- load_csv(make_csv(render_values(), extra = list("School ID" = as.character(1:4))))
  expect_identical(s$n, N_ROWS)
  expect_identical(s$code$gender1, c(1L, 2L, 1L, 3L))
  expect_identical(s$code$grade1, rep(1L, N_ROWS))
  expect_identical(s$country, "Norway")
  expect_identical(s$age, rep(16L, N_ROWS))
})

test_that("2d: ambiguity errors stay", {
  # Two columns for the same variable.
  dup <- make_csv(render_values(), extra = setNames(list(c("Boy", "Girl", "Boy", "Girl")), header_of("gender1")))
  expect_error(load_csv(dup))
  # Item text shared by the weekday (smwd1) and weekend (smwda1) questions
  # matches more than one variable.
  shared <- META$smwd1$item
  expect_identical(shared, META$smwda1$item)
  amb <- make_csv(render_values(), extra = setNames(list(rep(first_label("smwd1"), N_ROWS)), shared))
  expect_error(load_csv(amb))
})

# ---- 3. absent core variables ---------------------------------------------

test_that("3b: skip rules apply as before when trigger and target are present", {
  s <- load_render()
  expect_identical(s$status$ident1, c("not_asked", "not_asked", "not_asked", "answered"))
  expect_identical(s$status$bage1, c("not_asked", "answered", "not_asked", "not_asked"))
  expect_identical(s$status$livead1, rep("not_asked", N_ROWS))
  expect_identical(s$status$livesp1, c("not_asked", "not_asked", "answered", "not_asked"))
  expect_identical(s$status$momprt1, c("not_asked", "not_asked", "answered", "not_asked"))
  expect_identical(s$status$dadprt1, c("not_asked", "not_asked", "answered", "not_asked"))
})

test_that("3a/3c: without ident1 the file loads, no ident1 column is added, other rules apply", {
  s <- load_render(drop = "ident1")
  expect_false("ident1" %in% names(s$code))
  expect_false("ident1" %in% names(s$status))
  expect_false("ident1" %in% names(s$label))
  expect_identical(s$status$bage1, c("not_asked", "answered", "not_asked", "not_asked"))
  expect_identical(s$status$livesp1, c("not_asked", "not_asked", "answered", "not_asked"))
})

test_that("3a: apply_skip_rules with an absent target leaves the status columns unchanged", {
  s <- load_render()
  for (part in c("code", "label", "status")) s[[part]]$livesp1 <- NULL
  before <- names(s$status)
  out <- apply_skip_rules(s)
  expect_identical(names(out$status), before)
  expect_identical(out$status$momprt1, c("not_asked", "not_asked", "answered", "not_asked"))
})

test_that("3a: an absent trigger leaves the target status unchanged (bplace1 -> bage1)", {
  s <- load_render(drop = "bplace1")
  # bage1 blank on rows 1, 3, 4: missing, not not_asked, because bplace1 is absent.
  expect_identical(s$status$bage1, c("missing", "answered", "missing", "missing"))
  expect_identical(s$status$ident1, c("not_asked", "not_asked", "not_asked", "answered"))
})

test_that("3a: apply_skip_rules with gender1 absent does not mark ident1 not_asked", {
  s <- load_render()
  for (part in c("code", "label", "status")) s[[part]]$gender1 <- NULL
  s$status$ident1 <- c("missing", "missing", "missing", "answered")
  out <- apply_skip_rules(s)
  expect_identical(out$status$ident1, c("missing", "missing", "missing", "answered"))
})

test_that("3d: age and migration with every input present", {
  s <- load_render()
  expect_identical(s$age, rep(16L, N_ROWS))
  expect_identical(s$migration, c(
    "Born in Norway, both parents born in Norway", "Born abroad",
    "Born in Norway, both parents born in Norway", "Born in Norway, both parents born in Norway"
  ))
})

test_that("3d: age is integer NA when bmonth1 or byear1 is absent", {
  for (v in c("bmonth1", "byear1")) {
    s <- load_render(drop = v)
    expect_identical(s$age, rep(NA_integer_, N_ROWS), info = v)
  }
})

test_that("3d: migration is character NA when a birthplace variable is absent", {
  for (v in c("bfborn1", "bplace1")) {
    s <- load_render(drop = v)
    expect_identical(s$migration, rep(NA_character_, N_ROWS), info = v)
  }
})

test_that("3e: gender1 and bage1 stay required with messages naming them", {
  expect_error(load_render(drop = "gender1"), "gender1")
  expect_error(load_render(drop = "bage1"), "bage1")
})

# ---- 4. section pages ------------------------------------------------------

BIO_HEADINGS <- c("Gender", "Gender identity", "Grade", "Age", "Migration background", "Country of birth")
LIVING_HEADINGS <- c("Household", "Adults in the home", "Time with each parent",
                     "Mother's new partner", "Father's new partner", "Siblings in the home")
SES_HEADINGS <- c("Social ladder", "Mother's education", "Father's education", "Family can afford what it needs")

test_that("4c/4d: biography with every variable and a participation column", {
  # Row 1 (a boy) declines: kept rows are Girl, Boy, Other gender identity,
  # so ident1 is skipped for 2 and asked of 1.
  s <- load_render(participation = c("No", "Yes", "Yes", "Yes"))
  page <- capture_page(render_biography(s))
  for (h in BIO_HEADINGS) expect_false(is.na(segment(page, h)), info = h)
  expect_equal(count_tables(page$text), 6L)
  expect_length(page$plots, 6L)
  expect_true(grepl(paste0("1 people in ", s$file, " declined"), opening(page), fixed = TRUE))
  expect_true(grepl("The percentages leave out 2 young people whose earlier answer skipped this question.",
                    segment(page, "Gender identity"), fixed = TRUE))
  expect_true(grepl("Mean age is 16.0 years (3 young people)", segment(page, "Age"), fixed = TRUE))
  expect_false(grepl("not in this file", page$text, fixed = TRUE))
})

test_that("4d: biography opening without a participation column", {
  s <- load_render(participation = NULL)
  open <- opening(page <- capture_page(render_biography(s)))
  expect_true(grepl("no participation question", open, fixed = TRUE))
  expect_true(grepl("\\b4\\b", open))
  expect_false(grepl("declined", open, fixed = TRUE))
})

test_that("4a/4b: biography without ident1 notes the gap and renders the rest", {
  s <- load_render(drop = "ident1")
  page <- capture_page(render_biography(s))
  expect_absent_note(segment(page, "Gender identity"), "ident1")
  expect_false("What do you identify as?" %in% chart_titles(page$plots))
  expect_length(page$plots, 5L)
  expect_true(grepl("<table", segment(page, "Grade"), fixed = TRUE))
  expect_true("What grade are you in?" %in% chart_titles(page$plots))
  expect_true(grepl("Mean age is 16.0 years (4 young people)", segment(page, "Age"), fixed = TRUE))
})

test_that("4a: only bmonth1 absent gives an Age note naming bmonth1, not byear1", {
  s <- load_render(drop = "bmonth1")
  page <- capture_page(render_biography(s))
  seg <- segment(page, "Age")
  expect_absent_note(seg, "bmonth1", present = "byear1")
  expect_false(grepl("Mean age", seg, fixed = TRUE))
  expect_false("Age on 1 July 2026" %in% chart_titles(page$plots))
  expect_true(grepl("<table", segment(page, "Grade"), fixed = TRUE))
})

test_that("4a: only bmborn1 absent notes Migration background; Country of birth still renders", {
  s <- load_render(drop = "bmborn1")
  page <- capture_page(render_biography(s))
  expect_absent_note(segment(page, "Migration background"), "bmborn1", present = c("bplace1", "bfborn1"))
  expect_false("Migration background" %in% chart_titles(page$plots))
  expect_true(grepl("<table", segment(page, "Country of birth"), fixed = TRUE))
  expect_true("Where were you born?" %in% chart_titles(page$plots))
})

test_that("4c: living page with every variable", {
  s <- load_render()
  page <- capture_page(render_living(s))
  for (h in LIVING_HEADINGS) expect_true(grepl("<table", segment(page, h), fixed = TRUE), info = h)
  expect_true(grepl("The percentages leave out 3 young people", segment(page, "Time with each parent"), fixed = TRUE))
  expect_false(grepl("not in this file", page$text, fixed = TRUE))
})

test_that("4a/4b: living page without livesp1 notes only that subsection", {
  s <- load_render(drop = "livesp1")
  page <- capture_page(render_living(s))
  expect_absent_note(segment(page, "Time with each parent"), "livesp1")
  for (h in setdiff(LIVING_HEADINGS, "Time with each parent")) {
    expect_true(grepl("<table", segment(page, h), fixed = TRUE), info = h)
  }
  expect_true(grepl("The percentages leave out 3 young people", segment(page, "Mother's new partner"), fixed = TRUE))
})

test_that("4c: socioeconomic page with every variable", {
  s <- load_render()
  page <- capture_page(render_socioeconomic(s))
  for (h in SES_HEADINGS) expect_true(grepl("<table", segment(page, h), fixed = TRUE), info = h)
  seg <- segment(page, "Social ladder")
  expect_true(grepl("1 answers of 0", seg, fixed = TRUE))
  expect_true(grepl("The mean of the 1-10 answers is 5.00 (95% CI 2.74 to 7.26; n = 3)", seg, fixed = TRUE))
})

test_that("4a/4b: socioeconomic page without ladder1 notes only the ladder", {
  s <- load_render(drop = "ladder1")
  page <- capture_page(render_socioeconomic(s))
  seg <- segment(page, "Social ladder")
  expect_absent_note(seg, "ladder1")
  expect_false(grepl("The mean of the 1-10 answers", seg, fixed = TRUE))
  for (h in setdiff(SES_HEADINGS, "Social ladder")) {
    expect_true(grepl("<table", segment(page, h), fixed = TRUE), info = h)
  }
})

test_that("4e: Spain case (no participation column, no ident1) renders all three pages", {
  s <- load_render(drop = "ident1", participation = NULL)
  bio <- capture_page(render_biography(s))
  liv <- capture_page(render_living(s))
  ses <- capture_page(render_socioeconomic(s))
  expect_true(grepl("no participation question", opening(bio), fixed = TRUE))
  expect_absent_note(segment(bio, "Gender identity"), "ident1")
  expect_equal(count_tables(liv$text), 6L)
  expect_equal(count_tables(ses$text), 4L)
})

# ---- 5. scale pages ---------------------------------------------------------

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

test_that("5c: KIDSCREEN with ksa2 absent has no (prorated) sum and charts the other 9 items", {
  s <- load_render(drop = "ksa2")
  page <- capture_page(render_scale(s, "kidscreen"))
  expect_partial_likert(page, s, kidscreen_items(), "ksa2")
})

test_that("5c: attention with bcfpi_raia3 absent has no sum and charts the other 5 items", {
  s <- load_render(drop = "bcfpi_raia3")
  page <- capture_page(render_scale(s, "attention"))
  expect_partial_likert(page, s, attention_items(), "bcfpi_raia3")
})

test_that("5d: functioning with bcfpi_yf05 absent scores only the complete domains", {
  s <- load_render(drop = "bcfpi_yf05")
  page <- capture_page(render_scale(s, "functioning"))
  expect_true(grepl("Quality of relationships: 4 of 4 have a score", page$text, fixed = TRUE))
  expect_true(grepl("School participation and achievement: 4 of 4 have a score", page$text, fixed = TRUE))
  expect_false(grepl("Social participation: [^\n]*have a score", page$text))
  social <- grep("^Social participation:", page$lines, value = TRUE)
  expect_length(social, 1L)
  expect_true(grepl("no sum", social, fixed = TRUE))
  expect_true(grepl("not in this file", page$text, fixed = TRUE))
  expect_true(names_var(page$text, "bcfpi_yf05"))
  means <- mean_charts(page)
  expect_length(means, 1L)
  shown <- norm_ws(as.character(unique(means[[1]]$data$score_name)))
  expect_false(any(grepl("Social participation", shown, fixed = TRUE)))
  expect_length(item_charts(page), 11L)
})

test_that("5e: ACE summary with a scored item (dlup1) absent gives no totals", {
  s <- load_render(drop = "dlup1")
  page <- capture_page(render_scale(s, "ace", parts = "summary"))
  expect_false(grepl("ACE totals:", page$text, fixed = TRUE))
  expect_length(mean_charts(page), 0L)
  expect_false(grepl("Percent in each category", page$text, fixed = TRUE))
  expect_true(grepl("not in this file", page$text, fixed = TRUE))
  expect_true(names_var(page$text, "dlup1"))
})

test_that("5e: ACE items part with dlup1 absent charts the other items and names dlup1", {
  s <- load_render(drop = "dlup1")
  page <- capture_page(render_scale(s, "ace", parts = "items"))
  expect_length(item_charts(page), length(ace_page_items()) - 1L)
  expect_true(grepl("not in this file", page$text, fixed = TRUE))
  expect_true(names_var(page$text, "dlup1"))
})

test_that("5e: ACE summary with only unscored bmo1 absent still gives totals", {
  s <- load_render(drop = "bmo1")
  page <- capture_page(render_scale(s, "ace", parts = "summary"))
  expect_true(grepl("ACE totals: ", page$text, fixed = TRUE))
  expect_length(mean_charts(page), 1L)
  expect_true(grepl("Percent in each category", page$text, fixed = TRUE))
})

test_that("5f: social_media_use with smpos1 absent charts the rest and names smpos1", {
  s <- load_render(drop = "smpos1")
  page <- capture_page(render_scale(s, "social_media_use"))
  expect_length(item_charts(page), 11L)
  expect_true(grepl("not in this file", page$text, fixed = TRUE))
  expect_true(names_var(page$text, "smpos1"))
})

test_that("5g: smadd with all nine items absent keeps its current text", {
  s <- load_render()
  page <- capture_page(render_scale(s, "smadd"))
  expect_true(grepl("## What the scale measures", page$text, fixed = TRUE))
  expect_true(grepl("These nine questions are not in this cleaned file.", page$text, fixed = TRUE))
  expect_true(grepl("## How the score is calculated", page$text, fixed = TRUE))
  expect_length(page$plots, 0L)
})

test_that("5g: attention with all items absent renders with no score and no charts", {
  s <- load_render(drop = attention_items())
  page <- capture_page(render_scale(s, "attention"))
  expect_false(grepl("have a score", page$text, fixed = TRUE))
  expect_length(page$plots, 0L)
  expect_true(grepl("not in this file", page$text, fixed = TRUE))
  for (v in attention_items()) expect_true(names_var(page$text, v), info = v)
})

test_that("5a: render_scale still stops for an unknown scale id", {
  s <- load_render()
  expect_error(capture_page(render_scale(s, "no_such_scale")), "no_such_scale")
})

test_that("5h: attention with every item renders as before", {
  s <- load_render()
  page <- capture_page(render_scale(s, "attention"))
  expect_true(grepl("Sum scores: 4 of 4 have a score (4 from every item, 0 prorated, 0 with no score",
                    page$text, fixed = TRUE))
  expect_length(mean_charts(page), 1L)
  expect_length(item_charts(page), 6L)
  expect_false(grepl("not in this file", page$text, fixed = TRUE))
})

test_that("5h: functioning with every item scores all three domains", {
  s <- load_render()
  page <- capture_page(render_scale(s, "functioning"))
  for (d in c("Quality of relationships", "Social participation", "School participation and achievement")) {
    expect_true(grepl(paste0(d, ": 4 of 4 have a score"), page$text, fixed = TRUE), info = d)
  }
  expect_length(mean_charts(page), 1L)
  expect_length(item_charts(page), 12L)
})

test_that("5h: ACE with every item renders totals, table and item charts", {
  s <- load_render()
  page <- capture_page(render_scale(s, "ace"))
  expect_true(grepl("ACE totals: ", page$text, fixed = TRUE))
  expect_true(grepl("Percent in each category", page$text, fixed = TRUE))
  expect_length(mean_charts(page), 1L)
  expect_length(item_charts(page), length(ace_page_items()))
  expect_false(grepl("not in this file", page$text, fixed = TRUE))
})

test_that("5i: score_ace and substantive_matrix keep their errors for absent columns", {
  s <- load_render(drop = "dlup1")
  expect_error(substantive_matrix(s, "dlup1"))
  codes <- as.data.frame(substantive_matrix(s, setdiff(ace_scored_items(), "dlup1")))
  expect_error(score_ace(codes))
})

# ---- 6. published copies -----------------------------------------------------

test_that("6a: report/R files are byte-identical to the published copies", {
  for (f in c("load_survey.R", "sections.R", "scale_page.R", "plots.R", "scales.R", "scores.R")) {
    a <- readBin(file.path(report_dir, "R", f), "raw", file.size(file.path(report_dir, "R", f)))
    pub <- file.path(repo_root, "docs", "describe", "vfs", "report", "R", f)
    b <- readBin(pub, "raw", file.size(pub))
    expect_identical(a, b, info = f)
  }
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
