import { Message } from '../types';
import MarkdownRenderer from './MarkdownRenderer';
import TypingIndicator from './TypingIndicator';
import { ToolChip, extractFilePath } from './Agent';

interface Props {
  message: Message;
  isStreaming?: boolean;
  // Set of tool_call IDs that are currently executing. Chips for these
  // tool calls render with a spinner so the user sees immediate feedback
  // when the agent invokes a slow tool (e.g. file_editor over the network).
  runningToolCallIds?: Set<string>;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function MessageItem({ message, isStreaming, runningToolCallIds }: Props) {
  const isUser = message.role === 'user';

  // Hide tool result messages entirely — the assistant message already shows the chip
  if (message.role === 'tool') {
    return null;
  }

  if (isUser) {
    return (
      <div className="msg-row msg-row-user">
        <div className="user-bubble">
          <p className="user-bubble-text">{message.content}</p>
          <span className="msg-time">{formatTime(message.timestamp)}</span>
        </div>
      </div>
    );
  }

  // Assistant message
  const hasToolCalls = message.tool_calls && message.tool_calls.length > 0;
  const hasContent = message.content && message.content.trim().length > 0;

  return (
    <div className="msg-row msg-row-assistant">
      <div className="assistant-content">
        {/* 1) Show content FIRST (the LLM "think"/response) */}
        {isStreaming && !hasContent ? (
          <TypingIndicator />
        ) : hasContent ? (
          <>
            <MarkdownRenderer content={message.content} />
            {isStreaming && <span className="stream-cursor" />}
          </>
        ) : null}

        {/* 2) Show tool chips AFTER content. While a tool call is still
             executing we flip its chip into the "running" state so the user
             gets an immediate, animated block instead of a frozen UI. */}
        {hasToolCalls && (
          <div className="tool-chips-row tool-chips-row--after">
            {message.tool_calls!.map((tc) => {
              const isRunning = runningToolCallIds?.has(tc.id) ?? false;
              const toolResult = message.tool_results?.[tc.id];
              let status: 'running' | 'success' | 'error';
              if (isRunning) {
                status = 'running';
              } else if (toolResult) {
                status = toolResult.success ? 'success' : 'error';
              } else {
                status = 'success';
              }
              return (
                <ToolChip
                  key={tc.id}
                  filePath={extractFilePath(tc.function.arguments)}
                  toolName={tc.function.name}
                  status={status}
                />
              );
            })}
          </div>
        )}

        <span className="msg-time msg-time-assistant">{formatTime(message.timestamp)}</span>
      </div>
    </div>
  );
}