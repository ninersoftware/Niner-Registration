let _gradesData = null;

async function loadGrades() {
    if (_gradesData) return _gradesData;
    const url = chrome.runtime.getURL('extension/data/grades.json');
    const res = await fetch(url);
    _gradesData = await res.json();
    return _gradesData;
}

function normalizeInstructor(name) {
    return name.toLowerCase().replace(/\s+/g, ' ').trim();
}

async function getGradeData(subject, courseNumber, instructorName) {
    const data = await loadGrades();
    const key = `${subject}-${courseNumber}`;
    const courseData = data[key];
    if (!courseData) return null;

    // Try exact match first, then normalized
    const normTarget = normalizeInstructor(instructorName);
    for (const [name, grades] of Object.entries(courseData)) {
        if (normalizeInstructor(name) === normTarget) {
            return { instructor: name, ...grades };
        }
    }

    // Partial last-name fallback
    const targetLast = normTarget.split(' ').pop();
    for (const [name, grades] of Object.entries(courseData)) {
        if (normalizeInstructor(name).split(' ').pop() === targetLast) {
            return { instructor: name, ...grades };
        }
    }

    return null;
}