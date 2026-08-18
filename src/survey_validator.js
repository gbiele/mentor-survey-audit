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
    { code: 999, regex: /(prefer not to (answer|say|respond|tell)|would rather not (answer|say)|keine angabe)/i }
  ];

  const MATRIX_TITLE_VARS = new Set(["ID426"]);

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
   * Parse header string: "Question text (var_id)" -> { text, varId }
   */
  function parseHeader(headerStr) {
    const raw = norm(headerStr);
    const m = raw.match(/^(.*)\s+\(([A-Za-z0-9_.-]{1,32})\)\s*$/);
    if (m) {
      return { text: norm(m[1]), varId: norm(m[2]) };
    }
    return { text: raw, varId: "" };
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
   * Parse cell answer: "Girl (ID3)" -> { label: "Girl", answerId: "ID3" }
   */
  function parseAnswer(cellVal) {
    if (cellVal == null) return { label: "", answerId: null, raw: "" };
    const s = norm(cellVal);
    if (!s) return { label: "", answerId: null, raw: "" };
    const m = s.match(/^(.*)\s+\((ID\d+)\)\s*$/);
    if (m) {
      return { label: norm(m[1]), answerId: m[2], raw: s };
    }
    return { label: s, answerId: null, raw: s };
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

      const vars = this.dictionary.variables || [];
      for (const v of vars) {
        if (v.variable) this.byCleanVar.set(v.variable.toLowerCase(), v);
        if (v.orig_variable) this.byOrigVar.set(v.orig_variable.toLowerCase(), v);

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

      // 1. Try match by extracted varId
      if (varId) {
        const vidLow = varId.toLowerCase();
        if (this.byOrigVar.has(vidLow)) {
          canonical = this.byOrigVar.get(vidLow);
          matchType = 'id_exact';
        } else if (this.byCleanVar.has(vidLow)) {
          canonical = this.byCleanVar.get(vidLow);
          matchType = 'clean_name_exact';
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
      if (!rows || rows.length < 4) {
        throw new Error("Invalid spreadsheet format: expected at least header and metadata rows.");
      }

      // Metadata in rows 0-2 (e.g. Alias, Export Date)
      const metadata = {
        alias: rows[0] && rows[0][1] ? String(rows[0][1]) : "",
        exportDate: rows[1] && rows[1][1] ? String(rows[1][1]) : "",
        totalRows: rows.length,
        dataRowCount: Math.max(0, rows.length - 4)
      };

      // Header row is index 3
      const headerRow = rows[3] || [];
      const dataRows = rows.slice(4);

      const columns = [];
      const matchedVars = new Set();
      let prevCanonical = null;

      for (let colIdx = 0; colIdx < headerRow.length; colIdx++) {
        const rawHeader = headerRow[colIdx];
        if (rawHeader == null && dataRows.every(r => r[colIdx] == null)) {
          continue; // Skip trailing empty columns
        }

        const context = { matchedVars, prevCanonical };
        const headerInfo = this.matchVariable(rawHeader, colIdx, context);

        if (headerInfo.canonical && headerInfo.canonical.variable) {
          matchedVars.add(headerInfo.canonical.variable);
          prevCanonical = headerInfo.canonical;
        }

        // Collect observed values for this column
        const observedCounts = new Map();
        const observedIds = new Map();
        let nonNullCount = 0;

        for (const row of dataRows) {
          const val = row ? row[colIdx] : null;
          if (val == null) continue;
          const { label, answerId, raw } = parseAnswer(val);
          if (!label && !answerId) continue;

          nonNullCount++;
          const key = label || raw;
          observedCounts.set(key, (observedCounts.get(key) || 0) + 1);
          if (answerId) {
            observedIds.set(key, answerId);
          }
        }

        const columnAudit = this.evaluateColumn(headerInfo, observedCounts, observedIds, nonNullCount, dataRows.length);
        columns.push(columnAudit);
      }

      // Compute summary metrics
      const summary = {
        totalColumns: columns.length,
        fullyIdentified: columns.filter(c => c.status === 'fully_identified').length,
        incomplete: columns.filter(c => c.status === 'incomplete').length,
        missingOptions: columns.filter(c => c.status === 'missing_options').length,
        openEnded: columns.filter(c => c.status === 'open_ended').length,
        totalIssues: columns.filter(c => c.status === 'incomplete' || c.status === 'missing_options').length,
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

      for (const opt of canonicalOpts) {
        if (opt.label) canByLabel.set(normKey(opt.label), opt);
        if (opt.value != null) canByLabel.set(String(opt.value), opt);
        if (opt.eusurvey_answer_id) canById.set(opt.eusurvey_answer_id, opt);
        if (opt.alias) canByAlias.set(normKey(opt.alias), opt);
        if (opt.label_with_id) canByLabel.set(normKey(opt.label_with_id), opt);
      }

      // Check observed responses
      for (const [obsLabel, count] of observedCounts.entries()) {
        const obsId = observedIds.get(obsLabel);
        const obsKey = normKey(obsLabel);

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

  return SurveyAuditor;
}));
