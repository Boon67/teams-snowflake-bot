const dotenv = require('dotenv');
dotenv.config();

const { SnowflakeService } = require('../src/services/snowflakeService');

console.log('🧪 Testing DESCRIBE AGENT Property Extraction\n');

async function testDescribeAgent() {
    const agentName = process.env.CORTEX_AGENTS_AGENT_NAME;
    
    if (!agentName) {
        console.error('❌ No CORTEX_AGENTS_AGENT_NAME configured');
        console.log('Please set CORTEX_AGENTS_AGENT_NAME in your .env file to test agent description parsing.');
        return;
    }
    
    console.log(`📋 Testing agent: ${agentName}\n`);
    
    try {
        const snowflakeService = new SnowflakeService();
        
        // Connect to Snowflake
        console.log('🔌 Connecting to Snowflake...');
        await snowflakeService.connect();
        console.log('✅ Connected to Snowflake\n');
        
        // Enable debug logging temporarily
        const originalDebug = process.env.DEBUG;
        process.env.DEBUG = 'true';
        
        console.log('🔍 Testing getAgentConfiguration...');
        const config = await snowflakeService.getAgentConfiguration(agentName);
        
        // Restore original debug setting
        process.env.DEBUG = originalDebug;
        
        console.log('\n📊 Raw DESCRIBE AGENT Test Results:');
        
        // Test the DESCRIBE AGENT command directly to see raw output
        console.log('🎯 Executing DESCRIBE AGENT command directly...');
        
        const rawResults = await new Promise((resolve, reject) => {
            snowflakeService.connection.execute({
                sqlText: `DESCRIBE AGENT snowflake_intelligence.agents."${agentName}"`,
                complete: (err, stmt, rows) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(rows);
                    }
                }
            });
        });
        
        console.log(`📋 Raw DESCRIBE AGENT Results (${rawResults.length} rows):`);
        if (rawResults.length > 0) {
            console.log('🔍 Column names:', Object.keys(rawResults[0]));
            console.log('\n📄 All rows:');
            rawResults.forEach((row, index) => {
                console.log(`\n  Row ${index + 1}:`);
                Object.entries(row).forEach(([key, value]) => {
                    const displayValue = typeof value === 'object' ? JSON.stringify(value, null, 4) : value;
                    console.log(`    ${key}: ${displayValue}`);
                });
            });
        }
        
        console.log('\n🧪 Testing parseAgentDescription method directly...');
        const testConfig = snowflakeService.parseAgentDescription(rawResults);
        
        console.log('\n📊 Parsed Configuration Results:');
        console.log(`- Agent Spec: ${testConfig.agent_spec ? '✅ Found' : '❌ Not found'}`);
        console.log(`- Tools: ${testConfig.tools ? '✅ Found' : '❌ Not found'}`);
        console.log(`- Response Instruction: ${testConfig.response_instruction ? '✅ Found' : '❌ Not found'}`);
        console.log(`- Tool Resources: ${testConfig.tool_resources ? '✅ Found' : '❌ Not found'}`);
        
        if (testConfig.agent_spec) {
            console.log('\n🎯 Agent Spec Content Preview:');
            const spec = testConfig.agent_spec;
            console.log(`- Model: ${spec.model || 'not specified'}`);
            console.log(`- Tools: ${spec.tools ? `${spec.tools.length} tools` : 'not specified'}`);
            console.log(`- Response Instruction: ${spec.response_instruction ? 'present' : 'not specified'}`);
            console.log(`- Experimental Settings: ${spec.experimental ? 'present' : 'not specified'}`);
        }
        
        console.log('\n🔍 Property Extraction Analysis:');
        console.log('Looking for agent_spec in the following property variations:');
        
        const propertyVariations = ['agent_spec', 'spec', 'AGENT_SPEC', 'SPEC'];
        const foundProperties = [];
        
        rawResults.forEach((row, index) => {
            const property = row.property || row.PROPERTY;
            if (property) {
                foundProperties.push(property);
                if (propertyVariations.some(variant => property.toLowerCase() === variant.toLowerCase())) {
                    console.log(`  ✅ Row ${index + 1}: Found property "${property}" (matches expected)`);
                    const value = row.value || row.VALUE;
                    console.log(`     Value type: ${typeof value}`);
                    if (typeof value === 'string' && value.length > 100) {
                        console.log(`     Value preview: ${value.substring(0, 100)}...`);
                    } else {
                        console.log(`     Value: ${value}`);
                    }
                }
            }
        });
        
        console.log(`\n📋 All properties found: ${foundProperties.join(', ')}`);
        
        // Disconnect
        await snowflakeService.disconnect();
        console.log('\n✅ Test completed successfully!');
        
    } catch (error) {
        console.error('\n❌ Error during agent description test:', error.message);
        if (error.stack) {
            console.error('Stack trace:', error.stack);
        }
    }
}

testDescribeAgent()
    .then(() => {
        console.log('\n🎯 DESCRIBE AGENT Property Extraction Test Complete!');
        console.log('This test shows the actual structure of DESCRIBE AGENT results and how properties are extracted.');
    })
    .catch(console.error);