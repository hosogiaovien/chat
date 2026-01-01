import React, { useState, useEffect, useRef } from 'react';
import { 
    subscribeToMessages, sendMessage, recallMessage, reactToMessage,
    getAllUsers, searchUsers, sendFriendRequest, subscribeToFriendRequests, 
    acceptFriendRequest, subscribeToFriends, updateUserProfileDB,
    getChatId, firebaseAuth, createGroupChat, subscribeToUserGroups,
    startCall, subscribeToCall, setupPresence, endCallSignal, clearChatMessages
} from '../services/firebaseService';
import { signOut } from 'firebase/auth';
import { uploadImageToGAS } from '../services/gasService';
import { shareContent, sendNativeSignal } from '../services/bridgeService'; // Added sendNativeSignal
import { ChatMessage, MessageType, UserProfile, ChatGroup, ChatSessionTarget, isGroup, ReplyInfo } from '../types';
import { 
    PaperAirplaneIcon, PhotoIcon, ArrowPathIcon, ShareIcon, 
    ArrowRightOnRectangleIcon, UsersIcon, UserPlusIcon, 
    ChatBubbleLeftRightIcon, FaceSmileIcon, MagnifyingGlassIcon,
    CheckIcon, PencilIcon, UserGroupIcon, XMarkIcon, 
    DocumentIcon, TrashIcon, ArrowUturnLeftIcon, HeartIcon, HandThumbUpIcon,
    EyeIcon, ArrowDownTrayIcon, MagnifyingGlassPlusIcon, MagnifyingGlassMinusIcon,
    VideoCameraIcon, PhoneIcon, PhoneArrowUpRightIcon, PhoneXMarkIcon, PhoneArrowDownLeftIcon
} from '@heroicons/react/24/solid';
import ActiveCall from './ActiveCall'; 

interface ChatProps {
  user: UserProfile;
}

const EMOJIS = ["😀", "😁", "😂", "🥰", "👍", "❤️", "😡", "😭"];
const REACTIONS_LIST = [
    { emoji: "👍", label: "Like" },
    { emoji: "❤️", label: "Tim" },
    { emoji: "😆", label: "Haha" },
    { emoji: "😭", label: "Sad" },
    { emoji: "😡", label: "Angry" },
];

interface PendingFile {
    id: string;
    file: File;
    previewUrl: string;
    type: MessageType.IMAGE | MessageType.FILE;
}

interface MediaPreviewState {
    type: MessageType.IMAGE | MessageType.FILE;
    url: string; 
    downloadUrl?: string; 
    name: string;
}

const getGoogleDriveId = (url: string | undefined) => {
    if (!url) return null;
    const match = url.match(/id=([a-zA-Z0-9_-]+)/) || url.match(/\/d\/([a-zA-Z0-9_-]+)/);
    return match ? match[1] : null;
};

// Generic ringtone URL
const RINGTONE_URL = "https://actions.google.com/sounds/v1/alarms/digital_watch_alarm_long.ogg";

const formatLastActive = (timestamp?: number) => {
    if (!timestamp) return 'Offline';
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'Vừa truy cập';
    if (minutes < 60) return `${minutes} phút trước`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} giờ trước`;
    return 'Hơn 1 ngày trước';
};

const formatDateTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
};

const formatDuration = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

const Chat: React.FC<ChatProps> = ({ user }) => {
  // Navigation & Data
  const [activeTab, setActiveTab] = useState<'chats' | 'contacts'>('contacts');
  const [selectedTarget, setSelectedTarget] = useState<ChatSessionTarget | null>(null);
  const [friends, setFriends] = useState<UserProfile[]>([]);
  const [groups, setGroups] = useState<ChatGroup[]>([]);
  const [friendRequests, setFriendRequests] = useState<any[]>([]);
  const [suggestedUsers, setSuggestedUsers] = useState<UserProfile[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  
  // UI Inputs
  const [inputText, setInputText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
  const [searchStatus, setSearchStatus] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  
  // Popups & Modes
  const [showEmoji, setShowEmoji] = useState(false);
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [showProfileModal, setShowProfileModal] = useState(!user.displayName);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [activeMessageActionId, setActiveMessageActionId] = useState<string | null>(null);
  
  // Custom Delete Modal State
  const [deleteConfirmation, setDeleteConfirmation] = useState<{show: boolean, target: ChatSessionTarget | null}>({ show: false, target: null });

  // --- PREVIEW MODAL STATE ---
  const [previewMedia, setPreviewMedia] = useState<MediaPreviewState | null>(null);
  const [zoomScale, setZoomScale] = useState(1);
  const imageRef = useRef<HTMLImageElement>(null);

  // --- CALLING STATE ---
  const [isInCall, setIsInCall] = useState(false);
  const [activeCallChatId, setActiveCallChatId] = useState<string | null>(null); // New: Track which chat is in call
  const [incomingCall, setIncomingCall] = useState<{ callerId: string, type: 'audio'|'video' } | null>(null);
  const [isCaller, setIsCaller] = useState(false); 
  const [isVideoCall, setIsVideoCall] = useState(true);
  
  // Track if we are in the process of starting a call
  const isStartingCall = useRef(false);
  
  const ringtoneRef = useRef<HTMLAudioElement | null>(null);
  const touchStartDist = useRef<number>(0);
  const initialZoom = useRef<number>(1);

  // Form Data
  const [localDisplayName, setLocalDisplayName] = useState(user.displayName);
  const [newDisplayName, setNewDisplayName] = useState(user.displayName || '');
  const [groupName, setGroupName] = useState('');
  const [selectedFriendsForGroup, setSelectedFriendsForGroup] = useState<string[]>([]);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const lastMessageCount = useRef<number>(0);

  // --- INITIALIZATION ---
  useEffect(() => {
    setupPresence(user.uid);
    const unsubFriends = subscribeToFriends(user.uid, (data) => setFriends(data));
    const unsubGroups = subscribeToUserGroups(user.uid, (data) => setGroups(data));
    const unsubRequests = subscribeToFriendRequests(user.uid, (data) => setFriendRequests(data));
    return () => { unsubFriends(); unsubGroups(); unsubRequests(); };
  }, [user.uid]);

  useEffect(() => {
    const fetchSuggestions = async () => {
        const allUsers = await getAllUsers();
        const friendIds = new Set(friends.map(f => f.uid));
        const others = allUsers.filter(u => u.uid !== user.uid && !friendIds.has(u.uid));
        setSuggestedUsers(others.sort(() => 0.5 - Math.random()).slice(0, 6));
    };
    fetchSuggestions();
  }, [user.uid, friends]);

  useEffect(() => { if (user.displayName) setLocalDisplayName(user.displayName); }, [user.displayName]);

  // --- RINGTONE & NATIVE SIGNAL MANAGEMENT ---
  useEffect(() => {
      if (incomingCall && !isInCall) {
          // Trigger Native Ringtone
          sendNativeSignal('RING_START');
          
          if (!ringtoneRef.current) {
              ringtoneRef.current = new Audio(RINGTONE_URL);
              ringtoneRef.current.loop = true;
          }
          ringtoneRef.current.play().catch(e => {
              console.warn("Ringtone blocked.", e);
          });
      } else {
          // Stop Native Ringtone
          sendNativeSignal('RING_STOP');

          if (ringtoneRef.current) {
              ringtoneRef.current.pause();
              ringtoneRef.current.currentTime = 0;
          }
      }
      return () => { if (ringtoneRef.current) ringtoneRef.current.pause(); };
  }, [incomingCall, isInCall]);

  // --- GLOBAL CALL LISTENER ---
  useEffect(() => {
      const unsubscribes: (() => void)[] = [];

      // Listen to calls from all friends
      friends.forEach(friend => {
          const chatId = getChatId(user.uid, friend.uid);
          const unsub = subscribeToCall(chatId, (data) => {
              if (data && data.status === 'calling') {
                  if (data.callerId !== user.uid) {
                      // Incoming call
                      setIncomingCall({ callerId: data.callerId, type: data.type });
                  } else {
                      isStartingCall.current = false;
                  }
              } else if (!data) {
                  // Call ended
                  setIncomingCall(prev => {
                      if (prev && getChatId(user.uid, prev.callerId) === chatId) return null;
                      return prev;
                  });
              }
          });
          unsubscribes.push(unsub);
      });

      return () => {
          unsubscribes.forEach(u => u());
      };
  }, [friends, user.uid]); 

  // --- MESSAGE LISTENER ---
  useEffect(() => {
    if (selectedTarget) {
        let chatId = isGroup(selectedTarget) ? selectedTarget.id : getChatId(user.uid, selectedTarget.uid);
        const unsubMsg = subscribeToMessages(chatId, (msgs) => {
            setMessages(msgs);
            
            // Check for new message to trigger VIBRATE
            // Conditions: List grew bigger, Last message is not from me, timestamp is very recent (avoid vibrating on load history)
            if (msgs.length > lastMessageCount.current && msgs.length > 0) {
                const lastMsg = msgs[msgs.length - 1];
                const isRecent = (Date.now() - lastMsg.timestamp) < 5000; // 5 seconds
                if (lastMsg.senderId !== user.uid && isRecent) {
                    sendNativeSignal('VIBRATE_MSG');
                }
            }
            lastMessageCount.current = msgs.length;
        });
        return () => {
            unsubMsg();
            lastMessageCount.current = 0;
        };
    } else {
        setMessages([]);
        lastMessageCount.current = 0;
    }
  }, [selectedTarget, user.uid]); 

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // --- ACTIONS ---

  const handleUpdateProfile = async () => {
      if (!newDisplayName.trim()) return;
      await updateUserProfileDB(user.uid, { displayName: newDisplayName });
      setLocalDisplayName(newDisplayName); setShowProfileModal(false);
  };

  const handleCreateGroup = async () => {
      if (!groupName.trim() || selectedFriendsForGroup.length === 0) return alert("Cần tên nhóm và thành viên");
      try {
          await createGroupChat(groupName, [...selectedFriendsForGroup, user.uid], user.uid);
          setShowGroupModal(false); setGroupName(''); setSelectedFriendsForGroup([]); alert("Tạo nhóm thành công!");
      } catch (e) { alert("Tạo nhóm thất bại"); }
  };

  const initiateCall = async (video: boolean) => {
      if (!selectedTarget) return;
      if (isGroup(selectedTarget)) {
          alert("Tính năng gọi nhóm đang được phát triển.");
          return;
      }
      
      const chatId = getChatId(user.uid, selectedTarget.uid);
      isStartingCall.current = true; 
      setIsCaller(true);
      setIsVideoCall(video);
      setActiveCallChatId(chatId); 
      setIsInCall(true); 
      
      try {
          await startCall(chatId, user.uid, video);
      } catch (e) {
          console.error("Call failed to start", e);
          setIsInCall(false);
          setActiveCallChatId(null);
          isStartingCall.current = false;
          alert("Không thể kết nối cuộc gọi.");
      }
  };

  const acceptCall = () => {
      if (!incomingCall) return;
      
      // Stop ringing signal
      sendNativeSignal('RING_STOP');

      const callerProfile = friends.find(f => f.uid === incomingCall.callerId);
      if (callerProfile) setSelectedTarget(callerProfile);

      setIncomingCall(null);
      setIsCaller(false);
      setIsVideoCall(incomingCall.type === 'video');
      setActiveCallChatId(getChatId(user.uid, incomingCall.callerId)); 
      setIsInCall(true);
  };

  const handleRejectCall = async () => {
      sendNativeSignal('RING_STOP');
      if (!incomingCall) return;
      const chatId = getChatId(user.uid, incomingCall.callerId);
      await endCallSignal(chatId);
      
      const msgData: Omit<ChatMessage, 'id'> = {
          senderId: user.uid,
          senderEmail: user.email || 'Anon',
          senderName: localDisplayName || 'User',
          type: MessageType.CALL_LOG,
          text: 'Cuộc gọi bị từ chối',
          timestamp: Date.now(),
      };
      await sendMessage(chatId, msgData);
      setIncomingCall(null);
  };

  const handleLogMissedCall = async () => {
      if (!activeCallChatId) return; 
      const msgData: Omit<ChatMessage, 'id'> = {
          senderId: user.uid,
          senderEmail: user.email || 'Anon',
          senderName: localDisplayName || 'User',
          type: MessageType.CALL_LOG,
          text: 'Cuộc gọi nhỡ',
          timestamp: Date.now(),
      };
      await sendMessage(activeCallChatId, msgData);
  };

  const handleLogSuccessfulCall = async (durationMs: number) => {
      if (!activeCallChatId) return; 
      const durationStr = formatDuration(durationMs);
      const msgData: Omit<ChatMessage, 'id'> = {
          senderId: user.uid,
          senderEmail: user.email || 'Anon',
          senderName: localDisplayName || 'User',
          type: MessageType.CALL_LOG,
          text: `${isVideoCall ? 'Video Call' : 'Cuộc gọi thoại'} - ${durationStr}`,
          timestamp: Date.now(),
      };
      await sendMessage(activeCallChatId, msgData);
  };

  const endCall = () => {
     setIsInCall(false);
     setActiveCallChatId(null);
     setIncomingCall(null);
     isStartingCall.current = false;
  };

  // Triggered by Sidebar trash icon
  const confirmDeleteChat = (e: React.MouseEvent, target: ChatSessionTarget) => {
      e.stopPropagation(); 
      setDeleteConfirmation({ show: true, target: target });
  };

  // Executed after Modal confirmation
  const performDeleteChat = async () => {
      const target = deleteConfirmation.target;
      if (!target) return;

      let chatId = isGroup(target) ? target.id : getChatId(user.uid, target.uid);
      await clearChatMessages(chatId);
      
      // Close modal
      setDeleteConfirmation({ show: false, target: null });
      
      // Optional: If we were looking at this chat, clear messages in view
      if (selectedTarget && 
         ((isGroup(selectedTarget) && isGroup(target) && selectedTarget.id === target.id) ||
          (!isGroup(selectedTarget) && !isGroup(target) && selectedTarget.uid === target.uid))) {
          setMessages([]);
      }
  };

  const scrollToMessage = (msgId: string) => {
      const el = document.getElementById(`msg-${msgId}`);
      if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.classList.add('bg-blue-100', 'transition-colors', 'duration-500');
          setTimeout(() => {
              el.classList.remove('bg-blue-100');
          }, 1500);
      }
  };

  const addToPending = (files: FileList | null, type: MessageType.IMAGE | MessageType.FILE) => {
      if (!files || files.length === 0) return;
      const newPendings: PendingFile[] = [];
      Array.from(files).forEach(file => {
          newPendings.push({
              id: Math.random().toString(36).substr(2, 9),
              file: file,
              previewUrl: URL.createObjectURL(file),
              type: type
          });
      });
      setPendingFiles(prev => [...prev, ...newPendings]);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (imageInputRef.current) imageInputRef.current.value = '';
  };

  const removePending = (id: string) => { setPendingFiles(prev => prev.filter(p => p.id !== id)); };

  const handlePaste = (e: React.ClipboardEvent) => {
      if (e.clipboardData.files.length > 0) {
          e.preventDefault();
          const files = e.clipboardData.files;
          const images = new DataTransfer();
          const docs = new DataTransfer();
          for (let i = 0; i < files.length; i++) {
              if (files[i].type.startsWith('image/')) images.items.add(files[i]);
              else docs.items.add(files[i]);
          }
          if (images.files.length > 0) addToPending(images.files, MessageType.IMAGE);
          if (docs.files.length > 0) addToPending(docs.files, MessageType.FILE);
      }
  };

  const handleSendMessage = async () => {
    if ((!inputText.trim() && pendingFiles.length === 0) || !selectedTarget) return;

    let chatId = isGroup(selectedTarget) ? selectedTarget.id : getChatId(user.uid, selectedTarget.uid);
    
    if (pendingFiles.length > 0) {
        setIsUploading(true);
        try {
            for (const pFile of pendingFiles) {
                const { url, viewLink, filename } = await uploadImageToGAS(pFile.file);
                const msgData: Omit<ChatMessage, 'id'> = {
                    senderId: user.uid,
                    senderEmail: user.email || 'Anon',
                    senderName: localDisplayName || 'User',
                    type: pFile.type,
                    timestamp: Date.now(),
                    text: pFile.type === MessageType.FILE ? filename : undefined,
                    imageUrl: pFile.type === MessageType.IMAGE ? url : undefined,
                    fileUrl: pFile.type === MessageType.FILE ? url : undefined, 
                    fileName: filename,
                    replyTo: replyingTo ? {
                        id: replyingTo.id,
                        text: replyingTo.type === MessageType.TEXT ? (replyingTo.text || '') : `[${replyingTo.type}]`,
                        senderName: replyingTo.senderName || 'Unknown'
                    } : undefined
                };
                await sendMessage(chatId, msgData);
            }
            setPendingFiles([]); 
        } catch (error: any) { alert(`Lỗi khi gửi file: ${error.message}`); } 
        finally { setIsUploading(false); }
    }

    if (inputText.trim()) {
        const msgData: Omit<ChatMessage, 'id'> = {
            senderId: user.uid,
            senderEmail: user.email || 'Anon',
            senderName: localDisplayName || 'User',
            text: inputText,
            type: MessageType.TEXT,
            timestamp: Date.now(),
            replyTo: replyingTo ? {
                id: replyingTo.id,
                text: replyingTo.type === MessageType.TEXT ? (replyingTo.text || '') : `[${replyingTo.type}]`,
                senderName: replyingTo.senderName || 'Unknown'
            } : undefined
        };
        try {
            await sendMessage(chatId, msgData);
            setInputText(''); setReplyingTo(null); setShowEmoji(false);
        } catch (e) { console.error(e); }
    }
  };

  const handleRecall = async (msg: ChatMessage) => {
      if (!selectedTarget) return;
      setActiveMessageActionId(null);
      try {
          let chatId = isGroup(selectedTarget) ? selectedTarget.id : getChatId(user.uid, selectedTarget.uid);
          const fileUrl = msg.imageUrl || msg.fileUrl;
          await recallMessage(chatId, msg.id, fileUrl || undefined);
      } catch(e: any) {
          console.error("Recall Error:", e);
      }
  };

  const handleReaction = async (msgId: string, emoji: string) => {
      if (!selectedTarget) return;
      let chatId = isGroup(selectedTarget) ? selectedTarget.id : getChatId(user.uid, selectedTarget.uid);
      await reactToMessage(chatId, msgId, user.uid, emoji);
      setActiveMessageActionId(null);
  };

  const openPreview = (type: MessageType.IMAGE | MessageType.FILE, url: string, name: string, downloadUrl?: string) => {
      setZoomScale(1);
      setPreviewMedia({ type, url, name, downloadUrl });
  };

  const closePreview = () => {
      setPreviewMedia(null);
      setZoomScale(1);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
      if (e.touches.length === 2) {
          const dist = Math.hypot(
              e.touches[0].clientX - e.touches[1].clientX,
              e.touches[0].clientY - e.touches[1].clientY
          );
          touchStartDist.current = dist;
          initialZoom.current = zoomScale;
      }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
      if (e.touches.length === 2) {
          e.preventDefault(); 
          const dist = Math.hypot(
              e.touches[0].clientX - e.touches[1].clientX,
              e.touches[0].clientY - e.touches[1].clientY
          );
          if (touchStartDist.current > 0) {
              const delta = dist / touchStartDist.current;
              setZoomScale(Math.min(5, Math.max(0.5, initialZoom.current * delta)));
          }
      }
  };

  const handleModalDoubleTap = (e: React.MouseEvent | React.TouchEvent) => {
      e.stopPropagation();
      setZoomScale(prev => prev > 1 ? 1 : 2.5);
  };

  const getAvatar = (name?: string | null, email?: string | null, isGrp: boolean = false, isOnline: boolean = false) => {
      if (isGrp) return <div className="w-12 h-12 rounded-full bg-purple-500 text-white flex items-center justify-center shadow"><UserGroupIcon className="w-6 h-6" /></div>;
      const char = name ? name[0] : (email ? email[0] : '?');
      return (
        <div className="relative">
            <div className="w-12 h-12 rounded-full bg-blue-500 text-white flex items-center justify-center font-bold text-xl shadow">{char?.toUpperCase()}</div>
            {isOnline && (
                <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 border-2 border-white rounded-full"></div>
            )}
        </div>
      );
  };

  return (
    <div className="flex h-[100dvh] bg-gray-100 overflow-hidden relative font-sans">
      
      {/* --- INCOMING CALL DIALOG (GLOBAL) --- */}
      {incomingCall && !isInCall && (
          <div className="fixed top-5 left-1/2 transform -translate-x-1/2 z-[90] bg-white p-4 rounded-xl shadow-2xl border border-blue-200 animate-bounce-short flex items-center gap-4">
              <div className="bg-blue-100 p-3 rounded-full animate-pulse"><PhoneIcon className="w-6 h-6 text-blue-600"/></div>
              <div>
                  <div className="font-bold text-gray-800">Cuộc gọi đến...</div>
                  <div className="text-xs text-gray-500">{incomingCall.type === 'video' ? 'Video Call' : 'Audio Call'}</div>
              </div>
              <div className="flex gap-2">
                  <button onClick={handleRejectCall} className="p-2 bg-red-100 text-red-600 rounded-full hover:bg-red-200"><XMarkIcon className="w-5 h-5"/></button>
                  <button onClick={acceptCall} className="p-2 bg-green-500 text-white rounded-full hover:bg-green-600 shadow-lg"><PhoneIcon className="w-5 h-5"/></button>
              </div>
          </div>
      )}

      {/* --- DELETE CONFIRMATION MODAL --- */}
      {deleteConfirmation.show && (
          <div className="fixed inset-0 z-[110] bg-black/50 flex items-center justify-center p-4 animate-fadeIn">
              <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-sm transform transition-all scale-100">
                  <h3 className="text-lg font-bold text-gray-900 mb-2">Xóa cuộc trò chuyện?</h3>
                  <p className="text-gray-600 mb-6">Bạn có chắc chắn muốn xóa toàn bộ tin nhắn với <b>{isGroup(deleteConfirmation.target) ? deleteConfirmation.target.name : deleteConfirmation.target?.displayName}</b>? Hành động này không thể hoàn tác.</p>
                  <div className="flex justify-end gap-3">
                      <button 
                          onClick={() => setDeleteConfirmation({show: false, target: null})}
                          className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg font-medium transition"
                      >
                          Hủy
                      </button>
                      <button 
                          onClick={performDeleteChat}
                          className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition flex items-center gap-2"
                      >
                          <TrashIcon className="w-4 h-4" /> Xóa
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* --- NATIVE VIDEO CALL COMPONENT (MOVED TO ROOT) --- */}
      {isInCall && activeCallChatId && (
          <ActiveCall 
              chatId={activeCallChatId} 
              currentUserUid={user.uid}
              isCaller={isCaller}
              isVideo={isVideoCall}
              onEnd={endCall}
              onMissedCall={handleLogMissedCall}
              onCallFinished={handleLogSuccessfulCall}
          />
      )}

      {/* --- PREVIEW MODAL (LIGHTBOX) --- */}
      {previewMedia && (
          <div className="fixed inset-0 z-[60] bg-black/95 flex flex-col animate-fadeIn">
              <div className="flex justify-between items-center p-4 text-white bg-black/50 z-50">
                  <h3 className="font-bold truncate max-w-xs">{previewMedia.name}</h3>
                  <div className="flex items-center gap-4">
                      {previewMedia.type === MessageType.IMAGE && (
                          <div className="flex items-center gap-2 bg-gray-800 rounded-lg px-2 py-1">
                              <button onClick={()=>setZoomScale(s => Math.max(0.5, s - 0.25))} className="p-1 hover:text-blue-400"><MagnifyingGlassMinusIcon className="w-5 h-5"/></button>
                              <span className="text-xs w-10 text-center">{Math.round(zoomScale * 100)}%</span>
                              <button onClick={()=>setZoomScale(s => Math.min(5, s + 0.25))} className="p-1 hover:text-blue-400"><MagnifyingGlassPlusIcon className="w-5 h-5"/></button>
                          </div>
                      )}
                      {previewMedia.downloadUrl && (
                          <a href={previewMedia.downloadUrl} target="_blank" rel="noopener noreferrer" className="p-2 hover:bg-gray-700 rounded-full">
                              <ArrowDownTrayIcon className="w-6 h-6"/>
                          </a>
                      )}
                      <button onClick={closePreview} className="p-2 hover:bg-red-600 rounded-full bg-gray-800"><XMarkIcon className="w-6 h-6"/></button>
                  </div>
              </div>

              <div 
                  className="flex-1 flex items-center justify-center overflow-hidden relative w-full h-full" 
                  onClick={closePreview}
                  onTouchStart={handleTouchStart}
                  onTouchMove={handleTouchMove}
              >
                  {previewMedia.type === MessageType.IMAGE ? (
                      <img 
                        ref={imageRef}
                        src={previewMedia.url} 
                        alt="preview" 
                        className="transition-transform duration-100 ease-linear max-w-full max-h-full object-contain"
                        style={{ transform: `scale(${zoomScale})` }}
                        referrerPolicy="no-referrer"
                        onClick={(e) => e.stopPropagation()} 
                        onDoubleClick={handleModalDoubleTap}
                      />
                  ) : (
                      <div className="w-[90%] h-[90%] bg-white rounded-lg overflow-hidden relative">
                          <iframe src={previewMedia.url} className="w-full h-full border-none" title="File Preview" allow="autoplay"></iframe>
                          {previewMedia.url.includes('drive.google.com') && (
                              <div className="absolute top-0 right-0 w-14 h-14 bg-[#202124] z-10"></div>
                          )}
                      </div>
                  )}
              </div>
          </div>
      )}

      {/* --- EXISTING MODALS (Profile/Group) --- */}
      {showProfileModal && (
        <div className="absolute inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl p-6 w-full max-w-sm">
                <h3 className="text-xl font-bold mb-4">Cập nhật tên hiển thị</h3>
                <input type="text" value={newDisplayName} onChange={e=>setNewDisplayName(e.target.value)} className="w-full border border-gray-300 p-2 rounded mb-4 bg-white text-gray-900"/>
                <button onClick={handleUpdateProfile} className="w-full bg-blue-600 text-white p-2 rounded font-bold">Lưu</button>
            </div>
        </div>
      )}

      {showGroupModal && (
          <div className="absolute inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
              <div className="bg-white rounded-xl p-6 w-full max-w-md h-[500px] flex flex-col">
                  <div className="flex justify-between mb-4"><h3 className="font-bold text-lg">Tạo nhóm</h3><button onClick={()=>setShowGroupModal(false)}><XMarkIcon className="w-6 h-6"/></button></div>
                  <input placeholder="Tên nhóm..." value={groupName} onChange={e=>setGroupName(e.target.value)} className="w-full border border-gray-300 p-2 rounded mb-4 bg-white text-gray-900"/>
                  <div className="flex-1 overflow-y-auto border p-2 rounded bg-gray-50">
                      {friends.map(f => (
                          <div key={f.uid} onClick={()=>{
                              setSelectedFriendsForGroup(prev => prev.includes(f.uid) ? prev.filter(id=>id!==f.uid) : [...prev, f.uid]);
                          }} className={`flex items-center gap-3 p-2 rounded cursor-pointer ${selectedFriendsForGroup.includes(f.uid) ? 'bg-blue-100' : ''}`}>
                              {getAvatar(f.displayName, f.email, false, f.isOnline)} <span>{f.displayName}</span> {selectedFriendsForGroup.includes(f.uid) && <CheckIcon className="w-5 h-5 text-blue-600 ml-auto"/>}
                          </div>
                      ))}
                  </div>
                  <button onClick={handleCreateGroup} className="mt-4 bg-blue-600 text-white p-2 rounded font-bold">Tạo nhóm</button>
              </div>
          </div>
      )}

      {/* --- LEFT SIDEBAR --- */}
      <div className={`w-full md:w-80 bg-white border-r flex flex-col ${selectedTarget ? 'hidden md:flex' : 'flex'}`}>
         <div className="p-4 bg-blue-50 border-b flex justify-between items-center">
             <div className="flex items-center gap-2 overflow-hidden">
                 {getAvatar(localDisplayName, user.email, false, true)} {/* Always show self as online */}
                 <div className="truncate font-bold text-gray-800">{localDisplayName || "Tôi"}</div>
             </div>
             <div className="flex gap-1">
                 <button onClick={()=>setShowGroupModal(true)} className="p-2 text-blue-600 bg-white rounded-full shadow hover:bg-blue-100"><UserGroupIcon className="w-5 h-5"/></button>
                 <button onClick={()=>setShowProfileModal(true)} className="p-2 text-gray-600 bg-white rounded-full shadow hover:text-blue-600"><PencilIcon className="w-5 h-5"/></button>
                 <button onClick={()=>signOut(firebaseAuth)} className="p-2 text-red-500 bg-white rounded-full shadow hover:bg-red-50"><ArrowRightOnRectangleIcon className="w-5 h-5"/></button>
             </div>
         </div>
         <div className="flex border-b">
             <button onClick={()=>setActiveTab('contacts')} className={`flex-1 py-3 font-bold text-sm ${activeTab==='contacts' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50' : 'text-gray-500'}`}>DANH BẠ</button>
             <button onClick={()=>setActiveTab('chats')} className={`flex-1 py-3 font-bold text-sm ${activeTab==='chats' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50' : 'text-gray-500'}`}>TRÒ CHUYỆN</button>
         </div>
         <div className="flex-1 overflow-y-auto p-2">
             {activeTab === 'contacts' ? (
                 <div className="space-y-4">
                     <div className="flex gap-2">
                         <input className="border border-gray-300 p-2 rounded w-full bg-white text-gray-900 focus:outline-none focus:ring-blue-500" placeholder="Tìm bạn..." value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} onKeyDown={async (e) => {
                             if (e.key === 'Enter') {
                                 setSearchStatus('Đang tìm...'); setSearchResults([]);
                                 const res = await searchUsers(searchQuery);
                                 setSearchResults(res.filter(r=>r.uid!==user.uid));
                                 setSearchStatus(res.length===0?'Không thấy':"");
                             }
                         }}/>
                     </div>
                     {searchResults.map(r => (
                         <div key={r.uid} className="flex justify-between items-center bg-white border p-2 rounded shadow-sm">
                             <div className="flex gap-2 items-center"><div className="scale-75">{getAvatar(r.displayName, r.email)}</div><span className="font-bold text-sm">{r.displayName}</span></div>
                             <button onClick={async()=>{await sendFriendRequest(user.uid, user.email||'', r.uid); alert("Đã gửi lời mời");}}><UserPlusIcon className="w-6 h-6 text-blue-600"/></button>
                         </div>
                     ))}
                     {friendRequests.map(r => (
                         <div key={r.uid} className="bg-orange-50 p-2 rounded border border-orange-200 flex justify-between items-center">
                             <span className="text-sm font-bold">{r.user?.displayName} muốn kết bạn</span>
                             <button onClick={()=>acceptFriendRequest(user.uid, r.uid)} className="text-green-600"><CheckIcon className="w-6 h-6"/></button>
                         </div>
                     ))}
                     <div className="font-bold text-xs text-gray-500 mt-4">BẠN BÈ ({friends.length})</div>
                     {friends.map(f => (
                         <div key={f.uid} onClick={()=>{setSelectedTarget(f); if(window.innerWidth<768) setActiveTab('chats');}} className="flex items-center gap-3 p-2 hover:bg-gray-100 rounded cursor-pointer">
                             <div className="scale-75">{getAvatar(f.displayName, f.email, false, f.isOnline)}</div>
                             <div className="flex flex-col">
                                 <span className="font-semibold">{f.displayName}</span>
                                 <span className={`text-[10px] ${f.isOnline ? 'text-green-600 font-bold' : 'text-gray-400'}`}>
                                    {f.isOnline ? 'Đang hoạt động' : formatLastActive(f.lastActive)}
                                 </span>
                             </div>
                         </div>
                     ))}
                 </div>
             ) : (
                 <div className="space-y-1">
                     {groups.map(g => (
                         <div key={g.id} onClick={()=>{setSelectedTarget(g);}} className={`flex items-center gap-3 p-3 rounded cursor-pointer border-b group relative ${selectedTarget && isGroup(selectedTarget) && selectedTarget.id===g.id ? 'bg-blue-100' : 'hover:bg-gray-50'}`}>
                             {getAvatar(null, null, true)}
                             <div className="flex-1 overflow-hidden">
                                <div className="font-bold truncate pr-6">{g.name}</div>
                                <div className="text-xs text-gray-500">{g.members.length} thành viên</div>
                             </div>
                             <button onClick={(e) => confirmDeleteChat(e, g)} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full z-10 transition">
                                 <TrashIcon className="w-5 h-5"/>
                             </button>
                         </div>
                     ))}
                     {friends.map(f => (
                         <div key={f.uid} onClick={()=>{setSelectedTarget(f);}} className={`flex items-center gap-3 p-3 rounded cursor-pointer border-b group relative ${selectedTarget && !isGroup(selectedTarget) && selectedTarget.uid===f.uid ? 'bg-blue-100' : 'hover:bg-gray-50'}`}>
                             {getAvatar(f.displayName, f.email, false, f.isOnline)}
                             <div className="flex-1 overflow-hidden">
                                 <div className="font-bold truncate pr-6">{f.displayName}</div>
                                 <div className="text-xs text-gray-500 flex justify-between">
                                     <span>Chat ngay</span>
                                     {f.isOnline && <span className="text-green-500 font-bold text-[10px]">● Online</span>}
                                 </div>
                             </div>
                             {/* DELETE BUTTON IN SIDEBAR */}
                             <button onClick={(e) => confirmDeleteChat(e, f)} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full z-10 transition">
                                 <TrashIcon className="w-5 h-5"/>
                             </button>
                         </div>
                     ))}
                 </div>
             )}
         </div>
      </div>

      {/* --- RIGHT CHAT AREA --- */}
      <div className={`flex-1 flex-col bg-[#eef0f3] ${selectedTarget ? 'fixed inset-0 z-50 flex md:static md:z-auto' : 'hidden md:flex'}`}>
          {selectedTarget ? (
              <>
                <div className="bg-white p-3 shadow-sm flex items-center gap-3 z-10 justify-between sticky top-0 shrink-0 border-b">
                    <div className="flex items-center gap-3">
                        <button onClick={()=>setSelectedTarget(null)} className="md:hidden"><ArrowUturnLeftIcon className="w-6 h-6"/></button>
                        {isGroup(selectedTarget) ? getAvatar(null,null,true) : getAvatar(selectedTarget.displayName, selectedTarget.email, false, selectedTarget.isOnline)}
                        <div>
                            <h2 className="font-bold text-lg text-gray-800">{isGroup(selectedTarget) ? selectedTarget.name : selectedTarget.displayName}</h2>
                            {!isGroup(selectedTarget) && (
                                <p className={`text-xs ${selectedTarget.isOnline ? 'text-green-600 font-bold' : 'text-gray-500'}`}>
                                    {selectedTarget.isOnline ? '● Đang hoạt động' : formatLastActive(selectedTarget.lastActive)}
                                </p>
                            )}
                        </div>
                    </div>
                    {/* Only Call Buttons in Header now */}
                    <div className="flex gap-2">
                         <button onClick={()=>initiateCall(false)} className="p-2 hover:bg-gray-100 rounded-full text-blue-600" title="Gọi thoại">
                            <PhoneIcon className="w-6 h-6"/>
                        </button>
                        <button onClick={()=>initiateCall(true)} className="p-2 hover:bg-gray-100 rounded-full text-blue-600" title="Gọi video">
                            <VideoCameraIcon className="w-6 h-6"/>
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-6">
                    {messages.map((msg) => {
                        const isMe = msg.senderId === user.uid;
                        const showAction = activeMessageActionId === msg.id;

                        // SYSTEM MESSAGE: CALL LOG
                        if (msg.type === MessageType.CALL_LOG) {
                            const isMissedOrRejected = msg.text?.includes("nhỡ") || msg.text?.includes("từ chối");
                            let Icon = PhoneArrowUpRightIcon;
                            let colorClass = "bg-gray-200 text-gray-600";

                            if (isMissedOrRejected) {
                                colorClass = "bg-red-100 text-red-600";
                                Icon = isMe ? PhoneArrowUpRightIcon : PhoneXMarkIcon; 
                            } else {
                                colorClass = "bg-green-100 text-green-700";
                                Icon = isMe ? PhoneArrowUpRightIcon : PhoneArrowDownLeftIcon; 
                            }

                            return (
                                <div key={msg.id} className="flex flex-col items-center justify-center my-4 opacity-90">
                                    <div className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold shadow-sm ${colorClass}`}>
                                        <Icon className="w-4 h-4"/>
                                        <span>{msg.text}</span>
                                        <span className="opacity-50">•</span>
                                        <span>{formatDateTime(msg.timestamp)}</span>
                                    </div>
                                </div>
                            );
                        }
                        
                        const driveId = getGoogleDriveId(msg.imageUrl || msg.fileUrl);
                        const displayImageSrc = (msg.type === MessageType.IMAGE && driveId) ? `https://lh3.googleusercontent.com/d/${driveId}` : msg.imageUrl;
                        const filePreviewEmbedLink = (msg.type === MessageType.FILE && driveId) ? `https://drive.google.com/file/d/${driveId}/preview` : msg.fileUrl;
                        const fileDownloadLink = (msg.type === MessageType.FILE && driveId) ? `https://drive.google.com/uc?export=download&id=${driveId}` : msg.fileUrl;

                        return (
                            <div key={msg.id} id={`msg-${msg.id}`} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} group relative`}>
                                {msg.replyTo && !msg.isDeleted && (
                                    <div 
                                        onClick={() => scrollToMessage(msg.replyTo!.id)}
                                        className={`text-xs text-gray-500 mb-1 p-1 bg-gray-200 rounded px-2 opacity-80 cursor-pointer hover:bg-gray-300 transition ${isMe ? 'mr-2' : 'ml-12'}`}
                                    >
                                        Trả lời <b>{msg.replyTo.senderName}</b>: {msg.replyTo.text.substring(0,30)}...
                                    </div>
                                )}
                                
                                <div className={`flex ${isMe ? 'flex-row-reverse' : 'flex-row'} items-end gap-2 max-w-[85%] relative`}>
                                    {!isMe && <div className="scale-75 mb-1">{getAvatar(msg.senderName, msg.senderEmail)}</div>}
                                    
                                    <div 
                                        onClick={() => setActiveMessageActionId(showAction ? null : msg.id)}
                                        className={`p-3 rounded-2xl shadow-sm text-base relative cursor-pointer transition-all duration-300
                                        ${isMe ? 'bg-blue-600 text-white rounded-br-none' : 'bg-white text-gray-800 rounded-bl-none'}
                                        ${msg.isDeleted ? 'bg-gray-300 text-gray-500 italic border' : ''}
                                        ${msg.type === MessageType.IMAGE ? 'p-1' : ''}
                                    `}>
                                        {msg.isDeleted ? (
                                            <span className="p-2 block">🚫 Tin nhắn đã thu hồi</span>
                                        ) : (
                                            <>
                                                {msg.senderName && isGroup(selectedTarget) && !isMe && msg.type === MessageType.TEXT && <div className="text-[10px] font-bold text-gray-400 mb-1">{msg.senderName}</div>}
                                                
                                                {msg.type === MessageType.TEXT && <div className="whitespace-pre-wrap">{msg.text}</div>}
                                                
                                                {msg.type === MessageType.IMAGE && (
                                                    <img 
                                                        src={displayImageSrc} 
                                                        className="rounded-xl max-h-80 object-contain bg-gray-50 min-w-[100px] min-h-[100px] hover:opacity-95" 
                                                        alt="sent" 
                                                        loading="lazy"
                                                        referrerPolicy="no-referrer"
                                                        onDoubleClick={(e) => {
                                                            e.stopPropagation();
                                                            openPreview(MessageType.IMAGE, displayImageSrc || '', "Hình ảnh");
                                                        }}
                                                    />
                                                )}
                                                
                                                {msg.type === MessageType.FILE && (
                                                    <div className="flex items-center gap-3 p-1">
                                                        <DocumentIcon className={`w-10 h-10 ${isMe ? 'text-white' : 'text-blue-500'}`}/>
                                                        <div className="flex flex-col gap-1">
                                                            <span className="font-bold truncate max-w-[150px]">{msg.fileName || "Tài liệu"}</span>
                                                            <div className="flex gap-3 text-xs">
                                                                <button 
                                                                    className={`underline flex items-center gap-1 font-bold ${isMe ? 'text-blue-100 hover:text-white' : 'text-blue-600 hover:text-blue-800'}`}
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        openPreview(MessageType.FILE, filePreviewEmbedLink || '', msg.fileName || "Tài liệu", fileDownloadLink);
                                                                    }}
                                                                >
                                                                    <EyeIcon className="w-3 h-3"/> Xem trước
                                                                </button>
                                                                <a 
                                                                    href={fileDownloadLink} 
                                                                    target="_blank" 
                                                                    rel="noopener noreferrer" 
                                                                    className={`underline flex items-center gap-1 font-bold ${isMe ? 'text-blue-100 hover:text-white' : 'text-blue-600 hover:text-blue-800'}`}
                                                                    onClick={(e) => e.stopPropagation()}
                                                                >
                                                                    <ArrowDownTrayIcon className="w-3 h-3"/> Tải về
                                                                </a>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}

                                                {msg.reactions && (
                                                    <div className="absolute -bottom-3 -right-2 bg-white rounded-full p-1 shadow-md border flex items-center gap-0.5 z-10 scale-90">
                                                        {Object.values(msg.reactions).slice(0,3).map((e,i) => <span key={i} className="leading-none">{e}</span>)}
                                                        {Object.keys(msg.reactions).length > 3 && <span className="text-[10px] text-gray-500 font-bold">+{Object.keys(msg.reactions).length-3}</span>}
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>

                                    {showAction && !msg.isDeleted && (
                                        <div className={`absolute z-50 bottom-0 ${isMe ? 'right-0' : 'left-0'} flex flex-col items-end gap-2 p-1`}>
                                            <div className="bg-white rounded-full shadow-xl border px-3 py-1.5 flex gap-2 animate-fadeIn mb-1">
                                                {REACTIONS_LIST.map(r => (
                                                    <button key={r.emoji} onClick={(e)=>{e.stopPropagation(); handleReaction(msg.id, r.emoji)}} className="hover:scale-125 transition text-xl md:text-2xl" title={r.label}>{r.emoji}</button>
                                                ))}
                                            </div>
                                            <div className="bg-white rounded-lg shadow-xl border overflow-hidden flex flex-col text-sm text-gray-700 min-w-[150px]">
                                                <button onClick={(e)=>{e.stopPropagation(); setReplyingTo(msg); setActiveMessageActionId(null);}} className="flex items-center gap-2 p-2.5 hover:bg-gray-100 text-left"><ArrowUturnLeftIcon className="w-4 h-4"/> Trả lời</button>
                                                <button onClick={(e)=>{e.stopPropagation(); shareContent(msg.text || msg.imageUrl || '');}} className="flex items-center gap-2 p-2.5 hover:bg-gray-100 text-left"><ShareIcon className="w-4 h-4"/> Chia sẻ</button>
                                                {isMe && <button onClick={(e)=>{e.stopPropagation(); handleRecall(msg)}} className="flex items-center gap-2 p-2.5 hover:bg-red-50 text-red-600 text-left font-semibold"><TrashIcon className="w-4 h-4"/> Thu hồi</button>}
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <span className="text-[10px] text-gray-400 mt-1 mx-2">{formatDateTime(msg.timestamp)}</span>
                            </div>
                        )
                    })}
                    <div ref={messagesEndRef} />
                </div>

                <div className="bg-white p-3 border-t relative shrink-0">
                    {pendingFiles.length > 0 && (
                        <div className="flex gap-3 p-2 overflow-x-auto bg-gray-50 border-b border-gray-200 mb-2 rounded-lg">
                            {pendingFiles.map(file => (
                                <div key={file.id} className="relative flex-shrink-0 group">
                                    {file.type === MessageType.IMAGE ? (
                                        <img src={file.previewUrl} className="w-16 h-16 object-cover rounded border" alt="preview" />
                                    ) : (
                                        <div className="w-16 h-16 bg-white border rounded flex flex-col items-center justify-center p-1">
                                            <DocumentIcon className="w-8 h-8 text-gray-400"/>
                                            <span className="text-[8px] truncate w-full text-center">{file.file.name}</span>
                                        </div>
                                    )}
                                    <button onClick={() => removePending(file.id)} className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 shadow-sm hover:scale-110">
                                        <XMarkIcon className="w-3 h-3"/>
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                    {replyingTo && (
                        <div className="flex items-center justify-between bg-gray-100 p-2 rounded-t-lg border-b border-gray-300 text-sm text-gray-600 mb-1">
                            <div>Đang trả lời <b>{replyingTo.senderName}</b>: {replyingTo.text?.substring(0,30)}...</div>
                            <button onClick={()=>setReplyingTo(null)}><XMarkIcon className="w-5 h-5"/></button>
                        </div>
                    )}
                    
                    {showEmoji && (
                        <div className="absolute bottom-20 left-4 bg-white shadow-xl rounded-xl p-3 border grid grid-cols-4 gap-2 w-64 z-20">
                            {EMOJIS.map(e => <button key={e} onClick={() => setInputText(p => p+e)} className="text-2xl hover:bg-gray-100 p-1">{e}</button>)}
                        </div>
                    )}

                    <div className="flex items-end gap-2">
                        <button onClick={() => setShowEmoji(!showEmoji)} className="p-2 text-gray-500 hover:text-yellow-500"><FaceSmileIcon className="w-7 h-7" /></button>
                        
                        <input type="file" multiple ref={fileInputRef} className="hidden" onChange={(e)=>addToPending(e.target.files, MessageType.FILE)} />
                        <button onClick={() => fileInputRef.current?.click()} disabled={isUploading} className="p-2 text-gray-500 hover:text-blue-600" title="Đính kèm file">
                            <DocumentIcon className="w-7 h-7" />
                        </button>
                        
                        <input type="file" multiple ref={imageInputRef} className="hidden" accept="image/*" onChange={(e)=>addToPending(e.target.files, MessageType.IMAGE)} />
                        <button onClick={() => imageInputRef.current?.click()} disabled={isUploading} className="p-2 text-gray-500 hover:text-green-600" title="Gửi ảnh">
                             <PhotoIcon className="w-7 h-7" />
                        </button>

                        <div className="flex-1 bg-gray-100 rounded-2xl p-2 px-4 focus-within:ring-2 focus-within:ring-blue-500 flex items-center">
                            <input 
                                type="text" 
                                value={inputText}
                                onChange={(e) => setInputText(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                                onPaste={handlePaste}
                                placeholder="Nhập tin nhắn..."
                                className="w-full bg-transparent outline-none text-gray-800"
                            />
                        </div>

                        <button onClick={handleSendMessage} disabled={(isUploading || (!inputText.trim() && pendingFiles.length === 0))} className={`${(inputText.trim() || pendingFiles.length > 0) ? 'text-blue-600 bg-blue-50' : 'text-gray-300'} p-2 rounded-full transition`}>
                            {isUploading ? <ArrowPathIcon className="w-7 h-7 animate-spin" /> : <PaperAirplaneIcon className="w-7 h-7 -rotate-45" />}
                        </button>
                    </div>
                </div>
              </>
          ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-gray-400 opacity-50">
                  <div className="w-32 h-32 bg-gray-200 rounded-full flex items-center justify-center mb-4"><ChatBubbleLeftRightIcon className="w-16 h-16"/></div>
                  <p className="text-xl font-bold">Chào mừng đến với Cùng Chat</p>
                  <p>Chọn một người bạn để bắt đầu</p>
              </div>
          )}
      </div>
    </div>
  );
};

export default Chat;