#!/usr/bin/env node

/**
 * Test script to verify real-time delta output
 * Simulates delta processing with timing to ensure real-time display
 */

// Force debug mode
process.env.DEBUG_DELTAS = 'true';
process.env.SHOW_DELTA_MESSAGES = 'true';

console.log('🧪 Testing Real-time Delta Output');
console.log('═'.repeat(80));

// Test immediate output
function testImmediateOutput() {
    console.log('📋 Testing immediate console output...');
    
    for (let i = 1; i <= 5; i++) {
        console.log(`⚡ Console Log ${i} at ${new Date().toISOString()}`);
        
        // Use blocking delay to simulate processing time
        const start = Date.now();
        while (Date.now() - start < 500) {
            // Blocking delay
        }
    }
    
    console.log('\n📋 Testing immediate process.stdout.write...');
    
    for (let i = 1; i <= 5; i++) {
        process.stdout.write(`⚡ Stdout Write ${i} at ${new Date().toISOString()}\n`);
        
        // Use blocking delay to simulate processing time
        const start = Date.now();
        while (Date.now() - start < 500) {
            // Blocking delay
        }
    }
}

// Test with the actual SnowflakeService delta printer
async function testDeltaPrinter() {
    console.log('\n📋 Testing SnowflakeService delta printer...');
    
    // Mock a minimal service with just the printDebugDelta method
    const service = {
        printDebugDelta(deltaIndex, delta) {
            const timestamp = new Date().toISOString().substr(11, 12);
            process.stdout.write(`\n🔍 [${timestamp}] DELTA #${deltaIndex} ═══════════════════════════════════\n`);
            
            if (delta.content && delta.content.length > 0) {
                for (let i = 0; i < delta.content.length; i++) {
                    const content = delta.content[i];
                    process.stdout.write(`  📦 Content[${i}] Type: ${content.type}\n`);
                    
                    switch (content.type) {
                        case 'text':
                            const text = content.text || '';
                            process.stdout.write(`    📝 Text (${text.length} chars): "${text}"\n`);
                            break;
                        case 'thinking':
                            const thinking = content.thinking?.text || content.thinking || 'thinking...';
                            process.stdout.write(`    🤔 Thinking: "${thinking}"\n`);
                            break;
                        case 'tool_use':
                            process.stdout.write(`    🔧 Tool: ${content.tool_use?.name || 'unknown'}\n`);
                            break;
                    }
                }
            }
            
            process.stdout.write(`  🔗 Metadata: ID=${delta.metadata?.id}, Object=${delta.metadata?.object}\n`);
            process.stdout.write(`═══════════════════════════════════════════════════════════════════════\n\n`);
        }
    };
    
    // Create mock deltas
    const mockDeltas = [
        {
            content: [{ type: 'text', text: 'Hello ' }],
            metadata: { id: 'msg_001', object: 'message.delta' }
        },
        {
            content: [{ type: 'text', text: 'world! ' }],
            metadata: { id: 'msg_001', object: 'message.delta' }
        },
        {
            content: [{ type: 'thinking', thinking: { text: 'I need to process this...' } }],
            metadata: { id: 'msg_001', object: 'message.delta' }
        },
        {
            content: [{ type: 'tool_use', tool_use: { name: 'test_tool', input: { query: 'test' } } }],
            metadata: { id: 'msg_001', object: 'message.delta' }
        },
        {
            content: [{ type: 'text', text: 'Final response text.' }],
            metadata: { id: 'msg_001', object: 'message.delta' }
        }
    ];
    
    for (let i = 0; i < mockDeltas.length; i++) {
        const delta = mockDeltas[i];
        
        console.log(`\n🔄 Processing mock delta ${i + 1}...`);
        service.printDebugDelta(i + 1, delta);
        
        // Use setTimeout to simulate real async processing
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
}

async function runTests() {
    try {
        testImmediateOutput();
        await testDeltaPrinter();
        
        console.log('\n✅ Real-time delta output test completed!');
        console.log('💡 If you saw output appearing gradually with delays, real-time output is working.');
        console.log('💡 If all output appeared at once at the end, there\'s still a buffering issue.');
        
    } catch (error) {
        console.error('❌ Error testing real-time deltas:', error.message);
    } finally {
        process.exit(0);
    }
}

// Run the tests
runTests();