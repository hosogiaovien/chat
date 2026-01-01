import { useEffect, useRef, useState, useCallback } from 'react';
import { ref, get } from 'firebase/database';
import { sendSignalData, endCallSignal, subscribeToCall, subscribeToCandidates, firebaseDb } from '../services/firebaseService';

const SERVERS = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: "turn:openrelay.metered.ca:80", username: "openrelayproject", credential: "openrelayproject" },
        { urls: "turn:openrelay.metered.ca:443", username: "openrelayproject", credential: "openrelayproject" },
        { urls: "turn:openrelay.metered.ca:443?transport=tcp", username: "openrelayproject", credential: "openrelayproject" }
    ],
    iceCandidatePoolSize: 2, 
    bundlePolicy: 'max-bundle' as RTCBundlePolicy,
};

export const useWebRTC = (chatId: string, currentUserUid: string, isCaller: boolean, initialIsVideo: boolean, onEnd: () => void, onCallFinished?: (duration: number) => void) => {
    // --- STATE ---
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
    const [remoteProfile, setRemoteProfile] = useState<{ displayName: string; photoURL?: string } | null>(null);
    
    // Status
    const [connectionStatus, setConnectionStatus] = useState('Đang khởi tạo...');
    const [activeIsVideo, setActiveIsVideo] = useState(initialIsVideo);
    
    // Controls
    const [isMuted, setIsMuted] = useState(false);
    const [isCameraOff, setIsCameraOff] = useState(!initialIsVideo);
    const [isSpeakerOn, setIsSpeakerOn] = useState(true);
    const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
    const [forceUpdateTick, setForceUpdateTick] = useState(0);

    // --- REFS ---
    const peerConnection = useRef<RTCPeerConnection | null>(null);
    const candidateQueue = useRef<RTCIceCandidateInit[]>([]);
    const hasStarted = useRef(false);
    const callStartTime = useRef<number | null>(null);
    const hasConnected = useRef(false);

    // Helper: Identify Remote User
    const uids = chatId.split('_');
    const remoteUid = uids.find(id => id !== currentUserUid);

    // 1. Fetch Remote Profile
    useEffect(() => {
        if (remoteUid) {
            get(ref(firebaseDb, `users/${remoteUid}`)).then(snapshot => {
                if (snapshot.exists()) setRemoteProfile(snapshot.val());
            });
        }
    }, [remoteUid]);

    // 2. Main WebRTC Logic
    useEffect(() => {
        if (hasStarted.current) return;
        hasStarted.current = true;

        let pc: RTCPeerConnection | null = null;
        let localTracks: MediaStreamTrack[] = [];

        const startSystem = async () => {
            try {
                setConnectionStatus(initialIsVideo ? 'Đang truy cập Camera...' : 'Đang truy cập Micro...');
                
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: initialIsVideo ? { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } : false,
                    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
                });

                setLocalStream(stream);
                localTracks = stream.getTracks();

                setConnectionStatus(isCaller ? 'Đang gọi...' : 'Đang kết nối...');
                pc = new RTCPeerConnection(SERVERS);
                peerConnection.current = pc;

                stream.getTracks().forEach(track => {
                    pc!.addTrack(track, stream);
                    if (track.kind === 'video') track.enabled = !isCameraOff;
                    if (track.kind === 'audio') track.enabled = !isMuted;
                });

                pc.ontrack = (event) => {
                    // Detect if video track arrives
                    if (event.track.kind === 'video') {
                        setActiveIsVideo(true);
                        setIsCameraOff(false); 
                    }

                    // CRITICAL: Always create a NEW MediaStream object for React state to update UI
                    // But preserve existing tracks if we are adding to them
                    setRemoteStream(prev => {
                        const newTracks = [event.track];
                        if (prev) {
                            // Keep existing tracks (e.g. keep audio if adding video)
                            prev.getTracks().forEach(t => {
                                if (t.id !== event.track.id) newTracks.push(t);
                            });
                        }
                        return new MediaStream(newTracks); 
                    });
                    
                    setForceUpdateTick(t => t + 1);
                };

                pc.onicecandidate = (event) => {
                    if (event.candidate) sendSignalData(chatId, 'candidate', event.candidate.toJSON(), currentUserUid);
                };

                pc.oniceconnectionstatechange = () => {
                    if (pc!.iceConnectionState === 'connected') {
                        setConnectionStatus('Đã kết nối');
                        hasConnected.current = true;
                        if (!callStartTime.current) callStartTime.current = Date.now();
                    } else if (pc!.iceConnectionState === 'failed') {
                        setConnectionStatus('Mạng yếu, thử lại...');
                        pc!.restartIce();
                    } else if (pc!.iceConnectionState === 'disconnected') {
                        setConnectionStatus('Mất kết nối');
                    }
                };

                if (isCaller) {
                    const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
                    await pc.setLocalDescription(offer);
                    await sendSignalData(chatId, 'offer', { type: offer.type, sdp: offer.sdp }, currentUserUid);
                }

                subscribeToCall(chatId, async (data) => {
                    if (!pc) return;
                    if (!data) {
                        setTimeout(() => { if (hasConnected.current || !isCaller) onEnd(); }, 1000);
                        return;
                    }
                    try {
                        if (!isCaller && data.offer && (!pc.currentRemoteDescription || pc.currentRemoteDescription.sdp !== data.offer.sdp)) {
                            await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
                            const answer = await pc.createAnswer();
                            await pc.setLocalDescription(answer);
                            await sendSignalData(chatId, 'answer', { type: answer.type, sdp: answer.sdp }, currentUserUid);
                            flushCandidateQueue(pc);
                        }
                        if (isCaller && data.answer) {
                            if (!pc.currentRemoteDescription || pc.signalingState === 'have-local-offer') {
                                await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
                                flushCandidateQueue(pc);
                            }
                        }
                    } catch (err) { console.error("Signaling Error:", err); }
                });

                if (remoteUid) {
                    subscribeToCandidates(chatId, remoteUid, async (candidate) => {
                        if (!pc) return;
                        try {
                            const ice = new RTCIceCandidate(candidate);
                            if (pc.remoteDescription && pc.remoteDescription.type) await pc.addIceCandidate(ice);
                            else candidateQueue.current.push(candidate);
                        } catch (e) { }
                    });
                }

            } catch (err) {
                console.error("Init Error:", err);
                setConnectionStatus('Lỗi thiết bị/quyền');
            }
        };

        startSystem();

        return () => {
            if (localTracks) localTracks.forEach(t => t.stop());
            if (pc) pc.close();
        };
    }, []);

    const flushCandidateQueue = async (pc: RTCPeerConnection) => {
        if (candidateQueue.current.length > 0) {
            for (const cand of candidateQueue.current) {
                try { await pc.addIceCandidate(new RTCIceCandidate(cand)); } catch (e) {}
            }
            candidateQueue.current = [];
        }
    };

    // --- ACTIONS ---

    const toggleMute = useCallback(() => {
        if (localStream) {
            localStream.getAudioTracks().forEach(t => t.enabled = isMuted); 
            localStream.getAudioTracks().forEach(t => t.enabled = !localStream.getAudioTracks()[0].enabled);
            setIsMuted(prev => !prev);
        }
    }, [localStream]);

    const toggleCamera = useCallback(async () => {
        const pc = peerConnection.current;
        if (!pc || !localStream) return;
        
        const videoTrack = localStream.getVideoTracks()[0];
        if (videoTrack) {
            // Toggle existing track
            videoTrack.enabled = !videoTrack.enabled;
            setIsCameraOff(!videoTrack.enabled);
            if (videoTrack.enabled) setActiveIsVideo(true);
            setForceUpdateTick(t => t + 1);
        } else {
            // Add new video track
            try {
                const newStream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
                    audio: false // Don't ask for audio again, we have it
                });
                const newVideoTrack = newStream.getVideoTracks()[0];
                newVideoTrack.enabled = true;
                
                // Add to local stream (React State)
                localStream.addTrack(newVideoTrack);
                setLocalStream(new MediaStream(localStream.getTracks())); // Update state reference

                // Add to Peer Connection
                pc.addTrack(newVideoTrack, localStream);
                
                // Renegotiate
                const offer = await pc.createOffer({ offerToReceiveVideo: true, offerToReceiveAudio: true });
                await pc.setLocalDescription(offer);
                await sendSignalData(chatId, 'offer', { type: offer.type, sdp: offer.sdp }, currentUserUid);

                setIsCameraOff(false);
                setActiveIsVideo(true);
                setForceUpdateTick(t => t + 1);
            } catch (e) {
                console.error("Failed to add video:", e);
                alert("Không thể bật camera.");
            }
        }
    }, [localStream, chatId, currentUserUid]);

    const switchCamera = useCallback(async () => {
        if (!localStream || isCameraOff) return;
        const nextMode = facingMode === 'user' ? 'environment' : 'user';
        try {
            const newStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: nextMode, width: { ideal: 640 }, height: { ideal: 480 } },
                audio: false
            });
            const newVideoTrack = newStream.getVideoTracks()[0];
            const pc = peerConnection.current;
            if (pc) {
                const sender = pc.getSenders().find(s => s.track?.kind === 'video');
                if (sender) await sender.replaceTrack(newVideoTrack);
            }
            setLocalStream(prev => {
                if (!prev) return null;
                // Remove old video tracks
                prev.getVideoTracks().forEach(t => { t.stop(); prev.removeTrack(t); });
                prev.addTrack(newVideoTrack);
                return new MediaStream(prev.getTracks());
            });
            setFacingMode(nextMode);
            setForceUpdateTick(t => t + 1);
        } catch (e) {
            console.error(e);
        }
    }, [localStream, isCameraOff, facingMode]);

    const handleHangup = useCallback(() => {
        if (hasConnected.current && callStartTime.current && onCallFinished) {
            onCallFinished(Date.now() - callStartTime.current);
        } 
        endCallSignal(chatId);
        onEnd();
    }, [chatId, onCallFinished, onEnd]);

    return {
        localStream, remoteStream, remoteProfile,
        connectionStatus, activeIsVideo,
        isMuted, isCameraOff, isSpeakerOn,
        toggleMute, toggleCamera, switchCamera, setIsSpeakerOn, handleHangup,
        forceUpdateTick, remoteUid
    };
};
