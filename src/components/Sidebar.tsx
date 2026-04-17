import { useState, useRef, useEffect } from 'react';
import { Plus, Trash2, Pencil, Check, X, MessageSquare } from 'lucide-react';
import { Chat } from '../types';

interface Props {
  chats: Chat[];
  activeChatId: string | null;
  onSelectChat: (id: string) => void;
  onNewChat: () => void;
  onDeleteChat: (id: string) => void;
  onRenameChat: (id: string, title: string) => void;
  onClose: () => void;
}

function ChatItem({
  chat,
  isActive,
  onSelect,
  onDelete,
  onRename,
}: {
  chat: Chat;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onRename: (title: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(chat.title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commitRename = () => {
    const trimmed = value.trim();
    if (trimmed && trimmed !== chat.title) onRename(trimmed);
    else setValue(chat.title);
    setEditing(false);
  };

  return (
    <div className={`chat-item ${isActive ? 'chat-item-active' : ''}`}>
      {editing ? (
        <div className="chat-item-edit">
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') {
                setValue(chat.title);
                setEditing(false);
              }
            }}
            className="chat-rename-input"
          />
          <button className="chat-action-btn" onClick={commitRename} title="Save">
            <Check size={13} />
          </button>
          <button
            className="chat-action-btn"
            onClick={() => {
              setValue(chat.title);
              setEditing(false);
            }}
            title="Cancel"
          >
            <X size={13} />
          </button>
        </div>
      ) : (
        <button className="chat-item-btn" onClick={onSelect}>
          <MessageSquare size={13} className="chat-item-icon" />
          <span className="chat-item-title">{chat.title}</span>
        </button>
      )}

      {!editing && (
        <div className="chat-item-actions">
          <button
            className="chat-action-btn"
            onClick={(e) => {
              e.stopPropagation();
              setEditing(true);
            }}
            title="Rename"
          >
            <Pencil size={12} />
          </button>
          <button
            className="chat-action-btn chat-action-delete"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            title="Delete"
          >
            <Trash2 size={12} />
          </button>
        </div>
      )}
    </div>
  );
}

export default function Sidebar({
  chats,
  activeChatId,
  onSelectChat,
  onNewChat,
  onDeleteChat,
  onRenameChat,
  onClose,
}: Props) {
  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <span className="sidebar-title">Chats</span>
        <button className="sidebar-close-btn" onClick={onClose} title="Close">
          <X size={18} />
        </button>
      </div>

      <div className="sidebar-new-btn-wrapper">
        <button className="new-chat-btn" onClick={onNewChat}>
          <Plus size={15} />
          New Chat
        </button>
      </div>

      <div className="sidebar-list">
        {chats.length === 0 ? (
          <p className="sidebar-empty">No chats yet</p>
        ) : (
          chats.map((chat) => (
            <ChatItem
              key={chat.id}
              chat={chat}
              isActive={chat.id === activeChatId}
              onSelect={() => {
                onSelectChat(chat.id);
                onClose();
              }}
              onDelete={() => onDeleteChat(chat.id)}
              onRename={(title) => onRenameChat(chat.id, title)}
            />
          ))
        )}
      </div>
    </div>
  );
}
