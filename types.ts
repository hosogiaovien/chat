// Define the NativeShare interface for the WebView bridge
declare global {
  interface Window {
    NativeShare?: {
      postMessage: (message: string) => void;
    };
    // Interface chuẩn cho Kodular/AppInventor
    AppInventor?: {
      setWebViewString: (value: string) => void;
    };
  }
}

export enum MessageType {
  TEXT = 'text',
  IMAGE = 'image',
  FILE = 'file',
  CALL_LOG = 'call_log', // Added for Missed Call logs
}

export interface ReactionMap {
  [userId: string]: string; // userId: emoji (e.g., '❤️')
}

export interface ReplyInfo {
  id: string;
  text: string;
  senderName: string;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderEmail: string;
  senderName?: string;
  text?: string;
  imageUrl?: string;
  fileUrl?: string; // For documents
  fileName?: string; // Display name of file
  type: MessageType;
  timestamp: number;
  
  // New Features
  isDeleted?: boolean;
  reactions?: ReactionMap;
  replyTo?: ReplyInfo;
}

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName?: string;
  photoURL?: string; 
  isOnline?: boolean; // New: Online status
  lastActive?: number; // New: Last seen timestamp
}

export interface FriendRequest {
  uid: string;
  email: string;
  displayName?: string;
  status: 'pending' | 'accepted' | 'rejected';
  direction: 'sent' | 'received';
}

export interface ChatGroup {
  id: string;
  name: string;
  members: string[]; // List of UIDs
  createdBy: string;
  createdAt: number;
  lastMessage?: string;
  lastUpdated?: number;
}

// Union type for selection
export type ChatSessionTarget = UserProfile | ChatGroup;

export const isGroup = (target: ChatSessionTarget | null | undefined): target is ChatGroup => {
  return !!target && (target as ChatGroup).members !== undefined;
}