# Anygent Builder - ReAct Agent Conversion

## Overview
Convert the chatbot into a ReAct-style agent with native tool calling via the LLM API.

## Files to Modify/Create

1. **src/types/index.ts** - Add ToolCall, ToolResult, and extended Message types
2. **src/utils/tools.ts** (NEW) - Define file_write tool schema, validation, and execution
3. **src/utils/api.ts** - Rebuild streamCompletion into an agent loop with tool calling
4. **src/components/Agent.tsx** (NEW) - Tool call block UI with animation (file path display, status)
5. **src/components/MessageItem.tsx** - Integrate Agent.tsx to render tool call blocks inline
6. **src/hooks/useChats.ts** - Support tool-related message updates
7. **src/App.tsx** - Wire the new agent flow, pass fsTree callbacks for file_write
8. **src/index.css** - Add styles for tool call blocks and animations