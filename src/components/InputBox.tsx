import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Settings } from 'lucide-react';
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
          {disabled ? 'Waiting for response...' : 'Click Send to submit'}
        </p>
      </div>
    </div>
  );
}