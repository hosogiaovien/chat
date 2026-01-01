import React, { useRef, useEffect, useState } from 'react';
import { 
    PhoneIcon, VideoCameraIcon, VideoCameraSlashIcon, 
    MicrophoneIcon, SpeakerXMarkIcon, SpeakerWaveIcon,
    ArrowsRightLeftIcon, ArrowPathIcon, UserIcon 
} from '@heroicons/react/24/solid';

interface VideoCallUIProps {
    localStream: MediaStream | null;
    remoteStream: MediaStream | null;
    remoteProfile: { displayName: string; photoURL?: string } | null;
    remoteUid: string | undefined;
    connectionStatus: string;
    activeIsVideo: boolean; 
    isMuted: boolean;
    isCameraOff: boolean;
    isSpeakerOn: boolean;
    forceUpdateTick: number;
    toggleMute: () => void;
    toggleCamera: () => void;
    switchCamera: () => void;
    setIsSpeakerOn: (val: boolean) => void;
    handleHangup: () => void;
}

const VideoCallUI: React.FC<VideoCallUIProps> = ({
    localStream, remoteStream, remoteProfile, remoteUid, connectionStatus,
    isMuted, isCameraOff, isSpeakerOn, forceUpdateTick,
    toggleMute, toggleCamera, switchCamera, setIsSpeakerOn, handleHangup
}) => {
    const localVideoRef = useRef<HTMLVideoElement>(null);
    const remoteVideoRef = useRef<HTMLVideoElement>(null);
    const [isSwapped, setIsSwapped] = useState(false);

    // ATTACH LOCAL STREAM
    useEffect(() => {
        if (localVideoRef.current && localStream) {
            localVideoRef.current.srcObject = localStream;
            localVideoRef.current.muted = true; // Always mute local
        }
    }, [localStream, forceUpdateTick]);

    // ATTACH REMOTE STREAM
    useEffect(() => {
        if (remoteVideoRef.current && remoteStream) {
            remoteVideoRef.current.srcObject = remoteStream;
            remoteVideoRef.current.play().catch(e => console.error("Remote Play Error:", e));
        }
    }, [remoteStream, forceUpdateTick]);

    const remoteDisplayName = remoteProfile?.displayName || remoteUid || "Người dùng";
    const remoteAvatar = remoteProfile?.photoURL;
    
    // Check if video tracks exist and are enabled
    const hasLocalVideo = localStream && localStream.getVideoTracks().some(t => t.readyState === 'live' && t.enabled) && !isCameraOff;
    const hasRemoteVideo = remoteStream && remoteStream.getVideoTracks().some(t => t.readyState === 'live');

    return (
        <div className="fixed inset-0 z-[100] bg-gray-900 flex flex-col overflow-hidden">
            <div className="flex-1 relative w-full h-full bg-gray-900">
                
                {/* --- REMOTE STREAM LAYER --- */}
                <video 
                    ref={remoteVideoRef}
                    autoPlay
                    playsInline
                    className={`absolute transition-all duration-300 object-cover bg-black
                        ${isSwapped 
                            ? 'top-4 right-4 w-32 h-48 md:w-40 md:h-60 rounded-xl border-2 border-gray-700 z-[40] cursor-pointer' 
                            : 'inset-0 w-full h-full z-[10]'
                        }
                    `}
                    onClick={() => isSwapped && setIsSwapped(false)}
                />

                {/* REMOTE AVATAR (If no video) */}
                {!hasRemoteVideo && (
                    <div className={`absolute flex flex-col items-center justify-center bg-gray-800 transition-all duration-300
                        ${isSwapped 
                            ? 'top-4 right-4 w-32 h-48 z-[41] rounded-xl border-2 border-gray-700' 
                            : 'inset-0 z-[20]'
                        }`}
                        onClick={() => isSwapped && setIsSwapped(false)}
                    >
                         <div className={`rounded-full bg-gray-700 flex items-center justify-center text-white font-bold overflow-hidden shadow-2xl ${isSwapped ? 'w-12 h-12 text-sm mb-2' : 'w-32 h-32 md:w-48 md:h-48 text-5xl mb-6 animate-pulse'}`}>
                            {remoteAvatar ? <img src={remoteAvatar} alt="avt" className="w-full h-full object-cover"/> : <span>{remoteDisplayName.charAt(0).toUpperCase()}</span>}
                        </div>
                        {!isSwapped && (
                            <div className="text-center z-10 px-4">
                                <h3 className="text-2xl md:text-3xl font-bold text-white mb-2">{remoteDisplayName}</h3>
                                <p className="text-blue-400 font-medium text-lg">{connectionStatus}</p>
                            </div>
                        )}
                    </div>
                )}

                {/* --- LOCAL STREAM LAYER --- */}
                <video 
                    ref={localVideoRef}
                    autoPlay
                    playsInline
                    muted // CRITICAL: Mute local to prevent feedback
                    className={`absolute transition-all duration-300 object-cover bg-black
                        ${!isSwapped 
                            ? 'top-4 right-4 w-32 h-48 md:w-40 md:h-60 rounded-xl border-2 border-gray-700 z-[40] transform scale-x-[-1] cursor-pointer' 
                            : 'inset-0 w-full h-full z-[10]'
                        }
                    `}
                    onClick={() => !isSwapped && setIsSwapped(true)}
                />

                 {/* LOCAL AVATAR (If no video) */}
                 {!hasLocalVideo && (
                    <div className={`absolute flex items-center justify-center bg-gray-800 transition-all duration-300
                        ${!isSwapped 
                            ? 'top-4 right-4 w-32 h-48 md:w-40 md:h-60 rounded-xl border-2 border-gray-700 z-[41]' 
                            : 'inset-0 z-[20]'
                        }`}
                        onClick={() => !isSwapped && setIsSwapped(true)}
                    >
                         <div className="flex flex-col items-center text-gray-400">
                             <div className="w-12 h-12 bg-gray-600 rounded-full flex items-center justify-center mb-2">
                                <UserIcon className="w-6 h-6 text-white"/>
                            </div>
                            <span className="text-xs font-bold">BẠN</span>
                        </div>
                    </div>
                )}

                {/* TOP BUTTONS */}
                <div className="absolute top-4 left-4 flex flex-col gap-3 z-[60]">
                    <button onClick={() => setIsSwapped(!isSwapped)} className="p-3 bg-black/40 rounded-full text-white hover:bg-black/60 backdrop-blur-sm shadow-lg">
                        <ArrowsRightLeftIcon className="w-6 h-6"/>
                    </button>
                    {!isCameraOff && (
                        <button onClick={switchCamera} className="p-3 bg-black/40 rounded-full text-white hover:bg-black/60 backdrop-blur-sm shadow-lg">
                            <ArrowPathIcon className="w-6 h-6"/>
                        </button>
                    )}
                </div>
            </div>

            {/* CONTROLS */}
            <div className="h-24 bg-gray-900/90 backdrop-blur flex items-center justify-center gap-6 pb-6 pt-2 z-[60] px-4">
                <button onClick={() => setIsSpeakerOn(!isSpeakerOn)} className={`p-3 rounded-full transition ${isSpeakerOn ? 'bg-gray-700 text-white' : 'bg-gray-600 text-gray-400'}`}>
                    {isSpeakerOn ? <SpeakerWaveIcon className="w-6 h-6"/> : <SpeakerXMarkIcon className="w-6 h-6"/>}
                </button>
                <button onClick={toggleCamera} className={`p-3 rounded-full transition ${isCameraOff ? 'bg-white text-black' : 'bg-gray-700 text-white'}`}>
                    {isCameraOff ? <VideoCameraSlashIcon className="w-6 h-6"/> : <VideoCameraIcon className="w-6 h-6"/>}
                </button>
                <button onClick={handleHangup} className="p-4 rounded-full bg-red-600 text-white shadow-lg hover:bg-red-700 transform hover:scale-105 transition">
                    <PhoneIcon className="w-8 h-8 rotate-[135deg]"/>
                </button>
                <button onClick={toggleMute} className={`p-3 rounded-full transition ${isMuted ? 'bg-white text-black' : 'bg-gray-700 text-white'}`}>
                    {isMuted ? <SpeakerXMarkIcon className="w-6 h-6"/> : <MicrophoneIcon className="w-6 h-6"/>}
                </button>
            </div>
        </div>
    );
};

export default VideoCallUI;