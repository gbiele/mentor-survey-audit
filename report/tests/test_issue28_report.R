# Issue #28, section 7: the Survey results page reads the new canonical
# categories (College or university degree, Vocational training, birth year
# 2012, For getting information) and ranks parental education by the new rules.
# Expected values come from the issue #28 contract (Part A). Synthetic CSV
# fixtures only; no real survey file is read.
# Run from the repo root: Rscript report/tests/test_issue28_report.R

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
for (f in c("load_survey.R", "scores.R", "plots.R", "scales.R", "scale_page.R", "sections.R", "overview.R")) {
  source(file.path(report_dir, "R", f))
}

META <- load_dictionary(file.path(repo_root, "data", "master_dictionary.json"), extra = paste0("smadd", 1:9))

LESS <- "Less than high school"
HIGH <- "High school diploma or equivalent"
SOME <- "Come college, no degree"
BACH <- "Bachelor's degree"
MAST <- "Master's degree or more"
COLL <- "College or university degree"
VOC <- "Vocational training"

# A cleaned workbook as CSV: one column per named variable, canonical headers
# with the survey country filled in. gender1 and bage1 are always present.
make_csv <- function(values, country = "Hungary") {
  n <- length(values[[1]])
  if (is.null(values$gender1)) values$gender1 <- rep(c("Boy", "Girl"), length.out = n)
  if (is.null(values$bage1)) values$bage1 <- rep("", n)
  cols <- lapply(values, function(x) as.character(x))
  df <- as.data.frame(cols, stringsAsFactors = FALSE, col.names = paste0("c", seq_along(cols)))
  names(df) <- vapply(names(values), function(v) gsub("[country]", country, META[[v]]$full, fixed = TRUE), character(1))
  path <- tempfile(fileext = ".csv")
  utils::write.csv(df, path, row.names = FALSE, fileEncoding = "UTF-8", na = "")
  path
}

load_fixture <- function(values, country = "Hungary") {
  load_survey(make_csv(values, country), report_dir = report_dir)
}

row_n <- function(df, response) {
  hit <- df$n[df$response == response]
  if (length(hit) == 0) NA_integer_ else hit[[1]]
}

hpe <- function(survey) {
  if (!exists("highest_parental_education", mode = "function")) {
    stop("highest_parental_education(survey) is not defined in report/R/")
  }
  highest_parental_education(survey)
}

.reporter <- ListReporter$new()
.reporter$start_reporter()
.reporter$start_file("test_issue28_report")
invisible(set_reporter(.reporter))

new_values <- function() {
  list(
    edumom1 = c(COLL, VOC, LESS, HIGH),
    edudad1 = c(SOME, HIGH, VOC, ""),
    grade1 = c("Vocational training", "9th", "10th", ""),
    byear1 = c("2012", "2010", "2011", "2009"),
    bmonth1 = c("March", "March", "March", "March"),
    aiuse1 = c("For getting information", "For schoolwork", "", "For getting information")
  )
}

test_that("new labels are answered, not unmatched", {
  s <- load_fixture(new_values())
  expect_identical(s$status$edumom1[1:2], c("answered", "answered"))
  expect_identical(s$status$edudad1[3], "answered")
  expect_identical(s$status$grade1[1], "answered")
  expect_identical(s$status$byear1[1], "answered")
  expect_identical(s$status$aiuse1[c(1, 4)], c("answered", "answered"))
})

test_that("distribution tables show the new categories", {
  s <- load_fixture(new_values())
  expect_identical(row_n(distribution_table(s, "edumom1"), COLL), 1L)
  expect_identical(row_n(distribution_table(s, "edumom1"), VOC), 1L)
  expect_identical(row_n(distribution_table(s, "edudad1"), VOC), 1L)
  expect_identical(row_n(distribution_table(s, "grade1"), VOC), 1L)
  expect_identical(row_n(distribution_table(s, "byear1"), "2012"), 1L)
  expect_identical(row_n(distribution_table(s, "aiuse1"), "For getting information"), 2L)
  # The new labels are categories, not extra rows of unmatched text: each appears once.
  expect_identical(sum(distribution_table(s, "edumom1")$response == COLL), 1L)
})

test_that("birth year 2012 gives an age", {
  s <- load_fixture(new_values())
  # Born March 2012, reference date July 2026: completed age 14.
  expect_identical(s$age[[1]], 14L)
  expect_false(is.na(s$age[[1]]))
})

test_that("new education and grade categories appear only when someone has them", {
  s <- load_fixture(list(
    edumom1 = c(LESS, HIGH, LESS),
    edudad1 = c(HIGH, BACH, LESS),
    grade1 = c("9th", "10th", "9th")
  ), country = "Norway")
  for (v in c("edumom1", "edudad1")) {
    tab <- distribution_table(s, v)
    expect_false(COLL %in% tab$response, info = v)
    expect_false(VOC %in% tab$response, info = v)
    expect_identical(row_n(tab, MAST), 0L, info = paste(v, "keeps the empty Master's bar"))
    expect_identical(row_n(tab, SOME), 0L, info = paste(v, "keeps the empty some-college bar"))
  }
  g <- distribution_table(s, "grade1")
  expect_false(VOC %in% g$response)
  expect_identical(row_n(g, "13th"), 0L)
})

test_that("highest parental education: contract cases", {
  s <- load_fixture(list(
    edumom1 = c(COLL, VOC, VOC, VOC, BACH, "Don't know", "Prefer not to answer", "Something else"),
    edudad1 = c(SOME, HIGH, "", VOC, MAST, LESS, HIGH, "")
  ))
  res <- hpe(s)
  expect_identical(res$shown, c(COLL, HIGH, NA, NA, MAST, LESS, HIGH, NA))
  expect_false(VOC %in% res$levels)
  expect_true(COLL %in% res$levels)
  pos <- function(x) match(x, res$levels)
  expect_true(all(!is.na(pos(c(LESS, HIGH, SOME, COLL)))))
  expect_true(pos(LESS) < pos(HIGH) && pos(HIGH) < pos(SOME) && pos(SOME) < pos(COLL))
})

test_that("highest parental education: degree levels in order, no College level unless reached", {
  s <- load_fixture(list(
    edumom1 = c(BACH, VOC, SOME, ""),
    edudad1 = c(HIGH, LESS, MAST, "")
  ), country = "Norway")
  res <- hpe(s)
  expect_identical(res$shown, c(BACH, LESS, MAST, NA))
  expect_false(COLL %in% res$levels)
  expect_false(VOC %in% res$levels)
  expect_identical(res$levels, c(LESS, HIGH, SOME, BACH, MAST))
})

test_that("overview figure uses highest_parental_education and explains vocational training", {
  body_text <- paste(deparse(render_overview_ses), collapse = "\n")
  expect_true(grepl("highest_parental_education(", body_text, fixed = TRUE))
  expect_true(grepl("vocational training", body_text, ignore.case = TRUE))
})

test_that("byear1 lists every year 2000-2012 in year order, with empty years, then Missing", {
  # Counts deliberately disagree with year order: 2012 most, 2005 next, 2003 once.
  s <- load_fixture(list(
    byear1 = c("2012", "2012", "2012", "2005", "2005", "2003", "")
  ))
  tab <- distribution_table(s, "byear1")
  # Contract: all canonical years 2000..2012 in year order, then Missing.
  expect_identical(tab$response, c(as.character(2000:2012), "Missing"))
  expect_identical(row_n(tab, "2000"), 0L)
  expect_identical(row_n(tab, "2011"), 0L)
  expect_identical(row_n(tab, "2012"), 3L)
  expect_identical(row_n(tab, "2005"), 2L)
  expect_identical(row_n(tab, "2003"), 1L)
  expect_identical(row_n(tab, "Missing"), 1L)
})

test_that("bplace1 (long list) still drops empty countries and orders by count", {
  s <- load_fixture(list(
    bplace1 = c("Albania", "Croatia", "Croatia", "Croatia", "Belgium", "Belgium")
  ))
  tab <- distribution_table(s, "bplace1")
  expect_identical(tab$response, c("Croatia", "Belgium", "Albania"))
  expect_identical(tab$n, c(3L, 2L, 1L))
})

# ---- summary ------------------------------------------------------------------

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
