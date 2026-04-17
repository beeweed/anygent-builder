import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Settings } from 'lucide-react';
import ModelSelector from './ModelSelector';
import { Model } from '../types';

interface Props {
  models: Model[];
  modelsLoading: boolean;
  selectedModel: string;
  onModelSelect: (id: string) => void;
  onSend: (content: string) => void;
  onOpenSettings: () => void;
  disabled: boolean;
  apiKey: string;
}

export default function InputBox({
  models,
  modelsLoading,
  selectedModel,
  onModelSelect,
  onSend,
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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const canSend = value.trim().length > 0 && !disabled && !!apiKey;

  return (
    <div className="input-area">
      <div className="input-box-wrapper">
        <div className="input-top-row">
          <ModelSelector
            models={models}
            selectedModel={selectedModel}
            loading={modelsLoading}
            onSelect={onModelSelect}
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
                : 'Message Anygent Builder...'
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
            <button
              className={`send-btn ${canSend ? 'send-btn-active' : ''}`}
              onClick={handleSend}
              disabled={!canSend}
              title="Send message"
            >
              <Send size={15} />
            </button>
          </div>
        </div>
        <p className="input-hint">
          {disabled ? 'Waiting for response...' : 'Enter to send, Shift+Enter for new line'}
        </p>
      </div>
    </div>
  );
}
