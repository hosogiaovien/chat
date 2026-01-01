import React, { useEffect, useRef } from 'react';
import { 
    PhoneIcon, VideoCameraIcon, MicrophoneIcon, 
    SpeakerXMarkIcon, SpeakerWaveIcon, UserIcon 
} from '@heroicons/react/24/solid';

interface VoiceCallProps {
    remoteStream: MediaStream | null; 
    remoteProfile: { displayName: string; photoURL?: string } | null;
    remoteUid: string | undefined;
    connectionStatus: string;
    isMuted: boolean;
    isSpeakerOn: boolean;
    toggleMute: () => void;
    toggleCamera: () => void;
    setIsSpeakerOn: (val: boolean) => void;
    handleHangup: () => void;
}

const VoiceCall: React.FC<VoiceCallProps> = ({
    remoteStream, remoteProfile, remoteUid, connectionStatus,
    isMuted, isSpeakerOn, toggleMute, toggleCamera, setIsSpeakerOn, handleHangup
}) => {
    const remoteDisplayName = remoteProfile?.displayName || remoteUid || "Người dùng";
    const remoteAvatar = remoteProfile?.photoURL;
    const audioRef = useRef<HTMLAudioElement>(null);

    useEffect(() => {
        if (audioRef.current && remoteStream) {
            audioRef.current.srcObject = remoteStream;
            audioRef.current.play().catch(e => console.warn("Audio play error:", e));
        }
    }, [remoteStream]);

    return (
        <div className="fixed inset-0 z-[100] bg-gray-900 flex flex-col items-center justify-between py-12 px-6 overflow-hidden">
            {/* HIDDEN AUDIO ELEMENT TO PLAY SOUND */}
            <audio ref={audioRef} autoPlay playsInline controls={false} />

            {/* BACKGROUND */}
            {remoteAvatar && (
                <div 
                    className="absolute inset-0 z-0 opacity-20 blur-3xl transform scale-125"
                    style={{ backgroundImage: `url(${remoteAvatar})`, backgroundPosition: 'center', backgroundSize: 'cover' }}
                />
            )}

            {/* INFO */}
            <div className="z-10 flex flex-col items-center mt-10">
                <div className="w-32 h-32 md:w-40 md:h-40 rounded-full border-4 border-gray-700 shadow-2xl overflow-hidden mb-6 bg-gray-800 flex items-center justify-center animate-pulse-slow">
                    {remoteAvatar ? (
                        <img src={remoteAvatar} alt="avatar" className="w-full h-full object-cover" />
                    ) : (
                        <UserIcon className="w-16 h-16 text-gray-500" />
                    )}
                </div>
                <h2 className="text-3xl font-bold text-white mb-2 text-center">{remoteDisplayName}</h2>
                <p className="text-blue-400 text-lg font-medium animate-pulse">{connectionStatus}</p>
            </div>

            {/* CONTROLS */}
            <div className="z-10 w-full max-w-sm">
                <div className="bg-gray-800/80 backdrop-blur-md rounded-3xl p-6 shadow-xl border border-gray-700">
                    <div className="grid grid-cols-3 gap-6 mb-6">
                        <button onClick={() => setIsSpeakerOn(!isSpeakerOn)} className={`flex flex-col items-center gap-2 p-3 rounded-xl transition ${isSpeakerOn ? 'bg-white text-gray-900' : 'bg-gray-700 text-white hover:bg-gray-600'}`}>
                            {isSpeakerOn ? <SpeakerWaveIcon className="w-6 h-6"/> : <SpeakerXMarkIcon className="w-6 h-6"/>}
                            <span className="text-xs font-bold">Loa</span>
                        </button>
                        
                        <button onClick={toggleCamera} className="flex flex-col items-center gap-2 p-3 rounded-xl bg-gray-700 text-white hover:bg-gray-600 transition">
                            <VideoCameraIcon className="w-6 h-6"/>
                            <span className="text-xs font-bold">Video</span>
                        </button>
                        
                        <button onClick={toggleMute} className={`flex flex-col items-center gap-2 p-3 rounded-xl transition ${isMuted ? 'bg-white text-gray-900' : 'bg-gray-700 text-white hover:bg-gray-600'}`}>
                            {isMuted ? <SpeakerXMarkIcon className="w-6 h-6"/> : <MicrophoneIcon className="w-6 h-6"/>}
                            <span className="text-xs font-bold">{isMuted ? 'Bật mic' : 'Tắt mic'}</span>
                        </button>
                    </div>
                    
                    <button onClick={handleHangup} className="w-full py-4 bg-red-600 hover:bg-red-700 text-white rounded-2xl shadow-lg font-bold text-lg flex items-center justify-center gap-2 transition transform hover:scale-[1.02]">
                        <PhoneIcon className="w-6 h-6 rotate-[135deg]"/>
                        Kết thúc
                    </button>
                </div>
            </div>
        </div>
    );
};

export default VoiceCall;