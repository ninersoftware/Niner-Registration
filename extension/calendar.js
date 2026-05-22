function dayToICS(dayName) {
    const map = {
        'Sunday' : "SU",
        'Monday' : "MO",
        'Tuesday' : "TU",
        'Wednesday' : "WE",
        'Thursday' : "TH",
        'Friday' : "FR",
        'Saturday' : "SA",
    }
    return map[dayName] || '';
}

function dateToICS(dateStr) {
    const parts = dateStr.split('/');
    const month = parts[0];
    const day = parts[1];
    const year = parts[2];
    return `${year}${month}${day}`;
}

function timeToICS(timeStr) {
    const cleaned = timeStr.trim();
    const [time, meridiem] = cleaned.split(' ');
    const [hourStr, minuteStr] = time.split(':');

    let hour = parseInt(hourStr);
    const minute = minuteStr;

    if (meridiem === 'PM' && hour !== 12) {
        hour += 12
    }

    if (meridiem === 'AM' && hour === 12) {
        hour = 0;
    }

    const hourPadded = hour.toString().padStart(2, '0');
    return `${hourPadded}${minute}00`;
}

function getStartAndEnd(meeting) {
    const timeParts = meeting.time.split(' - ');
    const startTime = timeToICS(timeParts[0]);
    const endTime = timeToICS(timeParts[1]);
    const startDateICS = dateToICS(meeting.startDate);
    const endDateICS = dateToICS(meeting.endDate);
    return { startTime, endTime, startDateICS, endDateICS};
}

function buildICS(courses) {
    let icsContent = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//ninersoftware//Niner-Registration//EN',
        'CALSCALE:GREGORIAN'
    ].join('\r\n');

    courses.forEach((course, courseIndex) => {
        course.meetings.forEach((meeting, meetingIndex) => {
            const { startTime, endTime, startDateICS, endDateICS } = getStartAndEnd(meeting);
            const byDay = meeting.days.map(d => dayToICS(d)).join(',');
            const uid = `${course.subject}${course.courseNumber}-${courseIndex}-${meetingIndex}@ninersoftware`;
            const vevent = [
                'BEGIN:VEVENT',
                `UID:${uid}`,
                `DTSTART;TZID=America/New_York:${startDateICS}T${startTime}`,
                `DTEND;TZID=America/New_York:${startDateICS}T${endTime}`,
                `RRULE:FREQ=WEEKLY;BYDAY=${byDay};UNTIL=${endDateICS}T235959Z`,
                `SUMMARY:${course.subject} ${course.courseNumber} - ${course.title}`,
                `LOCATION:${meeting.building} ${meeting.room}`,
                `DESCRIPTION:${course.credits} Credits`,
                'END:VEVENT'
            ].join('\r\n');
            icsContent += '\r\n' + vevent;
        });
    });

    icsContent += '\r\nEND:VCALENDAR';
    return icsContent;
}

function exportToICS(courses) {
    console.log('exportToICS called with', courses);
    if (!courses || courses.length === 0) return;
    const content = buildICS(courses);
    const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'niner-schedule.ics';
    a.click();
    URL.revokeObjectURL(url);
}