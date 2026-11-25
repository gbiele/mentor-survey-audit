# Issue #28 held-out cases: same contract as test_issue28_report.R (section 7),
# other inputs. Synthetic CSV fixtures only; no real survey file is read.
# Run from the repo root: Rscript report/tests/test_issue28_heldout.R

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
.reporter$start_file("test_issue28_heldout")
invisible(set_reporter(.reporter))

test_that("held-out: highest parental education with other pairs", {
  s <- load_fixture(list(
    edumom1 = c(SOME, HIGH, VOC, "", VOC, LESS),
    edudad1 = c(VOC, COLL, MAST, "", "Don't know", VOC)
  ))
  res <- hpe(s)
  expect_identical(res$shown, c(SOME, COLL, MAST, NA, NA, LESS))
  expect_true(COLL %in% res$levels)
  expect_false(VOC %in% res$levels)
  expect_true(match(SOME, res$levels) < match(COLL, res$levels))
  expect_true(match(HIGH, res$levels) < match(COLL, res$levels))
})

test_that("held-out: a new category shows per variable only where it occurs", {
  s <- load_fixture(list(
    edumom1 = c(HIGH, LESS, SOME),
    edudad1 = c(COLL, COLL, HIGH),
    grade1 = c("Vocational training", "Vocational training", "12th")
  ))
  expect_false(COLL %in% distribution_table(s, "edumom1")$response)
  expect_identical(row_n(distribution_table(s, "edudad1"), COLL), 2L)
  expect_identical(s$status$edudad1[1:2], c("answered", "answered"))
  g <- distribution_table(s, "grade1")
  expect_identical(row_n(g, VOC), 2L)
  expect_identical(s$status$grade1[1:2], c("answered", "answered"))
  expect_identical(row_n(g, "8th"), 0L)
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
