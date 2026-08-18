/**
 * MENTOR Survey Option Auditor & Validator
 * Interactive Application Controller
 */

(function () {
  let auditor = null;
  let currentAuditResult = null;
  let activeFilter = 'all';
  let searchQuery = '';
  let expandedRows = new Set();

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
        const res = await fetch('src/master_dictionary.json');
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
      fileInfo.textContent = `Audited file: ${result.filename} (${summary.metadata.dataRowCount} respondents, ${summary.totalColumns} variables)`;
      fileInfo.style.display = 'inline-block';
    }

    renderTable();
  }

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
        const section = (c.canonical && c.canonical.section ? c.canonical.section : '').toLowerCase();
        const status = c.statusLabel.toLowerCase();

        return rawH.includes(searchQuery) ||
               cleanT.includes(searchQuery) ||
               varId.includes(searchQuery) ||
               canVar.includes(searchQuery) ||
               section.includes(searchQuery) ||
               status.includes(searchQuery);
      });
    }

    return cols;
  }

  function renderTable() {
    const tbody = document.getElementById('audit-table-body');
    const countLabel = document.getElementById('table-count-label');
    if (!tbody) return;

    const cols = getFilteredColumns();
    if (countLabel) {
      countLabel.textContent = `Showing ${cols.length} of ${currentAuditResult.columns.length} variables`;
    }

    tbody.innerHTML = '';

    if (cols.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 2.5rem; color: var(--text-muted);">No variables match the selected filter or search query.</td></tr>`;
      return;
    }

    cols.forEach((col, idx) => {
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
        <td style="color: var(--text-muted); font-size: 0.8rem; width: 40px;">${col.colIndex + 1}</td>
        <td>
          <span class="status-badge ${statusBadgeClass}">${col.statusIcon} ${col.statusLabel}</span>
        </td>
        <td>
          <span class="var-tag">${varName}</span>
          <span class="section-label">${origVar !== varName && origVar !== '-' ? origVar : ''}</span>
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
        <td style="text-align: right; width: 100px;">
          <button class="btn-toggle-row" data-col="${col.colIndex}">
            ${isExpanded ? 'Hide Details' : 'Details'}
          </button>
        </td>
      `;

      tbody.appendChild(tr);

      // Render Expanded Details Row if active
      if (isExpanded) {
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
    });

    // Attach row toggle handlers
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

    // Show Observed responses
    if (!col.observedValues || col.observedValues.length === 0) {
      html += '<p style="color: var(--text-muted); font-size: 0.85rem;">No responses observed in uploaded sample dataset (all blank).</p>';
    } else {
      html += '<div style="margin-top: 0.5rem;"><strong style="font-size: 0.8rem; color: var(--text-muted);">Observed in Survey:</strong></div>';
      html += '<div class="option-pill-list" style="margin-top: 0.35rem;">';
      col.observedValues.forEach(obs => {
        const isMapped = col.mappedOptions.some(m => m.observedLabel === obs.label);
        const pillClass = isMapped ? 'matched' : 'unmapped';
        const idStr = obs.answerId ? ` (${obs.answerId})` : '';

        html += `<span class="option-pill ${pillClass}">
          ${obs.label}${idStr} × ${obs.count}
        </span>`;
      });
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
