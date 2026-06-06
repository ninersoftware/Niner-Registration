function getRatingColor(rating) {
    if (rating >= 4.0) return '#2ca25f';
    else if (rating >= 3.0) return '#e9a400';
    else return '#de2d26';
}

function applyTooltipTheme(stats, theme) {
    const isLight = theme === 'white';
    const textColor = isLight ? '#000000' : '#ffffff';
    const borderColor = isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.15)';
    const lastReviewColor = isLight ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.6)';

    if (theme === 'dark') stats.style.background = '#000000';
    else if (theme === 'green') stats.style.background = '#046A38';
    else {
        stats.style.background = '#ffffff';
        stats.style.boxShadow = '0 4px 16px rgba(0,0,0,0.15)';
    }

    stats.style.color = textColor;

    const fullName = stats.querySelector('.professor-full-name');
    const details = stats.querySelectorAll('.rating-details span');
    const header = stats.querySelector('.professor-header');
    const lastReview = stats.querySelector('.last-review');

    if (fullName) fullName.style.color = textColor;
    if (header) header.style.borderBottomColor = borderColor;
    if (lastReview) lastReview.style.color = lastReviewColor;
    details.forEach(s => s.style.color = textColor);

    const calBtn = stats.querySelector('.tooltip-cal-btn');
    const expandBtn = stats.querySelector('.tooltip-expand-btn');
    const defaultColor = isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.6)';
    const hoverColor = isLight ? 'rgba(0,0,0,0.85)' : '#ffffff';
    const hoverBg = isLight ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.1)';

    [calBtn, expandBtn].forEach(btn => {
        if (!btn) return;
        btn.style.color = defaultColor;
        btn.onmouseenter = () => {
            btn.style.color = hoverColor;
            btn.style.background = hoverBg;
        };
        btn.onmouseleave = () => {
            btn.style.color = defaultColor;
            btn.style.background = 'none';
        };
    });
}

const calendarIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="12" y1="14" x2="12" y2="18"/><line x1="10" y1="16" x2="14" y2="16"/></svg>`;

function syncCalBtn(calBtn, courseData) {
    chrome.storage.local.get('ninerQueue', (result) => {
        const queue = result.ninerQueue || [];
        const isAdded = queue.some(c =>
            c.subject === courseData.subject &&
            c.courseNumber === courseData.courseNumber
        );
        calBtn.innerHTML = isAdded ? `${calendarIconSvg} ✓ Added` : `${calendarIconSvg} Add`;
        calBtn.title = isAdded ? 'Added to calendar' : 'Add to calendar';
    });
}

function setupCalBtn(calBtn, overview) {
    calBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        const courseData = parseCourseRow(overview);
        if (!courseData) return;
        chrome.storage.local.get('ninerQueue', (result) => {
            const queue = result.ninerQueue || [];
            const alreadyAdded = queue.some(c =>
                c.subject === courseData.subject &&
                c.courseNumber === courseData.courseNumber
            );
            if (!alreadyAdded) {
                const courseToSave = {
                    subject: courseData.subject,
                    courseNumber: courseData.courseNumber,
                    title: courseData.title,
                    credits: courseData.credits,
                    meetings: courseData.meetings
                };
                chrome.storage.local.set({ ninerQueue: [...queue, courseToSave] });
                calBtn.innerHTML = `${calendarIconSvg} ✓ Added`;
                calBtn.title = 'Added to calendar';
            } else {
                const newQueue = queue.filter(c =>
                    !(c.subject === courseData.subject &&
                    c.courseNumber === courseData.courseNumber)
                );
                chrome.storage.local.set({ ninerQueue: newQueue });
                calBtn.innerHTML = `${calendarIconSvg} Add`;
                calBtn.title = 'Add to calendar';
            }
        });
    });

    // Initial state
    const courseData = parseCourseRow(overview);
    if (courseData) syncCalBtn(calBtn, courseData);

    // Register for external queue changes (Clear All, popup remove)
    calBtn._ninerCourseData = () => parseCourseRow(overview);
}

function injectOverview(cell, data, originalName) {
    const overview = document.createElement('div');
    overview.className = 'professor-container';
    const ratingColor = getRatingColor(data.avgRating);
    const lastReview = data.lastRating
        ? new Date(data.lastRating.replace(' +0000 UTC', 'Z').replace(' ', 'T')).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
        : null;
    const wouldTakeAgain = data.wouldTakeAgainPercent === -1
        ? "N/A"
        : `${Math.round(data.wouldTakeAgainPercent)}%`;
    const lowRatings = data.numRatings < 10;

    overview.innerHTML = `
    <span class="professor-name" style="cursor:pointer;">
        <span class="rating-dot" style="background:${ratingColor}"></span>
        ${originalName} ↗
    </span>
    <div class="professor-stats">
        <div class="professor-topbar">
            <button class="tooltip-cal-btn" title="Add to calendar">
                ${calendarIconSvg} Add
            </button>
            <button class="tooltip-expand-btn" title="Detailed view">⤢</button>
        </div>
        <div class="professor-header">
            <span class="professor-full-name"><strong>${data.firstName} ${data.lastName}</strong></span>
        </div>
        <div class="professor-row">
            <div class="rating-box" style="background:${ratingColor}">
                <span class="rating-number">${data.avgRating}</span>
                <span class="rating-label">/ 5</span>
            </div>
            <div class="rating-details">
                <span>Difficulty: <strong>${data.avgDifficulty}</strong></span>
                <span><strong>${wouldTakeAgain}</strong> would take again</span>
                <span><strong>${data.numRatings}</strong> ratings</span>
            </div>
        </div>
        ${lowRatings ? `<span class="low-ratings-warning"><strong>⚠️ Low rating count</strong></span>` : ''}
        ${lastReview ? `<span class="last-review"><strong>Last reviewed: <em>${lastReview}</em></strong></span>` : ''}
    </div>
    `;

    cell.innerHTML = '';
    cell.appendChild(overview);

    const link = overview.querySelector('.professor-name');
    link.style.setProperty('color', '#2e6da4', 'important');
    link.addEventListener('click', (event) => {
        event.preventDefault();
        window.open(`https://www.ratemyprofessors.com/professor/${data.legacyId}`, '_blank');
    });

    const expandBtn = overview.querySelector('.tooltip-expand-btn');
    expandBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        openModal(overview.querySelector('.professor-name'), data);
    });
    expandBtn.addEventListener('mouseenter', () => {
        const row = overview.closest('tr');
        if (row) prefetchCourseDetails(row);
    });

    setupCalBtn(overview.querySelector('.tooltip-cal-btn'), overview);

    chrome.storage.local.get('ninerTheme', (result) => {
        applyTooltipTheme(overview.querySelector('.professor-stats'), result.ninerTheme || 'white');
    });

    overview.addEventListener('mouseenter', () => {
        const stats = overview.querySelector('.professor-stats');
        const rect = overview.getBoundingClientRect();
        stats.style.position = 'fixed';
        stats.style.top = (rect.top - 100) + 'px';
        stats.style.left = (rect.right + 5) + 'px';
        if (rect.right + 280 > window.innerWidth) {
            stats.style.left = (rect.left - 270) + 'px';
        }
        if (rect.top < 100) {
            stats.style.top = rect.bottom + 'px';
        }
        const row = overview.closest('tr');
        if (row) prefetchCourseDetails(row);
    });
}

function injectNotFound(cell, name) {
    const overview = document.createElement('div');
    overview.className = 'professor-container';

    overview.innerHTML = `
    <span class="professor-name-plain">
        <span class="rating-dot" style="background:#666"></span>
        ${name} ↗
    </span>
    <div class="professor-stats">
        <div class="professor-topbar">
            <button class="tooltip-cal-btn" title="Add to calendar">
                ${calendarIconSvg} Add
            </button>
            <button class="tooltip-expand-btn" title="Detailed view">⤢</button>
        </div>
        <div class="professor-header">
            <span class="professor-full-name"><strong>${name}</strong></span>
        </div>
        <div class="professor-row">
            <div class="rating-box" style="background:#666">
                <span class="rating-number">N/A</span>
            </div>
            <div class="rating-details">
                <span>No RMP data found</span>
            </div>
        </div>
    </div>
    `;

    cell.innerHTML = '';
    cell.appendChild(overview);

    const expandBtn = overview.querySelector('.tooltip-expand-btn');
    expandBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        openModal(overview.querySelector('.professor-name-plain'), null);
    });
    expandBtn.addEventListener('mouseenter', () => {
        const row = overview.closest('tr');
        if (row) prefetchCourseDetails(row);
    });

    setupCalBtn(overview.querySelector('.tooltip-cal-btn'), overview);

    chrome.storage.local.get('ninerTheme', (result) => {
        applyTooltipTheme(overview.querySelector('.professor-stats'), result.ninerTheme || 'white');
    });

    overview.addEventListener('mouseenter', () => {
        const stats = overview.querySelector('.professor-stats');
        const rect = overview.getBoundingClientRect();
        stats.style.position = 'fixed';
        stats.style.top = (rect.top - 100) + 'px';
        stats.style.left = (rect.right + 5) + 'px';
        if (rect.right + 280 > window.innerWidth) {
            stats.style.left = (rect.left - 270) + 'px';
        }
        if (rect.top < 100) {
            stats.style.top = rect.bottom + 'px';
        }
    });
}

const observer = new MutationObserver(() => {
    const cells = document.querySelectorAll('[xe-field="instructor"]');
    cells.forEach(cell => {
        if (cell.dataset.ninerProcessed) return;
        cell.dataset.ninerProcessed = "true";
        const anchors = cell.querySelectorAll('a.email');
        if (anchors.length > 0) {
            cell.innerHTML = '';
            anchors.forEach(anchor => {
                const name = anchor.textContent.trim();
                const wrapper = document.createElement('div');
                wrapper.textContent = '...';
                cell.appendChild(wrapper);
                try {
                    chrome.runtime.sendMessage({ professorName: name }, (response) => {
                        if (response && response.success) {
                            injectOverview(wrapper, response.data, name);
                        } else {
                            injectNotFound(wrapper, name);
                        }
                    });
                } catch(e) {
                    wrapper.textContent = name;
                    cell.dataset.ninerProcessed = "";
                }
            });
        }
    });
});

observer.observe(document.body, { childList: true, subtree: true });

chrome.storage.local.onChanged.addListener((changes) => {
    if (changes.ninerTheme) {
        const theme = changes.ninerTheme.newValue || 'white';
        document.querySelectorAll('.professor-stats').forEach(stats => {
            applyTooltipTheme(stats, theme);
        });
    }

    if (changes.ninerQueue) {
        const queue = changes.ninerQueue.newValue || [];
        document.querySelectorAll('.tooltip-cal-btn').forEach(btn => {
            if (!btn._ninerCourseData) return;
            const courseData = btn._ninerCourseData();
            if (!courseData) return;
            const isAdded = queue.some(c =>
                c.subject === courseData.subject &&
                c.courseNumber === courseData.courseNumber
            );
            btn.innerHTML = isAdded ? `${calendarIconSvg} ✓ Added` : `${calendarIconSvg} Add`;
            btn.title = isAdded ? 'Added to calendar' : 'Add to calendar';
        });
    }
});