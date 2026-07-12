export type AgentType =
  | 'triage'
  | 'booking'
  | 'memory'
  | 'conversation';

export interface Agent {
  id: AgentType;
  name: string;
  role: string;
  color: string;
  avatar: string;
  description: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  agent?: AgentType;
  timestamp: string;
}

export interface ProposedEvent {
  id: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  status: 'proposed' | 'scheduled' | 'declined';
}

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  createdAt: string;
  proposedEvent?: ProposedEvent;
}