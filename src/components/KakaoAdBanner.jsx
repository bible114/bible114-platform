import { useEffect, useRef } from 'react';

const KakaoAdBanner = ({ unitId = 'DAN-BParwOqQnhFQeArp', width = 320, height = 50 }) => {
    const insRef = useRef(null);

    useEffect(() => {
        // ba.min.js가 로드된 후 ins 요소를 직접 초기화
        const tryInit = () => {
            try {
                if (window.kakaoAdFit) {
                    if (typeof window.kakaoAdFit.push === 'function') {
                        window.kakaoAdFit.push({});
                    } else if (typeof window.kakaoAdFit.display === 'function') {
                        window.kakaoAdFit.display(insRef.current);
                    }
                }
            } catch (e) {
                // 광고 초기화 실패는 무시
            }
        };
        tryInit();
        const timer = setTimeout(tryInit, 1500);
        return () => clearTimeout(timer);
    }, [unitId]);

    return (
        <div style={{ width, height, overflow: 'hidden', margin: '0 auto' }}>
            <ins
                ref={insRef}
                className="kakao_ad_area"
                style={{ display: 'none' }}
                data-ad-unit={unitId}
                data-ad-width={String(width)}
                data-ad-height={String(height)}
            />
        </div>
    );
};

export default KakaoAdBanner;
