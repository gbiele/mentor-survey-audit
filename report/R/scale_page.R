# One layout for every multi-item scale page.

excluded_gender_note <- function(survey) {
  g <- survey$label$gender1
  n_other <- sum(!is.na(g) & g == "Other gender identity")
  n_prefer <- sum(!is.na(g) & g == "Prefer not to answer")
  n_miss <- sum(is.na(g))
  sprintf(
    "The gender bars are Boy and Girl only. Left out of those bars: %d other gender identity, %d prefer not to answer, %d missing gender. Those young people are still in the biography page and in the missingness counts.",
    n_other, n_prefer, n_miss
  )
}

likert_blocks <- function(spec) {
  if (is.null(spec$domains)) {
    return(list(list(
      name = NULL,
      items = spec$items,
      score_name = spec$score_name,
      reverse = spec$reverse
    )))
  }
  lapply(spec$domains, function(domain) {
    list(
      name = domain$name,
      items = domain$items,
      score_name = domain$name,
      reverse = domain$reverse
    )
  })
}

apply_reverse <- function(survey, m, reverse) {
  reverse <- reverse %||% character()
  for (v in reverse) {
    opts <- survey$meta[[v]]$options
    opts <- opts[!opts$special, , drop = FALSE]
    m[, v] <- reverse_codes(m[, v], min(opts$value), max(opts$value))
  }
  m
}

render_likert <- function(survey, spec) {
  mentor_emit("\n\n## What the scale measures\n\n", spec$measures, "\n\n", sep = "")
  mentor_emit(excluded_gender_note(survey), "\n\n", sep = "")
  blocks <- likert_blocks(spec)
  frames <- vector("list", length(blocks))
  scored <- vector("list", length(blocks))
  for (i in seq_along(blocks)) {
    block <- blocks[[i]]
    one <- likert_scores(apply_reverse(
      survey,
      substantive_matrix(survey, block$items),
      block$reverse
    ))
    scored[[i]] <- one
    n_complete <- sum(one$status == "complete")
    n_prorated <- sum(one$status == "prorated")
    n_missing <- sum(one$status == "missing")
    lead <- if (is.null(block$name)) "Sum scores: " else paste0(block$name, ": ")
    mentor_emit(
      lead, n_complete + n_prorated, " of ", survey$n,
      " have a score (", n_complete, " from every item, ", n_prorated,
      " prorated, ", n_missing, " with no score because fewer than 80% of the items were answered).\n\n",
      sep = ""
    )
    frames[[i]] <- gender_mean_frame(one$score, survey$label$gender1, block$score_name)
  }
  means <- do.call(rbind, frames)
  mentor_plot(score_mean_plot(means, spec$ylab))
  mentor_emit("\n\n## Responses to each item\n\n")
  if (is.null(spec$domains)) {
    for (variable in spec$items) {
      mentor_plot(item_count_plot(survey, variable))
      mentor_emit("\n\n")
    }
  } else {
    for (domain in spec$domains) {
      mentor_emit("\n\n### ", domain$name, "\n\n", sep = "")
      for (variable in domain$items) {
        mentor_plot(item_count_plot(survey, variable))
        mentor_emit("\n\n")
      }
    }
  }
  mentor_emit("\n\n## How the score is calculated\n\n", spec$how, "\n\n", sep = "")
  invisible(scored)
}

ace_prevalence_table <- function(ace, gender) {
  cats <- ace_category_spec()
  groups <- list(
    Boy = !is.na(gender) & gender == "Boy",
    Girl = !is.na(gender) & gender == "Girl",
    All = rep(TRUE, length(gender))
  )
  rows <- lapply(cats, function(cat) {
    flag <- ace[[paste0("bin_", cat$id)]]
    cells <- lapply(groups, function(in_group) {
      known <- in_group & !is.na(flag)
      n <- sum(known)
      k <- sum(flag[known] == 1, na.rm = TRUE)
      if (n == 0) return("—")
      sprintf("%.1f (%d/%d)", 100 * k / n, k, n)
    })
    data.frame(
      Category = cat$label,
      Boy = cells$Boy,
      Girl = cells$Girl,
      All = cells$All,
      stringsAsFactors = FALSE
    )
  })
  do.call(rbind, rows)
}

render_ace <- function(survey, spec, parts = c("summary", "items")) {
  parts <- match.arg(parts, c("summary", "items"), several.ok = TRUE)
  ace <- NULL
  if ("summary" %in% parts) {
    mentor_emit("\n\n## What the scale measures\n\n", spec$measures, "\n\n", sep = "")
    mentor_emit(excluded_gender_note(survey), "\n\n", sep = "")
    codes <- as.data.frame(substantive_matrix(survey, ace_scored_items()), stringsAsFactors = FALSE)
    ace <- score_ace(codes)
    n_score <- sum(!is.na(ace$ace_binary))
    n_missing <- survey$n - n_score
    mentor_emit(
      "ACE totals: ", n_score, " of ", survey$n,
      " have both the binary and the frequency total. ",
      n_missing, " are missing because at least one of the 13 categories had no answered item.\n\n",
      sep = ""
    )
    means <- rbind(
      gender_mean_frame(ace$ace_binary, survey$label$gender1, "Binary (0-13)"),
      gender_mean_frame(ace$ace_frequency, survey$label$gender1, "Frequency (0-13)")
    )
    mentor_plot(score_mean_plot(means, "Mean number of categories (0-13)"))
    mentor_emit("\n\n## Percent in each category\n\n")
    mentor_emit("Binary version. Each cell is the percent positive, then the number positive over the number with a non-missing category.\n\n")
    tab <- ace_prevalence_table(ace, survey$label$gender1)
    mentor_emit(paste(knitr::kable(tab, format = "html", table.attr = "class=\"table table-sm\""), collapse = "\n"))
  }
  if ("items" %in% parts) {
    mentor_emit("\n\n## Responses to each item\n\n")
    for (variable in spec$items) {
      mentor_plot(item_count_plot(
        survey, variable,
        unscored = variable %in% spec$unscored
      ))
      mentor_emit("\n\n")
    }
  }
  if ("summary" %in% parts) {
    mentor_emit("\n\n## How the score is calculated\n\n", spec$how, "\n\n", sep = "")
  }
  invisible(ace)
}

render_items <- function(survey, spec) {
  mentor_emit("\n\n## What these questions ask\n\n", spec$measures, "\n\n", sep = "")
  mentor_emit(excluded_gender_note(survey), "\n\n", sep = "")
  for (group in spec$groups) {
    mentor_emit("\n\n### ", group$name, "\n\n", sep = "")
    for (variable in group$items) {
      mentor_plot(item_count_plot(survey, variable))
      mentor_emit("\n\n")
    }
  }
  invisible(NULL)
}

render_scale <- function(survey, id, parts = c("summary", "items")) {
  parts <- match.arg(parts, c("summary", "items"), several.ok = TRUE)
  spec <- scale_specs()[[id]]
  if (is.null(spec)) stop("Unknown scale: ", id)
  mentor_collect({
    missing <- setdiff(spec$items, names(survey$code))
    if (length(missing) && isTRUE(spec$allow_absent)) {
      mentor_emit("\n\n## What the scale measures\n\n", spec$measures, "\n\n", sep = "")
      mentor_emit(spec$absent, "\n\n", sep = "")
      mentor_emit("\n\n## How the score is calculated\n\n", spec$how, "\n\n", sep = "")
    } else if (length(missing)) {
      stop("Scale items are not in the file: ", paste(missing, collapse = ", "))
    } else if (spec$type == "likert") {
      render_likert(survey, spec)
    } else if (spec$type == "ace") {
      render_ace(survey, spec, parts)
    } else if (spec$type == "items") {
      render_items(survey, spec)
    } else {
      stop("Unknown scale type: ", spec$type)
    }
  })
}
