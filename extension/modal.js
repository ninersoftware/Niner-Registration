function openSettings(currentModal) {
    const existing = document.getElementById('niner-settings-modal');
    if (existing) { existing.remove(); return; }

    const settings = document.createElement('div');
    settings.id = 'niner-settings-modal';
    settings.className = 'niner-settings-overlay';
    settings.innerHTML = `
        <div class="niner-settings-panel">
            <div class="niner-settings-header">
                <span class="niner-settings-title">Settings</span>
                <button class="niner-settings-close">✕</button>
            </div>
            <div class="niner-settings-section">
                <span class="niner-settings-label">THEME</span>
                <div class="niner-theme-options">
                    <button class="niner-theme-btn-white" data-theme="white"></button>
                    <button class="niner-theme-btn-dark" data-theme="dark"></button>
                    <button class="niner-theme-btn-green" data-theme="green"></button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(settings);

    chrome.storage.local.get('ninerTheme', (result) => {
        const current = result.ninerTheme || 'white';
        settings.querySelectorAll('[data-theme]').forEach(btn => {
            if (btn.getAttribute('data-theme') === current) {
                btn.classList.add('niner-theme-btn-active');
            }
        });
    });

    settings.querySelectorAll('[data-theme]').forEach(btn => {
        btn.addEventListener('click', () => {
            const theme = btn.getAttribute('data-theme');
            chrome.storage.local.set({ ninerTheme: theme });
            applyTheme(currentModal, theme);
            settings.querySelectorAll('[data-theme]').forEach(b => b.classList.remove('niner-theme-btn-active'));
            btn.classList.add('niner-theme-btn-active');
        });
    });

    settings.querySelector('.niner-settings-close').addEventListener('click', () => settings.remove());
    settings.addEventListener('click', (e) => { if (e.target === settings) settings.remove(); });
}

function applyTheme(modalContainer, theme) {
    modalContainer.classList.remove('niner-theme-white', 'niner-theme-dark', 'niner-theme-green');
    modalContainer.classList.add(`niner-theme-${theme}`);
}

function renderTray(trayCoursesEL, courses, onRemove) {
    trayCoursesEL.innerHTML = '';

    if (courses.length === 0) {
        trayCoursesEL.innerHTML = '<span class="niner-tray-empty">Add courses to build your calendar export</span>';
        return;
    }

    courses.forEach((course, index) => {
        const chip = document.createElement('div');
        chip.className = 'niner-tray-chip';
        chip.innerHTML = `
            <span class="niner-tray-chip-label">${course.subject} ${course.courseNumber}</span>
            <button class="niner-tray-chip-remove">✕</button>
        `;
        chip.querySelector('.niner-tray-chip-remove').addEventListener('click', () => {
            onRemove(index);
        });
        trayCoursesEL.appendChild(chip);
    });
}

const BANNER_BASE = 'https://selfservice.uncc.edu/StudentRegistrationSsb/ssb/searchResults';

function getSyncToken() {
    return document.querySelector('meta[name="synchronizerToken"]')?.content || '';
}

function bannerPost(endpoint, term, crn) {
    const token = getSyncToken();
    return fetch(`${BANNER_BASE}/${endpoint}`, {
        method: 'POST',
        credentials: 'include',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'X-Requested-With': 'XMLHttpRequest',
            'x-synchronizer-token': token,
        },
        body: `term=${term}&courseReferenceNumber=${crn}`
    }).then(r => r.text());
}

function parseDescription(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const section = doc.querySelector('section[aria-labelledby="courseDescription"]');
    if (!section) return null;
    const text = section.textContent.replace(/\s+/g, ' ').trim();
    return text || null;
}

function parsePrerequisites(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const rows = [...doc.querySelectorAll('tbody tr')];
    if (!rows.length) return null;

    // Group rows into bullet groups: AND starts a new group, OR appends to current
    const groups = [];
    rows.forEach((row) => {
        const cells = [...row.querySelectorAll('td')].map(td => td.textContent.trim());
        const andOr = cells[0].toUpperCase();
        const subject = cells[4] || '';
        const courseNum = cells[5] || '';
        const grade = cells[7] || '';
        const gradeStr = grade ? ` (min grade ${grade})` : '';
        const entry = `${subject} ${courseNum}${gradeStr}`.trim();

        if (!entry.replace(/\s+/g, '')) return;

        if (groups.length === 0 || andOr === 'AND' || andOr === '') {
            groups.push([entry]);
        } else {
            groups[groups.length - 1].push(entry);
        }
    });

    if (!groups.length) return null;

    return groups.map(group => {
        return `<div class="niner-prereq-item">• ${group.join(' <span class="niner-or">or</span> ')}</div>`;
    }).join('');
}

function parseRestrictions(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const fullText = doc.body.textContent.replace(/\s+/g, ' ').trim();
    if (!fullText || fullText.toLowerCase().includes('no restriction') || fullText.toLowerCase().includes('no course restriction')) return null;

    // Split on "Must be enrolled" boundaries into separate bullet points
    const noteMatch = fullText.match(/not all restrictions are applicable\.?/i);
    const note = noteMatch ? `<div class="niner-restrict-note">Note: Not all restrictions are applicable.</div>` : '';

    const cleaned = fullText.replace(/not all restrictions are applicable\.?\s*/i, '');
    const bullets = cleaned.split(/(?=Must be enrolled)/i)
        .map(s => s.trim())
        .filter(Boolean)
        .map(s => `<div class="niner-prereq-item">• ${s}</div>`)
        .join('');

    return note + (bullets || `<div class="niner-prereq-item">${cleaned}</div>`);
}

function populateOverviewTab(overviewEl, data) {
    overviewEl.querySelector('.niner-ov-desc').textContent = data.description || 'N/A';

    const prereqEl = overviewEl.querySelector('.niner-ov-prereq');
    if (data.prerequisites) {
        prereqEl.innerHTML = data.prerequisites;
    } else {
        prereqEl.textContent = 'N/A';
    }

    const restrictEl = overviewEl.querySelector('.niner-ov-restrict');
    if (data.restrictions) {
        restrictEl.innerHTML = data.restrictions;
    } else {
        restrictEl.textContent = 'N/A';
    }
}

function buildOverviewTabShell(courseData, rmpUrl) {
    return `
        <div class="niner-ov-block">
            <div class="niner-ov-label">Description</div>
            <div class="niner-ov-text niner-ov-desc">Loading...</div>
        </div>
        <div class="niner-ov-block">
            <div class="niner-ov-label">Prerequisites</div>
            <div class="niner-ov-text niner-ov-prereq">Loading...</div>
        </div>
        <div class="niner-ov-block">
            <div class="niner-ov-label">Restrictions</div>
            <div class="niner-ov-text niner-ov-restrict">Loading...</div>
        </div>
        <div class="niner-ov-links">
            <a class="niner-link niner-link-coursicle" href="https://www.coursicle.com/uncc/courses/${courseData.subject}/${courseData.courseNumber}/" target="_blank">
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                Coursicle
            </a>
            <a class="niner-link niner-link-rmp" href="${rmpUrl}" target="_blank">
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                RateMyProfessors
            </a>
        </div>
    `;
}

function loadCourseDetails(row, callback) {
    const link = row.querySelector('a.section-details-link');
    if (!link) {
        callback({ description: null, prerequisites: null, restrictions: null });
        return;
    }

    const [term, crn] = link.dataset.attributes.split(',');

    Promise.all([
        bannerPost('getCourseDescription', term, crn),
        bannerPost('getSectionPrerequisites', term, crn),
        bannerPost('getRestrictions', term, crn),
    ]).then(([descHtml, prereqHtml, restrictHtml]) => {
        callback({
            description: parseDescription(descHtml),
            prerequisites: parsePrerequisites(prereqHtml),
            restrictions: parseRestrictions(restrictHtml),
        });
    }).catch(() => {
        callback({ description: null, prerequisites: null, restrictions: null });
    });
}

function calcGPA(grades) {
    const points = { A: 4.0, B: 3.0, C: 2.0, D: 1.0, F: 0.0 };
    let totalPoints = 0;
    let totalGraded = 0;
    for (const [letter, pts] of Object.entries(points)) {
        const count = grades[letter] || 0;
        totalPoints += pts * count;
        totalGraded += count;
    }
    if (totalGraded === 0) return null;
    return (totalPoints / totalGraded).toFixed(2);
}

function buildGradeChart(gradeData, semesterKey, theme) {
    const grades = semesterKey === 'all' ? gradeData.all : gradeData.semesters[semesterKey];
    if (!grades) return '<div class="niner-grade-empty">No data for this semester.</div>';

    const labels = ['A', 'B', 'C', 'D', 'F', 'W'];
    const colors = {
        A: '#2ca25f',
        B: '#74c476',
        C: '#e9a400',
        D: '#fd8d3c',
        F: '#de2d26',
        W: '#969696'
    };

    const values = labels.map(l => grades[l] || 0);
    const total = values.reduce((a, b) => a + b, 0);
    const maxVal = Math.max(...values, 1);
    const gpa = calcGPA(grades);

    const chartW = 480;
    const chartH = 160;
    const barW = 44;
    const gap = 28;
    const startX = 40;
    const topPad = 16;
    const bottomPad = 32;
    const availH = chartH - topPad - bottomPad;

    // Pick clean round step so Y axis labels are always tidy
    function niceStep(v) {
        if (v <= 0) return 10;
        const raw = v / 5;
        const mag = Math.pow(10, Math.floor(Math.log10(raw)));
        for (const c of [1, 2, 5, 10, 25, 50, 100, 250, 500]) {
            if (c * mag >= raw) return c * mag;
        }
        return Math.ceil(raw / mag) * mag;
    }
    const gridStep = niceStep(maxVal);
    const gridMax = gridStep * Math.ceil(maxVal / gridStep);
    const gridVals = [];
    for (let v = 0; v <= gridMax; v += gridStep) gridVals.push(v);

    const gridLines = gridVals.map(val => {
        const y = topPad + availH * (1 - val / gridMax);
        const lineColor = (theme === 'dark' || theme === 'green') ? 'rgba(255,255,255,0.15)' : 'rgba(16,24,32,0.12)';
        const textColor = (theme === 'dark' || theme === 'green') ? 'rgba(255,255,255,0.5)' : 'rgba(16,24,32,0.45)';
        return `<line x1="${startX}" y1="${y}" x2="${chartW - 10}" y2="${y}" stroke="${lineColor}" stroke-width="1"/>
                <text x="${startX - 6}" y="${y + 4}" font-size="10" font-family="General-Sans,sans-serif" fill="${textColor}" text-anchor="end">${val}</text>`;
    }).join('');

    const bars = labels.map((label, i) => {
        const val = values[i];
        const barH = val === 0 ? 0 : Math.max(4, (val / gridMax) * availH);
        const x = startX + i * (barW + gap);
        const y = topPad + availH - barH;
        const pct = total > 0 ? ((val / total) * 100).toFixed(1) : '0.0';
        return `
            <rect x="${x}" y="${y}" width="${barW}" height="${barH}" fill="${colors[label]}" rx="3"/>
            <text x="${x + barW/2}" y="${topPad + availH + 16}" font-size="12" font-weight="700" font-family="General-Sans,sans-serif" fill="${(theme === 'dark' || theme === 'green') ? '#ffffff' : '#101820'}" text-anchor="middle">${label}</text>
            ${val > 0 ? `<text x="${x + barW/2}" y="${y - 5}" font-size="10" font-weight="600" font-family="General-Sans,sans-serif" fill="${(theme === 'dark' || theme === 'green') ? 'rgba(255,255,255,0.7)' : 'rgba(16,24,32,0.6)'}" text-anchor="middle">${val}</text>` : ''}
        `;
    }).join('');

    const svgWidth = startX + labels.length * (barW + gap) - gap + 20;

    return `
        <div class="niner-grade-chart-wrap">
            <svg viewBox="0 0 ${svgWidth} ${chartH}" class="niner-grade-svg">
                ${gridLines}
                ${bars}
            </svg>
            <div class="niner-grade-stats-row">
                ${gpa !== null ? `<span>Avg GPA: <strong>${gpa}</strong></span>` : ''}
                <span><strong>${total}</strong> students</span>
            </div>
        </div>
    `;
}

function renderGradeTab(gradeEl, gradeData, courseData, profName, theme) {
    const currentTheme = theme || 'white';
    if (!gradeData) {
        gradeEl.innerHTML = '<div class="niner-grade-empty">No grade data found for this instructor and course.</div>';
        return;
    }

    const semesters = Object.keys(gradeData.semesters);
    const dropdownOptions = ['all', ...semesters].map(s =>
        `<option value="${s}">${s === 'all' ? 'All Semesters' : s}</option>`
    ).join('');

    const semesterKeys = ['all', ...semesters];
    let currentSemester = 'all';

    gradeEl.innerHTML = `
        <div class="niner-grade-header">
            <span class="niner-grade-prof">${gradeData.instructor} · ${courseData.subject} ${courseData.courseNumber}</span>
            <div class="niner-dropdown">
                <button class="niner-dropdown-btn">
                    <span class="niner-dropdown-label">All Semesters</span>
                    <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
                <div class="niner-dropdown-menu">
                    ${semesterKeys.map(s => `<div class="niner-dropdown-item${s === 'all' ? ' active' : ''}" data-val="${s}">${s === 'all' ? 'All Semesters' : s}</div>`).join('')}
                </div>
            </div>
        </div>
        <div class="niner-grade-chart-container">
            ${buildGradeChart(gradeData, 'all', currentTheme)}
        </div>
    `;

    const dropdownBtn = gradeEl.querySelector('.niner-dropdown-btn');
    const dropdownMenu = gradeEl.querySelector('.niner-dropdown-menu');
    const dropdownLabel = gradeEl.querySelector('.niner-dropdown-label');

    dropdownBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdownMenu.classList.toggle('open');
    });

    gradeEl.querySelectorAll('.niner-dropdown-item').forEach(item => {
        item.addEventListener('click', () => {
            currentSemester = item.dataset.val;
            dropdownLabel.textContent = currentSemester === 'all' ? 'All Semesters' : currentSemester;
            gradeEl.querySelectorAll('.niner-dropdown-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            dropdownMenu.classList.remove('open');
            gradeEl.querySelector('.niner-grade-chart-container').innerHTML =
                buildGradeChart(gradeData, currentSemester, currentTheme);
        });
    });

    document.addEventListener('click', function closeDropdown() {
        dropdownMenu.classList.remove('open');
    });
}

function openModal(clickedElement, rmpData) {
    const existingModal = document.getElementById('niner-registration-modal');
    if (existingModal) existingModal.remove();

    const courseData = parseCourseRow(clickedElement);
    const profName = clickedElement.textContent.trim().replace('↗', '').trim();

    const overlay = document.createElement('div');
    overlay.id = 'niner-registration-modal';
    overlay.className = 'niner-modal-overlay';

    const modalContainer = document.createElement('div');
    modalContainer.className = 'niner-modal-container';
    chrome.storage.local.get('ninerTheme', (result) => {
        applyTheme(modalContainer, result.ninerTheme || 'white');
    });

    const meetingHeaderLines = courseData.meetings.map(m => {
        const days = m.days.map(d => d.slice(0, 3)).join('/');
        const loc = [m.building, m.room].filter(Boolean).join(' ');
        return `<div class="niner-modal-meeting">${days} ${m.time}${loc ? ' · ' + loc : ''}</div>`;
    }).join('');

    const rmpUrl = rmpData
        ? `https://www.ratemyprofessors.com/professor/${rmpData.legacyId}`
        : `https://www.ratemyprofessors.com/search/professors/1253?q=${encodeURIComponent(profName)}`;

    modalContainer.innerHTML = `
        <div class="niner-topbar">
            <div class="niner-header">
                <div class="niner-prof">${profName}</div>
                <div class="niner-course">${courseData.subject} ${courseData.courseNumber} · Section ${courseData.section} · ${courseData.credits} Credits</div>
                ${meetingHeaderLines}
            </div>
            <div class="niner-topbar-right">
                <button class="niner-crn-btn" title="Copy CRN">
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                    <span class="niner-crn-val">${courseData.crn}</span>
                </button>
                <button class="niner-close-btn">✕</button>
            </div>
        </div>

        <div class="niner-tabs">
            <button class="niner-tab active" data-tab="overview">Course Overview</button>
            <button class="niner-tab" data-tab="grades">Grade History</button>
        </div>

        <div class="niner-tab-content active" id="niner-tab-overview">
            ${buildOverviewTabShell(courseData, rmpUrl)}
        </div>

        <div class="niner-tab-content" id="niner-tab-grades">
            <div class="niner-grade-loading">Loading grade data...</div>
        </div>

        <div class="niner-modal-footer">
            <span class="niner-credit">© 2026 ninersoftware</span>
        </div>
    `;

    overlay.appendChild(modalContainer);
    document.body.appendChild(overlay);

    modalContainer.querySelector('.niner-close-btn').addEventListener('click', () => overlay.remove());

    const crnBtn = modalContainer.querySelector('.niner-crn-btn');
    crnBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(courseData.crn).then(() => {
            const val = crnBtn.querySelector('.niner-crn-val');
            const orig = val.textContent;
            val.textContent = 'Copied!';
            setTimeout(() => { val.textContent = orig; }, 1500);
        });
    });
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    modalContainer.querySelectorAll('.niner-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            modalContainer.querySelectorAll('.niner-tab').forEach(t => t.classList.remove('active'));
            modalContainer.querySelectorAll('.niner-tab-content').forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            modalContainer.querySelector(`#niner-tab-${tab.dataset.tab}`).classList.add('active');
        });
    });

    const row = clickedElement.closest('tr');
    const overviewEl = modalContainer.querySelector('#niner-tab-overview');
    loadCourseDetails(row, (data) => {
        populateOverviewTab(overviewEl, data);
    });

    const gradeEl = modalContainer.querySelector('#niner-tab-grades');
    getGradeData(courseData.subject, courseData.courseNumber, profName).then(gradeData => {
        chrome.storage.local.get('ninerTheme', (r) => {
            renderGradeTab(gradeEl, gradeData, courseData, profName, r.ninerTheme || 'white');
        });
    });
}

function parseCourseRow(clickedElement) {
    const row = clickedElement.closest('tr');
    console.log('row found:', row);
    if (!row) return null;

    const subject = row.querySelector('[xe-field="subject"]')?.textContent?.trim() || '';
    const courseNumber = row.querySelector('[xe-field="courseNumber"]')?.textContent?.trim() || '';
    const section = row.querySelector('[xe-field="sequenceNumber"]')?.textContent?.trim() || '';
    const crn = row.querySelector('[xe-field="courseReferenceNumber"]')?.textContent?.trim() || '';
    const title = row.querySelector('[xe-field="courseTitle"] a')?.textContent?.trim() || '';
    const credits = row.querySelector('[xe-field="creditHours"]')?.textContent?.trim() || '';

    const meetings = [];
    const meetingElements = row.querySelectorAll('[xe-field="meetingTime"] .meeting');

    meetingElements.forEach(el => {
        const days = [...el.querySelectorAll('.ui-state-highlight')]
            .map(d => d.getAttribute('data-name'));

        const scheduleSpan = el.querySelector('.meeting-schedule > span:not(.ui-pillbox)');
        const time = scheduleSpan ? scheduleSpan.textContent.trim().replace(/\s+/g, ' ') : '';

        const tooltipRows = [...el.querySelectorAll('.tooltip-row')];

        const building = tooltipRows.find(r => r.textContent.includes('Building'))
            ?.textContent.replace('Building:', '').trim() || '';
        const room = tooltipRows.find(r => r.textContent.includes('Room'))
            ?.textContent.replace('Room:', '').trim() || '';
        const startDate = tooltipRows.find(r => r.textContent.includes('Start Date'))
            ?.textContent.replace('Start Date:', '').trim() || '';
        const endDate = tooltipRows.find(r => r.textContent.includes('End Date'))
            ?.textContent.replace('End Date:', '').trim() || '';

        if (days.length > 0) {
            meetings.push({ days, time, building, room, startDate, endDate });
        }
    });

    return { subject, courseNumber, section, crn, title, credits, meetings };
}