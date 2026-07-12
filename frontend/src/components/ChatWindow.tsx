import { useEffect, useRef, useState } from 'react';
import { ArrowUp, LoaderCircle } from 'lucide-react';
import type { Agent, Message } from '../types';

interface ChatWindowProps {
  messages: Message[];
  agents: Agent[];
  isProcessing: boolean;
  onSendMessage: (text: string) => void;
}

export default function ChatWindow({
  messages,
  agents,
  isProcessing,
  onSendMessage,
}: ChatWindowProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: 'smooth',
    });
  }, [messages, isProcessing]);

  const handleSubmit = () => {
    const text = input.trim();

    if (!text || isProcessing) {
      return;
    }

    onSendMessage(text);
    setInput('');
  };

  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLTextAreaElement>
  ) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSubmit();
    }
  };

  const getAgent = (agentId?: string) => {
    return agents.find((agent) => agent.id === agentId);
  };

  return (
    <section className="h-full flex flex-col bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-zinc-800 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 dark:border-zinc-800">
        <h2 className="text-sm font-bold">
          Scheduling Assistant
        </h2>

        <p className="text-[11px] text-gray-400 mt-1">
          Multi-agent scheduling conversation
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
        {messages.map((message) => {
          const agent = getAgent(message.agent);
          const isUser = message.role === 'user';

          return (
            <div
              key={message.id}
              className={`flex ${
                isUser ? 'justify-end' : 'justify-start'
              }`}
            >
              <div
                className={`max-w-[85%] ${
                  isUser
                    ? 'flex flex-col items-end'
                    : 'flex flex-col items-start'
                }`}
              >
                {!isUser && agent && (
                  <div className="flex items-center gap-2 mb-2 px-1">
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{
                        backgroundColor: agent.color,
                      }}
                    />

                    <span className="text-[11px] font-semibold text-gray-600 dark:text-zinc-300">
                      {agent.name}
                    </span>

                    <span className="text-[10px] text-gray-400">
                      {agent.role}
                    </span>
                  </div>
                )}

                <div
                  className={`px-4 py-3 rounded-2xl text-sm leading-6 whitespace-pre-wrap ${
                    isUser
                      ? 'bg-indigo-600 text-white rounded-br-md'
                      : 'bg-gray-50 dark:bg-zinc-800 text-gray-700 dark:text-zinc-200 border border-gray-100 dark:border-zinc-700 rounded-bl-md'
                  }`}
                >
                  {message.text}
                </div>

                <span className="text-[9px] text-gray-400 mt-1.5 px-1">
                  {message.timestamp}
                </span>
              </div>
            </div>
          );
        })}

        {isProcessing && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 px-4 py-3 rounded-2xl rounded-bl-md bg-gray-50 dark:bg-zinc-800 border border-gray-100 dark:border-zinc-700">
              <LoaderCircle className="w-4 h-4 animate-spin text-indigo-500" />

              <span className="text-xs text-gray-500 dark:text-zinc-400">
                Agents are processing your request...
              </span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 border-t border-gray-100 dark:border-zinc-800">
        <div className="flex items-end gap-2 bg-gray-50 dark:bg-zinc-800 rounded-xl border border-gray-200 dark:border-zinc-700 p-2 focus-within:border-indigo-400 transition">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isProcessing}
            rows={1}
            placeholder="Ask to check or reserve a meeting slot..."
            className="flex-1 resize-none bg-transparent outline-none px-2 py-2 text-sm text-gray-700 dark:text-zinc-200 placeholder:text-gray-400 max-h-32"
          />

          <button
            onClick={handleSubmit}
            disabled={!input.trim() || isProcessing}
            className="w-9 h-9 flex items-center justify-center rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-300 dark:disabled:bg-zinc-700 text-white transition cursor-pointer disabled:cursor-not-allowed"
            title="Send message"
          >
            {isProcessing ? (
              <LoaderCircle className="w-4 h-4 animate-spin" />
            ) : (
              <ArrowUp className="w-4 h-4" />
            )}
          </button>
        </div>

        <p className="text-center text-[10px] text-gray-400 mt-2">
          Press Enter to send · Shift + Enter for a new line
        </p>
      </div>
    </section>
  );
}