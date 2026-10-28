# Charts and count tables for the descriptive pages.
# In a Quarto Live cell, prose is returned as HTML and charts are embedded
# images. The knit report still uses cat() and print().

.mentor_stack <- new.env(parent = emptyenv())
.mentor_stack$frames <- list()

mentor_webr <- function() isTRUE(getOption("mentor.webr", FALSE))

mentor_in_frame <- function() length(.mentor_stack$frames) > 0

mentor_push <- function() {
  .mentor_stack$frames[[length(.mentor_stack$frames) + 1]] <- list()
  invisible(NULL)
}

mentor_cancel <- function() {
  i <- length(.mentor_stack$frames)
  if (i == 0) return(invisible(NULL))
  .mentor_stack$frames[[i]] <- NULL
  invisible(NULL)
}

mentor_add <- function(tag) {
  i <- length(.mentor_stack$frames)
  if (i == 0) stop("WebR output was produced outside a report section")
  frame <- .mentor_stack$frames[[i]]
  frame[[length(frame) + 1]] <- tag
  .mentor_stack$frames[[i]] <- frame
  invisible(NULL)
}

html_escape <- function(x) {
  x <- gsub("&", "&amp;", x, fixed = TRUE)
  x <- gsub("<", "&lt;", x, fixed = TRUE)
  x <- gsub(">", "&gt;", x, fixed = TRUE)
  x
}

inline_md <- function(x) {
  x <- html_escape(x)
  gsub("\\*\\*([^*]+)\\*\\*", "<strong>\\1</strong>", x)
}

md_to_html <- function(text) {
  trimmed <- trimws(text)
  if (!nzchar(trimmed)) return("")
  if (grepl("^<", trimmed)) return(trimmed)
  blocks <- strsplit(text, "\n\n", fixed = TRUE)[[1]]
  html <- vapply(blocks, function(block) {
    block <- trimws(block)
    if (!nzchar(block)) return("")
    if (grepl("^<", block)) return(block)
    lines <- strsplit(block, "\n", fixed = TRUE)[[1]]
    if (grepl("^### ", lines[[1]])) {
      return(paste0("<h3>", inline_md(sub("^### ", "", lines[[1]])), "</h3>"))
    }
    if (grepl("^## ", lines[[1]])) {
      return(paste0("<h2>", inline_md(sub("^## ", "", lines[[1]])), "</h2>"))
    }
    if (all(grepl("^\\s*- ", lines))) {
      items <- paste0(
        "<li>",
        vapply(lines, function(line) inline_md(sub("^\\s*- ", "", line)), ""),
        "</li>",
        collapse = ""
      )
      return(paste0("<ul>", items, "</ul>"))
    }
    paste0("<p>", paste(vapply(lines, inline_md, ""), collapse = "<br>"), "</p>")
  }, character(1))
  paste(html[nzchar(html)], collapse = "\n")
}

mentor_emit <- function(..., sep = "") {
  if (!mentor_webr()) {
    cat(..., sep = sep)
    return(invisible(NULL))
  }
  html <- md_to_html(paste(..., sep = sep))
  if (nzchar(html)) mentor_add(htmltools::HTML(html))
  invisible(NULL)
}

without_plot_hooks <- function(expr) {
  expr <- substitute(expr)
  hook_name <- "before.grid.newpage"
  previous <- getHook(hook_name)
  setHook(hook_name, NULL, "replace")
  on.exit({
    setHook(hook_name, NULL, "replace")
    if (is.list(previous)) {
      for (fn in previous) setHook(hook_name, fn, "append")
    }
  }, add = TRUE)
  eval(expr, parent.frame())
}

mentor_plot <- function(p) {
  if (!mentor_webr()) {
    print(p)
    return(invisible(p))
  }
  angle <- NULL
  if (!is.null(p$theme$axis.text.x)) angle <- p$theme$axis.text.x$angle
  if (is.null(angle) || length(angle) != 1 || is.na(angle)) angle <- 0
  width <- getOption("mentor.fig.width", 8)
  height <- if (angle > 0) 7 else getOption("mentor.fig.height", 4.8)
  file <- tempfile(fileext = ".png")
  without_plot_hooks(
    ggplot2::ggsave(
      file, plot = p, width = width, height = height, dpi = 110,
      bg = "white", limitsize = FALSE
    )
  )
  raw <- readBin(file, "raw", n = file.info(file)$size)
  unlink(file)
  src <- paste0("data:image/png;base64,", gsub("[\r\n]", "", jsonlite::base64_enc(raw)))
  mentor_add(htmltools::tags$img(src = src, alt = "Chart", style = "max-width:100%; height:auto;"))
  invisible(p)
}

mentor_collect <- function(expr) {
  expr <- substitute(expr)
  env <- parent.frame()
  if (!mentor_webr() || mentor_in_frame()) {
    eval(expr, env)
    return(invisible(NULL))
  }
  mentor_push()
  finished <- FALSE
  on.exit(if (!finished) mentor_cancel(), add = TRUE)
  eval(expr, env)
  pieces <- .mentor_stack$frames[[length(.mentor_stack$frames)]]
  out <- if (length(pieces) == 0) {
    htmltools::browsable(htmltools::tagList())
  } else {
    htmltools::browsable(do.call(htmltools::tagList, pieces))
  }
  mentor_cancel()
  finished <- TRUE
  out
}

display_label <- function(x) {
  ifelse(grepl("^[A-Z]{2,}", x), paste0(toupper(substring(tolower(x), 1, 1)), substring(tolower(x), 2)), x)
}

theme_mentor <- function(angle = 0) {
  ggplot2::theme_minimal(base_size = 13) +
    ggplot2::theme(
      panel.grid.minor = ggplot2::element_blank(),
      panel.grid.major.x = ggplot2::element_blank(),
      plot.title = ggplot2::element_text(face = "bold", size = 13),
      plot.subtitle = ggplot2::element_text(size = 11, colour = "#444444"),
      axis.text.x = ggplot2::element_text(
        angle = angle,
        hjust = if (angle > 0) 1 else 0.5,
        vjust = if (angle > 0) 1 else 0.5
      ),
      legend.position = "top"
    )
}

tick_angle <- function(labels) {
  labels <- as.character(labels)
  labels <- labels[!is.na(labels)]
  if (!length(labels)) return(0)
  longest <- max(nchar(labels))
  if (longest > 16) 45 else 0
}

gender_colours <- c(Boy = "#2C7FB8", Girl = "#E07A3D")

wrap_title <- function(x, width = 78) {
  paste(strwrap(x, width = width), collapse = "\n")
}

distribution_table <- function(survey, variable, among_asked = FALSE) {
  meta <- survey$meta[[variable]]
  status <- survey$status[[variable]]
  code <- survey$code[[variable]]
  label <- survey$label[[variable]]
  use <- if (among_asked) status != "not_asked" else rep(TRUE, length(status))
  status <- status[use]
  code <- code[use]
  label <- label[use]
  denom <- length(status)
  rows <- vector("list", nrow(meta$options))
  for (i in seq_len(nrow(meta$options))) {
    rows[[i]] <- data.frame(
      response = display_label(meta$options$label[[i]]),
      n = sum(status == "answered" & code == meta$options$value[[i]], na.rm = TRUE),
      sort = meta$options$value[[i]],
      stringsAsFactors = FALSE
    )
  }
  extras <- unique(label[status == "unmatched"])
  extra_rows <- lapply(extras, function(lab) {
    sort_key <- if (grepl("^[0-9]+$", lab)) as.numeric(lab) else 100000
    data.frame(response = lab, n = sum(label == lab, na.rm = TRUE), sort = sort_key, stringsAsFactors = FALSE)
  })
  df <- do.call(rbind, c(rows, extra_rows))
  long_list <- nrow(meta$options) > 12
  if (long_list) {
    df <- df[df$n > 0, , drop = FALSE]
    df <- df[order(-df$n, df$response), , drop = FALSE]
  } else {
    df <- df[order(df$sort, df$response), , drop = FALSE]
  }
  miss_n <- sum(status == "missing")
  df <- rbind(df, data.frame(response = "Missing", n = miss_n, sort = Inf, stringsAsFactors = FALSE))
  if (long_list && miss_n == 0) df <- df[df$response != "Missing", , drop = FALSE]
  df$percent <- if (denom == 0) NA_real_ else round(100 * df$n / denom, 1)
  df$denom <- denom
  attr(df, "not_asked") <- if (among_asked) sum(survey$status[[variable]] == "not_asked") else 0L
  df
}

vector_table <- function(x, level_order = NULL) {
  shown <- ifelse(is.na(x) | !nzchar(x), "Missing", x)
  if (is.null(level_order)) level_order <- unique(shown[shown != "Missing"])
  level_order <- c(level_order, "Missing")
  shown <- factor(shown, levels = level_order)
  n <- as.integer(table(shown))
  data.frame(
    response = level_order,
    n = n,
    percent = round(100 * n / length(x), 1),
    denom = length(x),
    stringsAsFactors = FALSE
  )
}

kable_counts <- function(df) {
  out <- data.frame(
    Response = df$response,
    n = df$n,
    Percent = sprintf("%.1f", df$percent),
    stringsAsFactors = FALSE
  )
  mentor_emit(paste(knitr::kable(out, format = "html", align = "lrr", table.attr = "class=\"table table-sm\""), collapse = "\n"))
  mentor_emit("\n\n")
}

dist_plot <- function(df, xlab) {
  plot_df <- df
  angle <- tick_angle(plot_df$response)
  ggplot2::ggplot(plot_df, ggplot2::aes(x = factor(response, levels = response), y = n)) +
    ggplot2::geom_col(fill = "#2C7FB8", width = 0.72) +
    ggplot2::labs(x = NULL, y = "Number of young people", title = wrap_title(xlab)) +
    theme_mentor(angle)
}

show_dist <- function(survey, variable, among_asked = FALSE, title = NULL) {
  df <- distribution_table(survey, variable, among_asked = among_asked)
  denom <- df$denom[[1]]
  not_asked <- attr(df, "not_asked")
  plot_title <- if (is.null(title)) survey$meta[[variable]]$plot_label else title
  show <- function() {
    if (among_asked) {
      mentor_emit(
        "The percentages leave out ", not_asked,
        " young people whose earlier answer skipped this question. ",
        "The remaining ", denom, " are shown here.\n\n",
        sep = ""
      )
    }
    if (nrow(df) <= 16) {
      mentor_plot(dist_plot(df, plot_title))
      mentor_emit("\n\n")
    } else if (!is.null(title)) {
      mentor_emit("**", title, "**\n\n", sep = "")
    }
    kable_counts(df)
  }
  if (!mentor_webr()) {
    show()
    return(invisible(df))
  }
  mentor_collect(show())
}

show_vector <- function(x, title, level_order = NULL) {
  df <- vector_table(x, level_order)
  show <- function() {
    mentor_plot(dist_plot(df, title))
    mentor_emit("\n\n")
    kable_counts(df)
  }
  if (!mentor_webr()) {
    show()
    return(invisible(df))
  }
  mentor_collect(show())
}

mean_ci <- function(x) {
  x <- x[!is.na(x)]
  n <- length(x)
  if (n == 0) return(data.frame(n = 0L, mean = NA_real_, lo = NA_real_, hi = NA_real_))
  m <- mean(x)
  if (n < 2) return(data.frame(n = n, mean = m, lo = m, hi = m))
  se <- stats::sd(x) / sqrt(n)
  data.frame(n = n, mean = m, lo = m - 1.96 * se, hi = m + 1.96 * se)
}

item_levels <- function(survey, variable, observed) {
  meta <- survey$meta[[variable]]
  base <- display_label(meta$options$label)
  extra <- setdiff(observed, c(base, "Missing"))
  extra <- extra[!is.na(extra)]
  c(base, extra, "Missing")
}

item_count_plot <- function(survey, variable, title = NULL, unscored = FALSE) {
  gender <- survey$label$gender1
  keep <- !is.na(gender) & gender %in% c("Boy", "Girl")
  response <- survey$label[[variable]][keep]
  response[is.na(response)] <- "Missing"
  # Prefer the dictionary wording, with shouty BCFPI labels softened.
  code <- survey$code[[variable]][keep]
  meta <- survey$meta[[variable]]
  for (i in seq_len(nrow(meta$options))) {
    hit <- !is.na(code) & code == meta$options$value[[i]]
    response[hit] <- display_label(meta$options$label[[i]])
  }
  df <- data.frame(gender = gender[keep], response = response, stringsAsFactors = FALSE)
  levels <- item_levels(survey, variable, unique(df$response))
  df$response <- factor(df$response, levels = levels)
  df$gender <- factor(df$gender, levels = c("Boy", "Girl"))
  df <- dplyr::count(df, gender, response, name = "n", .drop = FALSE)
  df <- tidyr::complete(df, gender, response, fill = list(n = 0L))
  df <- dplyr::group_by(df, gender)
  # if() rather than ifelse(): a length-1 test makes ifelse() keep only the
  # first category, so every bar in a gender would show that one percent.
  df <- dplyr::mutate(
    df,
    pct = if (sum(n) == 0) rep(0, dplyr::n()) else 100 * n / sum(n)
  )
  df <- dplyr::ungroup(df)
  angle <- tick_angle(levels(df$response))
  heading <- if (is.null(title)) survey$meta[[variable]]$plot_label else title
  if (unscored) heading <- paste0("Not part of the ACE total. ", heading)
  n_miss <- sum(survey$status[[variable]] == "missing")
  subtitle <- sprintf(
    "Percent within each gender. Not answered: %d of %d (%.1f%%).",
    n_miss, survey$n, 100 * n_miss / survey$n
  )
  ggplot2::ggplot(df, ggplot2::aes(x = response, y = pct, fill = gender)) +
    ggplot2::geom_col(position = ggplot2::position_dodge(width = 0.75), width = 0.7) +
    ggplot2::scale_fill_manual(values = gender_colours, name = NULL) +
    ggplot2::scale_y_continuous(labels = function(x) paste0(x, "%")) +
    ggplot2::labs(x = NULL, y = "Percent within gender", title = wrap_title(heading), subtitle = subtitle) +
    theme_mentor(angle)
}

score_mean_plot <- function(df, ylab) {
  df$gender <- factor(df$gender, levels = c("Boy", "Girl"))
  dodge <- ggplot2::position_dodge(width = 0.75)
  multi <- length(unique(df$score_name)) > 1
  if (!multi) {
    df$score_name <- df$gender
  } else {
    labs <- unique(as.character(df$score_name))
    wrapped <- vapply(labs, function(s) paste(strwrap(s, width = 22), collapse = "\n"), "")
    df$score_name <- factor(as.character(df$score_name), levels = labs, labels = wrapped)
  }
  ggplot2::ggplot(df, ggplot2::aes(x = score_name, y = mean, fill = gender)) +
    ggplot2::geom_col(position = dodge, width = 0.7) +
    ggplot2::geom_errorbar(
      ggplot2::aes(ymin = lo, ymax = hi),
      position = dodge, width = 0.18
    ) +
    ggplot2::geom_text(
      ggplot2::aes(y = hi, label = paste0("n=", n)),
      position = dodge, vjust = -0.4, size = 3.4
    ) +
    ggplot2::scale_fill_manual(values = gender_colours, name = NULL) +
    ggplot2::scale_y_continuous(expand = ggplot2::expansion(mult = c(0, 0.14))) +
    ggplot2::labs(x = NULL, y = ylab, title = "Mean score by gender", subtitle = "Error bars are 95% confidence intervals") +
    theme_mentor(0) +
    ggplot2::theme(legend.position = if (multi) "top" else "none")
}

gender_mean_frame <- function(score, gender, score_name) {
  df <- data.frame(score = score, gender = gender, stringsAsFactors = FALSE)
  df <- df[!is.na(df$gender) & df$gender %in% c("Boy", "Girl"), , drop = FALSE]
  rows <- lapply(c("Boy", "Girl"), function(g) {
    stats <- mean_ci(df$score[df$gender == g])
    data.frame(gender = g, score_name = score_name, stats, stringsAsFactors = FALSE)
  })
  do.call(rbind, rows)
}
