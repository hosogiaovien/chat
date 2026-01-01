import { initializeApp } from 'firebase/app';
import { getAuth, updateProfile } from 'firebase/auth';
import { getDatabase, ref, push, set, onValue, off, get, child, update, query, orderByChild, equalTo, remove, onChildAdded, onDisconnect } from 'firebase/database';
import { FIREBASE_CONFIG } from '../constants';
import { ChatMessage, UserProfile, FriendRequest, ChatGroup, ReactionMap } from '../types';
import { deleteFileFromGAS } from './gasService'; // Import delete service

// Initialize Firebase
const app = initializeApp(FIREBASE_CONFIG);

// Export Auth and Database instances
export const firebaseAuth = getAuth(app);
export const firebaseDb = getDatabase(app);

// --- USER PROFILE & PRESENCE SERVICES ---

// NEW: Setup presence system (Online/Offline)
export const setupPresence = (uid: string) => {
    const connectedRef = ref(firebaseDb, '.info/connected');
    const userStatusRef = ref(firebaseDb, `users/${uid}/isOnline`);
    const lastActiveRef = ref(firebaseDb, `users/${uid}/lastActive`);

    onValue(connectedRef, (snap) => {
        if (snap.val() === true) {
            // When we disconnect, update the state in the DB
            onDisconnect(userStatusRef).set(false);
            onDisconnect(lastActiveRef).set(Date.now());

            // We are currently connected
            set(userStatusRef, true);
            // Also update basic info just in case
            update(ref(firebaseDb, `users/${uid}`), { lastActive: Date.now() });
        }
    });
};

export const syncUserToDB = async (user: { uid: string; email: string | null }) => {
  const updates: any = {};
  updates[`users/${user.uid}/email`] = user.email;
  updates[`users/${user.uid}/uid`] = user.uid;
  updates[`users/${user.uid}/lastActive`] = Date.now();
  updates[`users/${user.uid}/isOnline`] = true; // Set online on sync
  
  await update(ref(firebaseDb), updates);
};

export const updateUserProfileDB = async (uid: string, data: Partial<UserProfile>) => {
  const updates: any = {};
  if (data.displayName) updates[`users/${uid}/displayName`] = data.displayName;
  if (data.photoURL) updates[`users/${uid}/photoURL`] = data.photoURL;
  if (data.email) updates[`users/${uid}/email`] = data.email;
  
  updates[`users/${uid}/lastActive`] = Date.now();
  
  await update(ref(firebaseDb), updates);

  // Update Auth Profile if changed
  if (firebaseAuth.currentUser && (data.displayName || data.photoURL)) {
    await updateProfile(firebaseAuth.currentUser, {
        displayName: data.displayName || firebaseAuth.currentUser.displayName,
        photoURL: data.photoURL || firebaseAuth.currentUser.photoURL
    });
  }
};

export const getAllUsers = async (): Promise<UserProfile[]> => {
    const usersRef = ref(firebaseDb, 'users');
    const snapshot = await get(usersRef);
    if (snapshot.exists()) {
        return Object.values(snapshot.val());
    }
    return [];
};

// UPDATED: Search users by Name OR Email (Partial Match)
export const searchUsers = async (queryText: string): Promise<UserProfile[]> => {
    const usersRef = ref(firebaseDb, 'users');
    const snapshot = await get(usersRef);
    const results: UserProfile[] = [];
    const lowerQuery = queryText.toLowerCase().trim();

    if (snapshot.exists()) {
        const users = snapshot.val();
        for (const key in users) {
            const user = users[key] as UserProfile;
            const email = user.email?.toLowerCase() || '';
            const name = user.displayName?.toLowerCase() || '';
            
            // Check if matches email or name (partial match)
            if (email.includes(lowerQuery) || name.includes(lowerQuery)) {
                results.push(user);
            }
        }
    }
    return results;
};

// --- FRIEND SERVICES ---

export const sendFriendRequest = async (currentUid: string, currentEmail: string, targetUid: string) => {
    const updates: any = {};
    // Record for sender
    updates[`friendRequests/${currentUid}/${targetUid}`] = {
        status: 'pending',
        direction: 'sent',
        timestamp: Date.now()
    };
    // Record for receiver
    updates[`friendRequests/${targetUid}/${currentUid}`] = {
        status: 'pending',
        direction: 'received',
        email: currentEmail, // Store basic info for notification
        timestamp: Date.now()
    };
    await update(ref(firebaseDb), updates);
};

export const acceptFriendRequest = async (currentUid: string, targetUid: string) => {
    const updates: any = {};
    // Add to friends list for both
    updates[`friends/${currentUid}/${targetUid}`] = true;
    updates[`friends/${targetUid}/${currentUid}`] = true;
    
    // Remove requests
    updates[`friendRequests/${currentUid}/${targetUid}`] = null;
    updates[`friendRequests/${targetUid}/${currentUid}`] = null;

    await update(ref(firebaseDb), updates);
};

export const subscribeToFriendRequests = (uid: string, callback: (requests: any[]) => void) => {
    const reqRef = ref(firebaseDb, `friendRequests/${uid}`);
    return onValue(reqRef, async (snapshot) => {
        const data = snapshot.val();
        if (!data) {
            callback([]);
            return;
        }
        
        // Enrich data with user profiles
        const requests = await Promise.all(Object.keys(data).map(async (key) => {
            const req = data[key];
            if (req.direction === 'received') {
                const userSnap = await get(ref(firebaseDb, `users/${key}`));
                return { ...req, uid: key, user: userSnap.val() };
            }
            return null;
        }));
        
        callback(requests.filter(r => r !== null));
    });
};

// IMPROVED: Subscribe to friends AND listen to their Realtime Status updates
export const subscribeToFriends = (uid: string, callback: (friends: UserProfile[]) => void) => {
    const friendsRef = ref(firebaseDb, `friends/${uid}`);
    const usersRef = ref(firebaseDb, 'users');

    let friendIds: string[] = [];
    let allUsers: Record<string, UserProfile> = {};

    // Helper to filter and return
    const emit = () => {
        const friendList = friendIds.map(id => allUsers[id]).filter(u => u !== undefined);
        callback(friendList);
    };

    // Listener 1: Watch Friend List Structure (Added/Removed friends)
    const unsubFriends = onValue(friendsRef, (snap) => {
        friendIds = snap.exists() ? Object.keys(snap.val()) : [];
        emit();
    });

    // Listener 2: Watch Users Data (Online/Offline status changes)
    // Note: In a large app, we would query only specific users, but for this scale, 
    // listening to 'users' ensures instant online status updates without complex N-listeners.
    const unsubUsers = onValue(usersRef, (snap) => {
        allUsers = snap.exists() ? snap.val() : {};
        emit();
    });

    return () => {
        unsubFriends();
        unsubUsers();
    };
};

// --- GROUP CHAT SERVICES ---

export const createGroupChat = async (name: string, memberUids: string[], createdBy: string) => {
    const groupRef = push(ref(firebaseDb, 'groups'));
    const groupId = groupRef.key;
    
    if (!groupId) throw new Error("Could not generate Group ID");

    const newGroup: ChatGroup = {
        id: groupId,
        name,
        members: memberUids,
        createdBy,
        createdAt: Date.now()
    };

    const updates: any = {};
    // Create the group node
    updates[`groups/${groupId}`] = newGroup;
    
    // Add group reference to each member's profile
    memberUids.forEach(uid => {
        updates[`users/${uid}/groups/${groupId}`] = true;
    });

    await update(ref(firebaseDb), updates);
    return groupId;
};

export const subscribeToUserGroups = (uid: string, callback: (groups: ChatGroup[]) => void) => {
    const userGroupsRef = ref(firebaseDb, `users/${uid}/groups`);
    
    return onValue(userGroupsRef, async (snapshot) => {
        const data = snapshot.val();
        if (!data) {
            callback([]);
            return;
        }

        const groupIds = Object.keys(data);
        const groups: ChatGroup[] = [];

        // Fetch details for each group
        for (const gid of groupIds) {
            const groupSnap = await get(ref(firebaseDb, `groups/${gid}`));
            if (groupSnap.exists()) {
                groups.push(groupSnap.val());
            }
        }
        callback(groups);
    });
};

// --- CHAT SERVICES ---

export const getChatId = (uid1: string, uid2: string) => {
    return [uid1, uid2].sort().join('_');
};

export const sendMessage = async (chatId: string, message: Omit<ChatMessage, 'id'>) => {
  const messagesRef = ref(firebaseDb, `chats/${chatId}/messages`);
  const newMsgRef = push(messagesRef);
  
  // FIX: Firebase set() does not allow 'undefined' values.
  const cleanMessage = JSON.parse(JSON.stringify(message));

  await set(newMsgRef, {
    ...cleanMessage,
    id: newMsgRef.key
  });
};

// IMPROVED: Robust recall logic
export const recallMessage = async (chatId: string, messageId: string, oldFileUrl?: string) => {
    if (!chatId || !messageId) {
        console.error("Missing chatId or messageId for recall");
        return;
    }

    const msgRef = ref(firebaseDb, `chats/${chatId}/messages/${messageId}`);
    
    // 1. Mark as deleted in Firebase IMMEDIATELY (UI updates instantly)
    // Using object spread to ensure keys are removed (Firebase removes keys with null values)
    await update(msgRef, {
        isDeleted: true,
        text: 'Tin nhắn đã được thu hồi',
        imageUrl: null,
        fileUrl: null,
        reactions: null // Clear reactions on recall
    });

    // 2. Delete file from Google Drive in BACKGROUND
    if (oldFileUrl) {
        console.log("Triggering background cloud delete for:", oldFileUrl);
        deleteFileFromGAS(oldFileUrl).catch(e => {
            console.warn("Background file delete failed (minor issue):", e);
        });
    }
};

// NEW: Clear all messages in a chat
export const clearChatMessages = async (chatId: string) => {
    if (!chatId) return;
    const messagesRef = ref(firebaseDb, `chats/${chatId}/messages`);
    await remove(messagesRef);
};

export const reactToMessage = async (chatId: string, messageId: string, userId: string, emoji: string) => {
    const reactionRef = ref(firebaseDb, `chats/${chatId}/messages/${messageId}/reactions`);
    const updates: any = {};
    updates[userId] = emoji;
    await update(reactionRef, updates);
};

export const subscribeToMessages = (chatId: string, callback: (messages: ChatMessage[]) => void) => {
  const messagesRef = ref(firebaseDb, `chats/${chatId}/messages`);
  
  const listener = onValue(messagesRef, (snapshot) => {
    const data = snapshot.val();
    if (data) {
      const parsedMessages: ChatMessage[] = Object.values(data);
      // Sort by timestamp
      parsedMessages.sort((a, b) => a.timestamp - b.timestamp);
      callback(parsedMessages);
    } else {
      callback([]);
    }
  });

  return () => off(messagesRef, 'value', listener);
};

// --- WEBRTC SIGNALING SERVICES ---

export const startCall = async (chatId: string, callerUid: string, isVideo: boolean) => {
    const callRef = ref(firebaseDb, `calls/${chatId}`);
    // FIX: Do not remove() first. Overwrite directly to prevent UI flickering on caller side.
    await set(callRef, {
        callerId: callerUid,
        type: isVideo ? 'video' : 'audio',
        status: 'calling',
        createdAt: Date.now()
    });
    // Cleanup old candidates when starting new call
    await remove(ref(firebaseDb, `calls/${chatId}/candidates`));
};

export const endCallSignal = async (chatId: string) => {
    const callRef = ref(firebaseDb, `calls/${chatId}`);
    await remove(callRef);
};

export const sendSignalData = async (chatId: string, type: 'offer' | 'answer' | 'candidate', data: any, senderUid: string) => {
    if (type === 'candidate') {
        // Pushes candidate to: calls/chatId/candidates/SENDER_UID
        // The receiver listens to THIS path.
        const candidatesRef = ref(firebaseDb, `calls/${chatId}/candidates/${senderUid}`);
        await push(candidatesRef, data);
    } else {
        const updateRef = ref(firebaseDb, `calls/${chatId}`);
        await update(updateRef, { [type]: data });
    }
};

export const subscribeToCall = (chatId: string, callback: (data: any) => void) => {
    const callRef = ref(firebaseDb, `calls/${chatId}`);
    return onValue(callRef, (snapshot) => {
        callback(snapshot.val());
    });
};

// CRITICAL FIX: Explicitly listen to REMOTE user's candidates
export const subscribeToCandidates = (chatId: string, remoteUid: string, callback: (candidate: any) => void) => {
    // I am User A. I listen to candidates created by User B.
    // So I subscribe to `calls/chatId/candidates/UserB`
    const candidatesRef = ref(firebaseDb, `calls/${chatId}/candidates/${remoteUid}`);
    
    console.log(`Listening for candidates from: ${remoteUid}`);

    const listener = onChildAdded(candidatesRef, (snapshot) => {
        if (snapshot.exists()) {
             // console.log("Received Candidate:", snapshot.val());
             callback(snapshot.val());
        }
    });
    
    return () => off(candidatesRef, 'child_added', listener);
};