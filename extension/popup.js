// Tab switching
document.querySelectorAll('.popup-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.popup-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(`tab-${tab.getAttribute('data-tab')}`).classList.add('active');
    });
});

// Load calendar queue
function renderCalendar(queue) {
    const container = document.getElementById('cal-list-container');
    const actions = document.getElementById('cal-actions');

    if (queue.length === 0) {
        container.innerHTML = '<p class="cal-empty">No courses added yet. Hover over a professor to add a course.</p>';
        actions.style.display = 'none';
        return;
    }

    actions.style.display = 'flex';

    const list = document.createElement('div');
    list.className = 'cal-course-list';

    queue.forEach((course, index) => {
        const item = document.createElement('div');
        item.className = 'cal-course-item';

        const firstMeeting = course.meetings?.[0];
        const days = firstMeeting?.days?.map(d => d.slice(0,3)).join('/') || '';
        const time = firstMeeting?.time || '';

        item.innerHTML = `
            <div class="cal-course-info">
                <span class="cal-course-name">${course.subject} ${course.courseNumber}</span>
                <span class="cal-course-time">${days} ${time}</span>
            </div>
            <button class="cal-remove" data-index="${index}">✕</button>
        `;
        list.appendChild(item);
    });

    container.innerHTML = '';
    container.appendChild(list);

    document.querySelectorAll('.cal-remove').forEach(btn => {
        btn.addEventListener('click', () => {
            const index = parseInt(btn.getAttribute('data-index'));
            chrome.storage.local.get('ninerQueue', (result) => {
                const q = result.ninerQueue || [];
                const newQueue = q.filter((_, i) => i !== index);
                chrome.storage.local.set({ ninerQueue: newQueue });
                renderCalendar(newQueue);
            });
        });
    });
}

chrome.storage.local.get('ninerQueue', (result) => {
    renderCalendar(result.ninerQueue || []);
});

document.getElementById('cal-clear').addEventListener('click', () => {
    chrome.storage.local.set({ ninerQueue: [] });
    renderCalendar([]);
});

document.getElementById('cal-export').addEventListener('click', () => {
    chrome.storage.local.get('ninerQueue', (result) => {
        const queue = result.ninerQueue || [];
        if (queue.length === 0) return;

        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            chrome.scripting.executeScript({
                target: { tabId: tabs[0].id },
                func: (q) => { exportToICS(q); },
                args: [queue]
            });
        });
    });
});

function updateSwatches(theme) {
    document.querySelectorAll('.theme-swatch').forEach(s => {
        s.classList.remove('active-white', 'active-dark', 'active-green');
    });
    const active = document.querySelector(`[data-theme="${theme}"]`);
    if (active) active.classList.add(`active-${theme}`);
}

chrome.storage.local.get('ninerTheme', (result) => {
    updateSwatches(result.ninerTheme || 'white');
});

document.querySelectorAll('.theme-swatch').forEach(swatch => {
    swatch.addEventListener('click', () => {
        const theme = swatch.getAttribute('data-theme');
        chrome.storage.local.set({ ninerTheme: theme });
        updateSwatches(theme);
        
        document.body.className = `theme-${theme}`;
    });
});