# Issue #31: load_survey() explains an empty sheet, or a sheet whose headers
# do not match the core English headers, and points to the auditor's
# "Export cleaned data (core questions)" button. Message wording comes from
# the issue #31 contract. Synthetic fixtures only; no real survey file is read.
# Run from the repo root: Rscript report/tests/test_issue31_unusable_sheet.R

args <- commandArgs(trailingOnly = FALSE)
file_arg <- grep("^--file=", args, value = TRUE)
script_dir <- if (length(file_arg)) {
  dirname(normalizePath(sub("^--file=", "", file_arg)))
} else {
  file.path(getwd(), "report", "tests")
}
report_dir <- normalizePath(file.path(script_dir, ".."))
repo_root <- normalizePath(file.path(report_dir, ".."))

suppressPackageStartupMessages(library(testthat))
source(file.path(report_dir, "R", "load_survey.R"))

# ---- fixture helpers ------------------------------------------------------

META <- load_dictionary(file.path(repo_root, "data", "master_dictionary.json"), extra = paste0("smadd", 1:9))
PARTICIPATION <- "Do you wish to participate in MENTOR?"
BUTTON <- "Export cleaned data (core questions)"

header_of <- function(v) gsub("[country]", "Norway", META[[v]]$full, fixed = TRUE)

# A data frame with the given headers and two respondent rows.
sheet_df <- function(headers, values = NULL) {
  if (is.null(values)) values <- lapply(seq_along(headers), function(i) c("a", "b"))
  df <- as.data.frame(values, stringsAsFactors = FALSE, col.names = paste0("c", seq_along(headers)))
  names(df) <- headers
  df
}

write_csv_fixture <- function(df) {
  path <- tempfile(fileext = ".csv")
  utils::write.csv(df, path, row.names = FALSE, fileEncoding = "UTF-8")
  path
}

write_xlsx_fixture <- function(df) {
  path <- tempfile(fileext = ".xlsx")
  writexl::write_xlsx(list(Cleaned = df), path)
  path
}

write_raw_csv <- function(text) {
  path <- tempfile(fileext = ".csv")
  con <- file(path, open = "wb")
  writeBin(charToRaw(text), con)
  close(con)
  path
}

load_error <- function(path) {
  err <- tryCatch({
    load_survey(path, report_dir = report_dir)
    NULL
  }, error = function(e) e)
  if (is.null(err)) NA_character_ else conditionMessage(err)
}

expect_points_to_auditor <- function(msg) {
  expect_true(grepl(BUTTON, msg, fixed = TRUE), info = msg)
  expect_true(grepl("auditor", msg, fixed = TRUE), info = msg)
}

expect_empty_error <- function(path) {
  msg <- load_error(path)
  expect_false(is.na(msg), info = "load_survey must stop on an empty sheet")
  if (is.na(msg)) return(invisible())
  expect_true(grepl("empty", msg, fixed = TRUE), info = msg)
  expect_points_to_auditor(msg)
  expect_false(grepl("no lines available in input", msg, fixed = TRUE), info = msg)
}

expect_mismatch_error <- function(path, variable, k, n) {
  msg <- load_error(path)
  expect_false(is.na(msg), info = "load_survey must stop on a sheet without the needed columns")
  if (is.na(msg)) return(invisible())
  first <- paste0("The file has no ", variable, " column, which the report needs.")
  count <- paste0(k, " of ", n, " column headers match the core English headers")
  at_first <- regexpr(first, msg, fixed = TRUE)
  at_count <- regexpr(count, msg, fixed = TRUE)
  expect_true(at_first > 0, info = msg)
  expect_true(at_count > 0, info = msg)
  expect_true(at_first > 0 && at_count > at_first, info = paste("count follows the first sentence:", msg))
  expect_points_to_auditor(msg)
  invisible(msg)
}

.reporter <- ListReporter$new()
.reporter$start_reporter()
.reporter$start_file("test_issue31_unusable_sheet")
invisible(set_reporter(.reporter))

# ---- empty sheets -----------------------------------------------------------

test_that("an .xlsx whose Cleaned sheet has no columns stops with an empty-sheet message", {
  path <- write_xlsx_fixture(data.frame())
  expect_identical(readxl::excel_sheets(path), "Cleaned")
  expect_empty_error(path)
})

test_that("a zero-byte .csv stops with an empty-sheet message, not the read.csv error", {
  path <- write_raw_csv("")
  expect_identical(file.size(path), 0)
  expect_empty_error(path)
})

test_that("a .csv of blank lines stops with an empty-sheet message", {
  expect_empty_error(write_raw_csv("\n\n\n"))
})

test_that("a .csv of commas only stops with an empty-sheet message", {
  expect_empty_error(write_raw_csv(",,,\n,,,\n"))
})

# ---- headers that do not match -----------------------------------------------

test_that("two unrelated headers: no gender1, 0 of 2 headers match (.csv)", {
  expect_mismatch_error(write_csv_fixture(sheet_df(c("foo", "bar"))), "gender1", 0, 2)
})

test_that("German headers only: no gender1, 0 of 3 headers match (.xlsx)", {
  headers <- c(
    "Welchem Geschlecht fühlst du dich zugehörig?",
    "In welchem Monat bist du geboren?",
    "Wie alt warst du ungefähr, als du nach Deutschland gekommen bist?"
  )
  expect_mismatch_error(write_xlsx_fixture(sheet_df(headers)), "gender1", 0, 3)
})

test_that("gender1, another core header and an unrelated header: no bage1, 2 of 3", {
  headers <- c(header_of("gender1"), header_of("byear1"), "foo")
  df <- sheet_df(headers, list(c("Boy", "Girl"), c("2010", "2011"), c("x", "y")))
  expect_mismatch_error(write_csv_fixture(df), "bage1", 2, 3)
  expect_mismatch_error(write_xlsx_fixture(df), "bage1", 2, 3)
})

test_that("the participation question is not counted as a match: 1 of 3", {
  headers <- c(PARTICIPATION, header_of("gender1"), "foo")
  df <- sheet_df(headers, list(c("Yes", "Yes"), c("Boy", "Girl"), c("x", "y")))
  expect_mismatch_error(write_csv_fixture(df), "bage1", 1, 3)
})

test_that("the mismatch message is the same for .xlsx and .csv", {
  df <- sheet_df(c("foo", "bar"))
  from_csv <- load_error(write_csv_fixture(df))
  from_xlsx <- load_error(write_xlsx_fixture(df))
  expect_false(is.na(from_csv))
  expect_identical(from_xlsx, from_csv)
})

# ---- unchanged ---------------------------------------------------------------

test_that("a sheet with gender1 and bage1 still loads (.csv and .xlsx)", {
  headers <- c(header_of("gender1"), header_of("bage1"), "foo")
  df <- sheet_df(headers, list(c("Boy", "Girl"), c("5", ""), c("x", "y")))
  for (path in c(write_csv_fixture(df), write_xlsx_fixture(df))) {
    s <- load_survey(path, report_dir = report_dir)
    expect_identical(s$n, 2L)
    expect_identical(s$country, "Norway")
    expect_identical(s$ignored_columns, "foo")
  }
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
