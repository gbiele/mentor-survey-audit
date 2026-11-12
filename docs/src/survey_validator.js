/**
 * JA-MENTOR Youth Survey Option Auditor & Validator
 * Client-Side Validation & Mapping Engine
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SurveyAuditor = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {

  // Special missing/refusal codes
  const SPECIAL_CODES = {
    997: "Not applicable",
    998: "Don't know",
    999: "Prefer not to answer"
  };

  const SPECIAL_LABEL_PATTERNS = [
    { code: 997, regex: /^(not applicable|n\/?a|n\. ?a\.?|does not apply|not relevant|nicht zutreffend|trifft nicht zu)\.?$/i },
    { code: 998, regex: /^(i )?((don't|dont|do not) know|dk|weiß nicht|weiss nicht|weiß es nicht)\.?$/i },
    { code: 999, regex: /(prefer not to (answer|say|respond|tell)|would rather not (answer|say)|keine angabe)/i },
    { code: 999, regex: /^(?:- )?prefiero no responder\.?$/i }
  ];

  const MATRIX_TITLE_VARS = new Set(["ID426"]);
  const BIRTH_COUNTRY_VARS = new Set(["bplace1", "bmborn1", "bfborn1"]);
  const MULTI_SELECT_HEADER_IDS = new Set(["ace23", "ai2", "some_apps1"]);

  /**
   * Normalize string for reliable matching
   */
  function norm(str) {
    if (str == null) return "";
    let s = String(str).normalize("NFKC");
    if (/^-?\d+\.0+$/.test(s.trim())) {
      s = s.trim().split('.')[0];
    }
    s = s.replace(/[\u00a0\u2000-\u200b\u202f\u205f]/g, " ");
    s = s.replace(/[–—]/g, "-").replace(/…/g, "...");
    s = s.replace(/[’‘`]/g, "'");
    s = s.replace(/<[^>]+>/g, " ");
    s = s.replace(/\s+/g, " ").trim();
    s = s.replace(/\s+([.,;:])/g, "$1");
    return s;
  }

  function normKey(str) {
    return norm(str).toLowerCase();
  }

  const COUNTRIES = [
    { key: "cyprus", name: "Cyprus", names: ["cyprus"], iso: "CY", codes: ["CY", "CYP"] },
    { key: "germany", name: "Germany", names: ["germany", "deutschland"], iso: "DE", codes: ["DE", "DEU", "GER"] },
    { key: "hungary", name: "Hungary", names: ["hungary"], iso: "HU", codes: ["HU", "HUN"] },
    { key: "norway", name: "Norway", names: ["norway", "norge"], iso: "NO", codes: ["NO", "NOR"] },
    { key: "spain", name: "Spain", names: ["spain", "españa"], iso: "ES", codes: ["ES", "ESP"] }
  ];

  /**
   * Words of a text: split at letter/digit changes, lower-to-upper case
   * changes and any separator. "MentorCY2026" -> Mentor, CY, 2026.
   */
  function countryWords(text) {
    return norm(text)
      .replace(/(\p{Ll})(\p{Lu})/gu, "$1 $2")
      .replace(/(\p{L})(\p{N})/gu, "$1 $2")
      .replace(/(\p{N})(\p{L})/gu, "$1 $2")
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean);
  }

  /** Whole word is a country name in any case, or one of its codes (ISO alpha-2/3, GER) in upper case when allowIso. */
  function countryFromWord(word, allowIso) {
    const low = word.toLowerCase();
    return COUNTRIES.find(c => c.names.includes(low) || (allowIso && c.codes.includes(word))) || null;
  }

  /** The one country the words name; null for none or for two different countries. */
  function uniqueCountry(words, allowIso) {
    const found = new Set();
    for (const word of words) {
      const c = countryFromWord(word, allowIso);
      if (c) found.add(c);
    }
    return found.size === 1 ? [...found][0] : null;
  }

  /**
   * Country from the EU Survey Alias cell. A whole cell of es, hu or de
   * counts; otherwise the words of the cell are matched whole.
   */
  function countryFromAliasCell(cell) {
    const key = normKey(cell);
    if (["es", "hu", "de"].includes(key)) return COUNTRIES.find(c => c.iso.toLowerCase() === key);
    return uniqueCountry(countryWords(cell), true);
  }

  /** English name for a known country or local spelling; other text stays as given (trimmed). */
  function normalizeCountryName(text) {
    const t = norm(text);
    if (!t) return null;
    const c = COUNTRIES.find(x => x.names.includes(t.toLowerCase()));
    return c ? c.name : t;
  }

  /** Lower-case key used in orig_aliases. */
  function countryKey(name) {
    const c = COUNTRIES.find(x => x.name === name);
    return c ? c.key : String(name).toLowerCase();
  }

  /**
   * Birth-country match key: normKey, then one leading "- ", then one
   * trailing " (xx)" of two ASCII letters. Does not strip an ID tag.
   */
  function birthMatchKey(str) {
    let s = normKey(str);
    if (s.startsWith("- ")) s = s.slice(2);
    s = s.replace(/ \([a-z]{2}\)$/, "");
    return s;
  }

  function isMultiSelectHeader(varId) {
    return MULTI_SELECT_HEADER_IDS.has(String(varId || "").toLowerCase());
  }

  /**
   * Parse header string: "Question text (var_id)" or "Question text [var_id]" -> { text, varId }
   */
  const QUALTRICS_META_HEADERS = new Set([
    "startdate", "enddate", "status", "ipaddress", "progress",
    "duration (in seconds)", "finished", "recordeddate", "responseid",
    "recipientlastname", "recipientfirstname", "recipientemail",
    "externalreference", "locationlatitude", "locationlongitude",
    "distributionchannel", "userlanguage", "last seen flow element id",
    "last seen question ids"
  ]);

  function looksLikeBareVarId(headerStr) {
    const raw = norm(headerStr);
    if (!raw || raw.length > 80) return false;
    const low = raw.toLowerCase();
    if (QUALTRICS_META_HEADERS.has(low)) return false;
    if (/[\(\[\{]/.test(raw)) return false;
    return /^[A-Za-z][A-Za-z0-9_.:\- ]*$/.test(raw);
  }

  function parseHeader(headerStr) {
    const raw = norm(headerStr);
    const m = raw.match(/^(.*?)\s*[\(\[\{]([A-Za-z0-9_.:\- ]{1,64})[\)\]\}]\s*$/);
    if (m) {
      return { text: norm(m[1]), varId: norm(m[2]), hadTag: true };
    }
    if (looksLikeBareVarId(raw)) {
      return { text: raw, varId: raw, hadTag: false };
    }
    return { text: raw, varId: "", hadTag: false };
  }

  const QUALTRICS_HEADER_ROW_CELLS = new Set([
    "start date", "end date", "response id", "recorded date",
    "startdate", "enddate", "responseid", "recordeddate"
  ]);

  /** Row r is an extra Qualtrics header row when its cell under column m is a question-text or ImportId cell. */
  function isQualtricsHeaderRow(rows, r, m) {
    const cell = (rows[r] || [])[m];
    if (typeof cell !== "string") return false;
    const key = normKey(cell);
    return QUALTRICS_HEADER_ROW_CELLS.has(key) || key.startsWith('{"importid"');
  }

  function nonEmptyCount(row) {
    return (row || []).filter(c => c != null && String(c).trim() !== "").length;
  }

  /** The Alias value: B1 when A1 is the "Alias" label, else A1 (unlabelled preamble). */
  function aliasCell(rows) {
    const row0 = rows[0] || [];
    return normKey(row0[0]) === "alias" ? row0[1] : row0[0];
  }

  /**
   * Layout of an export. Qualtrics: header in row 0, then up to two extra
   * header rows (question text, ImportId). EU Survey: Alias and Export Date
   * rows (labelled, or unlabelled with a short row 0 above a wider header
   * in row 3), then the header in row 3. Otherwise no preamble: header in row 0.
   */
  function detectExportLayout(rows) {
    const row0 = rows[0] || [];
    const marker = row0.findIndex(cell => {
      const v = norm(cell).toLowerCase();
      return v === "startdate" || v === "responseid" || v === "recordeddate";
    });
    if (marker !== -1) {
      let extra = 0;
      while (extra < 2 && 1 + extra < rows.length && isQualtricsHeaderRow(rows, 1 + extra, marker)) extra++;
      return {
        format: "qualtrics",
        headerRowIndex: 0,
        dataStartIndex: 1 + extra,
        metadataRows: 1 + extra
      };
    }
    if (normKey(row0[0]) === "alias" || normKey((rows[1] || [])[0]) === "export date" ||
        (nonEmptyCount(row0) <= 2 && nonEmptyCount(rows[3]) > nonEmptyCount(row0))) {
      return {
        format: "eusurvey",
        headerRowIndex: 3,
        dataStartIndex: 4,
        metadataRows: 4
      };
    }
    return {
      format: "plain",
      headerRowIndex: 0,
      dataStartIndex: 1,
      metadataRows: 1
    };
  }

  /** Country named by "came/moved to <X>?" in a header row, unless X is the [country] placeholder. */
  function countryFromHeaderRow(headerRow) {
    const found = new Set();
    for (const cell of headerRow || []) {
      const m = norm(cell).match(/came\/moved to\s+(.+?)\s*\?/i);
      if (!m || m[1].trim().toLowerCase() === "[country]") continue;
      found.add(normalizeCountryName(m[1]));
    }
    return found.size === 1 ? [...found][0] : null;
  }

  /**
   * Survey country from the Alias cell (EU Survey), then the file's own
   * age-at-arrival header, then the file name. First source with exactly
   * one country wins.
   */
  function detectSurveyCountry(rows, fileName) {
    const layout = detectExportLayout(rows);
    if (layout.format === "eusurvey") {
      const c = countryFromAliasCell(aliasCell(rows));
      if (c) return { name: c.name, source: "alias" };
    }
    const fromHeader = countryFromHeaderRow(rows[layout.headerRowIndex]);
    if (fromHeader) return { name: fromHeader, source: "header" };
    if (fileName) {
      const c = uniqueCountry(countryWords(String(fileName).replace(/\.[^.]*$/, "")), false);
      if (c) return { name: c.name, source: "filename" };
    }
    return { name: null, source: null };
  }

  /** options.country (trimmed, non-empty) replaces detection from the sheet. */
  function resolveCountry(rows, options) {
    const given = options && options.country != null ? String(options.country).trim() : "";
    if (given) return { name: normalizeCountryName(given), source: "selected" };
    return detectSurveyCountry(rows);
  }

  /**
   * Split stem and item text for matrix questions
   */
  function splitStemItem(text) {
    let raw = norm(text);
    let isMatrix = raw.startsWith("Matrix:");
    if (isMatrix) {
      raw = norm(raw.substring(7));
    }
    if (raw.includes(":")) {
      const parts = raw.split(":");
      const stem = norm(parts.slice(0, -1).join(":"));
      const item = norm(parts[parts.length - 1]);
      if (!item) {
        return { stem: stem || raw, itemText: "", isMatrix };
      }
      return { stem, itemText: item, isMatrix };
    }
    if (isMatrix) {
      return { stem: "", itemText: raw, isMatrix: true };
    }
    return { stem: raw, itemText: "", isMatrix: false };
  }

  /**
   * Parse cell answer: "Girl (ID3)" or "Girl [ID3]" -> { label: "Girl", answerId: "ID3" }.
   * A trailing tag is ID plus digits inside (), [], or {}. (ES) and (LT) stay.
   */
  function parseAnswer(cellVal) {
    if (cellVal == null) return { label: "", answerId: null, raw: "" };
    const s = norm(cellVal);
    if (!s) return { label: "", answerId: null, raw: "" };
    const m = s.match(/^(.*?)\s*[\(\[\{](ID\d+)[\)\]\}]\s*$/);
    if (m) {
      return { label: norm(m[1]), answerId: m[2], raw: s };
    }
    return { label: s, answerId: null, raw: s };
  }

  /**
   * Split a respondent cell on semicolons. A segment is rewritten only when
   * that segment itself ends with an ID tag. Other segments stay as stored.
   */
  function answerSegments(value) {
    const pieces = String(value).split(";");
    return pieces.map(part => {
      const parsed = parseAnswer(part);
      if (parsed.answerId) {
        return { part, label: parsed.label, answerId: parsed.answerId, hadId: true, raw: parsed.raw };
      }
      return { part, label: parsed.label, answerId: null, hadId: false, raw: parsed.raw };
    });
  }

  function labelsFromCell(value, splitMulti) {
    if (value == null || value === "") return [];
    const segments = answerSegments(value);
    const anyId = segments.some(seg => seg.hadId);
    if (splitMulti) {
      const out = [];
      for (const seg of segments) {
        if (!seg.label && !seg.answerId) continue;
        out.push({ key: seg.label || seg.raw, answerId: seg.answerId });
      }
      return out;
    }
    if (segments.length === 1 || !anyId) {
      const whole = parseAnswer(value);
      if (!whole.label && !whole.answerId) return [];
      return [{ key: whole.label || whole.raw, answerId: whole.answerId }];
    }
    const joined = segments.map(seg => (seg.hadId ? seg.label : seg.part)).join(";");
    return [{ key: joined, answerId: null }];
  }

  function replaceCountry(text, name) {
    return name ? String(text).replace(/\[country\]/gi, () => name) : text;
  }

  /**
   * Header cell for the cleaned download. Tagged headers keep the question
   * text from parseHeader; every other header stays as stored.
   */
  function cleanHeaderCell(value) {
    if (value == null || value === "") return value;
    const parsed = parseHeader(value);
    if (!parsed.hadTag) return value;
    return parsed.text;
  }

  /**
   * Respondent cell for the cleaned download. A trailing answer tag is
   * replaced with its label. Numbers, blanks, and untagged text stay as stored.
   */
  function cleanAnswerCell(value) {
    if (value == null || value === "") return value;
    const segments = answerSegments(value);
    if (segments.length === 1) {
      if (!segments[0].hadId) return value;
      return segments[0].label;
    }
    if (!segments.some(seg => seg.hadId)) return value;
    return segments.map(seg => (seg.hadId ? seg.label : seg.part)).join(";");
  }

  /**
   * One header row plus one respondent row, with preamble omitted and
   * trailing ID tags removed. Does not recode labels to numeric codes.
   */
  function cleanExportRows(rows, options) {
    const opts = options || {};
    if (opts.coreOnly && !opts.dictionary) {
      throw new Error("cleanExportRows: coreOnly needs a dictionary");
    }
    const base = cleanExportBase(rows);
    if (!opts.dictionary || base.length === 0) return base;
    if (rows.length < 2) {
      return opts.coreOnly ? base.map(() => []) : base;
    }

    const layout = detectExportLayout(rows);
    const dataRows = rows.slice(layout.dataStartIndex);
    const width = (rows[layout.headerRowIndex] || []).length;
    const audit = new SurveyAuditor(opts.dictionary).auditSheet(rows, { country: opts.country });
    const byCol = new Map(audit.columns.map(c => [c.colIndex, c]));
    const countryName = resolveCountry(rows, opts).name;

    const keep = [];
    for (let i = 0; i < width; i++) {
      const v = byCol.get(i) && byCol.get(i).canonical;
      if (!v) continue;
      base[0][i] = replaceCountry(
        v.item_text ? `${v.question_stem}: ${v.item_text}` : v.question_stem,
        countryName
      );
      const matcher = v.options && v.options.length ? buildOptionMatcher(v) : null;
      for (let r = 0; r < dataRows.length; r++) {
        const src = dataRows[r] || [];
        const cell = i < src.length ? src[i] : null;
        base[r + 1][i] = translateAnswerCell(cell, matcher, v, countryName);
      }
      if (v.is_core === true && v.source === "canonical_en") keep.push(i);
    }

    if (opts.coreOnly) return base.map(row => keep.map(i => row[i]));
    return base;
  }

  function cleanExportBase(rows) {
    if (!Array.isArray(rows) || rows.length === 0) return [];
    const layout = detectExportLayout(rows);
    const header = rows[layout.headerRowIndex] || [];
    const dataRows = rows.slice(layout.dataStartIndex);
    const width = header.length;
    const cleanedHeader = [];
    for (let i = 0; i < width; i++) {
      cleanedHeader.push(cleanHeaderCell(header[i]));
    }
    const cleanedData = dataRows.map(row => {
      const src = row || [];
      const n = Math.max(width, src.length);
      const out = [];
      for (let i = 0; i < n; i++) {
        const cell = i < src.length ? src[i] : null;
        out.push(cleanAnswerCell(cell));
      }
      return out;
    });
    return [cleanedHeader, ...cleanedData];
  }

  const SCRAMBLED_SAMPLE_SIZE = 50;

  /**
   * Source index for each output position. Math.random is used only when
   * the caller does not inject a permutation.
   */
  function randomResponseOrder(count) {
    const order = [];
    for (let i = 0; i < count; i++) order.push(i);
    for (let i = count - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const swap = order[i];
      order[i] = order[j];
      order[j] = swap;
    }
    return order;
  }

  function responseOrder(count, columnIndex, permutation) {
    if (typeof permutation !== 'function') return randomResponseOrder(count);
    const order = permutation(count, columnIndex);
    if (!Array.isArray(order) || order.length !== count) {
      throw new Error('Scramble permutation must list one source index per response row');
    }
    return order;
  }

  function copyRow(row) {
    return Array.isArray(row) ? row.slice() : [];
  }

  function responseCell(row, columnIndex) {
    if (!Array.isArray(row) || columnIndex >= row.length) return null;
    return row[columnIndex];
  }

  /**
   * Permute each response column on its own, then keep the first 50
   * response rows. Rows before the response block — the preamble, the
   * header, and a Qualtrics question-text row — stay put and are not
   * shuffled. Fewer than 50 responses are kept in full, and nothing
   * after that sample is written.
   *
   * Pass a permutation(responseCount, columnIndex) that returns the
   * source response index for every output position. Omit it to shuffle
   * each column independently. For rows already returned by
   * cleanExportRows, pass layout { headerRowIndex: 0, dataStartIndex: 1 }.
   * Otherwise the layout is detected from the sheet.
   */
  function scrambleExportSample(rows, options) {
    if (!Array.isArray(rows) || rows.length === 0) return [];

    let permutation = null;
    let layoutOverride = null;
    if (typeof options === 'function') {
      permutation = options;
    } else if (options) {
      if (typeof options.permutation === 'function') permutation = options.permutation;
      if (options.layout) layoutOverride = options.layout;
    }

    const detected = detectExportLayout(rows);
    const headerRowIndex = layoutOverride && Number.isInteger(layoutOverride.headerRowIndex)
      ? layoutOverride.headerRowIndex
      : detected.headerRowIndex;
    const dataStartIndex = layoutOverride && Number.isInteger(layoutOverride.dataStartIndex)
      ? layoutOverride.dataStartIndex
      : detected.dataStartIndex;

    const prefixCount = Math.min(Math.max(dataStartIndex, 0), rows.length);
    const prefix = [];
    for (let i = 0; i < prefixCount; i++) prefix.push(copyRow(rows[i]));

    const responseRows = rows.slice(Math.max(dataStartIndex, 0));
    const responseCount = responseRows.length;
    if (responseCount === 0) return prefix;

    let width = 0;
    const header = rows[headerRowIndex];
    if (Array.isArray(header)) width = header.length;
    for (let r = 0; r < responseCount; r++) {
      if (Array.isArray(responseRows[r]) && responseRows[r].length > width) {
        width = responseRows[r].length;
      }
    }

    const permutedColumns = [];
    for (let c = 0; c < width; c++) {
      const column = [];
      for (let r = 0; r < responseCount; r++) column.push(responseCell(responseRows[r], c));
      const order = responseOrder(responseCount, c, permutation);
      const permuted = [];
      for (let out = 0; out < responseCount; out++) permuted.push(column[order[out]]);
      permutedColumns.push(permuted);
    }

    const kept = Math.min(SCRAMBLED_SAMPLE_SIZE, responseCount);
    const sampled = [];
    for (let r = 0; r < kept; r++) {
      const row = [];
      for (let c = 0; c < width; c++) row.push(permutedColumns[c][r]);
      sampled.push(row);
    }
    return prefix.concat(sampled);
  }

  /**
   * Detect special code from label
   */
  function detectSpecialCode(label) {
    if (!label) return null;
    for (const pat of SPECIAL_LABEL_PATTERNS) {
      if (pat.regex.test(label)) {
        return pat.code;
      }
    }
    return null;
  }

  /**
   * Option lookup shared by the column audit and the cleaned export.
   * Precedence: answer ID, label (also option value and label_with_id),
   * alias, then special-code pattern. match() returns { option, reason } or null.
   */
  function buildOptionMatcher(canonical) {
    const canonicalOpts = canonical.options || [];
    const canByLabel = new Map();
    const canById = new Map();
    const canByAlias = new Map();

    const matchKey = BIRTH_COUNTRY_VARS.has(canonical.variable) ? birthMatchKey : normKey;

    for (const opt of canonicalOpts) {
      if (opt.label) canByLabel.set(matchKey(opt.label), opt);
      if (opt.value != null) canByLabel.set(String(opt.value), opt);
      if (opt.eusurvey_answer_id) canById.set(opt.eusurvey_answer_id, opt);
      if (opt.alias) canByAlias.set(matchKey(opt.alias), opt);
      if (opt.label_with_id) canByLabel.set(matchKey(opt.label_with_id), opt);
    }

    return {
      match(label, answerId) {
        const key = matchKey(label);
        if (answerId && canById.has(answerId)) {
          return { option: canById.get(answerId), reason: 'answer_id' };
        }
        if (canByLabel.has(key)) {
          return { option: canByLabel.get(key), reason: 'label_exact' };
        }
        if (canByAlias.has(key)) {
          return { option: canByAlias.get(key), reason: 'alias' };
        }
        const spCode = detectSpecialCode(label);
        if (spCode) {
          const option = canonicalOpts.find(o => o.value === spCode);
          if (option) return { option, reason: 'special_code' };
        }
        return null;
      }
    };
  }

  /**
   * Canonical English label for a matched option: the option itself when it
   * is not an alias, else the one non-alias option with the same value.
   * Returns null when that choice is not unique.
   */
  function canonicalLabel(canonical, opt) {
    if (!opt.alias) return opt.label;
    const c = (canonical.options || []).filter(o => !o.alias && o.value === opt.value);
    return c.length === 1 ? c[0].label : null;
  }

  /**
   * Respondent cell for the cleaned download with a dictionary: the canonical
   * English option label when the cell, or each semicolon segment of a cell
   * that does not map as a whole, maps to an option. Other text is cleaned as
   * in the download without a dictionary.
   */
  function translateAnswerCell(value, matcher, canonical, countryName) {
    if (value == null || value === "" || typeof value === "number" || !matcher) {
      return cleanAnswerCell(value);
    }
    if (typeof value === "string" && !value.trim()) return cleanAnswerCell(value);

    const observed = labelsFromCell(value, false)[0];
    const whole = matcher.match(observed.key, observed.answerId);
    if (whole) {
      const label = canonicalLabel(canonical, whole.option);
      return label == null ? cleanAnswerCell(value) : replaceCountry(label, countryName);
    }
    if (String(value).includes(";")) {
      return answerSegments(value).map(seg => {
        const found = matcher.match(seg.label || seg.raw, seg.answerId);
        const label = found ? canonicalLabel(canonical, found.option) : null;
        if (label != null) return replaceCountry(label, countryName);
        return seg.hadId ? seg.label : seg.part;
      }).join(";");
    }
    return cleanAnswerCell(value);
  }

  /**
   * Auditor Class
   */
  class SurveyAuditor {
    constructor(masterDictionary) {
      this.dictionary = masterDictionary || { variables: [] };
      this.initLookupIndices();
    }

    initLookupIndices() {
      this.byCleanVar = new Map();
      this.byOrigVar = new Map();
      this.byStemKey = new Map();
      this.byItemKey = new Map();
      this.byHeaderAlias = new Map();

      this.variables = this.dictionary.variables || [];
      for (const v of this.variables) {
        if (v.variable) this.byCleanVar.set(v.variable.toLowerCase(), v);

        if (v.question_stem) {
          const skey = normKey(v.question_stem);
          if (!this.byStemKey.has(skey)) this.byStemKey.set(skey, []);
          this.byStemKey.get(skey).push(v);
        }

        if (v.item_text) {
          const ikey = normKey(v.item_text);
          if (!this.byItemKey.has(ikey)) this.byItemKey.set(ikey, []);
          this.byItemKey.get(ikey).push(v);
        }

        // Header texts of country-language exports (data/country_maps/<country>_headers.csv).
        for (const texts of Object.values(v.header_aliases || {})) {
          for (const t of texts) {
            const hkey = normKey(t);
            if (!this.byHeaderAlias.has(hkey)) this.byHeaderAlias.set(hkey, []);
            const list = this.byHeaderAlias.get(hkey);
            if (!list.includes(v)) list.push(v);
          }
        }
      }
    }

    /**
     * Header texts a cleaned export writes for variables whose stem or item
     * names [country], with the country filled in. Built once per country name.
     */
    countryTextIndex(name) {
      if (!this.countryTextIndexes) this.countryTextIndexes = new Map();
      if (!this.countryTextIndexes.has(name)) {
        const index = new Map();
        for (const v of this.variables) {
          if (!/\[country\]/i.test(`${v.question_stem || ""} ${v.item_text || ""}`)) continue;
          const full = v.item_text ? `${v.question_stem}: ${v.item_text}` : v.question_stem;
          const key = normKey(replaceCountry(full, name));
          if (!index.has(key)) index.set(key, []);
          index.get(key).push(v);
        }
        this.countryTextIndexes.set(name, index);
      }
      return this.countryTextIndexes.get(name);
    }

    /**
     * Match a column header to a canonical variable definition
     */
    matchVariable(headerStr, colIndex, context) {
      const { text, varId } = parseHeader(headerStr);
      const { stem, itemText, isMatrix } = splitStemItem(text);

      let canonical = null;
      let matchType = 'unmatched';

      // Helper to pick best candidate when multiple canonical variables match
      const selectCandidate = (candidates, baseType) => {
        if (!candidates || candidates.length === 0) return null;
        if (candidates.length === 1) {
          return { candidate: candidates[0], type: baseType };
        }

        // 1. Context check: check if preceding matched variable was gaming (igd) vs social media (sma)
        if (context && context.prevCanonical) {
          const prevVar = context.prevCanonical.variable || '';
          if (prevVar.startsWith('igd') || prevVar.includes('gaming')) {
            const igdMatch = candidates.find(c => (c.variable.startsWith('igd') || (c.section && c.section.toLowerCase().includes('gaming'))));
            if (igdMatch && (!context.matchedVars || !context.matchedVars.has(igdMatch.variable))) {
              return { candidate: igdMatch, type: baseType + '_context' };
            }
          }
          if (prevVar.startsWith('sma') || prevVar.includes('social')) {
            const smaMatch = candidates.find(c => (c.variable.startsWith('sma') || (c.section && c.section.toLowerCase().includes('social'))));
            if (smaMatch && (!context.matchedVars || !context.matchedVars.has(smaMatch.variable))) {
              return { candidate: smaMatch, type: baseType + '_context' };
            }
          }
        }

        // 2. Sequential check: pick the first unassigned candidate
        if (context && context.matchedVars) {
          const unassigned = candidates.find(c => !context.matchedVars.has(c.variable));
          if (unassigned) {
            return { candidate: unassigned, type: baseType + '_sequential' };
          }
        }

        return { candidate: candidates[0], type: baseType };
      };

      // 1. When the export country is known, that country's alias beats orig_variable.
      //    Otherwise orig_variable beats every orig_aliases value. Core beats non-core.
      if (varId) {
        const vidLow = varId.toLowerCase();
        const country = context && context.country ? String(context.country).toLowerCase() : "";

        if (country) {
          let countryHit = null;
          for (const v of this.variables) {
            const alias = v.orig_aliases && v.orig_aliases[country];
            if (alias == null || alias === "") continue;
            if (String(alias).toLowerCase() !== vidLow) continue;
            if (!countryHit || (v.is_core !== false && countryHit.is_core === false)) {
              countryHit = v;
            }
          }
          if (countryHit) {
            canonical = countryHit;
            matchType = 'country_alias';
          }
        }

        if (!canonical) {
          let exactOrig = null;
          let aliasMatch = null;

          // With a country known, a variable whose alias for that country is another ID
          // does not match this ID through orig_variable, its clean name or another country's alias.
          const blocked = v => {
            const own = country && v.orig_aliases && v.orig_aliases[country];
            return own != null && own !== "" && String(own).toLowerCase() !== vidLow;
          };

          for (const v of this.variables) {
            if (blocked(v)) continue;
            if (v.orig_variable && v.orig_variable.toLowerCase() === vidLow) {
              if (!exactOrig || (v.is_core !== false && exactOrig.is_core === false)) {
                exactOrig = v;
              }
            }
            for (const alias of Object.values(v.orig_aliases || {})) {
              if (!alias) continue;
              if (String(alias).toLowerCase() === vidLow) {
                if (!aliasMatch || (v.is_core !== false && aliasMatch.is_core === false)) {
                  aliasMatch = v;
                }
              }
            }
          }

          if (exactOrig) {
            canonical = exactOrig;
            matchType = 'id_exact';
          } else if (aliasMatch) {
            canonical = aliasMatch;
            matchType = 'country_alias';
          } else if (this.byCleanVar.has(vidLow) && !blocked(this.byCleanVar.get(vidLow))) {
            canonical = this.byCleanVar.get(vidLow);
            matchType = 'clean_name_exact';
          }
        }
      }

      // 1b. A country-language header (no ID tag) matched by its full text.
      if (!canonical) {
        const hkey = normKey(headerStr);
        if (this.byHeaderAlias.has(hkey)) {
          const res = selectCandidate(this.byHeaderAlias.get(hkey), 'country_header');
          if (res) {
            canonical = res.candidate;
            matchType = res.type;
          }
        }
      }

      // 2a. A header whose own text (stem: item) is a dictionary stem beats a match on the part
      //     before the last colon. A cleaned export writes the stem of such variables this way.
      if (!canonical && text && normKey(text) !== normKey(stem) && this.byStemKey.has(normKey(text))) {
        const res = selectCandidate(this.byStemKey.get(normKey(text)), 'question_text_exact');
        if (res) {
          canonical = res.candidate;
          matchType = res.type;
        }
      }

      // 2. Try match by clean text or itemText
      if (!canonical && itemText) {
        const ikey = normKey(itemText);
        if (this.byItemKey.has(ikey)) {
          const res = selectCandidate(this.byItemKey.get(ikey), 'item_text_exact');
          if (res) {
            canonical = res.candidate;
            matchType = res.type;
          }
        }
      }

      // 3. Try match by stem text
      if (!canonical && stem) {
        const skey = normKey(stem);
        if (this.byStemKey.has(skey)) {
          const res = selectCandidate(this.byStemKey.get(skey), 'stem_text_exact');
          if (res) {
            canonical = res.candidate;
            matchType = res.type;
          }
        }
      }

      // 4. Try match by whole text against question_stem
      if (!canonical && text) {
        const tkey = normKey(text);
        if (this.byStemKey.has(tkey)) {
          const res = selectCandidate(this.byStemKey.get(tkey), 'question_text_exact');
          if (res) {
            canonical = res.candidate;
            matchType = res.type;
          }
        }
      }

      // 5. A cleaned export writes the stem with [country] replaced by the survey country.
      if (!canonical && context && context.countryName && text) {
        const hits = this.countryTextIndex(context.countryName).get(normKey(text));
        const res = selectCandidate(hits, 'country_text_exact');
        if (res) {
          canonical = res.candidate;
          matchType = res.type;
        }
      }

      return {
        colIndex,
        rawHeader: headerStr,
        cleanedText: text,
        extractedId: varId,
        stem,
        itemText,
        isMatrix,
        canonical,
        matchType
      };
    }

    /**
     * Audit raw sheet rows from SheetJS
     * @param {Array<Array<any>>} rows - 2D array of spreadsheet cell values
     * @param {{country?: string}} [options] - country replaces detection from the sheet
     */
    auditSheet(rows, options) {
      if (!rows || rows.length < 2) {
        throw new Error("Invalid spreadsheet format: expected at least header and metadata rows.");
      }

      const layout = detectExportLayout(rows);
      const surveyCountry = resolveCountry(rows, options);
      const country = surveyCountry.name ? countryKey(surveyCountry.name) : null;
      const isEu = layout.format === "eusurvey";

      const metadata = {
        alias: isEu && aliasCell(rows) ? String(aliasCell(rows)) : "",
        exportDate: isEu && rows[1] && rows[1][1] ? String(rows[1][1]) : "",
        country: surveyCountry.name || null,
        countrySource: surveyCountry.source || null,
        totalRows: rows.length,
        dataRowCount: Math.max(0, rows.length - layout.dataStartIndex),
        exportFormat: layout.format
      };

      const headerRow = rows[layout.headerRowIndex] || [];
      const dataRows = rows.slice(layout.dataStartIndex);

      const columns = [];
      const matchedVars = new Set();
      let prevCanonical = null;

      for (let colIdx = 0; colIdx < headerRow.length; colIdx++) {
        const rawHeader = headerRow[colIdx];
        if (rawHeader == null && dataRows.every(r => r[colIdx] == null)) {
          continue; // Skip trailing empty columns
        }

        const context = { matchedVars, prevCanonical, country, countryName: surveyCountry.name };
        const headerInfo = this.matchVariable(rawHeader, colIdx, context);

        if (headerInfo.canonical && headerInfo.canonical.variable) {
          matchedVars.add(headerInfo.canonical.variable);
          prevCanonical = headerInfo.canonical;
        }

        // Collect observed values for this column
        const observedCounts = new Map();
        const observedIds = new Map();
        let nonNullCount = 0;

        const splitMulti = isMultiSelectHeader(headerInfo.extractedId);
        for (const row of dataRows) {
          const val = row ? row[colIdx] : null;
          if (val == null || val === "") continue;
          for (const observed of labelsFromCell(val, splitMulti)) {
            nonNullCount++;
            observedCounts.set(observed.key, (observedCounts.get(observed.key) || 0) + 1);
            if (observed.answerId) {
              observedIds.set(observed.key, observed.answerId);
            }
          }
        }

        const columnAudit = this.evaluateColumn(headerInfo, observedCounts, observedIds, nonNullCount, dataRows.length);
        columns.push(columnAudit);
      }

      let idTagFound = false;
      for (const col of columns) {
        if (col.extractedId) idTagFound = true;
        if (col.observedValues && col.observedValues.some(v => v.answerId)) idTagFound = true;
      }
      if (layout.format === "qualtrics") {
        metadata.detectedFormat = "qualtrics";
        metadata.formatLabel = "Qualtrics export (import IDs in header row)";
      } else {
        metadata.detectedFormat = idTagFound ? 'id_tagged' : 'plain_text';
        metadata.formatLabel = idTagFound
          ? 'Platform Export with Raw IDs (Automatically Cleaned)'
          : 'Standard Clean Question Export';
      }

      // Compute Core survey coverage metrics
      const dictVars = this.dictionary.variables || [];
      const coreDictVars = dictVars.filter(v => v.is_core !== false);
      const matchedCoreVars = new Set();
      const matchedAllVars = new Set();

      for (const col of columns) {
        if (col.canonical) {
          matchedAllVars.add(col.canonical.variable);
          if (col.canonical.is_core !== false) {
            matchedCoreVars.add(col.canonical.variable);
          }
        }
      }

      const missingCoreVars = coreDictVars.filter(v => !matchedCoreVars.has(v.variable));
      const nonCoreColumns = columns.filter(c => c.canonical && c.canonical.is_core === false);
      const unmappedColumns = columns.filter(c => !c.canonical);
      const extraColumns = columns.filter(c => !c.canonical || c.canonical.is_core === false);

      const totalCore = coreDictVars.length;
      const coveredCoreCount = matchedCoreVars.size;
      const missingCoreCount = missingCoreVars.length;
      const coveredCorePct = totalCore > 0 ? ((coveredCoreCount / totalCore) * 100).toFixed(1) : '0.0';
      const missingCorePct = totalCore > 0 ? ((missingCoreCount / totalCore) * 100).toFixed(1) : '0.0';

      const totalUploaded = columns.length;
      const extraCount = extraColumns.length;
      const extraPct = totalUploaded > 0 ? ((extraCount / totalUploaded) * 100).toFixed(1) : '0.0';

      const coverageSummary = {
        totalCore,
        coveredCoreCount,
        coveredCorePct,
        missingCoreCount,
        missingCorePct,
        nonCoreCount: nonCoreColumns.length,
        unmappedCount: unmappedColumns.length,
        missingCoreVars: missingCoreVars.map(v => ({
          variable: v.variable,
          orig_variable: v.orig_variable,
          section: v.section,
          stem: v.question_stem,
          item_text: v.item_text
        })),
        totalUploaded,
        extraCount,
        extraPct,
        extraColumns: extraColumns.map(c => ({
          colIndex: c.colIndex,
          rawHeader: c.rawHeader,
          cleanedText: c.cleanedText,
          extractedId: c.extractedId,
          isNonCore: Boolean(c.canonical && c.canonical.is_core === false)
        }))
      };

      // Compute summary metrics
      const summary = {
        totalColumns: columns.length,
        fullyIdentified: columns.filter(c => c.status === 'fully_identified').length,
        incomplete: columns.filter(c => c.status === 'incomplete').length,
        missingOptions: columns.filter(c => c.status === 'missing_options').length,
        openEnded: columns.filter(c => c.status === 'open_ended').length,
        totalIssues: columns.filter(c => c.status === 'incomplete' || c.status === 'missing_options').length,
        coverage: coverageSummary,
        metadata
      };

      return {
        summary,
        columns
      };
    }

    /**
     * Evaluate single column against master dictionary
     */
    evaluateColumn(headerInfo, observedCounts, observedIds, nonNullCount, totalRespondents = 0) {
      let canonical = headerInfo.canonical;
      const extractedId = headerInfo.extractedId;
      const skippedCount = Math.max(0, totalRespondents - nonNullCount);
      const skippedPct = totalRespondents > 0 ? ((skippedCount / totalRespondents) * 100).toFixed(1) : '0.0';

      // If extractedId is ID426 and not yet matched, try stem match to mhls01
      if (!canonical && extractedId === 'ID426') {
        const mhls = this.byCleanVar.get('mhls01');
        if (mhls) {
          canonical = mhls;
          headerInfo.canonical = mhls;
          headerInfo.matchType = 'matrix_stem_alias';
        }
      }

      // Check if genuinely open-ended / free-text variable (no discrete canonical options)
      if (canonical) {
        const isOpenEndedText = (
          canonical.scale === 'text' ||
          canonical.question_type === 'text'
        ) && (!canonical.options || canonical.options.length === 0);

        if (isOpenEndedText) {
          return {
            ...headerInfo,
            status: 'open_ended',
            statusIcon: '⚪',
            statusLabel: 'Open-Ended / Free Text',
            totalRespondents,
            validCount: nonNullCount,
            skippedCount,
            skippedPct,
            observedCount: nonNullCount,
            observedValues: Array.from(observedCounts.entries()).map(([label, count]) => ({
              label,
              count,
              answerId: observedIds.get(label) || null
            })),
            canonicalOptions: [],
            mappedOptions: [],
            unmappedObserved: [],
            unobservedCanonical: [],
            issues: []
          };
        }
      }

      // Check for Missing Options (no canonical match or canonical options empty)
      if (!canonical || !canonical.options || canonical.options.length === 0) {
        const issues = [];
        if (!canonical) {
          issues.push({ type: 'unmatched', message: 'Column not found in master specification' });
        } else {
          issues.push({ type: 'no_options', message: 'No canonical options defined in master specification' });
        }

        return {
          ...headerInfo,
          status: 'missing_options',
          statusIcon: '🔴',
          statusLabel: 'Missing Options',
          totalRespondents,
          validCount: nonNullCount,
          skippedCount,
          skippedPct,
          observedCount: nonNullCount,
          observedValues: Array.from(observedCounts.entries()).map(([label, count]) => ({
            label,
            count,
            answerId: observedIds.get(label) || null
          })),
          canonicalOptions: canonical ? canonical.options : [],
          mappedOptions: [],
          unmappedObserved: Array.from(observedCounts.keys()),
          unobservedCanonical: [],
          issues
        };
      }

      // We have canonical options: compare observed vs canonical
      const canonicalOpts = canonical.options || [];
      const mappedOptions = [];
      const unmappedObserved = [];
      const observedMatchedSet = new Set();
      const issues = [];

      const matcher = buildOptionMatcher(canonical);

      // Check observed responses
      for (const [obsLabel, count] of observedCounts.entries()) {
        const obsId = observedIds.get(obsLabel);

        const found = matcher.match(obsLabel, obsId);
        const matchedOpt = found ? found.option : null;
        const matchReason = found ? found.reason : null;

        if (matchedOpt) {
          observedMatchedSet.add(matchedOpt);
          mappedOptions.push({
            observedLabel: obsLabel,
            observedId: obsId,
            count,
            canonicalOption: matchedOpt,
            matchReason
          });
        } else {
          unmappedObserved.push({
            label: obsLabel,
            count,
            answerId: obsId
          });
          issues.push({
            type: 'unmapped_value',
            message: `Observed value "${obsLabel}" (${count} response${count > 1 ? 's' : ''}) is not in master specification`
          });
        }
      }

      // Check unobserved canonical options
      const unobservedCanonical = canonicalOpts.filter(o => !observedMatchedSet.has(o));

      // Determine status: fully_identified vs incomplete
      let status = 'fully_identified';
      let statusIcon = '🟢';
      let statusLabel = 'Fully Identified';

      const isOptionsComplete = canonical.options_complete === true || canonical.options_complete === 'true';

      if (!isOptionsComplete) {
        status = 'incomplete';
        statusIcon = '🟡';
        statusLabel = 'Observed Only / Incomplete';
        issues.push({
          type: 'incomplete_definition',
          message: 'Canonical option list is inferred from test responses or parallel scale'
        });
      }

      if (unmappedObserved.length > 0 && status === 'fully_identified') {
        // If there are unmapped observed values in a supposedly complete variable, flag as incomplete/discrepancy
        status = 'incomplete';
        statusIcon = '🟡';
        statusLabel = 'Observed Only / Incomplete';
      }

      return {
        ...headerInfo,
        status,
        statusIcon,
        statusLabel,
        totalRespondents,
        validCount: nonNullCount,
        skippedCount,
        skippedPct,
        observedCount: nonNullCount,
        observedValues: Array.from(observedCounts.entries()).map(([label, count]) => ({
          label,
          count,
          answerId: observedIds.get(label) || null
        })),
        canonicalOptions: canonicalOpts,
        mappedOptions,
        unmappedObserved,
        unobservedCanonical,
        issues
      };
    }
  }

  SurveyAuditor.cleanExportRows = cleanExportRows;
  SurveyAuditor.detectExportLayout = detectExportLayout;
  SurveyAuditor.detectSurveyCountry = detectSurveyCountry;
  SurveyAuditor.scrambleExportSample = scrambleExportSample;

  return SurveyAuditor;
}));
