import { useState } from 'react';
import { auth, authReady, db, firebase } from '../utils/firebase';
import { makePseudoEmail, userDocToState, migrateTalentIfNeeded } from '../utils/helpers';
import { sha256 } from '../utils/crypto';
import { getChurchDirectory, addChurchToDirectory, saveLastChurch } from '../utils/churchDirectory';

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

    const buildNewMember = ({ name, birthdate, password, email, churchId, churchName }) => ({
        name, birthdate, password, email,
        role: 'member', churchId, churchName,
        startDate: new Date().toDateString(),
        currentDay: 1, streak: 0, score: 0, talent: 0, talentMigrated: true, readCount: 1,
        lastReadDate: null, gender: 'male', planId: '1year_revised',
        departmentId: null, departmentName: null, subgroupId: null,
        isDeleted: false, deletedAt: null, deletedBy: null,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });

    const finishMemberSignup = async ({ user, newUser, churchId }) => {
        setErrorMsg('');
        await db.collection('users').doc(user.uid).set(newUser);
        // 신규 성도 → 통계 증가
        db.collection('settings').doc('platformStats').set({
            total_readers: firebase.firestore.FieldValue.increment(1),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        }, { merge: true }).catch(() => {});
        await loadChurchCommunities(churchId);
        setTempUser({ ...newUser, uid: user.uid });
        setView('plan_type_select');
    };

    // ── 교인 로그인 ──
    const handleMemberLogin = async (name, birthdate, pw, churchId) => {
        setErrorMsg('');
        try {
            await authReady;
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
            if (doc.data().isDeleted) { setErrorMsg('삭제 처리된 계정입니다. 교회 관리자에게 복원을 요청해주세요.'); return; }
            const user = userDocToState(doc);
            // [점수 이중화] talent 지갑 지연 마이그레이션 (1회성) — 대시보드 진입 전에 완료해 잔액 미표시 방지
            const migrated = await migrateTalentIfNeeded(cred.user.uid, doc.data());
            if (migrated) {
                user.talent = migrated.talent;
                user.score = migrated.score;
                user.talentMigrated = true;
            }
            setCurrentUser(user);
            setHasReadToday(user.lastReadDate === new Date().toDateString());
            if (user.churchId) await loadChurchCommunities(user.churchId);
            // [Phase 3] 로그인 성공 → 다음 방문에서 교회 자동 선택되도록 최근 교회 기억
            if (user.churchId && user.churchName) {
                saveLastChurch({ id: user.churchId, name: user.churchName });
            }
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
            await authReady;
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
            // [점수 이중화] talent 지갑 지연 마이그레이션 (1회성)
            const migrated = await migrateTalentIfNeeded(cred.user.uid, doc.data());
            if (migrated) {
                user.talent = migrated.talent;
                user.score = migrated.score;
                user.talentMigrated = true;
            }

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
    // [Phase 3] churches/{churchId} 문서는 비로그인 상태에서 더 이상 읽지 않는다
    // (firestore.rules: churches read는 isSignedIn() 필요). 대신 공개된
    // settings/churchDirectory 의 codeHash로 입장코드를 클라이언트에서 검증한다.
    // → Firebase Auth 계정 생성 전에 실패시키므로 가입 실패 시 롤백이 불필요하다.
    const handleMemberSignup = async ({ name, birthdate, password, churchId, churchCode }) => {
        setErrorMsg('');
        try {
            await authReady;
            // 교회 입장코드 확인 (디렉토리 문서 — 미인증 공개 read)
            const directory = await getChurchDirectory();
            const churchEntry = directory.find(c => c.id === churchId);
            if (!churchEntry) { setErrorMsg('교회를 찾을 수 없습니다.'); return; }
            if (!churchEntry.codeHash) { setErrorMsg('교회 입장코드 정보를 확인할 수 없습니다. 교회 관리자에게 문의해주세요.'); return; }
            const inputHash = await sha256(churchCode);
            if (churchEntry.codeHash !== inputHash) { setErrorMsg('교회 입장코드가 틀렸습니다.'); return; }

            const churchName = churchEntry.name;
            const email = makePseudoEmail(name, birthdate, churchId);
            let signupErrorCode = null;
            let cred = await auth.createUserWithEmailAndPassword(email, password).catch(err => {
                signupErrorCode = err?.code || 'unknown';
                if (err?.code === 'auth/email-already-in-use') setErrorMsg('이미 가입된 이름+생년월일입니다. 로그인해주세요.');
                else if (err?.code === 'auth/weak-password') setErrorMsg('비밀번호는 6자리 이상이어야 합니다.');
                else setErrorMsg('가입 실패. 잠시 후 다시 시도해주세요.');
                return null;
            });
            const newUser = buildNewMember({ name, birthdate, password, email, churchId, churchName });

            if (cred) {
                await finishMemberSignup({ user: cred.user, newUser, churchId });
                return;
            }

            if (signupErrorCode !== 'auth/email-already-in-use') return;

            // 무료 플랜에서는 삭제를 isDeleted 처리한다.
            // 같은 계정으로 재가입하면 기존 비밀번호로 로그인해 문서를 재활성화한다.
            const orphanCred = await auth.signInWithEmailAndPassword(email, password).catch(() => null);
            if (!orphanCred) {
                setErrorMsg('이미 가입된 이름+생년월일입니다. 기존 비밀번호로 로그인하거나 교회 관리자에게 복원을 요청해주세요.');
                return;
            }

            const existingDoc = await db.collection('users').doc(orphanCred.user.uid).get();
            if (existingDoc.exists) {
                if (existingDoc.data().isDeleted) {
                    await finishMemberSignup({ user: orphanCred.user, newUser, churchId });
                    return;
                }
                setErrorMsg('이미 가입된 이름+생년월일입니다. 로그인해주세요.');
                return;
            }

            await finishMemberSignup({ user: orphanCred.user, newUser, churchId });
        } catch (err) {
            console.error(err);
            setErrorMsg('가입 처리 중 오류가 발생했습니다.');
        }
    };

    // ── 교회 관리자 가입 ──
    const handleChurchAdminSignup = async ({ name, email, password, churchName, pastorName, denomination, churchCode, departments }) => {
        setErrorMsg('');
        try {
            await authReady;
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
                name: churchName, pastorName: pastorName || '', denomination: denomination || '',
                churchCodeHash, adminUid: cred.user.uid, adminEmail: email,
                departments: departments || [],
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            });
            setChurchCommunities(departments || []);
            // [Phase 3] 공개 교회 디렉토리에 신규 교회 등록 (로그인 화면 검색용)
            await addChurchToDirectory({ id: churchRef.id, name: churchName, codeHash: churchCodeHash }).catch(err => {
                console.error('교회 디렉토리 등록 실패:', err);
            });

            const newUser = {
                name, email, password, birthdate: null,
                role: 'churchAdmin', churchId: churchRef.id, churchName,
                startDate: new Date().toDateString(),
                currentDay: 1, streak: 0, score: 0, talent: 0, talentMigrated: true, readCount: 1,
                lastReadDate: null, gender: 'male', planId: '1year_revised',
                departmentId: null, departmentName: null, subgroupId: null,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            };
            await db.collection('users').doc(cred.user.uid).set(newUser);
            // 신규 교회 + 관리자 → 통계 증가
            db.collection('settings').doc('platformStats').set({
                total_churches: firebase.firestore.FieldValue.increment(1),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            }, { merge: true }).catch(() => {});
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
