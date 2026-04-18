import { Message } from '../types';
import MarkdownRenderer from './MarkdownRenderer';
import TypingIndicator from './TypingIndicator';
import { ToolCallBlock, ToolResultDisplay } from './Agent';

interface Props {
  message: Message;
  isStreaming?: boolean;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function extractFilePath(args: string): string | undefined {
  try {
    const parsed = JSON.parse(args);
    return parsed.file_path;
  } catch {
    return undefined;
  }
}

export default function MessageItem({ message, isStreaming }: Props) {
  const isUser = message.role === 'user';

  // Tool result messages
  if (message.role === 'tool' && message.tool_result) {
    return (
      <div className="msg-row msg-row-assistant">
        <div className="assistant-content">
          <ToolResultDisplay toolResult={message.tool_result} />
        </div>
      </div>
    );
  }

  // Skip raw tool messages without tool_result (they're internal)
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

  // Assistant message - may contain tool_calls and/or content
  const hasToolCalls = message.tool_calls && message.tool_calls.length > 0;
  const hasContent = message.content && message.content.trim().length > 0;

  return (
    <div className="msg-row msg-row-assistant">
      <div className="assistant-content">
        {/* Show tool call blocks if present */}
        {hasToolCalls && (
          <div className="agent-tool-calls-group">
            {message.tool_calls!.map((tc) => (
              <ToolCallBlock
                key={tc.id}
                toolName={tc.function.name}
                filePath={extractFilePath(tc.function.arguments)}
                status="success"
                result={`Tool call: ${tc.function.name}`}
              />
            ))}
          </div>
        )}

        {/* Show content */}
        {isStreaming && !hasContent ? (
          <TypingIndicator />
        ) : hasContent ? (
          <>
            <MarkdownRenderer content={message.content} />
            {isStreaming && <span className="stream-cursor" />}
          </>
        ) : null}

        <span className="msg-time msg-time-assistant">{formatTime(message.timestamp)}</span>
      </div>
    </div>
  );
}