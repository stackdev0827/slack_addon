const axios = require('axios');
const moment = require('moment-timezone');
const Ping = require('../models/pingModel');

const { formatResponseTime } = require('../utils/timeUtils');

// To get User's Details
const getUserDetails = async (userId) => {
    const response = await axios.get(`https://slack.com/api/users.info`, {
        headers: {
            // 'Authorization': `Bearer ${process.env.SLACK_BOT_TOKEN_CLIENT}`
            'Authorization': `Bearer ${process.env.SLACK_BOT_TOKEN}`
        },
        params: { user: userId }
    });
    if (response.data.ok) {
        return {
            timeZone: response.data.user.tz,
            displayName: response.data.user.profile.display_name || response.data.user.profile.real_name
        };
    }
    throw new Error('Could not fetch user details');
};

// To get all Channel's Members
const getChannelMembers = async (channelId) => {
    const response = await axios.get(`https://slack.com/api/conversations.members`, {
        headers: {
            // 'Authorization': `Bearer ${process.env.SLACK_BOT_TOKEN_CLIENT}`
            'Authorization': `Bearer ${process.env.SLACK_BOT_TOKEN}`
        },
        params: { channel: channelId }
    });
    if (response.data.ok) {
        return response.data.members;
    }
    throw new Error('Could not fetch channel members');
};

const getChannelDetails = async (channelId) => {
    const response = await axios.get(`https://slack.com/api/conversations.info`, {
        headers: {
            // 'Authorization': `Bearer ${process.env.SLACK_BOT_TOKEN_CLIENT}`,
            'Authorization': `Bearer ${process.env.SLACK_BOT_TOKEN}`,
        },
        params: { channel: channelId },
    });

    // Check if the response is OK
    if (response.data.ok) {
        return {
            channelName: response.data.channel.name,
            channelId: response.data.channel.id,
        };
    }
    throw new Error(`Error fetching channel details: ${response.data.error}`);
};

const handleMessage = async (message) => {
    const { text = "", user, channel, ts, thread_ts } = message;
    let ccIndex = -1;
    // const botId = process.env.SLACK_BOT_USER_ID_CLIENT;
    const botId = process.env.SLACK_BOT_USER_ID;

    if (text.includes(`!this`)) {
        return;
    }

    const cleanedText = text
        .replace(new RegExp(`<@${user}>`, 'g'), '') // Remove user mention
        .replace(new RegExp(`<@${botId}>`, 'g'), '') // Remove bot mention

    if(cleanedText)
        ccIndex = cleanedText.indexOf('cc');
    const mentionedUsers = cleanedText.match(/<@(\w+)>/g) || [];

    const ccMentionedUsers = [];

    // Handle @channel mentions
    if (cleanedText.includes('!channel')) {
        const channelMembers = await getChannelMembers(channel);
        for (const memberId of channelMembers) {
            if(memberId == botId)
                continue;
            if(memberId == user)
                continue;
            const userDetails = await getUserDetails(memberId);
            const channelDetails = await getChannelDetails(channel);
            const now = moment().tz(userDetails.timeZone);

            const ping = new Ping({
                userId: memberId,
                userName: userDetails.displayName,
                channelId: channel,
                channelName: channelDetails.channelName,
                originalMessage: trimMessage(text, memberId, userDetails.displayName),
                messageTimeStamp: now,
                responded: false,
                responseMessage: "",
                responseTimestamp: now,
                timeZone: userDetails.timeZone,
                threadTs: thread_ts,
                ts : ts
            });

            await ping.save();
            console.log(`${now}: Ping saved for @${userDetails.displayName} in #${channel}: ${ping.originalMessage} `);
        }
        return;
    }

    else{
        for (const mention of mentionedUsers) {
            const mentionedUserId = mention.replace(/<@/, '').replace(/>/, '');
    
            const mentionIndex = cleanedText.indexOf(mention);
            if (ccIndex !== -1 && mentionIndex > ccIndex) {
                ccMentionedUsers.push(mentionedUserId);
            } else {
                const userDetails = await getUserDetails(mentionedUserId);
                const channelDetails = await getChannelDetails(channel);
                const now = moment().tz(userDetails.timeZone);
    
                const ping = new Ping({
                    userId: mentionedUserId,
                    userName: userDetails.displayName,
                    channelId: channel,
                    channelName: channelDetails.channelName,
                    originalMessage: trimMessage(text, mentionedUserId, userDetails.displayName),
                    messageTimeStamp: now,
                    responded: false,
                    responseMessage: "",
                    responseTimestamp: now,
                    timeZone: userDetails.timeZone,
                    threadTs: thread_ts,
                    ts : ts
                });
    
                await ping.save();
                console.log(`${now}: Ping saved for @${userDetails.displayName} in #${channel}: ${ping.originalMessage} `);
            }
        }
    }

    if (ccMentionedUsers.length > 0) {
        console.log(`Skipped counting for users: ${ccMentionedUsers.join(', ')}`);
    }

    await handleResponse(message);
};

const handleResponse = async (message) => {
    const { user, channel, thread_ts, text } = message;
    console.log(thread_ts)
    if (thread_ts) {
        const ping = await Ping.findOne({ threadTs: thread_ts, userId: user, channelId: channel, responded: false });
        if(ping){
            ping.responded = true;
            ping.responseMessage = trimMessage(text);
            ping.responseTimestamp = moment().tz(ping.timeZone);
            await ping.save();
            console.log(`Response recorded for ${ping.userId}`);
        }
    }
    else{
        const pings = await Ping.find({ userId: user, channelId: channel, responded: false }).sort({messageTimeStamp: -1});
        if(pings){
            for(const ping of pings){
                ping.responded = true;
                ping.responseMessage = trimMessage(text);
                ping.responseTimestamp = moment().tz(ping.timeZone);
                await ping.save();
                console.log(`Response recorded for ${ping.userId}`);
            }
        }
    }
};

const handleEmojiResponse = async (message) => {
    const { user, item } = message;
    console.log(message)
    if (item.type === 'message') {
        const ping = await Ping.findOne({ userId: user, threadTs: item.ts, channelId: item.channel, responded: false });
        if (ping) {
            ping.responded = true;
            ping.responseTimestamp = new Date();
            await ping.save();
            console.log(`Emoji response recorded for ${ping.userName}: ${ping.originalMessage}`);
        }
    }
};

const displayLeaderboard = async (data, expandedUserIds) => {
    let blocks = [];

    blocks.push({
        type: 'section',
        text: {
            type: 'mrkdwn',
            text: `*Leaderboard*`
        }
    });

    for (const userId in data) {
        const userAvgTime = data[userId].averageResponseTime;
        const userLink = `<https://chainlabs-ai.slack.com/team/${userId}|@${data[userId].userName}>`;

        blocks.push({
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: `${userLink} ${userAvgTime} days average response time`
            }
        });
        blocks.push({
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: `Unresponded messages:`
            }
        });

        const unresponded = data[userId]?.unresponded || [];
        unresponded.sort((a, b) => b.elapsedTime - a.elapsedTime);

        const isExpanded = expandedUserIds.includes(userId);
        const messagesToShow = isExpanded ? unresponded : unresponded.slice(0, 4);

        for (const msg of messagesToShow) {
            const eachResponseTime = formatResponseTime(msg.elapsedTime);
            const channelLink = `<https://chainlabs-ai.slack.com/archives/${msg.channelId}|#${msg.channelName}>`;
            const messageLink = msg.threadTs ? `<https://chainlabs-ai.slack.com/archives/${msg.channelId}/p${msg.threadTs.replace('.', '')}|${msg.originalMessage}>` : `<https://chainlabs-ai.slack.com/archives/${msg.channelId}/p${msg.ts.replace('.', '')}|${msg.originalMessage}>`;

            blocks.push({
                type: 'context',
                elements: [
                    {
                        type: 'mrkdwn',
                        text: `- ${eachResponseTime}: ${channelLink} ${messageLink}`
                    }
                ]
            });
        }

        // Determine button type based on expansion state
        const buttonText = isExpanded ? "Collapse" : `${unresponded.length - 4} more`;
        const buttonActionId = isExpanded ? 'collapse_button' : 'expand_button';

        // Add button only if there are more than 4 messages or it's already expanded
        if (unresponded.length > 4 || isExpanded) {
            blocks.push({
                type: 'actions',
                elements: [
                    {
                        type: 'button',
                        text: {
                            type: 'plain_text',
                            text: buttonText,
                            emoji: true
                        },
                        value: `toggle_${userId}`,
                        action_id: buttonActionId
                    }
                ]
            });
        }

        blocks.push({ type: 'divider' });
    }

    return blocks;
};

const trimMessage = (message, userID, userName) => {
    // Replace "!channel" with "@channel"
    if (message.includes('!channel')) {
        const originalMessage = message.replace(/<!channel>/g, '@channel');
        message = originalMessage;
    }

    // Regex to match user mentions
    const userMentionRegex = /<@(\w+)>/g;

    // Regex to match "cc" mentions
    const ccRegex = /cc\s+<@\w+>\s*/g;
    const cleanedMessage = message.replace(ccRegex, '').trim();

    // Replace mentions with user names
    const finalMessage = cleanedMessage.replace(userMentionRegex, (match) => {
        const mentionedUserID = match.match(/<@(\w+)>/)[1];
        return mentionedUserID === userID ? "@" + userName : '';
    });

    // Limit the message to 20 characters
    const trimmedMessage = finalMessage.length > 20 ? finalMessage.slice(0, 20) + '...' : finalMessage;
    return trimmedMessage;
};



module.exports = { handleMessage, handleResponse, handleEmojiResponse, displayLeaderboard, trimMessage };