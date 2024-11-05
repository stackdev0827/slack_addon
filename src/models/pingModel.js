const mongoose = require('mongoose');

const pingSchema = new mongoose.Schema({
    userId: String,
    userName: String,
    channelId: String,
    channelName: String,
    originalMessage: String,
    messageTimeStamp: Date,
    responded: { type: Boolean, default: false },
    responseMessage: String,
    responseTimestamp: Date,
    timeZone: String,
    threadTs: String,
    ts: String,
});

module.exports = mongoose.model('Ping', pingSchema);