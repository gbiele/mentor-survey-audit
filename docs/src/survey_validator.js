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

  /**
   * Whole Alias cell, after normKey, names the EU Survey country.
   * Accents stay. The cell is not split and is not matched as a substring.
   */
  function countryFromAliasCell(cell) {
    const key = normKey(cell);
    if (key === "spain" || key === "españa" || key === "es") return "spain";
    if (key === "hungary" || key === "hu") return "hungary";
    if (key === "germany" || key === "de" || key === "deutschland") return "germany";
    return null;
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

  function detectExportLayout(rows) {
    const row0 = rows[0] || [];
    let qualtrics = false;
    for (const cell of row0) {
      const v = norm(cell).toLowerCase();
      if (v === "startdate" || v === "responseid" || v === "recordeddate") {
        qualtrics = true;
        break;
      }
    }
    if (qualtrics) {
      return {
        format: "qualtrics",
        headerRowIndex: 0,
        dataStartIndex: 2,
        metadataRows: 2
      };
    }
    return {
      format: "eusurvey",
      headerRowIndex: 3,
      dataStartIndex: 4,
      metadataRows: 4
    };
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
  function cleanExportRows(rows) {
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
      }
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

          for (const v of this.variables) {
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
          } else if (this.byCleanVar.has(vidLow)) {
            canonical = this.byCleanVar.get(vidLow);
            matchType = 'clean_name_exact';
          }
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
     */
    auditSheet(rows) {
      if (!rows || rows.length < 2) {
        throw new Error("Invalid spreadsheet format: expected at least header and metadata rows.");
      }

      const layout = detectExportLayout(rows);
      const country = layout.format === "eusurvey"
        ? countryFromAliasCell(rows[0] && rows[0][1])
        : null;

      const metadata = {
        alias: rows[0] && rows[0][1] ? String(rows[0][1]) : "",
        exportDate: rows[1] && rows[1][1] ? String(rows[1][1]) : "",
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

        const context = { matchedVars, prevCanonical, country };
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

      // Build canonical lookup tables
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

      // Check observed responses
      for (const [obsLabel, count] of observedCounts.entries()) {
        const obsId = observedIds.get(obsLabel);
        const obsKey = matchKey(obsLabel);

        let matchedOpt = null;
        let matchReason = null;

        if (obsId && canById.has(obsId)) {
          matchedOpt = canById.get(obsId);
          matchReason = 'answer_id';
        } else if (canByLabel.has(obsKey)) {
          matchedOpt = canByLabel.get(obsKey);
          matchReason = 'label_exact';
        } else if (canByAlias.has(obsKey)) {
          matchedOpt = canByAlias.get(obsKey);
          matchReason = 'alias';
        } else {
          // Check special code
          const spCode = detectSpecialCode(obsLabel);
          if (spCode) {
            matchedOpt = canonicalOpts.find(o => o.value === spCode);
            if (matchedOpt) matchReason = 'special_code';
          }
        }

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
  SurveyAuditor.scrambleExportSample = scrambleExportSample;

  return SurveyAuditor;
}));
