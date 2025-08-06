#!/usr/bin/env node

/**
 * Test script for debug delta printing functionality
 * Tests the real-time delta debugging features
 */

require('dotenv').config({ path: './config/.env' });

// Force debug mode for this test
process.env.DEBUG_DELTAS = 'true';
process.env.SHOW_DELTA_MESSAGES = 'true';
process.env.VERBOSE_DELTA_LOGGING = 'true';

const SnowflakeService = require('../src/services/snowflakeService');

async function testDebugDeltas() {
    try {
        console.log('🧪 Testing Debug Delta Printing Functionality');
        console.log('═'.repeat(80));
        console.log('📋 Environment Variables:');
        console.log(`  DEBUG_DELTAS: ${process.env.DEBUG_DELTAS}`);
        console.log(`  SHOW_DELTA_MESSAGES: ${process.env.SHOW_DELTA_MESSAGES}`);
        console.log(`  VERBOSE_DELTA_LOGGING: ${process.env.VERBOSE_DELTA_LOGGING}`);
        console.log('═'.repeat(80));

        // Initialize Snowflake service
        const snowflakeService = new SnowflakeService();
        
        console.log('\n🔍 Testing with simple query to generate deltas...');
        console.log('💡 This will show each delta chunk as it arrives in real-time');
        console.log('⏱️  Watch for detailed delta debugging output below:\n');

        // Test with a simple query that should generate deltas
        const testQuery = "Show me the count of policies by product type";
        
        const result = await snowflakeService.queryWithCortexAgents(testQuery);
        
        console.log('\n🎯 Final Result Summary:');
        console.log('═'.repeat(50));
        if (result.summary) {
            console.log('📊 Summary:', result.summary.substring(0, 200) + '...');
        }
        if (result.data && result.data.length > 0) {
            console.log(`📈 Data Records: ${result.data.length}`);
        }
        if (result.sql) {
            console.log('🔍 SQL Generated: Yes');
        }
        console.log('═'.repeat(50));
        
        console.log('\n✅ Debug delta test completed!');
        console.log('💡 If you saw detailed delta debugging output above, the feature is working correctly.');
        
    } catch (error) {
        console.error('❌ Error testing debug deltas:', error.message);
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
testDebugDeltas();