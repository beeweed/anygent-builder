import { useState, useEffect } from 'react';
import { X, Key, Eye, EyeOff } from 'lucide-react';

interface Props {
  apiKey: string;
  onSave: (key: string) => void;
  onClose: () => void;
}

export default function SettingsModal({ apiKey, onSave, onClose }: Props) {
  const [value, setValue] = useState(apiKey);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleSave = () => {
    onSave(value.trim());
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Settings</h2>
          <button className="modal-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          <label className="modal-label">
            <Key size={14} />
            OpenRouter API Key
          </label>
          <div className="modal-input-wrapper">
            <input
              type={showKey ? 'text' : 'password'}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="sk-or-..."
              className="modal-input"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave();
              }}
            />
            <button
              type="button"
              className="modal-eye-btn"
              onClick={() => setShowKey((v) => !v)}
              title={showKey ? 'Hide key' : 'Show key'}
            >
              {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
          <p className="modal-hint">
            Your API key is stored locally in your browser and never sent anywhere except OpenRouter.
          </p>
        </div>

        <div className="modal-footer">
          <button className="modal-cancel-btn" onClick={onClose}>Cancel</button>
          <button className="modal-save-btn" onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  );
}
