# Issue #15: survey_country_from_header() must not return the [country]
# placeholder; load_survey() stops on a file exported without a country.
# Synthetic CSV fixtures only; no real survey file is read.
# Run from the repo root: Rscript report/tests/test_issue15_country.R

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

# Two-column CSV: gender1 and bage1, bage1 header with the given country text.
make_csv <- function(country_text) {
  df <- data.frame(
    a = c("Boy", "Girl", "Boy"),
    b = c("", "5", ""),
    stringsAsFactors = FALSE
  )
  names(df) <- c(META$gender1$full, gsub("[country]", country_text, META$bage1$full, fixed = TRUE))
  path <- tempfile(fileext = ".csv")
  utils::write.csv(df, path, row.names = FALSE, fileEncoding = "UTF-8")
  path
}

# The contract wording: the message contains [country], says the survey
# country is missing, and says to export the file again from the auditor.
expect_placeholder_error <- function(expr) {
  err <- tryCatch({
    force(expr)
    NULL
  }, error = function(e) e)
  expect_false(is.null(err), info = "an error is raised instead of returning a value")
  if (is.null(err)) return(invisible())
  msg <- conditionMessage(err)
  expect_true(grepl("[country]", msg, fixed = TRUE), info = msg)
  expect_true(grepl("survey country", msg, ignore.case = TRUE), info = msg)
  expect_true(grepl("missing", msg, ignore.case = TRUE), info = msg)
  expect_true(grepl("export", msg, ignore.case = TRUE), info = msg)
  expect_true(grepl("auditor", msg, ignore.case = TRUE), info = msg)
}

.reporter <- ListReporter$new()
.reporter$start_reporter()
.reporter$start_file("test_issue15_country")
invisible(set_reporter(.reporter))

test_that("5a: a header naming the country returns the country", {
  expect_identical(
    survey_country_from_header("Approximately how old were you when you came/moved to Norway?"),
    "Norway"
  )
})

test_that("5b: a header with the [country] placeholder stops with a clear message", {
  h <- "Approximately how old were you when you came/moved to [country]?"
  res <- tryCatch(survey_country_from_header(h), error = function(e) NULL)
  expect_false(identical(res, "[country]"), info = "must not return the placeholder")
  expect_placeholder_error(survey_country_from_header(h))
})

test_that("5b: the placeholder is recognised in any case", {
  for (ph in c("[COUNTRY]", "[Country]")) {
    h <- paste0("Approximately how old were you when you came/moved to ", ph, "?")
    expect_placeholder_error(survey_country_from_header(h))
  }
})

test_that("5c: load_survey stops on a bage1 header that still contains [country]", {
  res <- tryCatch(load_survey(make_csv("[country]"), report_dir = report_dir), error = function(e) NULL)
  if (!is.null(res)) {
    expect_false(identical(res$country, "[country]"), info = "country must not be the placeholder")
  }
  expect_placeholder_error(load_survey(make_csv("[country]"), report_dir = report_dir))
})

test_that("5c: load_survey with a named country still loads", {
  s <- load_survey(make_csv("Cyprus"), report_dir = report_dir)
  expect_identical(s$country, "Cyprus")
  expect_identical(s$n, 3L)
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
