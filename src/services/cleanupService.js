const Ping = require('../models/pingModel');
const moment = require('moment-timezone');

const cleanupOldData = async () => {
    const threeMonthsAgo = moment().subtract(3, 'months').toDate(); // Calculate the date three months ago
    await Ping.deleteMany({ messageTimeStamp: { $lt: threeMonthsAgo } }); // Delete old records
    console.log(`Cleanup completed. Deleted records older than ${threeMonthsAgo}`);
};

module.exports = { cleanupOldData };