#!/usr/bin/env Rscript
# Recode the plain-label EUSurvey content export using the codebook CSVs.
# Produces a haven::labelled data frame (numeric codes + value / variable labels).
#
# Column names in the data frame are the short analysis names from the codebook
# (≤8 letter stem + item number). orig_variable is the EUSurvey export id.
#
# Reserved codes from the codebook (kept as labelled values, not system NA):
#   997  not applicable (only when that option is explicitly chosen)
#   998  don't know
#   999  prefer not to answer
# Blank / skipped cells remain NA. "Unsure" is a substantive category, not 998.

suppressPackageStartupMessages({
  library(readxl)
  library(readr)
  library(haven)
})

script_root <- local({
  args <- commandArgs(trailingOnly = FALSE)
  file_arg <- grep("^--file=", args, value = TRUE)
  if (length(file_arg)) {
    dirname(normalizePath(sub("^--file=", "", file_arg)))
  } else {
    getwd()
  }
})

content_path <- file.path(
  script_root, "Content_Export_MENTORMasterGER1_Test-GER-1.xlsx"
)
id_path <- file.path(script_root, "MENTORMaster_TEST_GER_2.xlsx")
opt_path <- file.path(script_root, "output", "codebook_options.csv")
var_path <- file.path(script_root, "output", "codebook_variables.csv")
out_path <- file.path(script_root, "output", "mentor_labelled.rds")
sav_path <- file.path(script_root, "output", "mentor_labelled.sav")
dta_path <- file.path(script_root, "output", "mentor_labelled.dta")

TITLE_COLS <- "ID426"
DROP_COLS <- TITLE_COLS

trim_chr <- function(x) {
  x <- as.character(x)
  x[is.na(x)] <- ""
  gsub("^\\s+|\\s+$", "", x)
}

parse_var_id <- function(header) {
  header <- trim_chr(header)
  m <- regexec("\\(([^)]+)\\)\\s*$", header)
  hit <- regmatches(header, m)
  vapply(hit, function(z) if (length(z) >= 2) z[2] else NA_character_, character(1))
}

variable_label <- function(stem, item) {
  stem <- trim_chr(stem)
  item <- trim_chr(item)
  if (nzchar(item) && nzchar(stem)) {
    paste0(stem, ": ", item)
  } else if (nzchar(item)) {
    item
  } else {
    stem
  }
}

looks_numeric <- function(x) {
  grepl("^-?[0-9]+([.][0-9]+)?$", x)
}

looks_concatenated <- function(x, labels) {
  if (!nzchar(x)) return(FALSE)
  if (tolower(x) %in% tolower(labels)) return(FALSE)
  grepl("[,;|/]", x)
}

message("Reading exports and codebook...")
raw <- read_xlsx(content_path, skip = 3, col_types = "text", .name_repair = "minimal")
id_hdr <- read_xlsx(id_path, skip = 3, n_max = 0, .name_repair = "minimal")
var_ids <- parse_var_id(names(id_hdr))

if (length(var_ids) != ncol(raw)) {
  stop(
    "Column count mismatch: content export has ", ncol(raw),
    " columns, ID export has ", length(var_ids), "."
  )
}
if (anyNA(var_ids)) {
  stop("Could not parse variable IDs from: ", paste(names(id_hdr)[is.na(var_ids)], collapse = "; "))
}

names(raw) <- var_ids
keep <- !names(raw) %in% DROP_COLS
raw <- raw[keep]

opts <- read_csv(opt_path, show_col_types = FALSE, locale = locale(encoding = "UTF-8"))
vars <- read_csv(var_path, show_col_types = FALSE, locale = locale(encoding = "UTF-8"))

opts$option_label <- trim_chr(opts$option_label)
opts$option_alias <- trim_chr(opts$option_alias)
opts$value <- suppressWarnings(as.numeric(opts$value))

vars$question_stem <- trim_chr(vars$question_stem)
vars$item_text <- trim_chr(vars$item_text)
if (!"orig_variable" %in% names(vars)) {
  vars$orig_variable <- vars$variable
}
vars$orig_variable <- trim_chr(vars$orig_variable)
if ("orig_variable" %in% names(opts)) {
  opts$orig_variable <- trim_chr(opts$orig_variable)
}

unmatched <- list()
mentor <- raw

lookup_meta <- function(orig_nm) {
  hit <- vars[vars$orig_variable == orig_nm, , drop = FALSE]
  if (nrow(hit) == 0) {
    hit <- vars[vars$variable == orig_nm, , drop = FALSE]
  }
  hit
}

for (nm in names(raw)) {
  meta <- lookup_meta(nm)
  if (nrow(meta) == 0) {
    unmatched[[length(unmatched) + 1]] <- data.frame(
      variable = nm, row = NA_integer_, raw = "(no codebook row)", stringsAsFactors = FALSE
    )
    next
  }
  new_nm <- meta$variable[[1]]
  scale <- meta$scale[[1]]
  qtype <- meta$question_type[[1]]
  multiple <- isTRUE(meta$multiple[[1]]) || identical(as.character(meta$multiple[[1]]), "true")
  vlab <- variable_label(meta$question_stem[[1]], meta$item_text[[1]])
  src <- trim_chr(raw[[nm]])
  src[src %in% c("", "NA", "NaN")] <- ""

  if (identical(scale, "text") || identical(qtype, "text")) {
    mentor[[nm]] <- ifelse(src == "", NA_character_, src)
    attr(mentor[[nm]], "label") <- vlab
    next
  }

  o <- opts[opts$variable == new_nm, , drop = FALSE]
  if (nrow(o) == 0 && "orig_variable" %in% names(opts)) {
    o <- opts[opts$orig_variable == nm, , drop = FALSE]
  }
  canonical <- o[o$option_alias == "", , drop = FALSE]
  if (nrow(canonical) == 0) canonical <- o[!duplicated(o$value), , drop = FALSE]
  canonical <- canonical[!is.na(canonical$value), , drop = FALSE]

  lookup_lab <- o$option_label
  lookup_val <- o$value
  keep_lu <- nzchar(lookup_lab) & !is.na(lookup_val)
  lookup_lab <- lookup_lab[keep_lu]
  lookup_val <- lookup_val[keep_lu]
  names(lookup_val) <- tolower(lookup_lab)

  codes <- rep(NA_real_, length(src))
  for (i in seq_along(src)) {
    val <- src[[i]]
    if (!nzchar(val)) next
    if (multiple && looks_concatenated(val, lookup_lab)) {
      unmatched[[length(unmatched) + 1]] <- data.frame(
        variable = new_nm, row = i, raw = val, stringsAsFactors = FALSE
      )
      next
    }
    key <- tolower(val)
    if (key %in% names(lookup_val)) {
      codes[[i]] <- unname(lookup_val[[key]])
      next
    }
    if (identical(scale, "interval") && looks_numeric(val)) {
      codes[[i]] <- as.numeric(val)
      next
    }
    unmatched[[length(unmatched) + 1]] <- data.frame(
      variable = new_nm, row = i, raw = val, stringsAsFactors = FALSE
    )
  }

  lab_vec <- canonical$value
  names(lab_vec) <- canonical$option_label
  lab_vec <- lab_vec[!duplicated(lab_vec)]
  mentor[[nm]] <- labelled(codes, labels = lab_vec, label = vlab)
}

new_names <- vapply(names(mentor), function(nm) {
  hit <- vars$variable[vars$orig_variable == nm]
  if (length(hit)) as.character(hit[[1]]) else nm
}, character(1))
if (anyDuplicated(new_names)) {
  stop("Duplicate analysis names after recode: ", paste(unique(new_names[duplicated(new_names)]), collapse = ", "))
}
names(mentor) <- new_names

n_unmatched <- if (length(unmatched)) nrow(do.call(rbind, unmatched)) else 0L
unmatched_df <- if (length(unmatched)) do.call(rbind, unmatched) else data.frame(
  variable = character(), row = integer(), raw = character(), stringsAsFactors = FALSE
)

dir.create(file.path(script_root, "output"), showWarnings = FALSE)
saveRDS(mentor, out_path)
write_sav(mentor, sav_path)
write_dta(mentor, dta_path)

cat("\n=== recode report ===\n")
cat("rows:              ", nrow(mentor), "\n")
cat("columns:           ", ncol(mentor), "\n")
cat("labelled columns:  ", sum(vapply(mentor, is.labelled, logical(1))), "\n")
cat("character columns: ", sum(vapply(mentor, is.character, logical(1))), "\n")
cat("unmatched cells:   ", n_unmatched, "\n")
cat("first columns:     ", paste(head(names(mentor), 8), collapse = ", "), "\n")
if (n_unmatched > 0) {
  cat("\nUnmatched values:\n")
  print(unmatched_df, row.names = FALSE)
}

assign("mentor", mentor, envir = .GlobalEnv)
assign("mentor_unmatched", unmatched_df, envir = .GlobalEnv)
message("Wrote ", out_path)
message("Wrote ", sav_path)
message("Wrote ", dta_path)
