import { auth } from './firebase.js';

// platformApi의 순수 유틸리티를 Node 검증에서도 불러올 수 있도록 Firebase Auth는
// 실제 API 호출 시점에만 이 브라우저 전용 경계를 통해 초기화한다.
export const getPlatformAuth = () => auth;
