import React from 'react';
import { KAKAO_CHANNEL_URL } from '../../data/constants';

const KakaoChannelButton = ({ kakaoLink }) => {
    const chatUrl = kakaoLink || KAKAO_CHANNEL_URL;

    const handleClick = () => {
        if (chatUrl) {
            window.open(chatUrl, '_blank', 'noopener,noreferrer');
        }
    };

    if (!chatUrl || chatUrl.includes('_xxxx')) return null;

    return (
        <button
            onClick={handleClick}
            className="fixed bottom-6 right-6 z-[100] w-14 h-14 bg-[#FEE500] rounded-full shadow-lg hover:shadow-xl hover:scale-110 active:scale-95 transition-all duration-300 flex items-center justify-center group overflow-hidden"
            aria-label="카카오톡 상담하기"
        >
            {/* Kakao Speech Bubble Icon (Simple SVG Implementation) */}
            <svg
                viewBox="0 0 24 24"
                className="w-8 h-8 text-[#3c1e1e]"
                fill="currentColor"
            >
                <path d="M12 3c-5.523 0-10 3.582-10 8c0 2.864 1.8 5.374 4.545 6.822l-.545 2.178c-.05.2.15.35.3.25l2.75-1.833c.915.253 1.895.383 2.95.383 5.523 0 10-3.582 10-8s-4.477-8-10-8z" />
            </svg>

            {/* Subtle pulsate effect */}
            <span className="absolute inset-0 rounded-full border-4 border-[#FEE500] animate-ping opacity-20 pointer-events-none group-hover:hidden"></span>
        </button>
    );
};

export default KakaoChannelButton;
