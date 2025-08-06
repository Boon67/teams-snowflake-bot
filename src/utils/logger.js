const winston = require('winston');

/**
 * Logger - Centralized logging service for the Teams Snowflake Bot
 * 
 * Provides structured logging with multiple transports and automatic log rotation.
 * Configured for both development (console) and production (file) environments.
 * 
 * Features:
 * - JSON formatted logs for structured data
 * - Separate error and combined log files
 * - Automatic log rotation (5MB max, 5 files retained)
 * - Console output in development with colors
 * - Configurable log levels via environment variables
 * - Automatic logs directory creation
 */
class Logger {
    /**
     * Constructor - Initialize Winston logger with transports and formatting
     * 
     * Sets up file and console transports with appropriate formatting for
     * different environments and log levels.
     */
    constructor() {
        this.logger = winston.createLogger({
            level: process.env.LOG_LEVEL || 'info',  // Configurable log level
            format: winston.format.combine(
                winston.format.timestamp(),          // Add timestamps to all logs
                winston.format.errors({ stack: true }), // Include error stack traces
                winston.format.json()                // JSON format for structured logging
            ),
            defaultMeta: { service: 'teams-snowflake-bot' }, // Service identifier
            transports: [
                // Error-only log file
                new winston.transports.File({ 
                    filename: 'logs/error.log', 
                    level: 'error',
                    maxsize: 5242880, // 5MB max file size
                    maxFiles: 5       // Keep 5 rotated files
                }),
                // Combined log file for all levels
                new winston.transports.File({ 
                    filename: 'logs/combined.log',
                    maxsize: 5242880, // 5MB max file size
                    maxFiles: 5       // Keep 5 rotated files
                })
            ]
        });

        // Add colorized console output for development environment
        if (process.env.NODE_ENV !== 'production') {
            this.logger.add(new winston.transports.Console({
                format: winston.format.combine(
                    winston.format.colorize(),  // Color-coded log levels
                    winston.format.simple()     // Human-readable format
                )
            }));
        }
        
        // Ensure logs directory exists
        this.ensureLogsDirectory();
    }

    /**
     * Ensure the logs directory exists, create if necessary
     * 
     * Creates the logs directory in the current working directory if it doesn't exist.
     * Uses recursive creation to handle nested directory structures.
     */
    ensureLogsDirectory() {
        const fs = require('fs');
        const path = require('path');
        
        const logsDir = path.join(process.cwd(), 'logs');
        if (!fs.existsSync(logsDir)) {
            fs.mkdirSync(logsDir, { recursive: true });
        }
    }

    /**
     * Log informational messages
     * 
     * @param {string} message - The log message
     * @param {Object} meta - Additional metadata to include
     */
    info(message, meta = {}) {
        this.logger.info(message, meta);
    }

    /**
     * Log error messages with stack traces
     * 
     * @param {string} message - The error message
     * @param {Object} meta - Additional metadata (error objects, context)
     */
    error(message, meta = {}) {
        this.logger.error(message, meta);
    }

    /**
     * Log warning messages for non-critical issues
     * 
     * @param {string} message - The warning message
     * @param {Object} meta - Additional metadata to include
     */
    warn(message, meta = {}) {
        this.logger.warn(message, meta);
    }

    /**
     * Log debug information for development troubleshooting
     * 
     * @param {string} message - The debug message
     * @param {Object} meta - Additional metadata for debugging
     */
    debug(message, meta = {}) {
        this.logger.debug(message, meta);
    }

    /**
     * Log verbose information for detailed tracing
     * 
     * @param {string} message - The verbose message
     * @param {Object} meta - Additional metadata for detailed logging
     */
    verbose(message, meta = {}) {
        this.logger.verbose(message, meta);
    }
}

module.exports = { Logger };