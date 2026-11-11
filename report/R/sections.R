# Section text for the in-browser report. The knitted pages keep their own prose.

absent_vars <- function(survey, vars) setdiff(vars, names(survey$code))

emit_absent <- function(vars) {
  lead <- if (length(vars) == 1) "This question is" else "These questions are"
  mentor_emit(
    lead, " not in this file (", paste(vars, collapse = ", "), "), so there is no chart.\n\n",
    sep = ""
  )
}

# A subsection is its heading, then either its body or a note naming the
# variables it needs that the file does not have.
subsection <- function(survey, heading, needs, body) {
  mentor_emit("\n\n### ", heading, "\n\n", sep = "")
  miss <- absent_vars(survey, needs)
  if (length(miss)) emit_absent(miss) else body
}

render_biography <- function(survey) {
  mentor_collect({
    if (isTRUE(survey$has_consent)) {
      mentor_emit(
        "Age, gender, and migration background for the ", survey$n,
        " young people who agreed to take part. ", survey$n_declined,
        " people in ", survey$file, " declined and are not included in this report.\n\n",
        sep = ""
      )
    } else {
      mentor_emit(
        "Age, gender, and migration background for all ", survey$n,
        " young people in ", survey$file,
        ". The file has no participation question, so all ", survey$n, " rows are included.\n\n",
        sep = ""
      )
    }
    mentor_emit("\n\n### Gender\n\n")
    show_dist(survey, "gender1", title = "What gender do you identify as?")
    subsection(survey, "Gender identity", "ident1", {
      mentor_emit("This question is asked only when the answer to gender is \"Other gender identity\".\n\n")
      show_dist(survey, "ident1", among_asked = TRUE, title = "What do you identify as?")
    })
    subsection(survey, "Grade", "grade1", {
      show_dist(survey, "grade1", title = "What grade are you in?")
    })
    subsection(survey, "Age", c("byear1", "bmonth1"), {
      age_known <- sum(!is.na(survey$age))
      age_missing <- sum(is.na(survey$age))
      mentor_emit(
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
    })
    subsection(survey, "Migration background", c("bplace1", "bmborn1", "bfborn1"), {
      mentor_emit(
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
    })
    subsection(survey, "Country of birth", "bplace1", {
      mentor_emit("Countries with no respondents are left off this list. Everyone who gave a country is listed.\n\n")
      show_dist(survey, "bplace1", title = "Where were you born?")
    })
  })
}

render_living <- function(survey) {
  mentor_collect({
    mentor_emit(
      "Who the young person lives with. Follow-up questions are limited to the people who were asked them. ",
      "A blank answer on a question that the previous answer skips is counted as not asked, not as missing.\n\n",
      sep = ""
    )
    subsection(survey, "Household", "live1", {
      show_dist(survey, "live1", title = "Thinking about the people you live with, what best describes your situation?")
    })
    subsection(survey, "Adults in the home", "livead1", {
      mentor_emit("Asked only of young people who do not live with their parents.\n\n")
      show_dist(survey, "livead1", among_asked = TRUE, title = "Which adults do you live with?")
    })
    subsection(survey, "Time with each parent", "livesp1", {
      mentor_emit("Asked only of young people whose parents live apart and who live with both parents.\n\n")
      show_dist(survey, "livesp1", among_asked = TRUE, title = "What best describes your situation?")
    })
    subsection(survey, "Mother's new partner", "momprt1", {
      mentor_emit("Asked when the young person lives only with their mother, or lives with both parents who live apart.\n\n")
      show_dist(survey, "momprt1", among_asked = TRUE, title = "Does your mother have a new partner?")
    })
    subsection(survey, "Father's new partner", "dadprt1", {
      mentor_emit("Asked when the young person lives only with their father, or lives with both parents who live apart.\n\n")
      show_dist(survey, "dadprt1", among_asked = TRUE, title = "Does your father have a new partner?")
    })
    subsection(survey, "Siblings in the home", "sibs1", {
      show_dist(survey, "sibs1", title = "How many siblings, half-siblings, or step-siblings do you live with?")
    })
  })
}

render_socioeconomic <- function(survey) {
  mentor_collect({
    mentor_emit(
      "Where the family sits on the social ladder, parents' education, and whether the family can usually afford what it needs. ",
      "\"Don't know\" on parental education stays as its own category.\n\n",
      sep = ""
    )
    subsection(survey, "Social ladder", "ladder1", {
      ladder_ci <- mean_ci(survey$code$ladder1)
      n_ladder_zero <- sum(survey$status$ladder1 == "unmatched")
      mentor_emit(
        "The ladder runs from 1 to 10 in the survey dictionary. ", n_ladder_zero,
        " answers of 0 are outside that list: they are shown in the chart and left out of the mean. ",
        "The mean of the 1-10 answers is ", sprintf("%.2f", ladder_ci$mean),
        " (95% CI ", sprintf("%.2f", ladder_ci$lo), " to ", sprintf("%.2f", ladder_ci$hi),
        "; n = ", ladder_ci$n, ").\n\n",
        sep = ""
      )
      show_dist(survey, "ladder1", title = "Where is your family on the social ladder?")
    })
    subsection(survey, "Mother's education", "edumom1", {
      show_dist(survey, "edumom1", title = "What best describes your mother's education?")
    })
    subsection(survey, "Father's education", "edudad1", {
      show_dist(survey, "edudad1", title = "What best describes your father's education?")
    })
    subsection(survey, "Family can afford what it needs", "afford1", {
      show_dist(survey, "afford1", title = "I feel that my family can usually afford to buy what we need")
    })
  })
}
