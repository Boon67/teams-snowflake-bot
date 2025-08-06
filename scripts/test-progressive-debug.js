#!/usr/bin/env node

/**
 * Test Progressive Updates with Debug Output
 * 
 * This script tests the progressive message update functionality
 * with detailed debug output to identify response issues.
 */

const { TeamsSnowflakeBot } = require('../src/bot');
const { SnowflakeService } = require('../src/services/snowflakeService');

// Mock context that captures all activity
class DebugContext {
    constructor() {
        this.messageId = 1;
        this.activities = [];
        this.updates = [];
    }

    async sendActivity(activity) {
        const message = {
            id: this.messageId++,
            text: activity.text || activity,
            timestamp: new Date().toISOString(),
            type: 'send'
        };
        
        this.activities.push(message);
        console.log(`📤 SEND: Message #${message.id} (${message.text.length} chars)`);
        console.log(`   Content: ${message.text.substring(0, 150)}...`);
        
        return message;
    }

    async updateActivity(activity) {
        const update = {
            id: activity.id,
            text: activity.text,
            timestamp: new Date().toISOString(),
            type: 'update'
        };
        
        this.updates.push(update);
        console.log(`🔄 UPDATE: Message #${activity.id} (${activity.text.length} chars)`);
        console.log(`   Content: ${activity.text.substring(0, 150)}...`);
        
        return true;
    }

    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    printSummary() {
        console.log('\n📊 ACTIVITY SUMMARY:');
        console.log(`📤 Total activities sent: ${this.activities.length}`);
        console.log(`🔄 Total updates: ${this.updates.length}`);
        
        console.log('\n📋 FULL ACTIVITY LOG:');
        
        // Sort all activities by timestamp
        const allActivities = [
            ...this.activities.map(a => ({...a, action: 'SEND'})),
            ...this.updates.map(u => ({...u, action: 'UPDATE'}))
        ].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        
        allActivities.forEach((activity, index) => {
            console.log(`${index + 1}. ${activity.action} #${activity.id} [${activity.timestamp}]`);
            console.log(`   Text: "${activity.text.substring(0, 100)}..."`);
            console.log(`   Length: ${activity.text.length} chars\n`);
        });
    }
}

async function testProgressiveDebug() {
    console.log('🧪 Testing Progressive Updates with Debug Output...\n');
    
    // Create debug context
    const context = new DebugContext();
    
    // Create mock SnowflakeService
    const mockSnowflakeService = {
        queryWithCortexAgents: async (query, deltaCallback) => {
            console.log(`🔄 Mock Snowflake processing: "${query}"`);
            
            // Simulate some deltas
            if (deltaCallback) {
                const testDeltas = [
                    { content: [{ type: 'text', text: 'Based on the ' }] },
                    { content: [{ type: 'text', text: 'analysis of your ' }] },
                    { content: [{ type: 'text', text: 'insurance policies data, ' }] },
                    { content: [{ type: 'text', text: 'there are 1,247 total policies.' }] }
                ];
                
                for (let i = 0; i < testDeltas.length; i++) {
                    deltaCallback(testDeltas[i]);
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }
            
            // Return mock response with correct structure
            return {
                summary: 'Based on the analysis of your insurance policies data, there are 1,247 total policies.',
                content: 'Based on the analysis of your insurance policies data, there are 1,247 total policies.',
                sql: null,
                data: null,
                insights: 'Your insurance portfolio shows consistent growth patterns.',
                recommendations: 'Consider expanding coverage in high-growth areas.',
                hasSQL: false,
                sqlQuery: null,
                sqlResults: null,
                thinkingMessage: null
            };
        }
    };
    
    const bot = new TeamsSnowflakeBot(mockSnowflakeService, console);
    
    // Test query
    const testQuery = "show me total policies";
    
    console.log(`🔍 Testing query: "${testQuery}"\n`);
    
    try {
        // Process query with streaming
        let deltaCount = 0;
        const deltaCallback = async (delta) => {
            deltaCount++;
            console.log(`📡 DELTA #${deltaCount}: ${JSON.stringify(delta).substring(0, 100)}...`);
        };
        
        const response = await bot.processSnowflakeQueryWithStreaming(testQuery, context, deltaCallback);
        
        console.log(`\n📝 FINAL RESPONSE:`);
        console.log(`   Type: ${typeof response}`);
        console.log(`   Length: ${response?.length || 'null'}`);
        console.log(`   Content: ${JSON.stringify(response).substring(0, 200)}...`);
        
        // Test direct sendLargeResponse
        console.log(`\n🧪 Testing sendLargeResponse directly...`);
        await bot.sendLargeResponse(context, response);
        
    } catch (error) {
        console.error('❌ Test failed:', error);
        console.error('Stack:', error.stack);
    }
    
    // Print summary
    context.printSummary();
    
    // deltaCount is now moved inside the try block
}

// Run the test
testProgressiveDebug().catch(error => {
    console.error('❌ Test script failed:', error);
    process.exit(1);
});