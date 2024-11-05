const Ping = require('../models/pingModel');
const { calculateResponseTimeInDays, calculateElapsedTimeInDays } = require('../utils/timeUtils');
const moment = require('moment-timezone');

const calculateLeaderboard = async () => {
    const oneMonthAgo = moment().subtract(1, 'months').startOf('day'); // Get the date for one month ago
    const pings = await Ping.find({
        messageTimeStamp: {
            $gte: oneMonthAgo.toDate(),
        }
    });
    const leaderboard = {};

    pings.forEach(ping => {
        const userId = ping.userId;

        // Initialize user data
        if (!leaderboard[userId]) {
            leaderboard[userId] = {
                totalResponseTime: 0,
                responseCount: 0,
                unresponseCount: 0,
                averageResponseTime: 0,
                unresponded: [],
                userName: ping.userName,
                originalMessage: ping.originalMessage
            };
        }

        let responseTime = null;
        let elapsedTime = null;
        const userTimeZone = ping.timeZone;
        const originalTimestamp = moment(ping.messageTimeStamp).tz(userTimeZone);
        const responseTimestamp = moment(ping.responseTimestamp).tz(userTimeZone);

        if (ping.responded) {
            responseTime = calculateResponseTimeInDays(originalTimestamp, responseTimestamp, ping.timeZone);
            leaderboard[userId].totalResponseTime += parseFloat(responseTime);
            leaderboard[userId].responseCount += 1;
        } else {
            elapsedTime = calculateElapsedTimeInDays(originalTimestamp, ping.timeZone);
            leaderboard[userId].unresponseCount += 1;
            leaderboard[userId].totalResponseTime += parseFloat(elapsedTime);
            leaderboard[userId].unresponded.push({ ...ping._doc, elapsedTime });
        }
    });

    for (const userId in leaderboard) {
        const totalCounts = leaderboard[userId].responseCount + leaderboard[userId].unresponseCount;
        if (totalCounts > 0) {
            leaderboard[userId].averageResponseTime = (leaderboard[userId].totalResponseTime / (totalCounts * 43200)).toFixed(3); // 43200 seconds in 12 hours
        }    
    }
    return leaderboard;
};

module.exports = { calculateLeaderboard };