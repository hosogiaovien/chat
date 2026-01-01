import React, { useEffect } from 'react';
import { useWebRTC } from '../hooks/useWebRTC';
import VideoCallUI from './VideoCall';
import VoiceCall from './VoiceCall';

interface ActiveCallProps {
    chatId: string;
    currentUserUid: string;
    isCaller: boolean;
    isVideo: boolean;
    onEnd: () => void;
    onMissedCall?: () => void;
    onCallFinished?: (durationMs: number) => void;
}

const ActiveCall: React.FC<ActiveCallProps> = ({ 
    chatId, currentUserUid, isCaller, isVideo, 
    onEnd, onMissedCall, onCallFinished 
}) => {
    
    const {
        localStream, remoteStream, remoteProfile,
        connectionStatus, activeIsVideo,
        isMuted, isCameraOff, isSpeakerOn,
        toggleMute, toggleCamera, switchCamera, setIsSpeakerOn, handleHangup,
        forceUpdateTick, remoteUid
    } = useWebRTC(chatId, currentUserUid, isCaller, isVideo, onEnd, onCallFinished);

    // --- NEW: WAKE LOCK (Giữ màn hình luôn sáng) ---
    useEffect(() => {
        let wakeLock: any = null;

        const requestWakeLock = async () => {
            if ('wakeLock' in navigator) {
                try {
                    // @ts-ignore - Typescript might not recognize wakeLock in all envs yet
                    wakeLock = await navigator.wakeLock.request('screen');
                    console.log('Screen Wake Lock active');
                } catch (err) {
                    console.warn('Wake Lock error:', err);
                }
            }
        };

        requestWakeLock();

        // Re-acquire lock if visibility changes (e.g. user switches tab and comes back)
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                requestWakeLock();
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            if (wakeLock) wakeLock.release();
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, []);

    if (activeIsVideo) {
        return (
            <VideoCallUI 
                localStream={localStream}
                remoteStream={remoteStream}
                remoteProfile={remoteProfile}
                remoteUid={remoteUid}
                connectionStatus={connectionStatus}
                activeIsVideo={activeIsVideo}
                isMuted={isMuted}
                isCameraOff={isCameraOff}
                isSpeakerOn={isSpeakerOn}
                forceUpdateTick={forceUpdateTick}
                toggleMute={toggleMute}
                toggleCamera={toggleCamera}
                switchCamera={switchCamera}
                setIsSpeakerOn={setIsSpeakerOn}
                handleHangup={handleHangup}
            />
        );
    }

    return (
        <VoiceCall 
            remoteStream={remoteStream} 
            remoteProfile={remoteProfile}
            remoteUid={remoteUid}
            connectionStatus={connectionStatus}
            isMuted={isMuted}
            isSpeakerOn={isSpeakerOn}
            toggleMute={toggleMute}
            toggleCamera={toggleCamera}
            setIsSpeakerOn={setIsSpeakerOn}
            handleHangup={handleHangup}
        />
    );
};

export default ActiveCall;
