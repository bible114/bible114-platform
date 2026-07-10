import React from 'react';
import Icon from './Icon';
import { firebase } from '../utils/firebase';
import ChurchAdminView from './ChurchAdminView';
import { fetchLatestFromPlaylist } from './dashboard/DailyVideoCard';
import { getVideoDateKST, parseAndMapChapters, extractYouTubePlaylistId } from '../utils/helpers';
import { rebuildChurchDirectory, removeChurchFromDirectory, syncChurchDirectoryEntry } from '../utils/churchDirectory';
import { sha256 } from '../utils/crypto';
import { UNAFFILIATED_CHURCH_ID, UNAFFILIATED_CHURCH_NAME } from '../data/constants';
import { migrateCredentialsIfNeeded, fetchMemberCredentials } from '../utils/memberCredentials';

const PlatformAdminView = ({
    handleLogout,
    downloadCSV,
    adminSortBy, setAdminSortBy,
    allUsers,
    allChurches,
    DEFAULT_DEPARTMENTS,
    BIBLE_VERSIONS,
    announcementInput, setAnnouncementInput,
    saveAnnouncement,
    editingUser, setEditingUser,
    startEditUser, saveEditUser,
    changingPassword, setChangingPassword,
    newPassword, setNewPassword,
    changePassword,
    deleteUser,
    lastSyncInfo, setLastSyncInfo,
    syncProgress, setSyncProgress,
    selectedSyncVersions, setSelectedSyncVersions,
    syncNotionToFirestore,
    adminStats,
    kakaoLinkInput, setKakaoLinkInput,
    saveKakaoLink,
    downloadPeriodStatsCSV,
    db
}) => {
    const [tab, setTab] = React.useState('overview');
    const [startDate, setStartDate] = React.useState('');
    const [endDate, setEndDate] = React.useState('');
    const [selectedChurchId, setSelectedChurchId] = React.useState(null);
    const [announcementChurchId, setAnnouncementChurchId] = React.useState('');
    const [seedingData, setSeedingData] = React.useState(false);
    const [statsRefreshing, setStatsRefreshing] = React.useState(false);
    const [confirmDelete, setConfirmDelete] = React.useState(null); // { type: 'church'|'user', target }
    const [deleteUserConfirm, setDeleteUserConfirm] = React.useState(null); // { uid, name }
    const [viewingChurchAsAdmin, setViewingChurchAsAdmin] = React.useState(false);
    // 검색 숨김 토글의 낙관적 반영 (allChurches는 prop이라 로컬 오버라이드로 관리)
    const [hiddenOverrides, setHiddenOverrides] = React.useState({});
    const [hiddenToggling, setHiddenToggling] = React.useState(false);
    const [platformKakaoInput, setPlatformKakaoInput] = React.useState('');
    const [savingPlatformKakao, setSavingPlatformKakao] = React.useState(false);
    const [directoryRebuilding, setDirectoryRebuilding] = React.useState(false);
    const [checkingUnaffiliatedChurch, setCheckingUnaffiliatedChurch] = React.useState(false);
    const [fetchedCurrentPassword, setFetchedCurrentPassword] = React.useState(null); // changingPassword 모달에서 조회한 현재 암호
    const [credentialMigrating, setCredentialMigrating] = React.useState(false);
    const [credentialMigrationProgress, setCredentialMigrationProgress] = React.useState({ done: 0, total: 0 });
    const [talentResetting, setTalentResetting] = React.useState(false);
    const [talentResetProgress, setTalentResetProgress] = React.useState({ done: 0, total: 0 });
    const [copiedLinkChurchId, setCopiedLinkChurchId] = React.useState(null);
    const pendingCredentialMigration = React.useMemo(() => (
        (allUsers || []).filter(u => typeof u.password === 'string' && u.password.length > 0).length
    ), [allUsers]);

    // 매일 영상 관리
    const nextVideoDate = React.useMemo(() => {
        const d = new Date(getVideoDateKST() + 'T00:00:00Z');
        d.setUTCDate(d.getUTCDate() + 1);
        return d.toISOString().slice(0, 10);
    }, []);
    const [videoDate, setVideoDate] = React.useState(nextVideoDate);
    const [adultUrl, setAdultUrl] = React.useState('');
    const [adultDesc, setAdultDesc] = React.useState('');
    const [adultChapters, setAdultChapters] = React.useState([]);
    const [kidsUrl, setKidsUrl] = React.useState('');
    const [kidsDesc, setKidsDesc] = React.useState('');
    const [kidsChapters, setKidsChapters] = React.useState([]);
    const [savingVideo, setSavingVideo] = React.useState(false);
    const [videoList, setVideoList] = React.useState([]);
    const [loadingVideoList, setLoadingVideoList] = React.useState(false);

    // 매일 영상 자동화 설정 (settings/videoAutoConfig)
    const [autoApiKey, setAutoApiKey] = React.useState('');
    const [autoAdultPlaylist, setAutoAdultPlaylist] = React.useState('');
    const [autoKidsPlaylist, setAutoKidsPlaylist] = React.useState('');
    const [autoEnabled, setAutoEnabled] = React.useState(false);
    const [loadingAutoConfig, setLoadingAutoConfig] = React.useState(false);
    const [savingAutoConfig, setSavingAutoConfig] = React.useState(false);
    const [testingConnection, setTestingConnection] = React.useState(false);
    const [connectionTestResult, setConnectionTestResult] = React.useState(null); // { ok: bool, message: string }

    React.useEffect(() => {
        if (tab !== 'dailyVideo' || !db) return;
        setLoadingAutoConfig(true);
        db.collection('settings').doc('videoAutoConfig').get()
            .then(doc => {
                if (!doc.exists) return;
                const d = doc.data();
                setAutoApiKey(d.apiKey || '');
                setAutoAdultPlaylist(d.adultPlaylistId || '');
                setAutoKidsPlaylist(d.kidsPlaylistId || '');
                setAutoEnabled(!!d.enabled);
            })
            .catch(e => console.error('videoAutoConfig 로드 실패:', e))
            .finally(() => setLoadingAutoConfig(false));
    }, [tab, db]);

    const saveAutoConfig = async () => {
        if (!db) return;
        setSavingAutoConfig(true);
        try {
            await db.collection('settings').doc('videoAutoConfig').set({
                apiKey: autoApiKey.trim(),
                adultPlaylistId: extractYouTubePlaylistId(autoAdultPlaylist) || '',
                kidsPlaylistId: autoKidsPlaylist.trim() ? extractYouTubePlaylistId(autoKidsPlaylist) : null,
                enabled: autoEnabled,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
            // 입력창에도 추출된 순수 ID를 반영
            setAutoAdultPlaylist(extractYouTubePlaylistId(autoAdultPlaylist) || '');
            if (autoKidsPlaylist.trim()) setAutoKidsPlaylist(extractYouTubePlaylistId(autoKidsPlaylist) || '');
            alert('자동화 설정이 저장되었습니다.');
        } catch (e) {
            alert('저장 실패: ' + e.message);
        } finally {
            setSavingAutoConfig(false);
        }
    };

    const testAutoConnection = async () => {
        setTestingConnection(true);
        setConnectionTestResult(null);
        try {
            const apiKey = autoApiKey.trim();
            const adultPlaylistId = extractYouTubePlaylistId(autoAdultPlaylist);
            const kidsPlaylistId = autoKidsPlaylist.trim() ? extractYouTubePlaylistId(autoKidsPlaylist) : null;
            if (!apiKey || !adultPlaylistId) {
                setConnectionTestResult({ ok: false, message: 'API 키와 성인용 재생목록을 먼저 입력해주세요.' });
                return;
            }
            const targetDateKey = getVideoDateKST();
            const targets = [
                ['성인용', adultPlaylistId],
                ['어린이용', kidsPlaylistId],
            ].filter(([, playlistId]) => !!playlistId);
            const previews = await Promise.all(targets.map(async ([label, playlistId]) => {
                try {
                    const entry = await fetchLatestFromPlaylist(playlistId, apiKey, targetDateKey);
                    return { label, ok: true, entry };
                } catch (e) {
                    return { label, ok: false, error: e.message };
                }
            }));
            const failed = previews.filter(p => !p.ok);
            setConnectionTestResult({
                ok: failed.length === 0,
                message: failed.length === 0
                    ? `${targetDateKey} 기준 선택 미리보기 완료`
                    : `${failed.map(p => p.label).join(', ')} 확인 실패`,
                previews,
            });
        } catch (e) {
            setConnectionTestResult({ ok: false, message: e.message });
        } finally {
            setTestingConnection(false);
        }
    };

    const loadVideoList = React.useCallback(async () => {
        if (!db) return;
        setLoadingVideoList(true);
        try {
            const today = new Date(getVideoDateKST() + 'T00:00:00Z');
            const dates = [];
            for (let i = -7; i <= 7; i++) {
                const d = new Date(today);
                d.setUTCDate(d.getUTCDate() + i);
                dates.push(d.toISOString().slice(0, 10));
            }
            const docs = await Promise.all(dates.map(id => db.collection('dailyVideos').doc(id).get()));
            setVideoList(docs.map((doc, idx) => ({ date: dates[idx], data: doc.exists ? doc.data() : null })));
        } catch (e) {
            console.error(e);
        } finally {
            setLoadingVideoList(false);
        }
    }, [db]);

    React.useEffect(() => {
        if (tab === 'dailyVideo') loadVideoList();
    }, [tab, loadVideoList]);

    const handleAdultDescChange = (val) => {
        setAdultDesc(val);
        setAdultChapters(parseAndMapChapters(val));
    };
    const handleKidsDescChange = (val) => {
        setKidsDesc(val);
        setKidsChapters(parseAndMapChapters(val));
    };

    const updateChapterField = (which, idx, field, value) => {
        const setter = which === 'adult' ? setAdultChapters : setKidsChapters;
        setter(prev => prev.map((c, i) => i === idx ? { ...c, [field]: field === 'sec' ? (parseInt(value) || 0) : value } : c));
    };
    const removeChapter = (which, idx) => {
        const setter = which === 'adult' ? setAdultChapters : setKidsChapters;
        setter(prev => prev.filter((_, i) => i !== idx));
    };

    const saveDailyVideo = async () => {
        if (!db) return;
        if (!videoDate) { alert('날짜를 선택해주세요.'); return; }
        if (!adultUrl && !kidsUrl) { alert('성인용 또는 어린이용 URL 중 하나는 입력해주세요.'); return; }
        setSavingVideo(true);
        try {
            const payload = {
                adult: adultUrl ? { url: adultUrl, chapters: adultChapters } : null,
                kids: kidsUrl ? { url: kidsUrl, chapters: kidsChapters } : null,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                autoFilled: false, // 수동 등록/수정 = 자동 채움 캐시에 대한 오버라이드
            };
            await db.collection('dailyVideos').doc(videoDate).set(payload, { merge: true });
            alert(`${videoDate} 영상이 저장되었습니다.`);
            setAdultUrl(''); setAdultDesc(''); setAdultChapters([]);
            setKidsUrl(''); setKidsDesc(''); setKidsChapters([]);
            loadVideoList();
        } catch (e) {
            alert('저장 실패: ' + e.message);
        } finally {
            setSavingVideo(false);
        }
    };

    const deleteDailyVideo = async (date) => {
        if (!db) return;
        if (!confirm(`${date} 영상 등록을 삭제하시겠습니까?`)) return;
        try {
            await db.collection('dailyVideos').doc(date).delete();
            loadVideoList();
        } catch (e) {
            alert('삭제 실패: ' + e.message);
        }
    };

    React.useEffect(() => {
        if (!db) return;
        db.collection('settings').doc('platform').get().then(doc => {
            if (doc.exists) setPlatformKakaoInput(doc.data().kakaoUrl || '');
        });
    }, [db]);

    // 암호 변경 모달을 열 때, 본문서 password가 이미 null 마커로 이관되었다면 private 하위문서에서 조회한다.
    React.useEffect(() => {
        if (!changingPassword?.uid) { setFetchedCurrentPassword(null); return; }
        if (typeof changingPassword.password === 'string' && changingPassword.password) {
            setFetchedCurrentPassword(null);
            return;
        }
        setFetchedCurrentPassword('__loading__');
        fetchMemberCredentials(changingPassword.uid)
            .then(data => setFetchedCurrentPassword(data?.password || null))
            .catch(() => setFetchedCurrentPassword('__error__'));
    }, [changingPassword?.uid]);

    const savePlatformKakao = async () => {
        if (!db) return;
        setSavingPlatformKakao(true);
        try {
            await db.collection('settings').doc('platform').set({
                kakaoUrl: platformKakaoInput,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
            alert('플랫폼 문의 카카오 링크가 저장되었습니다!');
        } catch (e) {
            alert('저장 실패: ' + e.message);
        }
        setSavingPlatformKakao(false);
    };

    const refreshPlatformStats = async () => {
        if (!db) return;
        setStatsRefreshing(true);
        try {
            const today = new Date().toDateString();
            const [churchSnap, userSnap] = await Promise.all([
                db.collection('churches').get(),
                db.collection('users').where('role', '!=', 'churchAdmin').get(),
            ]);
            const users = userSnap.docs.map(d => d.data()).filter(u => !u.isDeleted);
            await db.collection('settings').doc('platformStats').set({
                total_churches: churchSnap.size,
                total_readers: users.length,
                finished_total: users.filter(u => (u.readCount || 1) >= 2).length,
                readers_today: users.filter(u => u.lastReadDate === today).length,
                today_date: today,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            });
            alert(`통계 갱신 완료!\n교회 ${churchSnap.size}개 / 성도 ${users.length}명`);
        } catch (e) {
            alert('갱신 실패: ' + e.message);
        } finally {
            setStatsRefreshing(false);
        }
    };

    const handleRebuildDirectory = async () => {
        if (!db) return;
        setDirectoryRebuilding(true);
        try {
            const count = await rebuildChurchDirectory();
            alert(`✅ 교회 디렉토리 재생성 완료! (${count}개 교회)`);
        } catch (e) {
            alert('디렉토리 재생성 실패: ' + e.message);
        } finally {
            setDirectoryRebuilding(false);
        }
    };

    const handleEnsureUnaffiliatedChurch = async () => {
        if (!db) return;
        setCheckingUnaffiliatedChurch(true);
        try {
            await db.collection('churches').doc(UNAFFILIATED_CHURCH_ID).set({
                name: UNAFFILIATED_CHURCH_NAME,
                pastorName: '',
                denomination: '',
                churchCodeHash: null,
                adminUid: null,
                adminEmail: null,
                isVirtual: true,
                departments: [{
                    id: 'personal',
                    name: '개인 성도',
                    color: 'bg-emerald-500',
                    subgroups: ['성경읽기 동행'],
                }],
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
            alert('무소속 가상 교회 생성/점검이 완료되었습니다.');
        } catch (e) {
            alert('무소속 가상 교회 생성/점검 실패: ' + e.message);
        } finally {
            setCheckingUnaffiliatedChurch(false);
        }
    };

    // 교회 검색 노출 숨김/해제 — 숨기면 로그인 화면 교회 "검색"(자동완성)에서만 빠진다
    // (테스트 교회용). 초대 링크(?church=id)로 들어오는 회원가입·로그인, 입장코드
    // 검증은 디렉토리에 항목이 그대로 남아 있어야 하므로 계속 동작해야 한다.
    // → 디렉토리에서 항목을 제거하는 대신 hidden 플래그만 동기화한다.
    const isChurchHidden = (church) =>
        hiddenOverrides[church.id] ?? (church.hiddenFromDirectory === true);

    const toggleChurchHidden = async (church) => {
        const next = !isChurchHidden(church);
        const msg = next
            ? `'${church.name}' 교회를 검색에서 숨깁니다.\n\n다른 사람들은 검색으로 이 교회를 찾을 수 없게 됩니다. (초대 링크로는 계속 가입/로그인 가능)\n(교회 관리자 이메일 로그인과 슈퍼관리자 진입은 계속 가능)`
            : `'${church.name}' 교회를 검색에 다시 노출할까요?`;
        if (!confirm(msg)) return;
        setHiddenToggling(true);
        try {
            await db.collection('churches').doc(church.id).update({ hiddenFromDirectory: next });
            const codeHash = church.churchCodeHash || (church.churchCode ? await sha256(church.churchCode) : null);
            await syncChurchDirectoryEntry({ id: church.id, name: church.name, codeHash, hidden: next });
            setHiddenOverrides(prev => ({ ...prev, [church.id]: next }));
            alert(next ? '✅ 검색에서 숨겼습니다.' : '✅ 검색에 다시 노출했습니다.');
        } catch (e) {
            console.error(e);
            alert('처리 실패: ' + e.message);
        } finally {
            setHiddenToggling(false);
        }
    };

    // 전체 회원 문서의 평문 password/phone4를 private 하위문서로 이관하고 본문서에 null 마커를 남긴다.
    // userDocToState는 phone4를 매핑하지 않으므로 allUsers 대신 최신 문서를 직접 조회한다.
    const handleMigrateCredentials = async () => {
        if (!db) return;
        if (!confirm('전체 회원의 자격증명을 private 하위문서로 이관합니다. 계속하시겠습니까?')) return;
        setCredentialMigrating(true);
        try {
            const snap = await db.collection('users').get();
            const docs = snap.docs;
            setCredentialMigrationProgress({ done: 0, total: docs.length });
            let migrated = 0;
            let skipped = 0;
            for (let i = 0; i < docs.length; i += 10) {
                const chunk = docs.slice(i, i + 10);
                const results = await Promise.all(
                    chunk.map(doc => migrateCredentialsIfNeeded(doc.id, doc.data()))
                );
                results.forEach(changed => { if (changed) migrated++; else skipped++; });
                setCredentialMigrationProgress({ done: Math.min(i + 10, docs.length), total: docs.length });
            }
            alert(`이관 완료: ${migrated}명 이관, ${skipped}명은 이미 완료/대상 아님`);
        } catch (e) {
            alert('자격증명 이관 실패: ' + e.message);
        } finally {
            setCredentialMigrating(false);
        }
    };

    const handleResetAllTalentBalances = async () => {
        if (!db) return;
        if (!confirm('모든 회원의 달란트 잔액을 0으로 초기화합니다. 계속하시겠습니까?')) return;
        if (!confirm('정말 실행할까요? 이 작업은 실물 상점 오픈 시점에 딱 한 번만 실행해야 합니다.')) return;
        setTalentResetting(true);
        try {
            const snap = await db.collection('users').get();
            const docs = snap.docs;
            setTalentResetProgress({ done: 0, total: docs.length });
            let processed = 0;
            for (let i = 0; i < docs.length; i += 10) {
                const batch = db.batch();
                docs.slice(i, i + 10).forEach(doc => {
                    batch.update(doc.ref, {
                        talent: 0,
                        talentMigrated: true,
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    });
                });
                await batch.commit();
                processed = Math.min(i + 10, docs.length);
                setTalentResetProgress({ done: processed, total: docs.length });
            }
            alert(`달란트 잔액 초기화 완료: ${processed}명 처리`);
        } catch (e) {
            alert('달란트 잔액 초기화 실패: ' + e.message);
        } finally {
            setTalentResetting(false);
        }
    };

    const LASTNAMES = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권', '황', '안', '송', '류', '전'];
    const FIRSTNAMES_M = ['민준', '서준', '도윤', '예준', '시우', '하준', '주원', '지호', '준서', '준혁', '도현', '건우', '현우', '우진', '성민', '재원', '태양', '승현', '찬호', '정우'];
    const FIRSTNAMES_F = ['서연', '서윤', '지우', '서현', '민서', '하은', '하윤', '윤서', '지유', '채원', '수아', '지아', '지민', '예원', '수빈', '나연', '예진', '혜원', '다인', '지현'];

    const seedFakeUsers = async (church) => {
        if (!confirm(`"${church.name}"에 가짜 교인 50명을 추가합니다. 계속하시겠습니까?`)) return;
        const comms = church.departments || church.communities || [];
        if (comms.length === 0) {
            alert('먼저 이 교회의 조직(부서/소그룹)을 설정해주세요.'); return;
        }
        setSeedingData(true);
        const today = new Date();
        const todayStr = today.toDateString();
        const ts = Date.now();
        try {
            const batch = db.batch();
            for (let i = 0; i < 50; i++) {
                const isMale = Math.random() > 0.45;
                const lastName = LASTNAMES[Math.floor(Math.random() * LASTNAMES.length)];
                const firstName = (isMale ? FIRSTNAMES_M : FIRSTNAMES_F)[Math.floor(Math.random() * 20)];
                const name = lastName + firstName;
                const birthYear = 1945 + Math.floor(Math.random() * 62);
                const birthMonth = String(Math.floor(Math.random() * 12) + 1).padStart(2, '0');
                const birthDay = String(Math.floor(Math.random() * 28) + 1).padStart(2, '0');
                const birthdate = `${birthYear}${birthMonth}${birthDay}`;
                const comm = comms[Math.floor(Math.random() * comms.length)];
                const subs = (comm.subgroups || []).filter(s => s);
                const subgroup = subs.length > 0 ? subs[Math.floor(Math.random() * subs.length)] : '';
                const currentDay = Math.floor(Math.random() * 365) + 1;
                const readCount = Math.random() > 0.93 ? 2 : 1;
                const rand = Math.random();
                let lastReadDate = null;
                if (rand > 0.65) {
                    lastReadDate = todayStr;
                } else if (rand > 0.45) {
                    const d = new Date(today); d.setDate(d.getDate() - (Math.floor(Math.random() * 3) + 1)); lastReadDate = d.toDateString();
                } else if (rand > 0.25) {
                    const d = new Date(today); d.setDate(d.getDate() - (Math.floor(Math.random() * 11) + 4)); lastReadDate = d.toDateString();
                } else if (rand > 0.10) {
                    const d = new Date(today); d.setDate(d.getDate() - (Math.floor(Math.random() * 16) + 15)); lastReadDate = d.toDateString();
                }
                const score = currentDay * 8 + Math.floor(Math.random() * 400);
                const streak = lastReadDate === todayStr ? Math.floor(Math.random() * 20) + 1 : 0;
                batch.set(db.collection('users').doc(`seed_${ts}_${i}`), {
                    // 시드 계정은 실제 Auth 계정이 없다 — null 마커를 심어 교인 랭킹/달리기 지도에도 노출되게 한다.
                    name, birthdate, password: null,
                    email: `${encodeURIComponent(name)}_${birthdate}@bible.local`,
                    role: 'member', churchId: church.id, churchName: church.name,
                    departmentId: comm.id, departmentName: comm.name, subgroupId: subgroup,
                    planId: '1year_revised', currentDay, readCount, score, streak,
                    lastReadDate, gender: isMale ? 'male' : 'female',
                    achievements: [], memos: {}, readHistory: [], dayOffset: 0,
                    startDate: todayStr,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                });
            }
            await batch.commit();
            alert('✅ 가짜 교인 50명이 추가되었습니다!\n페이지를 새로고침합니다.');
            window.location.reload();
        } catch (e) {
            alert('삽입 실패: ' + e.message);
            setSeedingData(false);
        }
    };

    const deleteSeedUsers = async (churchId) => {
        if (!confirm('이 교회의 테스트 데이터(seed_ 계정)를 모두 삭제하시겠습니까?')) return;
        setSeedingData(true);
        try {
            const snap = await db.collection('users').where('churchId', '==', churchId).get();
            const seedDocs = snap.docs.filter(d => d.id.startsWith('seed_'));
            if (seedDocs.length === 0) { alert('삭제할 테스트 데이터가 없습니다.'); setSeedingData(false); return; }
            const batch = db.batch();
            seedDocs.forEach(d => batch.delete(d.ref));
            await batch.commit();
            alert(`✅ ${seedDocs.length}명의 테스트 데이터가 삭제되었습니다.\n페이지를 새로고침합니다.`);
            window.location.reload();
        } catch (e) {
            alert('삭제 실패: ' + e.message);
            setSeedingData(false);
        }
    };

    const deleteChurch = async (church) => {
        setConfirmDelete({ type: 'church', target: church });
    };

    const doDeleteChurch = async (church) => {
        setConfirmDelete(null);
        setSeedingData(true);
        try {
            const membersSnap = await db.collection('users').where('churchId', '==', church.id).get();
            for (let i = 0; i < membersSnap.docs.length; i += 450) {
                const batch = db.batch();
                membersSnap.docs.slice(i, i + 450).forEach(d => {
                    batch.set(d.ref, {
                        isDeleted: true,
                        deletedAt: firebase.firestore.FieldValue.serverTimestamp(),
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    }, { merge: true });
                });
                await batch.commit();
            }
            const churchBatch = db.batch();
            churchBatch.set(db.collection('churches').doc(church.id), {
                isDeleted: true,
                deletedAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
            await churchBatch.commit();
            await removeChurchFromDirectory(church.id).catch(err => console.error('디렉토리 제거 실패:', err));
            setSeedingData(false);
            setSelectedChurchId(null);
            alert(`✅ "${church.name}" 교회와 계정 ${membersSnap.size}개가 삭제 처리되었습니다.\n페이지를 새로고침합니다.`);
            window.location.reload();
        } catch (e) {
            console.error(e);
            alert('삭제 실패: ' + (e.message || '잠시 후 다시 시도해주세요.'));
            setSeedingData(false);
        }
    };

    const churches = allChurches || [];
    const todayStr = new Date().toDateString();

    const churchStats = churches.map(church => {
        const members = allUsers.filter(u => u.churchId === church.id && u.role !== 'churchAdmin');
        const readToday = members.filter(u => u.lastReadDate === todayStr).length;
        const avgDay = members.length > 0
            ? Math.round(members.reduce((sum, u) => sum + (u.currentDay || 1), 0) / members.length)
            : 0;
        return {
            ...church,
            memberCount: members.length,
            readToday,
            readRate: members.length > 0 ? Math.round((readToday / members.length) * 100) : 0,
            avgDay,
        };
    }).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko-KR'));

    const selectedChurch = selectedChurchId ? churchStats.find(c => c.id === selectedChurchId) : null;
    const selectedChurchMembers = selectedChurchId
        ? allUsers.filter(u => u.churchId === selectedChurchId && u.role !== 'churchAdmin')
        : [];

    const copyChurchInviteLink = (churchId) => {
        const link = `${window.location.origin}${window.location.pathname}?church=${churchId}`;
        const markCopied = () => {
            setCopiedLinkChurchId(churchId);
            setTimeout(() => setCopiedLinkChurchId(null), 2000);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(link).then(markCopied).catch(() => {
                window.prompt('링크를 복사하세요', link);
            });
        } else {
            window.prompt('링크를 복사하세요', link);
        }
    };

    const TABS = [
        ['overview', '📊 전체 현황'],
        ['churches', '🏛️ 교회 목록'],
        ['members', '👥 회원 목록'],
        ['announcement', '📢 공지 관리'],
        ['dailyVideo', '🎬 매일 영상'],
        ['sync', '🔄 동기화'],
    ];

    if (viewingChurchAsAdmin && selectedChurch) {
        const fakeChurchAdmin = {
            churchId: selectedChurch.id,
            churchName: selectedChurch.name,
            name: '슈퍼관리자',
            role: 'churchAdmin',
        };
        return (
            <div>
                <div className="bg-amber-500 text-white text-xs font-bold px-4 py-2 flex items-center justify-between sticky top-0 z-50">
                    <span>🛠️ 슈퍼관리자 모드 — {selectedChurch.name} 교회관리자 화면 미리보기</span>
                    <button
                        onClick={() => setViewingChurchAsAdmin(false)}
                        className="bg-white text-amber-600 px-3 py-1 rounded-lg font-bold text-xs hover:bg-amber-50">
                        ← 슈퍼관리자로 돌아가기
                    </button>
                </div>
                <ChurchAdminView
                    currentUser={fakeChurchAdmin}
                    handleLogout={handleLogout}
                    onBack={() => setViewingChurchAsAdmin(false)}
                />
            </div>
        );
    }

    return (
        // 하단 고정 광고(50px)가 콘텐츠를 가리지 않도록 광고 높이만큼 여백 확보
        <div className="min-h-screen bg-slate-100" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 72px)' }}>
            {/* 교회 삭제 확인 모달 */}
            {confirmDelete?.type === 'church' && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 px-4">
                    <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full">
                        <h3 className="font-black text-red-600 text-lg mb-2">🗑️ 교회 삭제 처리</h3>
                        <p className="text-sm text-slate-700 mb-1">
                            <b>"{confirmDelete.target.name}"</b> 교회와 소속 교인 전체를 삭제합니다.
                        </p>
                        <p className="text-xs text-red-500 font-bold mb-5">교회와 소속 교인을 목록에서 숨깁니다.</p>
                        <div className="flex gap-2">
                            <button onClick={() => setConfirmDelete(null)} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50">취소</button>
                            <button onClick={() => doDeleteChurch(confirmDelete.target)} className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold hover:bg-red-700">삭제 확인</button>
                        </div>
                    </div>
                </div>
            )}
            {/* 교인 삭제 확인 모달 */}
            {deleteUserConfirm && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 px-4">
                    <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full">
                        <h3 className="font-black text-red-600 text-lg mb-2">🗑️ 교인 삭제</h3>
                        <p className="text-sm text-slate-700 mb-1">
                            <b>{deleteUserConfirm.name}</b>님을 목록에서 삭제 처리합니다.
                        </p>
                        <p className="text-xs text-red-500 font-bold mb-5">계정과 기록은 보관됩니다.</p>
                        <div className="flex gap-2">
                            <button onClick={() => setDeleteUserConfirm(null)} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50">취소</button>
                            <button onClick={async () => { const t = deleteUserConfirm; setDeleteUserConfirm(null); await deleteUser(t.uid, t.name); }} className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold hover:bg-red-700">삭제 확인</button>
                        </div>
                    </div>
                </div>
            )}
            {/* Header */}
            <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between sticky top-0 z-30 shadow-sm">
                <div>
                    <h1 className="font-extrabold text-slate-800">🛠️ 슈퍼 관리자</h1>
                    <p className="text-xs text-slate-400">{churches.length}개 교회 · {allUsers.length}명</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => downloadCSV(allUsers)}
                        className="text-xs bg-green-50 text-green-600 px-3 py-2 rounded-lg font-bold flex items-center gap-1 border border-green-100">
                        <Icon name="download" size={13} /> CSV
                    </button>
                    <button onClick={handleLogout}
                        className="text-xs bg-red-50 text-red-500 px-3 py-2 rounded-lg font-bold border border-red-100">
                        로그아웃
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-slate-200 bg-white overflow-x-auto">
                {TABS.map(([t, label]) => (
                    <button key={t}
                        onClick={() => { setTab(t); if (t !== 'churches') setSelectedChurchId(null); }}
                        className={`flex-shrink-0 px-4 py-3 text-xs font-bold border-b-2 transition-all whitespace-nowrap ${tab === t ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
                        {label}
                    </button>
                ))}
            </div>

            <div className="max-w-5xl mx-auto p-4 space-y-5">

                {/* ── 전체 현황 ── */}
                {tab === 'overview' && (
                    <>
                        <div className="bg-white rounded-xl shadow-sm p-6">
                            <h2 className="text-base font-bold text-slate-800 mb-4">📊 플랫폼 전체 ({new Date().toLocaleDateString('ko-KR')})</h2>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                                <div className="bg-indigo-50 p-4 rounded-xl text-center">
                                    <div className="text-3xl font-bold text-indigo-600">{churches.length}</div>
                                    <div className="text-xs text-slate-500">등록 교회</div>
                                </div>
                                <div className="bg-blue-50 p-4 rounded-xl text-center">
                                    <div className="text-3xl font-bold text-blue-600">{adminStats.totalUsers}</div>
                                    <div className="text-xs text-slate-500">전체 회원</div>
                                </div>
                                <div className="bg-green-50 p-4 rounded-xl text-center">
                                    <div className="text-3xl font-bold text-green-600">{adminStats.readToday}</div>
                                    <div className="text-xs text-slate-500">오늘 읽은 사람</div>
                                </div>
                                <div className="bg-orange-50 p-4 rounded-xl text-center">
                                    <div className="text-3xl font-bold text-orange-600">{adminStats.readRate}%</div>
                                    <div className="text-xs text-slate-500">오늘 참여율</div>
                                </div>
                            </div>

                            <h3 className="font-bold text-slate-700 mb-3 text-sm">🏛️ 교회별 오늘 현황</h3>
                            <div className="space-y-2">
                                {churchStats.map(church => (
                                    <div key={church.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                                        <div className="w-28 font-bold text-slate-700 text-sm truncate">{church.name}</div>
                                        <div className="w-12 text-xs text-slate-400 text-center">{church.memberCount}명</div>
                                        <div className="flex-1 h-3 bg-slate-200 rounded-full overflow-hidden">
                                            <div className="h-full bg-blue-500 rounded-full transition-all duration-500" style={{ width: `${church.readRate}%` }}></div>
                                        </div>
                                        <div className="text-xs text-slate-500 w-24 text-right">{church.readToday}/{church.memberCount}명 ({church.readRate}%)</div>
                                        <div className="flex items-center gap-1 shrink-0">
                                            {church.id !== UNAFFILIATED_CHURCH_ID && (
                                                <button onClick={() => copyChurchInviteLink(church.id)} title="교인 로그인 링크 복사"
                                                    className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded-lg font-bold hover:bg-slate-200">
                                                    {copiedLinkChurchId === church.id ? '✓ 복사됨' : '🔗'}
                                                </button>
                                            )}
                                            <button onClick={() => { setTab('churches'); setSelectedChurchId(church.id); }}
                                                className="text-xs text-blue-600 bg-blue-50 px-2.5 py-1 rounded-lg font-bold hover:bg-blue-100">관리</button>
                                        </div>
                                    </div>
                                ))}
                                {churchStats.length === 0 && (
                                    <p className="text-center py-6 text-slate-300">등록된 교회가 없습니다</p>
                                )}
                            </div>
                        </div>

                        {/* Period stats */}
                        <div className="bg-white rounded-xl shadow-sm p-6">
                            <h2 className="text-base font-bold text-slate-800 mb-4">📅 기간별 통계</h2>
                            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
                                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="border border-slate-300 rounded p-2 text-sm" />
                                <span className="text-slate-400 font-bold">~</span>
                                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="border border-slate-300 rounded p-2 text-sm" />
                                <button onClick={() => downloadPeriodStatsCSV(db, allUsers, startDate, endDate)}
                                    className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg font-bold text-sm hover:bg-blue-700">
                                    <Icon name="download" size={16} /> 다운로드
                                </button>
                            </div>
                        </div>
                    </>
                )}

                {/* ── 교회 목록 ── */}
                {tab === 'churches' && (
                    <>
                        {selectedChurch ? (
                            <div>
                                <div className="flex items-center justify-between mb-4">
                                    <button onClick={() => setSelectedChurchId(null)}
                                        className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 font-bold">
                                        ← 교회 목록으로
                                    </button>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => toggleChurchHidden(selectedChurch)}
                                            disabled={hiddenToggling}
                                            className={`flex items-center gap-1.5 text-sm font-bold px-4 py-2 rounded-xl shadow-sm disabled:opacity-50 ${isChurchHidden(selectedChurch)
                                                ? 'bg-slate-700 text-white hover:bg-slate-800'
                                                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}>
                                            {isChurchHidden(selectedChurch) ? '🙈 검색 숨김 중 (해제하기)' : '🔍 검색에서 숨기기'}
                                        </button>
                                        <button
                                            onClick={() => setViewingChurchAsAdmin(true)}
                                            className="flex items-center gap-1.5 bg-blue-600 text-white text-sm font-bold px-4 py-2 rounded-xl hover:bg-blue-700 shadow-sm">
                                            ⛪ 교회관리자 화면으로 보기
                                        </button>
                                    </div>
                                </div>
                                <div className="bg-white rounded-xl shadow-sm p-6">
                                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-6">
                                        <div>
                                            <h2 className="text-xl font-black text-slate-800">🏛️ {selectedChurch.name}</h2>
                                            <p className="text-xs text-slate-400 mt-1">관리자: {selectedChurch.adminEmail || '-'}</p>
                                            <p className="text-xs text-slate-400">입장코드: <span className="font-mono bg-slate-100 px-1.5 rounded">{selectedChurch.churchCode || '-'}</span></p>
                                        </div>
                                        <div className="grid grid-cols-3 gap-3 shrink-0">
                                            <div className="bg-blue-50 p-3 rounded-xl text-center">
                                                <div className="text-2xl font-bold text-blue-600">{selectedChurch.memberCount}</div>
                                                <div className="text-[10px] text-slate-500">교인수</div>
                                            </div>
                                            <div className="bg-green-50 p-3 rounded-xl text-center">
                                                <div className="text-2xl font-bold text-green-600">{selectedChurch.readToday}</div>
                                                <div className="text-[10px] text-slate-500">오늘읽음</div>
                                            </div>
                                            <div className="bg-orange-50 p-3 rounded-xl text-center">
                                                <div className="text-2xl font-bold text-orange-600">{selectedChurch.readRate}%</div>
                                                <div className="text-[10px] text-slate-500">참여율</div>
                                            </div>
                                        </div>
                                    </div>

                                    <h3 className="font-bold text-slate-700 mb-3">👥 교인 목록 ({selectedChurchMembers.length}명)</h3>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm">
                                            <thead className="bg-slate-50">
                                                <tr>
                                                    <th className="px-3 py-2 text-left text-xs font-bold text-slate-600">이름</th>
                                                    <th className="px-3 py-2 text-left text-xs font-bold text-slate-600">소그룹</th>
                                                    <th className="px-3 py-2 text-center text-xs font-bold text-slate-600">진행</th>
                                                    <th className="px-3 py-2 text-center text-xs font-bold text-slate-600">점수</th>
                                                    <th className="px-3 py-2 text-center text-xs font-bold text-slate-600">마지막읽기</th>
                                                    <th className="px-3 py-2 text-center text-xs font-bold text-slate-600">관리</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {selectedChurchMembers
                                                    .sort((a, b) => a.name.localeCompare(b.name, 'ko-KR'))
                                                    .map(u => {
                                                        const readToday = u.lastReadDate === todayStr;
                                                        const rc = u.readCount || 1;
                                                        const totalDays = (rc - 1) * 365 + (u.currentDay || 1);
                                                        return (
                                                            <tr key={u.uid} className={`border-b hover:bg-slate-50 ${readToday ? 'bg-green-50' : ''}`}>
                                                                <td className="px-3 py-2 font-bold text-slate-800">
                                                                    {u.name}{readToday && <span className="ml-1 text-green-500 text-xs">✓</span>}
                                                                </td>
                                                                <td className="px-3 py-2 text-xs text-slate-500">{u.subgroupId || '-'}</td>
                                                                <td className="px-3 py-2 text-center">
                                                                    {rc > 1 ? (
                                                                        <div className="flex items-center justify-center gap-1">
                                                                            <span className="font-bold text-blue-600 text-xs">DAY {totalDays}</span>
                                                                            <span className="px-1 py-0.5 bg-purple-500 text-white text-[9px] font-bold rounded-full">{rc - 1}독 완료</span>
                                                                        </div>
                                                                    ) : <span className="font-bold text-blue-600 text-xs">DAY {u.currentDay || 1}</span>}
                                                                </td>
                                                                <td className="px-3 py-2 text-center text-xs">{u.score || 0}</td>
                                                                <td className="px-3 py-2 text-center text-xs text-slate-400">{u.lastReadDate ? new Date(u.lastReadDate).toLocaleDateString('ko-KR') : '-'}</td>
                                                                <td className="px-3 py-2 text-center">
                                                                    <div className="flex justify-center gap-1">
                                                                        <button onClick={() => setChangingPassword(u)} className="text-purple-500 p-1 bg-purple-50 rounded hover:bg-purple-100" title="암호 변경"><Icon name="refresh" size={14} /></button>
                                                                        <button onClick={() => startEditUser(u)} className="text-blue-500 p-1 bg-blue-50 rounded hover:bg-blue-100" title="정보 수정"><Icon name="edit" size={14} /></button>
                                                                        <button onClick={() => setDeleteUserConfirm({ uid: u.uid, name: u.name })} className="text-red-500 p-1 bg-red-50 rounded hover:bg-red-100" title="삭제"><Icon name="trash" size={14} /></button>
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                            </tbody>
                                        </table>
                                        {selectedChurchMembers.length === 0 && (
                                            <div className="text-center py-12 text-slate-300">
                                                <div className="text-4xl mb-2">👥</div>
                                                <p>아직 가입한 교인이 없습니다</p>
                                            </div>
                                        )}
                                    </div>

                                    <div className="mt-6 pt-5 border-t-2 border-dashed border-red-100">
                                        <p className="text-xs font-bold text-red-400 mb-3">🧪 테스트 데이터 관리 (개발용)</p>
                                        <div className="flex gap-2 mb-3">
                                            <button
                                                onClick={() => seedFakeUsers(selectedChurch)}
                                                disabled={seedingData}
                                                className="flex-1 bg-red-50 text-red-500 py-2.5 rounded-xl text-xs font-bold hover:bg-red-100 border border-red-100 disabled:opacity-50 transition-colors">
                                                {seedingData ? '처리 중...' : '가짜 교인 50명 추가'}
                                            </button>
                                            <button
                                                onClick={() => deleteSeedUsers(selectedChurch.id)}
                                                disabled={seedingData}
                                                className="flex-1 bg-slate-50 text-slate-400 py-2.5 rounded-xl text-xs font-bold hover:bg-slate-100 border border-slate-200 disabled:opacity-50 transition-colors">
                                                테스트 데이터 삭제
                                            </button>
                                        </div>
                                        <button
                                            onClick={() => deleteChurch(selectedChurch)}
                                            disabled={seedingData}
                                            className="w-full bg-red-600 hover:bg-red-700 text-white py-2.5 rounded-xl text-xs font-bold disabled:opacity-50 transition-colors border border-red-700">
                                            🗑️ 이 교회 삭제 처리 (교인 포함)
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div>
                                <div className="text-sm text-slate-500 font-bold mb-3">총 {churchStats.length}개 교회</div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {churchStats.map(church => (
                                        <div key={church.id}
                                            onClick={() => setSelectedChurchId(church.id)}
                                            className="bg-white rounded-xl shadow-sm p-5 border border-slate-100 hover:border-blue-300 hover:shadow-md transition-all cursor-pointer">
                                            <div className="flex items-start justify-between mb-3">
                                                <div>
                                                    <h3 className="font-black text-slate-800 text-base">🏛️ {church.name}</h3>
                                                    <p className="text-xs text-slate-400 mt-0.5">{church.adminEmail || '이메일 미설정'}</p>
                                                    {(church.pastorName || church.denomination) && (
                                                        <p className="text-xs text-slate-500 mt-1">
                                                            {church.pastorName && <span className="mr-2">👤 {church.pastorName}</span>}
                                                            {church.denomination && <span className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-500">{church.denomination}</span>}
                                                        </p>
                                                    )}
                                                </div>
                                                <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-1 rounded-full font-mono shrink-0">코드: {church.churchCode || '-'}</span>
                                            </div>
                                            <div className="grid grid-cols-3 gap-2 mb-3">
                                                <div className="bg-slate-50 p-2 rounded-lg text-center">
                                                    <div className="font-bold text-slate-700 text-lg">{church.memberCount}</div>
                                                    <div className="text-[10px] text-slate-400">교인수</div>
                                                </div>
                                                <div className="bg-green-50 p-2 rounded-lg text-center">
                                                    <div className="font-bold text-green-600 text-lg">{church.readToday}</div>
                                                    <div className="text-[10px] text-slate-400">오늘읽음</div>
                                                </div>
                                                <div className={`p-2 rounded-lg text-center ${church.readRate >= 70 ? 'bg-blue-50' : church.readRate >= 40 ? 'bg-yellow-50' : 'bg-red-50'}`}>
                                                    <div className={`font-bold text-lg ${church.readRate >= 70 ? 'text-blue-600' : church.readRate >= 40 ? 'text-yellow-600' : 'text-red-500'}`}>
                                                        {church.readRate}%
                                                    </div>
                                                    <div className="text-[10px] text-slate-400">참여율</div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                                                    <div className="h-full bg-blue-400 rounded-full transition-all" style={{ width: `${church.readRate}%` }}></div>
                                                </div>
                                                {church.id !== UNAFFILIATED_CHURCH_ID && (
                                                    <button onClick={(e) => { e.stopPropagation(); copyChurchInviteLink(church.id); }} title="교인 로그인 링크 복사"
                                                        className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded-lg font-bold shrink-0 hover:bg-slate-200">
                                                        {copiedLinkChurchId === church.id ? '✓ 복사됨' : '🔗'}
                                                    </button>
                                                )}
                                                <span className="text-xs text-blue-600 font-bold shrink-0">관리 →</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                {churchStats.length === 0 && (
                                    <div className="text-center py-16 text-slate-300 bg-white rounded-xl">
                                        <div className="text-4xl mb-2">🏛️</div>
                                        <p>등록된 교회가 없습니다</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                )}

                {/* ── 회원 목록 ── */}
                {tab === 'members' && (
                    <div className="bg-white rounded-xl shadow-sm p-6">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-base font-bold text-slate-800">👥 전체 회원 목록</h2>
                            <div className="flex gap-2 flex-wrap">
                                {['name', 'day', 'score', 'subgroup'].map(sort => (
                                    <button key={sort} onClick={() => setAdminSortBy(sort)}
                                        className={`text-xs px-3 py-1.5 rounded-lg font-bold ${adminSortBy === sort ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-600'}`}>
                                        {sort === 'name' ? '이름순' : sort === 'day' ? '진행순' : sort === 'score' ? '점수순' : '소그룹순'}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left text-slate-600">
                                <thead className="text-xs text-slate-700 uppercase bg-slate-50">
                                    <tr>
                                        <th className="px-3 py-3 text-center w-10">#</th>
                                        <th className="px-3 py-3">이름</th>
                                        <th className="px-3 py-3">교회</th>
                                        <th className="px-3 py-3">부서/소그룹</th>
                                        <th className="px-3 py-3 text-center">Day</th>
                                        <th className="px-3 py-3 text-center">점수</th>
                                        <th className="px-3 py-3 text-center">마지막읽기</th>
                                        <th className="px-3 py-3 text-center">관리</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(() => {
                                        const sorted = [...allUsers].sort((a, b) => {
                                            if (adminSortBy === 'name') return a.name.localeCompare(b.name);
                                            if (adminSortBy === 'day') return (((b.readCount || 1) - 1) * 365 + (b.currentDay || 1)) - (((a.readCount || 1) - 1) * 365 + (a.currentDay || 1));
                                            if (adminSortBy === 'score') return (b.score || 0) - (a.score || 0);
                                            if (adminSortBy === 'subgroup') {
                                                const c = (a.departmentName || '').localeCompare(b.departmentName || '', 'ko-KR');
                                                return c !== 0 ? c : (a.subgroupId || '').localeCompare(b.subgroupId || '', 'ko-KR');
                                            }
                                            return 0;
                                        });
                                        return sorted.map((u, idx) => {
                                            const readToday = u.lastReadDate === todayStr;
                                            const rc = u.readCount || 1;
                                            const totalDays = (rc - 1) * 365 + (u.currentDay || 1);
                                            const churchName = churches.find(c => c.id === u.churchId)?.name || u.churchName || '-';
                                            return (
                                                <tr key={idx} className={`border-b hover:bg-slate-50 ${readToday ? 'bg-green-50' : ''}`}>
                                                    <td className="px-3 py-3 text-center text-xs text-slate-400 font-mono italic">{idx + 1}</td>
                                                    <td className="px-3 py-3 font-medium text-slate-900">{u.name}{readToday && <span className="ml-1 text-green-500">✓</span>}</td>
                                                    <td className="px-3 py-3 text-xs text-slate-500">{churchName}</td>
                                                    <td className="px-3 py-3">
                                                        <span className="font-bold text-slate-700 text-xs">{u.departmentName || '-'}</span>
                                                        <span className="text-xs text-slate-400 block">{u.subgroupId || ''}</span>
                                                    </td>
                                                    <td className="px-3 py-3 text-center">
                                                        {rc > 1 ? (
                                                            <div className="flex items-center justify-center gap-1">
                                                                <span className="font-bold text-blue-600">DAY {totalDays}</span>
                                                                <span className="px-1.5 py-0.5 bg-gradient-to-br from-purple-500 to-purple-700 text-white text-[10px] font-bold rounded-full">{rc - 1}독 완료</span>
                                                            </div>
                                                        ) : <span className="font-bold text-blue-600">DAY {u.currentDay || 1}</span>}
                                                    </td>
                                                    <td className="px-3 py-3 text-center">{u.score || 0}</td>
                                                    <td className="px-3 py-3 text-center text-xs text-slate-400">{u.lastReadDate ? new Date(u.lastReadDate).toLocaleDateString('ko-KR') : '-'}</td>
                                                    <td className="px-3 py-3 text-center">
                                                        <div className="flex justify-center gap-1">
                                                            <button onClick={() => setChangingPassword(u)} className="text-purple-500 p-1 bg-purple-50 rounded" title="암호 변경"><Icon name="refresh" size={14} /></button>
                                                            <button onClick={() => startEditUser(u)} className="text-blue-500 p-1 bg-blue-50 rounded" title="정보 수정"><Icon name="edit" size={14} /></button>
                                                            <button onClick={() => setDeleteUserConfirm({ uid: u.uid, name: u.name })} className="text-red-500 p-1 bg-red-50 rounded" title="삭제"><Icon name="trash" size={14} /></button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        });
                                    })()}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* ── 공지 관리 ── */}
                {tab === 'announcement' && (
                    <div className="space-y-5">
                        <div className="bg-white rounded-xl shadow-sm p-6">
                            <h2 className="text-base font-bold text-slate-800 mb-4">📢 공지 / 카카오 관리</h2>
                            <label className="block text-sm font-bold text-slate-600 mb-2">관리할 교회 선택</label>
                            <select value={announcementChurchId} onChange={e => setAnnouncementChurchId(e.target.value)}
                                className="w-full border border-slate-200 rounded-xl p-3 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-400">
                                <option value="">교회를 선택하세요</option>
                                {[...churches].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko-KR')).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                        </div>

                        {announcementChurchId && (
                            <>
                                <div className="bg-white rounded-xl shadow-sm p-6">
                                    <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
                                        📢 공지사항
                                        <span className="text-xs text-blue-600 font-normal bg-blue-50 px-2 py-0.5 rounded-full">
                                            {churches.find(c => c.id === announcementChurchId)?.name}
                                        </span>
                                    </h3>
                                    <textarea value={announcementInput.text}
                                        onChange={e => setAnnouncementInput(prev => ({ ...prev, text: e.target.value }))}
                                        placeholder="공지사항 내용을 입력하세요..."
                                        rows={4}
                                        className="w-full p-3 border rounded-xl text-sm resize-none focus:ring-2 focus:ring-blue-500 outline-none" />

                                    <div className="space-y-3 mt-4">
                                        <div className="flex justify-between items-center">
                                            <label className="text-sm font-bold text-slate-600">링크 버튼</label>
                                            <button onClick={() => setAnnouncementInput(prev => ({ ...prev, links: [...(prev.links || []), { url: '', text: '' }] }))}
                                                className="text-xs bg-blue-50 text-blue-600 px-3 py-1.5 rounded-lg font-bold flex items-center gap-1 hover:bg-blue-100">
                                                <Icon name="plus" size={12} /> 버튼 추가
                                            </button>
                                        </div>
                                        {(announcementInput.links || []).map((link, idx) => (
                                            <div key={idx} className="bg-slate-50 p-3 rounded-xl relative border border-slate-100">
                                                <button onClick={() => setAnnouncementInput(prev => ({ ...prev, links: prev.links.filter((_, i) => i !== idx) }))}
                                                    className="absolute -top-2 -right-2 bg-white text-red-500 p-1 rounded-full shadow border border-red-100">
                                                    <Icon name="trash" size={12} />
                                                </button>
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                    <input type="text" value={link.text}
                                                        onChange={e => { const links = [...announcementInput.links]; links[idx] = { ...links[idx], text: e.target.value }; setAnnouncementInput(prev => ({ ...prev, links })); }}
                                                        placeholder="버튼 글자 (예: 바로가기)"
                                                        className="w-full p-2 border rounded-lg text-sm bg-white" />
                                                    <input type="url" value={link.url}
                                                        onChange={e => { const links = [...announcementInput.links]; links[idx] = { ...links[idx], url: e.target.value }; setAnnouncementInput(prev => ({ ...prev, links })); }}
                                                        placeholder="https://..."
                                                        className="w-full p-2 border rounded-lg text-sm bg-white" />
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-100">
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input type="checkbox" checked={announcementInput.enabled}
                                                onChange={e => setAnnouncementInput(prev => ({ ...prev, enabled: e.target.checked }))}
                                                className="w-5 h-5 rounded border-slate-300 text-blue-600" />
                                            <span className="text-sm font-bold text-slate-600">공지 활성화</span>
                                        </label>
                                        <button onClick={() => saveAnnouncement(announcementChurchId)}
                                            className="bg-blue-600 text-white px-8 py-2.5 rounded-xl font-bold hover:bg-blue-700 shadow-sm">
                                            저장하기
                                        </button>
                                    </div>

                                    {announcementInput.text && (
                                        <div className="mt-4 p-4 bg-slate-50 rounded-xl border-2 border-dashed border-slate-300">
                                            <p className="text-xs text-slate-400 mb-3 font-bold uppercase">배너 미리보기</p>
                                            <div className="bg-white border-2 border-slate-100 rounded-3xl p-6 shadow-sm">
                                                <div className="flex flex-col md:flex-row items-center gap-4">
                                                    <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center text-3xl border border-slate-100 shrink-0">📢</div>
                                                    <div className="flex-1 text-center md:text-left">
                                                        <p className="text-base text-slate-900 font-bold whitespace-pre-wrap">{announcementInput.text}</p>
                                                        <div className="flex flex-wrap justify-center md:justify-start gap-2 mt-4">
                                                            {(announcementInput.links || []).map((link, idx) => link.text && (
                                                                <div key={idx} className="bg-[#03C75A] text-white px-6 py-2.5 rounded-2xl text-sm font-black shadow">{link.text}</div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="bg-white rounded-xl shadow-sm p-6">
                                    <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
                                        💬 카카오톡 채널
                                        <span className="text-xs text-yellow-600 font-normal bg-yellow-50 px-2 py-0.5 rounded-full">
                                            {churches.find(c => c.id === announcementChurchId)?.name}
                                        </span>
                                    </h3>
                                    <input type="url" value={kakaoLinkInput}
                                        onChange={e => setKakaoLinkInput(e.target.value)}
                                        placeholder="https://pf.kakao.com/_xxxx/chat"
                                        className="w-full p-3 border rounded-xl text-sm bg-slate-50 focus:ring-2 focus:ring-yellow-400 outline-none" />
                                    <p className="text-xs text-slate-400 mt-1">카카오톡 채널 관리자 센터에서 채팅 URL을 복사하여 붙여넣으세요.</p>
                                    <div className="flex justify-end mt-3">
                                        <button onClick={() => saveKakaoLink(announcementChurchId)}
                                            className="bg-[#FEE500] text-[#3c1e1e] px-8 py-2.5 rounded-xl font-bold hover:bg-[#FDD835]">
                                            링크 저장하기
                                        </button>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                )}

                {/* ── 매일 영상 ── */}
                {tab === 'dailyVideo' && (
                    <div className="space-y-5">
                        <div className="bg-white rounded-xl shadow-sm p-6">
                            <h2 className="text-base font-bold text-slate-800 mb-1">🤖 자동화 설정</h2>
                            <p className="text-xs text-slate-400 mb-4">
                                YouTube 재생목록에서 매일 최신 영상을 자동으로 가져옵니다. 아래에서 수동 등록한 날짜가 있으면 그 등록이 항상 우선합니다.
                            </p>
                            {loadingAutoConfig ? (
                                <p className="text-sm text-slate-400 py-4">불러오는 중...</p>
                            ) : (
                                <>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 mb-1">YouTube Data API 키</label>
                                            <input type="text" value={autoApiKey} onChange={e => setAutoApiKey(e.target.value)}
                                                placeholder="AIza..."
                                                className="w-full p-2.5 border rounded-lg text-sm bg-white" />
                                        </div>
                                        <div className="flex items-end">
                                            <label className="flex items-center gap-2 text-sm font-bold text-slate-600 pb-2.5">
                                                <input type="checkbox" checked={autoEnabled} onChange={e => setAutoEnabled(e.target.checked)}
                                                    className="w-4 h-4" />
                                                자동화 사용
                                            </label>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 mb-1">성인용 재생목록 (ID 또는 URL)</label>
                                            <input type="text" value={autoAdultPlaylist} onChange={e => setAutoAdultPlaylist(e.target.value)}
                                                placeholder="PLxxxx... 또는 https://www.youtube.com/playlist?list=..."
                                                className="w-full p-2.5 border rounded-lg text-sm bg-white" />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 mb-1">어린이용 재생목록 (ID 또는 URL, 선택)</label>
                                            <input type="text" value={autoKidsPlaylist} onChange={e => setAutoKidsPlaylist(e.target.value)}
                                                placeholder="PLxxxx... 또는 https://www.youtube.com/playlist?list=..."
                                                className="w-full p-2.5 border rounded-lg text-sm bg-white" />
                                        </div>
                                    </div>
                                    <p className="text-[11px] text-slate-400 mb-4">
                                        채널 업로드 전체 목록은 채널 ID의 <code className="bg-slate-100 px-1 rounded">UC</code>를 <code className="bg-slate-100 px-1 rounded">UU</code>로 바꾼 값을 사용하세요. 재생목록 URL을 그대로 붙여넣어도 <code className="bg-slate-100 px-1 rounded">list=</code> 값이 자동으로 추출됩니다.
                                    </p>
                                    <div className="flex items-center gap-3 flex-wrap">
                                        <button onClick={saveAutoConfig} disabled={savingAutoConfig}
                                            className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl font-bold hover:bg-indigo-700 shadow-sm disabled:opacity-50">
                                            {savingAutoConfig ? '저장 중...' : '설정 저장'}
                                        </button>
                                        <button onClick={testAutoConnection} disabled={testingConnection}
                                            className="bg-slate-100 text-slate-700 px-6 py-2.5 rounded-xl font-bold hover:bg-slate-200 disabled:opacity-50">
                                            {testingConnection ? '확인 중...' : '🔌 오늘 영상 미리보기'}
                                        </button>
                                        {connectionTestResult && (
                                            <span className={`text-xs font-bold ${connectionTestResult.ok ? 'text-green-600' : 'text-red-500'}`}>
                                                {connectionTestResult.ok ? '✓ ' : '✕ '}{connectionTestResult.message}
                                            </span>
                                        )}
                                    </div>
                                    {connectionTestResult?.previews && (
                                        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                                            {connectionTestResult.previews.map(preview => (
                                                <div key={preview.label} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                                                    <div className="flex items-center justify-between gap-3 mb-2">
                                                        <h3 className="text-sm font-black text-slate-700">{preview.label}</h3>
                                                        {preview.ok && (
                                                            <span className={`text-[11px] font-black px-2 py-1 rounded-full ${preview.entry?.matchedDate ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
                                                                {preview.entry?.matchedDate ? '날짜 매칭' : '최신 폴백'}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {preview.ok ? (
                                                        <div className="space-y-2">
                                                            <p className="text-sm font-bold text-slate-800 line-clamp-2">{preview.entry?.title || '(제목 없음)'}</p>
                                                            <p className="text-xs text-slate-400">게시일: {preview.entry?.publishedAt ? new Date(preview.entry.publishedAt).toLocaleString('ko-KR') : '-'}</p>
                                                            {(preview.entry?.chapters || []).length > 0 ? (
                                                                <div className="flex flex-wrap gap-1.5">
                                                                    {preview.entry.chapters.map((chapter, idx) => (
                                                                        <span key={`${chapter.label}_${idx}`} className="rounded-full bg-white px-2 py-1 text-[11px] font-bold text-slate-600 border border-slate-100">
                                                                            {chapter.label} · {chapter.sec}초
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            ) : (
                                                                <p className="text-xs font-bold text-amber-600">
                                                                    설명문에 타임스탬프(예: 0:00 매일성경 해설 / 3:20 기도제목)가 없어 구간 버튼이 표시되지 않습니다.
                                                                </p>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <p className="text-xs font-bold text-red-500">{preview.error || '확인 실패'}</p>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>

                        <div className="bg-white rounded-xl shadow-sm p-6">
                            <h2 className="text-base font-bold text-slate-800 mb-1">🎬 매일 영상 등록</h2>
                            <p className="text-xs text-slate-400 mb-4">플랫폼 전체 교회에 공통으로 노출되는 매일 유튜브 영상입니다. 새벽 3시(KST)를 기준으로 날짜가 바뀝니다.</p>

                            <label className="block text-sm font-bold text-slate-600 mb-2">등록 날짜</label>
                            <input type="date" value={videoDate} onChange={e => setVideoDate(e.target.value)}
                                className="border border-slate-300 rounded-lg p-2.5 text-sm mb-6" />

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                {/* 성인용 */}
                                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                                    <h3 className="font-bold text-slate-700 mb-3">👤 성인용</h3>
                                    <input type="url" value={adultUrl} onChange={e => setAdultUrl(e.target.value)}
                                        placeholder="https://youtu.be/..."
                                        className="w-full p-2.5 border rounded-lg text-sm bg-white mb-3" />
                                    <label className="block text-xs font-bold text-slate-500 mb-1">유튜브 설명문 붙여넣기 (타임스탬프 자동 인식)</label>
                                    <textarea value={adultDesc} onChange={e => handleAdultDescChange(e.target.value)}
                                        rows={5} placeholder={"예)\n0:00 매일성경 해설\n3:20 성경읽기\n15:40 기도"}
                                        className="w-full p-2.5 border rounded-lg text-xs font-mono bg-white resize-none mb-3" />
                                    {adultChapters.length > 0 && (
                                        <div className="space-y-1.5">
                                            <p className="text-xs font-bold text-slate-500">파싱된 챕터 (수정 가능)</p>
                                            {adultChapters.map((c, idx) => (
                                                <div key={idx} className="flex items-center gap-1.5">
                                                    <input type="text" value={c.label}
                                                        onChange={e => updateChapterField('adult', idx, 'label', e.target.value)}
                                                        className="flex-1 p-1.5 border rounded text-xs bg-white" />
                                                    <input type="number" value={c.sec}
                                                        onChange={e => updateChapterField('adult', idx, 'sec', e.target.value)}
                                                        className="w-20 p-1.5 border rounded text-xs bg-white" />
                                                    <span className="text-[10px] text-slate-400">초</span>
                                                    <button onClick={() => removeChapter('adult', idx)} className="text-red-400 p-1"><Icon name="trash" size={12} /></button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* 어린이용 */}
                                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                                    <h3 className="font-bold text-slate-700 mb-3">🧒 어린이용</h3>
                                    <input type="url" value={kidsUrl} onChange={e => setKidsUrl(e.target.value)}
                                        placeholder="https://youtu.be/..."
                                        className="w-full p-2.5 border rounded-lg text-sm bg-white mb-3" />
                                    <label className="block text-xs font-bold text-slate-500 mb-1">유튜브 설명문 붙여넣기 (타임스탬프 자동 인식)</label>
                                    <textarea value={kidsDesc} onChange={e => handleKidsDescChange(e.target.value)}
                                        rows={5} placeholder={"예)\n0:00 매일성경 해설\n3:20 성경읽기\n15:40 기도"}
                                        className="w-full p-2.5 border rounded-lg text-xs font-mono bg-white resize-none mb-3" />
                                    {kidsChapters.length > 0 && (
                                        <div className="space-y-1.5">
                                            <p className="text-xs font-bold text-slate-500">파싱된 챕터 (수정 가능)</p>
                                            {kidsChapters.map((c, idx) => (
                                                <div key={idx} className="flex items-center gap-1.5">
                                                    <input type="text" value={c.label}
                                                        onChange={e => updateChapterField('kids', idx, 'label', e.target.value)}
                                                        className="flex-1 p-1.5 border rounded text-xs bg-white" />
                                                    <input type="number" value={c.sec}
                                                        onChange={e => updateChapterField('kids', idx, 'sec', e.target.value)}
                                                        className="w-20 p-1.5 border rounded text-xs bg-white" />
                                                    <span className="text-[10px] text-slate-400">초</span>
                                                    <button onClick={() => removeChapter('kids', idx)} className="text-red-400 p-1"><Icon name="trash" size={12} /></button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="flex justify-end mt-5">
                                <button onClick={saveDailyVideo} disabled={savingVideo}
                                    className="bg-indigo-600 text-white px-8 py-2.5 rounded-xl font-bold hover:bg-indigo-700 shadow-sm disabled:opacity-50">
                                    {savingVideo ? '저장 중...' : `${videoDate} 저장하기`}
                                </button>
                            </div>
                        </div>

                        <div className="bg-white rounded-xl shadow-sm p-6">
                            <h3 className="font-bold text-slate-700 mb-4">📅 등록 현황 (오늘 ±7일)</h3>
                            {loadingVideoList ? (
                                <p className="text-sm text-slate-400 text-center py-6">불러오는 중...</p>
                            ) : (
                                <div className="space-y-2">
                                    {videoList.map(({ date, data }) => {
                                        const isToday = date === getVideoDateKST();
                                        return (
                                            <div key={date} className={`flex items-center gap-3 p-3 rounded-xl ${isToday ? 'bg-indigo-50 border border-indigo-200' : 'bg-slate-50'}`}>
                                                <div className="w-28 text-sm font-bold text-slate-700">
                                                    {date} {isToday && <span className="text-[10px] text-indigo-500">(오늘)</span>}
                                                </div>
                                                <span className={`text-xs px-2 py-1 rounded-full font-bold ${data?.adult?.url ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-400'}`}>
                                                    성인용 {data?.adult?.url ? '✓' : '✕'}
                                                </span>
                                                <span className={`text-xs px-2 py-1 rounded-full font-bold ${data?.kids?.url ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-400'}`}>
                                                    어린이용 {data?.kids?.url ? '✓' : '✕'}
                                                </span>
                                                {data && (
                                                    <span className={`text-[10px] px-2 py-1 rounded-full font-bold ${data.autoFilled ? 'bg-purple-100 text-purple-600' : 'bg-amber-100 text-amber-600'}`}>
                                                        {data.autoFilled ? '🤖 자동' : '✍️ 수동'}
                                                    </span>
                                                )}
                                                <div className="flex-1" />
                                                {data && (
                                                    <button onClick={() => deleteDailyVideo(date)}
                                                        className="text-red-500 p-1.5 bg-red-50 rounded-lg hover:bg-red-100" title="삭제">
                                                        <Icon name="trash" size={14} />
                                                    </button>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ── 노션 동기화 ── */}
                {tab === 'sync' && (
                    <div className="space-y-5">
                    {/* 플랫폼 문의 카카오 채널 */}
                    <div className="bg-white rounded-xl shadow-sm p-6">
                        <h2 className="text-base font-bold text-slate-800 mb-1">💬 플랫폼 문의 카카오 채널</h2>
                        <p className="text-xs text-slate-400 mb-4">교회관리자 화면 상단에 표시되는 문의 버튼입니다. 교회 관리자들이 운영자에게 직접 연락할 수 있습니다.</p>
                        <input type="url" value={platformKakaoInput}
                            onChange={e => setPlatformKakaoInput(e.target.value)}
                            placeholder="https://pf.kakao.com/_xxxx/chat"
                            className="w-full border border-slate-200 rounded-xl p-3 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-yellow-400 mb-3" />
                        <button onClick={savePlatformKakao} disabled={savingPlatformKakao}
                            className="bg-[#FEE500] text-[#3c1e1e] px-6 py-2.5 rounded-xl font-bold text-sm hover:bg-[#FDD835] disabled:opacity-50">
                            {savingPlatformKakao ? '저장 중...' : '💬 저장하기'}
                        </button>
                    </div>

                    <div className="bg-white rounded-xl shadow-sm p-6">
                        {/* 플랫폼 통계 초기화 */}
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
                            <h3 className="text-sm font-bold text-amber-800 mb-1">📊 첫 페이지 통계 초기화</h3>
                            <p className="text-xs text-amber-700 mb-3">로그인 첫 페이지에 표시되는 통계를 Firestore 실제 데이터로 갱신합니다. 처음 한 번 실행하거나, 숫자가 맞지 않을 때 실행하세요.</p>
                            <button
                                onClick={refreshPlatformStats}
                                disabled={statsRefreshing}
                                className="bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
                            >
                                {statsRefreshing ? '갱신 중...' : '통계 지금 갱신'}
                            </button>
                        </div>

                        {/* 교회 디렉토리 재생성 */}
                        <div className="bg-sky-50 border border-sky-200 rounded-xl p-4 mb-6">
                            <h3 className="text-sm font-bold text-sky-800 mb-1">🏠 교회 디렉토리 재생성</h3>
                            <p className="text-xs text-sky-700 mb-3">
                                로그인 화면의 교회 검색은 <code className="bg-sky-100 px-1 rounded">settings/churchDirectory</code> 공개 문서를 사용합니다.
                                교회 정보가 디렉토리와 어긋나거나(예: 기존 교회 백필) 최신화가 필요할 때 눌러주세요. churches 컬렉션 전체를 스캔해 다시 작성합니다.
                            </p>
                            <button
                                onClick={handleRebuildDirectory}
                                disabled={directoryRebuilding}
                                className="bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
                            >
                                {directoryRebuilding ? '재생성 중...' : '디렉토리 재생성'}
                            </button>
                        </div>

                        {/* 무소속 가상 교회 생성/점검 */}
                        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-6">
                            <h3 className="text-sm font-bold text-emerald-800 mb-1">개인 성도 가상 교회</h3>
                            <p className="text-xs text-emerald-700 mb-3">
                                소속 교회가 없는 성도가 가입할 때 사용할 내부 가상 교회 문서를 생성하거나 점검합니다.
                                이 교회는 로그인 화면의 교회 검색 목록에는 표시되지 않습니다.
                            </p>
                            <button
                                onClick={handleEnsureUnaffiliatedChurch}
                                disabled={checkingUnaffiliatedChurch}
                                className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
                            >
                                {checkingUnaffiliatedChurch ? '점검 중...' : '무소속 가상 교회 생성/점검'}
                            </button>
                        </div>

                        {/* 자격증명 보안 이관 */}
                        {pendingCredentialMigration > 0 ? (
                            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 mb-6">
                                <h3 className="text-sm font-bold text-indigo-800 mb-1">🔐 자격증명 보안 이관 (랭킹 활성화)</h3>
                                <p className="text-xs text-indigo-700 mb-3">
                                    회원 문서의 평문 비밀번호를 비공개 하위문서로 옮깁니다. 모든 회원이 이관되어야 교인 랭킹·달리기 지도가 정상 표시됩니다.
                                </p>
                                <button
                                    onClick={handleMigrateCredentials}
                                    disabled={credentialMigrating}
                                    className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
                                >
                                    {credentialMigrating
                                        ? `이관 중... (${credentialMigrationProgress.done}/${credentialMigrationProgress.total})`
                                        : `전체 회원 이관 실행 (${pendingCredentialMigration}명 대기)`}
                                </button>
                            </div>
                        ) : (
                            <div className="bg-slate-50 rounded-lg px-3 py-1.5 mb-6">
                                <p className="text-xs text-slate-400">🔐 자격증명 보안 이관 완료 — 모든 회원이 이관되었습니다.</p>
                            </div>
                        )}

                        {/* 달란트 잔액 전원 초기화 */}
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
                            <h3 className="text-sm font-bold text-amber-800 mb-1">⭐ 달란트 잔액 초기화 (상점 새 출발)</h3>
                            <p className="text-xs text-amber-700 mb-3">
                                구 적립 방식으로 쌓인 달란트를 전원 0으로 초기화합니다. 새 적립(하루 1회)과 실물 상점 도입 시점에 딱 한 번 실행하세요.
                                <br />실행 시 <code className="bg-amber-100 px-1 rounded">talentMigrated: true</code>도 함께 저장해 로그인 시 구 잔액이 복원되지 않게 잠급니다.
                            </p>
                            <button
                                onClick={handleResetAllTalentBalances}
                                disabled={talentResetting}
                                className="bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
                            >
                                {talentResetting
                                    ? `초기화 중... (${talentResetProgress.done}/${talentResetProgress.total})`
                                    : '전원 달란트 0으로 초기화'}
                            </button>
                        </div>

                        <h2 className="text-base font-bold text-slate-800 mb-4">🔄 노션 데이터 동기화</h2>
                        <div className="bg-blue-50 p-4 rounded-xl border border-blue-200 mb-4">
                            <p className="text-sm text-blue-700">
                                노션의 성경 본문을 Firestore에 캐싱하여 <strong>로딩 속도를 10배 이상</strong> 향상시킵니다.<br />
                                노션 본문을 수정했을 때만 동기화하면 됩니다.
                            </p>
                        </div>
                        {lastSyncInfo && (
                            <div className="bg-slate-50 p-3 rounded-lg mb-4 text-sm">
                                <p className="text-slate-600">마지막 동기화: {(lastSyncInfo.lastSyncAt && lastSyncInfo.lastSyncAt.toDate) ? lastSyncInfo.lastSyncAt.toDate().toLocaleString('ko-KR') : '정보 없음'}</p>
                                <p className="text-slate-500 text-xs">성공: {lastSyncInfo.successCount || 0}개 / 실패: {lastSyncInfo.errorCount || 0}개</p>
                                {lastSyncInfo.syncedVersions && <p className="text-slate-400 text-xs mt-1">동기화된 버전: {lastSyncInfo.syncedVersions.join(', ')}</p>}
                                {lastSyncInfo.failedItems && lastSyncInfo.failedItems.length > 0 && (
                                    <div className="mt-3 pt-3 border-t border-slate-200">
                                        <p className="text-red-600 text-xs font-bold mb-2">❌ 실패 목록 ({lastSyncInfo.failedItems.length}개):</p>
                                        <div className="max-h-32 overflow-y-auto bg-white rounded p-2 text-xs">
                                            {lastSyncInfo.failedItems.map((item, idx) => (
                                                <div key={idx} className="text-red-500 py-0.5">• {item.versionName} Day {item.day} ({item.date}) - {item.error}</div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                        {syncProgress ? (
                            <div className="space-y-3">
                                <div className="bg-amber-50 p-4 rounded-xl border border-amber-200">
                                    <p className="text-sm font-bold text-amber-700 mb-2">⏳ 동기화 진행 중... ({syncProgress.current}/{syncProgress.total})</p>
                                    {syncProgress.status && <p className="text-xs text-amber-800 mb-2 font-medium">{syncProgress.status}</p>}
                                    {syncProgress.currentVersion && <p className="text-xs text-amber-600 mb-2">버전: {syncProgress.currentVersion} {syncProgress.currentDay > 0 && `- Day ${syncProgress.currentDay}`}</p>}
                                    <div className="w-full bg-amber-200 rounded-full h-3">
                                        <div className="bg-amber-500 h-3 rounded-full transition-all" style={{ width: `${(syncProgress.current / syncProgress.total) * 100}%` }}></div>
                                    </div>
                                    <p className="text-xs text-amber-600 mt-2">✅ 성공: {syncProgress.success}개 / ❌ 실패: {syncProgress.error}개</p>
                                </div>
                                <p className="text-xs text-slate-500 text-center">⚠️ 창을 닫지 마세요. 약 2분 소요됩니다.</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <p className="text-sm font-bold text-slate-700">동기화할 버전 선택:</p>
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="bg-slate-50 p-3 rounded-lg">
                                        <p className="text-xs font-bold text-slate-500 mb-2">📖 일년일독</p>
                                        {BIBLE_VERSIONS['1year'].map(v => {
                                            const planId = `1year_${v.id}`;
                                            const isChecked = selectedSyncVersions.indexOf(planId) !== -1;
                                            return (
                                                <label key={planId} className="flex items-center gap-2 py-1 cursor-pointer">
                                                    <input type="checkbox" checked={isChecked}
                                                        onChange={e => {
                                                            if (e.target.checked) setSelectedSyncVersions([...selectedSyncVersions, planId]);
                                                            else setSelectedSyncVersions(selectedSyncVersions.filter(id => id !== planId));
                                                        }} className="w-4 h-4 rounded" />
                                                    <span className="text-sm text-slate-700">{v.name}</span>
                                                </label>
                                            );
                                        })}
                                    </div>
                                    <div className="bg-slate-50 p-3 rounded-lg">
                                        <p className="text-xs font-bold text-slate-500 mb-2">📗 신약일독</p>
                                        {BIBLE_VERSIONS['nt'].map(v => {
                                            const planId = `nt_${v.id}`;
                                            const isChecked = selectedSyncVersions.indexOf(planId) !== -1;
                                            return (
                                                <label key={planId} className="flex items-center gap-2 py-1 cursor-pointer">
                                                    <input type="checkbox" checked={isChecked}
                                                        onChange={e => {
                                                            if (e.target.checked) setSelectedSyncVersions([...selectedSyncVersions, planId]);
                                                            else setSelectedSyncVersions(selectedSyncVersions.filter(id => id !== planId));
                                                        }} className="w-4 h-4 rounded" />
                                                    <span className="text-sm text-slate-700">{v.name}</span>
                                                </label>
                                            );
                                        })}
                                    </div>
                                </div>
                                <div className="bg-green-50 p-3 rounded-lg border border-green-200">
                                    <p className="text-sm text-green-700">선택됨: <strong>{selectedSyncVersions.length}개</strong> 버전</p>
                                </div>
                                <button
                                    onClick={async () => {
                                        if (selectedSyncVersions.length === 0) { alert('동기화할 버전을 선택해주세요.'); return; }
                                        if (!confirm(`${selectedSyncVersions.length}개 버전을 동기화합니다. 진행할까요?`)) return;
                                        setSyncProgress({ current: 0, total: selectedSyncVersions.length * 365, success: 0, error: 0, currentVersion: '', currentDay: 0 });
                                        const result = await syncNotionToFirestore(selectedSyncVersions);
                                        alert(`동기화 완료!\n성공: ${result.success}개\n실패: ${result.error}개`);
                                        const syncDoc = await db.collection('settings').doc('sync').get();
                                        if (syncDoc.exists) setLastSyncInfo(syncDoc.data());
                                    }}
                                    disabled={selectedSyncVersions.length === 0}
                                    className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl hover:bg-blue-700 text-lg disabled:opacity-50">
                                    📥 선택한 버전 동기화 ({selectedSyncVersions.length * 365}개)
                                </button>
                            </div>
                        )}
                    </div>
                    </div>
                )}
            </div>

            {/* Edit User Modal */}
            {editingUser && (
                <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
                        <h3 className="font-bold text-lg border-b pb-2">회원 정보 수정 ({editingUser.name})</h3>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">소속 교회</label>
                            <select value={editingUser.churchId || ''} onChange={e => {
                                const church = allChurches.find(c => c.id === e.target.value);
                                if (!church) return;
                                setEditingUser({
                                    ...editingUser,
                                    churchId: church.id,
                                    churchName: church.name,
                                    departmentId: null,
                                    departmentName: null,
                                    subgroupId: null,
                                    subgroupName: null,
                                });
                            }} className="w-full border rounded p-2 text-sm">
                                <option value="">교회를 선택하세요</option>
                                {allChurches
                                    .filter(c => !c.isDeleted)
                                    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko-KR'))
                                    .map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                            <p className="text-[11px] text-slate-400 mt-1">교회를 변경하면 부서와 소그룹은 다시 선택하도록 비워집니다.</p>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">소속 공동체</label>
                            <select value={editingUser.departmentId || ''} onChange={e => {
                                const comm = DEFAULT_DEPARTMENTS.find(c => c.id === e.target.value);
                                if (comm) setEditingUser({ ...editingUser, departmentId: comm.id, departmentName: comm.name, subgroupId: comm.subgroups[0] });
                            }} className="w-full border rounded p-2 text-sm">
                                {DEFAULT_DEPARTMENTS.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">소그룹</label>
                            <select value={editingUser.subgroupId || ''} onChange={e => setEditingUser({ ...editingUser, subgroupId: e.target.value })} className="w-full border rounded p-2 text-sm">
                                {(() => {
                                    const comm = DEFAULT_DEPARTMENTS.find(c => c.id === editingUser.departmentId);
                                    return comm ? comm.subgroups.map(s => <option key={s} value={s}>{s}</option>) : null;
                                })()}
                            </select>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">현재 Day</label>
                                <input type="number" min="1" max="365" value={editingUser.currentDay || 1}
                                    onChange={e => setEditingUser({ ...editingUser, currentDay: parseInt(e.target.value) || 1 })}
                                    className="w-full border rounded p-2 text-sm" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">독수 (readCount)</label>
                                <input type="number" min="1" value={editingUser.readCount || 1}
                                    onChange={e => setEditingUser({ ...editingUser, readCount: parseInt(e.target.value) || 1 })}
                                    className="w-full border rounded p-2 text-sm" />
                            </div>
                        </div>
                        <div className="flex gap-2 pt-4">
                            <button onClick={saveEditUser} className="flex-1 bg-blue-600 text-white py-2 rounded hover:bg-blue-700">저장</button>
                            <button onClick={() => setEditingUser(null)} className="flex-1 bg-slate-200 text-slate-600 py-2 rounded hover:bg-slate-300">취소</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Change Password Modal */}
            {changingPassword && (
                <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setChangingPassword(null)}>
                    <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
                        <h3 className="text-xl font-bold text-slate-800 mb-4 border-b pb-2">🔑 암호 변경</h3>
                        <div className="bg-blue-50 p-3 rounded-lg mb-4">
                            <p className="text-sm text-blue-700"><strong>{changingPassword.name}</strong>님의 암호를 변경합니다.</p>
                            <p className="text-xs text-blue-600 mt-1">현재 암호: {
                                typeof changingPassword.password === 'string' && changingPassword.password
                                    ? changingPassword.password
                                    : fetchedCurrentPassword === '__loading__'
                                        ? '확인 중...'
                                        : fetchedCurrentPassword === '__error__'
                                            ? '조회 실패'
                                            : fetchedCurrentPassword || '알 수 없음(이관됨/미설정)'
                            }</p>
                        </div>
                        <div className="mb-4">
                            <label className="block text-sm font-bold text-slate-600 mb-2">새 암호 (6자리 이상)</label>
                            <input type="text" value={newPassword} onChange={e => setNewPassword(e.target.value)}
                                placeholder="123456"
                                className="w-full border border-slate-300 rounded-lg p-3 text-lg font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                                autoFocus />
                            <p className="text-xs text-slate-400 mt-1">※ 사용자에게 이 암호를 전달해주세요</p>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={() => changePassword(changingPassword.uid, changingPassword.name, changingPassword.password)}
                                disabled={!newPassword || newPassword.length < 6}
                                className="flex-1 bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 font-bold">
                                암호 변경
                            </button>
                            <button onClick={() => { setChangingPassword(null); setNewPassword(''); }}
                                className="flex-1 bg-slate-200 text-slate-600 py-3 rounded-lg hover:bg-slate-300 font-bold">
                                취소
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PlatformAdminView;
