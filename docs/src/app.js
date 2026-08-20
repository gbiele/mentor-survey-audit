/**
 * JA-MENTOR Youth Survey Option Auditor & Validator
 * Interactive Application Controller
 */

(function () {
  let auditor = null;
  let currentAuditResult = null;
  let activeFilter = 'all';
  let searchQuery = '';
  let expandedRows = new Set();

  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Initialize application once DOM is ready
  document.addEventListener('DOMContentLoaded', async () => {
    initApp();
  });

  async function initApp() {
    try {
      // 1. Initialize Master Dictionary
      let dictData = window.__MASTER_DICTIONARY__;
      if (!dictData) {
        // Fetch local JSON if not pre-embedded
        const res = await fetch('data/master_dictionary.json');
        dictData = await res.json();
      }
      auditor = new SurveyAuditor(dictData);
      console.log('Auditor initialized with canonical dictionary.');

      // 2. Attach Event Handlers
      setupUploadHandlers();
      setupFilterHandlers();
      setupSearchHandler();

      // Check if demo auto-load is requested or if sample data is ready
      if (window.__SAMPLE_DATA_AUTOLOAD__) {
        loadSampleData();
      }
    } catch (err) {
      console.error('Initialization error:', err);
    }
  }

  function setupUploadHandlers() {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');

    if (!dropZone || !fileInput) return;

    dropZone.addEventListener('click', () => fileInput.click());

    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
      dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleFile(e.dataTransfer.files[0]);
      }
    });

    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        handleFile(e.target.files[0]);
      }
    });
  }

  function handleFile(file) {
    if (!file) return;
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: null });

        processAudit(rows, file.name);
      } catch (err) {
        alert('Error reading Excel spreadsheet: ' + err.message);
        console.error(err);
      }
    };

    reader.readAsArrayBuffer(file);
  }

  function processAudit(rows, filename) {
    if (!auditor) return;
    try {
      const result = auditor.auditSheet(rows);
      currentAuditResult = result;
      currentAuditResult.filename = filename || 'Survey_Export.xlsx';
      window.__LAST_AUDIT_RESULT__ = result;

      renderDashboard(result);
    } catch (err) {
      alert('Error during audit processing: ' + err.message);
      console.error(err);
    }
  }

  function renderDashboard(result) {
    const summary = result.summary;

    // Show dashboard containers, hide empty state
    document.getElementById('empty-state-view').style.display = 'none';
    document.getElementById('dashboard-view').style.display = 'block';

    // Update KPI Card Numbers
    document.getElementById('kpi-val-total').textContent = summary.totalColumns;
    document.getElementById('kpi-val-green').textContent = summary.fullyIdentified;
    document.getElementById('kpi-val-yellow').textContent = summary.incomplete;
    document.getElementById('kpi-val-red').textContent = summary.missingOptions;
    document.getElementById('kpi-val-gray').textContent = summary.openEnded;
    document.getElementById('kpi-val-issues').textContent = summary.totalIssues;

    // Update File info badge
    const fileInfo = document.getElementById('loaded-file-info');
    if (fileInfo) {
      const formatStr = summary.metadata && summary.metadata.formatLabel ? ` • 🏷️ ${summary.metadata.formatLabel}` : '';
      fileInfo.textContent = `Audited file: ${result.filename} (${summary.metadata.dataRowCount} respondents, ${summary.totalColumns} variables${formatStr})`;
      fileInfo.style.display = 'inline-block';
    }

    // Update Coverage Summary Table
    if (summary.coverage) {
      updateCoverageSummary(summary.coverage);
    }

    renderTable();
  }

  function updateCoverageSummary(cov) {
    const titleTotal = document.getElementById('cov-dict-total-title');
    if (titleTotal) titleTotal.textContent = cov.totalCore;

    // Row 1: Core Covered
    const covCount = document.getElementById('cov-core-covered-count');
    if (covCount) covCount.textContent = cov.coveredCoreCount;
    const covDenom = document.getElementById('cov-core-total-denom');
    if (covDenom) covDenom.textContent = `/ ${cov.totalCore} core vars`;
    const covPct = document.getElementById('cov-core-covered-pct');
    if (covPct) covPct.textContent = `${cov.coveredCorePct}%`;
    const barCovered = document.getElementById('cov-bar-covered');
    if (barCovered) barCovered.style.width = `${Math.min(100, parseFloat(cov.coveredCorePct))}%`;

    // Row 2: Core Missing
    const missCount = document.getElementById('cov-core-missing-count');
    if (missCount) missCount.textContent = cov.missingCoreCount;
    const missDenom = document.getElementById('cov-core-missing-denom');
    if (missDenom) missDenom.textContent = `/ ${cov.totalCore} core vars`;
    const missPct = document.getElementById('cov-core-missing-pct');
    if (missPct) missPct.textContent = `${cov.missingCorePct}%`;
    const barMissing = document.getElementById('cov-bar-missing');
    if (barMissing) barMissing.style.width = `${Math.min(100, parseFloat(cov.missingCorePct))}%`;

    // Missing details toggle & list
    const missDetails = document.getElementById('cov-missing-details');
    const missToggleText = document.getElementById('cov-missing-toggle-text');
    const missPillsList = document.getElementById('cov-missing-pills-list');

    const missingScales = groupMissingIntoScales(cov.missingCoreVars || []);
    if (cov.missingCoreCount > 0) {
      if (missDetails) missDetails.style.display = 'block';
      if (missToggleText) missToggleText.textContent = `Show missing scales (${missingScales.length} scales · ${cov.missingCoreCount} items)`;
      if (missPillsList) {
        missPillsList.innerHTML = missingScales.map(s => {
          return `
            <div class="cov-scale-card scale-missing">
              <div class="cov-scale-header">
                <strong>${escapeHtml(s.title)}</strong>
                <span class="cov-scale-badge">${escapeHtml(s.varRange)} · ${s.count} item${s.count > 1 ? 's' : ''}</span>
              </div>
              ${s.stem && s.count > 1 ? `<div class="cov-scale-desc">${escapeHtml(s.stem)}</div>` : ''}
            </div>
          `;
        }).join('');
      }
    } else {
      if (missDetails) missDetails.style.display = 'none';
    }

    // Row 3: Extra columns
    const extraCount = document.getElementById('cov-extra-count');
    if (extraCount) extraCount.textContent = cov.extraCount;
    const extraDenom = document.getElementById('cov-extra-denom');
    if (extraDenom) extraDenom.textContent = `/ ${cov.totalUploaded} upload cols`;
    const extraPct = document.getElementById('cov-extra-pct');
    if (extraPct) extraPct.textContent = `${cov.extraPct}%`;
    const barExtra = document.getElementById('cov-bar-extra');
    if (barExtra) barExtra.style.width = `${Math.min(100, parseFloat(cov.extraPct))}%`;

    // Extra details toggle & list
    const extraDetails = document.getElementById('cov-extra-details');
    const extraToggleText = document.getElementById('cov-extra-toggle-text');
    const extraPillsList = document.getElementById('cov-extra-pills-list');

    const extraScales = groupExtraIntoScales(cov.extraColumns || []);
    if (cov.extraCount > 0) {
      if (extraDetails) extraDetails.style.display = 'block';
      if (extraToggleText) extraToggleText.textContent = `Show extra scales (${extraScales.length} scales · ${cov.extraCount} items)`;
      if (extraPillsList) {
        extraPillsList.innerHTML = extraScales.map(s => {
          return `
            <div class="cov-scale-card scale-extra">
              <div class="cov-scale-header">
                <strong>${escapeHtml(s.title)}</strong>
                <span class="cov-scale-badge">${escapeHtml(s.colRange)} · ${s.count} item${s.count > 1 ? 's' : ''}</span>
              </div>
            </div>
          `;
        }).join('');
      }
    } else {
      if (extraDetails) extraDetails.style.display = 'none';
    }

    // Overall Badge
    const overallBadge = document.getElementById('coverage-overall-badge');
    if (overallBadge) {
      if (cov.missingCoreCount === 0) {
        overallBadge.textContent = '🟢 100% Core Coverage';
        overallBadge.style.background = 'rgba(16, 185, 129, 0.1)';
        overallBadge.style.color = '#059669';
        overallBadge.style.borderColor = 'rgba(16, 185, 129, 0.25)';
      } else {
        overallBadge.textContent = `⚠️ ${cov.coveredCorePct}% Core Coverage (${cov.missingCoreCount} Missing)`;
        overallBadge.style.background = 'rgba(239, 68, 68, 0.1)';
        overallBadge.style.color = '#dc2626';
        overallBadge.style.borderColor = 'rgba(239, 68, 68, 0.25)';
      }
    }
  }

  function groupMissingIntoScales(missingVars) {
    const scaleGroups = [];
    let currentGroup = null;

    for (const v of missingVars) {
      const prefix = v.variable.replace(/\d+$/, '');
      const stem = (v.stem || '').trim();
      const section = v.section || 'General';

      if (currentGroup && currentGroup.prefix === prefix && currentGroup.stem === stem && currentGroup.section === section) {
        currentGroup.items.push(v);
      } else {
        if (currentGroup) scaleGroups.push(currentGroup);
        currentGroup = {
          prefix,
          stem,
          section,
          items: [v]
        };
      }
    }
    if (currentGroup) scaleGroups.push(currentGroup);

    return scaleGroups.map(g => {
      const first = g.items[0].orig_variable || g.items[0].variable;
      const last = g.items[g.items.length - 1].orig_variable || g.items[g.items.length - 1].variable;
      const range = g.items.length > 1 ? `${first}–${last}` : first;
      
      let title = g.section;
      if (g.items.length > 1) {
        if (g.stem && g.stem.length < 55) {
          title += ` · ${g.stem}`;
        } else if (g.stem) {
          title += ` · ${g.stem.substring(0, 48)}...`;
        }
      } else {
        const itemLabel = g.items[0].item_text || g.items[0].stem || first;
        title += ` · ${itemLabel.length < 55 ? itemLabel : itemLabel.substring(0, 48) + '...'}`;
      }

      return {
        title,
        section: g.section,
        varRange: range,
        count: g.items.length,
        stem: g.stem,
        items: g.items
      };
    });
  }

  function groupExtraIntoScales(extraCols) {
    const scaleGroups = [];
    let currentGroup = null;

    for (const c of extraCols) {
      let stem = c.cleanedText || c.rawHeader || '';
      if (stem.startsWith('Matrix:')) stem = 'Matrix Scale';
      else if (stem.includes(':')) stem = stem.split(':')[0].trim();
      
      const isConsecutive = currentGroup && (c.colIndex === currentGroup.lastColIndex + 1);

      if (currentGroup && isConsecutive && currentGroup.stem === stem) {
        currentGroup.columns.push(c);
        currentGroup.lastColIndex = c.colIndex;
      } else {
        if (currentGroup) scaleGroups.push(currentGroup);
        currentGroup = {
          stem,
          firstColIndex: c.colIndex,
          lastColIndex: c.colIndex,
          columns: [c]
        };
      }
    }
    if (currentGroup) scaleGroups.push(currentGroup);

    return scaleGroups.map(g => {
      const firstCol = g.firstColIndex + 1;
      const lastCol = g.lastColIndex + 1;
      const colRange = g.columns.length > 1 ? `Cols ${firstCol}–${lastCol}` : `Col ${firstCol}`;
      const firstId = g.columns[0].extractedId;
      const lastId = g.columns[g.columns.length - 1].extractedId;
      const idRange = (firstId && lastId && g.columns.length > 1) ? ` (${firstId}–${lastId})` : (firstId ? ` (${firstId})` : '');

      let title = g.stem;
      if (title.length > 55) {
        title = title.substring(0, 50) + '...';
      }

      return {
        title: title || 'Additional Survey Questions',
        colRange: colRange + idRange,
        count: g.columns.length,
        columns: g.columns
      };
    });
  }

  // Global helper for toggling coverage pills
  window.toggleCoveragePills = function(type) {
    const list = document.getElementById(type === 'missing' ? 'cov-missing-pills-list' : 'cov-extra-pills-list');
    const toggleText = document.getElementById(type === 'missing' ? 'cov-missing-toggle-text' : 'cov-extra-toggle-text');
    if (!list) return;
    const isHidden = list.style.display === 'none';
    list.style.display = isHidden ? 'flex' : 'none';
    if (toggleText) {
      const currentText = toggleText.textContent.replace(/ [▾▴]$/, '');
      toggleText.textContent = `${currentText} ${isHidden ? '▴' : '▾'}`;
    }
  };

  function setupFilterHandlers() {
    const kpiCards = document.querySelectorAll('.kpi-card');
    kpiCards.forEach(card => {
      card.addEventListener('click', () => {
        const filter = card.getAttribute('data-filter');
        setFilter(filter);
      });
    });

    const pillBtns = document.querySelectorAll('.pill-btn');
    pillBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const filter = btn.getAttribute('data-filter');
        setFilter(filter);
      });
    });
  }

  function setFilter(filter) {
    activeFilter = filter || 'all';

    // Update KPI cards active class
    document.querySelectorAll('.kpi-card').forEach(c => {
      c.classList.toggle('active', c.getAttribute('data-filter') === activeFilter);
    });

    // Update pill buttons active class
    document.querySelectorAll('.pill-btn').forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-filter') === activeFilter);
    });

    renderTable();
  }

  function setupSearchHandler() {
    const searchInput = document.getElementById('search-input');
    if (!searchInput) return;

    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value.toLowerCase().trim();
      renderTable();
    });
  }

  let expandedMatrixGroups = new Set();

  function getSubscalePrefix(varName) {
    if (!varName) return '';
    // Strip trailing digits: bcfpi_coop1 -> bcfpi_coop, bcfpi_af6 -> bcfpi_af, igd5 -> igd
    const m = varName.match(/^([a-zA-Z_]+?)\d+$/);
    return m ? m[1] : varName;
  }

  function buildTableGroups(columns) {
    const groups = [];
    let currentMatrix = null;

    for (let i = 0; i < columns.length; i++) {
      const col = columns[i];
      const can = col.canonical;

      // Rule: Matrix grouping only applies when canonical is non-null
      // and items share the same subscale variable prefix AND the same question stem
      const stem = can && can.question_stem ? can.question_stem.trim() : null;
      const prefix = can ? getSubscalePrefix(can.variable) : null;
      const isMatrixType = can && (
        can.question_type === 'matrix' ||
        can.scale === 'Likert' ||
        can.scale === 'matrix' ||
        (stem && stem.length > 20)
      );

      if (can && stem && prefix && isMatrixType) {
        if (currentMatrix && currentMatrix.stem === stem && currentMatrix.prefix === prefix && currentMatrix.section === can.section) {
          currentMatrix.columns.push(col);
          continue;
        } else {
          if (currentMatrix) {
            finalizeGroup(currentMatrix, groups);
          }
          currentMatrix = {
            type: 'matrix_candidate',
            stem: stem,
            prefix: prefix,
            section: can.section || 'General',
            scale: can.scale || 'Likert',
            columns: [col]
          };
          continue;
        }
      }

      if (currentMatrix) {
        finalizeGroup(currentMatrix, groups);
        currentMatrix = null;
      }

      // Standalone single item (including unmapped columns)
      groups.push({
        type: 'single',
        column: col
      });
    }

    if (currentMatrix) {
      finalizeGroup(currentMatrix, groups);
    }

    return groups;
  }

  function finalizeGroup(cand, groups) {
    if (cand.columns.length >= 2) {
      let groupStatus = 'fully_identified';
      let groupStatusIcon = '🟢';
      let groupStatusLabel = 'Fully Identified';

      if (cand.columns.some(c => c.status === 'missing_options')) {
        groupStatus = 'missing_options';
        groupStatusIcon = '🔴';
        groupStatusLabel = 'Missing Options';
      } else if (cand.columns.some(c => c.status === 'incomplete')) {
        groupStatus = 'incomplete';
        groupStatusIcon = '🟡';
        groupStatusLabel = 'Incomplete / Inferred';
      }

      const firstVar = cand.columns[0].canonical ? cand.columns[0].canonical.variable : `col_${cand.columns[0].colIndex}`;
      const lastVar = cand.columns[cand.columns.length - 1].canonical ? cand.columns[cand.columns.length - 1].canonical.variable : `col_${cand.columns[cand.columns.length - 1].colIndex}`;

      groups.push({
        type: 'matrix',
        groupId: `matrix_${firstVar}_${lastVar}`,
        stem: cand.stem,
        section: cand.section,
        scale: cand.scale,
        varRange: `${firstVar} – ${lastVar}`,
        firstColIndex: cand.columns[0].colIndex,
        lastColIndex: cand.columns[cand.columns.length - 1].colIndex,
        itemCount: cand.columns.length,
        status: groupStatus,
        statusIcon: groupStatusIcon,
        statusLabel: groupStatusLabel,
        columns: cand.columns
      });
    } else {
      cand.columns.forEach(col => {
        groups.push({
          type: 'single',
          column: col
        });
      });
    }
  }

  function getFilteredColumns() {
    if (!currentAuditResult) return [];

    let cols = currentAuditResult.columns;

    // Apply status filter
    if (activeFilter === 'fully_identified') {
      cols = cols.filter(c => c.status === 'fully_identified');
    } else if (activeFilter === 'incomplete') {
      cols = cols.filter(c => c.status === 'incomplete');
    } else if (activeFilter === 'missing_options') {
      cols = cols.filter(c => c.status === 'missing_options');
    } else if (activeFilter === 'open_ended') {
      cols = cols.filter(c => c.status === 'open_ended');
    } else if (activeFilter === 'issues') {
      cols = cols.filter(c => c.status === 'incomplete' || c.status === 'missing_options');
    }

    // Apply search query
    if (searchQuery) {
      cols = cols.filter(c => {
        const rawH = (c.rawHeader || '').toLowerCase();
        const cleanT = (c.cleanedText || '').toLowerCase();
        const varId = (c.extractedId || '').toLowerCase();
        const canVar = (c.canonical && c.canonical.variable ? c.canonical.variable : '').toLowerCase();
        const origVar = (c.canonical && c.canonical.orig_variable ? c.canonical.orig_variable : '').toLowerCase();
        const section = (c.canonical && c.canonical.section ? c.canonical.section : '').toLowerCase();
        const stem = (c.canonical && c.canonical.question_stem ? c.canonical.question_stem : '').toLowerCase();
        const item = (c.canonical && c.canonical.item_text ? c.canonical.item_text : '').toLowerCase();
        const status = c.statusLabel.toLowerCase();

        return rawH.includes(searchQuery) ||
               cleanT.includes(searchQuery) ||
               varId.includes(searchQuery) ||
               canVar.includes(searchQuery) ||
               origVar.includes(searchQuery) ||
               section.includes(searchQuery) ||
               stem.includes(searchQuery) ||
               item.includes(searchQuery) ||
               status.includes(searchQuery);
      });
    }

    return cols;
  }

  function renderTable() {
    const tbody = document.getElementById('audit-table-body');
    const countLabel = document.getElementById('table-count-label');
    if (!tbody) return;

    const filteredCols = getFilteredColumns();
    const tableGroups = buildTableGroups(filteredCols);

    if (countLabel) {
      countLabel.textContent = `Showing ${filteredCols.length} variables (${tableGroups.length} table blocks)`;
    }

    tbody.innerHTML = '';

    if (tableGroups.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 2.5rem; color: var(--text-muted);">No variables match the selected filter or search query.</td></tr>`;
      return;
    }

    // If actively searching or filtering by issues, auto-expand relevant matrix groups
    const autoExpand = Boolean(searchQuery || activeFilter === 'issues' || activeFilter === 'incomplete' || activeFilter === 'missing_options');

    tableGroups.forEach(group => {
      if (group.type === 'single') {
        renderSingleRow(tbody, group.column);
      } else if (group.type === 'matrix') {
        const isExpanded = autoExpand || expandedMatrixGroups.has(group.groupId);
        renderMatrixGroup(tbody, group, isExpanded);
      }
    });

    attachTableEventHandlers();
  }

  function renderSingleRow(tbody, col) {
    const isExpanded = expandedRows.has(col.colIndex);
    const tr = document.createElement('tr');
    if (isExpanded) tr.classList.add('expanded-row-parent');

    const varName = col.canonical ? col.canonical.variable : (col.extractedId || `col_${col.colIndex}`);
    const origVar = col.canonical ? col.canonical.orig_variable : (col.extractedId || '-');
    const section = col.canonical ? col.canonical.section : 'Uncategorized';
    const scaleType = col.canonical ? `${col.canonical.scale} (${col.canonical.question_type})` : 'Unknown';

    let statusBadgeClass = 'badge-green';
    if (col.status === 'incomplete') statusBadgeClass = 'badge-yellow';
    else if (col.status === 'missing_options') statusBadgeClass = 'badge-red';
    else if (col.status === 'open_ended') statusBadgeClass = 'badge-gray';

    const nCan = col.canonicalOptions ? col.canonicalOptions.length : 0;
    const nObs = col.observedValues ? col.observedValues.length : 0;

    tr.innerHTML = `
      <td style="color: var(--text-muted); font-size: 0.8rem; width: 45px;">${col.colIndex + 1}</td>
      <td>
        <span class="status-badge ${statusBadgeClass}">${col.statusIcon} ${col.statusLabel}</span>
      </td>
      <td>
        <span class="var-tag">${varName}</span>
        <span class="section-label" style="font-family: var(--font-mono); font-size: 0.725rem; color: var(--text-dim); margin-top: 0.15rem;">orig: ${origVar || '-'}</span>
      </td>
      <td>
        <div style="font-weight: 500; max-width: 380px; line-height: 1.35;">${col.cleanedText || col.rawHeader}</div>
        <span class="section-label" style="margin-top: 0.25rem;">${section}</span>
      </td>
      <td style="font-size: 0.8rem; color: var(--text-muted);">${scaleType}</td>
      <td style="font-size: 0.825rem;">
        <div><strong>${nObs}</strong> observed / <strong>${nCan}</strong> canonical</div>
        ${col.unmappedObserved.length > 0 ? `<div style="color: var(--status-red-text); font-size: 0.75rem; font-weight: 600;">⚠️ ${col.unmappedObserved.length} unmapped</div>` : ''}
      </td>
      <td style="text-align: right; width: 110px;">
        <button class="btn-toggle-row" data-col="${col.colIndex}">
          ${isExpanded ? 'Hide Details' : 'Details'}
        </button>
      </td>
    `;

    tbody.appendChild(tr);

    if (isExpanded) {
      renderDetailsRow(tbody, col);
    }
  }

  function renderMatrixGroup(tbody, group, isExpanded) {
    const tr = document.createElement('tr');
    tr.classList.add('matrix-group-row');

    let statusBadgeClass = 'badge-green';
    if (group.status === 'incomplete') statusBadgeClass = 'badge-yellow';
    else if (group.status === 'missing_options') statusBadgeClass = 'badge-red';

    const colRange = `${group.firstColIndex + 1}–${group.lastColIndex + 1}`;

    tr.innerHTML = `
      <td style="color: #64748b; font-size: 0.8rem; font-weight: 700; width: 55px;">${colRange}</td>
      <td>
        <span class="status-badge ${statusBadgeClass}">${group.statusIcon} ${group.statusLabel}</span>
      </td>
      <td>
        <span class="matrix-range-tag">${group.varRange}</span>
        <div class="matrix-count-badge">📑 ${group.itemCount} items</div>
      </td>
      <td>
        <div style="font-weight: 600; color: #1e293b; max-width: 400px; line-height: 1.35;">${group.stem}</div>
        <span class="section-label" style="margin-top: 0.25rem;">${group.section}</span>
      </td>
      <td style="font-size: 0.8rem; color: var(--text-muted);">${group.scale} (matrix)</td>
      <td style="font-size: 0.825rem; color: #334155;">
        <div><strong>${group.itemCount}</strong> items in scale</div>
      </td>
      <td style="text-align: right; width: 140px;">
        <button class="btn-toggle-matrix ${isExpanded ? 'active' : ''}" data-group="${group.groupId}">
          ${isExpanded ? '▴ Collapse' : `▾ Expand (${group.itemCount})`}
        </button>
      </td>
    `;

    tbody.appendChild(tr);

    // If expanded, render individual child items
    if (isExpanded) {
      group.columns.forEach(childCol => {
        const isChildDetailsExpanded = expandedRows.has(childCol.colIndex);
        const childTr = document.createElement('tr');
        childTr.classList.add('matrix-child-row');
        if (isChildDetailsExpanded) childTr.classList.add('expanded-row-parent');

        const varName = childCol.canonical ? childCol.canonical.variable : (childCol.extractedId || `col_${childCol.colIndex}`);
        const origVar = childCol.canonical ? childCol.canonical.orig_variable : (childCol.extractedId || '-');
        const itemText = childCol.canonical && childCol.canonical.item_text ? childCol.canonical.item_text : (childCol.cleanedText || childCol.rawHeader);

        let childBadgeClass = 'badge-green';
        if (childCol.status === 'incomplete') childBadgeClass = 'badge-yellow';
        else if (childCol.status === 'missing_options') childBadgeClass = 'badge-red';
        else if (childCol.status === 'open_ended') childBadgeClass = 'badge-gray';

        const nCan = childCol.canonicalOptions ? childCol.canonicalOptions.length : 0;
        const nObs = childCol.observedValues ? childCol.observedValues.length : 0;

        childTr.innerHTML = `
          <td style="font-size: 0.775rem;">${childCol.colIndex + 1}</td>
          <td>
            <span class="status-badge ${childBadgeClass}" style="font-size: 0.725rem; padding: 0.15rem 0.5rem;">${childCol.statusIcon} ${childCol.statusLabel}</span>
          </td>
          <td>
            <span class="var-tag" style="font-size: 0.775rem;">${varName}</span>
            <span class="section-label" style="font-family: var(--font-mono); font-size: 0.7rem; color: var(--text-dim);">orig: ${origVar || '-'}</span>
          </td>
          <td>
            <div style="font-weight: 500; font-size: 0.85rem; max-width: 380px; line-height: 1.3;">${itemText}</div>
          </td>
          <td style="font-size: 0.775rem; color: var(--text-muted);">item</td>
          <td style="font-size: 0.8rem;">
            <div><strong>${nObs}</strong> observed / <strong>${nCan}</strong> canonical</div>
            ${childCol.unmappedObserved.length > 0 ? `<div style="color: var(--status-red-text); font-size: 0.725rem; font-weight: 600;">⚠️ ${childCol.unmappedObserved.length} unmapped</div>` : ''}
          </td>
          <td style="text-align: right;">
            <button class="btn-toggle-row" data-col="${childCol.colIndex}">
              ${isChildDetailsExpanded ? 'Hide Details' : 'Details'}
            </button>
          </td>
        `;

        tbody.appendChild(childTr);

        if (isChildDetailsExpanded) {
          renderDetailsRow(tbody, childCol);
        }
      });
    }
  }

  function renderDetailsRow(tbody, col) {
    const detailTr = document.createElement('tr');
    detailTr.classList.add('details-row');
    detailTr.innerHTML = `
      <td colspan="7">
        <div class="details-panel">
          <div class="details-card">
            <div class="details-title">Canonical Response Specification</div>
            ${renderCanonicalOptions(col)}
          </div>
          <div class="details-card">
            <div class="details-title">Observed Export Values & Audit Issues</div>
            ${renderObservedValuesAndIssues(col)}
          </div>
        </div>
      </td>
    `;
    tbody.appendChild(detailTr);
  }

  function attachTableEventHandlers() {
    // Matrix group toggles
    document.querySelectorAll('.btn-toggle-matrix').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const groupId = e.currentTarget.getAttribute('data-group');
        if (expandedMatrixGroups.has(groupId)) {
          expandedMatrixGroups.delete(groupId);
        } else {
          expandedMatrixGroups.add(groupId);
        }
        renderTable();
      });
    });

    // Row details toggles
    document.querySelectorAll('.btn-toggle-row').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const colIdx = parseInt(e.currentTarget.getAttribute('data-col'), 10);
        if (expandedRows.has(colIdx)) {
          expandedRows.delete(colIdx);
        } else {
          expandedRows.add(colIdx);
        }
        renderTable();
      });
    });
  }

  function renderCanonicalOptions(col) {
    if (!col.canonicalOptions || col.canonicalOptions.length === 0) {
      if (col.status === 'open_ended') {
        return '<p style="color: var(--text-muted); font-size: 0.85rem;">Open-ended continuous/text variable. No discrete categorical options expected.</p>';
      }
      return '<p style="color: var(--status-red-text); font-size: 0.85rem; font-weight: 600;">No canonical options defined in English master specification.</p>';
    }

    let html = '<div class="option-pill-list">';
    col.canonicalOptions.forEach(opt => {
      const isObserved = col.mappedOptions.some(m => m.canonicalOption === opt);
      const pillClass = isObserved ? 'matched' : 'unobserved';
      const codeStr = opt.value != null ? `[${opt.value}] ` : '';
      const specialStr = opt.is_special ? ` (${opt.special_type})` : '';

      html += `<span class="option-pill ${pillClass}">
        ${codeStr}${opt.label}${specialStr}
        ${isObserved ? '✓' : ''}
      </span>`;
    });
    html += '</div>';

    if (col.canonical && col.canonical.notes) {
      html += `<div style="margin-top: 0.75rem; font-size: 0.8rem; color: var(--text-muted); background: var(--bg-subtle); padding: 0.5rem; border-radius: var(--radius-sm);">
        <strong>Specification Note:</strong> ${col.canonical.notes}
      </div>`;
    }

    return html;
  }

  function renderObservedValuesAndIssues(col) {
    let html = '';

    // Show Issues first
    if (col.issues && col.issues.length > 0) {
      col.issues.forEach(iss => {
        const alertClass = col.status === 'missing_options' ? 'alert-red' : 'alert-yellow';
        html += `<div class="issue-alert ${alertClass}">
          <span>⚠️</span>
          <div>${iss.message}</div>
        </div>`;
      });
    }

    // Show Observed responses as frequency bar plot
    if (!col.observedValues || col.observedValues.length === 0) {
      html += '<p style="color: var(--text-muted); font-size: 0.85rem; margin-top: 0.5rem;">No responses observed in uploaded sample dataset (all blank).</p>';
    } else {
      const totalObs = col.validCount != null ? col.validCount : col.observedValues.reduce((sum, o) => sum + o.count, 0);
      const skipped = col.skippedCount != null ? col.skippedCount : 0;
      const skippedPct = col.skippedPct != null ? col.skippedPct : '0.0';
      const validPct = (100 - parseFloat(skippedPct)).toFixed(0);
      const maxCount = Math.max(...col.observedValues.map(o => o.count), 1);

      html += `
        <div class="response-stats-banner">
          <div><strong style="color: var(--status-green-text);">✓ ${totalObs} Valid Responses</strong> (${validPct}%)</div>
          <div style="color: var(--text-dim);">•</div>
          <div style="color: ${skipped > 0 ? 'var(--text-muted)' : 'var(--text-dim)'};">
            <strong>${skipped} Skipped / Unanswered</strong> (${skippedPct}%)
          </div>
        </div>
      `;

      html += `<div style="margin-top: 0.35rem; display: flex; justify-content: space-between; align-items: baseline;">
        <strong style="font-size: 0.825rem; color: var(--text-muted);">Response Distribution across Valid Answers:</strong>
      </div>`;

      html += '<div class="freq-bars-container">';
      col.observedValues.forEach(obs => {
        const isMapped = col.mappedOptions.some(m => m.observedLabel === obs.label);
        const idStr = obs.answerId ? ` <span style="color: var(--text-dim); font-size: 0.75rem;">(${obs.answerId})</span>` : '';
        const totalResp = col.totalRespondents || (totalObs + skipped);
        const pct = totalResp > 0 ? ((obs.count / totalResp) * 100).toFixed(0) : 0;
        const widthPct = Math.max(6, ((obs.count / maxCount) * 100).toFixed(0));
        const statusIcon = isMapped ? '🟢' : '🔴';
        const fillClass = isMapped ? 'fill-green' : 'fill-red';

        html += `
          <div class="freq-bar-row">
            <div class="freq-bar-header">
              <span class="freq-bar-label ${isMapped ? 'matched' : 'unmapped'}" title="${obs.label}">
                <span>${statusIcon}</span>
                <span>${obs.label}${idStr}</span>
              </span>
              <span class="freq-bar-count">
                <strong>${obs.count}</strong> <span class="freq-bar-pct">(${pct}%)</span>
              </span>
            </div>
            <div class="freq-bar-track">
              <div class="freq-bar-fill ${fillClass}" style="width: ${widthPct}%;"></div>
            </div>
          </div>
        `;
      });

      // Render Missing / Skipped Data row in red
      if (skipped > 0) {
        const skippedWidthPct = Math.max(6, ((skipped / maxCount) * 100).toFixed(0));
        html += `
          <div class="freq-bar-row missing-row">
            <div class="freq-bar-header">
              <span class="freq-bar-label missing-label" title="Missing / Skipped data (empty cell)">
                <span>🔴</span>
                <span><em>Missing / Skipped (empty cell)</em></span>
              </span>
              <span class="freq-bar-count">
                <strong style="color: var(--status-red-text);">${skipped}</strong> <span class="freq-bar-pct">(${skippedPct}%)</span>
              </span>
            </div>
            <div class="freq-bar-track">
              <div class="freq-bar-fill fill-missing" style="width: ${skippedWidthPct}%;"></div>
            </div>
          </div>
        `;
      }

      html += '</div>';
    }

    return html;
  }

  // Expose global methods for demo loader & export buttons
  window.SurveyApp = {
    processAudit,
    setFilter,
    loadSampleData: () => {
      if (typeof window.loadBundledSample === 'function') {
        window.loadBundledSample();
      }
    }
  };

})();
