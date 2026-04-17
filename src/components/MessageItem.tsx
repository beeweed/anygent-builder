import { Message } from '../types';
import MarkdownRenderer from './MarkdownRenderer';
import TypingIndicator from './TypingIndicator';

interface Props {
  message: Message;
  isStreaming?: boolean;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function MessageItem({ message, isStreaming }: Props) {
  const isUser = message.role === 'user';

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

  return (
    <div className="msg-row msg-row-assistant">
      <div className="assistant-content">
        {isStreaming && message.content === '' ? (
          <TypingIndicator />
        ) : (
          <>
            <MarkdownRenderer content={message.content} />
            {isStreaming && <span className="stream-cursor" />}
          </>
        )}
        <span className="msg-time msg-time-assistant">{formatTime(message.timestamp)}</span>
      </div>
    </div>
  );
}
