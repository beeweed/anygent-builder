import { useEffect, useRef } from 'react';
import { Bot } from 'lucide-react';
import { Chat } from '../types';
import MessageItem from './MessageItem';

interface Props {
  chat: Chat | null;
  streamingMessageId: string | null;
}

export default function ChatArea({ chat, streamingMessageId }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat?.messages.length, streamingMessageId]);

  useEffect(() => {
    if (streamingMessageId) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  });

  if (!chat || chat.messages.length === 0) {
    return (
      <div className="chat-empty">
        <div className="chat-empty-icon">
          <Bot size={32} />
        </div>
        <h2 className="chat-empty-title">Anygent Builder</h2>
        <p className="chat-empty-sub">Start a conversation with any AI model</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="chat-messages">
      {chat.messages.map((msg) => (
        <MessageItem
          key={msg.id}
          message={msg}
          isStreaming={msg.id === streamingMessageId}
        />
      ))}
      <div ref={bottomRef} className="scroll-anchor" />
    </div>
  );
}
