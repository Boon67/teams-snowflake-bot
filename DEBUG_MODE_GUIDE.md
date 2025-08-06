# 🔍 Debug Mode Guide

This guide explains how to use the debug features for real-time delta monitoring and troubleshooting.

## 🚀 Quick Start

### Enable Debug Mode
```bash
# Method 1: Environment variables
DEBUG_DELTAS=true npm run dev

# Method 2: Update your .env file
DEBUG_DELTAS=true
DEBUG=true
```

### Test Debug Features
```bash
# Run dedicated debug test
npm run test-debug-deltas

# Test with Bot Framework Emulator
# Send any query and watch terminal for detailed delta output
```

## 🔧 Debug Environment Variables

### `DEBUG_DELTAS=true`
**Real-time Delta Printing**
- ⚡ **REAL-TIME**: Prints each delta chunk immediately as it arrives from Snowflake Cortex Agents
- Uses `process.stdout.write()` for immediate, unbuffered output
- Shows detailed content breakdown (text, tool use, results, thinking)
- Includes precise timestamps (HH:MM:SS.mmm format)
- Perfect for debugging SSE stream issues and timing problems
- **Fixed**: Deltas now appear sequentially as they arrive, not all at once at the end

### `DEBUG=true`
**General Debug Mode**
- Enables all debug features including delta printing
- Alternative to `DEBUG_DELTAS` for comprehensive debugging

### `SHOW_DELTA_MESSAGES=true`
**Delta Summary Messages**
- Shows concise delta processing summaries
- Less verbose than `DEBUG_DELTAS`
- Good for general monitoring

### `VERBOSE_DELTA_LOGGING=true`
**Detailed Delta Logging**
- Shows raw delta structures and processing details
- Most verbose option
- Use for deep debugging of specific issues

## 📊 Debug Output Example

When `DEBUG_DELTAS=true` is enabled, you'll see real-time output like:

```
🔍 [22:15:43.123] DELTA #1 ═══════════════════════════════════
  📦 Content[0] Type: thinking
    🤔 Thinking (45 chars): "I need to analyze the insurance policies..."
  🔗 Metadata: ID=msg_001, Object=message.delta
═══════════════════════════════════════════════════════════════════════

🔍 [22:15:43.245] DELTA #2 ═══════════════════════════════════
  📦 Content[0] Type: tool_use
    🔧 Tool: policy_analyst.yaml
    📋 Input: {
      "query": "Show me count of policies by product type"
    }
  🔗 Metadata: ID=msg_001, Object=message.delta
═══════════════════════════════════════════════════════════════════════

🔍 [22:15:44.567] DELTA #15 ═══════════════════════════════════
  📦 Content[0] Type: text
    📝 Text (28 chars): "Based on the analysis, I..."
    🔍 Full text: "Based on the analysis, I can see that your insurance policies..."
  🔗 Metadata: ID=msg_001, Object=message.delta
═══════════════════════════════════════════════════════════════════════
```

## 🎯 Use Cases

### 1. Debugging "Send Failed" in Bot Framework Emulator
```bash
DEBUG_DELTAS=true npm run dev
```
- Monitor delta sizes and timing
- Identify where large responses occur
- Debug chunking logic

### 2. Monitoring Real-time SSE Performance
```bash
DEBUG_DELTAS=true SHOW_DELTA_MESSAGES=true npm run dev
```
- Track delta arrival timing
- Monitor stream processing efficiency
- Identify bottlenecks

### 3. Troubleshooting Agent Thinking Issues
```bash
DEBUG_DELTAS=true INCLUDE_AGENT_THINKING=true npm run dev
```
- See raw thinking content as it streams
- Debug thinking consolidation logic
- Monitor thinking message separation

### 4. Testing New Content Types
```bash
VERBOSE_DELTA_LOGGING=true DEBUG_DELTAS=true npm run dev
```
- Capture unknown content types
- Debug new Cortex Agents features
- Analyze raw delta structures

## 🛠️ Debug Features in Detail

### Delta Content Types Monitored

#### 📝 **Text Content**
- Character count
- Preview (first 100 chars)
- Full text for longer content
- Real-time text streaming

#### 🔧 **Tool Use**
- Tool name identification
- Input parameters
- Tool execution tracking

#### 📊 **Tool Results**
- Result count
- Content previews
- Data structure analysis

#### 📈 **Chart Data**
- Chart type detection
- Data payload analysis
- Visualization debugging

#### 🤔 **Thinking Content**
- Raw thinking structure
- Text extraction logic
- Consolidation tracking

#### ❓ **Unknown Types**
- New content type detection
- Raw content logging
- Future-proofing

### Performance Monitoring

#### ⏱️ **Timing Information**
- Delta arrival timestamps (HH:MM:SS.mmm)
- Processing time between deltas
- Stream completion timing

#### 📏 **Size Tracking**
- Individual delta sizes
- Cumulative content length
- Memory usage patterns

#### 🔄 **Stream Health**
- Delta sequence verification
- Missing delta detection
- Stream integrity checks

## 🧪 Testing Workflows

### Local Development Testing
1. Enable debug mode: `DEBUG_DELTAS=true`
2. Start bot: `npm run dev`
3. Use Bot Framework Emulator
4. Send test queries
5. Monitor terminal for detailed delta output

### Production Debugging
1. Temporarily enable: `DEBUG_DELTAS=true`
2. Monitor specific user sessions
3. Capture problematic delta sequences
4. Disable after debugging

### Performance Testing
1. Enable: `SHOW_DELTA_MESSAGES=true`
2. Run load tests
3. Monitor delta processing efficiency
4. Identify performance bottlenecks

## 🚨 Important Notes

### Performance Impact
- **Debug modes add overhead** - use sparingly in production
- **Large outputs** - debug logs can be verbose
- **Memory usage** - detailed logging increases memory consumption

### Security Considerations
- **Sensitive data** - debug logs may contain user queries and results
- **Log rotation** - ensure debug logs are properly rotated
- **Access control** - limit access to debug output

### Best Practices
1. **Enable only when needed** - debug modes for specific troubleshooting
2. **Monitor output size** - debug logs can grow quickly
3. **Use appropriate level** - start with `SHOW_DELTA_MESSAGES`, escalate to `DEBUG_DELTAS`
4. **Clean up after debugging** - disable debug modes after use

## 🔗 Related Commands

```bash
# Basic testing
npm run test-debug-deltas

# Live debugging with emulator
DEBUG_DELTAS=true npm run dev

# Full verbose debugging
VERBOSE_DELTA_LOGGING=true DEBUG_DELTAS=true SHOW_DELTA_MESSAGES=true npm run dev

# Production monitoring
SHOW_DELTA_MESSAGES=true npm run dev
```

## 📝 Troubleshooting

### Common Issues

#### No Debug Output Showing
1. Verify environment variables are set
2. Check if queries are actually generating deltas
3. Ensure bot is processing requests

#### Too Much Output
1. Use `SHOW_DELTA_MESSAGES=true` instead of `DEBUG_DELTAS=true`
2. Filter specific content types
3. Use log redirection: `npm run dev 2>debug.log`

#### Performance Issues
1. Disable debug modes in production
2. Use selective debugging for specific sessions
3. Monitor memory usage during debug sessions

---

💡 **Pro Tip**: Combine debug modes with Bot Framework Emulator's network tab to get complete request/response debugging visibility!