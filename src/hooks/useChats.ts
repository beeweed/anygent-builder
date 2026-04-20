import { useState, useCallback, useRef } from 'react';
import { Chat, Message, ProviderId } from '../types';
import { loadChats, saveChats, generateId } from '../utils/storage';

export function useChats() {
  const [chats, setChats] = useState<Chat[]>(() => loadChats());
  const [activeChatId, setActiveChatId] = useState<string | null>(() => {
    const stored = loadChats();
    return stored.length > 0 ? stored[0].id : null;
  });

  const createChat = useCallback((model: string, provider: ProviderId = 'fireworks'): string => {
    const id = generateId();
    const newChat: Chat = {
      id,
      title: 'New Chat',
      messages: [],
      model,
      provider,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      sandboxId: null,
    };
    setChats((prev) => {
      const updated = [newChat, ...prev];
      saveChats(updated);
      return updated;
    });
    setActiveChatId(id);
    return id;
  }, []);

  const deleteChat = useCallback((id: string) => {
    setChats((prev) => {
      const updated = prev.filter((c) => c.id !== id);
      saveChats(updated);
      return updated;
    });
    setActiveChatId((prev) => {
      if (prev !== id) return prev;
      const remaining = loadChats().filter((c) => c.id !== id);
      return remaining.length > 0 ? remaining[0].id : null;
    });
  }, []);

  const renameChat = useCallback((id: string, title: string) => {
    setChats((prev) => {
      const updated = prev.map((c) => (c.id === id ? { ...c, title } : c));
      saveChats(updated);
      return updated;
    });
  }, []);

  const addMessage = useCallback((chatId: string, message: Message) => {
    setChats((prev) => {
      const updated = prev.map((c) => {
        if (c.id !== chatId) return c;
        const messages = [...c.messages, message];
        const title =
          c.title === 'New Chat' && message.role === 'user'
            ? message.content.slice(0, 40).trim() || 'New Chat'
            : c.title;
        return { ...c, messages, title, updatedAt: Date.now() };
      });
      saveChats(updated);
      return updated;
    });
  }, []);

  const addMessages = useCallback((chatId: string, newMessages: Message[]) => {
    setChats((prev) => {
      const updated = prev.map((c) => {
        if (c.id !== chatId) return c;
        const messages = [...c.messages, ...newMessages];
        return { ...c, messages, updatedAt: Date.now() };
      });
      saveChats(updated);
      return updated;
    });
  }, []);

  // Throttle localStorage writes during streaming — do NOT save on every token,
  // that would block the UI thread. Save at most every 400ms during streaming.
  // The final value is always persisted via finalizeAssistantMessage.
  const lastSaveRef = useRef(0);
  const updateLastAssistantMessage = useCallback((chatId: string, content: string) => {
    setChats((prev) => {
      const updated = prev.map((c) => {
        if (c.id !== chatId) return c;
        const messages = [...c.messages];
        const lastIdx = messages.length - 1;
        if (lastIdx >= 0 && messages[lastIdx].role === 'assistant') {
          messages[lastIdx] = { ...messages[lastIdx], content };
        }
        return { ...c, messages, updatedAt: Date.now() };
      });
      const now = Date.now();
      if (now - lastSaveRef.current > 400) {
        lastSaveRef.current = now;
        saveChats(updated);
      }
      return updated;
    });
  }, []);

  const finalizeAssistantMessage = useCallback(
    (chatId: string, content: string, toolCalls?: Message['tool_calls']) => {
      setChats((prev) => {
        const updated = prev.map((c) => {
          if (c.id !== chatId) return c;
          const messages = [...c.messages];
          const lastIdx = messages.length - 1;
          if (lastIdx >= 0 && messages[lastIdx].role === 'assistant') {
            messages[lastIdx] = {
              ...messages[lastIdx],
              content,
              ...(toolCalls && toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
            };
          }
          return { ...c, messages, updatedAt: Date.now() };
        });
        saveChats(updated);
        return updated;
      });
    },
    []
  );

  const getMessages = useCallback(
    (chatId: string): Message[] => {
      const chat = chats.find((c) => c.id === chatId);
      return chat?.messages ?? [];
    },
    [chats]
  );

  const updateChatModel = useCallback((chatId: string, model: string) => {
    setChats((prev) => {
      const updated = prev.map((c) => (c.id === chatId ? { ...c, model } : c));
      saveChats(updated);
      return updated;
    });
  }, []);

  const updateChatProvider = useCallback((chatId: string, provider: ProviderId) => {
    setChats((prev) => {
      const updated = prev.map((c) => (c.id === chatId ? { ...c, provider } : c));
      saveChats(updated);
      return updated;
    });
  }, []);

  const updateChatSandboxId = useCallback((chatId: string, sandboxId: string | null) => {
    setChats((prev) => {
      const updated = prev.map((c) => (c.id === chatId ? { ...c, sandboxId } : c));
      saveChats(updated);
      return updated;
    });
  }, []);

  const activeChat = chats.find((c) => c.id === activeChatId) ?? null;

  return {
    chats,
    activeChat,
    activeChatId,
    setActiveChatId,
    createChat,
    deleteChat,
    renameChat,
    addMessage,
    addMessages,
    updateLastAssistantMessage,
    finalizeAssistantMessage,
    getMessages,
    updateChatModel,
    updateChatProvider,
    updateChatSandboxId,
  };
}