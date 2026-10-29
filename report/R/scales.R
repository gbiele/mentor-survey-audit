# Scale definitions for the example pages.
# Item names are the core variables in data/master_dictionary.json.

attention_items <- function() paste0("bcfpi_raia", 1:6)

cooperativeness_items <- function() paste0("bcfpi_coop", 1:6)

managing_anxiety_items <- function() paste0("bcfpi_ma", 1:6)

social_anxiety_items <- function() paste0("bcfpi_sa", 1:6)

mood_items <- function() paste0("bcfpi_mood", 1:6)

emotion_regulation_items <- function() paste0("bcfpi_af", 1:6)

functioning_items <- function() sprintf("bcfpi_yf%02d", 1:12)

cyrm_items <- function() sprintf("cyrm%02d", 1:12)

kidscreen_items <- function() c(paste0("ks", 1:8), "ksa1", "ksa2")

smadd_items <- function() paste0("smadd", 1:9)

weekday_items <- function() paste0("smwd", 1:5)

weekend_items <- function() paste0("smwda", 1:5)

# The youth questionnaire asks these in three blocks of four. Those blocks are
# the BCFPI child-functioning domains: quality of relationships, social
# participation, and school participation and achievement.
functioning_domains <- function() {
  list(
    list(
      name = "Quality of relationships",
      items = sprintf("bcfpi_yf%02d", 1:4)
    ),
    list(
      name = "Social participation",
      items = sprintf("bcfpi_yf%02d", 5:8)
    ),
    list(
      name = "School participation and achievement",
      items = sprintf("bcfpi_yf%02d", 9:12)
    )
  )
}

bcfpi_symptom <- function(id, items, score_name, measures) {
  list(
    id = id,
    type = "likert",
    items = items,
    score_name = score_name,
    ylab = "Mean sum (0-12)",
    measures = measures,
    how = bcfpi_six_how()
  )
}

bcfpi_six_how <- function() {
  paste(
    "Never is scored 0, sometimes 1, and often 2. The items are added, so the sum runs",
    "from 0 to 12. When at least 5 of the 6 items are answered, a missing item is filled",
    "with the mean of the answered items, the total is scaled back up to 6 items, and",
    "the result is rounded to the nearest whole number. A fractional part of exactly .5",
    "rounds up. When fewer than 5 items are answered, there is no sum. A blank cell is",
    "not an answer. The bars use Boy and Girl only."
  )
}

ace_page_items <- function() {
  c(
    "rpginsfy1", "rpginsfy2",
    "dlup1", "dlup2", "dlup3",
    "dlupa1", "dlupa2", "dlupa3", "dlupa4", "dlupa5",
    "fetnqact1", "fetnqact2", "fetnqact3",
    paste0("tnqactmh", 1:8),
    "pvtnqabb1", "bmo1", "nqapfpfo1",
    paste0("tnqaomhs", 1:3),
    paste0("ewcvtqaw", 1:4)
  )
}

scale_specs <- function() {
  list(
    attention = list(
      id = "attention",
      type = "likert",
      items = attention_items(),
      score_name = "Attention sum (0-12)",
      ylab = "Mean sum (0-12)",
      measures = paste(
        "Over the past six months, how often does the young person fail to finish things,",
        "get distracted, jump between activities, have trouble following instructions,",
        "act without thinking, or fidget? These six items are the regulation-of-attention",
        "scale from the Brief Child and Family Phone Interview. A higher score means more",
        "of these difficulties. The score is not an ADHD diagnosis, and it is not converted",
        "to a normed T-score."
      ),
      how = bcfpi_six_how()
    ),
    cooperativeness = bcfpi_symptom(
      "cooperativeness",
      cooperativeness_items(),
      "Cooperativeness (0-12)",
      paste(
        "Over the past six months, how often does the young person blame others for their",
        "mistakes, feel irritable, lose their temper, stay defiant, argue with adults, or",
        "feel resentful? These six items are the cooperativeness scale from the Brief Child",
        "and Family Phone Interview. A higher score means more of these difficulties. The",
        "score is not a diagnosis, and it is not converted to a normed T-score."
      )
    ),
    managing_anxiety = bcfpi_symptom(
      "managing_anxiety",
      managing_anxiety_items(),
      "Managing anxiety (0-12)",
      paste(
        "Over the past six months, how often does the young person feel anxious, worry about",
        "doing better, worry about past behaviour, worry about doing the wrong thing, worry",
        "about the future, or fear making mistakes? These six items are the managing-anxiety",
        "scale from the Brief Child and Family Phone Interview. A higher score means more of",
        "these difficulties. The score is not a diagnosis, and it is not converted to a",
        "normed T-score."
      )
    ),
    social_anxiety = bcfpi_symptom(
      "social_anxiety",
      social_anxiety_items(),
      "Social anxiety (0-12)",
      paste(
        "Over the past six months, how often does the young person feel embarrassed in social",
        "situations, worry that others can see they are nervous, struggle to talk or make eye",
        "contact, leave events early, avoid gatherings, or notice a racing heart or sweaty",
        "palms in company? These six items are the social-anxiety scale from the Brief Child",
        "and Family Phone Interview. A higher score means more of these difficulties. The",
        "score is not a diagnosis, and it is not converted to a normed T-score."
      )
    ),
    mood = bcfpi_symptom(
      "mood",
      mood_items(),
      "Mood (0-12)",
      paste(
        "Over the past six months, how often does the young person feel unhappy, take little",
        "pleasure in things, feel uninterested, feel lonely, feel less happy than other",
        "people, or feel hopeless? These six items are the mood scale from the Brief Child",
        "and Family Phone Interview. A higher score means more of these difficulties. The",
        "score is not a diagnosis, and it is not converted to a normed T-score."
      )
    ),
    emotion_regulation = bcfpi_symptom(
      "emotion_regulation",
      emotion_regulation_items(),
      "Emotion regulation (0-12)",
      paste(
        "Over the past six months, how often are feelings hard to control or hard to calm,",
        "and how often does the young person try not to think about feelings, believe they",
        "should stay under control, or keep them private? These six items are summed as",
        "answered. A higher score means the statements were endorsed more often. The first",
        "three are about feelings taking over. The last three are about keeping feelings in,",
        "and they are not reversed. The score is not a diagnosis, and it is not converted",
        "to a normed T-score."
      )
    ),
    functioning = list(
      id = "functioning",
      type = "likert",
      items = functioning_items(),
      domains = functioning_domains(),
      ylab = "Mean sum (0-8)",
      measures = paste(
        "These 12 items ask about day-to-day life over the past six months. The Brief Child",
        "and Family Phone Interview scores them as three domains, four items each. Quality",
        "of relationships covers friendships, people the same age, family, and other adults.",
        "Social participation covers sports and lessons, daily routines, time alone, and",
        "screen time. School participation and achievement covers other students, teachers,",
        "absence from school, and grades. A higher score means more difficulty in that",
        "domain. The scores are not converted to normed T-scores."
      ),
      how = paste(
        "Never is scored 0, sometimes 1, and often 2. Each domain is the sum of its four",
        "items, so each sum runs from 0 to 8. A sum is calculated when at least 80% of that",
        "domain's items are answered. Three of four is 75%, so each domain sum needs all",
        "four answers. A blank cell is not an answer. The bars use Boy and Girl only."
      )
    ),
    ace = list(
      id = "ace",
      type = "ace",
      items = ace_page_items(),
      unscored = c("bmo1", "nqapfpfo1"),
      measures = paste(
        "The ACE-IQ asks about adversity while growing up: emotional and physical neglect,",
        "household substance use, mental illness, prison, parental separation or death,",
        "violence between household members, emotional, physical, and sexual abuse,",
        "bullying, community violence, and collective violence. The total is not a sum of",
        "the answer codes. Following the World Health Organization guidance, the questions",
        "that belong in the score form 13 categories. Each category is 0 or 1, and the total",
        "is the number of categories present, from 0 to 13."
      ),
      how = paste(
        paste(
          "The World Health Organization guidance for analysing the ACE-IQ asks for two totals,",
          "a binary total and a frequency total. Each total counts how many of 13 adversity",
          "categories are present, so each score runs from 0 to 13. The numbers on the answer",
          "options are used only to decide whether an answer is over the threshold. They are",
          "not averaged, and they are not added up."
        ),
        paste(
          "The binary total uses the lower threshold. On questions answered never, once, a few",
          "times, or many times, any answer other than never counts. On the yes/no questions,",
          "yes counts. On the two questions about parents understanding the young person and",
          "knowing what they were doing, rarely or never counts, because those answers indicate",
          "neglect."
        ),
        paste(
          "The frequency total uses the same 13 categories. For some questions the WHO sets a",
          "higher threshold, so a milder answer can count in the binary total and not in the",
          "frequency total. Someone who was spanked once, for example, is counted under physical",
          "abuse in the binary total only.",
          "",
          "- Many times is required for emotional abuse, physical abuse, yelling at a household member, physical neglect, bullying, and community violence.",
          "- A few times or many times is required for seeing a household member slapped, or hit with an object.",
          sep = "\n"
        ),
        paste(
          "Sexual abuse, collective violence, household substance use, mental illness, and prison,",
          "parental separation or death, and the two parent-relationship questions use the same",
          "threshold in both totals."
        ),
        paste(
          "A category is 1 if any of its questions meets the threshold for that total. If every",
          "question in a category is blank, that category is missing and both totals are missing.",
          "The totals are not prorated. \"How were you bullied most often?\" and the question about",
          "physical fights are shown with the items and are not part of either total. The chart",
          "is the mean of these 0-13 counts by gender."
        ),
        sep = "\n\n"
      )
    ),
    kidscreen = list(
      id = "kidscreen",
      type = "likert",
      items = kidscreen_items(),
      reverse = c("ks2", "ks3"),
      score_name = "KIDSCREEN-10 (0-40)",
      ylab = "Mean sum (0-40)",
      measures = paste(
        "These 10 questions are the KIDSCREEN-10 index. They ask about the past week:",
        "feeling fit and full of energy, feeling sad or lonely, time for yourself, free time,",
        "parents, friends, getting on at school or work, and paying attention. A higher sum",
        "means better health-related quality of life. Felt sad and felt lonely are reversed",
        "in the sum so that agreement with those statements lowers the score. The item charts",
        "show the answers as given. The sum is not converted to a T-score."
      ),
      how = paste(
        "Each answer is scored from 0 to 4. For most items, never is 0 and always is 4.",
        "Fit and well, and getting on at school or work, run from not at all to a great extent",
        "on the same 0 to 4 scale. Felt sad and felt lonely are reversed, so never becomes 4",
        "and always becomes 0. The ten scores are added, and the sum runs from 0 to 40.",
        "When at least 8 of the 10 items are answered, missing items are filled with the mean",
        "of the answered items and the result is rounded to the nearest whole number, with .5",
        "rounded up. When fewer than 8 items are answered, there is no sum. A blank cell is",
        "not an answer. The bars use Boy and Girl only."
      )
    ),
    cyrm = list(
      id = "cyrm",
      type = "likert",
      items = cyrm_items(),
      score_name = "CYRM-12 (0-48)",
      ylab = "Mean sum (0-48)",
      measures = paste(
        "These 12 items are the Child and Youth Resilience Measure. They ask whether the",
        "young person has people to look up to, cares about education, is known by caregivers,",
        "finishes what they start, solves problems without harm, knows where to get help,",
        "belongs at school, is backed by family and friends, is treated fairly, can develop",
        "useful skills, and enjoys cultural and family traditions. A higher sum means more of",
        "these resources. The sum is not converted to a T-score."
      ),
      how = paste(
        "Not at all is scored 0 and a lot is scored 4. None of the items is reversed. The",
        "twelve scores are added, and the sum runs from 0 to 48. When at least 10 of the 12",
        "items are answered, missing items are filled with the mean of the answered items and",
        "the result is rounded to the nearest whole number, with .5 rounded up. When fewer",
        "than 10 items are answered, there is no sum. A blank cell is not an answer. The bars",
        "use Boy and Girl only."
      )
    ),
    smadd = list(
      id = "smadd",
      type = "likert",
      items = smadd_items(),
      allow_absent = TRUE,
      score_name = "Social media problems (0-36)",
      ylab = "Mean sum (0-36)",
      measures = paste(
        "These nine questions ask how strongly the young person agrees that, over the last",
        "12 months, social media use has been hard to limit and has got in the way of other",
        "interests, daily duties, school or work, health, and relationships. A higher sum",
        "means stronger agreement with those statements."
      ),
      absent = paste(
        "These nine questions are not in this cleaned file. In the dictionary they belong",
        "to the Germany questionnaire, not the core set that this export keeps, so there is",
        "no sum and no item chart here."
      ),
      how = paste(
        "Strongly disagree is scored 0 and strongly agree is scored 4. The nine scores are",
        "added, so the sum runs from 0 to 36. None of the items is reversed. When at least",
        "8 of the 9 items are answered, a missing item is filled with the mean of the",
        "answered items and the result is rounded to the nearest whole number, with .5",
        "rounded up. When fewer than 8 items are answered, there is no sum. A blank cell is",
        "not an answer. The bars use Boy and Girl only."
      )
    ),
    social_media_use = list(
      id = "social_media_use",
      type = "items",
      items = c(weekday_items(), weekend_items(), "smpos1", "smneg1"),
      measures = paste(
        "These questions ask about a normal weekday and a normal weekend day, then about",
        "feelings after using a phone or playing video games. They are shown one by one.",
        "They are not added into a score. The weekday and weekend questions use the same",
        "five activities, including gaming as well as chatting, videos, and short-video feeds."
      ),
      groups = list(
        list(name = "Weekday", items = weekday_items()),
        list(name = "Weekend", items = weekend_items()),
        list(name = "Feelings after phone use or gaming", items = c("smpos1", "smneg1"))
      )
    )
  )
}
