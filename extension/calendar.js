function dayToICS(dayName) {
    const map = {
        'Sunday': 'SU',
        'Monday': 'MO',
        'Tuesday': 'TU',
        'Wednesday': 'WE',
        'Thursday': 'TH',
        'Friday': 'FR',
        'Saturday': 'SA'
    };
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
    const parts = cleaned.split(' ');
    const meridiem = parts[parts.length - 1];
    const timePart = parts[0];
    const [hourStr, minuteStr] = timePart.split(':');
    let hour = parseInt(hourStr);
    const minute = minuteStr;
    if (meridiem === 'PM' && hour !== 12) hour += 12;
    if (meridiem === 'AM' && hour === 12) hour = 0;
    const hourPadded = hour.toString().padStart(2, '0');
    return `${hourPadded}${minute}00`;
}

function getStartAndEnd(meeting) {
    const timeParts = meeting.time.split(' - ');
    const startTime = timeToICS(timeParts[0]);
    const endTime = timeToICS(timeParts[1]);
    const startDateICS = dateToICS(meeting.startDate);
    const endDateICS = dateToICS(meeting.endDate);
    return { startTime, endTime, startDateICS, endDateICS };
}

function getFirstOccurrence(semesterStartDate, dayNames) {
    const dayOrder = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const parts = semesterStartDate.split('/');
    const date = new Date(
        parseInt(parts[2]),
        parseInt(parts[0]) - 1,
        parseInt(parts[1])
    );
    const targetDays = dayNames.map(d => dayOrder.indexOf(d));
    const startDay = date.getDay();
    let minOffset = 7;
    targetDays.forEach(target => {
        let offset = (target - startDay + 7) % 7;
        if (offset < minOffset) minOffset = offset;
    });
    date.setDate(date.getDate() + minOffset);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const year = date.getFullYear().toString();
    return `${year}${month}${day}`;
}

function buildICS(courses) {
    let icsContent = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//ninersoftware//Niner-Registration//EN',
        'CALSCALE:GREGORIAN',
        'BEGIN:VTIMEZONE',
        'TZID:America/New_York',
        'BEGIN:STANDARD',
        'DTSTART:19671029T020000',
        'RRULE:FREQ=YEARLY;BYDAY=1SU;BYMONTH=11',
        'TZOFFSETFROM:-0400',
        'TZOFFSETTO:-0500',
        'TZNAME:EST',
        'END:STANDARD',
        'BEGIN:DAYLIGHT',
        'DTSTART:19870405T020000',
        'RRULE:FREQ=YEARLY;BYDAY=2SU;BYMONTH=3',
        'TZOFFSETFROM:-0500',
        'TZOFFSETTO:-0400',
        'TZNAME:EDT',
        'END:DAYLIGHT',
        'END:VTIMEZONE'
    ].join('\r\n');

    courses.forEach((course, courseIndex) => {
        course.meetings.forEach((meeting, meetingIndex) => {
            const { startTime, endTime, endDateICS } = getStartAndEnd(meeting);
            const firstDate = getFirstOccurrence(meeting.startDate, meeting.days);
            const byDay = meeting.days.map(d => dayToICS(d)).join(',');
            const uid = `${course.subject}${course.courseNumber}-${courseIndex}-${meetingIndex}@ninersoftware`;
            const vevent = [
                'BEGIN:VEVENT',
                `UID:${uid}`,
                `DTSTART;TZID=America/New_York:${firstDate}T${startTime}`,
                `DTEND;TZID=America/New_York:${firstDate}T${endTime}`,
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