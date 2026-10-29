# Compact overview. Score charts, not item charts.
# Sourced from setup.R after the scale and plot helpers.

likert_sum <- function(survey, spec) {
  likert_scores(apply_reverse(
    survey,
    substantive_matrix(survey, spec$items),
    spec$reverse
  ))
}

plot_gender_means <- function(survey, scores, labels, ylab) {
  frames <- lapply(seq_along(scores), function(i) {
    gender_mean_frame(scores[[i]], survey$label$gender1, labels[[i]])
  })
  mentor_plot(score_mean_plot(do.call(rbind, frames), ylab))
}

media_activities <- function() {
  c(
    "Console or computer gaming",
    "Phone games",
    "Chatting",
    "Videos or streams",
    "Short-video feeds"
  )
}

media_time_frame <- function(survey) {
  activities <- media_activities()
  rows <- vector("list", length(activities) * 2)
  k <- 0L
  for (i in seq_along(activities)) {
    for (day in c("Weekday", "Weekend")) {
      items <- if (day == "Weekday") weekday_items() else weekend_items()
      hours <- media_hours(substantive_matrix(survey, items[[i]])[, 1])
      stats <- mean_ci(hours)
      k <- k + 1L
      rows[[k]] <- data.frame(
        activity = activities[[i]],
        day = day,
        stats,
        stringsAsFactors = FALSE
      )
    }
  }
  df <- do.call(rbind, rows)
  df$activity <- factor(df$activity, levels = activities)
  df$day <- factor(df$day, levels = c("Weekday", "Weekend"))
  df
}

media_time_plot <- function(df) {
  dodge <- ggplot2::position_dodge(width = 0.75)
  ticks <- axis_ticks(levels(df$activity))
  ggplot2::ggplot(df, ggplot2::aes(x = activity, y = mean, fill = day)) +
    ggplot2::geom_col(position = dodge, width = 0.7) +
    ggplot2::geom_errorbar(
      ggplot2::aes(ymin = lo, ymax = hi),
      position = dodge, width = 0.18
    ) +
    ggplot2::geom_text(
      ggplot2::aes(y = hi, label = paste0("n=", n)),
      position = dodge, vjust = -0.4, size = 3.2
    ) +
    ggplot2::scale_fill_manual(
      values = c(Weekday = "#2C7FB8", Weekend = "#E07A3D"),
      name = NULL
    ) +
    ggplot2::scale_x_discrete(labels = ticks$labels) +
    ggplot2::scale_y_continuous(expand = ggplot2::expansion(mult = c(0, 0.16))) +
    ggplot2::labs(
      x = NULL,
      y = "Mean hours",
      title = "Mean time by activity",
      subtitle = "Error bars are 95% confidence intervals"
    ) +
    theme_mentor(ticks$angle) +
    ggplot2::theme(legend.position = "top")
}

emit_prevalence <- function(ace, gender, version) {
  heading <- if (version == "binary") "Binary version" else "Frequency version"
  mentor_emit("\n\n### ", heading, "\n\n", sep = "")
  mentor_emit(
    "Each cell is the percent positive, then the number positive over the number with a non-missing category.\n\n"
  )
  tab <- ace_prevalence_table(ace, gender, version = version)
  mentor_emit(paste(knitr::kable(
    tab,
    format = "html",
    table.attr = "class=\"table table-sm\""
  ), collapse = "\n"))
  mentor_emit("\n\n")
}

render_overview_biography <- function(survey) {
  mentor_collect({
    mentor_emit("\n\n### Sex\n\n")
    show_dist(survey, "gender1", title = "What gender do you identify as?")
    mentor_emit(
      "\n\n### Migration background\n\n",
      "Born in ", survey$country, " means the birthplace answer is ", survey$country,
      ". Young people born in ", survey$country,
      " whose parent birthplaces are not both known, and who do not have a parent born abroad, ",
      "stay in their own row.\n\n",
      sep = ""
    )
    mig_levels <- c(
      paste0("Born in ", survey$country, ", both parents born in ", survey$country),
      paste0("Born in ", survey$country, ", one or both parents born abroad"),
      "Born abroad",
      paste0("Born in ", survey$country, ", parent birthplace incomplete")
    )
    show_vector(survey$migration, "Migration background", mig_levels)
    mentor_emit(
      "\n\n### Living situation\n\n",
      "Who the young person lives with. Follow-up questions are on the living situation page.\n\n",
      sep = ""
    )
    show_dist(survey, "live1", title = "Thinking about the people you live with, what best describes your situation?")
  })
}

render_overview_ses <- function(survey) {
  mentor_collect({
    mentor_emit("\n\n### Highest parental education\n\n")
    mentor_emit(
      "The level is the higher of the mother's and the father's education. ",
      "Don't know and a blank answer are ignored when the other parent has a level. ",
      "When neither parent has a level, the result is missing.\n\n",
      sep = ""
    )
    opts <- survey$meta$edumom1$options
    opts <- opts[!opts$special, , drop = FALSE]
    opts <- opts[order(opts$value), , drop = FALSE]
    labels <- display_label(opts$label)
    code <- higher_known(
      substantive_matrix(survey, "edumom1")[, 1],
      substantive_matrix(survey, "edudad1")[, 1]
    )
    shown <- rep(NA_character_, length(code))
    for (i in seq_len(nrow(opts))) {
      hit <- !is.na(code) & code == opts$value[[i]]
      shown[hit] <- labels[[i]]
    }
    show_vector(shown, "Highest parental education", labels)

    ladder <- survey$code$ladder1
    ladder_ci <- mean_ci(ladder)
    n_ladder_zero <- sum(survey$status$ladder1 == "unmatched")
    mentor_emit(
      "\n\n### Social ladder\n\n",
      "The ladder runs from 1 to 10 in the survey dictionary. ", n_ladder_zero,
      " answers of 0 are outside that list: they are shown in the chart and left out of the mean. ",
      "The mean of the 1-10 answers is ", sprintf("%.2f", ladder_ci$mean),
      " (95% CI ", sprintf("%.2f", ladder_ci$lo), " to ", sprintf("%.2f", ladder_ci$hi),
      "; n = ", ladder_ci$n, ").\n\n",
      sep = ""
    )
    show_dist(survey, "ladder1", title = "Where is your family on the social ladder?")
    mentor_emit("\n\n### Family can afford what it needs\n\n")
    show_dist(survey, "afford1", title = "I feel that my family can usually afford to buy what we need")
  })
}

render_overview_symptoms <- function(survey) {
  mentor_collect({
    mentor_emit(excluded_gender_note(survey), "\n\n", sep = "")
    mentor_emit(
      "The later score charts on this page use those same two groups. ",
      "The social media chart is not split by gender.\n\n",
      "Six sums, each from 0 to 12: attention, cooperativeness, managing anxiety, social anxiety, ",
      "mood, and emotion regulation. A sum is calculated when at least 5 of the 6 items are answered. ",
      "A higher score means more of these difficulties, except for emotion regulation. ",
      "That sum adds the answers as given. Its first three items are about feelings taking over, ",
      "and its last three are about keeping feelings in. Those last three items are not reversed.\n\n",
      sep = ""
    )
    ids <- c(
      "attention", "cooperativeness", "managing_anxiety",
      "social_anxiety", "mood", "emotion_regulation"
    )
    labels <- c(
      "Attention", "Cooperativeness", "Managing anxiety",
      "Social anxiety", "Mood", "Emotion regulation"
    )
    specs <- scale_specs()
    scores <- lapply(ids, function(id) likert_sum(survey, specs[[id]])$score)
    plot_gender_means(survey, scores, labels, "Mean sum (0-12)")
  })
}

render_overview_functioning <- function(survey) {
  mentor_collect({
    mentor_emit(
      "\n\n### Functioning\n\n",
      "Three domains, four items each. Each sum runs from 0 to 8 and needs all four answers. ",
      "A higher score means more difficulty in that domain.\n\n",
      sep = ""
    )
    spec <- scale_specs()$functioning
    scores <- lapply(spec$domains, function(domain) {
      likert_scores(substantive_matrix(survey, domain$items))$score
    })
    labels <- vapply(spec$domains, function(domain) domain$name, character(1))
    plot_gender_means(survey, scores, labels, spec$ylab)
  })
}

render_overview_ace <- function(survey) {
  mentor_collect({
    codes <- as.data.frame(substantive_matrix(survey, ace_scored_items()), stringsAsFactors = FALSE)
    ace <- score_ace(codes)
    n_score <- sum(!is.na(ace$ace_binary))
    mentor_emit(
      "The World Health Organization guidance asks for two totals. Each counts how many of 13 ",
      "adversity categories are present, from 0 to 13. The binary total uses the lower threshold. ",
      "The frequency total uses a higher threshold on some questions. ",
      n_score, " of ", survey$n,
      " have both totals. The others are missing because at least one category had no answered item. ",
      "The chart uses Boy and Girl only. The tables include every young person with a non-missing category.\n\n",
      sep = ""
    )
    means <- rbind(
      gender_mean_frame(ace$ace_binary, survey$label$gender1, "Binary (0-13)"),
      gender_mean_frame(ace$ace_frequency, survey$label$gender1, "Frequency (0-13)")
    )
    mentor_plot(score_mean_plot(means, "Mean number of categories (0-13)"))
    emit_prevalence(ace, survey$label$gender1, "binary")
    emit_prevalence(ace, survey$label$gender1, "frequency")
  })
}

render_overview_kidscreen <- function(survey) {
  mentor_collect({
    spec <- scale_specs()$kidscreen
    one <- likert_sum(survey, spec)
    mentor_emit(
      "The sum runs from 0 to 40. Felt sad and felt lonely are reversed. ",
      "A sum needs at least 8 of the 10 answers. A higher sum means better health-related quality of life. ",
      sum(!is.na(one$score)), " of ", survey$n, " have a sum.\n\n",
      sep = ""
    )
    plot_gender_means(survey, list(one$score), spec$score_name, spec$ylab)
  })
}

render_overview_cyrm <- function(survey) {
  mentor_collect({
    spec <- scale_specs()$cyrm
    one <- likert_sum(survey, spec)
    mentor_emit(
      "The sum runs from 0 to 48. No item is reversed. ",
      "A sum needs at least 10 of the 12 answers. A higher sum means more of the resources the items ask about. ",
      sum(!is.na(one$score)), " of ", survey$n, " have a sum.\n\n",
      sep = ""
    )
    plot_gender_means(survey, list(one$score), spec$score_name, spec$ylab)
  })
}

render_overview_media <- function(survey) {
  mentor_collect({
    mentor_emit(
      "Mean hours on a normal weekday and a normal weekend, for each activity. ",
      "Less than 1 hour is scored 0.5. 1-2 hours is 1.5, 3-4 hours is 3.5, and 5-6 hours is 5.5. ",
      "7 hours or more is scored 8. A blank answer is left out of that activity's mean. ",
      "Weekday and weekend are not added together, and the five activities are not added into one total.\n\n",
      sep = ""
    )
    mentor_plot(media_time_plot(media_time_frame(survey)))
  })
}
