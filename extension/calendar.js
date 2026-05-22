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
    const parts = dataStr.split('/');
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
    const startTime = timeToICS(timeparts[0]);
    const endTime = timeToICS(timeParts[1]);
    const startDateICS = dateToICS(meeting.startDate);
    const endDateICS = dateToICS(meeting.endDate);
    return { startTime, endTime, startDateICS, endDateICS};
}