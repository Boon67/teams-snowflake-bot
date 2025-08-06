const snowflake = require('snowflake-sdk');
const axios = require('axios');

/**
 * SnowflakeService - Core service for Snowflake database and Cortex Agents integration
 * 
 * This service manages all interactions with Snowflake, including:
 * - Database connections with multiple authentication methods
 * - Cortex Agents API integration with real-time streaming
 * - Agent configuration management using DESCRIBE AGENT commands
 * - SQL query execution with context switching
 * - Real-time delta processing for progressive UI updates
 * 
 * Key Features:
 * - Multiple authentication methods (password, keypair, PAT, JWT)
 * - Real-time streaming with Server-Sent Events (SSE)
 * - Dynamic agent configuration using Snowflake's native DESCRIBE AGENT
 * - Automatic database context switching for queries
 * - Comprehensive error handling and logging
 */
class SnowflakeService {
    /**
     * Constructor - Initialize service with configuration and debug settings
     * 
     * Sets up connection configuration, Cortex Agents settings, and debug output
     * for real-time streaming delta processing.
     */
    constructor() {
        this.connection = null;
        this.isConnected = false;
        this.connectionConfig = this.buildConnectionConfig();
        
        // Cortex Agents configuration
        this.cortexConfig = {
            model: process.env.CORTEX_AGENTS_MODEL || 'llama3.3-70b'
        };
        
        // Configure real-time debug output for delta streaming
        if (process.env.DEBUG === 'true' || process.env.DEBUG_DELTAS === 'true') {
            // Force stdout to be line-buffered for immediate output
            if (process.stdout.setEncoding) {
                process.stdout.setEncoding('utf8');
            }
        }
    }

    /**
     * Build Snowflake connection configuration with auto-detected authentication
     * 
     * Supports multiple authentication methods with automatic detection:
     * 1. Keypair authentication (most secure for production)
     * 2. Personal Access Token (PAT)
     * 3. Password authentication (for development)
     * 4. JWT authentication (for service integrations)
     * 
     * @returns {Object} - Snowflake connection configuration
     */
    buildConnectionConfig() {
        const baseConfig = {
            account: process.env.SNOWFLAKE_ACCOUNT,
            username: process.env.SNOWFLAKE_USERNAME,
            database: process.env.SNOWFLAKE_DATABASE,
            schema: process.env.SNOWFLAKE_SCHEMA,
            warehouse: process.env.SNOWFLAKE_WAREHOUSE,
            role: process.env.SNOWFLAKE_ROLE
        };
        
        // Determine authentication method based on available environment variables
        if (process.env.SNOWFLAKE_PRIVATE_KEY_PATH || process.env.SNOWFLAKE_PRIVATE_KEY) {
            // Keypair authentication (recommended for production)
            return this.buildKeypairConfig(baseConfig);
        } else if (process.env.SNOWFLAKE_ACCESS_TOKEN) {
            // Personal Access Token authentication
            return this.buildPATConfig(baseConfig);
        } else if (process.env.SNOWFLAKE_PASSWORD) {
            // Traditional username/password authentication
            return {
                ...baseConfig,
                password: process.env.SNOWFLAKE_PASSWORD,
                authenticator: 'SNOWFLAKE'
            };
        } else {
            throw new Error('No valid Snowflake authentication method configured. Please set up either keypair, PAT token, or password authentication.');
        }
    }

    buildKeypairConfig(baseConfig) {
        let privateKeyPem;
        
        if (process.env.SNOWFLAKE_PRIVATE_KEY_PATH) {
            // Load private key from file
            const fs = require('fs');
            
            try {
                privateKeyPem = fs.readFileSync(process.env.SNOWFLAKE_PRIVATE_KEY_PATH, 'utf8');
            } catch (error) {
                throw new Error(`Failed to load private key from ${process.env.SNOWFLAKE_PRIVATE_KEY_PATH}: ${error.message}`);
            }
        } else if (process.env.SNOWFLAKE_PRIVATE_KEY) {
            // Use private key directly from environment variable
            privateKeyPem = process.env.SNOWFLAKE_PRIVATE_KEY.replace(/\\n/g, '\n');
        }

        // Validate the private key format
        if (!privateKeyPem || !privateKeyPem.includes('-----BEGIN PRIVATE KEY-----')) {
            throw new Error('Private key must be in PKCS8 PEM format (-----BEGIN PRIVATE KEY-----)');
        }

        return {
            ...baseConfig,
            privateKey: privateKeyPem,
            privateKeyPassphrase: process.env.SNOWFLAKE_PRIVATE_KEY_PASSPHRASE,
            authenticator: 'SNOWFLAKE_JWT'
        };
    }

    buildPATConfig(baseConfig) {
        return {
            ...baseConfig,
            token: process.env.SNOWFLAKE_ACCESS_TOKEN,
            authenticator: 'OAUTH'
        };
    }

    getAuthenticationMethod() {
        if (process.env.SNOWFLAKE_PRIVATE_KEY_PATH || process.env.SNOWFLAKE_PRIVATE_KEY) {
            return 'keypair';
        } else if (process.env.SNOWFLAKE_ACCESS_TOKEN) {
            return 'pat';
        } else if (process.env.SNOWFLAKE_PASSWORD) {
            return 'password';
        } else {
            return 'none';
        }
    }

    async connect() {
        if (this.isConnected) {
            return this.connection;
        }

        try {
        return new Promise((resolve, reject) => {
            this.connection = snowflake.createConnection(this.connectionConfig);
            
            this.connection.connect((err, conn) => {
                if (err) {
                    console.error('Unable to connect to Snowflake:', err);
                    reject(err);
                } else {
                        console.log(`Successfully connected to Snowflake using ${this.getAuthenticationMethod()} authentication`);
                    this.isConnected = true;
                    resolve(conn);
                }
            });
        });
        } catch (configError) {
            throw new Error(`Configuration error: ${configError.message}`);
        }
    }

    async disconnect() {
        if (this.connection && this.isConnected) {
            return new Promise((resolve) => {
                this.connection.destroy((err) => {
                    if (err) {
                        console.error('Error disconnecting from Snowflake:', err);
                    } else {
                        console.log('Disconnected from Snowflake');
                    }
                    this.isConnected = false;
                    resolve();
                });
            });
        }
    }

    async queryWithCortexAgents(naturalLanguageQuery, onDelta = null) {
        try {
            // Use the official Cortex Agents REST API with delta streaming support
            const cortexResult = await this.callCortexAgentsAPI(naturalLanguageQuery, onDelta);
            
            if (cortexResult) {
                return cortexResult;
            }
            
            // Fallback to basic database connection if Cortex Agents fails
            return await this.fallbackToBasicQuery(naturalLanguageQuery);
            
        } catch (error) {
            console.error('Error in queryWithCortexAgents:', error);
            throw new Error(`Failed to process query: ${error.message}`);
        }
    }

    printDebugDelta(deltaIndex, delta) {
        const timestamp = new Date().toISOString().substr(11, 12); // HH:MM:SS.mmm
        
        // Force immediate output by using process.stdout.write with flush
        process.stdout.write(`\n🔍 [${timestamp}] DELTA #${deltaIndex} ═══════════════════════════════════\n`);
        
        // Also log to console but ensure it's flushed
        console.log(`🔍 [${timestamp}] DELTA #${deltaIndex} ═══════════════════════════════════`);
        
        if (delta.content && delta.content.length > 0) {
            for (let i = 0; i < delta.content.length; i++) {
                const content = delta.content[i];
                process.stdout.write(`  📦 Content[${i}] Type: ${content.type}\n`);
                
                switch (content.type) {
                    case 'text':
                        const text = content.text || '';
                        const preview = text.length > 100 ? text.substring(0, 100) + '...' : text;
                        process.stdout.write(`    📝 Text (${text.length} chars): "${preview}"\n`);
                        if (text.length > 100) {
                            process.stdout.write(`    🔍 Full text: "${text}"\n`);
                        }
                        break;
                        
                    case 'tool_use':
                        process.stdout.write(`    🔧 Tool: ${content.tool_use?.name || 'unknown'}\n`);
                        if (content.tool_use?.input) {
                            process.stdout.write(`    📋 Input: ${JSON.stringify(content.tool_use.input, null, 2)}\n`);
                        }
                        break;
                        
                    case 'tool_results':
                        const results = content.tool_results?.content || [];
                        process.stdout.write(`    📊 Tool Results (${results.length} items):\n`);
                        results.forEach((result, idx) => {
                            process.stdout.write(`      [${idx}] Type: ${result.type || 'unknown'}\n`);
                            if (result.type === 'text' && result.text) {
                                const resultPreview = result.text.length > 200 ? 
                                    result.text.substring(0, 200) + '...' : result.text;
                                process.stdout.write(`      📄 Text: "${resultPreview}"\n`);
                            }
                        });
                        break;
                        
                    case 'chart':
                        process.stdout.write(`    📈 Chart Data:\n`);
                        if (content.chart) {
                            process.stdout.write(`      📊 Chart: ${JSON.stringify(content.chart, null, 2)}\n`);
                        }
                        break;
                        
                    case 'thinking':
                        let thinkingText = '';
                        if (typeof content.thinking === 'string') {
                            thinkingText = content.thinking;
                        } else if (typeof content.thinking === 'object') {
                            thinkingText = content.thinking.text || 
                                         content.thinking.content || 
                                         content.thinking.message || 
                                         JSON.stringify(content.thinking, null, 2);
                        }
                        const thinkingPreview = thinkingText.length > 150 ? 
                            thinkingText.substring(0, 150) + '...' : thinkingText;
                        process.stdout.write(`    🤔 Thinking (${thinkingText.length} chars): "${thinkingPreview}"\n`);
                        break;
                        
                    default:
                        process.stdout.write(`    ❓ Unknown content type: ${content.type}\n`);
                        process.stdout.write(`    📋 Raw content: ${JSON.stringify(content, null, 2)}\n`);
                        break;
                }
            }
        } else {
            process.stdout.write(`  📭 No content in this delta\n`);
        }
        
        process.stdout.write(`  🔗 Metadata: ID=${delta.metadata?.id}, Object=${delta.metadata?.object}\n`);
        process.stdout.write(`═══════════════════════════════════════════════════════════════════════\n\n`);
    }

    /**
     * Call Snowflake Cortex Agents API with real-time streaming support
     * 
     * This is the core method that interfaces with Snowflake's Cortex Agents API
     * to process natural language queries and generate AI-powered responses.
     * 
     * Features:
     * - Dynamic agent configuration from database (if CORTEX_AGENTS_AGENT_NAME is set)
     * - Real-time streaming with Server-Sent Events (SSE)
     * - Automatic SQL execution for data queries
     * - Progressive delta updates for real-time UI
     * - Comprehensive error handling and fallbacks
     * 
     * @param {string} query - User's natural language query
     * @param {Function} onDelta - Optional callback for real-time streaming updates
     * @returns {Object} - Formatted response with data, insights, and recommendations
     */
    async callCortexAgentsAPI(query, onDelta = null) {
        try {
            // Authenticate with Snowflake to get access token
            const accessToken = await this.getSnowflakeAccessToken();
            
            if (!accessToken) {
                console.log('No access token available for Cortex Agents API');
                return null;
            }

            // Construct the Cortex Agents API endpoint
            const apiUrl = `https://${this.extractAccountIdentifier()}.snowflakecomputing.com/api/v2/cortex/agent:run`;
            
            // Default request payload with optimized settings for streaming and reasoning
            const requestPayload = {
                model: process.env.CORTEX_AGENTS_MODEL || "llama3.3-70b",
                response_instruction: "You are a helpful insurance data analyst. Provide clear, concise answers about insurance data. When generating charts, make them visually appealing and easy to understand.",
                                 experimental: {
                     "chartToolRequired":true,                           // Enable chart generation
                     "useLegacyAnswersToolNames":false,                 // Use modern tool names
                     "snowflakeIntelligence":true,                      // Enable Snowflake Intelligence features
                     "enableChartAndTableContent":true,                 // Include chart/table data in responses
                     "enableAnalystStreaming":false,                    // Use custom streaming implementation
                     "searchResultConfidenceThreshold":{"enabled":true,"threshold":1.5},
                     "enableSSEAsString":true,                          // Enable Server-Sent Events as strings
                     "reasoningAgentToolConfig":{"orchestrationType":"reasoning"}, // Enable AI reasoning display
                     "enableStepTrace":true,                            // Include step-by-step processing
                     "enableSqlExplanation":false,                      // Execute SQL, don't show it
                     "enableCortexLiteAgentIntegrateWithThread":true,
                     "sqlGenMode":"STANDARD",                           // Standard SQL generation mode
                     "enableAnalystToolResultInTopLevelFields":false,   // Don't show raw tool results
                     "reasoningAgentFlowType":"simple",                 // Simplified reasoning flow
                     "responseSchemaVersion":"v1"                       // Use latest response schema
                 },
                tool_choice: {
                    type: "auto"  // Let AI choose appropriate tools automatically
                },
                messages: [
                    {
                        role: "user",
                        content: [
                            {
                                type: "text",
                                text: query
                            }
                        ]
                    }
                ]
            };

            // Configure tools and agent specification
            if (process.env.CORTEX_AGENTS_AGENT_NAME) {
                // Option 1: Use predefined agent configuration
                console.log(`🤖 Using predefined agent: ${process.env.CORTEX_AGENTS_AGENT_NAME}`);
                try {
                    const agentConfig = await this.getAgentConfiguration(process.env.CORTEX_AGENTS_AGENT_NAME);
                    if (agentConfig) {
                        if (agentConfig.agent_spec) {
                            // Use the complete agent_spec as the base for the request payload
                            console.log(`🎯 Using agent_spec for request payload from: ${process.env.CORTEX_AGENTS_AGENT_NAME}`);
                            
                            // Merge agent_spec with base request payload, preserving the user message and experimental settings
                            const userMessages = requestPayload.messages;
                            const experimentalSettings = requestPayload.experimental;
                            
                            // Start with agent_spec as the base
                            Object.assign(requestPayload, agentConfig.agent_spec);
                            
                            // Preserve user messages (agent_spec shouldn't override the current query)
                            requestPayload.messages = userMessages;
                            
                            // Preserve experimental settings for streaming and reasoning
                            requestPayload.experimental = {
                                ...agentConfig.agent_spec.experimental,
                                ...experimentalSettings  // Our experimental settings take precedence
                            };
                            
                            if (process.env.DEBUG === 'true' || process.env.DEBUG_DELTAS === 'true') {
                                console.log('🎯 USING AGENT_SPEC FOR REQUEST:');
                                console.log('   Agent Spec Keys:', Object.keys(agentConfig.agent_spec));
                                if (agentConfig.agent_spec.tools) {
                                    console.log(`   Tools from agent_spec: ${Array.isArray(agentConfig.agent_spec.tools) ? agentConfig.agent_spec.tools.length : 'unknown'}`);
                                }
                                if (agentConfig.agent_spec.response_instruction) {
                                    console.log(`   Response instruction from agent_spec: present`);
                                }
                                console.log('─────────────────────────────────────────────────────────────────────');
                            }
                        } else {
                            // Fallback to individual configuration fields if agent_spec is not available
                            console.log(`⚠️  No agent_spec found, using individual configuration fields`);
                            if (agentConfig.tools && agentConfig.tools.length > 0) {
                                requestPayload.tools = agentConfig.tools;
                                console.log(`✅ Using ${agentConfig.tools.length} tools from agent configuration`);
                            }
                            if (agentConfig.response_instruction) {
                                requestPayload.response_instruction = agentConfig.response_instruction;
                                console.log(`✅ Using custom response instruction from agent configuration`);
                            }
                            if (agentConfig.tool_resources) {
                            requestPayload.tool_resources = agentConfig.tool_resources;
                            console.log(`✅ Using tool resources from agent configuration`);
                        }
                    }
                    console.log(`✅ Using agent configuration for: ${process.env.CORTEX_AGENTS_AGENT_NAME}`);
                } else {
                    // Return error if configuration not found
                    console.error(`❌ No configuration found for agent: ${process.env.CORTEX_AGENTS_AGENT_NAME}`);
                    return {
                        summary: `Agent configuration not found for '${process.env.CORTEX_AGENTS_AGENT_NAME}'. Please check that the agent exists and is accessible.`,
                        data: [],
                        insights: "Contact your administrator to verify the agent exists and you have permissions to access it.",
                        source: "configuration_error"
                    };
                }
                } catch (error) {
                    console.error('❌ Failed to get agent configuration:', error.message);
                    // Return error instead of fallback
                    return {
                        summary: `Failed to read agent configuration for '${process.env.CORTEX_AGENTS_AGENT_NAME}': ${error.message}`,
                        data: [],
                        insights: "Check database permissions and table structure. Contact your administrator for assistance.",
                        source: "configuration_error"
                    };
                }
            } else {
                // No agent name configured - return error
                console.error('❌ No agent name configured in CORTEX_AGENTS_AGENT_NAME');
                return {
                    summary: "Agent configuration error: No Cortex Agent is configured for this bot.",
                    data: [],
                    insights: "Please set CORTEX_AGENTS_AGENT_NAME in your environment variables to specify which Cortex Agent to use. Contact your administrator for available agent names.",
                    source: "configuration_error"
                };
            }

            console.log(`Making Cortex Agents API request to: ${apiUrl}`);
            console.log('📋 Request Payload:', JSON.stringify(requestPayload, null, 2));

            const timeoutSeconds = parseInt(process.env.CORTEX_AGENTS_TIMEOUT) || 60;
            
            // Use streaming for real-time delta processing
            const response = await axios.post(apiUrl, requestPayload, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                    'X-Snowflake-Authorization-Token-Type': 'KEYPAIR_JWT'
                },
                timeout: timeoutSeconds * 1000, // Convert seconds to milliseconds
                responseType: 'stream', // Enable streaming for real-time processing
                validateStatus: function (status) {
                    return status < 500; // Resolve only if the status code is less than 500
                }
            });

            console.log(`API Response Status: ${response.status}`);
            
            if (response.status >= 400) {
                console.error('Cortex Agents API error response:', response.status, response.data);
                return null;
            }
            
            // Handle streaming response
            if (response.data && typeof response.data.on === 'function') {
                // This is a stream - process it in real-time
                console.log('📡 Received streaming response from Cortex Agents, processing real-time...');
                return await this.processStreamingResponse(response.data, onDelta);
            } else if (response.data) {
                if (response.data.delta) {
                    // Direct delta response
                    console.log('Received direct delta response from Cortex Agents');
                    return await this.formatCortexAgentsResponse(response.data.delta);
                } else if (typeof response.data === 'string' && response.data.includes('event: message.delta')) {
                    // SSE (Server-Sent Events) format - parse and stream deltas
                    console.log('Received SSE response from Cortex Agents, parsing...');
                    const parseResult = this.parseSSEResponse(response.data, onDelta);
                    if (parseResult && parseResult.combinedDelta) {
                        if (process.env.SHOW_DELTA_MESSAGES === 'true') {
                            console.log(`📡 Streamed ${parseResult.streaming.totalDeltas} deltas during parsing`);
                        }
                        
                        // Format the main response
                        const mainResponse = await this.formatCortexAgentsResponse(parseResult.combinedDelta);
                        
                        // If there's thinking content, create a separate thinking response
                        if (parseResult.thinkingMessage) {
                            const thinkingResponse = await this.formatCortexAgentsResponse(parseResult.thinkingMessage);
                            
                            // Return both messages as separate responses
                            return {
                                mainMessage: mainResponse,
                                thinkingMessage: thinkingResponse,
                                hasMultipleMessages: true
                            };
                        }
                        
                        return mainResponse;
                    }
                } else {
                    // Other response formats
                    console.log('Received other response format from Cortex Agents');
                    return {
                        summary: response.data.message || "Response received from Cortex Agents",
                        data: [],
                        //insights: "Response generated by Snowflake Cortex Agents",
                        source: "cortex_agents_api"
                    };
                }
            }
            
            console.log('No usable data in response');
            return null;
            
        } catch (error) {
            if (error.code === 'ECONNABORTED') {
                const timeoutSeconds = parseInt(process.env.CORTEX_AGENTS_TIMEOUT) || 60;
                console.error(`Cortex Agents API timeout after ${timeoutSeconds} seconds`);
            } else {
                console.error('Cortex Agents API error:', error.response?.data || error.message);
            }
            // If Cortex Agents API fails, we'll fall back to basic query
            return null;
        }
    }

    async getSnowflakeAccessToken() {
        try {
            if (this.getAuthenticationMethod() === 'keypair') {
                // For keypair authentication, we need to generate a JWT token
                const jwt = require('jsonwebtoken');
                const crypto = require('crypto');
                
                // Load private key
                let privateKeyPem;
                if (process.env.SNOWFLAKE_PRIVATE_KEY_PATH) {
                    const fs = require('fs');
                    privateKeyPem = fs.readFileSync(process.env.SNOWFLAKE_PRIVATE_KEY_PATH, 'utf8');
                } else if (process.env.SNOWFLAKE_PRIVATE_KEY) {
                    privateKeyPem = process.env.SNOWFLAKE_PRIVATE_KEY.replace(/\\n/g, '\n');
                }

                // Generate public key fingerprint
                const publicKey = crypto.createPublicKey(privateKeyPem);
                const publicKeyDer = publicKey.export({ format: 'der', type: 'spki' });
                const fingerprint = crypto.createHash('sha256').update(publicKeyDer).digest('base64');

                // Create JWT payload
                const payload = {
                    iss: `${process.env.SNOWFLAKE_ACCOUNT.toUpperCase()}.${process.env.SNOWFLAKE_USERNAME.toUpperCase()}.SHA256:${fingerprint}`,
                    sub: `${process.env.SNOWFLAKE_ACCOUNT.toUpperCase()}.${process.env.SNOWFLAKE_USERNAME.toUpperCase()}`,
                    aud: process.env.SNOWFLAKE_ACCOUNT.toUpperCase(),
                    iat: Math.floor(Date.now() / 1000),
                    exp: Math.floor(Date.now() / 1000) + (10 * 60) // 10 minutes
                };

                // Sign JWT
                const token = jwt.sign(payload, privateKeyPem, { algorithm: 'RS256' });
                return token;
            } else if (this.getAuthenticationMethod() === 'pat') {
                // For PAT, use the token directly
                return process.env.SNOWFLAKE_ACCESS_TOKEN;
            }
            
            return null;
        } catch (error) {
            console.error('Error generating access token:', error);
            return null;
        }
    }

    extractAccountIdentifier() {
        // Extract account identifier from the account URL
        const account = process.env.SNOWFLAKE_ACCOUNT;
        if (account.includes('.')) {
            return account.split('.')[0];
        }
        return account;
    }

    async getAvailableTools() {
        try {
            console.log('🔍 Querying SNOWFLAKE_INTELLIGENCE.AGENTS.CONFIG for available tools...');
            
            return new Promise((resolve, reject) => {
                this.connection.execute({
                    sqlText: 'SELECT * FROM SNOWFLAKE_INTELLIGENCE.AGENTS.CONFIG',
                    complete: (err, stmt, rows) => {
                        if (err) {
                            console.error('❌ Failed to query AGENTS.CONFIG:', err.message);
                            reject(err);
                        } else {
                            console.log(`✅ Found ${rows.length} tool configurations`);
                            
                            // Transform rows into tool specifications
                            const tools = rows.map(row => {
                                console.log(`📋 Tool config:`, {
                                    name: row.NAME,
                                    type: row.TYPE,
                                    category: row.CATEGORY,
                                    enabled: row.ENABLED
                                });
                                
                return {
                                    tool_spec: {
                                        type: row.TYPE,
                                        name: row.NAME || row.TYPE
                                    }
                                };
                            }).filter(tool => tool.tool_spec.type); // Filter out invalid entries
                            
                            console.log(`🎯 Converted to ${tools.length} tool specs`);
                            resolve(tools);
                        }
                    }
                });
            });
        } catch (error) {
            console.error('❌ Error querying available tools:', error);
            // Fallback to hardcoded tools if query fails
            return this.getDefaultTools();
        }
    }

    getDefaultTools() {
        console.log('⚠️  Using fallback default tools');
        return [
            {
                tool_spec: {
                    type: "cortex_analyst_text_to_sql",
                    name: "DataAnalyst"
                }
            },
            {
                tool_spec: {
                    type: "sql_exec",
                    name: "sql_execution_tool"
                }
            },
            {
                tool_spec: {
                    type: "data_to_chart",
                    name: "data_to_chart"
                }
            }
        ];
    }

    /**
     * Get agent configuration using DESCRIBE AGENT command
     * 
     * Uses Snowflake's built-in DESCRIBE AGENT command to retrieve agent configuration
     * instead of querying a custom configuration table. This approach leverages
     * Snowflake's native agent management capabilities.
     * 
     * @param {string} agentName - Name of the agent to describe
     * @returns {Object} - Agent configuration with tools, response_instruction, and tool_resources
     */
    async getAgentConfiguration(agentName) {
        try {
            console.log(`🔍 Describing agent configuration for: ${agentName}`);
            
            // Connect to database if not already connected
            await this.connect();
            
            // Use DESCRIBE AGENT command to get agent configuration
            const describeQuery = `DESCRIBE AGENT snowflake_intelligence.agents."${agentName}"`;
            
            if (process.env.DEBUG === 'true' || process.env.DEBUG_DELTAS === 'true') {
                console.log('📝 Executing DESCRIBE AGENT query:');
                console.log(describeQuery);
                console.log('─────────────────────────────────────────────────────────────────────');
            }
            
            return new Promise((resolve, reject) => {
                this.connection.execute({
                    sqlText: describeQuery,
                    complete: (err, stmt, rows) => {
                        if (err) {
                            console.error(`❌ Failed to describe agent ${agentName}:`, err.message);
                            reject(new Error(`Agent '${agentName}' not found or not accessible: ${err.message}`));
                            return;
                        }
                        
                        if (!rows || rows.length === 0) {
                            console.warn(`⚠️  No configuration found for agent: ${agentName}`);
                            resolve(null);
                            return;
                        }
                        
                        console.log(`✅ Found configuration for agent: ${agentName}`);
                        
                        // Debug logging for DESCRIBE AGENT results
                        if (process.env.DEBUG === 'true' || process.env.DEBUG_DELTAS === 'true') {
                            console.log('📊 DESCRIBE AGENT Results:');
                            console.log(`   Rows returned: ${rows.length}`);
                            if (rows.length > 0) {
                                console.log(`   Columns: ${Object.keys(rows[0]).join(', ')}`);
                                console.log('   Sample row:', JSON.stringify(rows[0], null, 2));
                            }
                            console.log('─────────────────────────────────────────────────────────────────────');
                        }
                        
                        // Parse the DESCRIBE AGENT output
                        const config = this.parseAgentDescription(rows);
                        
                        resolve(config);
                    }
                });
            });
        } catch (error) {
            console.error(`❌ Error describing agent ${agentName}:`, error);
            throw error;
        }
    }
    
    /**
     * Parse DESCRIBE AGENT output into configuration object
     * 
     * Processes the result rows from DESCRIBE AGENT command and extracts
     * the agent_spec and other relevant configuration fields.
     * 
     * @param {Array} rows - Result rows from DESCRIBE AGENT command
     * @returns {Object} - Parsed configuration object with agent_spec
     */
    parseAgentDescription(rows) {
        const config = {};
        
        if (process.env.DEBUG === 'true' || process.env.DEBUG_DELTAS === 'true') {
            console.log('🔍 PARSING AGENT DESCRIPTION:');
        }
        
        // DESCRIBE AGENT returns a single row with columns: name, database_name, schema_name, owner, comment, profile, agent_spec, created_on
        // The agent_spec column contains the complete JSON configuration
        if (rows && rows.length > 0) {
            const row = rows[0]; // Take the first (and typically only) row
            
            if (process.env.DEBUG === 'true' || process.env.DEBUG_DELTAS === 'true') {
                console.log(`   Processing agent row with columns: ${Object.keys(row).join(', ')}`);
            }
            
            // Extract agent_spec from the direct column
            const agentSpecValue = row.agent_spec || row.AGENT_SPEC;
            
            if (agentSpecValue) {
                try {
                    // Parse the agent_spec which contains the complete agent configuration
                    config.agent_spec = typeof agentSpecValue === 'string' ? JSON.parse(agentSpecValue) : agentSpecValue;
                    console.log(`🎯 Loaded agent_spec from DESCRIBE AGENT`);
                    
                    // Extract individual components from agent_spec for backward compatibility
                    if (config.agent_spec.tools) {
                        config.tools = config.agent_spec.tools;
                        console.log(`📋 Extracted ${Array.isArray(config.tools) ? config.tools.length : 'unknown'} tools from agent_spec`);
                    }
                    if (config.agent_spec.instructions && config.agent_spec.instructions.response) {
                        config.response_instruction = config.agent_spec.instructions.response;
                        console.log(`📝 Extracted response instruction from agent_spec.instructions.response`);
                    }
                    if (config.agent_spec.tool_resources) {
                        config.tool_resources = config.agent_spec.tool_resources;
                        console.log(`🔧 Extracted tool resources from agent_spec`);
                    }
                    
                    if (process.env.DEBUG === 'true' || process.env.DEBUG_DELTAS === 'true') {
                        console.log('🎯 Agent Spec Structure:');
                        if (config.agent_spec.models) {
                            console.log(`   Models: ${JSON.stringify(config.agent_spec.models)}`);
                        }
                        if (config.agent_spec.instructions) {
                            console.log(`   Instructions: Present (response + ${config.agent_spec.instructions.sample_questions?.length || 0} sample questions)`);
                        }
                        if (config.agent_spec.tools) {
                            console.log(`   Tools: ${config.agent_spec.tools.length} tools`);
                            config.agent_spec.tools.forEach((tool, i) => {
                                console.log(`     ${i + 1}. ${tool.tool_spec?.type} (${tool.tool_spec?.name})`);
                            });
                        }
                        if (config.agent_spec.tool_resources) {
                            console.log(`   Tool Resources: ${Object.keys(config.agent_spec.tool_resources).join(', ')}`);
                        }
                    }
                    
                } catch (parseError) {
                    console.warn(`⚠️  Failed to parse agent_spec from DESCRIBE AGENT: ${parseError.message}`);
                    if (process.env.DEBUG === 'true') {
                        console.log('Raw agent_spec value:', agentSpecValue);
                    }
                }
            } else {
                console.warn(`⚠️  No agent_spec column found in DESCRIBE AGENT result`);
                if (process.env.DEBUG === 'true' || process.env.DEBUG_DELTAS === 'true') {
                    console.log('Available columns:', Object.keys(row));
                }
            }
            
            // Also extract other useful metadata
            config.agent_name = row.name || row.NAME;
            config.database_name = row.database_name || row.DATABASE_NAME;
            config.schema_name = row.schema_name || row.SCHEMA_NAME;
            config.owner = row.owner || row.OWNER;
            config.comment = row.comment || row.COMMENT;
            
            if (process.env.DEBUG === 'true' || process.env.DEBUG_DELTAS === 'true') {
                console.log(`   Agent metadata: ${config.agent_name} (${config.database_name}.${config.schema_name})`);
                console.log(`   Owner: ${config.owner}, Comment: ${config.comment}`);
            }
            
        } else {
            console.warn(`⚠️  No rows returned from DESCRIBE AGENT`);
        }
        
        if (process.env.DEBUG === 'true' || process.env.DEBUG_DELTAS === 'true') {
            console.log('📋 FINAL PARSED CONFIG:');
            console.log(`   Agent Spec: ${config.agent_spec ? 'Present' : 'Not found'}`);
            console.log(`   Tools: ${config.tools ? 'Present' : 'Not found'}`);
            console.log(`   Response Instruction: ${config.response_instruction ? 'Present' : 'Not found'}`);
            console.log(`   Tool Resources: ${config.tool_resources ? 'Present' : 'Not found'}`);
            if (config.agent_spec && process.env.DEBUG === 'true') {
                console.log('🎯 Agent Spec Content:', JSON.stringify(config.agent_spec, null, 2));
            }
            console.log('─────────────────────────────────────────────────────────────────────');
        }
        
        return config;
    }

    async processStreamingResponse(stream, onDelta = null) {
        return new Promise((resolve, reject) => {
            let buffer = '';
            let deltaIndex = 0;
            let combinedContent = '';
            let thinkingContent = '';
            let hasThinking = false;
            let toolResults = [];
            let charts = [];
            
            console.log('🌊 Starting real-time stream processing...');
            
            stream.on('data', (chunk) => {
                const chunkStr = chunk.toString();
                buffer += chunkStr;
                
                // Process complete SSE events from buffer
                const events = buffer.split('\n\n');
                // Keep the last incomplete event in buffer
                buffer = events.pop() || '';
                
                for (const event of events) {
                    if (event.trim() && event.includes('event: message.delta') && event.includes('data:')) {
                        try {
                            deltaIndex++;
                            
                            // Extract the JSON data from the SSE event
                            const dataMatch = event.match(/data:\s*(.+)/);
                            if (dataMatch) {
                                const deltaData = JSON.parse(dataMatch[1]);
                                
                                // Create individual delta for streaming
                                const individualDelta = {
                                    deltaIndex: deltaIndex,
                                    timestamp: new Date().toISOString(),
                                    content: deltaData.delta?.content || [],
                                    metadata: {
                                        id: deltaData.id,
                                        object: deltaData.object
                                    }
                                };
                                
                                // Debug mode: Print each delta chunk immediately
                                if (process.env.DEBUG === 'true' || process.env.DEBUG_DELTAS === 'true') {
                                    // Add immediate real-time indicator
                                    process.stdout.write(`⚡ LIVE DELTA #${deltaIndex} [REAL-TIME] `);
                                    this.printDebugDelta(deltaIndex, individualDelta);
                                }
                                
                                // Emit delta immediately if callback provided
                                if (onDelta && typeof onDelta === 'function') {
                                    try {
                                        onDelta(individualDelta);
                                    } catch (callbackError) {
                                        console.warn(`⚠️  Delta callback error:`, callbackError.message);
                                    }
                                }
                                
                                // Process content for accumulation
                                if (deltaData.delta && deltaData.delta.content) {
                                    for (const content of deltaData.delta.content) {
                                        switch (content.type) {
                                            case 'text':
                                                const newText = content.text || '';
                                                combinedContent += newText;
                                                break;
                                                
                                            case 'tool_use':
                                            case 'tool_results':
                                                toolResults.push(content);
                                                break;
                                                
                                            case 'chart':
                                                charts.push(content);
                                                break;
                                                
                                            case 'thinking':
                                                if (content.thinking) {
                                                    let thinkingText = '';
                                                    if (typeof content.thinking === 'string') {
                                                        thinkingText = content.thinking;
                                                    } else if (typeof content.thinking === 'object') {
                                                        thinkingText = content.thinking.text || 
                                                                     content.thinking.content || 
                                                                     content.thinking.message || 
                                                                     JSON.stringify(content.thinking, null, 2);
                                                    }
                                                    if (process.env.INCLUDE_AGENT_THINKING === 'true') {
                                                        thinkingContent += thinkingText;
                                                        hasThinking = true;
                                                    }
                                                }
                                                break;
                                        }
                                    }
                                }
                            }
                        } catch (parseError) {
                            console.warn('⚠️  Error parsing streaming delta:', parseError.message);
                        }
                    }
                }
            });
            
            stream.on('end', async () => {
                console.log(`🏁 Stream completed! Processed ${deltaIndex} deltas in real-time`);
                
                // Build combined delta structure
                const combinedDelta = {
                    content: []
                };
                
                if (combinedContent) {
                    combinedDelta.content.push({
                        type: 'text',
                        text: combinedContent
                    });
                }
                
                // Add tool results and charts
                toolResults.forEach(result => combinedDelta.content.push(result));
                charts.forEach(chart => combinedDelta.content.push(chart));
                
                try {
                    // Format the main response
                    const mainResponse = await this.formatCortexAgentsResponse(combinedDelta);
                    
                    // If there's thinking content, create a separate thinking response
                    if (hasThinking && thinkingContent) {
                        const thinkingMessage = {
                            content: [{
                                type: 'text',
                                text: `**🤔 Agent Reasoning:**\n${thinkingContent}`
                            }]
                        };
                        const thinkingResponse = await this.formatCortexAgentsResponse(thinkingMessage);
                        
                        resolve({
                            mainMessage: mainResponse,
                            thinkingMessage: thinkingResponse,
                            hasMultipleMessages: true
                        });
                    } else {
                        resolve(mainResponse);
                    }
                } catch (formatError) {
                    reject(formatError);
                }
            });
            
            stream.on('error', (error) => {
                console.error('❌ Stream error:', error);
                reject(error);
            });
        });
    }

    parseSSEResponse(sseData, onDelta = null) {
        try {
            // Show delta messages only if enabled
            if (process.env.SHOW_DELTA_MESSAGES === 'true') {
                console.log('\n🔍 Starting SSE response parsing...');
                console.log(`📊 Raw SSE data length: ${sseData.length} characters`);
                console.log('═'.repeat(80));
            }
            
            // Split SSE data into individual events
            const events = sseData.split('\n\n').filter(event => event.trim());
            if (process.env.SHOW_DELTA_MESSAGES === 'true') {
                console.log(`📋 Found ${events.length} SSE events to process`);
            }
            
            // Initialize combined delta structure
            const combinedDelta = {
                content: []
            };
            
            let textContent = '';
            let toolUse = null;
            let toolResults = [];
            let charts = [];
            let deltaCount = 0;
            
            // Track thinking content separately for consolidated messaging
            let thinkingContent = '';
            let hasThinking = false;
            
            // Array to store individual deltas for streaming
            const deltas = [];
            
            for (const event of events) {
                if (event.includes('event: message.delta') && event.includes('data:')) {
                    try {
                        // Extract the JSON data from the SSE event
                        const dataMatch = event.match(/data:\s*(.+)/);
                        if (dataMatch) {
                            deltaCount++;
                            const deltaData = JSON.parse(dataMatch[1]);
                            
                            // Show delta processing only if enabled
                            if (process.env.SHOW_DELTA_MESSAGES === 'true') {
                                console.log(`⚡ Processing delta ${deltaCount}:`, {
                                    id: deltaData.id,
                                    object: deltaData.object,
                                    contentItems: deltaData.delta?.content?.length || 0
                                });
                            }
                            
                            // Create individual delta for streaming
                            const individualDelta = {
                                deltaIndex: deltaCount,
                                timestamp: new Date().toISOString(),
                                content: deltaData.delta?.content || [],
                                metadata: {
                                    id: deltaData.id,
                                    object: deltaData.object
                                }
                            };
                            
                            // Store delta for streaming
                            deltas.push(individualDelta);
                            
                            // Debug mode: Print each delta chunk immediately
                            if (process.env.DEBUG === 'true' || process.env.DEBUG_DELTAS === 'true') {
                                // Add immediate real-time indicator
                                process.stdout.write(`⚡ LIVE DELTA #${deltaCount} `);
                                this.printDebugDelta(deltaCount, individualDelta);
                            }
                            
                            // Emit delta immediately if callback provided
                            if (onDelta && typeof onDelta === 'function') {
                                try {
                                    onDelta(individualDelta);
                                } catch (callbackError) {
                                    console.warn(`⚠️  Delta callback error:`, callbackError.message);
                                }
                            }
                            
                            if (deltaData.delta && deltaData.delta.content) {
                                for (const content of deltaData.delta.content) {
                                    switch (content.type) {
                                        case 'text':
                                            const newText = content.text || '';
                                            textContent += newText;
                                            // Show text chunks only if enabled
                                            if (process.env.SHOW_DELTA_MESSAGES === 'true') {
                                                console.log(`  📝 Text chunk: "${newText}" (${newText.length} chars)`);
                                            }
                                            break;
                                            
                                        case 'tool_use':
                                            toolUse = content;
                                            if (process.env.SHOW_DELTA_MESSAGES === 'true') {
                                                console.log(`  🔧 Tool use:`, content.tool_use?.name || 'unknown');
                                            }
                                            break;
                                            
                                        case 'tool_results':
                                            toolResults.push(content);
                                            if (process.env.SHOW_DELTA_MESSAGES === 'true') {
                                                console.log(`  📊 Tool results: ${content.tool_results?.content?.length || 0} items`);
                                            }
                                            break;
                                            
                                        case 'chart':
                                            charts.push(content);
                                            if (process.env.SHOW_DELTA_MESSAGES === 'true') {
                                                console.log(`  📈 Chart data received`);
                                            }
                                            break;
                                            
                                        case 'thinking':
                                            // Handle agent thinking/reasoning content
                                            if (content.thinking) {
                                                // Debug: Log the thinking structure if verbose logging is enabled
                                                if (process.env.VERBOSE_DELTA_LOGGING === 'true') {
                                                    console.log(`🧠 Thinking structure:`, JSON.stringify(content.thinking, null, 2));
                                                }
                                                
                                                // Extract thinking text - it might be a string or an object
                                                let thinkingText = '';
                                                if (typeof content.thinking === 'string') {
                                                    thinkingText = content.thinking;
                                                } else if (typeof content.thinking === 'object') {
                                                    // If it's an object, try to extract text from common properties
                                                    thinkingText = content.thinking.text || 
                                                                 content.thinking.content || 
                                                                 content.thinking.message || 
                                                                 JSON.stringify(content.thinking, null, 2);
                                                }
                                                
                                                if (process.env.SHOW_DELTA_MESSAGES === 'true') {
                                                    console.log(`  🤔 Agent thinking: ${thinkingText.substring(0, 100)}${thinkingText.length > 100 ? '...' : ''}`);
                                                }
                                                
                                                // Accumulate thinking content for consolidated message
                                                if (process.env.INCLUDE_AGENT_THINKING === 'true') {
                                                    thinkingContent += thinkingText;
                                                    hasThinking = true;
                                                }
                                            }
                                            break;
                                            
                                        default:
                                            if (process.env.SHOW_DELTA_MESSAGES === 'true') {
                                                console.log(`  ❓ Unknown content type: ${content.type}`);
                                            }
                                    }
                                }
                            }
                        }
                    } catch (parseError) {
                        console.warn(`⚠️  Failed to parse SSE event ${deltaCount}:`, parseError.message);
                        continue;
                    }
                } else if (event.includes('event: done')) {
                    console.log('✅ Received completion event');
                    
                    // Emit completion event if callback provided
                    if (onDelta && typeof onDelta === 'function') {
                        try {
                            onDelta({
                                type: 'completion',
                                timestamp: new Date().toISOString(),
                                totalDeltas: deltaCount
                            });
                        } catch (callbackError) {
                            console.warn(`⚠️  Completion callback error:`, callbackError.message);
                        }
                    }
                }
            }
            
            // Build combined delta content
            if (textContent) {
                combinedDelta.content.push({
                    type: 'text',
                    text: textContent
                });
                if (process.env.VERBOSE_DELTA_LOGGING === 'true') {
                    console.log(`📝 Combined text content: "${textContent}"`);
                }
                console.log(`📏 Total text length: ${textContent.length} characters`);
            }
            
            if (toolUse) {
                combinedDelta.content.push(toolUse);
                console.log(`🔧 Added tool use to combined delta`);
            }
            
            if (toolResults.length > 0) {
                combinedDelta.content.push(...toolResults);
                console.log(`📊 Added ${toolResults.length} tool results to combined delta`);
            }
            
            if (charts.length > 0) {
                combinedDelta.content.push(...charts);
                console.log(`📈 Added ${charts.length} charts to combined delta`);
            }
            
            // Create separate thinking message group (will be returned separately)
            let thinkingMessage = null;
            if (hasThinking && thinkingContent) {
                thinkingMessage = {
                    content: [{
                        type: 'text',
                        text: `**🤔 Agent Reasoning:**\n${thinkingContent}`
                    }]
                };
                console.log(`🧠 Created separate thinking message group (${thinkingContent.length} chars)`);
            }
            
            if (process.env.SHOW_DELTA_MESSAGES === 'true') {
                console.log('═'.repeat(80));
                console.log(`🎯 SSE Parsing Summary:`);
                console.log(`  - Processed ${deltaCount} delta events`);
                console.log(`  - Individual deltas: ${deltas.length}`);
                console.log(`  - Combined text: ${textContent.length} characters`);
                console.log(`  - Tool results: ${toolResults.length}`);
                console.log(`  - Charts: ${charts.length}`);
                console.log(`  - Thinking: ${hasThinking ? `${thinkingContent.length} chars` : 'none'}`);
                console.log(`  - Final content items: ${combinedDelta.content.length}`);
                console.log('═'.repeat(80));
            }
            
            // Return combined delta, thinking message, and individual deltas
            return {
                combinedDelta: combinedDelta.content.length > 0 ? combinedDelta : null,
                thinkingMessage: thinkingMessage,
                deltas: deltas,
                streaming: {
                    totalDeltas: deltaCount,
                    hasText: textContent.length > 0,
                    hasToolResults: toolResults.length > 0,
                    hasCharts: charts.length > 0,
                    hasThinking: hasThinking
                }
            };
            
        } catch (error) {
            console.error('❌ Error parsing SSE response:', error);
            return null;
        }
    }

    /**
     * Format Cortex Agents response with debug logging for SQL detection
     * 
     * Processes delta responses from Cortex Agents API and extracts structured data.
     * Includes comprehensive debug logging for SQL query detection and response formatting.
     * 
     * @param {Object} delta - Delta response from Cortex Agents API
     * @returns {Object} - Formatted response with summary, data, insights, etc.
     */
    async formatCortexAgentsResponse(delta) {
        try {
            // Debug logging for response formatting
            if (process.env.DEBUG === 'true' || process.env.DEBUG_DELTAS === 'true') {
                console.log('\n┌─────────────────────────────────────────────────────────────────────┐');
                console.log('│ 🔄 FORMATTING CORTEX AGENTS RESPONSE                                │');
                console.log('└─────────────────────────────────────────────────────────────────────┘');
                console.log('📦 Delta content type:', delta.content?.[0]?.type || 'unknown');
                console.log('📊 Processing response structure...');
                console.log('─────────────────────────────────────────────────────────────────────');
            }
            let summary = "";
            let data = [];
            let insights = "Response generated by Snowflake Cortex Agents";
            let charts = [];
            let sql = "";

            if (delta.content && Array.isArray(delta.content)) {
                for (const content of delta.content) {
                    switch (content.type) {
                        case 'text':
                            summary += content.text || "";
                            break;
                            
                        case 'tool_use':
                            if (content.tool_use && content.tool_use.name === 'DataAnalyst') {
                                insights = "Generated SQL query using Cortex Agents";
                            }
                            break;
                            
                        case 'tool_results':
                            if (content.tool_results && content.tool_results.content) {
                                for (const result of content.tool_results.content) {
                                    if (result.type === 'json' && result.json) {
                                        // Extract SQL and data from Cortex Agents results
                                        if (result.json.sql) {
                                            sql = result.json.sql;
                                            insights = result.json.text || insights;
                                            
                                            // Debug logging for SQL extraction
                                            if (process.env.DEBUG === 'true' || process.env.DEBUG_DELTAS === 'true') {
                                                console.log('✅ SQL QUERY EXTRACTED FROM CORTEX AGENTS:');
                                                console.log('📝 SQL Query:');
                                                console.log(sql);
                                                console.log('💬 Associated Text:');
                                                console.log(result.json.text || 'No text provided');
                                                console.log('─────────────────────────────────────────────────────────────────────');
                                            }
                                        }
                                        
                                        // Handle query results
                                        if (result.json.query_id || Array.isArray(result.json)) {
                                            data = Array.isArray(result.json) ? result.json : [result.json];
                                        }
                                    }
                                    
                                    if (result.type === 'text/csv') {
                                        // Handle CSV results
                                        data = this.parseCSVToJSON(result.text);
                                    }
                                }
                            }
                            break;
                            
                        case 'chart':
                            if (content.chart && content.chart.chart_spec) {
                                charts.push({
                                    type: 'vega-lite',
                                    spec: JSON.parse(content.chart.chart_spec)
                                });
                                insights += " Chart visualization included.";
                            }
                            break;
                    }
                }
            }

            // If SQL query was found, execute it and get the actual results
            if (sql && sql.trim()) {
                console.log('🔍 SQL query detected in response, executing...');
                console.log(`📝 SQL: ${sql}`);
                
                try {
                    // Switch back to original database for query execution
                    await this.switchToOriginalDatabase();
                    
                    // Execute the SQL query
                    const queryResults = await this.executeQuery(sql);
                    
                    if (queryResults && queryResults.length > 0) {
                        data = queryResults;
                        console.log(`✅ SQL query executed successfully, ${queryResults.length} rows returned`);
                        
                        // Update summary to reflect actual execution
                        if (summary.includes('```sql') || summary.toLowerCase().includes('sql')) {
                            summary += `\n\n**Query Results:** ${queryResults.length} row(s) found.`;
                        }
                        
                        // Update insights
                        insights = `SQL query executed successfully. ${insights}`;
                    } else {
                        console.log('⚠️  SQL query executed but returned no results');
                        insights = `SQL query executed but returned no results. ${insights}`;
                    }
                } catch (sqlError) {
                    console.error('❌ Failed to execute SQL query:', sqlError.message);
                    insights = `SQL query provided but execution failed: ${sqlError.message}. ${insights}`;
                }
            }

            // If no summary text was provided, generate one based on the results
            if (!summary && data.length > 0) {
                summary = `Found ${data.length} result${data.length !== 1 ? 's' : ''} for your query.`;
            } else if (!summary) {
                summary = "Query processed successfully.";
            }
            
            // Debug logging for final response structure
            if (process.env.DEBUG === 'true' || process.env.DEBUG_DELTAS === 'true') {
                console.log('📋 FINAL FORMATTED RESPONSE:');
                console.log(`   Summary: ${summary ? 'Present' : 'Not present'} (${summary.length} chars)`);
                console.log(`   Data: ${data.length} rows`);
                console.log(`   SQL: ${sql ? 'Present' : 'Not present'}`);
                console.log(`   Charts: ${charts.length} chart(s)`);
                console.log(`   Insights: ${insights ? 'Present' : 'Not present'}`);
                
                if (sql) {
                    console.log('📝 Final SQL Query:');
                    console.log(sql);
                }
                
                if (data.length > 0) {
                    console.log(`📊 Data Sample (first row):`, JSON.stringify(data[0], null, 2));
                }
                console.log('═══════════════════════════════════════════════════════════════════════\n');
            }
            
            return {
                summary: summary.trim(),
                data: data,
                insights: insights,
                source: "cortex_agents_api",
                sql: sql,
                charts: charts
            };
            
        } catch (error) {
            console.error('Error formatting Cortex Agents response:', error);
            return {
                summary: "Cortex Agents response received but formatting failed",
                data: [],
                insights: "Please try rephrasing your question",
                source: "cortex_agents_api",
                charts: []
            };
        }
    }

    async switchToOriginalDatabase() {
        try {
            // Switch back to the original database context for query execution
            const originalDb = process.env.SNOWFLAKE_DATABASE;
            const originalSchema = process.env.SNOWFLAKE_SCHEMA;
            
            if (originalDb) {
                await new Promise((resolve, reject) => {
                    this.connection.execute({
                        sqlText: `USE DATABASE ${originalDb}`,
                        complete: (err) => {
                            if (err) {
                                console.warn(`⚠️  Could not switch back to ${originalDb} database:`, err.message);
                                // Don't reject, just warn - query might still work
                            } else {
                                console.log(`✅ Switched back to ${originalDb} database`);
                            }
                            resolve();
                        }
                    });
                });
            }
            
            if (originalSchema) {
                await new Promise((resolve, reject) => {
                    this.connection.execute({
                        sqlText: `USE SCHEMA ${originalSchema}`,
                        complete: (err) => {
                            if (err) {
                                console.warn(`⚠️  Could not switch back to ${originalSchema} schema:`, err.message);
                                // Don't reject, just warn - query might still work
                            } else {
                                console.log(`✅ Switched back to ${originalSchema} schema`);
                            }
                            resolve();
                        }
                    });
                });
            }
        } catch (error) {
            console.warn('⚠️  Error switching back to original database context:', error.message);
            // Don't throw - query execution should still be attempted
        }
    }

    parseCSVToJSON(csvText) {
        try {
            const lines = csvText.trim().split('\n');
            if (lines.length < 2) return [];

            const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
            const result = [];

            for (let i = 1; i < lines.length; i++) {
                const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
                const row = {};
                headers.forEach((header, index) => {
                    row[header] = values[index] || '';
                });
                result.push(row);
            }

            return result;
        } catch (error) {
            console.error('Error parsing CSV:', error);
            return [];
        }
    }

    async fallbackToBasicQuery(naturalLanguageQuery) {
        try {
            await this.connect();
            
            // Simple fallback - show available tables and suggest next steps
            const tablesQuery = `
                SELECT table_name, table_type, comment 
                FROM information_schema.tables 
                WHERE table_schema = '${process.env.SNOWFLAKE_SCHEMA}'
                LIMIT 10
            `;
            
            const tables = await this.executeQuery(tablesQuery);
            
            return {
                summary: "Cortex Analyst is not available. Here are the available tables in your schema:",
                data: tables,
                insights: `You have ${tables.length} tables available. Try asking specific questions about these tables or contact your administrator to enable Cortex Agents.`,
                source: "fallback_query"
            };
            
        } catch (error) {
            return {
                summary: "I'm having trouble connecting to your data.",
                data: [],
                insights: "Please check your Snowflake connection and try again. You may need to enable Cortex Agents in your account.",
                source: "error_fallback"
            };
        }
    }



    /**
     * Execute SQL query with comprehensive debug logging
     * 
     * Executes SQL queries against Snowflake with detailed logging for debugging.
     * Logs the query, execution time, row counts, and sample results when debug mode is enabled.
     * 
     * @param {string} sqlQuery - The SQL query to execute
     * @returns {Promise<Array>} - Query results
     */
    async executeQuery(sqlQuery) {
        const startTime = Date.now();
        
        // Debug logging for SQL queries
        if (process.env.DEBUG === 'true' || process.env.DEBUG_DELTAS === 'true') {
            console.log('\n═══════════════════════════════════════════════════════════════════════');
            console.log('🔍 EXECUTING SQL QUERY');
            console.log('═══════════════════════════════════════════════════════════════════════');
            console.log('📝 Query:');
            console.log(sqlQuery);
            console.log('─────────────────────────────────────────────────────────────────────');
        }
        
        return new Promise((resolve, reject) => {
            this.connection.execute({
                sqlText: sqlQuery,
                complete: (err, stmt, rows) => {
                    const executionTime = Date.now() - startTime;
                    
                    if (err) {
                        // Debug logging for SQL errors
                        if (process.env.DEBUG === 'true' || process.env.DEBUG_DELTAS === 'true') {
                            console.log('❌ SQL EXECUTION ERROR:');
                            console.log(`   Error Code: ${err.code}`);
                            console.log(`   Error Message: ${err.message}`);
                            console.log(`   Execution Time: ${executionTime}ms`);
                            console.log('═══════════════════════════════════════════════════════════════════════\n');
                        }
                        reject(err);
                    } else {
                        // Debug logging for successful SQL execution
                        if (process.env.DEBUG === 'true' || process.env.DEBUG_DELTAS === 'true') {
                            console.log('✅ SQL EXECUTION SUCCESSFUL:');
                            console.log(`   Rows Returned: ${rows?.length || 0}`);
                            console.log(`   Execution Time: ${executionTime}ms`);
                            
                            // Log sample results (first few rows with limited fields)
                            if (rows && rows.length > 0) {
                                console.log('📊 Sample Results (first 3 rows):');
                                const sampleRows = rows.slice(0, 3);
                                const columns = Object.keys(sampleRows[0]);
                                
                                // Limit columns for readability
                                const displayColumns = columns.slice(0, 5);
                                if (columns.length > 5) {
                                    displayColumns.push(`... (+${columns.length - 5} more columns)`);
                                }
                                
                                console.log(`   Columns: ${displayColumns.join(', ')}`);
                                
                                sampleRows.forEach((row, index) => {
                                    console.log(`   Row ${index + 1}:`);
                                    displayColumns.slice(0, 5).forEach(col => {
                                        const value = row[col];
                                        const displayValue = typeof value === 'string' && value.length > 50 
                                            ? value.substring(0, 50) + '...' 
                                            : value;
                                        console.log(`     ${col}: ${displayValue}`);
                                    });
                                });
                                
                                if (rows.length > 3) {
                                    console.log(`   ... (+${rows.length - 3} more rows)`);
                                }
                            } else {
                                console.log('📊 No rows returned');
                            }
                            console.log('═══════════════════════════════════════════════════════════════════════\n');
                        }
                        resolve(rows);
                    }
                }
            });
        });
    }



    escapeQuery(query) {
        // Escape single quotes and other special characters for SQL
        return query.replace(/'/g, "''").replace(/\\/g, '\\\\');
    }

    async testConnection() {
        try {
            const authMethod = this.getAuthenticationMethod();
            await this.connect();
            const result = await this.executeQuery('SELECT CURRENT_VERSION() as version, CURRENT_USER() as user, CURRENT_ROLE() as role');
            return {
                success: true,
                version: result[0]?.VERSION,
                user: result[0]?.USER,
                role: result[0]?.ROLE,
                authMethod: authMethod,
                message: `Successfully connected to Snowflake using ${authMethod} authentication`
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                authMethod: this.getAuthenticationMethod(),
                message: 'Failed to connect to Snowflake'
            };
        }
    }
}

module.exports = { SnowflakeService };