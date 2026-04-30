import { useState } from 'react';
import { auth, db, firebase } from '../utils/firebase';
import { makePseudoEmail, userDocToState } from '../utils/helpers';
import { sha256 } from '../utils/crypto';

export const useAuth = ({
    setCurrentUser,
    setTempUser,
    setView,
    setHasReadToday,
    setChurchCommunities,
    loadChurchCommunities,
    loadSuperAdminData,
}) => {
    const [errorMsg, setErrorMsg] = useState('');

    // ── 교인 로그인 ──
    const handleMemberLogin = async (name, birthdate, pw, churchId) => {
        setErrorMsg('');
        try {
            // 신 포맷(이름+생년월일+교회ID) 시도 → 실패 시 구 포맷으로 마이그레이션
            const newEmail = makePseudoEmail(name, birthdate, churchId);
            const oldEmail = makePseudoEmail(name, birthdate);
            let cred = await auth.signInWithEmailAndPassword(newEmail, pw).catch(() => null);

            if (!cred) {
                // 구 포맷으로 재시도 (기존 계정 마이그레이션)
                cred = await auth.signInWithEmailAndPassword(oldEmail, pw).catch(async err => {
                    if (['auth/user-not-found', 'auth/invalid-login-credentials', 'auth/invalid-credential'].includes(err?.code)) {
                        setErrorMsg('등록되지 않은 사용자입니다. 회원가입 후 이용해주세요.');
                    } else if (err?.code === 'auth/wrong-password') {
                        setErrorMsg('비밀번호가 틀렸습니다.');
                    } else {
                        setErrorMsg('로그인 실패. 잠시 후 다시 시도해주세요.');
                    }
                    return null;
                });
                // 구 포맷 로그인 성공 시 신 포맷으로 이메일 업데이트
                if (cred) {
                    await cred.user.updateEmail(newEmail).catch(() => {});
                }
            }
            if (!cred) return;
            const doc = await db.collection('users').doc(cred.user.uid).get();
            if (!doc.exists) { setErrorMsg('사용자 정보를 찾을 수 없습니다.'); return; }
            const user = userDocToState(doc);
            setCurrentUser(user);
            setHasReadToday(user.lastReadDate === new Date().toDateString());
            if (user.churchId) await loadChurchCommunities(user.churchId);
            if (!user.departmentId || !user.subgroupId) { setTempUser(user); setView('plan_type_select'); }
            else setView('dashboard');
        } catch (err) {
            console.error(err);
            setErrorMsg('로그인 처리 중 오류가 발생했습니다.');
        }
    };

    // ── 교회 관리자 / 슈퍼 관리자 로그인 ──
    const handleChurchAdminLogin = async (email, pw) => {
        setErrorMsg('');
        try {
            const cred = await auth.signInWithEmailAndPassword(email, pw).catch(err => {
                if (['auth/user-not-found', 'auth/invalid-login-credentials', 'auth/invalid-credential'].includes(err?.code)) {
                    setErrorMsg('등록되지 않은 이메일입니다.');
                } else if (err?.code === 'auth/wrong-password') {
                    setErrorMsg('비밀번호가 틀렸습니다.');
                } else {
                    setErrorMsg('로그인 실패. 잠시 후 다시 시도해주세요.');
                }
                return null;
            });
            if (!cred) return;
            const doc = await db.collection('users').doc(cred.user.uid).get();
            if (!doc.exists) { setErrorMsg('사용자 정보를 찾을 수 없습니다.'); return; }
            const user = userDocToState(doc);

            if (user.role === 'superAdmin' || user.role === 'platformAdmin') {
                setCurrentUser(user);
                await loadSuperAdminData();
                return;
            }

            setCurrentUser(user);
            setHasReadToday(user.lastReadDate === new Date().toDateString());
            if (user.churchId) await loadChurchCommunities(user.churchId);
            setView('dashboard');
        } catch (err) {
            console.error(err);
            setErrorMsg('로그인 처리 중 오류가 발생했습니다.');
        }
    };

    // ── 교인 가입 ──
    const handleMemberSignup = async ({ name, birthdate, password, churchId, churchCode }) => {
        setErrorMsg('');
        try {
            // 교회 입장코드 확인
            const churchDoc = await db.collection('churches').doc(churchId).get();
            if (!churchDoc.exists) { setErrorMsg('교회를 찾을 수 없습니다.'); return; }
            const storedHash = churchDoc.data().churchCodeHash;
            if (storedHash) {
                const inputHash = await sha256(churchCode);
                if (storedHash !== inputHash) { setErrorMsg('교회 입장코드가 틀렸습니다.'); return; }
            } else {
                if (churchDoc.data().churchCode !== churchCode) { setErrorMsg('교회 입장코드가 틀렸습니다.'); return; }
            }

            const churchName = churchDoc.data().name;
            const email = makePseudoEmail(name, birthdate, churchId);
            const cred = await auth.createUserWithEmailAndPassword(email, password).catch(err => {
                if (err?.code === 'auth/email-already-in-use') setErrorMsg('이미 가입된 이름+생년월일입니다. 로그인해주세요.');
                else if (err?.code === 'auth/weak-password') setErrorMsg('비밀번호는 6자리 이상이어야 합니다.');
                else setErrorMsg('가입 실패. 잠시 후 다시 시도해주세요.');
                return null;
            });
            if (!cred) return;

            const newUser = {
                name, birthdate, password, email,
                role: 'member', churchId, churchName,
                startDate: new Date().toDateString(),
                currentDay: 1, streak: 0, score: 0, readCount: 1,
                lastReadDate: null, gender: 'male', planId: '1year_revised',
                departmentId: null, departmentName: null, subgroupId: null,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            };
            await db.collection('users').doc(cred.user.uid).set(newUser);
            await loadChurchCommunities(churchId);
            setTempUser({ ...newUser, uid: cred.user.uid });
            setView('plan_type_select');
        } catch (err) {
            console.error(err);
            setErrorMsg('가입 처리 중 오류가 발생했습니다.');
        }
    };

    // ── 교회 관리자 가입 ──
    const handleChurchAdminSignup = async ({ name, email, password, churchName, churchCode, departments }) => {
        setErrorMsg('');
        try {
            const cred = await auth.createUserWithEmailAndPassword(email, password).catch(err => {
                if (err?.code === 'auth/email-already-in-use') setErrorMsg('이미 사용 중인 이메일입니다.');
                else if (err?.code === 'auth/weak-password') setErrorMsg('비밀번호는 6자리 이상이어야 합니다.');
                else setErrorMsg('가입 실패. 잠시 후 다시 시도해주세요.');
                return null;
            });
            if (!cred) return;

            // 교회 문서 생성
            const churchRef = db.collection('churches').doc();
            const churchCodeHash = await sha256(churchCode);
            await churchRef.set({
                name: churchName, churchCodeHash, adminUid: cred.user.uid, adminEmail: email,
                departments: departments || [],
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            });
            setChurchCommunities(departments || []);

            const newUser = {
                name, email, password, birthdate: null,
                role: 'churchAdmin', churchId: churchRef.id, churchName,
                startDate: new Date().toDateString(),
                currentDay: 1, streak: 0, score: 0, readCount: 1,
                lastReadDate: null, gender: 'male', planId: '1year_revised',
                departmentId: null, departmentName: null, subgroupId: null,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            };
            await db.collection('users').doc(cred.user.uid).set(newUser);
            setTempUser({ ...newUser, uid: cred.user.uid });
            setView('plan_type_select');
        } catch (err) {
            console.error(err);
            setErrorMsg('가입 처리 중 오류가 발생했습니다.');
        }
    };

    return {
        errorMsg,
        setErrorMsg,
        handleMemberLogin,
        handleMemberSignup,
        handleChurchAdminLogin,
        handleChurchAdminSignup,
    };
};
