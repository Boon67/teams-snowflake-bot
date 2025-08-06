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
        "enableSqlExplanation":false,                      // Let bot handle SQL display
        "enableCortexLiteAgentIntegrateWithThread":true,
        "sqlGenMode":"STANDARD",                           // Standard SQL generation mode
        "enableAnalystToolResultInTopLevelFields":true,
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