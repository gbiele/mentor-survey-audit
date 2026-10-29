# Synthetic copy of a cleaned MENTOR workbook for the describe report.
#
# Sequential CART (synthpop) rebuilds the joint distribution one variable at a
# time. Rare birthplaces are pooled first, the gender write-in is replaced,
# and the apps multi-select is synthesized as indicators. Skip patterns are
# applied with rules. The original workbook is left unchanged.
#
# From the repository root:
#   Rscript scripts/make_synthetic_survey.R
#   Rscript scripts/make_synthetic_survey.R input.xlsx output.xlsx

suppressPackageStartupMessages({
  library(synthpop)
  library(readxl)
  library(writexl)
})

seed <- 20261029L
min_n <- 5L
ident_placeholder <- "Other identity"
app_cap <- 3L
quasi_keys <- c(
  "gender1", "grade1", "byear1", "bmonth1", "bplace1", "bmborn1", "bfborn1"
)

script_path <- sub(
  "^--file=",
  "",
  grep("^--file=", commandArgs(trailingOnly = FALSE), value = TRUE)
)
if (length(script_path) != 1) {
  script_path <- file.path("scripts", "make_synthetic_survey.R")
}
root <- normalizePath(file.path(dirname(script_path), ".."), mustWork = TRUE)

args <- commandArgs(trailingOnly = TRUE)
input <- if (length(args) >= 1) args[[1]] else "C:/Users/gubi/Downloads/test_data_cleaned.xlsx"
output <- if (length(args) >= 2) args[[2]] else file.path(root, "data", "NO", "test_data_synthetic.xlsx")
input <- normalizePath(input, mustWork = TRUE)
if (normalizePath(output, mustWork = FALSE) == input) {
  stop("Refusing to overwrite the input workbook: ", input)
}
dir.create(dirname(output), recursive = TRUE, showWarnings = FALSE)

source(file.path(root, "report", "R", "load_survey.R"))

blank_to_na <- function(x) {
  x <- as.character(x)
  x[is.na(x) | !nzchar(trimws(x))] <- NA_character_
  x
}

pool_rare <- function(x, min_n, other = "Other") {
  x <- blank_to_na(x)
  counts <- table(x)
  rare <- setdiff(names(counts)[counts < min_n], other)
  x[x %in% rare] <- other
  list(x = x, n_pooled = length(rare))
}

rule_blank_unless <- function(gate, allowed) {
  parts <- sprintf("%s != %s", gate, vapply(allowed, shQuote, character(1)))
  # A space before ")" keeps that pair out of synthpop's banned token list.
  # The "(" stays against the variable name so the rule parser still sees it.
  sprintf(
    "(%s ) | %s == \"NAtemp\" | is.na(%s)",
    paste(parts, collapse = " & "),
    gate,
    gate
  )
}

restore_na <- function(x) {
  x <- as.character(x)
  x[x %in% c("NAtemp", "NAlogical")] <- NA_character_
  x
}

prop_distance <- function(a, b) {
  clean <- function(x) {
    x <- as.character(x)
    x[is.na(x)] <- "<NA>"
    x
  }
  a <- clean(a)
  b <- clean(b)
  levels <- sort(union(unique(a), unique(b)))
  pa <- sapply(levels, function(v) mean(a == v))
  pb <- sapply(levels, function(v) mean(b == v))
  0.5 * sum(abs(pa - pb))
}

row_key <- function(df, keys) {
  cols <- lapply(keys, function(v) {
    x <- as.character(df[[v]])
    x[is.na(x)] <- "<NA>"
    x
  })
  do.call(paste, c(cols, sep = "\r"))
}

message("Reading ", input)
raw <- as.data.frame(
  read_xlsx(input, sheet = "Cleaned", col_types = "text", .name_repair = "minimal"),
  stringsAsFactors = FALSE,
  check.names = FALSE
)
if (anyDuplicated(names(raw))) stop("Duplicate column headers in the Cleaned sheet")
headers <- names(raw)
kept <- rowSums(vapply(raw, function(x) !is.na(blank_to_na(x)), logical(nrow(raw)))) > 0
raw <- raw[kept, , drop = FALSE]
message(nrow(raw), " rows, ", ncol(raw), " columns")

meta <- load_dictionary(
  file.path(root, "data", "master_dictionary.json"),
  extra = paste0("smadd", 1:9)
)
matched <- match_headers(headers, meta)
if (sum(matched$role == "consent") != 1) stop("Expected one participation column")
names(raw) <- ifelse(matched$role == "consent", "consent", matched$variable)

age_header <- headers[names(raw) == "bage1"]
country <- survey_country_from_header(age_header)
if (!country %in% raw$bplace1) {
  stop("Birthplace values do not include the survey country from the age-at-move header: ", country)
}

for (v in c("bplace1", "bmborn1", "bfborn1")) {
  pooled <- pool_rare(raw[[v]], min_n)
  raw[[v]] <- pooled$x
  message("Pooled ", pooled$n_pooled, " levels of ", v, " with fewer than ", min_n, " rows into Other")
}

apps_sep <- if (any(grepl(";", raw$apps1, fixed = TRUE))) ";" else ", "
tokens_of <- function(cell) {
  if (is.na(cell)) return(character())
  parts <- trimws(strsplit(cell, apps_sep, fixed = TRUE)[[1]])
  parts[nzchar(parts)]
}
token_counts <- table(unlist(lapply(raw$apps1, tokens_of)))
rare_apps <- names(token_counts)[token_counts < min_n]
coarsen_apps <- function(cell) {
  parts <- tokens_of(cell)
  if (!length(parts)) return(character())
  parts[parts %in% rare_apps] <- "Other app"
  unique(parts)
}
app_labels <- names(sort(table(unlist(lapply(raw$apps1, coarsen_apps))), decreasing = TRUE))
message(
  "Apps split on ", dQuote(apps_sep),
  ": ", length(app_labels), " indicators after pooling ", length(rare_apps), " rare apps"
)

app_cols <- sprintf("app_%02d", seq_along(app_labels))
names(app_labels) <- app_cols
app_rank <- setNames(seq_along(app_labels), app_labels)
for (col in app_cols) {
  label <- app_labels[[col]]
  present <- vapply(raw$apps1, function(cell) label %in% coarsen_apps(cell), logical(1))
  values <- ifelse(present, "Yes", "No")
  values[is.na(raw$apps1)] <- NA_character_
  raw[[col]] <- values
}

fallback_apps <- vapply(raw$apps1, function(cell) {
  parts <- coarsen_apps(cell)
  if (!length(parts)) return(NA_character_)
  parts <- parts[order(app_rank[parts], parts)]
  if (length(parts) > app_cap) parts <- parts[seq_len(app_cap)]
  paste(parts, collapse = apps_sep)
}, character(1))
fallback_apps <- fallback_apps[!is.na(fallback_apps)]

model_names <- c(setdiff(names(raw)[seq_along(headers)], c("ident1", "apps1")), app_cols)
if (model_names[[1]] != "consent") stop("The participation column has to be synthesized first")
model <- raw[model_names]
# synthpop's rule scanner rejects commas. Living-situation answers contain
# one, so the model uses those answers with the comma removed and the
# original wording is restored after synthesis.
plain_label <- function(x) gsub(",", "", x, fixed = TRUE)
live_levels <- unique(blank_to_na(raw$live1))
live_levels <- live_levels[!is.na(live_levels)]
live_plain <- plain_label(live_levels)
if (any(duplicated(live_plain))) stop("Removing commas made two living-situation answers identical")
names(live_levels) <- live_plain
for (v in names(model)) {
  values <- blank_to_na(model[[v]])
  if (v == "live1") values <- plain_label(values)
  model[[v]] <- factor(values)
}
wide <- vapply(model, nlevels, integer(1))
wide <- wide[wide > 60]
if (length(wide)) {
  stop(
    "Factor with more than 60 levels: ",
    paste(names(wide), wide, sep = "=", collapse = ", ")
  )
}

must_precede <- c(
  bage1 = "bplace1",
  livead1 = "live1",
  livesp1 = "live1",
  momprt1 = "live1",
  dadprt1 = "live1",
  bmo1 = "pvtnqabb1",
  aiuse1 = "ai1"
)
for (later in names(must_precede)) {
  earlier <- must_precede[[later]]
  if (match(earlier, names(model)) >= match(later, names(model))) {
    stop(earlier, " has to be synthesized before ", later)
  }
}

rules <- setNames(
  rep(list(rule_blank_unless("consent", "Yes")), length(model_names) - 1L),
  model_names[-1L]
)
rules[["bage1"]] <- sprintf(
  "bplace1 == %s | bplace1 == \"NAtemp\" | is.na(bplace1)",
  shQuote(country)
)
rules[["livead1"]] <- rule_blank_unless("live1", plain_label("I do not live with my parents"))
rules[["livesp1"]] <- rule_blank_unless("live1", plain_label("My parents live apart, and I live with both parents"))
rules[["momprt1"]] <- rule_blank_unless("live1", plain_label(c(
  "My parents live apart, and I live only with my mother",
  "My parents live apart, and I live with both parents"
)))
rules[["dadprt1"]] <- rule_blank_unless("live1", plain_label(c(
  "My parents live apart, and I live only with my father",
  "My parents live apart, and I live with both parents"
)))
rules[["bmo1"]] <- rule_blank_unless("pvtnqabb1", c("Once", "A few times", "Many times"))
rules[["aiuse1"]] <- rule_blank_unless("ai1", "Yes")
for (col in app_cols[-1L]) {
  rules[[col]] <- "app_01 == \"NAtemp\" | is.na(app_01)"
}
rvalues <- setNames(rep(list(NA), length(rules)), names(rules))
methods <- rep("cart", ncol(model))
methods[names(model) %in% c("consent", "gender1")] <- "sample"

message("Synthesizing ", ncol(model), " columns with synthpop CART")
synthesised <- syn(
  model,
  method = methods,
  m = 1,
  k = nrow(model),
  rules = rules,
  rvalues = rvalues,
  seed = seed,
  print.flag = TRUE,
  maxfaclevels = 60
)
synthetic <- as.data.frame(lapply(synthesised$syn, restore_na), stringsAsFactors = FALSE)
known_live <- match(synthetic$live1, names(live_levels))
synthetic$live1[!is.na(known_live)] <- live_levels[known_live[!is.na(known_live)]]
synthetic$ident1 <- ifelse(
  synthetic$gender1 == "Other gender identity",
  ident_placeholder,
  NA_character_
)

set.seed(seed)
app_na_counts <- rowSums(is.na(synthetic[app_cols]))
if (any(app_na_counts > 0 & app_na_counts < length(app_cols))) {
  stop("Partial NA across synthesized app indicators")
}
rebuild_apps <- function(row) {
  answers <- unlist(row[app_cols])
  if (all(is.na(answers))) return(NA_character_)
  chosen <- app_labels[app_cols][answers == "Yes" & !is.na(answers)]
  if (!length(chosen)) return(sample(fallback_apps, 1))
  chosen <- chosen[order(app_rank[chosen], chosen)]
  if (length(chosen) > app_cap) chosen <- chosen[seq_len(app_cap)]
  paste(chosen, collapse = apps_sep)
}
synthetic$apps1 <- apply(synthetic, 1, rebuild_apps)

out_names <- ifelse(matched$role == "consent", "consent", matched$variable)
asked_when <- list(
  ident1 = quote(gender1 == "Other gender identity"),
  bage1 = quote(!is.na(bplace1) & bplace1 != country),
  livead1 = quote(live1 == "I do not live with my parents"),
  livesp1 = quote(live1 == "My parents live apart, and I live with both parents"),
  momprt1 = quote(live1 %in% c(
    "My parents live apart, and I live only with my mother",
    "My parents live apart, and I live with both parents"
  )),
  dadprt1 = quote(live1 %in% c(
    "My parents live apart, and I live only with my father",
    "My parents live apart, and I live with both parents"
  )),
  bmo1 = quote(pvtnqabb1 %in% c("Once", "A few times", "Many times")),
  aiuse1 = quote(ai1 == "Yes")
)
violations <- vapply(names(asked_when), function(v) {
  asked <- with(synthetic, eval(asked_when[[v]]))
  asked[is.na(asked)] <- FALSE
  sum(!asked & !is.na(synthetic[[v]]))
}, integer(1))
if (any(violations > 0)) {
  print(violations[violations > 0])
  stop("Skip rules failed in the synthetic data")
}
declined <- is.na(synthetic$consent) | synthetic$consent != "Yes"
if (any(declined) && any(!is.na(synthetic[declined, setdiff(out_names, "consent"), drop = FALSE]))) {
  stop("Declined rows contain non-NA survey answers")
}
message("Skip rules hold for every follow-up")

original_keys <- row_key(raw, quasi_keys)
key_counts <- table(original_keys)
unique_original <- names(key_counts)[key_counts == 1]
syn_keys <- row_key(synthetic, quasi_keys)
copied <- syn_keys %in% unique_original
message(
  "Quasi-identifier keys unique in the coarsened data: ", length(unique_original),
  "; synthetic rows matching one: ", sum(copied)
)
synthetic$bmonth1[copied] <- NA_character_
reduced_keys <- setdiff(quasi_keys, "bmonth1")
reduced_counts <- table(row_key(raw, reduced_keys))
unique_reduced <- names(reduced_counts)[reduced_counts == 1]
syn_keys <- row_key(synthetic, quasi_keys)
still <- (syn_keys %in% unique_original) |
  (copied & (row_key(synthetic, reduced_keys) %in% unique_reduced))
if (any(still)) {
  message("Dropping ", sum(still), " rows that still copy a unique quasi-identifier key")
  synthetic <- synthetic[!still, , drop = FALSE]
}

out <- synthetic[out_names]
distances <- vapply(
  setdiff(out_names, c("ident1", "apps1")),
  function(v) prop_distance(raw[[v]], synthetic[[v]]),
  numeric(1)
)
worst <- sort(distances, decreasing = TRUE)[seq_len(min(8, length(distances)))]
message(sprintf("Median total-variation distance: %.3f", median(distances)))
message("Largest total-variation distances:")
for (v in names(worst)) message(sprintf("  %-12s %.3f", v, worst[[v]]))
other_gender <- synthetic$gender1 == "Other gender identity"
other_gender[is.na(other_gender)] <- FALSE
if (any(other_gender & synthetic$ident1 != ident_placeholder)) {
  stop("Gender write-in was not replaced for every Other gender identity row")
}

names(out) <- headers
message("Writing ", output)
write_xlsx(list(Cleaned = out), path = output)

survey <- load_survey(output, report_dir = file.path(root, "report"))
unmatched <- vapply(survey$status, function(s) sum(s == "unmatched"), integer(1))
unmatched <- unmatched[unmatched > 0]
message(
  "load_survey: country=", survey$country,
  " consenting=", survey$n,
  " declined=", survey$n_declined
)
if (length(unmatched)) {
  message("Unmatched labels (ident1 is the placeholder written in place of the free-text answers):")
  for (v in names(unmatched)) message(sprintf("  %-12s %d", v, unmatched[[v]]))
}
message("Wrote ", nrow(out), " synthetic rows to ", output)
