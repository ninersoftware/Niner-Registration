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
    const subjectMap = {
        'Computing and Informatics': 'ITSC',
        'Computer Science': 'ITSC',
        'Software and Information Sys': 'ITSC',
        'Mathematics': 'MATH',
        'Statistics': 'STAT',
    };
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const rows = [...doc.querySelectorAll('tbody tr')];
    if (!rows.length) return null;
    const parts = rows.map((row, i) => {
        const cells = [...row.querySelectorAll('td')].map(td => td.textContent.trim());
        const andOr = cells[0] || '';
        const subject = cells[4] || '';
        const courseNum = cells[5] || '';
        const grade = cells[7] || '';
        const code = subjectMap[subject] || subject;
        const gradeStr = grade ? ` (min grade ${grade})` : '';
        const prefix = i === 0 ? '' : `${andOr} `;
        return `${prefix}${code} ${courseNum}${gradeStr}`;
    });
    return parts.join(' ').trim() || null;
}

function parseRestrictions(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const text = doc.body.textContent.replace(/\s+/g, ' ').trim();
    if (!text || text.toLowerCase().includes('no restriction')) return null;
    return text || null;
}

function populateOverviewTab(overviewEl, data) {
    overviewEl.querySelector('.niner-ov-desc').textContent = data.description || 'N/A';
    overviewEl.querySelector('.niner-ov-prereq').textContent = data.prerequisites || 'N/A';
    overviewEl.querySelector('.niner-ov-restrict').textContent = data.restrictions || 'N/A';
}

function buildOverviewTabShell() {
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
                <div class="niner-course">${courseData.subject} ${courseData.courseNumber} · ${courseData.credits} Credits</div>
                ${meetingHeaderLines}
            </div>
            <button class="niner-close-btn">✕</button>
        </div>

        <div class="niner-tabs">
            <button class="niner-tab active" data-tab="overview">Course Overview</button>
            <button class="niner-tab" data-tab="grades">Grade History</button>
        </div>

        <div class="niner-tab-content active" id="niner-tab-overview">
            ${buildOverviewTabShell()}
        </div>

        <div class="niner-tab-content" id="niner-tab-grades">
            <div class="niner-grade-placeholder-wrap">
                <span class="niner-grade-placeholder">Coming soon</span>
            </div>
        </div>

        <div class="niner-modal-footer">
            <a class="niner-link niner-link-coursicle" href="https://www.coursicle.com/uncc/courses/${courseData.subject}/${courseData.courseNumber}/" target="_blank">Coursicle ↗</a>
            <span class="niner-credit">© 2026 ninersoftware</span>
        </div>
    `;

    overlay.appendChild(modalContainer);
    document.body.appendChild(overlay);

    modalContainer.querySelector('.niner-close-btn').addEventListener('click', () => overlay.remove());
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