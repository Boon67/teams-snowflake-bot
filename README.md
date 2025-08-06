# Microsoft Teams + Snowflake Cortex Agents Bot

A sophisticated Microsoft Teams bot that integrates with Snowflake Cortex Agents to provide intelligent data insights through natural language queries with real-time streaming responses.

## 🚀 Features

### Core Capabilities
- **Natural Language Queries**: Ask questions about your data in plain English
- **Snowflake Cortex Agents Integration**: Leverage Snowflake's latest AI capabilities for advanced analytics
- **Microsoft Teams Integration**: Seamless chat interface within Teams
- **Real-time Streaming**: Progressive response updates with live agent reasoning display
- **Adaptive Cards**: Rich, interactive responses with beautifully formatted data
- **Separate SQL & Results Cards**: SQL queries and results displayed in dedicated, easy-to-read cards

### Advanced Features
- **Agent Configuration**: Dynamic tool configuration from Snowflake database
- **Agent Reasoning Display**: See how the AI agent thinks through your questions
- **SQL Query Execution**: Automatic execution of generated SQL queries with formatted results
- **CSV Export**: Automatic CSV generation for large datasets (>10 records)
- **Tabular Data Display**: Dynamic column widths and formatted tables
- **Bot Framework Emulator Support**: Optimized for local development and testing

### Technical Features
- **Error Handling**: Robust error handling and user-friendly error messages
- **Comprehensive Logging**: Structured logging with real-time delta tracking
- **Health Checks**: Built-in health monitoring endpoints
- **Environment Detection**: Automatic adaptation between production and development environments

## 📋 Prerequisites

- Node.js 18.0 or higher
- Microsoft Teams app registration
- Snowflake account with Cortex Analyst access
- Azure Bot Service registration

## 🛠 Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd teams-snowflake-bot
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   Copy the example environment file and fill in your credentials:
   ```bash
   cp .env.example .env
   ```
   
   Update the `.env` file with your actual credentials:
   ```env
   # Microsoft Teams Bot Configuration
   MICROSOFT_APP_ID=your_app_id_here
   MICROSOFT_APP_PASSWORD=your_app_password_here
   BOT_PORT=3978

   # Snowflake Configuration
   SNOWFLAKE_ACCOUNT=your_account.region.snowflakecomputing.com
   SNOWFLAKE_USERNAME=your_username
   SNOWFLAKE_PASSWORD=your_password
   SNOWFLAKE_DATABASE=your_database
   SNOWFLAKE_SCHEMA=your_schema
   SNOWFLAKE_WAREHOUSE=your_warehouse
   SNOWFLAKE_ROLE=your_role

   # Cortex Agents Configuration
   CORTEX_AGENTS_AGENT_NAME=your_agent_name  # Optional: specific agent configuration
   
   # Advanced Features
   INCLUDE_AGENT_THINKING=true     # Show AI reasoning process
   VERBOSE_DELTA_LOGGING=false     # Detailed streaming logs
   SHOW_DELTA_MESSAGES=true        # Display delta progress
   DEBUG_DELTAS=false              # Debug streaming deltas
   DEBUG=false                     # General debug mode

   # Logging
   LOG_LEVEL=info
   ```

## 🔧 Setup Guide

### 1. Microsoft Teams App Registration

1. Go to the [Azure Portal](https://portal.azure.com)
2. Navigate to "Azure Active Directory" > "App registrations"
3. Click "New registration"
4. Fill in the application details:
   - Name: "Snowflake Cortex Analyst Bot"
   - Supported account types: Choose based on your organization's needs
5. Note the "Application (client) ID" - this is your `MICROSOFT_APP_ID`
6. Go to "Certificates & secrets" and create a new client secret
7. Copy the secret value - this is your `MICROSOFT_APP_PASSWORD`

### 2. Azure Bot Service Setup

1. In Azure Portal, search for "Bot Services"
2. Click "Create" > "Azure Bot"
3. Fill in the bot details:
   - Bot handle: Choose a unique name
   - Subscription: Your Azure subscription
   - Resource group: Create new or use existing
   - Data residency: Choose appropriate region
4. For "Type of App", select "Multi Tenant"
5. Use the App ID from step 1
6. Set the messaging endpoint to: `https://your-domain.com/api/messages`
7. Enable the Microsoft Teams channel

### 3. Snowflake Setup

1. **Ensure Cortex Agents Access**: Verify you have access to Snowflake Cortex Agents
2. **Create Bot User**: Create a dedicated user/role for the bot with appropriate permissions
3. **Configure Agent Database**: Set up the `SNOWFLAKE_INTELLIGENCE.AGENTS.CONFIG` table if using specific agent configurations
4. **Grant Permissions**: Ensure the bot user can access your data tables and execute queries
5. **Test Connection**: Verify connectivity using the Snowflake web interface

#### Agent Configuration Table (Optional)
If using `CORTEX_AGENTS_AGENT_NAME`, create the configuration table:
```sql
CREATE TABLE SNOWFLAKE_INTELLIGENCE.AGENTS.CONFIG (
    AGENT_NAME STRING,
    TOOLS VARIANT,
    RESPONSE_INSTRUCTION STRING,
    TOOL_RESOURCES VARIANT
);
```

### 4. Teams App Manifest

1. Update `manifest.json` with your actual App ID and domain
2. Create app icons (color.png 192x192, outline.png 32x32)
3. Package the manifest and icons into a ZIP file
4. Upload to Teams via App Studio or Admin Center

## 🚀 Running the Bot

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
npm start
```

### Using Docker
```bash
# Build and run with Docker Compose
docker-compose up -d

# Or build and run manually
docker build -t teams-snowflake-bot .
docker run -p 3978:3978 --env-file .env teams-snowflake-bot
```

### Local Development & Testing

#### Bot Framework Emulator
1. Download [Bot Framework Emulator](https://github.com/microsoft/BotFramework-Emulator)
2. Open emulator and connect to `http://localhost:3978/api/messages`
3. Use your `MICROSOFT_APP_ID` and `MICROSOFT_APP_PASSWORD`
4. Test bot functionality locally with real-time streaming updates

#### Environment Variables for Development
```env
# Development-specific settings
INCLUDE_AGENT_THINKING=true     # Show AI reasoning
DEBUG_DELTAS=true              # Debug streaming
VERBOSE_DELTA_LOGGING=true     # Detailed logs
```

#### Available Test Commands
- `test bot` - Simple connectivity test
- Any natural language query to test Cortex Agents integration

## 💬 Usage Examples

Once the bot is installed in Teams, you can ask questions like:

### Data Analysis
- "What were our sales last month?"
- "Show me the top performing products this quarter"
- "Which customers have the highest lifetime value?"
- "Give me a summary of our revenue trends"
- "What's the average order value by region?"

### Chart Requests
- "Show me a bar chart of sales by month"
- "Create a line chart showing revenue trends"
- "Give me a visual breakdown of customers by state"

### System Capabilities
- "What questions can I ask?"
- "What kind of data do you have access to?"
- "Help me understand what you can do"

### Interactive Features
The bot provides:
- **Real-time streaming**: Watch as the AI agent thinks through your question
- **Separate cards**: SQL queries and results are displayed in dedicated cards
- **Automatic CSV export**: Large datasets are automatically saved as CSV files
- **Rich formatting**: Tables with proper column widths and data formatting

## 🏗 Architecture

```
Teams User → Teams App → Azure Bot Service → Your Bot API → Snowflake Cortex Agents
                                                   ↓
                                              Real-time Streaming
                                                   ↓
                                            Progressive Adaptive Cards
```

### Components

- **`index.js`**: Main application entry point and server setup
- **`src/bot.js`**: Core bot logic, Teams message handling, and Adaptive Cards
- **`src/services/snowflakeService.js`**: Snowflake and Cortex Agents integration with streaming
- **`src/utils/logger.js`**: Logging utilities
- **`manifest.json`**: Teams app manifest

### Data Flow

1. **User Input**: Natural language query in Teams
2. **Agent Configuration**: Dynamic tool loading from Snowflake (if configured)
3. **Cortex Agents API**: Real-time streaming response with agent reasoning
4. **Progressive Cards**: Live updates showing thinking and analysis
5. **SQL Execution**: Automatic query execution for data requests
6. **Formatted Output**: Separate cards for SQL queries and results with CSV export

### Key Technologies

- **Bot Framework SDK**: Microsoft Teams integration
- **Adaptive Cards**: Rich, interactive UI components
- **Server-Sent Events (SSE)**: Real-time streaming from Cortex Agents
- **Snowflake Cortex Agents**: AI-powered data analysis and SQL generation

## 🔒 Security Considerations

- Store sensitive credentials in environment variables
- Use Azure Key Vault for production environments
- Implement proper authentication and authorization
- Sanitize user inputs to prevent SQL injection
- Monitor and log all interactions for audit purposes

## 📊 Monitoring

The bot includes several monitoring features:

- **Health Check Endpoint**: `GET /health`
- **Logging**: Structured logging with Winston
- **Error Tracking**: Comprehensive error handling and reporting

## 🐛 Troubleshooting

### Common Issues

1. **Bot not responding in Teams**
   - Check that the messaging endpoint is accessible
   - Verify App ID and password are correct
   - Ensure the bot is added to the Teams app

2. **Snowflake connection issues**
   - Verify credentials and network connectivity
   - Check Snowflake warehouse is running
   - Ensure user has necessary permissions

3. **Cortex Agents errors**
   - Verify Cortex Agents is enabled in your Snowflake account
   - Check agent configuration table if using specific agents
   - Review query format and permissions

4. **Streaming issues**
   - Cards not updating in Bot Framework Emulator: Expected behavior - emulator uses new cards instead of updates
   - Delta messages not showing: Check `INCLUDE_AGENT_THINKING=true` in environment
   - SQL results not appearing: Verify database switching permissions for automatic query execution

5. **Agent configuration issues**
   - Agent not found: Ensure `CORTEX_AGENTS_AGENT_NAME` matches database entry
   - Tools not loading: Check `SNOWFLAKE_INTELLIGENCE.AGENTS.CONFIG` table structure and permissions

### Logs

Check the logs directory for detailed error information:
- `logs/error.log` - Error-level logs
- `logs/combined.log` - All logs

## 🚀 Deployment

### Azure App Service

1. Create an Azure App Service
2. Configure environment variables in the App Service settings
3. Deploy using GitHub Actions, Azure DevOps, or direct upload

### Azure Container Instances

```bash
az container create \
  --resource-group myResourceGroup \
  --name teams-snowflake-bot \
  --image your-registry/teams-snowflake-bot:latest \
  --ports 3978 \
  --environment-variables MICROSOFT_APP_ID=your_id MICROSOFT_APP_PASSWORD=your_password
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For support and questions:
- Create an issue in this repository
- Check the troubleshooting section above
- Review Snowflake and Microsoft Teams documentation