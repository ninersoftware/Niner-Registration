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

function openModal(clickedElement, rmpData) {
    const existingModal = document.getElementById('niner-registration-modal');
    if (existingModal) {
        existingModal.remove();
    }

    const courseData = parseCourseRow(clickedElement);

    const profName = clickedElement.textContent.trim().replace('↗', '').trim();

    const overlay = document.createElement('div');
    overlay.id = 'niner-registration-modal';
    overlay.className = 'niner-modal-overlay';

    const modalContainer = document.createElement('div');

    modalContainer.className = 'niner-modal-container';
    chrome.storage.local.get('ninerTheme', (result) => {
        const theme = result.ninerTheme || 'white';
        applyTheme(modalContainer, theme);
    });

    const removeAtIndex = (index) => {
        chrome.storage.local.get('ninerQueue', (result) => {
            const queue = result.ninerQueue || [];
            const newQueue = queue.filter((_, i) => i !== index);
            chrome.storage.local.set({ ninerQueue: newQueue });
            renderTray(trayCoursesEL, newQueue, removeAtIndex);

            const stillAdded = newQueue.some(c =>
                c.subject === courseData.subject &&
                c.courseNumber === courseData.courseNumber
            );
            if (!stillAdded) {
                addBtn.textContent ='+ Add';
                addBtn.style.background = '#046A38';
            }
        });
    }


    const meetingLines = courseData.meetings.map(m => {
        const days = m.days.map(d => d.slice(0,3)).join('/');
        return `<span class="niner-modal-meeting">${days} ${m.time} · ${m.building} ${m.room}</span>`;
    }).join('');

    const rmpUrl = rmpData
        ? `https://www.ratemyprofessors.com/professor/${rmpData.legacyId}`
        : `https://www.ratemyprofessors.com/search/professors/1253?q=${encodeURIComponent(clickedElement.textContent.trim().replace('↗', '').trim())}`;

    modalContainer.innerHTML = `
        <div class="niner-topbar">
            <button class="niner-settings-btn">⚙</button>
            <button class="niner-close-btn">✕</button>
        </div>

        <div class="niner-header">
            <div class="niner-prof">${profName}</div>
            <div class="niner-course">${courseData.subject} ${courseData.courseNumber}  ·  ${courseData.credits} Credits</div>
            ${meetingLines}
        </div>

        <div class="niner-divider"></div>

        <div class="niner-grade-section">
            <div class="niner-section-label">Grade Distribution</div>
            <div class="niner-grade-placeholder">Coming soon</div>
        </div>

        <div class="niner-divider"></div>

        <div class="niner-links">
            <a class="niner-link" href="${rmpUrl}" target="_blank">RateMyProfessors ↗</a>
            <a class="niner-link niner-link-coursicle" href="https://www.coursicle.com/uncc/courses/${courseData.subject}/${courseData.courseNumber}/" target="_blank">Coursicle ↗</a>
        </div>

        <div class="niner-divider"></div>

        <div class="niner-tray">
            <button class="niner-tray-add">+ Add</button>
            <div class="niner-tray-courses">
                <span class="niner-tray-empty"> Add courses to build your calendar export</span>
            </div>
            <div class="niner-tray-actions">
                <button class="niner-tray-btn niner-tray-undo">Clear</button>
                <button class="niner-tray-btn niner-tray-export">⬇ .ics</button>
            </div>
        </div>

        <div class="niner-credit">© 2026 ninersoftware</div>    
    `;

    overlay.appendChild(modalContainer);
    document.body.appendChild(overlay);


    modalContainer.querySelector('.niner-close-btn').addEventListener('click', () => overlay.remove());

    modalContainer.querySelector('.niner-settings-btn').addEventListener('click', () => {
    openSettings(modalContainer);
    });

    overlay.addEventListener('click', (event) => {
        if (event.target === overlay) {
            overlay.remove();
        }
    });
       
    const trayCoursesEL = modalContainer.querySelector('.niner-tray-courses');
    const addBtn = modalContainer.querySelector('.niner-tray-add');
    const undoBtn = modalContainer.querySelector('.niner-tray-undo');
    const exportBtn = modalContainer.querySelector('.niner-tray-export');

    chrome.storage.local.get('ninerQueue', (result) => {
        const queue = result.ninerQueue || [];
        renderTray(trayCoursesEL, queue, removeAtIndex);

        const alreadyAdded = queue.some(c =>
            c.subject === courseData.subject &&
            c.courseNumber === courseData.courseNumber
        );
        if (alreadyAdded) {
            addBtn.textContent = '✓ Added';
            addBtn.style.background = '#035a2f';
        }
    });

    addBtn.addEventListener('click', () => {
    chrome.storage.local.get('ninerQueue', (result) => {
        const queue = result.ninerQueue || [];

        const alreadyAdded = queue.some(c =>
            c.subject === courseData.subject &&
            c.courseNumber === courseData.courseNumber
        );

        if (alreadyAdded) {
            const newQueue = queue.filter(c =>
                !(c.subject === courseData.subject &&
                  c.courseNumber === courseData.courseNumber)
            );
            chrome.storage.local.set({ ninerQueue: newQueue });
            renderTray(trayCoursesEL, newQueue, removeAtIndex);
            addBtn.textContent = '+ Add';
            addBtn.style.background = '#046A38';
        } else {
            const courseToSave = {
                subject: courseData.subject,
                courseNumber: courseData.courseNumber,
                title: courseData.title,
                credits: courseData.credits,
                meetings: courseData.meetings
            };
            const newQueue = [...queue, courseToSave];
            chrome.storage.local.set({ ninerQueue: newQueue });
            renderTray(trayCoursesEL, newQueue, removeAtIndex);
            addBtn.textContent = '✓ Added';
            addBtn.style.background = '#035a2f';
        }
    });
});

undoBtn.addEventListener('click', () => {
    chrome.storage.local.set({ ninerQueue: [] });
    renderTray(trayCoursesEL, [], removeAtIndex);
    addBtn.textContent = '+ Add';
    addBtn.style.background = '#046A38';
});

exportBtn.addEventListener('click', () => {
    chrome.storage.local.get('ninerQueue', (result) => {
        const queue = result.ninerQueue || [];
        if (queue.length === 0) return;
        exportToICS(queue);
    });
});
}

function parseCourseRow(clickedElement) {
    const row = clickedElement.closest('tr');
    console.log('row found:', row);
    if (!row) {
        return null;
    }

    const subject =  row.querySelector('[xe-field="subject"]')?.textContent?.trim() || '';
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
                meetings.push({ days, time, building, room, startDate, endDate});
            }
    });

    return {
        subject,
        courseNumber,
        section,
        crn,
        title,
        credits,
        meetings
    };
}