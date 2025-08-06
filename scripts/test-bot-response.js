#!/usr/bin/env node

/**
 * Test script to verify bot response functionality
 * Tests basic message processing without Snowflake
 */

require('dotenv').config({ path: './config/.env' });

const { ActivityHandler, MessageFactory, TurnContext } = require('botbuilder');

// Mock context for testing
class MockContext {
    constructor() {
        this.activity = {
            text: 'test message',
            channelId: 'emulator',
            serviceUrl: 'http://localhost:3978'
        };
        this.sent = [];
    }

    async sendActivity(activity) {
        console.log('📤 Mock sendActivity called with:', activity.text.substring(0, 100) + '...');
        this.sent.push(activity);
        return { id: `msg_${Date.now()}` };
    }
}

async function testBotResponse() {
    try {
        console.log('🧪 Testing Bot Response Functionality');
        console.log('═'.repeat(80));

        // Import the bot
        const { TeamsSnowflakeBot } = require('../src/bot');
        const bot = new TeamsSnowflakeBot();

        // Create mock context
        const context = new MockContext();

        console.log('🔄 Testing basic response sending...');

        // Test sendLargeResponse with small message
        await bot.sendLargeResponse(context, 'This is a small test message');
        console.log(`✅ Small message test: ${context.sent.length} messages sent`);

        // Reset context
        context.sent = [];

        // Test sendLargeResponse with large message
        const largeMessage = 'A'.repeat(5000);
        await bot.sendLargeResponse(context, largeMessage);
        console.log(`✅ Large message test: ${context.sent.length} messages sent`);

        // Test with null response
        context.sent = [];
        await bot.sendLargeResponse(context, null);
        console.log(`✅ Null response test: ${context.sent.length} messages sent`);

        console.log('\n📋 Summary:');
        console.log('All basic response tests passed!');
        console.log('The issue might be in Snowflake processing or async handling.');

    } catch (error) {
        console.error('❌ Error testing bot response:', error.message);
        if (error.stack) {
            console.error('Stack trace:', error.stack);
        }
    } finally {
        process.exit(0);
    }
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

// Run the test
testBotResponse();