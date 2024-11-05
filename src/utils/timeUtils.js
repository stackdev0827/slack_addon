const moment = require('moment-timezone');

const WORK_HOURS_START = 8; // 8 AM
const WORK_HOURS_END = 20; // 8 PM
const FRIDAY_END_HOUR = 20; // 8 PM
const MONDAY_START_HOUR = 8; // 8 AM
const SECONDS_IN_HOUR = 3600;
const SECONDS_IN_DAY = 43200; // 43200 seconds in 12 hours

const calculateResponseTimeInDays = (pingTimestamp, responseTimestamp, userTimeZone) => {
    const start = pingTimestamp;
    const end = responseTimestamp;
    let totalValidSeconds = 0;

    while (start.isBefore(end)) {
        const dayOfWeek = start.isoWeekday(); // 1 = Monday, 7 = Sunday

        // Check if it's Friday after 8 PM
        if (dayOfWeek === 5 && start.hour() >= FRIDAY_END_HOUR) {
            // Move to the next Monday at 8 AM
            start.isoWeekday(8).hour(MONDAY_START_HOUR).minute(0).second(0);
            continue;
        }

        // Check if it's Saturday or Sunday
        if (dayOfWeek === 6 || dayOfWeek === 7) {
            // Move to Monday at 8 AM
            start.isoWeekday(8).hour(MONDAY_START_HOUR).minute(0).second(0);
            continue;
        }

        if (start.hour() >= WORK_HOURS_START && start.hour() < WORK_HOURS_END) {
            totalValidSeconds++; 
        }
        start.add(1, 'second');
    }

    return totalValidSeconds;
};

const calculateElapsedTimeInDays = (pingTimestamp, userTimeZone) => {
    const now = moment().tz(userTimeZone);
    const convertedTimestamp = now.tz(userTimeZone);
    return calculateResponseTimeInDays(pingTimestamp, convertedTimestamp, userTimeZone);
};

const formatResponseTime = (totalSeconds) => {
    let responseTime = "";
    let emoji = "";

    if (totalSeconds < SECONDS_IN_HOUR) {
        responseTime = `${(totalSeconds / 60).toFixed(1)} minutes`;
        emoji = "🟢"; // Green for minutes
    } else if (totalSeconds < SECONDS_IN_DAY) {
        responseTime = `${(totalSeconds / SECONDS_IN_HOUR).toFixed(1)} hours`;
        emoji = "🟡"; // Yellow for hours
    } else {
        responseTime = `${(totalSeconds / SECONDS_IN_DAY).toFixed(1)} days`;
        emoji = "🔴"; // Red for days
    }

    return `${emoji} ${responseTime}`;
};

module.exports = {
    calculateResponseTimeInDays,
    calculateElapsedTimeInDays,
    formatResponseTime
};