# Likert proration and ACE-IQ category scores.
# These functions do not read the survey file. Tests call them directly.

# Flip a 0-4 style item so the high end of the answer scale becomes the low end.
reverse_codes <- function(x, lo, hi) {
  out <- rep(NA_real_, length(x))
  ok <- !is.na(x)
  out[ok] <- lo + hi - x[ok]
  out
}

round_half_up <- function(x) {
  out <- rep(NA_integer_, length(x))
  ok <- !is.na(x) & is.finite(x)
  out[ok] <- as.integer(floor(x[ok] + 0.5))
  out
}

# m is a numeric matrix, one person per row. NA is an unanswered item.
# A sum is returned when answered items are at least min_frac of the columns.
# The prorated value is the answered-item mean times the item count, rounded
# to the nearest integer, with halves rounded up.
likert_scores <- function(m, min_frac = 0.8) {
  m <- as.matrix(m)
  storage.mode(m) <- "double"
  n_items <- ncol(m)
  if (n_items < 1) stop("likert_scores needs at least one item")
  n_answered <- rowSums(!is.na(m))
  raw <- rowSums(m, na.rm = TRUE) / n_answered * n_items
  raw[n_answered == 0] <- NA_real_
  keep <- n_answered / n_items >= min_frac
  score <- rep(NA_integer_, nrow(m))
  score[keep] <- round_half_up(raw[keep])
  status <- rep("missing", nrow(m))
  status[keep & n_answered == n_items] <- "complete"
  status[keep & n_answered < n_items] <- "prorated"
  data.frame(
    score = score,
    n_answered = as.integer(n_answered),
    status = status,
    stringsAsFactors = FALSE
  )
}

item_flag <- function(x, rule) {
  x <- as.numeric(x)
  out <- rep(NA, length(x))
  ok <- !is.na(x)
  if (!is.null(rule$ge)) {
    out[ok] <- x[ok] >= rule$ge
  } else if (!is.null(rule$eq)) {
    out[ok] <- x[ok] == rule$eq
  } else if (!is.null(rule$`in`)) {
    out[ok] <- x[ok] %in% rule$`in`
  } else {
    stop("A threshold rule needs ge, eq, or in")
  }
  out
}

category_from_flags <- function(flag_mat) {
  flag_mat <- as.matrix(flag_mat)
  n_known <- rowSums(!is.na(flag_mat))
  n_met <- rowSums(flag_mat == TRUE, na.rm = TRUE)
  out <- ifelse(n_met > 0, 1L, 0L)
  out[n_known == 0] <- NA_integer_
  as.integer(out)
}

# WHO ACE-IQ, 13 categories, binary and frequency versions.
# Thresholds follow the WHO guidance for analysing ACE-IQ.
# https://cdn.who.int/media/docs/default-source/documents/child-maltreatment/ace-iq-guidance-for-analysing.pdf
ace_category_spec <- function() {
  yes <- list(eq = 1)
  ever <- list(ge = 1)
  many <- list(ge = 3)
  few_or_many <- list(ge = 2)
  rarely_or_never <- list(`in` = c(0, 1))
  list(
    list(
      id = "physical_abuse",
      label = "Physical abuse",
      items = c("tnqactmh3", "tnqactmh4"),
      binary = list(tnqactmh3 = ever, tnqactmh4 = ever),
      frequency = list(tnqactmh3 = many, tnqactmh4 = many)
    ),
    list(
      id = "emotional_abuse",
      label = "Emotional abuse",
      items = c("tnqactmh1", "tnqactmh2"),
      binary = list(tnqactmh1 = ever, tnqactmh2 = ever),
      frequency = list(tnqactmh1 = many, tnqactmh2 = many)
    ),
    list(
      id = "sexual_abuse",
      label = "Contact sexual abuse",
      items = c("tnqactmh5", "tnqactmh6", "tnqactmh7", "tnqactmh8"),
      binary = list(tnqactmh5 = ever, tnqactmh6 = ever, tnqactmh7 = ever, tnqactmh8 = ever),
      frequency = list(tnqactmh5 = ever, tnqactmh6 = ever, tnqactmh7 = ever, tnqactmh8 = ever)
    ),
    list(
      id = "household_substance",
      label = "Household substance abuse",
      items = "dlupa1",
      binary = list(dlupa1 = yes),
      frequency = list(dlupa1 = yes)
    ),
    list(
      id = "household_mental",
      label = "Household mental illness",
      items = "dlupa2",
      binary = list(dlupa2 = yes),
      frequency = list(dlupa2 = yes)
    ),
    list(
      id = "household_prison",
      label = "Incarcerated household member",
      items = "dlupa3",
      binary = list(dlupa3 = yes),
      frequency = list(dlupa3 = yes)
    ),
    list(
      id = "household_violence",
      label = "Violence against a household member",
      items = c("fetnqact1", "fetnqact2", "fetnqact3"),
      binary = list(fetnqact1 = ever, fetnqact2 = ever, fetnqact3 = ever),
      frequency = list(fetnqact1 = many, fetnqact2 = few_or_many, fetnqact3 = few_or_many)
    ),
    list(
      id = "separation",
      label = "Parental separation or death",
      items = c("dlupa4", "dlupa5"),
      binary = list(dlupa4 = yes, dlupa5 = yes),
      frequency = list(dlupa4 = yes, dlupa5 = yes)
    ),
    list(
      id = "emotional_neglect",
      label = "Emotional neglect",
      items = c("rpginsfy1", "rpginsfy2"),
      binary = list(rpginsfy1 = rarely_or_never, rpginsfy2 = rarely_or_never),
      frequency = list(rpginsfy1 = rarely_or_never, rpginsfy2 = rarely_or_never)
    ),
    list(
      id = "physical_neglect",
      label = "Physical neglect",
      items = c("dlup1", "dlup2", "dlup3"),
      binary = list(dlup1 = ever, dlup2 = ever, dlup3 = ever),
      frequency = list(dlup1 = many, dlup2 = many, dlup3 = many)
    ),
    list(
      id = "bullying",
      label = "Bullying",
      items = "pvtnqabb1",
      binary = list(pvtnqabb1 = ever),
      frequency = list(pvtnqabb1 = many)
    ),
    list(
      id = "community_violence",
      label = "Community violence",
      items = c("tnqaomhs1", "tnqaomhs2", "tnqaomhs3"),
      binary = list(tnqaomhs1 = ever, tnqaomhs2 = ever, tnqaomhs3 = ever),
      frequency = list(tnqaomhs1 = many, tnqaomhs2 = many, tnqaomhs3 = many)
    ),
    list(
      id = "collective_violence",
      label = "Collective violence",
      items = c("ewcvtqaw1", "ewcvtqaw2", "ewcvtqaw3", "ewcvtqaw4"),
      binary = list(ewcvtqaw1 = ever, ewcvtqaw2 = ever, ewcvtqaw3 = ever, ewcvtqaw4 = ever),
      frequency = list(ewcvtqaw1 = ever, ewcvtqaw2 = ever, ewcvtqaw3 = ever, ewcvtqaw4 = ever)
    )
  )
}

ace_scored_items <- function() {
  unique(unlist(lapply(ace_category_spec(), function(cat) cat$items)))
}

apply_category_rules <- function(codes, rules) {
  flags <- lapply(names(rules), function(var) {
    if (!var %in% names(codes)) stop("ACE codes are missing ", var)
    item_flag(codes[[var]], rules[[var]])
  })
  category_from_flags(do.call(cbind, flags))
}

# codes: data.frame of substantive item codes (special responses already NA).
# Returns binary and frequency totals (0-13, NA if any category is missing)
# and one column per category for each version.
score_ace <- function(codes) {
  codes <- as.data.frame(codes, stringsAsFactors = FALSE)
  cats <- ace_category_spec()
  binary <- lapply(cats, function(cat) apply_category_rules(codes, cat$binary))
  frequency <- lapply(cats, function(cat) apply_category_rules(codes, cat$frequency))
  names(binary) <- paste0("bin_", vapply(cats, function(cat) cat$id, character(1)))
  names(frequency) <- paste0("frq_", vapply(cats, function(cat) cat$id, character(1)))
  bin_mat <- do.call(cbind, binary)
  frq_mat <- do.call(cbind, frequency)
  bin_total <- rowSums(bin_mat)
  frq_total <- rowSums(frq_mat)
  bin_total[rowSums(is.na(bin_mat)) > 0] <- NA_real_
  frq_total[rowSums(is.na(frq_mat)) > 0] <- NA_real_
  out <- data.frame(
    ace_binary = as.integer(bin_total),
    ace_frequency = as.integer(frq_total),
    stringsAsFactors = FALSE
  )
  cbind(out, as.data.frame(bin_mat, stringsAsFactors = FALSE), as.data.frame(frq_mat, stringsAsFactors = FALSE))
}

# A row of "no exposure" codes, then optional overrides. Used by tests and as documentation.
ace_no_exposure <- function() {
  items <- ace_scored_items()
  x <- rep(0, length(items))
  names(x) <- items
  x["rpginsfy1"] <- 4
  x["rpginsfy2"] <- 4
  x
}

# Higher of two ordered codes, such as mother's and father's education.
# NA on one side is ignored. NA when both are missing.
# A special code such as Don't know (998) is not a level: turn it into NA first.
higher_known <- function(a, b) {
  a <- as.numeric(a)
  b <- as.numeric(b)
  if (length(a) != length(b)) stop("higher_known needs two vectors of the same length")
  out <- a
  use_b <- is.na(a) | (!is.na(b) & b > a)
  out[use_b] <- b[use_b]
  out[is.na(a) & is.na(b)] <- NA_real_
  out
}

# Hours for one social-media time item. Codes are the dictionary values:
# 0 less than 1 hour, 1 is 1-2 hours, 2 is 3-4, 3 is 5-6, 4 is 7 hours or more.
# Anything else, including a blank, stays missing.
media_hours <- function(code) {
  code <- as.numeric(code)
  hours <- c(0.5, 1.5, 3.5, 5.5, 8)
  out <- rep(NA_real_, length(code))
  ok <- !is.na(code) & code %in% 0:4
  out[ok] <- hours[code[ok] + 1]
  out
}
