import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Settings, Loader2, Square } from 'lucide-react';
import ModelSelector from './ModelSelector';
import { Model, ProviderId } from '../types';

interface Props {
  models: Model[];
  modelsLoading: boolean;
  selectedModel: string;
  selectedProvider: ProviderId;
  fireworksCustomModel: string;
  onModelSelect: (id: string) => void;
  onProviderChange: (id: ProviderId) => void;
  onCustomModelChange: (value: string) => void;
  onSend: (content: string) => void;
  onStop: () => void;
  onOpenSettings: () => void;
  disabled: boolean;
  apiKey: string;
}

export default function InputBox({
  models,
  modelsLoading,
  selectedModel,
  selectedProvider,
  fireworksCustomModel,
  onModelSelect,
  onProviderChange,
  onCustomModelChange,
  onSend,
  onStop,
  onOpenSettings,
  disabled,
  apiKey,
}: Props) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px';
    }
  }, [value]);

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [value, disabled, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const canSend = value.trim().length > 0 && !disabled && !!apiKey;

  return (
    <div className="input-area">
      <div className="input-box-wrapper">
        <div className="input-top-row">
          <ModelSelector
            models={models}
            selectedModel={selectedModel}
            selectedProvider={selectedProvider}
            loading={modelsLoading}
            fireworksCustomModel={fireworksCustomModel}
            onSelect={onModelSelect}
            onProviderChange={onProviderChange}
            onCustomModelChange={onCustomModelChange}
          />
        </div>
        <div className="input-row">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              !apiKey
                ? 'Add your API key in Settings to start chatting...'
                : disabled
                  ? 'Agent is working...'
                  : 'Message Anygent Builder... (Enter to send, Shift+Enter for new line)'
            }
            className="chat-textarea"
            rows={1}
            disabled={disabled}
          />
          <div className="input-actions">
            <button
              className="settings-btn"
              onClick={onOpenSettings}
              title="Settings"
            >
              <Settings size={16} />
            </button>
            {disabled ? (
              <button
                className="send-btn stop-btn"
                onClick={onStop}
                title="Stop agent"
              >
                <Loader2 size={15} className="stop-spinner" />
                <Square size={9} className="stop-icon" />
              </button>
            ) : (
              <button
                className={`send-btn ${canSend ? 'send-btn-active' : ''}`}
                onClick={handleSend}
                disabled={!canSend}
                title="Send message"
              >
                <Send size={15} />
              </button>
            )}
          </div>
        </div>
        <p className="input-hint">
          {!apiKey
            ? 'Click the ⚙ Settings button to add your API key'
            : disabled
              ? 'Agent is working... click stop to cancel'
              : 'Enter to send · Shift+Enter for new line'}
        </p>
      </div>
    </div>
  );
}