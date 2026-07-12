import {
  MessageSquare,
  Plus,
  Trash2,
  Moon,
  Sun,
  ShieldCheck,
} from 'lucide-react';
import type { ChatSession } from '../types';

interface SidebarProps {
  sessions: ChatSession[];
  currentSessionId: string;
  theme: 'light' | 'dark';
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onDeleteSession: (id: string) => void;
  onToggleTheme: () => void;
}

export default function Sidebar({
  sessions,
  currentSessionId,
  theme,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  onToggleTheme,
}: SidebarProps) {
  return (
    <aside className="w-full lg:w-72 flex flex-col h-full bg-gray-50/80 dark:bg-zinc-950/40 border-r border-gray-100 dark:border-zinc-900 flex-shrink-0 transition-all duration-200">
      <div className="p-4 border-b border-gray-100 dark:border-zinc-900/60">
        <button
          onClick={onNewSession}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gray-900 hover:bg-gray-800 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-white font-medium text-xs shadow-sm transition duration-150 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>New Scheduling Session</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4">
        <div className="flex items-center justify-between px-2 mb-3 text-[10px] font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wider">
          <span>Recent Sessions</span>
          <span className="font-mono">{sessions.length}</span>
        </div>

        <div className="space-y-1">
          {sessions.length === 0 ? (
            <div className="px-3 py-6 text-center border border-dashed border-gray-200 dark:border-zinc-800 rounded-xl text-xs text-gray-400 dark:text-zinc-600">
              No scheduling sessions
            </div>
          ) : (
            sessions.map((session) => (
              <div
                key={session.id}
                className={`group flex items-center justify-between p-2.5 rounded-xl transition duration-150 ${
                  session.id === currentSessionId
                    ? 'bg-white dark:bg-zinc-900 shadow-sm text-gray-900 dark:text-white border border-gray-100 dark:border-zinc-800'
                    : 'text-gray-600 dark:text-zinc-400 hover:bg-gray-100/60 dark:hover:bg-zinc-900/40'
                }`}
              >
                <button
                  onClick={() => onSelectSession(session.id)}
                  className="flex-1 text-left truncate text-xs font-medium cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-3.5 h-3.5 opacity-60 flex-shrink-0 text-indigo-500" />
                    <span className="truncate">{session.title}</span>
                  </div>
                </button>

                <button
                  onClick={() => onDeleteSession(session.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-50 dark:hover:bg-red-950/30 text-gray-400 hover:text-red-500 transition duration-150 cursor-pointer"
                  title="Delete session"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="p-4 border-t border-gray-100 dark:border-zinc-900/60 bg-gray-100/30 dark:bg-zinc-950/60">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[10px] text-gray-500 dark:text-zinc-400">
            <ShieldCheck className="w-3.5 h-3.5 text-indigo-500" />
            <span className="font-medium">Session State Secure</span>
          </div>

          <button
            onClick={onToggleTheme}
            className="p-1.5 rounded-lg bg-white dark:bg-zinc-800 hover:bg-gray-100 dark:hover:bg-zinc-700 text-gray-600 dark:text-zinc-300 border border-gray-100 dark:border-zinc-700 transition cursor-pointer"
            title={
              theme === 'light'
                ? 'Switch to Dark Mode'
                : 'Switch to Light Mode'
            }
          >
            {theme === 'light' ? (
              <Moon className="w-3.5 h-3.5" />
            ) : (
              <Sun className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>
    </aside>
  );
}