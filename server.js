const { App } = require('@slack/bolt');
const cron = require('node-cron');
require('dotenv').config();
const connectDB = require('./src/config/database');
const Ping = require('./src/models/pingModel');
const { handleMessage, handleResponse, handleEmojiResponse, displayLeaderboard } = require('./src/controllers/messageController');
const { calculateLeaderboard } = require("./src/services/leaderboardService")
const { cleanupOldData } = require('./src/services/cleanupService');

let userMessageDisplayState = {}; // To track the display state for each user

// const app = new App({
//     token: process.env.SLACK_BOT_TOKEN_CLIENT,
//     signingSecret: process.env.SLACK_SIGNING_SECRET_CLIENT
// });

const app = new App({
    token: process.env.SLACK_BOT_TOKEN,
    signingSecret: process.env.SLACK_SIGNING_SECRET
});

(async () => {
    await connectDB();
    
    // Listen for messages in channels
    app.message(async ({ message }) => {
        await handleMessage(message);
    });

    // Listen for reactions in channels
    app.event('reaction_added', async ({ event }) => {
        await handleEmojiResponse(event);
    });

    app.command('/showpings', async ({ command, ack, respond, context }) => {
        await ack();
    
        try {
            // Fetch the pings from the database
            const pings = await Ping.find();
            let responseMessage = 'Current Pings:\n';
            
            if (pings.length === 0) {
                responseMessage = 'No current pings found.';
            } else {
                pings.forEach(ping => {
                    responseMessage += `User: @${ping.userName} in channel: #${ping.channelName} at ${ping.messageTimeStamp}\n`;
                });
            }
    
            // Determine where to post the response
            const channelId = command.channel_id;
            const threadTimestamp = command.thread_ts || command.ts; // Use thread timestamp if available
    
            // Post the response message
            await app.client.chat.postEphemeral({
                token: context.botToken,
                channel: channelId,
                user: command.user_id,
                text: responseMessage,
                thread_ts: threadTimestamp, // Post in thread if applicable
            });
        } catch (error) {
            console.error('Error handling /showpings command:', error);
            await respond({ text: `An error occurred while processing this command: ${error.message}` });
        }
    });

    let leaderboardData = null; // Static variable to hold the leaderboard data
    let expandedUserIds = []; // List to track expanded users
    let leaderboardMessageTimestamp = null; // Variable to keep track of the original leaderboard message timestamp

    app.command('/slacktimer', async ({ command, ack, respond, context }) => {
        await ack();
        try {
            const leaderboardData = await calculateLeaderboard();
            const responseMessage = await displayLeaderboard(leaderboardData, expandedUserIds);
            const result = await app.client.chat.postMessage({
                token: context.botToken,
                channel: command.channel_id,
                user: command.user_id,
                blocks: responseMessage,
                thread_ts: command.thread_ts || command.ts, // Use thread_ts if available
            });

            leaderboardMessageTimestamp = result.ts;
        } catch (error) {
            console.error('Error handling /slacktimer command:', error);
            await respond({ text: `An error occurred: ${error.message}` });
        }
    });

    app.action('expand_button', async ({ body, ack }) => {
        await ack();
        const userId = body.actions[0].value.split('_')[1]; // Extract user ID
    
        if (!expandedUserIds.includes(userId)) {
            expandedUserIds.push(userId);
        }
    
        const leaderboardData = await calculateLeaderboard();
        const updatedMessage = await displayLeaderboard(leaderboardData, expandedUserIds);
        try {
            const result = await app.client.chat.update({
              token: process.env.SLACK_BOT_TOKEN,
            //   token: process.env.SLACK_BOT_TOKEN_CLIENT,
              channel: body.channel.id,
              ts: body.message.ts,
              blocks: updatedMessage,
            });
          } catch (error) {
            console.error('Error updating message:', error);
          }
    });
    
    // Action handler for collapse button
    app.action('collapse_button', async ({ body, ack }) => {
        await ack();
        const userId = body.actions[0].value.split('_')[1]; // Extract user ID
    
        expandedUserIds = expandedUserIds.filter(id => id !== userId);
    
        const leaderboardData = await calculateLeaderboard();
        const updatedMessage = await displayLeaderboard(leaderboardData, expandedUserIds);
        await app.client.chat.update({
            channel: body.channel.id,
            ts: body.message.ts,
            user: body.user.id,
            blocks: updatedMessage,
        });
    });

    // Schedule cleanup every weekend at Sunday
    cron.schedule('0 2 * * 0', async () => {
        await cleanupOldData();
    });
    
    await app.start(process.env.PORT || 3000);
    console.log('⚡️ Slack Bot app is running!');
})();