export default function TypingIndicator() {
  return (
    <div className="typing-indicator">
      <span className="typing-dot" />
      <span className="typing-dot" style={{ animationDelay: '0.2s' }} />
      <span className="typing-dot" style={{ animationDelay: '0.4s' }} />
      <span className="thinking-text">thinking</span>
    </div>
  );
}
