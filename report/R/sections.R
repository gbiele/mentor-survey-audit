# Section text for the in-browser report. The knitted pages keep their own prose.

render_biography <- function(survey) {
  mentor_collect({
    mentor_emit(
      "Age, gender, and migration background for the ", survey$n,
      " young people who agreed to take part. ", survey$n_declined,
      " people in ", survey$file, " declined and are not included in this report.\n\n",
      sep = ""
    )
    mentor_emit("\n\n### Gender\n\n")
    show_dist(survey, "gender1", title = "What gender do you identify as?")
    mentor_emit(
      "\n\n### Gender identity\n\n",
      "This question is asked only when the answer to gender is \"Other gender identity\".\n\n",
      sep = ""
    )
    show_dist(survey, "ident1", among_asked = TRUE, title = "What do you identify as?")
    mentor_emit("\n\n### Grade\n\n")
    show_dist(survey, "grade1", title = "What grade are you in?")
    age_known <- sum(!is.na(survey$age))
    age_missing <- sum(is.na(survey$age))
    mentor_emit(
      "\n\n### Age\n\n",
      "Age is completed years on 1 July 2026. The file has no interview date. ",
      "A birthday in July is counted as already reached, because the day of the month is unknown. ",
      "A birthday in August or later is still ahead. Mean age is ",
      sprintf("%.1f", mean(survey$age, na.rm = TRUE)),
      " years (", age_known, " young people). Age is missing for ",
      age_missing, " because the birth year or birth month is blank.\n\n",
      sep = ""
    )
    age_label <- ifelse(is.na(survey$age), NA_character_, as.character(survey$age))
    age_levels <- as.character(sort(unique(survey$age[!is.na(survey$age)])))
    show_vector(age_label, "Age on 1 July 2026", age_levels)
    mentor_emit(
      "\n\n### Migration background\n\n",
      "Born in ", survey$country, " means the birthplace answer is ", survey$country,
      ". The survey country is taken from the question about age at moving to ",
      survey$country, ". Young people born in ", survey$country,
      " whose parent birthplaces are not both known, and who do not have a parent born abroad, ",
      "are kept in their own row so they are not counted as either \"both parents born in ",
      survey$country, "\" or \"one or both parents born abroad\".\n\n",
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
      "\n\n### Country of birth\n\n",
      "Countries with no respondents are left off this list. Everyone who gave a country is listed.\n\n",
      sep = ""
    )
    show_dist(survey, "bplace1", title = "Where were you born?")
  })
}

render_living <- function(survey) {
  mentor_collect({
    mentor_emit(
      "Who the young person lives with. Follow-up questions are limited to the people who were asked them. ",
      "A blank answer on a question that the previous answer skips is counted as not asked, not as missing.\n\n",
      sep = ""
    )
    mentor_emit("\n\n### Household\n\n")
    show_dist(survey, "live1", title = "Thinking about the people you live with, what best describes your situation?")
    mentor_emit(
      "\n\n### Adults in the home\n\n",
      "Asked only of young people who do not live with their parents.\n\n",
      sep = ""
    )
    show_dist(survey, "livead1", among_asked = TRUE, title = "Which adults do you live with?")
    mentor_emit(
      "\n\n### Time with each parent\n\n",
      "Asked only of young people whose parents live apart and who live with both parents.\n\n",
      sep = ""
    )
    show_dist(survey, "livesp1", among_asked = TRUE, title = "What best describes your situation?")
    mentor_emit(
      "\n\n### Mother's new partner\n\n",
      "Asked when the young person lives only with their mother, or lives with both parents who live apart.\n\n",
      sep = ""
    )
    show_dist(survey, "momprt1", among_asked = TRUE, title = "Does your mother have a new partner?")
    mentor_emit(
      "\n\n### Father's new partner\n\n",
      "Asked when the young person lives only with their father, or lives with both parents who live apart.\n\n",
      sep = ""
    )
    show_dist(survey, "dadprt1", among_asked = TRUE, title = "Does your father have a new partner?")
    mentor_emit("\n\n### Siblings in the home\n\n")
    show_dist(survey, "sibs1", title = "How many siblings, half-siblings, or step-siblings do you live with?")
  })
}

render_socioeconomic <- function(survey) {
  mentor_collect({
    ladder <- survey$code$ladder1
    ladder_ci <- mean_ci(ladder)
    n_ladder_zero <- sum(survey$status$ladder1 == "unmatched")
    mentor_emit(
      "Where the family sits on the social ladder, parents' education, and whether the family can usually afford what it needs. ",
      "\"Don't know\" on parental education stays as its own category.\n\n",
      sep = ""
    )
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
    mentor_emit("\n\n### Mother's education\n\n")
    show_dist(survey, "edumom1", title = "What best describes your mother's education?")
    mentor_emit("\n\n### Father's education\n\n")
    show_dist(survey, "edudad1", title = "What best describes your father's education?")
    mentor_emit("\n\n### Family can afford what it needs\n\n")
    show_dist(survey, "afford1", title = "I feel that my family can usually afford to buy what we need")
  })
}
