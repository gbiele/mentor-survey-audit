# Hand-built score checks. Does not read the survey workbook.
args <- commandArgs(trailingOnly = FALSE)
file_arg <- grep("^--file=", args, value = TRUE)
script_dir <- if (length(file_arg)) {
  dirname(normalizePath(sub("^--file=", "", file_arg)))
} else {
  getwd()
}
source(file.path(script_dir, "..", "R", "scores.R"))

expect_equal <- function(actual, expected, label) {
  if (length(actual) != length(expected) || any(is.na(actual) != is.na(expected)) ||
      any(actual != expected, na.rm = TRUE)) {
    stop(
      label, "\n  actual: ", paste(actual, collapse = ", "),
      "\n  expected: ", paste(expected, collapse = ", ")
    )
  }
}

expect_equal(reverse_codes(c(0, 4, 2, NA), 0, 4), c(4, 0, 2, NA), "reverse 0-4 item")
expect_equal(round_half_up(c(7.2, 7.5, 7, NA)), c(7L, 8L, 7L, NA), "round half up")

# KIDSCREEN-10 has 10 items: 8 of 10 is exactly 80% and is prorated; 7 of 10 is missing.
ks_ok <- likert_scores(matrix(c(rep(1, 8), NA, NA), nrow = 1))
expect_equal(ks_ok$score, 10L, "ten-item prorated 8 of 10")
expect_equal(ks_ok$status, "prorated", "ten-item prorated status")
ks_low <- likert_scores(matrix(c(rep(1, 7), NA, NA, NA), nrow = 1))
expect_equal(ks_low$score, NA_integer_, "ten-item below 80%")
expect_equal(ks_low$status, "missing", "ten-item missing status")

# Nine-item social media sum: 8 of 9 is 89% and is prorated; 7 of 9 is 78% and is missing.
sm_ok <- likert_scores(matrix(c(rep(1, 8), NA), nrow = 1))
expect_equal(sm_ok$score, 9L, "nine-item prorated 8 of 9")
expect_equal(sm_ok$status, "prorated", "nine-item prorated status")
sm_low <- likert_scores(matrix(c(rep(1, 7), NA, NA), nrow = 1))
expect_equal(sm_low$score, NA_integer_, "nine-item below 80%")
expect_equal(sm_low$status, "missing", "nine-item missing status")

complete <- likert_scores(matrix(c(0, 1, 2, 0, 1, 2), nrow = 1))
expect_equal(complete$score, 6L, "complete attention sum")
expect_equal(complete$status, "complete", "complete status")

# Five of six answered: mean 6/5 = 1.2, times 6 = 7.2, rounds to 7.
prorated <- likert_scores(matrix(c(0, 1, 2, 1, 2, NA), nrow = 1))
expect_equal(prorated$score, 7L, "prorated attention sum")
expect_equal(prorated$status, "prorated", "prorated status")

two_missing <- likert_scores(matrix(c(0, 1, 2, 1, NA, NA), nrow = 1))
expect_equal(two_missing$score, NA_integer_, "two missing attention items")
expect_equal(two_missing$status, "missing", "two missing status")

# Twelve-item scale: 10 of 12 is 83% and is prorated; 9 of 12 is 75% and is missing.
fun_ok <- matrix(c(rep(0, 9), 1, NA, NA), nrow = 1)
fun_score <- likert_scores(fun_ok)
expect_equal(fun_score$score, 1L, "twelve-item prorated 10 of 12")
expect_equal(fun_score$status, "prorated", "twelve-item prorated status")

fun_low <- matrix(c(rep(1, 9), NA, NA, NA), nrow = 1)
fun_missing <- likert_scores(fun_low)
expect_equal(fun_missing$score, NA_integer_, "twelve-item below 80%")
expect_equal(fun_missing$status, "missing", "twelve-item missing status")

# A functioning domain has four items. Three of four is 75%, so the sum is missing.
domain_complete <- likert_scores(matrix(c(0, 1, 2, 1), nrow = 1))
expect_equal(domain_complete$score, 4L, "four-item domain sum")
expect_equal(domain_complete$status, "complete", "four-item domain status")

domain_gap <- likert_scores(matrix(c(0, 1, 2, NA), nrow = 1))
expect_equal(domain_gap$score, NA_integer_, "three of four domain items")
expect_equal(domain_gap$status, "missing", "three of four domain status")

# Spanked once counts in the binary ACE score and not in the frequency score.
spank <- as.data.frame(as.list(ace_no_exposure()), stringsAsFactors = FALSE)
spank$tnqactmh3 <- 1
spanked <- score_ace(spank)
expect_equal(spanked$ace_binary, 1L, "spanked once binary")
expect_equal(spanked$ace_frequency, 0L, "spanked once frequency")
expect_equal(spanked$bin_physical_abuse, 1L, "spanked once physical category")
expect_equal(spanked$frq_physical_abuse, 0L, "spanked once frequency category")

# A blank bullying item leaves that category, and both totals, missing.
blank_bully <- spank
blank_bully$pvtnqabb1 <- NA
blanked <- score_ace(blank_bully)
expect_equal(blanked$bin_bullying, NA_integer_, "blank bullying category")
expect_equal(blanked$ace_binary, NA_integer_, "blank bullying drops binary total")
expect_equal(blanked$ace_frequency, NA_integer_, "blank bullying drops frequency total")

message("score checks passed")
