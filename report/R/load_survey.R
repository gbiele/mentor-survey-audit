# Read a cleaned MENTOR workbook and align its columns with the master dictionary.

squash_text <- function(x) {
  x <- tolower(trimws(as.character(x)))
  x[is.na(x)] <- ""
  x <- gsub("\u00a0", " ", x, fixed = TRUE)
  x <- gsub("\\[country\\]", " countrytoken ", x)
  x <- gsub("[^a-z0-9]+", " ", x)
  x <- gsub(" +", " ", x)
  trimws(x)
}

country_equal <- function(dict_key, header_key) {
  token <- "countrytoken"
  if (!grepl(token, dict_key, fixed = TRUE)) {
    return(identical(dict_key, header_key))
  }
  parts <- strsplit(dict_key, token, fixed = TRUE)[[1]]
  if (endsWith(dict_key, token)) parts <- c(parts, "")
  h <- header_key
  for (i in seq_along(parts)) {
    p <- trimws(parts[[i]])
    if (i == 1L) {
      if (!nzchar(p)) next
      if (!startsWith(h, p)) return(FALSE)
      h <- substring(h, nchar(p) + 1L)
      h <- sub("^\\s+", "", h)
    } else if (!nzchar(p)) {
      if (!nzchar(h)) return(FALSE)
      h <- ""
    } else {
      idx <- regexpr(p, h, fixed = TRUE)
      if (idx <= 1L) return(FALSE)
      gap <- substring(h, 1L, idx - 1L)
      if (!grepl("[a-z0-9]", gap)) return(FALSE)
      h <- substring(h, idx + nchar(p))
      h <- sub("^\\s+", "", h)
    }
  }
  !nzchar(h)
}

dictionary_path <- function(report_dir) {
  path <- file.path(report_dir, "..", "data", "master_dictionary.json")
  found <- tryCatch(normalizePath(path, mustWork = TRUE), error = function(e) NA_character_)
  if (!is.na(found)) return(found)
  if (file.exists(path)) return(path)
  stop("Dictionary not found: ", path)
}

load_dictionary <- function(path, extra = character()) {
  raw <- jsonlite::fromJSON(path, simplifyVector = FALSE)
  vars <- raw$variables
  # smadd1-9 are a Germany module. They are kept so a file that contains them
  # can be scored. This cleaned export does not include those columns.
  core <- Filter(function(v) {
    (isTRUE(v$is_core) && identical(v$source, "canonical_en")) || v$variable %in% extra
  }, vars)
  meta <- lapply(core, function(v) {
    stem <- v$question_stem %||% ""
    item <- v$item_text %||% ""
    full <- if (nzchar(item)) paste0(stem, ": ", item) else stem
    opts <- v$options %||% list()
    rows <- lapply(opts, function(o) {
      alias <- o$alias %||% ""
      if (nzchar(alias)) return(NULL)
      label <- o$label %||% ""
      if (!nzchar(label)) return(NULL)
      value <- o$value
      special <- isTRUE(o$is_special) || (!is.null(value) && value %in% c(997, 998, 999))
      data.frame(
        value = as.integer(value),
        label = label,
        key = squash_text(label),
        special = special,
        stringsAsFactors = FALSE
      )
    })
    rows <- rows[!vapply(rows, is.null, logical(1))]
    options <- if (length(rows)) do.call(rbind, rows) else {
      data.frame(value = integer(), label = character(), key = character(), special = logical())
    }
    options <- options[!duplicated(options$key), , drop = FALSE]
    options <- options[order(options$value), , drop = FALSE]
    conflict <- options$key[duplicated(options$key)]
    if (length(conflict)) stop("Duplicate option label for ", v$variable)
    list(
      variable = v$variable,
      section = v$section %||% "",
      stem = stem,
      item = item,
      full = full,
      full_key = squash_text(full),
      plot_label = if (nzchar(item)) item else stem,
      options = options,
      special = options$value[options$special]
    )
  })
  names(meta) <- vapply(meta, function(m) m$variable, character(1))
  meta
}

`%||%` <- function(a, b) if (is.null(a)) b else a

match_headers <- function(headers, meta) {
  keys <- vapply(meta, function(m) m$full_key, character(1))
  names(keys) <- names(meta)
  assignments <- rep(NA_character_, length(headers))
  roles <- rep("variable", length(headers))
  for (i in seq_along(headers)) {
    hk <- squash_text(headers[[i]])
    if (hk == "do you wish to participate in mentor" || startsWith(hk, "do you wish to participate")) {
      roles[[i]] <- "consent"
      next
    }
    exact <- names(keys)[vapply(keys, function(k) country_equal(k, hk), logical(1))]
    if (length(exact) > 1) {
      stop("Header matches more than one variable: ", headers[[i]])
    }
    if (length(exact) == 1) {
      assignments[[i]] <- exact
      next
    }
    suffix <- names(keys)[vapply(keys, function(k) nchar(hk) > 20 && endsWith(k, hk), logical(1))]
    if (length(suffix) > 1) {
      stop("Header is a suffix of more than one variable: ", headers[[i]])
    }
    if (length(suffix) == 1) {
      assignments[[i]] <- suffix
      next
    }
    stop(
      "No dictionary variable matches this column: ",
      headers[[i]],
      "\nSquashed key: ", hk
    )
  }
  dup <- assignments[!is.na(assignments)]
  if (any(duplicated(dup))) {
    stop("Two columns matched the same variable: ", paste(unique(dup[duplicated(dup)]), collapse = ", "))
  }
  list(variable = assignments, role = roles)
}

survey_country_from_header <- function(header) {
  m <- regexec("came/moved to ([^?]+)", header, ignore.case = TRUE)
  hit <- regmatches(header, m)[[1]]
  if (length(hit) < 2) stop("Could not read the survey country from: ", header)
  trimws(hit[[2]])
}

recode_column <- function(values, options) {
  raw <- as.character(values)
  raw[is.na(raw)] <- ""
  shown <- trimws(raw)
  shown[shown == ""] <- NA_character_
  key <- squash_text(raw)
  key[key == ""] <- NA_character_
  idx <- match(key, options$key)
  code <- rep(NA_integer_, length(values))
  known <- !is.na(idx)
  code[known] <- options$value[idx[known]]
  status <- rep("missing", length(values))
  status[known] <- "answered"
  status[!known & !is.na(shown)] <- "unmatched"
  data.frame(code = code, label = shown, status = status, stringsAsFactors = FALSE)
}

apply_skip_rules <- function(survey) {
  lab <- survey$label
  status <- survey$status
  mark <- function(variable, not_asked) {
    hit <- not_asked & status[[variable]] == "missing"
    status[[variable]][hit] <<- "not_asked"
  }
  gender <- lab$gender1
  mark("ident1", !is.na(gender) & gender != "Other gender identity")

  country <- survey$country
  born <- lab$bplace1
  born_here <- !is.na(born) & squash_text(born) == squash_text(country)
  mark("bage1", born_here)

  live <- lab$live1
  live_known <- !is.na(live)
  mark("livead1", live_known & live != "I do not live with my parents")
  mark("livesp1", live_known & live != "My parents live apart, and I live with both parents")
  mother_partner_asked <- live %in% c(
    "My parents live apart, and I live only with my mother",
    "My parents live apart, and I live with both parents"
  )
  father_partner_asked <- live %in% c(
    "My parents live apart, and I live only with my father",
    "My parents live apart, and I live with both parents"
  )
  mark("momprt1", live_known & !mother_partner_asked)
  mark("dadprt1", live_known & !father_partner_asked)
  survey$status <- status
  survey
}

completed_age <- function(year, month, ref_year = 2026L, ref_month = 7L) {
  age <- ref_year - year
  later <- !is.na(month) & month > ref_month
  age[later] <- age[later] - 1L
  age[is.na(year) | is.na(month)] <- NA_integer_
  as.integer(age)
}

migration_group <- function(youth, mother, father, country) {
  here <- function(x) !is.na(x) & squash_text(x) == squash_text(country)
  known <- function(x) !is.na(x) & nzchar(trimws(x))
  out <- rep(NA_character_, length(youth))
  youth_here <- here(youth)
  youth_abroad <- known(youth) & !youth_here
  parent_abroad <- (known(mother) & !here(mother)) | (known(father) & !here(father))
  both_here <- here(mother) & here(father)
  out[youth_abroad] <- "Born abroad"
  out[youth_here & both_here] <- paste0("Born in ", country, ", both parents born in ", country)
  out[youth_here & parent_abroad] <- paste0("Born in ", country, ", one or both parents born abroad")
  out[youth_here & !both_here & !parent_abroad] <- paste0("Born in ", country, ", parent birthplace incomplete")
  out[!known(youth)] <- NA_character_
  out
}

read_cleaned_sheet <- function(path) {
  if (grepl("\\.csv$", path, ignore.case = TRUE)) {
    return(utils::read.csv(
      path,
      check.names = FALSE,
      stringsAsFactors = FALSE,
      colClasses = "character",
      na.strings = character(),
      fileEncoding = "UTF-8"
    ))
  }
  readxl::read_xlsx(path, sheet = "Cleaned", col_types = "text", .name_repair = "minimal")
}

load_survey <- function(xlsx = NULL, report_dir = NULL) {
  if (is.null(report_dir)) {
    report_dir <- normalizePath(file.path(dirname(sys.frame(1)$ofile %||% ""), ".."), mustWork = FALSE)
  }
  if (!nzchar(report_dir) || !dir.exists(file.path(report_dir, "R"))) {
    report_dir <- normalizePath(getwd(), mustWork = TRUE)
  }
  if (is.null(xlsx) || !nzchar(xlsx)) {
    xlsx <- Sys.getenv("REPORT_XLSX", unset = "C:/Users/gubi/Downloads/test_data_cleaned.xlsx")
  }
  if (!file.exists(xlsx)) stop("Survey file not found: ", xlsx)

  meta <- load_dictionary(dictionary_path(report_dir), extra = paste0("smadd", 1:9))
  raw <- read_cleaned_sheet(xlsx)
  headers <- names(raw)
  matched <- match_headers(headers, meta)
  consent_col <- which(matched$role == "consent")
  if (length(consent_col) != 1) stop("Expected one participation column")
  consent <- trimws(raw[[consent_col]])
  keep <- !is.na(consent) & tolower(consent) == "yes"
  raw <- raw[keep, , drop = FALSE]
  n_declined <- sum(!keep)

  age_idx <- which(matched$variable == "bage1")
  if (length(age_idx) != 1) stop("The age-at-move column was not matched")
  age_header <- headers[[age_idx]]
  country <- survey_country_from_header(age_header)

  code <- list()
  label <- list()
  status <- list()
  for (i in seq_along(headers)) {
    var <- matched$variable[[i]]
    if (is.na(var)) next
    rec <- recode_column(raw[[i]], meta[[var]]$options)
    code[[var]] <- rec$code
    label[[var]] <- rec$label
    status[[var]] <- rec$status
    if (!nzchar(meta[[var]]$item)) meta[[var]]$plot_label <- headers[[i]]
  }
  survey <- list(
    path = tryCatch(normalizePath(xlsx, mustWork = TRUE), error = function(e) xlsx),
    file = basename(xlsx),
    n_file = length(keep),
    n_declined = n_declined,
    n = nrow(raw),
    country = country,
    meta = meta,
    code = as.data.frame(code, stringsAsFactors = FALSE),
    label = as.data.frame(label, stringsAsFactors = FALSE),
    status = as.data.frame(status, stringsAsFactors = FALSE)
  )
  survey <- apply_skip_rules(survey)
  survey$age <- completed_age(survey$code$byear1, survey$code$bmonth1)
  survey$migration <- migration_group(
    survey$label$bplace1, survey$label$bmborn1, survey$label$bfborn1, country
  )
  survey
}

substantive_matrix <- function(survey, vars) {
  missing <- setdiff(vars, names(survey$code))
  if (length(missing)) stop("Variables not in the survey: ", paste(missing, collapse = ", "))
  cols <- lapply(vars, function(v) {
    x <- survey$code[[v]]
    x[x %in% survey$meta[[v]]$special] <- NA_integer_
    x
  })
  m <- do.call(cbind, cols)
  colnames(m) <- vars
  m
}
