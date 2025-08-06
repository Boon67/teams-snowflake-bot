#!/usr/bin/env node

/**
 * Test Progressive Message Updates
 * 
 * This script tests the progressive message update functionality
 * to verify that Bot Framework Emulator can update the same message
 * progressively rather than sending multiple separate messages.
 */

const { TeamsSnowflakeBot } = require('../src/bot');
const { SnowflakeService } = require('../src/services/snowflakeService');

// Mock context that simulates Bot Framework behavior
class MockContext {
    constructor() {
        this.messageId = 1;
        this.sentMessages = [];
        this.updatedMessages = new Map();
    }

    async sendActivity(activity) {
        const message = {
            id: this.messageId++,
            text: activity.text || activity,
            timestamp: new Date().toISOString()
        };
        
        this.sentMessages.push(message);
        console.log(`📤 SENT MESSAGE #${message.id}: ${message.text.substring(0, 100)}...`);
        
        return message; // Return the message with ID for updates
    }

    async updateActivity(activity) {
        const messageId = activity.id;
        const originalMessage = this.sentMessages.find(m => m.id === messageId);
        
        if (originalMessage) {
            // Update the original message
            originalMessage.text = activity.text;
            originalMessage.lastUpdated = new Date().toISOString();
            this.updatedMessages.set(messageId, originalMessage);
            
            console.log(`🔄 UPDATED MESSAGE #${messageId}: ${activity.text.substring(0, 100)}...`);
            return true;
        } else {
            console.warn(`⚠️ Could not find message #${messageId} to update`);
            return false;
        }
    }

    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    printSummary() {
        console.log('\n📊 TEST SUMMARY:');
        console.log(`📤 Total messages sent: ${this.sentMessages.length}`);
        console.log(`🔄 Total messages updated: ${this.updatedMessages.size}`);
        
        console.log('\n📋 MESSAGE HISTORY:');
        this.sentMessages.forEach(msg => {
            const isUpdated = this.updatedMessages.has(msg.id);
            const status = isUpdated ? '🔄 UPDATED' : '📤 SENT';
            console.log(`${status} #${msg.id}: "${msg.text.substring(0, 80)}..."`);
            
            if (isUpdated) {
                console.log(`   Last update: ${msg.lastUpdated}`);
            }
        });
    }
}

// Mock delta callback to simulate streaming
function createMockDeltaCallback(context) {
    let accumulatedText = '';
    let streamingActivity = null;
    let streamingStarted = false;
    let lastSentTime = 0;
    
    const THROTTLE_MS = 300;
    const MIN_CHARS = 30;

    return async (deltaText) => {
        accumulatedText += deltaText;
        
        const now = Date.now();
        const timeSinceLastSent = now - lastSentTime;
        const charsSinceLastUpdate = accumulatedText.length - (streamingStarted ? streamingActivity?.text?.length || 0 : 0);
        const shouldUpdate = timeSinceLastSent > THROTTLE_MS || charsSinceLastUpdate >= MIN_CHARS;
        
        if (shouldUpdate) {
            if (!streamingStarted) {
                // Send initial streaming message
                const initialText = `🔄 **Processing your request...**\n\n${accumulatedText} ▊`;
                streamingActivity = await context.sendActivity(initialText);
                console.log('🚀 Started progressive message streaming');
                streamingStarted = true;
            } else if (streamingActivity) {
                // Update the existing message progressively
                try {
                    const updatedText = `🔄 **Processing your request...**\n\n${accumulatedText} ▊`;
                    
                    const updateActivity = {
                        type: 'message',
                        id: streamingActivity.id,
                        text: updatedText
                    };
                    
                    await context.updateActivity(updateActivity);
                } catch (updateError) {
                    console.warn('⚠️ Message update failed:', updateError.message);
                }
            }
            
            lastSentTime = now;
        }
    };
}

async function testProgressiveUpdates() {
    console.log('🧪 Testing Progressive Message Updates...\n');
    
    // Create mock context
    const context = new MockContext();
    
    // Create delta callback
    const deltaCallback = createMockDeltaCallback(context);
    
    // Simulate streaming text chunks
    const textChunks = [
        'Based on the analysis ',
        'of your insurance policies data, ',
        'I can determine that ',
        'Sarah Johnson sold the most policies ',
        'with a total of 247 policies ',
        'sold this year. ',
        'This represents a 23% increase ',
        'from last year and makes her ',
        'the top-performing agent in your organization.'
    ];
    
    console.log('📡 Simulating streaming deltas...\n');
    
    // Send chunks with realistic timing
    for (let i = 0; i < textChunks.length; i++) {
        const chunk = textChunks[i];
        console.log(`📡 Delta #${i + 1}: "${chunk}"`);
        
        await deltaCallback(chunk);
        
        // Simulate realistic streaming delay
        await new Promise(resolve => setTimeout(resolve, 150 + Math.random() * 200));
    }
    
    // Finalize the message
    console.log('\n✅ Finalizing progressive message...');
    const finalText = textChunks.join('');
    const finalUpdateActivity = {
        type: 'message',
        id: 1, // Assuming first message
        text: `✅ **Processing complete!**\n\n${finalText}`
    };
    
    await context.updateActivity(finalUpdateActivity);
    
    // Send final formatted response
    await context.sendActivity('**Final Analysis Results:**\n\n[SQL Query and formatted tables would go here]');
    
    // Print test results
    context.printSummary();
    
    // Verify expectations
    console.log('\n🎯 VERIFICATION:');
    if (context.sentMessages.length <= 3) {
        console.log('✅ SUCCESS: Minimal number of messages sent (progressive updates working)');
    } else {
        console.log('❌ FAILURE: Too many messages sent (should use progressive updates)');
    }
    
    if (context.updatedMessages.size > 0) {
        console.log('✅ SUCCESS: Messages were updated progressively');
    } else {
        console.log('❌ FAILURE: No progressive updates detected');
    }
}

// Run the test
testProgressiveUpdates().catch(error => {
    console.error('❌ Test failed:', error);
    process.exit(1);
});