const { ActivityHandler, ActivityTypes, MessageFactory, CardFactory } = require('botbuilder');
const fs = require('fs');
const path = require('path');

/**
 * TeamsSnowflakeBot - Main bot class for Microsoft Teams integration with Snowflake Cortex Agents
 * 
 * This class handles all Teams interactions, processes user messages through Snowflake Cortex Agents,
 * and provides real-time streaming responses with progressive Adaptive Cards.
 * 
 * Key Features:
 * - Real-time streaming responses with agent reasoning display
 * - Adaptive Cards with separate SQL query and results cards
 * - Bot Framework Emulator compatibility with fallback mechanisms
 * - CSV export for large datasets
 * - Dynamic environment detection (emulator vs production)
 */
class TeamsSnowflakeBot extends ActivityHandler {
    /**
     * Constructor - Initialize the bot with required services
     * 
     * @param {Object} snowflakeService - Service for Snowflake Cortex Agents API integration
     * @param {Object} logger - Winston logger instance for structured logging
     */
    constructor(snowflakeService, logger) {
        super();
        this.snowflakeService = snowflakeService;
        this.logger = logger;
        
        /**
         * Handle new members being added to the Teams conversation
         * Sends a welcome card to introduce the bot's capabilities
         */
        this.onMembersAdded(async (context, next) => {
            const membersAdded = context.activity.membersAdded;
            
            // Send welcome message to each new member (excluding the bot itself)
            for (let cnt = 0; cnt < membersAdded.length; ++cnt) {
                if (membersAdded[cnt].id !== context.activity.recipient.id) {
                    const welcomeCard = this.createWelcomeCard();
                    await context.sendActivity(MessageFactory.attachment(welcomeCard));
                }
            }
            
            await next();
        });

        /**
         * Handle incoming messages from users
         * Main message processing pipeline with streaming Adaptive Cards
         */
        this.onMessage(async (context, next) => {
            const userMessage = context.activity.text;
            this.logger.info(`Received message: ${userMessage}`);
            
            // Handle simple test command for connectivity verification
            if (userMessage.toLowerCase().includes('test bot')) {
                console.log('🧪 Test bot command detected, sending simple response');
                await context.sendActivity(MessageFactory.text('🤖 Bot is working! This is a test response to verify communication.'));
                console.log('✅ Test response sent');
                await next();
                return;
            }
            
            try {
                // Show typing indicator
                await this.sendTypingIndicator(context);
                
                // Send immediate acknowledgment only for non-emulator environments
                const acknowledgment = this.getAcknowledgmentMessage();
                await context.sendActivity(MessageFactory.text(acknowledgment));
                // Small delay to prevent message collision
                await this.delay(500);
                
                // Process the question through Snowflake Cortex Agents with streaming
                console.log('🔄 Processing Snowflake query with streaming...');
                
                // State for streaming Adaptive Cards with queuing
                let thinkingCardActivity = null;
                let analysisCardActivity = null;
                let accumulatedThinking = '';
                let accumulatedAnalysis = '';
                let thinkingCardCreated = false;
                let analysisCardCreated = false;
                let thinkingUpdateTimer = null;
                let analysisUpdateTimer = null;
                const CARD_UPDATE_INTERVAL = 1000; // Update cards every 1 second
                
                // Helper functions for queued card updates (hybrid approach for emulator compatibility)
                const scheduleThinkingUpdate = () => {
                    if (thinkingUpdateTimer) return; // Already scheduled
                    
                    thinkingUpdateTimer = setTimeout(async () => {
                        try {
                            if (accumulatedThinking.trim()) {
                                // Force fallback for Bot Framework Emulator compatibility
                                if (this.isEmulator(context)) {
                                    console.log(`🤔 Emulator detected: Sending new thinking card (${accumulatedThinking.length} chars)...`);
                                    const fallbackCard = this.createStreamingThinkingCard(accumulatedThinking);
                                    await context.sendActivity(MessageFactory.attachment(fallbackCard));
                                    console.log(`🤔 Sent new thinking card for emulator`);
                                } else {
                                    // Try updateActivity for production channels
                                    if (thinkingCardActivity?.id) {
                                        console.log(`🤔 Production: Updating thinking card (${accumulatedThinking.length} chars) with ID: ${thinkingCardActivity.id}...`);
                                        
                                        const updatedThinkingCard = this.createStreamingThinkingCard(accumulatedThinking);
                                        const updateActivity = MessageFactory.attachment(updatedThinkingCard);
                                        updateActivity.id = thinkingCardActivity.id;
                                        
                                        const updateResult = await context.updateActivity(updateActivity);
                                        console.log(`🤔 Production update successful. Result:`, updateResult);
                                    } else {
                                        throw new Error('No activity ID available');
                                    }
                                }
                            }
                        } catch (error) {
                            // Fallback: Send new card
                            if (accumulatedThinking.trim()) {
                                console.log(`🤔 Error fallback: Sending new thinking card (${accumulatedThinking.length} chars)...`);
                                const fallbackCard = this.createStreamingThinkingCard(accumulatedThinking);
                                await context.sendActivity(MessageFactory.attachment(fallbackCard));
                                console.log(`🤔 Sent error fallback thinking card`);
                            }
                        } finally {
                            thinkingUpdateTimer = null; // Reset timer
                        }
                    }, CARD_UPDATE_INTERVAL);
                };

                const scheduleAnalysisUpdate = () => {
                    if (analysisUpdateTimer) return; // Already scheduled
                    
                    analysisUpdateTimer = setTimeout(async () => {
                        try {
                            if (accumulatedAnalysis.trim()) {
                                // Force fallback for Bot Framework Emulator compatibility
                                if (this.isEmulator(context)) {
                                    console.log(`📊 Emulator detected: Sending new analysis card (${accumulatedAnalysis.length} chars)...`);
                                    const fallbackCard = this.createStreamingAnalysisCard(accumulatedAnalysis);
                                    await context.sendActivity(MessageFactory.attachment(fallbackCard));
                                    console.log(`📊 Sent new analysis card for emulator`);
                                } else {
                                    // Try updateActivity for production channels
                                    if (analysisCardActivity?.id) {
                                        console.log(`📊 Production: Updating analysis card (${accumulatedAnalysis.length} chars) with ID: ${analysisCardActivity.id}...`);
                                        
                                        const updatedAnalysisCard = this.createStreamingAnalysisCard(accumulatedAnalysis);
                                        const updateActivity = MessageFactory.attachment(updatedAnalysisCard);
                                        updateActivity.id = analysisCardActivity.id;
                                        
                                        const updateResult = await context.updateActivity(updateActivity);
                                        console.log(`📊 Production update successful. Result:`, updateResult);
                                    } else {
                                        throw new Error('No activity ID available');
                                    }
                                }
                            }
                        } catch (error) {
                            // Fallback: Send new card
                            if (accumulatedAnalysis.trim()) {
                                console.log(`📊 Error fallback: Sending new analysis card (${accumulatedAnalysis.length} chars)...`);
                                const fallbackCard = this.createStreamingAnalysisCard(accumulatedAnalysis);
                                await context.sendActivity(MessageFactory.attachment(fallbackCard));
                                console.log(`📊 Sent error fallback analysis card`);
                            }
                        } finally {
                            analysisUpdateTimer = null; // Reset timer
                        }
                    }, CARD_UPDATE_INTERVAL);
                };

                // Create delta callback for streaming Adaptive Cards with queuing
                const deltaCallback = async (delta) => {
                    try {
                        let shouldUpdateThinking = false;
                        let shouldUpdateAnalysis = false;
                        
                        // Process delta content and accumulate
                        if (delta.content && delta.content.length > 0) {
                            for (const content of delta.content) {
                                // Handle thinking content for thinking card
                                if (content.type === 'thinking' && content.thinking) {
                                    let thinkingContent = '';
                                    
                                    // Extract thinking text from various formats
                                    if (typeof content.thinking === 'string') {
                                        thinkingContent = content.thinking;
                                    } else if (typeof content.thinking === 'object') {
                                        thinkingContent = content.thinking.text || 
                                                        content.thinking.content || 
                                                        content.thinking.message || 
                                                        JSON.stringify(content.thinking, null, 2);
                                    }
                                    
                                    accumulatedThinking += thinkingContent;
                                    shouldUpdateThinking = true;
                                    console.log(`🤔 Thinking delta queued: "${thinkingContent.substring(0, 50)}..."`);
                                }
                                
                                // Handle text content for analysis card  
                                if (content.type === 'text' && content.text) {
                                    accumulatedAnalysis += content.text;
                                    shouldUpdateAnalysis = true;
                                    console.log(`📊 Analysis delta queued: "${content.text.substring(0, 50)}..."`);
                                }
                            }
                        }
                        
                        // Create or schedule update for thinking card
                        if (shouldUpdateThinking) {
                            if (!thinkingCardCreated && accumulatedThinking.trim()) {
                                // Create initial thinking card immediately
                                thinkingCardCreated = true;
                                
                                try {
                                    const thinkingCard = this.createStreamingThinkingCard(accumulatedThinking);
                                    thinkingCardActivity = await context.sendActivity(MessageFactory.attachment(thinkingCard));
                                    console.log(`🤔 Created initial thinking card with ID: ${thinkingCardActivity.id}`);
                                } catch (createError) {
                                    console.warn('⚠️ Failed to create thinking card:', createError.message);
                                    thinkingCardCreated = false; // Reset on failure
                                }
                            } else if (thinkingCardCreated && thinkingCardActivity) {
                                // Schedule update (will queue deltas until timer fires)
                                scheduleThinkingUpdate();
                            }
                        }
                        
                        // Create or schedule update for analysis card
                        if (shouldUpdateAnalysis) {
                            if (!analysisCardCreated && accumulatedAnalysis.trim()) {
                                // Create initial analysis card immediately
                                analysisCardCreated = true;
                                
                                try {
                                    const analysisCard = this.createStreamingAnalysisCard(accumulatedAnalysis);
                                    analysisCardActivity = await context.sendActivity(MessageFactory.attachment(analysisCard));
                                    console.log(`📊 Created initial analysis card with ID: ${analysisCardActivity.id}`);
                                } catch (createError) {
                                    console.warn('⚠️ Failed to create analysis card:', createError.message);
                                    analysisCardCreated = false; // Reset on failure
                                }
                            } else if (analysisCardCreated && analysisCardActivity) {
                                // Schedule update (will queue deltas until timer fires)
                                scheduleAnalysisUpdate();
                            }
                        }
                        
                    } catch (error) {
                        console.warn('⚠️ Error in streaming card delta callback:', error.message);
                    }
                };
                
                // Process with streaming
                const response = await this.processSnowflakeQueryWithStreaming(userMessage, context, deltaCallback);
                console.log(`📝 Got final response: ${response ? response.length : 'null'} characters`);
                
                // Finalize the streaming Adaptive Cards
                try {
                    // Clear any pending update timers
                    if (thinkingUpdateTimer) {
                        clearTimeout(thinkingUpdateTimer);
                        thinkingUpdateTimer = null;
                    }
                    if (analysisUpdateTimer) {
                        clearTimeout(analysisUpdateTimer);
                        analysisUpdateTimer = null;
                    }
                    
                    // Send final cards with complete content (no cursor) using emulator-aware approach
                    if (thinkingCardCreated && accumulatedThinking.trim()) {
                        const finalThinkingCard = this.createStreamingThinkingCard(accumulatedThinking, true);
                        
                        if (this.isEmulator(context)) {
                            // Always send new card for emulator
                            await context.sendActivity(MessageFactory.attachment(finalThinkingCard));
                            console.log(`🤔 Sent final thinking card (removed cursor) for emulator`);
                        } else {
                            // Try updateActivity for production channels
                            try {
                                if (thinkingCardActivity?.id) {
                                    const finalUpdateActivity = MessageFactory.attachment(finalThinkingCard);
                                    finalUpdateActivity.id = thinkingCardActivity.id;
                                    
                                    await context.updateActivity(finalUpdateActivity);
                                    console.log(`🤔 Updated final thinking card (removed cursor) with ID: ${thinkingCardActivity.id}`);
                                } else {
                                    throw new Error('No thinking activity ID available');
                                }
                            } catch (updateError) {
                                console.warn(`⚠️ Final thinking card update failed, sending new card: ${updateError.message}`);
                                await context.sendActivity(MessageFactory.attachment(finalThinkingCard));
                                console.log(`🤔 Sent final thinking card as new message`);
                            }
                        }
                    }
                    
                    if (analysisCardCreated && accumulatedAnalysis.trim()) {
                        const finalAnalysisCard = this.createStreamingAnalysisCard(accumulatedAnalysis, true);
                        
                        if (this.isEmulator(context)) {
                            // Always send new card for emulator
                            await context.sendActivity(MessageFactory.attachment(finalAnalysisCard));
                            console.log(`📊 Sent final analysis card for emulator`);
                        } else {
                            // Try updateActivity for production channels
                            try {
                                if (analysisCardActivity?.id) {
                                    const finalUpdateActivity = MessageFactory.attachment(finalAnalysisCard);
                                    finalUpdateActivity.id = analysisCardActivity.id;
                                    
                                    await context.updateActivity(finalUpdateActivity);
                                    console.log(`📊 Updated final analysis card with ID: ${analysisCardActivity.id}`);
                                } else {
                                    throw new Error('No analysis activity ID available');
                                }
                            } catch (updateError) {
                                console.warn(`⚠️ Final analysis card update failed, sending new card: ${updateError.message}`);
                                await context.sendActivity(MessageFactory.attachment(finalAnalysisCard));
                                console.log(`📊 Sent final analysis card as new message`);
                            }
                        }
                    }
                    
                    // If we have streaming response data, create additional cards for SQL results
                    console.log(`🔍 Raw response type: ${typeof response}, length: ${response?.length}`);
                    console.log(`🔍 Raw response preview: ${JSON.stringify(response).substring(0, 200)}...`);
                    
                    // Send SQL query and results as separate cards
                    if (response && typeof response === 'object' && response.data) {
                        // Send SQL query card first
                        if (response.sql) {
                            const sqlCard = this.createSqlQueryCard(response.sql);
                            await context.sendActivity(MessageFactory.attachment(sqlCard));
                            console.log('📝 Sent SQL query card');
                        }
                        
                        // Then send query results card
                        const resultsCard = this.createQueryResultsCard(response);
                        await context.sendActivity(MessageFactory.attachment(resultsCard));
                        console.log('📊 Sent query results card');
                    } else if (response && typeof response === 'string' && response.includes('Query Results:')) {
                        // Parse text response for additional data
                        const dataCard = this.createBasicTextCard("📊 Query Results", response);
                        await context.sendActivity(MessageFactory.attachment(dataCard));
                        console.log('📊 Sent query results card');
                    }
                    
                    console.log('✅ Completed streaming Adaptive Cards');
                    
                } catch (finalUpdateError) {
                    console.warn('⚠️ Final card update failed:', finalUpdateError.message);
                    console.log('🔍 Fallback - raw response:', JSON.stringify(response).substring(0, 200));
                    // Fallback to standard Adaptive Card response
                    await this.sendAdaptiveCardResponse(context, response);
                    console.log('✅ Sent fallback Adaptive Card response');
                }
                
            } catch (error) {
                console.error('❌ Error in message processing:', error);
                this.logger.error('Error processing message:', error);
                
                // Always send a response, even if there's an error
                const errorMessage = `Sorry, I encountered an error while processing your question: ${error.message}. Please try again or rephrase your question.`;
                try {
                    await context.sendActivity(MessageFactory.text(errorMessage));
                    console.log('✅ Error message sent to user');
                } catch (sendError) {
                    console.error('❌ Failed to send error message:', sendError);
                }
            }
            
            await next();
        });
    }



    async processSnowflakeQueryWithStreaming(query, context, onDelta = null) {
        try {
            // Validate and sanitize the query
            const sanitizedQuery = this.sanitizeQuery(query);
            
            if (!sanitizedQuery || sanitizedQuery.length === 0) {
                return "I need a question to help you. Please ask me about your data.";
            }
            
            // Create a delta callback that passes deltas directly to onDelta
            let deltaCallback = null;
            if (onDelta && typeof onDelta === 'function') {
                deltaCallback = (delta) => {
                    try {
                        // Pass delta directly to onDelta for progressive message updates
                        // The onDelta callback will handle its own formatting
                        onDelta(delta);
                    } catch (err) {
                        this.logger.warn('Error in delta callback:', err.message);
                    }
                };
            }
            
            // Process everything through Snowflake Cortex Agents with streaming
            const result = await this.snowflakeService.queryWithCortexAgents(sanitizedQuery, deltaCallback);
            
            // Format the final response for Teams
            const formattedResponse = this.formatSnowflakeResponse(result);
            
            // Handle multiple messages vs single message for streaming
            if (formattedResponse.hasMultipleMessages) {
                // Send thinking message as a separate delta if available
                if (onDelta && formattedResponse.thinkingMessage) {
                    onDelta({
                        type: 'thinking_complete',
                        message: formattedResponse.thinkingMessage
                    });
                }
                return formattedResponse.mainMessage;
            }
            
            return formattedResponse;
            
        } catch (error) {
            this.logger.error('Error in processSnowflakeQueryWithStreaming:', error);
            return "I'm sorry, I encountered an error while processing your request. Please try again or rephrase your question.";
        }
    }



    sanitizeQuery(query) {
        // Check if query is valid
        if (!query || typeof query !== 'string') {
            return '';
        }
        
        // Remove potential SQL injection attempts and clean the query
        return query.trim()
            .replace(/;+$/, '') // Remove trailing semicolons
            .replace(/--.*$/gm, '') // Remove SQL comments
            .replace(/\/\*[\s\S]*?\*\//g, ''); // Remove block comments
    }



    formatSnowflakeResponse(result) {
        if (!result) {
            return "I wasn't able to find relevant information for your query. Please try rephrasing your question or ask about something more specific.";
        }

        // Handle new structure with separate message groups
        if (result.hasMultipleMessages && result.mainMessage && result.thinkingMessage) {
            return {
                mainMessage: this.formatSingleResponse(result.mainMessage, false),
                thinkingMessage: this.formatSingleResponse(result.thinkingMessage, true),
                hasMultipleMessages: true
            };
        }

        // Handle single message (traditional response)
        return this.formatSingleResponse(result);
    }

    formatSingleResponse(result, isThinking = false) {
        if (!result) {
            return "I wasn't able to find relevant information for your query. Please try rephrasing your question or ask about something more specific.";
        }

        // For thinking messages, don't add headers and just return the content
        if (isThinking) {
            if (result.summary) {
                return result.summary;
            }
            // If no summary, extract content from the result structure
            if (result.content && Array.isArray(result.content)) {
                return result.content.map(item => item.text || '').join('\n');
            }
            return result.text || result.message || "Agent reasoning content";
        }

        let response = "📊 **Analysis Results:**\n\n";
        
        if (result.summary) {
            response += `**Summary:** ${result.summary}\n\n`;
        }
        
        // Add SQL query section first (before results for transparency)
        if (result.sql && result.sql.trim()) {
            response += "**📝 SQL Query**\n";
            response += "```sql\n";
            response += result.sql;
            response += "\n```\n\n";
        }

        if (result.insights) {
            response += `\n💡 **Insights:** ${result.insights}\n`;
        }
        
        if (result.data && result.data.length > 0) {
            // Check if this is SQL query results for table formatting
            if (result.sql && result.sql.trim()) {
                response += "**Query Results:**\n";
                response += this.formatDataAsTable(result.data);
                
                // Add CSV download section
                const csvContent = this.generateCSV(result.data);
                
                if (result.data.length > 10) {
                    // For large datasets, write to file
                    const csvFilePath = this.writeCSVFile(csvContent, result.data.length);
                    response += "\n**📊 CSV File Created**\n";
                    response += `✅ **${csvFilePath}** has been created with all ${result.data.length} records.\n\n`;
                    response += "*The file is ready for download and can be opened in Excel, Google Sheets, or any spreadsheet application.*\n\n";
                } else {
                    // For small datasets, show CSV content
                    response += "\n**📊 CSV Download**\n";
                    response += "Copy the content below and save as a `.csv` file:\n\n";
                    response += "```csv\n";
                    response += csvContent;
                    response += "```\n\n";
                }
                
                // Skip SQL query display in main response for cleaner look
            } else {
                response += "**Key Findings:**\n";
                result.data.slice(0, 5).forEach((row, index) => {
                    response += `${index + 1}. ${this.formatDataRow(row)}\n`;
                });
                
                if (result.data.length > 5) {
                    response += `\n*... and ${result.data.length - 5} more results*\n`;
                }
            }
        }
        

        
        if (result.recommendations) {
            response += `\n🎯 **Recommendations:** ${result.recommendations}\n`;
        }
        
        //response += "\n*Ask follow-up questions to dive deeper into the analysis!*";
        
        return response;
    }

    getAcknowledgmentMessage() {
        const messages = [
            "🔍 Working on it...",
            "📊 Let me take a look...",
            "⚡ Analyzing your request...",
            "🧠 Processing your query...",
            "🔎 Looking into that for you...",
            "📈 Getting your data ready...",
            "⏳ Just a moment while I analyze...",
            "🎯 On it! Checking the data...",
            "💭 Let me think about that...",
            "🚀 Processing your request..."
        ];
        
        // Return a random acknowledgment message
        return messages[Math.floor(Math.random() * messages.length)];
    }

    isEmulator(context) {
        // Check if we're running in Bot Framework Emulator
        const channelId = context.activity.channelId;
        const serviceUrl = context.activity.serviceUrl;
        
        return channelId === 'emulator' || 
               serviceUrl?.includes('localhost') || 
               serviceUrl?.includes('127.0.0.1');
    }

    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Adaptive Card Response Methods
    async sendAdaptiveCardResponse(context, response) {
        try {
            // Handle different response types
            if (typeof response === 'string') {
                // Simple text response - convert to basic card
                const card = this.createBasicTextCard("📊 Analysis Results", response);
                await context.sendActivity(MessageFactory.attachment(card));
                return;
            }

            if (response && typeof response === 'object') {
                if (response.hasMultipleMessages) {
                    // Send thinking card first
                    if (response.thinkingMessage) {
                        const thinkingCard = this.createThinkingCard(response.thinkingMessage);
                        await context.sendActivity(MessageFactory.attachment(thinkingCard));
                        await this.delay(500); // Ensure order
                    }

                    // Send main analysis card
                    if (response.mainMessage) {
                        const analysisCard = this.createAnalysisCard(response.mainMessage);
                        await context.sendActivity(MessageFactory.attachment(analysisCard));
                    }
                } else {
                    // Single response object - create comprehensive card
                    const card = this.createAnalysisCard(response);
                    await context.sendActivity(MessageFactory.attachment(card));
                }
            }
        } catch (error) {
            console.error('❌ Error sending Adaptive Card:', error);
            // Fallback to text response
            await this.sendLargeResponse(context, JSON.stringify(response));
        }
    }

    createThinkingCard(thinkingData) {
        let thinkingText = '';
        
        if (typeof thinkingData === 'string') {
            thinkingText = thinkingData;
        } else if (thinkingData && typeof thinkingData === 'object') {
            thinkingText = thinkingData.summary || thinkingData.text || thinkingData.message || JSON.stringify(thinkingData);
        }

        return CardFactory.adaptiveCard({
            "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
            "type": "AdaptiveCard",
            "version": "1.3",
            "body": [
                {
                    "type": "Container",
                    "style": "emphasis",
                    "items": [
                        {
                            "type": "ColumnSet",
                            "columns": [
                                {
                                    "type": "Column",
                                    "width": "auto",
                                    "items": [
                                        {
                                            "type": "TextBlock",
                                            "text": "🤔",
                                            "size": "Large",
                                            "spacing": "None"
                                        }
                                    ]
                                },
                                {
                                    "type": "Column",
                                    "width": "stretch",
                                    "items": [
                                        {
                                            "type": "TextBlock",
                                            "text": "Agent Reasoning",
                                            "weight": "Bolder",
                                            "size": "Medium",
                                            "spacing": "None"
                                        }
                                    ]
                                }
                            ]
                        }
                    ]
                },
                {
                    "type": "TextBlock",
                    "text": thinkingText,
                    "wrap": true,
                    "spacing": "Medium",
                    "fontType": "Monospace",
                    "size": "Small"
                }
            ]
        });
    }

    createAnalysisCard(analysisData) {
        // Parse the analysis data
        let summary = '';
        let sql = '';
        let data = [];
        let insights = '';
        let recommendations = '';
        let csvPath = '';

        if (typeof analysisData === 'string') {
            // Parse text response to extract components
            const sections = this.parseTextResponse(analysisData);
            summary = sections.summary;
            sql = sections.sql;
            data = sections.data;
            insights = sections.insights;
            recommendations = sections.recommendations;
            csvPath = sections.csvPath;
        } else if (analysisData && typeof analysisData === 'object') {
            summary = analysisData.summary || '';
            sql = analysisData.sql || '';
            data = analysisData.data || [];
            insights = analysisData.insights || '';
            recommendations = analysisData.recommendations || '';
            csvPath = analysisData.csvPath || '';
        }

        const cardBody = [
            {
                "type": "Container",
                "style": "emphasis",
                "items": [
                    {
                        "type": "ColumnSet",
                        "columns": [
                            {
                                "type": "Column",
                                "width": "auto",
                                "items": [
                                    {
                                        "type": "TextBlock",
                                        "text": "📊",
                                        "size": "Large",
                                        "spacing": "None"
                                    }
                                ]
                            },
                            {
                                "type": "Column",
                                "width": "stretch",
                                "items": [
                                    {
                                        "type": "TextBlock",
                                        "text": "Analysis Results",
                                        "weight": "Bolder",
                                        "size": "Medium",
                                        "spacing": "None"
                                    }
                                ]
                            }
                        ]
                    }
                ]
            }
        ];

        // Add summary if available
        if (summary) {
            cardBody.push({
                "type": "TextBlock",
                "text": `**Summary:** ${summary}`,
                "wrap": true,
                "spacing": "Medium"
            });
        }

        // Add SQL query in collapsible container
        if (sql) {
            cardBody.push({
                "type": "Container",
                "style": "default",
                "items": [
                    {
                        "type": "TextBlock",
                        "text": "📝 **SQL Query**",
                        "weight": "Bolder",
                        "spacing": "Medium"
                    },
                    {
                        "type": "TextBlock",
                        "text": sql,
                        "wrap": true,
                        "fontType": "Monospace",
                        "size": "Small",
                        "color": "Dark"
                    }
                ],
                "spacing": "Medium"
            });
        }

        // Add data table if available
        if (data && data.length > 0) {
            const tableContainer = this.createDataTableContainer(data);
            cardBody.push(tableContainer);
        }

        // Add insights
        if (insights) {
            cardBody.push({
                "type": "TextBlock",
                "text": `💡 **Insights:** ${insights}`,
                "wrap": true,
                "spacing": "Medium"
            });
        }

        // Add recommendations
        if (recommendations) {
            cardBody.push({
                "type": "TextBlock",
                "text": `🎯 **Recommendations:** ${recommendations}`,
                "wrap": true,
                "spacing": "Medium"
            });
        }

        // Add CSV download info
        if (csvPath) {
            cardBody.push({
                "type": "Container",
                "style": "good",
                "items": [
                    {
                        "type": "TextBlock",
                        "text": `📊 **CSV File Created:** ${csvPath}`,
                        "weight": "Bolder",
                        "color": "Good"
                    },
                    {
                        "type": "TextBlock",
                        "text": "The file is ready for download and can be opened in Excel, Google Sheets, or any spreadsheet application.",
                        "wrap": true,
                        "size": "Small"
                    }
                ],
                "spacing": "Medium"
            });
        }

        return CardFactory.adaptiveCard({
            "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
            "type": "AdaptiveCard",
            "version": "1.3",
            "body": cardBody
        });
    }

    createDataTableContainer(data) {
        if (!data || data.length === 0) return null;

        const headers = Object.keys(data[0]);
        const maxRowsToShow = 10; // Limit rows in card to prevent overflow
        const rowsToShow = data.slice(0, maxRowsToShow);
        
        // Create table header
        const headerRow = {
            "type": "ColumnSet",
            "columns": headers.map(header => ({
                "type": "Column",
                "width": "stretch",
                "items": [
                    {
                        "type": "TextBlock",
                        "text": header,
                        "weight": "Bolder",
                        "size": "Small",
                        "wrap": true
                    }
                ]
            }))
        };

        // Create table rows
        const dataRows = rowsToShow.map(row => ({
            "type": "ColumnSet",
            "columns": headers.map(header => ({
                "type": "Column",
                "width": "stretch",
                "items": [
                    {
                        "type": "TextBlock",
                        "text": String(row[header] || ''),
                        "size": "Small",
                        "wrap": true
                    }
                ]
            }))
        }));

        const tableItems = [
            {
                "type": "TextBlock",
                "text": "**Query Results:**",
                "weight": "Bolder",
                "spacing": "Medium"
            },
            headerRow,
            ...dataRows
        ];

        // Add "more results" indicator if needed
        if (data.length > maxRowsToShow) {
            tableItems.push({
                "type": "TextBlock",
                "text": `*... and ${data.length - maxRowsToShow} more results*`,
                "size": "Small",
                "color": "Accent",
                "spacing": "Small"
            });
        }

        return {
            "type": "Container",
            "items": tableItems,
            "spacing": "Medium"
        };
    }

    createBasicTextCard(title, content) {
        return CardFactory.adaptiveCard({
            "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
            "type": "AdaptiveCard",
            "version": "1.3",
            "body": [
                {
                    "type": "TextBlock",
                    "text": title,
                    "weight": "Bolder",
                    "size": "Medium"
                },
                {
                    "type": "TextBlock",
                    "text": content,
                    "wrap": true,
                    "spacing": "Medium"
                }
            ]
        });
    }

    parseTextResponse(text) {
        const sections = {
            summary: '',
            sql: '',
            data: [],
            insights: '',
            recommendations: '',
            csvPath: ''
        };

        // Extract summary
        const summaryMatch = text.match(/\*\*Summary:\*\*\s*(.+?)(?=\n\*\*|\n📝|\n💡|\n🎯|$)/s);
        if (summaryMatch) sections.summary = summaryMatch[1].trim();

        // Extract SQL query
        const sqlMatch = text.match(/```sql\n([\s\S]*?)\n```/);
        if (sqlMatch) sections.sql = sqlMatch[1].trim();

        // Extract insights
        const insightsMatch = text.match(/💡\s*\*\*Insights:\*\*\s*(.+?)(?=\n\*\*|\n🎯|$)/s);
        if (insightsMatch) sections.insights = insightsMatch[1].trim();

        // Extract recommendations
        const recommendationsMatch = text.match(/🎯\s*\*\*Recommendations:\*\*\s*(.+?)(?=\n\*\*|$)/s);
        if (recommendationsMatch) sections.recommendations = recommendationsMatch[1].trim();

        // Extract CSV path
        const csvMatch = text.match(/📊\s*\*\*CSV File Created\*\*[\s\S]*?\*\*(.+?)\*\*/);
        if (csvMatch) sections.csvPath = csvMatch[1].trim();

        return sections;
    }

    // Streaming Adaptive Card Methods
    createStreamingThinkingCard(thinkingText, isComplete = false) {
        // Add cursor if not complete
        const displayText = isComplete ? thinkingText : thinkingText + " ▊";
        const status = isComplete ? "Agent Reasoning" : "Agent Reasoning (thinking...)";
        
        return CardFactory.adaptiveCard({
            "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
            "type": "AdaptiveCard",
            "version": "1.3",
            "body": [
                {
                    "type": "Container",
                    "style": isComplete ? "emphasis" : "attention",
                    "items": [
                        {
                            "type": "ColumnSet",
                            "columns": [
                                {
                                    "type": "Column",
                                    "width": "auto",
                                    "items": [
                                        {
                                            "type": "TextBlock",
                                            "text": "🤔",
                                            "size": "Large",
                                            "spacing": "None"
                                        }
                                    ]
                                },
                                {
                                    "type": "Column",
                                    "width": "stretch",
                                    "items": [
                                        {
                                            "type": "TextBlock",
                                            "text": status,
                                            "weight": "Bolder",
                                            "size": "Medium",
                                            "spacing": "None"
                                        }
                                    ]
                                }
                            ]
                        }
                    ]
                },
                {
                    "type": "TextBlock",
                    "text": displayText,
                    "wrap": true,
                    "spacing": "Medium",
                    "fontType": "Monospace",
                    "size": "Small"
                }
            ]
        });
    }

    createStreamingAnalysisCard(analysisText, isComplete = false) {
        // Add cursor if not complete
        const displayText = isComplete ? analysisText : analysisText + " ▊";
        const status = isComplete ? "Analysis Results" : "Analysis in Progress...";
        
        return CardFactory.adaptiveCard({
            "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
            "type": "AdaptiveCard",
            "version": "1.3",
            "body": [
                {
                    "type": "Container",
                    "style": isComplete ? "emphasis" : "accent",
                    "items": [
                        {
                            "type": "ColumnSet",
                            "columns": [
                                {
                                    "type": "Column",
                                    "width": "auto",
                                    "items": [
                                        {
                                            "type": "TextBlock",
                                            "text": "📊",
                                            "size": "Large",
                                            "spacing": "None"
                                        }
                                    ]
                                },
                                {
                                    "type": "Column",
                                    "width": "stretch",
                                    "items": [
                                        {
                                            "type": "TextBlock",
                                            "text": status,
                                            "weight": "Bolder",
                                            "size": "Medium",
                                            "spacing": "None"
                                        }
                                    ]
                                }
                            ]
                        }
                    ]
                },
                {
                    "type": "TextBlock",
                    "text": displayText,
                    "wrap": true,
                    "spacing": "Medium",
                    "size": "Small"
                }
            ]
        });
    }

    createSqlQueryCard(sql) {
        return CardFactory.adaptiveCard({
            "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
            "type": "AdaptiveCard",
            "version": "1.3",
            "body": [
                {
                    "type": "Container",
                    "style": "emphasis",
                    "items": [
                        {
                            "type": "ColumnSet",
                            "columns": [
                                {
                                    "type": "Column",
                                    "width": "auto",
                                    "items": [
                                        {
                                            "type": "TextBlock",
                                            "text": "📝",
                                            "size": "Large",
                                            "spacing": "None"
                                        }
                                    ]
                                },
                                {
                                    "type": "Column",
                                    "width": "stretch",
                                    "items": [
                                        {
                                            "type": "TextBlock",
                                            "text": "SQL Query",
                                            "weight": "Bolder",
                                            "size": "Medium",
                                            "spacing": "None"
                                        }
                                    ]
                                }
                            ]
                        }
                    ]
                },
                {
                    "type": "Container",
                    "style": "default",
                    "items": [
                        {
                            "type": "TextBlock",
                            "text": sql,
                            "wrap": true,
                            "fontType": "Monospace",
                            "size": "Small",
                            "color": "Dark"
                        }
                    ],
                    "spacing": "Medium"
                }
            ]
        });
    }

    createQueryResultsCard(responseData) {
        const cardBody = [
            {
                "type": "Container",
                "style": "good",
                "items": [
                    {
                        "type": "ColumnSet",
                        "columns": [
                            {
                                "type": "Column",
                                "width": "auto",
                                "items": [
                                    {
                                        "type": "TextBlock",
                                        "text": "📊",
                                        "size": "Large",
                                        "spacing": "None"
                                    }
                                ]
                            },
                            {
                                "type": "Column",
                                "width": "stretch",
                                "items": [
                                    {
                                        "type": "TextBlock",
                                        "text": "Query Results",
                                        "weight": "Bolder",
                                        "size": "Medium",
                                        "spacing": "None"
                                    }
                                ]
                            }
                        ]
                    }
                ]
            }
        ];

        // Add data table if available
        if (responseData.data && responseData.data.length > 0) {
            const tableContainer = this.createDataTableContainer(responseData.data);
            if (tableContainer) {
                cardBody.push(tableContainer);
            }
        }

        // Add CSV info if available
        if (responseData.csvPath) {
            cardBody.push({
                "type": "Container",
                "style": "good",
                "items": [
                    {
                        "type": "TextBlock",
                        "text": `📊 **CSV File Created:** ${responseData.csvPath}`,
                        "weight": "Bolder",
                        "color": "Good"
                    },
                    {
                        "type": "TextBlock",
                        "text": "The file is ready for download and can be opened in Excel, Google Sheets, or any spreadsheet application.",
                        "wrap": true,
                        "size": "Small"
                    }
                ],
                "spacing": "Medium"
            });
        }

        return CardFactory.adaptiveCard({
            "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
            "type": "AdaptiveCard",
            "version": "1.3",
            "body": cardBody
        });
    }

    async sendLargeResponse(context, response) {
        try {
            console.log(`📏 sendLargeResponse called with ${response ? response.length : 'null'} chars`);
            const maxLength = 4000; // Bot Framework message limit
            
            if (!response) {
                console.log('❌ No response to send');
                await context.sendActivity(MessageFactory.text('❌ No response received from Snowflake. Please try again.'));
                return;
            }
            
            if (response.length <= maxLength) {
                // Response is small enough, send as-is
                console.log(`📤 Sending single message (${response.length} chars)`);
                await context.sendActivity(MessageFactory.text(response));
                console.log('✅ Single message sent');
                return;
            }

            // Response is too large, need to chunk it
            console.log(`⚠️ Response too large (${response.length} chars), chunking...`);
            
            // Split response intelligently at logical break points
            const chunks = this.splitResponseIntoChunks(response, maxLength);
            console.log(`📦 Split into ${chunks.length} chunks`);
            
            for (let i = 0; i < chunks.length; i++) {
                const chunk = chunks[i];
                const chunkMessage = i === 0 ? chunk : `📄 **Continued...**\n\n${chunk}`;
                
                console.log(`📤 Sending chunk ${i + 1}/${chunks.length} (${chunkMessage.length} chars)`);
                await context.sendActivity(MessageFactory.text(chunkMessage));
                console.log(`✅ Chunk ${i + 1} sent`);
                
                // Small delay between chunks to prevent rate limiting
                if (i < chunks.length - 1) {
                    await this.delay(300);
                }
            }
            console.log('🎉 All chunks sent successfully');
        } catch (error) {
            this.logger.error('Error sending large response:', error);
            
            // Fallback: send a simplified error message
            await context.sendActivity(MessageFactory.text(
                "⚠️ I processed your request successfully, but the response was too large to display. " +
                "Please try asking for a more specific subset of the data or contact your administrator."
            ));
        }
    }

    splitResponseIntoChunks(response, maxLength) {
        const chunks = [];
        let currentChunk = '';
        
        // Split by sections (headers with **) to keep logical groupings
        const sections = response.split(/(\n\*\*[^*]+\*\*)/);
        
        for (const section of sections) {
            // If adding this section would exceed the limit
            if (currentChunk.length + section.length > maxLength) {
                if (currentChunk.trim()) {
                    chunks.push(currentChunk.trim());
                    currentChunk = '';
                }
                
                // If even a single section is too large, split by lines
                if (section.length > maxLength) {
                    const lines = section.split('\n');
                    for (const line of lines) {
                        if (currentChunk.length + line.length + 1 > maxLength) {
                            if (currentChunk.trim()) {
                                chunks.push(currentChunk.trim());
                                currentChunk = '';
                            }
                        }
                        currentChunk += (currentChunk ? '\n' : '') + line;
                    }
                } else {
                    currentChunk = section;
                }
            } else {
                currentChunk += section;
            }
        }
        
        // Add the last chunk
        if (currentChunk.trim()) {
            chunks.push(currentChunk.trim());
        }
        
        // If no chunks were created, split by character limit as fallback
        if (chunks.length === 0) {
            for (let i = 0; i < response.length; i += maxLength) {
                chunks.push(response.substring(i, i + maxLength));
            }
        }
        
        return chunks;
    }



    formatDataAsTable(data) {
        if (!data || data.length === 0) {
            return "*No data returned*\n";
        }

        // Get all unique column names from the data
        const allColumns = new Set();
        data.forEach(row => {
            if (typeof row === 'object' && row !== null) {
                Object.keys(row).forEach(key => allColumns.add(key));
            }
        });
        
        const columns = Array.from(allColumns);
        
        if (columns.length === 0) {
            return "*No structured data to display*\n";
        }

        // Limit the number of rows displayed for readability
        const maxRows = 20;
        const displayData = data.slice(0, maxRows);
        
        // Calculate dynamic column widths based on content
        const columnWidths = this.calculateColumnWidths(columns, displayData);
        
        // Create Markdown table
        let table = "\n```\n";
        
        // Create header row
        const headerRow = columns.map(col => this.padColumn(col, columnWidths[col])).join(" | ");
        table += `| ${headerRow} |\n`;
        
        // Create separator row
        const separatorRow = columns.map(col => "-".repeat(columnWidths[col])).join(" | ");
        table += `| ${separatorRow} |\n`;
        
        // Create data rows
        displayData.forEach(row => {
            const dataRow = columns.map(col => {
                const value = row[col];
                const displayValue = value !== null && value !== undefined ? String(value) : "";
                return this.padColumn(displayValue, columnWidths[col], false); // Don't truncate
            }).join(" | ");
            table += `| ${dataRow} |\n`;
        });
        
        table += "```\n";
        
        if (data.length > maxRows) {
            table += `\n*... and ${data.length - maxRows} more rows (${data.length} total)*\n`;
        } else {
            table += `\n*${data.length} row${data.length !== 1 ? 's' : ''} returned*\n`;
        }
        
        return table;
    }

    calculateColumnWidths(columns, data) {
        const widths = {};
        
        // Initialize with column header lengths
        columns.forEach(col => {
            widths[col] = col.length;
        });
        
        // Calculate max width needed for each column based on data
        data.forEach(row => {
            columns.forEach(col => {
                const value = row[col];
                const displayValue = value !== null && value !== undefined ? String(value) : "";
                widths[col] = Math.max(widths[col], displayValue.length);
            });
        });
        
        // For SQL results, show full content without truncation
        // Only ensure minimum width for readability
        columns.forEach(col => {
            // Ensure minimum width of 8 characters for readability
            widths[col] = Math.max(widths[col], 8);
        });
        
        return widths;
    }

    padColumn(text, width, truncate = true) {
        const str = String(text);
        if (truncate && str.length > width) {
            return str.substring(0, width - 3) + "...";
        } else if (!truncate && str.length > width) {
            // For non-truncating mode, still respect max width but don't add ...
            return str.substring(0, width);
        }
        return str.padEnd(width);
    }

    generateCSV(data) {
        if (!data || data.length === 0) {
            return "No data to export";
        }

        // Get all unique column names
        const allColumns = new Set();
        data.forEach(row => {
            if (typeof row === 'object' && row !== null) {
                Object.keys(row).forEach(key => allColumns.add(key));
            }
        });
        
        const columns = Array.from(allColumns);
        if (columns.length === 0) {
            return "No structured data to export";
        }

        // Create CSV content
        let csv = '';
        
        // Add header row
        csv += columns.map(col => this.escapeCSVField(col)).join(',') + '\n';
        
        // Add data rows
        data.forEach(row => {
            const rowData = columns.map(col => {
                const value = row[col];
                const displayValue = value !== null && value !== undefined ? String(value) : "";
                return this.escapeCSVField(displayValue);
            });
            csv += rowData.join(',') + '\n';
        });
        
        return csv;
    }

    escapeCSVField(field) {
        const str = String(field);
        // If field contains comma, quotes, or newlines, wrap in quotes and escape internal quotes
        if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
            return '"' + str.replace(/"/g, '""') + '"';
        }
        return str;
    }

    writeCSVFile(csvContent, recordCount) {
        try {
            // Create exports directory if it doesn't exist
            const exportsDir = path.join(process.cwd(), 'exports');
            if (!fs.existsSync(exportsDir)) {
                fs.mkdirSync(exportsDir, { recursive: true });
            }

            // Generate filename with timestamp
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0] + '_' + 
                             new Date().toISOString().replace(/[:.]/g, '-').split('T')[1].substring(0, 8);
            const filename = `query_results_${timestamp}_${recordCount}rows.csv`;
            const filePath = path.join(exportsDir, filename);

            // Write CSV content to file
            fs.writeFileSync(filePath, csvContent, 'utf8');

            // Return relative path for user-friendly display
            return `exports/${filename}`;
        } catch (error) {
            console.error('❌ Failed to write CSV file:', error.message);
            // Return a fallback message if file write fails
            return 'CSV_Export_Failed - Please copy the data manually';
        }
    }

    formatDataRow(row) {
        // Format a data row for display in Teams (non-SQL results)
        if (typeof row === 'object') {
            const keys = Object.keys(row);
            if (keys.length <= 3) {
                return keys.map(key => `${key}: ${row[key]}`).join(', ');
            } else {
                const firstTwo = keys.slice(0, 2).map(key => `${key}: ${row[key]}`).join(', ');
                return `${firstTwo}, ... (+${keys.length - 2} more fields)`;
            }
        }
        return String(row);
    }

    createWelcomeCard() {
        const card = {
            type: 'AdaptiveCard',
            version: '1.0',
            body: [
                {
                    type: 'TextBlock',
                    text: '🎉 Welcome to Snowflake Cortex Agents Bot!',
                    weight: 'Bolder',
                    size: 'Medium',
                    color: 'Accent'
                },
                {
                    type: 'TextBlock',
                    text: 'I can help you analyze your Snowflake data using natural language questions. Just ask me anything about your data!',
                    wrap: true,
                    spacing: 'Medium'
                },
                {
                    type: 'TextBlock',
                    text: '💡 Try asking: "What were our sales last month?" or "Show me top performing products"',
                    wrap: true,
                    size: 'Small',
                    color: 'Good'
                }
            ],
            actions: [
                {
                    type: 'Action.Submit',
                    title: 'Get Started',
                    data: {
                        action: 'help'
                    }
                }
            ]
        };
        
        return CardFactory.adaptiveCard(card);
    }

    async sendTypingIndicator(context) {
        try {
            await context.sendActivity({
                type: ActivityTypes.Typing
            });
        } catch (error) {
            // Typing indicator is optional, don't fail if it doesn't work
            this.logger.warn('Could not send typing indicator:', error);
        }
    }
}

module.exports = { TeamsSnowflakeBot };