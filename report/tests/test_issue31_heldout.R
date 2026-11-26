# Issue #31 held-out cases: the same contract as
# report/tests/test_issue31_unusable_sheet.R with other inputs (a .csv of
# double quotes or whitespace only; a sheet with bage1 but no gender1).
# Synthetic fixtures only. Run from the repo root:
# Rscript report/tests/test_issue31_heldout.R

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

META <- load_dictionary(file.path(repo_root, "data", "master_dictionary.json"), extra = paste0("smadd", 1:9))
PARTICIPATION <- "Do you wish to participate in MENTOR?"
BUTTON <- "Export cleaned data (core questions)"

header_of <- function(v) gsub("[country]", "Cyprus", META[[v]]$full, fixed = TRUE)

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

.reporter <- ListReporter$new()
.reporter$start_reporter()
.reporter$start_file("test_issue31_heldout")
invisible(set_reporter(.reporter))

test_that("a .csv of double quotes and whitespace only is reported as empty", {
  for (text in c("\"\",\"\"\n\"\",\"\"\n", "  \t \n   \n\t\n")) {
    msg <- load_error(write_raw_csv(text))
    expect_false(is.na(msg), info = "load_survey must stop")
    if (is.na(msg)) next
    expect_true(grepl("empty", msg, fixed = TRUE), info = msg)
    expect_true(grepl(BUTTON, msg, fixed = TRUE), info = msg)
    expect_true(grepl("auditor", msg, fixed = TRUE), info = msg)
    expect_false(grepl("no lines available in input", msg, fixed = TRUE), info = msg)
  }
})

test_that("bage1 without gender1: names gender1 and says 1 of 4 (.xlsx and .csv)", {
  headers <- c("alpha", header_of("bage1"), PARTICIPATION, "beta")
  df <- data.frame(c1 = c("1", "2", "3"), c2 = c("4", "", "9"), c3 = c("Yes", "Yes", "No"),
                   c4 = c("x", "y", "z"), stringsAsFactors = FALSE)
  names(df) <- headers
  csv <- tempfile(fileext = ".csv")
  utils::write.csv(df, csv, row.names = FALSE, fileEncoding = "UTF-8")
  xlsx <- tempfile(fileext = ".xlsx")
  writexl::write_xlsx(list(Cleaned = df), xlsx)
  msgs <- c(load_error(xlsx), load_error(csv))
  for (msg in msgs) {
    expect_false(is.na(msg), info = "load_survey must stop")
    if (is.na(msg)) next
    first <- "The file has no gender1 column, which the report needs."
    count <- "1 of 4 column headers match the core English headers"
    at_first <- regexpr(first, msg, fixed = TRUE)
    at_count <- regexpr(count, msg, fixed = TRUE)
    expect_true(at_first > 0, info = msg)
    expect_true(at_count > at_first && at_first > 0, info = msg)
    expect_true(grepl(BUTTON, msg, fixed = TRUE), info = msg)
    expect_true(grepl("auditor", msg, fixed = TRUE), info = msg)
  }
  expect_identical(msgs[[1]], msgs[[2]])
})

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
