/**
 * Vijayawada Utsav 2026 – Dashboard Application Logic
 * Implements:
 * - Edge serverless live polling (every 60s + on focus)
 * - LocalStorage resilience & offline banner
 * - Hash routing (#overview, #gen, #crown, #ww, #participants, #quality)
 * - Chart.js visualizations (single-color crimson, 3-color splits, direct labels)
 * - Searchable & sortable participants table with collapsible filters
 * - Participant detail drawer & passcode-protected phone reveal
 * - Persistent status pipeline updates
 * - Data quality drill-down navigation
 * - CSV exporter
 */

(function () {
  'use strict';

  // State
  const state = {
    data: null,
    lastSynced: null,
    isSyncing: false,
    authPasscode: sessionStorage.getItem('vu_passcode') || '',
    isAuthenticated: false,
    activeTab: 'overview',
    filters: {
      search: '',
      form: 'all',
      category: 'all',
      event: 'all',
      gender: 'all',
      location: 'all',
      ageMin: '',
      ageMax: '',
      status: 'all',
      multiOnly: false,
      needsFollowUpOnly: false
    },
    charts: {}
  };

  // DOM Elements
  const el = {
    syncDot: document.getElementById('sync-dot'),
    syncText: document.getElementById('sync-text'),
    btnRefresh: document.getElementById('btn-refresh'),
    btnAuth: document.getElementById('btn-auth'),
    warningBanner: document.getElementById('warning-banner'),
    warningText: document.getElementById('warning-text'),
    navLinks: document.querySelectorAll('.nav-link'),
    tabPanels: document.querySelectorAll('.tab-panel'),

    // Modals & Drawers
    modalCountInfo: document.getElementById('modal-count-info'),
    btnHowWeCount: document.getElementById('btn-how-we-count'),
    modalAuth: document.getElementById('modal-auth'),
    authInput: document.getElementById('auth-passcode-input'),
    authError: document.getElementById('auth-error-msg'),
    btnSubmitAuth: document.getElementById('btn-submit-auth'),
    participantDrawer: document.getElementById('participant-drawer'),
    drawerBackdrop: document.getElementById('drawer-backdrop'),
    drawerContent: document.getElementById('drawer-content'),

    // Table & Filters
    filterSearch: document.getElementById('filter-search'),
    filterForm: document.getElementById('filter-form'),
    filterCategory: document.getElementById('filter-category'),
    filterEvent: document.getElementById('filter-event'),
    filterGender: document.getElementById('filter-gender'),
    filterLocation: document.getElementById('filter-location'),
    filterAgeMin: document.getElementById('filter-age-min'),
    filterAgeMax: document.getElementById('filter-age-max'),
    filterStatus: document.getElementById('filter-status'),
    filterMultiOnly: document.getElementById('filter-multi-only'),
    filterIssuesOnly: document.getElementById('filter-issues-only'),
    filterChipsRow: document.getElementById('filter-chips-row'),
    btnResetFilters: document.getElementById('btn-reset-filters'),
    btnExportCsv: document.getElementById('btn-export-csv'),
    participantsTableBody: document.getElementById('participants-tbody'),
    tableCountSummary: document.getElementById('table-count-summary')
  };

  // Color tokens
  const COLORS = {
    primary: '#B3123C',
    accent: '#D99A00',
    teal: '#0F766E',
    muted: '#7A6A58',
    line: '#E8DFD0'
  };

  /**
   * Format Date to HH:mm:ss
   */
  function formatTime(d) {
    if (!d) return '--:--:--';
    const date = new Date(d);
    return date.toTimeString().split(' ')[0];
  }

  /**
   * Router: hash-based navigation
   */
  function initRouter() {
    function handleRoute() {
      const hash = window.location.hash.replace('#', '') || 'overview';
      const validTabs = ['overview', 'gen', 'crown', 'ww', 'participants', 'quality'];
      const targetTab = validTabs.includes(hash) ? hash : 'overview';

      state.activeTab = targetTab;

      el.navLinks.forEach(link => {
        const href = link.getAttribute('href').replace('#', '');
        link.classList.toggle('active', href === targetTab);
      });

      el.tabPanels.forEach(panel => {
        panel.classList.toggle('active', panel.id === `tab-${targetTab}`);
      });

      window.scrollTo({ top: 0, behavior: 'smooth' });

      // Render charts or table for the active tab
      if (state.data) {
        renderCurrentTab();
      }
    }

    window.addEventListener('hashchange', handleRoute);
    handleRoute();
  }

  /**
   * Fetch Live Data from /api/data with LocalStorage recovery
   */
  async function fetchDashboardData(manual = false) {
    if (state.isSyncing) return;
    state.isSyncing = true;

    if (el.syncDot) el.syncDot.classList.add('syncing');
    if (el.syncText) el.syncText.textContent = 'Syncing...';

    const headers = {};
    if (state.authPasscode) {
      headers['x-team-passcode'] = state.authPasscode;
    }

    const refreshParam = manual ? '?refresh=true' : '';
    const url = `/api/data${refreshParam}`;

    try {
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();

      if (!json.success || !json.data) {
        throw new Error(json.error || 'Invalid API response');
      }

      state.data = json.data;
      state.lastSynced = new Date();
      state.isAuthenticated = !!json.isAuthenticated;

      // Update auth button state
      if (el.btnAuth) {
        el.btnAuth.textContent = state.isAuthenticated ? '🔓 Passcode Verified' : '🔒 Team Passcode';
      }

      // Save to localStorage
      try {
        localStorage.setItem('vu_last_good_data', JSON.stringify({
          data: json.data,
          timestamp: state.lastSynced.toISOString()
        }));
      } catch (e) {
        console.warn('Could not save to localStorage', e);
      }

      // Hide warning banner
      if (el.warningBanner) el.warningBanner.classList.remove('visible');

      if (el.syncText) el.syncText.textContent = `Last synced ${formatTime(state.lastSynced)}`;

      renderCurrentTab();
    } catch (err) {
      console.warn('[Sync failed, loading cached data]', err);

      // Try LocalStorage fallback
      const cached = localStorage.getItem('vu_last_good_data');
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          state.data = parsed.data;
          state.lastSynced = new Date(parsed.timestamp);

          if (el.warningBanner && el.warningText) {
            el.warningText.textContent = `Showing cached data from ${formatTime(state.lastSynced)}, retrying live sync…`;
            el.warningBanner.classList.add('visible');
          }
          if (el.syncText) el.syncText.textContent = `Cached ${formatTime(state.lastSynced)}`;
          renderCurrentTab();
        } catch (e) {
          console.error('Failed to parse cached data', e);
        }
      } else {
        if (el.syncText) el.syncText.textContent = 'Sync failed. Retrying…';
      }
    } finally {
      state.isSyncing = false;
      if (el.syncDot) el.syncDot.classList.remove('syncing');
    }
  }

  /**
   * Render Active Tab Contents
   */
  function renderCurrentTab() {
    if (!state.data) return;

    switch (state.activeTab) {
      case 'overview':
        renderOverview();
        break;
      case 'gen':
        renderGeneral();
        break;
      case 'crown':
        renderCrown();
        break;
      case 'ww':
        renderWonderWomen();
        break;
      case 'participants':
        renderParticipantsTable();
        break;
      case 'quality':
        renderDataQuality();
        break;
    }
  }

  /**
   * 1. Overview Tab Rendering (Strictly 6 widgets)
   */
  function renderOverview() {
    const o = state.data.overview;
    if (!o) return;

    // Widget 1: Hero Total Participants & form chip links
    const totalEl = document.getElementById('stat-total-participants');
    if (totalEl) totalEl.textContent = o.totalParticipants.toLocaleString();

    const approxEl = document.getElementById('stat-approx-unique');
    if (approxEl) approxEl.textContent = `≈ ${o.approxUniqueIndividuals.toLocaleString()} unique individuals across forms`;

    const chipGen = document.getElementById('chip-count-general');
    if (chipGen) chipGen.textContent = o.formCounts.general.toLocaleString();
    const chipCrown = document.getElementById('chip-count-crown');
    if (chipCrown) chipCrown.textContent = o.formCounts.crown.toLocaleString();
    const chipWw = document.getElementById('chip-count-ww');
    if (chipWw) chipWw.textContent = o.formCounts.wonderWomen.toLocaleString();

    // Widget 2: Quick KPI Trio
    const subEl = document.getElementById('stat-submissions');
    if (subEl) subEl.textContent = o.submissions.toLocaleString();
    const entriesEl = document.getElementById('stat-entries');
    if (entriesEl) entriesEl.textContent = o.competitionEntries.toLocaleString();
    const followEl = document.getElementById('stat-followup');
    if (followEl) followEl.textContent = o.needsFollowUp.toLocaleString();

    // Widget 3: Auto-Generated Summary
    const sumEl = document.getElementById('overview-summary-text');
    if (sumEl) sumEl.textContent = o.summaryText;

    // Widget 4: Registrations Per Day Trend Chart
    renderDailyTrendChart('chart-daily-trend', o.dailyTrend, o.peakDay);

    // Widget 5: Top Competitions Filling Up (Horizontal Bar Chart)
    renderTopCompetitionsChart('chart-top-competitions', o.topCompetitions);

    // Widget 6: Geographic Distribution
    const vjaNum = document.getElementById('geo-vja-num');
    if (vjaNum) vjaNum.textContent = o.geo.vijayawada.toLocaleString();
    const vjaPct = document.getElementById('geo-vja-pct');
    if (vjaPct) vjaPct.textContent = `${o.geo.vjaPct}%`;

    const apNum = document.getElementById('geo-ap-num');
    if (apNum) apNum.textContent = o.geo.restOfAP.toLocaleString();
    const apPct = document.getElementById('geo-ap-pct');
    if (apPct) apPct.textContent = `${o.geo.apPct}%`;

    const outNum = document.getElementById('geo-out-num');
    if (outNum) outNum.textContent = o.geo.outsideAP.toLocaleString();
    const outPct = document.getElementById('geo-out-pct');
    if (outPct) outPct.textContent = `${o.geo.outsidePct}%`;
  }

  /**
   * 2. General Competitions Tab Rendering
   */
  function renderGeneral() {
    const g = state.data.general;
    if (!g) return;

    // 1. Sub-competition bars
    const compMap = {};
    g.participants.forEach(p => {
      Object.entries(p.competitions).forEach(([mainCat, list]) => {
        list.forEach(item => {
          const key = `${mainCat} · ${item.shortName}`;
          compMap[key] = (compMap[key] || 0) + 1;
        });
      });
    });

    const sortedComps = Object.entries(compMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    renderHorizontalBarChart('chart-gen-subcompetitions', sortedComps.map(c => c.name), sortedComps.map(c => c.count));

    // 2. Age Category Bar (Sub Junior, Junior, Senior)
    const ageCounts = { 'Sub Junior': 0, 'Junior': 0, 'Senior': 0 };
    g.participants.forEach(p => {
      if (ageCounts[p.ageCategory] !== undefined) {
        ageCounts[p.ageCategory]++;
      }
    });

    renderBarSplitChart('chart-gen-age', Object.keys(ageCounts), Object.values(ageCounts), [COLORS.primary, COLORS.teal, COLORS.accent]);

    // 3. Gender Split
    const genderCounts = {};
    g.participants.forEach(p => {
      const gdr = p.gender || 'Unspecified';
      genderCounts[gdr] = (genderCounts[gdr] || 0) + 1;
    });

    renderDoughnutSplitChart('chart-gen-gender', Object.keys(genderCounts), Object.values(genderCounts), [COLORS.primary, COLORS.teal, COLORS.accent]);

    // 4. General KPI Cards
    const totalGenEl = document.getElementById('gen-kpi-participants');
    if (totalGenEl) totalGenEl.textContent = g.participants.length;
    const subGenEl = document.getElementById('gen-kpi-submissions');
    if (subGenEl) subGenEl.textContent = g.stats.totalSubmissions;
    const repeatGenEl = document.getElementById('gen-kpi-repeats');
    if (repeatGenEl) repeatGenEl.textContent = g.stats.removedRepeats;
  }

  /**
   * 3. Crown of Vijayawada Tab Rendering
   */
  function renderCrown() {
    const c = state.data.crown;
    if (!c) return;

    // 1. 7 Category cards
    const catMap = {
      'Little Vijayawada': 0,
      'Teen Vijayawada': 0,
      'Miss Vijayawada': 0,
      'Mrs. Vijayawada': 0,
      'Mr. Vijayawada': 0,
      'Couple Vijayawada': 0,
      'Golden Face Vijayawada': 0
    };

    c.participants.forEach(p => {
      const rawCat = p.category || '';
      for (const k of Object.keys(catMap)) {
        if (rawCat.toLowerCase().includes(k.toLowerCase().split(' ')[0])) {
          catMap[k]++;
          break;
        }
      }
    });

    const gridEl = document.getElementById('crown-categories-grid');
    if (gridEl) {
      gridEl.innerHTML = Object.entries(catMap).map(([title, count]) => `
        <div class="cat-mini-card">
          <span class="cat-mini-title">${title}</span>
          <span class="cat-mini-badge">${count}</span>
        </div>
      `).join('');
    }

    // 2. Age bands: Up to 12, 13–19, 20–35, 36–59, 60+
    const ageBands = { 'Up to 12': 0, '13–19': 0, '20–35': 0, '36–59': 0, '60+': 0 };
    c.participants.forEach(p => {
      const a = p.age;
      if (a !== null) {
        if (a <= 12) ageBands['Up to 12']++;
        else if (a <= 19) ageBands['13–19']++;
        else if (a <= 35) ageBands['20–35']++;
        else if (a <= 59) ageBands['36–59']++;
        else ageBands['60+']++;
      }
    });

    renderBarSplitChart('chart-crown-age-bands', Object.keys(ageBands), Object.values(ageBands), [COLORS.primary]);

    // 3. Gender Split
    const gdrMap = {};
    c.participants.forEach(p => {
      const gdr = p.gender || 'Unspecified';
      gdrMap[gdr] = (gdrMap[gdr] || 0) + 1;
    });
    renderDoughnutSplitChart('chart-crown-gender', Object.keys(gdrMap), Object.values(gdrMap), [COLORS.teal, COLORS.primary, COLORS.accent]);

    // 4. Follow-up list
    const issues = c.participants.filter(p => p.hasIssues);
    const crownIssuesEl = document.getElementById('crown-followup-count');
    if (crownIssuesEl) crownIssuesEl.textContent = `${issues.length} participants need follow-up`;
  }

  /**
   * 4. Wonder Women of Vijayawada Tab Rendering
   */
  function renderWonderWomen() {
    const w = state.data.wonderWomen;
    if (!w) return;

    // 1. 10 Category Cards
    const wwCats = [
      'Avakai', 'Annapoorna', 'Gorinta Varnam', 'Saree Sutra', 'Navya Nagalu',
      'Thread & Tinge', 'Shakthi Pitch', 'Malyada', 'Bommala Koluvu', 'Makeup Muse'
    ];
    const catCounts = {};
    wwCats.forEach(c => catCounts[c] = 0);

    w.participants.forEach(p => {
      (p.categories || []).forEach(cat => {
        if (catCounts[cat] !== undefined) {
          catCounts[cat]++;
        } else {
          // Fuzzy match
          const found = wwCats.find(c => cat.toLowerCase().includes(c.toLowerCase()));
          if (found) catCounts[found]++;
        }
      });
    });

    const gridEl = document.getElementById('ww-categories-grid');
    if (gridEl) {
      gridEl.innerHTML = Object.entries(catCounts).map(([title, count]) => `
        <div class="cat-mini-card">
          <span class="cat-mini-title">${title}</span>
          <span class="cat-mini-badge">${count}</span>
        </div>
      `).join('');
    }

    // 2. Categories per participant (1, 2, 3, 4+)
    const perPerson = { '1 category': 0, '2 categories': 0, '3 categories': 0, '4+ categories': 0 };
    w.participants.forEach(p => {
      const num = (p.categories || []).length;
      if (num <= 1) perPerson['1 category']++;
      else if (num === 2) perPerson['2 categories']++;
      else if (num === 3) perPerson['3 categories']++;
      else perPerson['4+ categories']++;
    });

    renderBarSplitChart('chart-ww-distribution', Object.keys(perPerson), Object.values(perPerson), [COLORS.teal]);

    // 3. Link availability
    const withLink = w.participants.filter(p => p.linkValid).length;
    const withoutLink = w.participants.length - withLink;
    renderDoughnutSplitChart('chart-ww-links', ['Valid Work Link', 'Missing / Unclear'], [withLink, withoutLink], [COLORS.teal, COLORS.accent]);
  }

  /**
   * 5. Participants Tab: Filter & Table
   */
  function renderParticipantsTable() {
    if (!state.data || !state.data.allParticipants) return;

    const f = state.filters;
    let list = state.data.allParticipants.slice();

    // 1. Text Search (Name, ID, Phone)
    if (f.search.trim()) {
      const q = f.search.trim().toLowerCase();
      list = list.filter(p => {
        return (p.rawName && p.rawName.toLowerCase().includes(q)) ||
               (p.id && p.id.toLowerCase().includes(q)) ||
               (p.phone && p.phone.includes(q)) ||
               (p.institution && p.institution.toLowerCase().includes(q));
      });
    }

    // 2. Form Filter
    if (f.form !== 'all') {
      list = list.filter(p => p.form.toLowerCase() === f.form.toLowerCase());
    }

    // 3. Category Filter
    if (f.category !== 'all') {
      list = list.filter(p => {
        if (p.form === 'General') return p.categoryCode === f.category;
        if (p.form === 'Crown') return (p.category || '').toLowerCase().includes(f.category.toLowerCase());
        if (p.form === 'Wonder Women') return (p.categories || []).includes(f.category);
        return true;
      });
    }

    // 4. Gender Filter
    if (f.gender !== 'all') {
      list = list.filter(p => (p.gender || '').toLowerCase() === f.gender.toLowerCase());
    }

    // 5. Location Filter
    if (f.location !== 'all') {
      list = list.filter(p => p.classifiedLoc === f.location);
    }

    // 6. Age Range
    if (f.ageMin) {
      const min = parseInt(f.ageMin, 10);
      list = list.filter(p => p.age !== null && p.age >= min);
    }
    if (f.ageMax) {
      const max = parseInt(f.ageMax, 10);
      list = list.filter(p => p.age !== null && p.age <= max);
    }

    // 7. Status Filter
    if (f.status !== 'all') {
      list = list.filter(p => p.status === f.status);
    }

    // 8. Multi-event Only
    if (f.multiOnly) {
      list = list.filter(p => (p.entryCount || 1) > 1);
    }

    // 9. Needs Follow-up Only
    if (f.needsFollowUpOnly) {
      list = list.filter(p => p.hasIssues || p.status === 'Needs Correction');
    }

    // Render Summary Count
    if (el.tableCountSummary) {
      el.tableCountSummary.textContent = `Showing ${list.length} of ${state.data.allParticipants.length} participants`;
    }

    // Render Active Filter Chips
    renderFilterChips();

    // Render Table Rows
    if (!el.participantsTableBody) return;

    if (list.length === 0) {
      el.participantsTableBody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align:center; padding: 32px; color: var(--muted);">
            No participants match these filters. <button class="btn-reset-filters" id="btn-empty-reset">Reset filters</button>
          </td>
        </tr>
      `;
      const btnReset = document.getElementById('btn-empty-reset');
      if (btnReset) btnReset.addEventListener('click', resetFilters);
      return;
    }

    // Limit rendered rows for performance (first 100 rows, smoothly paginated or scrolled)
    const displayList = list.slice(0, 150);

    el.participantsTableBody.innerHTML = displayList.map(p => {
      const statusClass = `status-${p.status.toLowerCase().replace(/\s+/g, '-')}`;
      const issuesHtml = (p.allFlags || []).map(f => `<span class="flag-pill">${f}</span>`).join('');

      let compDetails = '';
      if (p.form === 'General') {
        const events = Object.entries(p.competitions).map(([k, items]) => `${k} (${items.length})`).join(', ');
        compDetails = events || 'General';
      } else if (p.form === 'Crown') {
        compDetails = p.category ? p.category.split('(')[0].trim() : 'Crown';
      } else {
        compDetails = (p.categories || []).join(', ') || 'Wonder Women';
      }

      return `
        <tr data-id="${p.id}">
          <td><strong>${p.id}</strong></td>
          <td>${escapeHtml(p.rawName)}</td>
          <td><span style="font-size:0.8rem; font-weight:600; color:var(--muted);">${p.form}</span></td>
          <td>${escapeHtml(compDetails)}</td>
          <td><code>${p.phone}</code></td>
          <td>${escapeHtml(p.location)}</td>
          <td><span class="status-pill ${statusClass}">${p.status}</span> ${issuesHtml}</td>
        </tr>
      `;
    }).join('');

    // Attach click listeners to rows
    el.participantsTableBody.querySelectorAll('tr[data-id]').forEach(tr => {
      tr.addEventListener('click', () => {
        const id = tr.getAttribute('data-id');
        const participant = state.data.allParticipants.find(p => p.id === id);
        if (participant) openParticipantDrawer(participant);
      });
    });
  }

  /**
   * Render Filter Chips
   */
  function renderFilterChips() {
    if (!el.filterChipsRow) return;
    const chips = [];
    const f = state.filters;

    if (f.search) chips.push({ key: 'search', label: `Search: "${f.search}"` });
    if (f.form !== 'all') chips.push({ key: 'form', label: `Form: ${f.form}` });
    if (f.category !== 'all') chips.push({ key: 'category', label: `Category: ${f.category}` });
    if (f.gender !== 'all') chips.push({ key: 'gender', label: `Gender: ${f.gender}` });
    if (f.location !== 'all') chips.push({ key: 'location', label: `Location: ${f.location}` });
    if (f.status !== 'all') chips.push({ key: 'status', label: `Status: ${f.status}` });
    if (f.multiOnly) chips.push({ key: 'multiOnly', label: 'Multi-Event Only' });
    if (f.needsFollowUpOnly) chips.push({ key: 'needsFollowUpOnly', label: 'Needs Follow-Up' });

    el.filterChipsRow.innerHTML = chips.map(c => `
      <span class="active-chip">
        ${escapeHtml(c.label)}
        <button class="chip-remove" data-key="${c.key}">&times;</button>
      </span>
    `).join('');

    el.filterChipsRow.querySelectorAll('.chip-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.getAttribute('data-key');
        if (key === 'multiOnly' || key === 'needsFollowUpOnly') {
          state.filters[key] = false;
          if (key === 'multiOnly' && el.filterMultiOnly) el.filterMultiOnly.checked = false;
          if (key === 'needsFollowUpOnly' && el.filterIssuesOnly) el.filterIssuesOnly.checked = false;
        } else {
          state.filters[key] = (key === 'form' || key === 'category' || key === 'gender' || key === 'location' || key === 'status') ? 'all' : '';
          const inputEl = document.getElementById(`filter-${key}`);
          if (inputEl) inputEl.value = state.filters[key];
        }
        renderParticipantsTable();
      });
    });
  }

  function resetFilters() {
    state.filters = {
      search: '',
      form: 'all',
      category: 'all',
      event: 'all',
      gender: 'all',
      location: 'all',
      ageMin: '',
      ageMax: '',
      status: 'all',
      multiOnly: false,
      needsFollowUpOnly: false
    };

    if (el.filterSearch) el.filterSearch.value = '';
    if (el.filterForm) el.filterForm.value = 'all';
    if (el.filterCategory) el.filterCategory.value = 'all';
    if (el.filterGender) el.filterGender.value = 'all';
    if (el.filterLocation) el.filterLocation.value = 'all';
    if (el.filterAgeMin) el.filterAgeMin.value = '';
    if (el.filterAgeMax) el.filterAgeMax.value = '';
    if (el.filterStatus) el.filterStatus.value = 'all';
    if (el.filterMultiOnly) el.filterMultiOnly.checked = false;
    if (el.filterIssuesOnly) el.filterIssuesOnly.checked = false;

    renderParticipantsTable();
  }

  /**
   * 6. Data Quality Page Rendering
   */
  function renderDataQuality() {
    const q = state.data.quality;
    if (!q) return;

    const setVal = (id, val) => {
      const dom = document.getElementById(id);
      if (dom) dom.textContent = (val || 0).toLocaleString();
    };

    setVal('dq-submissions', q.totalSubmissions);
    setVal('dq-repeats', q.exactRepeatsRemoved);
    setVal('dq-multi', q.multiSubmissionPeople);
    setVal('dq-invalid-phones', q.invalidPhones);
    setVal('dq-two-phones', q.twoNumberPhones);
    setVal('dq-missing-inst', q.missingInstitution);
    setVal('dq-age-mismatch', q.ageCategoryMismatches);

    // Drill down buttons
    document.querySelectorAll('[data-drill-filter]').forEach(btn => {
      btn.onclick = () => {
        const filterType = btn.getAttribute('data-drill-filter');
        resetFilters();
        if (filterType === 'issues') {
          state.filters.needsFollowUpOnly = true;
          if (el.filterIssuesOnly) el.filterIssuesOnly.checked = true;
        } else if (filterType === 'multi') {
          state.filters.multiOnly = true;
          if (el.filterMultiOnly) el.filterMultiOnly.checked = true;
        }
        window.location.hash = '#participants';
      };
    });
  }

  /**
   * Participant Slide-Out Drawer
   */
  function openParticipantDrawer(p) {
    if (!el.participantDrawer || !el.drawerContent) return;

    let compHtml = '';
    if (p.form === 'General') {
      compHtml = Object.entries(p.competitions).map(([cat, list]) => `
        <div style="margin-bottom: 8px;">
          <strong style="color:var(--primary); font-size: 0.85rem;">${cat} (${list.length})</strong>
          <ul style="margin-left: 20px; font-size: 0.85rem;">
            ${list.map(i => `<li>${escapeHtml(i.fullName)}</li>`).join('')}
          </ul>
        </div>
      `).join('');
    } else if (p.form === 'Crown') {
      compHtml = `<div style="font-size:0.9rem;"><strong>Category:</strong> ${escapeHtml(p.category || 'N/A')}</div>`;
    } else {
      compHtml = `
        <ul style="margin-left: 20px; font-size: 0.85rem;">
          ${(p.categories || []).map(c => `<li>${escapeHtml(c)}</li>`).join('')}
        </ul>
      `;
    }

    const issuesHtml = (p.allFlags || []).length > 0
      ? p.allFlags.map(f => `<span class="flag-pill">${f}</span>`).join(' ')
      : '<span style="color:var(--ok); font-size:0.85rem; font-weight:600;">✓ No known issues</span>';

    const unmaskedPhone = p.rawPhone || p.phone;

    el.drawerContent.innerHTML = `
      <div class="detail-group">
        <span class="detail-label">Registration ID</span>
        <span class="detail-val" style="font-size:1.4rem; color:var(--primary); font-weight:700;">${p.id}</span>
      </div>

      <div class="detail-group">
        <span class="detail-label">Full Name</span>
        <span class="detail-val" style="font-size:1.15rem; font-weight:600;">${escapeHtml(p.rawName)}</span>
      </div>

      <div class="detail-group">
        <span class="detail-label">Form & Categories</span>
        <div style="background:var(--bg); border:1px solid var(--line); border-radius:var(--radius-sm); padding:10px; margin-top:4px;">
          ${compHtml}
        </div>
      </div>

      <div class="detail-group">
        <span class="detail-label">Contact Phone</span>
        <div style="display:flex; align-items:center; gap:8px;">
          <span class="detail-val" id="drawer-phone-val">${p.phone}</span>
          ${p.isMasked ? `<button class="btn-refresh" id="btn-reveal-phone" style="color:var(--primary); border-color:var(--primary);">Reveal</button>` : ''}
        </div>
      </div>

      <div class="detail-group" style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
        <div>
          <span class="detail-label">Age</span>
          <span class="detail-val">${p.age !== null ? p.age : 'Unspecified'} (${p.ageCategory || ''})</span>
        </div>
        <div>
          <span class="detail-label">Gender</span>
          <span class="detail-val">${escapeHtml(p.gender || 'Unspecified')}</span>
        </div>
      </div>

      <div class="detail-group">
        <span class="detail-label">Location</span>
        <span class="detail-val">${escapeHtml(p.location)} (${p.classifiedLoc})</span>
      </div>

      ${p.institution ? `
        <div class="detail-group">
          <span class="detail-label">Institution / Organisation</span>
          <span class="detail-val">${escapeHtml(p.institution)}</span>
        </div>
      ` : ''}

      ${p.link ? `
        <div class="detail-group">
          <span class="detail-label">Submission Link / Social Handle</span>
          <span class="detail-val"><a href="${escapeHtml(p.link)}" target="_blank" rel="noopener" style="color:var(--teal); word-break:break-all;">${escapeHtml(p.link)}</a></span>
        </div>
      ` : ''}

      <div class="detail-group">
        <span class="detail-label">Quality Validation Status</span>
        <div style="margin-top:4px;">${issuesHtml}</div>
      </div>

      <div class="detail-group" style="border-top:1px solid var(--line); padding-top:16px;">
        <span class="detail-label">Participant Pipeline Status</span>
        <select class="filter-select" id="drawer-status-select" style="width:100%; margin-top:6px;">
          <option value="New" ${p.status === 'New' ? 'selected' : ''}>New</option>
          <option value="Verified" ${p.status === 'Verified' ? 'selected' : ''}>Verified</option>
          <option value="Contacted" ${p.status === 'Contacted' ? 'selected' : ''}>Contacted</option>
          <option value="Confirmed" ${p.status === 'Confirmed' ? 'selected' : ''}>Confirmed</option>
          <option value="Needs Correction" ${p.status === 'Needs Correction' ? 'selected' : ''}>Needs Correction</option>
          <option value="Withdrawn" ${p.status === 'Withdrawn' ? 'selected' : ''}>Withdrawn</option>
        </select>
        <div id="drawer-status-msg" style="font-size:0.75rem; color:var(--muted); margin-top:4px;"></div>
      </div>
    `;

    // Status change listener
    const selectStatus = document.getElementById('drawer-status-select');
    if (selectStatus) {
      selectStatus.addEventListener('change', async () => {
        const newStatus = selectStatus.value;
        const msgEl = document.getElementById('drawer-status-msg');
        if (msgEl) msgEl.textContent = 'Updating...';

        try {
          const res = await fetch('/api/status', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-team-passcode': state.authPasscode
            },
            body: JSON.stringify({
              participantId: p.id,
              status: newStatus,
              passcode: state.authPasscode
            })
          });

          if (!res.ok) {
            if (res.status === 401) {
              if (msgEl) msgEl.textContent = 'Team passcode required to update status.';
              openAuthModal();
              return;
            }
            throw new Error(`Status ${res.status}`);
          }

          p.status = newStatus;
          if (msgEl) msgEl.textContent = `✓ Status updated to ${newStatus}`;
          renderParticipantsTable();
        } catch (e) {
          if (msgEl) msgEl.textContent = 'Update failed: ' + e.message;
        }
      });
    }

    // Reveal phone button listener
    const btnReveal = document.getElementById('btn-reveal-phone');
    if (btnReveal) {
      btnReveal.addEventListener('click', () => {
        if (!state.isAuthenticated) {
          openAuthModal();
        } else {
          document.getElementById('drawer-phone-val').textContent = unmaskedPhone;
          btnReveal.remove();
        }
      });
    }

    el.participantDrawer.classList.add('active');
    if (el.drawerBackdrop) el.drawerBackdrop.classList.add('active');
  }

  function closeDrawer() {
    if (el.participantDrawer) el.participantDrawer.classList.remove('active');
    if (el.drawerBackdrop) el.drawerBackdrop.classList.remove('active');
  }

  /**
   * Passcode Authentication Modal
   */
  function openAuthModal() {
    if (el.modalAuth) el.modalAuth.classList.add('active');
    if (el.authInput) el.authInput.focus();
  }

  function closeAuthModal() {
    if (el.modalAuth) el.modalAuth.classList.remove('active');
    if (el.authError) el.authError.textContent = '';
  }

  async function submitAuthPasscode() {
    const code = (el.authInput ? el.authInput.value : '').trim();
    if (!code) return;

    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode: code })
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        if (el.authError) el.authError.textContent = 'Invalid passcode. Please try again.';
        return;
      }

      state.authPasscode = code;
      sessionStorage.setItem('vu_passcode', code);
      state.isAuthenticated = true;
      closeAuthModal();

      // Refresh data unmasked
      fetchDashboardData(true);
    } catch (e) {
      if (el.authError) el.authError.textContent = 'Connection error: ' + e.message;
    }
  }

  /**
   * Export Filtered Participants to CSV
   */
  function exportFilteredCSV() {
    if (!state.data || !state.data.allParticipants) return;

    const list = state.data.allParticipants; // exports all participants
    const headers = ['Registration ID', 'Full Name', 'Form', 'Age', 'Gender', 'Phone', 'Location', 'Status', 'Issues', 'Competitions'];

    const rows = list.map(p => {
      let comps = '';
      if (p.form === 'General') {
        comps = Object.entries(p.competitions).map(([k, v]) => `${k}:${v.map(x => x.shortName).join(';')}`).join(' | ');
      } else if (p.form === 'Crown') {
        comps = p.category || '';
      } else {
        comps = (p.categories || []).join('; ');
      }

      return [
        p.id,
        p.rawName,
        p.form,
        p.age !== null ? p.age : '',
        p.gender || '',
        p.phone,
        p.location || '',
        p.status,
        (p.allFlags || []).join('; '),
        comps
      ].map(val => `"${String(val).replace(/"/g, '""')}"`).join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Vijayawada_Utsav_Participants_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  /**
   * Chart Helpers using Chart.js
   */
  function destroyChart(id) {
    if (state.charts[id]) {
      state.charts[id].destroy();
      delete state.charts[id];
    }
  }

  function renderDailyTrendChart(canvasId, dailyTrend, peakDay) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    destroyChart(canvasId);

    const labels = dailyTrend.map(d => {
      const parts = d.date.split('-');
      return `${parseInt(parts[2], 10)}/${parseInt(parts[1], 10)}`;
    });
    const counts = dailyTrend.map(d => d.count);

    state.charts[canvasId] = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Registrations',
          data: counts,
          borderColor: COLORS.primary,
          backgroundColor: 'rgba(179, 18, 60, 0.08)',
          borderWidth: 2.5,
          tension: 0.25,
          fill: true,
          pointRadius: counts.map(c => c === peakDay.count ? 6 : 3),
          pointBackgroundColor: counts.map(c => c === peakDay.count ? COLORS.accent : COLORS.primary),
          pointBorderColor: '#fff',
          pointBorderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: (ctx) => `Date: ${dailyTrend[ctx[0].dataIndex].date}`,
              label: (ctx) => ` ${ctx.raw} registrations${ctx.raw === peakDay.count ? ' (Peak)' : ''}`
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: COLORS.muted, font: { size: 11 } }
          },
          y: {
            beginAtZero: true,
            grid: { color: 'rgba(232, 223, 208, 0.6)' },
            ticks: { color: COLORS.muted, font: { size: 11 } }
          }
        }
      }
    });
  }

  function renderTopCompetitionsChart(canvasId, topCompetitions) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    destroyChart(canvasId);

    const labels = topCompetitions.map(c => c.name);
    const data = topCompetitions.map(c => c.count);

    state.charts[canvasId] = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: COLORS.primary,
          borderRadius: 4
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => ` ${ctx.raw} registered participants`
            }
          }
        },
        scales: {
          x: {
            beginAtZero: true,
            grid: { color: 'rgba(232, 223, 208, 0.6)' },
            ticks: { color: COLORS.muted, font: { size: 11 } }
          },
          y: {
            grid: { display: false },
            ticks: { color: COLORS.muted, font: { size: 11 } }
          }
        }
      }
    });
  }

  function renderHorizontalBarChart(canvasId, labels, data) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    destroyChart(canvasId);

    state.charts[canvasId] = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: COLORS.primary,
          borderRadius: 4
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { beginAtZero: true, grid: { color: 'rgba(232, 223, 208, 0.6)' } },
          y: { grid: { display: false } }
        }
      }
    });
  }

  function renderBarSplitChart(canvasId, labels, data, colors) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    destroyChart(canvasId);

    state.charts[canvasId] = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: colors.length === 1 ? colors[0] : colors,
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false } },
          y: { beginAtZero: true, grid: { color: 'rgba(232, 223, 208, 0.6)' } }
        }
      }
    });
  }

  function renderDoughnutSplitChart(canvasId, labels, data, colors) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    destroyChart(canvasId);

    state.charts[canvasId] = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: colors,
          borderWidth: 2,
          borderColor: '#fff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { boxWidth: 12, font: { size: 12 } }
          }
        }
      }
    });
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * Event Listeners & Initialization
   */
  function initEvents() {
    if (el.btnRefresh) {
      el.btnRefresh.addEventListener('click', () => fetchDashboardData(true));
    }

    if (el.btnAuth) {
      el.btnAuth.addEventListener('click', openAuthModal);
    }

    if (el.btnHowWeCount && el.modalCountInfo) {
      el.btnHowWeCount.addEventListener('click', () => el.modalCountInfo.classList.add('active'));
    }

    document.querySelectorAll('.modal-close').forEach(btn => {
      btn.addEventListener('click', () => {
        if (el.modalCountInfo) el.modalCountInfo.classList.remove('active');
        closeAuthModal();
      });
    });

    if (el.btnSubmitAuth) {
      el.btnSubmitAuth.addEventListener('click', submitAuthPasscode);
    }

    if (el.authInput) {
      el.authInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') submitAuthPasscode();
      });
    }

    if (el.drawerBackdrop) {
      el.drawerBackdrop.addEventListener('click', closeDrawer);
    }

    document.querySelectorAll('.drawer-close').forEach(btn => {
      btn.addEventListener('click', closeDrawer);
    });

    // Form chip shortcuts in Overview
    document.querySelectorAll('[data-goto-tab]').forEach(chip => {
      chip.addEventListener('click', () => {
        const tab = chip.getAttribute('data-goto-tab');
        window.location.hash = `#${tab}`;
      });
    });

    // Filter bar inputs
    if (el.filterSearch) {
      el.filterSearch.addEventListener('input', (e) => {
        state.filters.search = e.target.value;
        renderParticipantsTable();
      });
    }

    ['form', 'category', 'gender', 'location', 'status'].forEach(field => {
      const select = document.getElementById(`filter-${field}`);
      if (select) {
        select.addEventListener('change', (e) => {
          state.filters[field] = e.target.value;
          renderParticipantsTable();
        });
      }
    });

    if (el.filterMultiOnly) {
      el.filterMultiOnly.addEventListener('change', (e) => {
        state.filters.multiOnly = e.target.checked;
        renderParticipantsTable();
      });
    }

    if (el.filterIssuesOnly) {
      el.filterIssuesOnly.addEventListener('change', (e) => {
        state.filters.needsFollowUpOnly = e.target.checked;
        renderParticipantsTable();
      });
    }

    if (el.btnResetFilters) {
      el.btnResetFilters.addEventListener('click', resetFilters);
    }

    if (el.btnExportCsv) {
      el.btnExportCsv.addEventListener('click', exportFilteredCSV);
    }

    // Auto-polling every 60 seconds
    setInterval(() => fetchDashboardData(false), 60000);

    // Refresh on tab focus
    window.addEventListener('focus', () => fetchDashboardData(false));
  }

  // Initialize Application
  document.addEventListener('DOMContentLoaded', () => {
    initRouter();
    initEvents();
    fetchDashboardData(false);
  });

})();
