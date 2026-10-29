# Shared setup for every report page.
# Quarto runs each page with the page's own directory as the working directory,
# so a page in pages/ has to step up one level to find this file's neighbours.
report_dir <- if (file.exists(file.path("R", "load_survey.R"))) {
  normalizePath(getwd(), mustWork = TRUE)
} else if (file.exists(file.path("..", "R", "load_survey.R"))) {
  normalizePath("..", mustWork = TRUE)
} else {
  stop("Could not find the report directory from ", normalizePath(getwd()))
}

suppressPackageStartupMessages({
  library(ggplot2)
  library(dplyr)
  library(tidyr)
  library(knitr)
})

source(file.path(report_dir, "R", "load_survey.R"))
source(file.path(report_dir, "R", "scores.R"))
source(file.path(report_dir, "R", "plots.R"))
source(file.path(report_dir, "R", "scales.R"))
source(file.path(report_dir, "R", "scale_page.R"))
source(file.path(report_dir, "R", "overview.R"))

survey <- load_survey(report_dir = report_dir)
knitr::opts_chunk$set(echo = FALSE, message = FALSE, warning = FALSE)
