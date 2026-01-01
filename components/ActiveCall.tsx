import React from 'react';
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
            remoteStream={remoteStream} // FIX: Pass remote stream to enable audio
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