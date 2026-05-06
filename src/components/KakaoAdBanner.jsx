import { useEffect, useRef } from 'react';

const KakaoAdBanner = ({ unitId = 'DAN-BParwOqQnhFQeArp', width = 320, height = 50 }) => {
    const ref = useRef(null);

    useEffect(() => {
        if (!ref.current) return;
        // 이미 광고가 삽입된 경우 중복 방지
        if (ref.current.querySelector('ins')) return;

        const ins = document.createElement('ins');
        ins.className = 'kakao_ad_area';
        ins.style.display = 'none';
        ins.setAttribute('data-ad-unit', unitId);
        ins.setAttribute('data-ad-width', String(width));
        ins.setAttribute('data-ad-height', String(height));
        ref.current.appendChild(ins);

        // ba.min.js가 로드된 후 광고 초기화
        const tryInit = () => {
            try {
                if (window.kakaoAdFit && typeof window.kakaoAdFit.push === 'function') {
                    window.kakaoAdFit.push({});
                }
            } catch (e) {
                // 광고 초기화 실패는 무시 (앱 크래시 방지)
            }
        };
        tryInit();
        const timer = setTimeout(tryInit, 1500);
        return () => clearTimeout(timer);
    }, [unitId, width, height]);

    return (
        <div
            ref={ref}
            style={{ width, height, overflow: 'hidden', margin: '0 auto' }}
        />
    );
};

export default KakaoAdBanner;
