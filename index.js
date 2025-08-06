/**
 * Microsoft Teams Snowflake Cortex Agents Bot - Main Application Entry Point
 * 
 * This is the main server application that integrates Microsoft Teams with 
 * Snowflake Cortex Agents to provide AI-powered data analysis through natural
 * language queries with real-time streaming responses.
 * 
 * Architecture:
 * - RESTify HTTP server for Bot Framework webhook endpoints
 * - Bot Framework Adapter for Teams integration
 * - TeamsSnowflakeBot for message handling and Adaptive Cards
 * - SnowflakeService for Cortex Agents API and database operations
 * - Winston Logger for structured logging with rotation
 * 
 * Features:
 * - Real-time streaming responses with progressive Adaptive Cards
 * - Health check endpoints for monitoring
 * - Comprehensive error handling and logging
 * - Environment-based configuration
 */

const restify = require('restify');
const { BotFrameworkAdapter, ActivityTypes, TurnContext } = require('botbuilder');
const { TeamsSnowflakeBot } = require('./src/bot');
const { SnowflakeService } = require('./src/services/snowflakeService');
const { Logger } = require('./src/utils/logger');
require('dotenv').config();

// Initialize centralized logging service
const logger = new Logger();

// Create RESTify HTTP server with middleware
const server = restify.createServer();
server.use(restify.plugins.bodyParser()); // Parse JSON request bodies

// Create Bot Framework adapter with Teams app credentials
const adapter = new BotFrameworkAdapter({
    appId: process.env.MICROSOFT_APP_ID,
    appPassword: process.env.MICROSOFT_APP_PASSWORD
});

// Global error handler for all bot interactions
adapter.onTurnError = async (context, error) => {
    logger.error('Bot encountered an error:', error);
    await context.sendActivity('Sorry, an error occurred while processing your request. Please try again.');
};

// Initialize Snowflake service with Cortex Agents integration
const snowflakeService = new SnowflakeService();

// Create the main bot instance with dependencies
const bot = new TeamsSnowflakeBot(snowflakeService, logger);

/**
 * Main webhook endpoint for Bot Framework
 * 
 * Handles all incoming activities from Microsoft Teams including:
 * - User messages and mentions
 * - Bot installation/uninstallation events
 * - Member addition/removal events
 */
server.post('/api/messages', async (req, res) => {
    await adapter.process(req, res, async (context) => {
        await bot.run(context);
    });
});

// Health check endpoints (for different testing tools)
server.get('/health', async (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

server.get('/api/health', async (req, res) => {
    res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        version: require('./package.json').version,
        environment: process.env.NODE_ENV || 'development',
        snowflake: {
            configured: !!(process.env.SNOWFLAKE_ACCOUNT && process.env.SNOWFLAKE_USERNAME),
            agent: process.env.CORTEX_AGENTS_AGENT_NAME || 'not configured'
        }
    });
});

// Streaming endpoint for real-time delta events
server.post('/api/messages/stream', async (req, res) => {
    try {
        const { text, from } = req.body;
        
        if (!text || !text.trim()) {
            res.status(400);
            res.json({ error: 'Message text is required' });
            return;
        }
        
        // Set up Server-Sent Events headers
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Cache-Control'
        });
        
        // Send initial connection event
        res.write(`event: connected\n`);
        res.write(`data: ${JSON.stringify({ 
            type: 'connected', 
            timestamp: new Date().toISOString(),
            message: 'Connection established'
        })}\n\n`);
        
        // Create delta callback for streaming
        const onDelta = (delta) => {
            try {
                res.write(`event: delta\n`);
                res.write(`data: ${JSON.stringify(delta)}\n\n`);
            } catch (err) {
                logger.warn('Error writing delta to stream:', err.message);
            }
        };
        
        // Process query with streaming
        const result = await bot.processSnowflakeQueryWithStreaming(text.trim(), {}, onDelta);
        
        // Send final result
        res.write(`event: result\n`);
        res.write(`data: ${JSON.stringify({ 
            type: 'result',
            timestamp: new Date().toISOString(),
            content: result
        })}\n\n`);
        
        // Send completion event
        res.write(`event: done\n`);
        res.write(`data: ${JSON.stringify({ 
            type: 'done',
            timestamp: new Date().toISOString()
        })}\n\n`);
        
        res.end();
        
    } catch (error) {
        logger.error('Error in streaming endpoint:', error);
        
        // Send error event if stream is still open
        try {
            res.write(`event: error\n`);
            res.write(`data: ${JSON.stringify({ 
                type: 'error',
                timestamp: new Date().toISOString(),
                message: error.message || 'An error occurred'
            })}\n\n`);
            res.end();
        } catch (writeError) {
            logger.error('Error writing error to stream:', writeError);
        }
    }
});

// Start the server
const port = process.env.BOT_PORT || 3978;
server.listen(port, () => {
    logger.info(`Teams Snowflake Bot listening on port ${port}`);
    logger.info('Get Bot Framework Emulator: https://github.com/microsoft/botframework-emulator');
});

// Graceful shutdown
process.on('SIGINT', async () => {
    logger.info('Shutting down gracefully...');
    await snowflakeService.disconnect();
    process.exit(0);
});