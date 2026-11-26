# BCFPI benchmarks for the JA-MENTOR youth survey

Notes for a survey analyst reading raw sums. Retrieved 29 October 2026. The survey metric is authoritative: items are never = 0, sometimes = 1, often = 2; six-item symptom sums run 0–12; each functioning domain is its own 4-item sum, 0–8. Higher means more difficulty. The survey file does not contain T-scores. No raw mean below was calculated from a T-score.

The six problem scales in the published instrument are regulation of attention, impulsivity and activity; cooperativeness; conduct; separation from parents; managing anxiety; and managing mood. Social anxiety and the six-item emotion block are not among them.

## What a published BCFPI score is, and what a T-score means

### Takeaway
Published BCFPI symptom items use the same 0–2 anchors as the survey, and the four symptom scales that correspond to the survey are six items each, so their raw sums also run 0–12. Service reports almost never print those raw sums. They print T-scores with a community mean of 50 and SD of 10 inside age-by-sex cells. A T-score of 70 is the usual “significantly elevated” flag and a T-score of 65 is used both as “borderline” and, in some Ontario service papers, as the clinical cut. Neither cut has a single raw-score equivalent, because the conversion depends on age band and sex, and the manual’s cell means were not in the open sources.

### Cited Findings
- Symptom items are rated 0 = “never or not true,” 1 = “sometimes true,” 2 = “often or very true.” — [Bova, 2006, Lakehead thesis](http://knowledgecommons.lakeheadu.ca/handle/2453/3326); same anchors on the youth brief screen, [BCFPI Inc. youth form, 2009](https://www.shared-care.ca/files/Youth_Questionnaire_Final.pdf)
- Regulation of attention, cooperativeness, conduct, separation from parents, and managing anxiety are six-item scales. Cook et al. also count managing mood as six items. — [Cook et al., 2013, Table 2](https://pmc.ncbi.nlm.nih.gov/articles/PMC3647631/); item lists in [Bova, 2006](http://knowledgecommons.lakeheadu.ca/handle/2453/3326) and [Gordon et al., 2006](https://doi.org/10.1177/1087054705283881)
- One description of the manual’s managing-mood scale lists nine items, adding weight loss and two self-harm/suicide items to the six mood items. On a 0–2 metric that version would run 0–18. No paper located here printed a raw mean on a 0–18 mood sum, and no paper located here scored BCFPI items 0–3. — [Bova, 2006](http://knowledgecommons.lakeheadu.ca/handle/2453/3326)
- The externalizing composite is 18 items (attention + cooperativeness + conduct) and internalizing is 18 items (separation + managing anxiety + managing mood). Those composites are reported as T-scores, not as 0–36 raw sums, in the clinical paper below. — [Cook et al., 2013, Table 2](https://pmc.ncbi.nlm.nih.gov/articles/PMC3647631/)
- Results are T-scores with mean 50 and SD 10. Children are compared with norms for ages 6–12 or 13–18, separately for the norming samples that were built by sex as well as age. Ages 3–5 are compared with the 6–12 norms. — [Bova, 2006](http://knowledgecommons.lakeheadu.ca/handle/2453/3326); [Barwick, Boydell, Cunningham, & Ferguson, 2004](https://pmc.ncbi.nlm.nih.gov/articles/PMC2538706/)
- Barwick et al. state that subscale scores use normative data from the revised Ontario Child Health Study scales for boys and girls aged 6–12 or 13–18, in both population and clinical samples. An adolescent self-report form exists. The 2009 factor paper analysed parent report. — [Barwick et al., 2004](https://pmc.ncbi.nlm.nih.gov/articles/PMC2538706/); [Cunningham, Boyle, Hong, Pettingill, & Bohaychuk, 2009](https://doi.org/10.1111/j.1469-7610.2008.01970.x)
- The current case-report guide: a T-score of 70, higher than 98% of the norming population, is “significantly elevated.” A T-score of 65, greater than 93% of the population, “might be considered a borderline score.” — [BCFPI case-report interpretation guide](https://bcfpi.com/wp-content/uploads/2025/01/bcfpi_interpreting_case_report.pdf)
- An Ontario service-utilization study converted raw scores to T-scores with age- and sex-based general-population norms and defined the clinical cut as T ≥ 65 (93rd percentile). — [Reid et al., 2019](https://doi.org/10.1186/s12913-019-4842-2)
- Norm samples named in print, none of them an adolescent-only raw-score table: OCHS-R community n = 1,712 and clinic-referred n = 1,512, plus a provincial implementation sample of 56,825 clinic-referred 6- to 18-year-olds (Cunningham et al., 2009). Barwick et al. (2004) give a community psychometric sample of 1,741 and a clinic sample of 1,727, and a field trial of 10,916. Bova (2006) describes the non-First Nations norm files she received as 1,683 population and 1,242 clinical parent reports, mean age 10.96 years (SD 3.59), so that file is not an adolescent sample. These counts do not agree with each other; they are reported as each paper states them. — [Cunningham et al., 2009](https://doi.org/10.1111/j.1469-7610.2008.01970.x); [Barwick et al., 2004](https://pmc.ncbi.nlm.nih.gov/articles/PMC2538706/); [Bova, 2006](http://knowledgecommons.lakeheadu.ca/handle/2453/3326)
- Factor structure was equivalent for boys versus girls and for ages 6–12 versus 13–18 in the implementation sample. Equivalence of structure is not a statement that raw means are equal across those groups. — [Cunningham et al., 2009](https://doi.org/10.1111/j.1469-7610.2008.01970.x)
- Screening against DISC-IV in 399 outpatient children and adolescents aged 5–17, mother report: AUC above .80 for conduct, oppositional defiant, ADHD, and separation anxiety; .76 for generalized anxiety; .75 for major depression. AUCs did not differ significantly for boys versus girls or for ages 5–11 versus 12–17. The abstract does not give the T or raw cut used for those classifications, and it does not print subscale means. — [Boyle et al., 2009](https://doi.org/10.1111/j.1469-7610.2008.01971.x)
- bcfpi.com says six Canadian and Swedish parent and youth surveys from 2014–2024 (total n = 10,174) were used to choose items and calculate norms for the scales in its current 30-scale list. The numeric tables were not in the page retrieved. — [BCFPI resources](https://bcfpi.com/resources/)

### Inferences
- A community T-score mean of 50 is true inside each age-by-sex norm cell by construction of the T-score. It is not a raw-score mean, and it is not one number for all adolescents.
- Because the cells have different raw means and SDs, the raw score that maps to T = 70 is different for a 13- to 18-year-old girl than for a 6- to 12-year-old boy. No open source printed that conversion. A linear guess from T = 50 would be invented and is not used here.
- The survey’s 0–12 sums can be compared with the 2009 brief-screen raw flags only where the six items match. They cannot be compared with the Cook et al. intake means, which are T-scores.

### Gaps
- The manual norm tables (Cunningham, Pettingill, & Boyle, cited across papers as 2000, 2001, 2004, or 2006) were not available as a citable numeric table. Adolescent community raw means and SDs, by sex, were not found.
- No source printed the raw score that equals T = 65 or T = 70 for any age-by-sex cell, for parent report or for youth self-report.
- Youth-self-report community raw means, separate from parent norms, were not found. The brief screen uses one raw flag for both informants (next section). That is a screening rule, not evidence that the raw distributions are the same.

## Raw-score flags for the symptom scales, and where the survey items differ

### Takeaway
The only raw-score clinical flags found on the 0–12 metric come from the BCFPI Inc. 2009 brief screen, not from a peer-reviewed mean table. They are integer sums on never/sometimes/often, described as elevated relative to norms for ages 6–18, and they are the same on the youth form (for youth aged 12 or over) and the caregiver form. They are not split by sex. Attention matches the published six items, so “above 7” can be read on `bcfpi_raia`. Cooperativeness, managing anxiety, and mood each differ by about one item from the published six, so those flags are for the published item set, not automatically for the survey sum.

### Cited Findings
- Youth form, six items, 0/1/2, section totals. Copyright line: “BCFPI YOUTH Self Report Brief Screen DRAFT ©BCFPI Inc. 2009.” The form is headed for youth aged 12 or over. The elevation rules say “normed values for 6- to 18-year-olds.” — [Youth questionnaire](https://www.shared-care.ca/files/Youth_Questionnaire_Final.pdf)
- The caregiver form uses the same section rules and the same 0/1/2 six-item blocks. — [Caregiver questionnaire](https://shared-care.ca/files/Caregiver_Questionnaire_Final.pdf)
- Section 1, regulation of attention, impulsivity and activity: a score above 7 is elevated. Published youth items: easily distracted / trouble sticking to activities; fail to finish things you start; difficulty following directions or instructions; impulsive, act without stopping to think; jump from one activity to another; fidget. — [Youth questionnaire](https://www.shared-care.ca/files/Youth_Questionnaire_Final.pdf). The same six appear as the factor-loading items in [Cook et al., 2013, Table 4](https://pmc.ncbi.nlm.nih.gov/articles/PMC3647631/) and in [Bova, 2006](http://knowledgecommons.lakeheadu.ca/handle/2453/3326).
- The survey’s attention content (fail to finish, easily distracted, jump between activities, difficulty following instructions, impulsive, fidget) is that six-item set. The “above 7” flag is on this metric: sums of 8, 9, 10, 11, or 12.
- Section 2, oppositional/cooperative behaviour: a score above 7 is elevated. Published youth items: cranky; defiant, talk back to adults; blame others for your own mistakes; easily annoyed by others; argue a lot with adults; angry and resentful. — [Youth questionnaire](https://www.shared-care.ca/files/Youth_Questionnaire_Final.pdf); same six in [Cook et al., 2013, Table 4](https://pmc.ncbi.nlm.nih.gov/articles/PMC3647631/)
- The survey cooperativeness list is blame others, irritable/angry, lose temper, defiant, argue with adults, resentful. “Lose temper” is not one of the published six. “Easily annoyed by others” is one of the published six and is not in the survey list. “Cranky” versus “irritable/angry” is a wording difference. The “above 7” flag belongs to the published six, including easily annoyed and cranky.
- Section 5, managing anxiety: a score above 6 is elevated. Published youth items: worry about doing better at things; worry about past behaviour; worry about doing the wrong thing; worry about things in the future; afraid of making mistakes; overly anxious to please people. — [Youth questionnaire](https://www.shared-care.ca/files/Youth_Questionnaire_Final.pdf); same six in [Cook et al., 2013, Table 4](https://pmc.ncbi.nlm.nih.gov/articles/PMC3647631/) and [Bova, 2006](http://knowledgecommons.lakeheadu.ca/handle/2453/3326)
- The survey managing-anxiety list shares five of those items. In place of “overly anxious to please people” it has “anxious or nervous.” The “above 6” flag is for the published six. It is not a flag for a sum that swaps in a general nervousness item. Do not apply the attention flag to this scale. The published anxiety flag is above 6, not above 7.
- Section 6, managing mood: a score above 5 is elevated. Published youth items: no interest in usual activities; no pleasure from usual activities; trouble enjoying yourself; not as happy as other children; feel hopeless; unhappy, sad, or depressed. — [Youth questionnaire](https://www.shared-care.ca/files/Youth_Questionnaire_Final.pdf). Cook et al. Table 4 loads the same six, with “has trouble enjoying self” where the survey has “lonely.” — [Cook et al., 2013](https://pmc.ncbi.nlm.nih.gov/articles/PMC3647631/)
- The survey mood list shares five items and substitutes “lonely” for “trouble enjoying yourself.” The “above 5” flag is for the published six. “Lonely” was not in the nine-item mood list either (no interest, no pleasure, trouble enjoying self, not as happy as other children, hopeless, unhappy/sad/depressed, weight loss, deliberate self-harm or suicide attempt, talks about killing self). — [Bova, 2006](http://knowledgecommons.lakeheadu.ca/handle/2453/3326)
- The brief screen also flags separation anxiety above 6 and conduct above 0. Those scales are not in the survey list. Conduct items are rare in the community, which is why any score above 0 is called elevated. — [Youth questionnaire](https://www.shared-care.ca/files/Youth_Questionnaire_Final.pdf); [Bova, 2006](http://knowledgecommons.lakeheadu.ca/handle/2453/3326)
- The brief screen says it is not a diagnostic tool and should be interpreted by a qualified provider. It does not state that “above 7” equals T = 70. — [Youth questionnaire](https://www.shared-care.ca/files/Youth_Questionnaire_Final.pdf)

### Inferences
- For `bcfpi_raia`, a raw sum above 7 (8–12) is the published brief-screen elevation flag for ages 6–18, both sexes, and it is the flag printed on the youth self-report form. A sum of 7 is not above that line. The flag is coarser than the manual: the manual’s T-scores move with age and sex, and this sheet does not.
- For `bcfpi_coop`, `bcfpi_ma`, and `bcfpi_mood`, quote the published flags only with the item mismatch in view. If the survey wording is a paraphrase of the published item, the flag applies. If “lose temper,” “anxious or nervous,” or “lonely” are literal substitute items, the published flag does not apply to that sum.
- Nothing in these sources gives a community raw mean. “Above 7” is a threshold, not a mean. The community mean on a 0–12 scale sits somewhere below that line and was not printed.

### Gaps
- No peer-reviewed table of community or clinical raw means (mean and SD) for these six-item sums, for adolescents, by sex, was found.
- The brief-screen document does not say which T-score the raw flags approximate, or whether the youth-form flags were taken from youth norms or copied from the parent form.

## Clinical means that exist only as T-scores

### Takeaway
The clinical numbers that papers actually print are T-scores from parent or mother interviews, mostly mixed child-and-adolescent samples. They are not on the survey’s 0–12 metric. The survey file does not contain T-scores, and these means are left as T-scores. No raw-score equivalent was in the source.

### Cited Findings
- Cook et al. (2013): 227 consecutive inpatient residential admissions at an Ontario tertiary centre, 1 October 2002 to 1 July 2006; 171 boys; age 6.28–16.74 years, mean 12.06 (SD 2.46). The parent or guardian completed the BCFPI before admission. This is not an adolescent-only sample and not a youth self-report sample. — [Cook et al., 2013](https://pmc.ncbi.nlm.nih.gov/articles/PMC3647631/)
- Table 1 means are T-scores. The outpatient column is “data obtained via personal communication with Peter Pettingil, November 9, 2006.” No outpatient N, SD, age, or sex split is printed. No SDs are printed for either column.

| Subscale (T-score) | Inpatient residential mean | Outpatient mean (personal communication) |
| --- | --- | --- |
| Regulation of attention, impulsivity and activity | 74.43 | 65.15 |
| Cooperativeness | 76.58 | 68.38 |
| Conduct | 93.66 | 67.79 |
| Externalizing | 83.07 | 69.87 |
| Separation from parents | 63.86 | 59.39 |
| Managing anxiety | 59.82 | 58.63 |
| Managing mood | 75.16 | 65.19 |
| Internalizing | 69.93 | 63.72 |
| Social participation | 84.49 | 69.58 |
| Quality of relationships | 75.66 | 62.79 |
| School participation and achievement | 79.67 | 63.00 |
| Global functioning | 86.07 | 68.49 |

— [Cook et al., 2013, Table 1](https://pmc.ncbi.nlm.nih.gov/articles/PMC3647631/)

- In that inpatient sample, managing anxiety (mean T 59.82) sits near the community centre relative to attention (74.43), cooperativeness (76.58), and mood (75.16). The paper describes the inpatient group as mostly externalizing, with anxiety or depression often secondary. Cronbach’s alpha in that sample: attention .75, cooperativeness .77, managing anxiety .83, managing mood .82, each with 6 items. — [Cook et al., 2013](https://pmc.ncbi.nlm.nih.gov/articles/PMC3647631/)
- Community comparison for these T-scores is the norm itself: mean 50, SD 10, within age and sex. Barwick et al. say clinic versus non-clinic means differed on all subscales, but they do not print the means. — [Barwick et al., 2004](https://pmc.ncbi.nlm.nih.gov/articles/PMC2538706/)

### Inferences
- On the T-score metric, an outpatient children’s-mental-health intake often sits near T = 65–68 on attention, cooperativeness, and mood, and nearer T = 59 on managing anxiety (the personal-communication column). The residential means are higher on attention, cooperativeness, mood, and the three functioning scales, and not higher on managing anxiety.
- Those sentences are about T-scores. They are not raw means on 0–12. A survey sum of 8 on attention is the brief-screen flag; it is not “a T of 74.”

### Gaps
- No SD accompanies the Cook means. The outpatient figures are not a published sample.
- No adolescent-only (about 12–18), youth-self-report clinical raw mean was found for any subscale.
- Boyle et al. (2009) is the screening study the assignment named. Its abstract reports AUCs, not means.

## Is social anxiety a published BCFPI subscale?

### Takeaway
No. The published BCFPI has no social-anxiety subscale. The survey’s six social-anxiety items are not the managing-anxiety scale, and managing-anxiety norms must not be applied to them. No named youth scale with the same six items, the same 0–2 metric, and published adolescent norms was identified. Applicable BCFPI norm: none.

### Cited Findings
- Standard mental-health scales are attention, cooperativeness, conduct, separation, managing anxiety, and managing mood. Descriptions of managing anxiety are performance, past behaviour, and future worry, plus “overly anxious to please people.” They do not cover embarrassment, eye contact, leaving events, avoiding gatherings, or a racing heart in company. — [Barwick et al., 2004](https://pmc.ncbi.nlm.nih.gov/articles/PMC2538706/); [Cook et al., 2013, Table 4](https://pmc.ncbi.nlm.nih.gov/articles/PMC3647631/); [Youth questionnaire](https://www.shared-care.ca/files/Youth_Questionnaire_Final.pdf)
- The 2009 development paper’s hypothesized scales are ADHD, ODD, CD, separation anxiety, GAD, and major depression. Social anxiety is not among them. — [Cunningham et al., 2009](https://doi.org/10.1111/j.1469-7610.2008.01970.x)
- The Ontario Child Health Study scales, from which the BCFPI items were drawn, include a separate social-phobia scale of five items. The published example is “afraid of doing things in front of others.” Goulter et al. dropped that scale “to align with the BCFPI,” which is a direct statement that social phobia is not a BCFPI scale. Five items is not the survey’s six, and the example item is not in the survey list given for this task. — [Goulter et al., 2023](https://doi.org/10.1111/jora.12779), citing Duncan et al., 2019, for the five-item count
- A BCFPI-V3 preprint adds affect regulation and parent–child attachment in a parent sample of 2,647 Canadian youth aged 6–18. The abstract does not add a social-anxiety scale and does not print norms. — [BCFPI-V3 preprint](https://doi.org/10.31234/osf.io/92vh5_v1)
- The DSM-5 Severity Measure for Social Anxiety Disorder, child age 11–17, is a different instrument: 10 items, scored 0–4 (never through all of the time), range 0–40. Its content overlaps the survey themes (embarrassment, racing heart or sweating, leaving early, avoiding eye contact, avoidance) but it is not these six 0–2 items. — [APA DSM-5 social-anxiety severity measure, ages 11–17](https://www.psychiatry.org/File%20Library/Psychiatrists/Practice/DSM/APA_DSM5_Severity-Measure-For-Social-Anxiety-Disorder-Child-Age-11-to-17.pdf)
- Searches on the survey’s combination of embarrassment, visible nervousness, conversation or eye contact, leaving events, avoiding gatherings, and racing heart or sweaty palms did not return a named six-item youth scale with community or clinical means on a 0–2, 0–12 metric.

### Inferences
- `bcfpi_sa` is a survey label. It is not a score the BCFPI manual norms. Attention cut-offs (raw above 7, or T = 70) and managing-anxiety cut-offs (raw above 6, or T = 70) do not transfer to it.
- The nearest published relatives are the five-item OCHS social-phobia scale and the 10-item DSM-5 severity measure. Neither is this sum. Their norms are not reported here because they would be the wrong metric.

### Gaps
- The full five OCHS social-phobia wordings were not retrieved, only the item count and one example. A future check of Duncan et al. (2019) could confirm there is no hidden six-item match. It would still be an OCHS scale, not a BCFPI norm.
- No community or clinical mean, on any metric, is cited for `bcfpi_sa`.

## Is the emotion-regulation block a published BCFPI subscale?

### Takeaway
No published BCFPI norm applies to `bcfpi_af`. The six items are six of the twelve Affect Regulation Checklist (ARC) items, three from dysregulation and three from suppression, summed in one total with nothing reversed. The ARC is not the BCFPI. It is scored as three separate subscales, on a different response scale, and the survey drops one item from each of those two factors plus the whole reflection factor. DERS and ERQ cut-offs do not apply. There is no published norm for this 0–12 sum.

### Cited Findings
- The original BCFPI problem scales do not include an emotion-regulation or affect scale. — [Barwick et al., 2004](https://pmc.ncbi.nlm.nih.gov/articles/PMC2538706/); [Cunningham et al., 2009](https://doi.org/10.1111/j.1469-7610.2008.01970.x)
- The ARC (Moretti, 2003) is a 12-item measure with three factors of four items: affect dysregulation (lack of control), suppression, and adaptive reflection. The SFU lab describes a 3-point scale from “not like me” to “a lot like me.” Goulter et al. (2023) scored a 5-point scale from 1 “a lot like me” to 5 “not like me” and summed each four-item factor. A later care-worker study used 1–5 from “not like me” to “a lot like me.” Those metrics already disagree with each other, and all of them disagree with a 0–2 frequency sum. — [SFU Adolescent Health Lab](https://www.adolescenthealth.ca/measures-1); [Goulter et al., 2023](https://doi.org/10.1111/jora.12779); [Santos et al., 2025](https://doi.org/10.1007/s10826-025-03044-9)
- ARC dysregulation items in the care-worker item table: “I have a hard time controlling my feelings”; “It’s very hard for me to calm down when I get upset”; “My feelings just take over me and I can’t do anything about it”; “When I get upset, it takes a long time for me to get over it.” — [Santos et al., 2025, Table 1](https://doi.org/10.1007/s10826-025-03044-9)
- ARC suppression items in that table: “I try hard not to think about my feelings”; “It’s best to keep feelings in control and not to think about them”; “I keep my feelings to myself”; “I try to do other things to keep my mind off how I feel.” — [Santos et al., 2025, Table 1](https://doi.org/10.1007/s10826-025-03044-9)
- The survey’s six, in order, match ARC items 1, 4, 7, 3, 6, and 9 from that numbering. They omit “takes a long time for me to get over it” and “I try to do other things to keep my mind off how I feel,” and they omit all four reflection items. Items 4–6 of the survey sum are the suppression items. The ARC does not reverse suppression; it keeps suppression as its own subscale because suppression is its own construct. Adding suppression to dysregulation without reversing is a different score from either ARC subscale. — item match to [Santos et al., 2025](https://doi.org/10.1007/s10826-025-03044-9); factor interpretation in [Goulter et al., 2023](https://doi.org/10.1111/jora.12779)
- The ARC was adapted from the Emotion Regulation Questionnaire (Gross & John, 2003) and the Emotion Regulation Checklist (Shields & Cicchetti, 1995), with extra items. Adaptation is not identity. The survey block is not the ERQ (reappraisal and suppression, different items and a 1–7 scale) and not the DERS. — [SFU Adolescent Health Lab](https://www.adolescenthealth.ca/measures-1)
- The SFU lab says a screening version of its scales “will be available as a component of the Brief Child and Family Interview (BCFPI), which will soon be released,” and points clinicians to youth_project@sfu.ca. That is a plan to house a short form inside a later BCFPI, not a published norm table. — [SFU Adolescent Health Lab](https://www.adolescenthealth.ca/measures-1)
- The BCFPI-V3 preprint evaluated new affect-regulation scales in 2,647 Canadian parents of youth aged 6–18 and reports internal consistency, test–retest reliability, and associations with functioning. The abstract does not print item wording, raw means, SDs, or cut-offs, and the sample is parent report. — [BCFPI-V3 preprint](https://doi.org/10.31234/osf.io/92vh5_v1)
- Goulter et al. (2023) community youth were 809 adolescents, mean age 15.67; clinical youth were 608, mean age 13.98. Those are the right ages for a youth comparison, but the scores are four-item ARC factor sums on a 1–5 scale. The paper’s retrieved text does not include a mean the survey sum could use, and using one would be the wrong instrument total.

### Inferences
- `bcfpi_af` should be read as an ad hoc 0–12 sum of three dysregulation items and three suppression items. Higher means more of both difficulty controlling feelings and deliberate non-expression. Because suppression is not reversed, a high score mixes two different strategies. That is what the survey scored; it is not an error to correct against an ARC manual, and it is not a BCFPI T-score.
- No BCFPI T = 70, no brief-screen raw flag, and no ARC or ERQ cut-off should be drawn on this column.

### Gaps
- The BCFPI-V3 full text was not available beyond the abstract, so it remains possible that a later BCFPI affect scale uses some of these words. Even if it does, no numeric norm from that preprint was found, and the preprint is parent report.
- ARC community means exist in other papers for the 12-item, three-factor scoring. They were not extracted, because they are not this sum and not this metric.

## Functioning: three domains

### Takeaway
The three domain names are real BCFPI scales: social participation, quality of relationships, and school participation and achievement. The survey’s scoring is not the published scoring. Published subscales are three items each, not four, and at least one adolescent study rated functioning on a 5-point interference scale rather than 0–2. Papers report the domains as T-scores. The survey’s separate 0–8 sums have no published raw mean and no published raw cut in the sources found. The Cook T-score means are left as T-scores. The survey file does not contain T-scores. “Too much screen time” does not appear in the published three-item descriptions.

### Cited Findings
- Impact on the child is three subscales: social participation, quality of social relationships, and school participation and achievement, plus a global composite. Higher T-scores mean more impairment. — [Barwick et al., 2004](https://pmc.ncbi.nlm.nih.gov/articles/PMC2538706/); [BCFPI case-report interpretation guide](https://bcfpi.com/wp-content/uploads/2025/01/bcfpi_interpreting_case_report.pdf)
- Gordon, Antshel, Faraone, Barkley, Lewandowski, Hudziak, Biederman, and Cunningham (2006), describing an Ontario outpatient intake of about 1,900 referrals aged 3–18: social participation is a three-item subscale (withdrawing or spending less time with other children); quality of relationships is a three-item subscale (poor relationships with parents, teachers, or peers); school participation and achievement is a three-item subscale (declining grades, poor attendance, or poor relationships with teachers). Global child/youth functioning is described there as an eight-item composite of those questions. — [Gordon et al., 2006](https://doi.org/10.1177/1087054705283881)
- Bova (2006) also says social participation has three items; the example is “Doing things less with other kids.” — [Bova, 2006](http://knowledgecommons.lakeheadu.ca/handle/2453/3326)
- Moretti and Obsuth (2009), in a study of parents of teens, say social participation, quality of relationships, school participation, and global functioning “are tapped by 8 items rated on a 5-point scale according to the degree to which various problems interfered with functioning.” That is not never/sometimes/often and not three separate 4-item 0–8 sums. — [Moretti & Obsuth, 2009](https://doi.org/10.1016/j.adolescence.2009.07.013)
- The 2009 youth and caregiver brief screens do not include functioning items and do not give a raw flag analogous to “above 7.” — [Youth questionnaire](https://www.shared-care.ca/files/Youth_Questionnaire_Final.pdf)
- The survey domains are four items each: relationships (friends, peers, family, other adults); social participation (sports/lessons, daily routines, isolates self, too much screen time); school (other students, teachers, school absence, low grades). Isolation, absence, and low grades echo the published themes. Four items, a friends-versus-peers split, other adults, daily routines, sports/lessons, and screen time are not in the three-item descriptions above. Teachers sit in the published relationship description and again in the published school description; the survey places teachers in school and splits family and other adults into the relationship block.
- Clinical T-score means, parent report, mixed ages, no SDs: social participation 84.49 inpatient vs 69.58 outpatient; quality of relationships 75.66 vs 62.79; school participation and achievement 79.67 vs 63.00; global functioning 86.07 vs 68.49. The outpatient column is the 2006 personal communication. — [Cook et al., 2013, Table 1](https://pmc.ncbi.nlm.nih.gov/articles/PMC3647631/)
- The same T = 70 “significantly elevated” and T = 65 “borderline” language in the case-report guide is the language used for subscale T-scores generally; the functioning step of that guide says higher T-scores mean more functional impairment and does not add a separate raw cut. — [BCFPI case-report interpretation guide](https://bcfpi.com/wp-content/uploads/2025/01/bcfpi_interpreting_case_report.pdf)
- Reid et al. (2019) built one “child impairment” index from the three domains and used T ≥ 65 as the clinical cut for BCFPI scores after age- and sex-norming. They do not print domain means. — [Reid et al., 2019](https://doi.org/10.1186/s12913-019-4842-2)

### Inferences
- A survey sum of 0–8 on one domain is not the published three-item subscale and not the eight-item global score. Do not add the three survey domains into a 0–24 total and compare it with “global functioning.” The survey does not score that total, and the published global score is a T-score on a shorter item set.
- The Cook functioning means can be quoted only as parent-report T-scores in a mixed-age tertiary sample versus an unpublished outpatient comparison. They are not community norms and not 0–8 means.
- Screen time has no BCFPI benchmark in these sources.

### Gaps
- No community raw mean or SD for any functioning domain, at any item count, was found.
- The exact three wordings inside each published functioning subscale were not in the open item tables. Only the content glosses above were found.
- Whether the original functioning items use 0–2 or only the 5-point interference scale is inconsistent across the two papers. Gordon et al. do not state the response numbers. Moretti and Obsuth state a 5-point interference scale for an eight-item set. Until the manual page is in hand, do not assume a 0–2 sum of three items.

## How to read a survey sum with what is actually published

### Takeaway
Use a raw benchmark only for regulation of attention, and only the brief-screen line. For the other three symptom names, the raw line is published for a six-item set that is one item off the survey list. Everything else that is numeric in the literature is a T-score the survey file does not contain. Social anxiety and the emotion block have no applicable BCFPI norm.

### Cited Findings
- Attention, items matched, 0–12, youth brief screen: above 7 is elevated versus norms for ages 6–18, not split by sex. Source does not equate this with T = 70. — [Youth questionnaire, 2009](https://www.shared-care.ca/files/Youth_Questionnaire_Final.pdf)
- Published cooperativeness, same metric: above 7. Published managing anxiety: above 6. Published managing mood: above 5. Same age span, same lack of a sex split, same caveat that the survey item set is not identical. — [Youth questionnaire, 2009](https://www.shared-care.ca/files/Youth_Questionnaire_Final.pdf)
- Manual-style interpretation, when a T-score exists: community mean 50, SD 10, inside sex by age band (6–12 and 13–18); T = 70 significantly elevated; T = 65 borderline in the guide and the clinical cut in Reid et al. (2019). Raw equivalent not in the source. — [BCFPI case-report interpretation guide](https://bcfpi.com/wp-content/uploads/2025/01/bcfpi_interpreting_case_report.pdf); [Reid et al., 2019](https://doi.org/10.1186/s12913-019-4842-2); [Barwick et al., 2004](https://pmc.ncbi.nlm.nih.gov/articles/PMC2538706/)
- Parent-report clinical T-score means, mixed ages, Cook et al. Table 1, as listed in the clinical section above. Not raw scores. — [Cook et al., 2013](https://pmc.ncbi.nlm.nih.gov/articles/PMC3647631/)
- `bcfpi_sa`: no applicable BCFPI norm. — [Cunningham et al., 2009](https://doi.org/10.1111/j.1469-7610.2008.01970.x); [Goulter et al., 2023](https://doi.org/10.1111/jora.12779)
- `bcfpi_af`: no applicable BCFPI norm; items are a partial ARC sum, not a normed ARC subscale. — [Santos et al., 2025](https://doi.org/10.1007/s10826-025-03044-9); [Goulter et al., 2023](https://doi.org/10.1111/jora.12779)

### Inferences
- A practical reading of `bcfpi_raia` is: 0–7 is not above the 2009 youth brief-screen line; 8–12 is. That line pools ages 6–18 and both sexes, so it is blunter than the manual’s T-score.
- A practical reading of the other columns is descriptive (higher is more difficulty, range 0–12 or 0–8) until the literal survey wording is checked against the published six. No community mean is available to say whether a given sum is average.

### Gaps
- Manual cell means for adolescents by sex, youth self-report, remain unpublished in the open sources checked.
- Cook et al. give the only subscale clinical means found, and they are T-scores without SDs, parent report, mean age 12.
