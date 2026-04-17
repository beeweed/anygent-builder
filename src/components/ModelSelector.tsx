import { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronDown, Search, Cpu } from 'lucide-react';
import { Model } from '../types';

interface Props {
  models: Model[];
  selectedModel: string;
  loading: boolean;
  onSelect: (id: string) => void;
}

export default function ModelSelector({ models, selectedModel, loading, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const filtered = models.filter(
    (m) =>
      m.id.toLowerCase().includes(search.toLowerCase()) ||
      m.name.toLowerCase().includes(search.toLowerCase())
  );

  const selectedName = models.find((m) => m.id === selectedModel)?.name || selectedModel || 'Select model';
  const displayName = selectedName.length > 28 ? selectedName.slice(0, 28) + '...' : selectedName;

  const handleOpen = useCallback(() => {
    setOpen((v) => !v);
    setSearch('');
  }, []);

  useEffect(() => {
    if (open && searchRef.current) {
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div ref={containerRef} className="model-selector-container">
      <button
        onClick={handleOpen}
        className="model-selector-btn"
        title={selectedName}
      >
        <Cpu size={13} className="model-icon" />
        <span className="model-name">{loading ? 'Loading models...' : displayName}</span>
        <ChevronDown size={13} className={`model-chevron ${open ? 'rotated' : ''}`} />
      </button>

      {open && (
        <div className="model-dropdown">
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
                <div key={i} className="model-skeleton" style={{ width: `${60 + Math.random() * 30}%` }} />
              ))
            ) : filtered.length === 0 ? (
              <div className="model-empty">No models found</div>
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
                  <span className="model-option-id">{m.id.split('/')[1] || m.id}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
