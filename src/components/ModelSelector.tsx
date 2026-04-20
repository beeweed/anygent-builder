import { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronDown, Search, Cpu, Zap } from 'lucide-react';
import { Model, ProviderId } from '../types';
import { PROVIDERS } from '../utils/providers';

interface Props {
  models: Model[];
  selectedModel: string;
  selectedProvider: ProviderId;
  loading: boolean;
  fireworksCustomModel: string;
  onSelect: (id: string) => void;
  onProviderChange: (id: ProviderId) => void;
  onCustomModelChange: (value: string) => void;
}

const PROVIDER_ICONS: Record<ProviderId, React.ReactNode> = {
  fireworks: <Zap size={12} />,
};

export default function ModelSelector({
  models,
  selectedModel,
  selectedProvider,
  loading,
  fireworksCustomModel,
  onSelect,
  onProviderChange,
  onCustomModelChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const customInputRef = useRef<HTMLInputElement>(null);

  const filtered = models.filter(
    (m) =>
      m.id.toLowerCase().includes(search.toLowerCase()) ||
      m.name.toLowerCase().includes(search.toLowerCase())
  );

  const currentProvider = PROVIDERS.find((p) => p.id === selectedProvider) || PROVIDERS[0];

  const selectedName =
    models.find((m) => m.id === selectedModel)?.name || selectedModel || 'Select model';
  const displayName = selectedName.length > 24 ? selectedName.slice(0, 24) + '...' : selectedName;

  const handleOpen = useCallback(() => {
    setOpen((v) => !v);
    setSearch('');
    setShowCustomInput(false);
  }, []);

  useEffect(() => {
    if (open && searchRef.current) {
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    if (showCustomInput && customInputRef.current) {
      setTimeout(() => customInputRef.current?.focus(), 50);
    }
  }, [showCustomInput]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleUseCustomModel = () => {
    if (fireworksCustomModel.trim()) {
      onSelect(fireworksCustomModel.trim());
      setOpen(false);
      setShowCustomInput(false);
    }
  };

  // Only one provider remains, but we keep the pill for clarity that the
  // agent runs exclusively on Fireworks via the Vercel AI SDK.
  const showProviderPills = PROVIDERS.length > 1;

  return (
    <div ref={containerRef} className="model-selector-container">
      <div className="model-selector-row">
        {showProviderPills && (
          <div className="provider-pills">
            {PROVIDERS.map((p) => (
              <button
                key={p.id}
                className={`provider-pill ${p.id === selectedProvider ? 'provider-pill--active' : ''}`}
                onClick={() => onProviderChange(p.id)}
                title={p.description}
              >
                {PROVIDER_ICONS[p.id]}
                <span>{p.name}</span>
              </button>
            ))}
          </div>
        )}

        {/* Model selector button */}
        <button onClick={handleOpen} className="model-selector-btn" title={selectedName}>
          <Cpu size={13} className="model-icon" />
          <span className="model-name">{loading ? 'Loading models...' : displayName}</span>
          <ChevronDown size={13} className={`model-chevron ${open ? 'rotated' : ''}`} />
        </button>
      </div>

      {open && (
        <div className="model-dropdown">
          {/* Provider header */}
          <div className="model-dropdown-provider-header">
            {PROVIDER_ICONS[selectedProvider]}
            <span>{currentProvider.name}</span>
            <span className="model-dropdown-provider-badge">via Vercel AI SDK</span>
          </div>

          {/* Custom model input for Fireworks */}
          {selectedProvider === 'fireworks' && (
            <div className="custom-model-section">
              {!showCustomInput ? (
                <button
                  className="custom-model-toggle"
                  onClick={() => setShowCustomInput(true)}
                >
                  + Use custom model ID
                </button>
              ) : (
                <div className="custom-model-input-wrapper">
                  <input
                    ref={customInputRef}
                    type="text"
                    value={fireworksCustomModel}
                    onChange={(e) => onCustomModelChange(e.target.value)}
                    placeholder="accounts/fireworks/models/your-model"
                    className="custom-model-input"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleUseCustomModel();
                    }}
                  />
                  <button
                    className="custom-model-use-btn"
                    onClick={handleUseCustomModel}
                    disabled={!fireworksCustomModel.trim()}
                  >
                    Use
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="model-search-wrapper">
            <Search size={13} className="model-search-icon" />
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search models..."
              className="model-search-input"
            />
          </div>
          <div className="model-list">
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="model-skeleton"
                  style={{ width: `${60 + Math.random() * 30}%` }}
                />
              ))
            ) : filtered.length === 0 ? (
              <div className="model-empty">
                {models.length === 0
                  ? 'No models loaded. Add your Fireworks API key in Settings.'
                  : 'No models found'}
              </div>
            ) : (
              filtered.map((m) => (
                <button
                  key={m.id}
                  className={`model-option ${m.id === selectedModel ? 'selected' : ''}`}
                  onClick={() => {
                    onSelect(m.id);
                    setOpen(false);
                    setSearch('');
                  }}
                  title={m.id}
                >
                  <span className="model-option-name">{m.name}</span>
                  <span className="model-option-id">{m.id}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}