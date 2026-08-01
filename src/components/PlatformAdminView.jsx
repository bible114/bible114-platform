import React from 'react';
import Icon from './Icon';
import GoogleLinkCard from './admin/GoogleLinkCard';
import { firebase } from '../utils/firebase';
import ChurchAdminView from './ChurchAdminView';
import { adminPreviewDailyVideo, adminRenameChurch, adminSetChurchLifecycle, adminSetChurchVisibility, ensureUnaffiliatedChurch, rebuildPlatformStats, rebuildPublicChurches } from '../utils/platformApi';
import { getDaysRead, getVideoDateKST, parseAndMapChapters, extractYouTubePlaylistId } from '../utils/helpers';
import { invalidateChurchDirectoryCache, migrateChurchAccessSecrets } from '../utils/churchDirectory';
import { migrateCredentialsIfNeeded, fetchMemberCredentials } from '../utils/memberCredentials';
import { UNAFFILIATED_CHURCH_ID } from '../data/constants';
import { PlatformPopupCard } from './PlatformPopupAd';

const PlatformAdminView = ({
    currentUser,
    handleLogout,
    downloadCSV,
    adminSortBy, setAdminSortBy,
    allUsers,
    allChurches,
    DEFAULT_DEPARTMENTS,
    editingUser, setEditingUser,
    startEditUser, saveEditUser,
    changingPassword, setChangingPassword,
    newPassword, setNewPassword,
    changePassword,
    deleteUser,
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
    const [statsRefreshing, setStatsRefreshing] = React.useState(false);
    const [deleteUserConfirm, setDeleteUserConfirm] = React.useState(null); // { uid, name }
    const [viewingChurchAsAdmin, setViewingChurchAsAdmin] = React.useState(false);
    // 검색 숨김 토글의 낙관적 반영 (allChurches는 prop이라 로컬 오버라이드로 관리)
    const [hiddenOverrides, setHiddenOverrides] = React.useState({});
    const [hiddenToggling, setHiddenToggling] = React.useState(false);
    const [churchNameOverrides, setChurchNameOverrides] = React.useState({});
    const [renamingChurchId, setRenamingChurchId] = React.useState(null);
    const [lifecycleChurchId, setLifecycleChurchId] = React.useState(null);
    const [platformKakaoInput, setPlatformKakaoInput] = React.useState('');
    const [savingPlatformKakao, setSavingPlatformKakao] = React.useState(false);
    // 팝업 광고 (모든 사용자 대상, settings/platformPopup)
    const [popupInput, setPopupInput] = React.useState({ enabled: false, title: '', text: '', imageUrl: '', links: [] });
    const [popupSaving, setPopupSaving] = React.useState(false);
    const [directoryRebuilding, setDirectoryRebuilding] = React.useState(false);
    const [directoryRebuildReport, setDirectoryRebuildReport] = React.useState(null);
    const [accessSecretsMigrating, setAccessSecretsMigrating] = React.useState(false);
    const [accessSecretsOperation, setAccessSecretsOperation] = React.useState(null);
    const [accessSecretsProgress, setAccessSecretsProgress] = React.useState({ done: 0, total: 0, phase: null });
    const [accessSecretsReport, setAccessSecretsReport] = React.useState(null);
    const [checkingUnaffiliatedChurch, setCheckingUnaffiliatedChurch] = React.useState(false);
    const [fetchedCurrentPassword, setFetchedCurrentPassword] = React.useState(null); // changingPassword 모달에서 조회한 현재 암호
    const passwordCredentialRequestRef = React.useRef(0);
    const [credentialMigrating, setCredentialMigrating] = React.useState(false);
    const [credentialMigrationProgress, setCredentialMigrationProgress] = React.useState({ done: 0, total: 0 });
    const [credentialMigrationSummary, setCredentialMigrationSummary] = React.useState(null);
    const [talentResetting, setTalentResetting] = React.useState(false);
    const [talentResetProgress, setTalentResetProgress] = React.useState({ done: 0, total: 0 });
    const pendingCredentialMigration = React.useMemo(() => (
        (Array.isArray(allUsers) ? allUsers : [])
            .filter(u => u?.password !== null).length
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

    React.useEffect(() => {
        if (tab !== 'popup' || !db) return;
        db.collection('settings').doc('platformPopup').get()
            .then(doc => {
                if (!doc.exists) return;
                const d = doc.data();
                setPopupInput({
                    enabled: !!d.enabled,
                    title: d.title || '',
                    text: d.text || '',
                    imageUrl: d.imageUrl || '',
                    links: Array.isArray(d.links) ? d.links : [],
                });
            })
            .catch(e => console.error('platformPopup 로드 실패:', e));
    }, [tab, db]);

    const savePlatformPopup = async () => {
        if (!db || popupSaving) return;
        setPopupSaving(true);
        try {
            await db.collection('settings').doc('platformPopup').set({
                enabled: popupInput.enabled,
                title: popupInput.title.trim(),
                text: popupInput.text.trim(),
                imageUrl: popupInput.imageUrl.trim(),
                links: (popupInput.links || []).filter(link => link.url && link.text),
                // updatedAt이 팝업 ID 역할 — 저장할 때마다 "7일 동안 보지 않기"가 초기화되어 다시 노출된다.
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            });
            alert('팝업 광고가 저장되었습니다!');
        } catch (e) {
            console.error('팝업 광고 저장 실패:', e);
            alert('저장 실패');
        } finally {
            setPopupSaving(false);
        }
    };

    const testAutoConnection = async () => {
        setTestingConnection(true);
        setConnectionTestResult(null);
        try {
            const adultPlaylistId = extractYouTubePlaylistId(autoAdultPlaylist);
            const kidsPlaylistId = autoKidsPlaylist.trim() ? extractYouTubePlaylistId(autoKidsPlaylist) : '';
            if (!adultPlaylistId) {
                setConnectionTestResult({ ok: false, message: '성인용 재생목록을 먼저 입력해주세요.' });
                return;
            }
            const result = await adminPreviewDailyVideo({ adultPlaylistId, kidsPlaylistId });
            const targets = [
                { mode: 'adult', label: '성인용', playlistId: adultPlaylistId },
                { mode: 'kids', label: '어린이용', playlistId: kidsPlaylistId },
            ].filter(target => !!target.playlistId);
            const previews = targets.map(({ mode, label }) => {
                const entry = result.previews[mode];
                return entry
                    ? { label, ok: true, entry }
                    : { label, ok: false, error: `${result.serviceDate} 날짜와 일치하는 게시 영상이 아직 없습니다.` };
            });
            const failed = previews.filter(p => !p.ok);
            setConnectionTestResult({
                ok: failed.length === 0,
                message: failed.length === 0
                    ? `${result.serviceDate} 기준 선택 미리보기 완료`
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
        const requestId = ++passwordCredentialRequestRef.current;
        setNewPassword('');
        if (!changingPassword?.uid) { setFetchedCurrentPassword(null); return undefined; }
        if (typeof changingPassword.password === 'string' && changingPassword.password) {
            setFetchedCurrentPassword(null);
            return undefined;
        }
        setFetchedCurrentPassword('__loading__');
        fetchMemberCredentials(changingPassword.uid)
            .then(data => {
                if (passwordCredentialRequestRef.current === requestId) {
                    setFetchedCurrentPassword(data?.password || null);
                }
            })
            .catch(() => {
                if (passwordCredentialRequestRef.current === requestId) {
                    setFetchedCurrentPassword('__error__');
                }
            });
        return () => {
            if (passwordCredentialRequestRef.current === requestId) {
                passwordCredentialRequestRef.current += 1;
            }
        };
    }, [changingPassword?.uid, changingPassword?.password, setNewPassword]);

    const closePasswordModal = () => {
        passwordCredentialRequestRef.current += 1;
        setFetchedCurrentPassword(null);
        setNewPassword('');
        setChangingPassword(null);
    };

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
        setStatsRefreshing(true);
        try {
            const preview = await rebuildPlatformStats({ dryRun: true }, { expectedUid: currentUser?.uid });
            const summary = `공동체 ${preview.current.total_churches ?? '-'} → ${preview.expected.total_churches}\n독자 ${preview.current.total_readers ?? '-'} → ${preview.expected.total_readers}\n오늘 독자 ${preview.current.readers_today ?? '-'} → ${preview.expected.readers_today}\n누적 완독 ${preview.current.finished_total ?? '-'} → ${preview.expected.finished_total}\n회원 통계 표식 보정 ${preview.markerBackfill.total}명`;
            if (preview.changed.length === 0 && preview.markerBackfill.total === 0) { alert(`✅ 통계가 이미 정확합니다.\n\n${summary}`); return; }
            if (!confirm(`서버 전수 재계산 결과를 반영할까요?\n\n${summary}`)) return;
            const applied = await rebuildPlatformStats({ dryRun: false }, { expectedUid: currentUser?.uid });
            alert(`✅ 통계 재계산 완료\n\n공동체 ${applied.expected.total_churches}개 / 독자 ${applied.expected.total_readers}명 / 누적 완독 ${applied.expected.finished_total}회 / 회원 표식 ${applied.markerBackfill.total}명 보정`);
        } catch (e) {
            alert('갱신 실패: ' + e.message);
        } finally {
            setStatsRefreshing(false);
        }
    };

    const handleRebuildDirectory = async () => {
        if (!db || directoryRebuilding) return;
        setDirectoryRebuilding(true);
        setDirectoryRebuildReport(null);
        try {
            const preview = await rebuildPublicChurches(true, { expectedUid: currentUser?.uid });
            setDirectoryRebuildReport(preview);
            const { summary } = preview;
            const warning = [
                `사전점검 완료: 원본 ${summary.sourceCount}개 / 공개 예정 ${summary.expectedCount}개`,
                `새로 쓰거나 갱신 ${summary.upsertCount}개 / 삭제 ${summary.deleteCount}개`,
                `기존 공개 ${summary.publicCount}개 / 레거시 ${summary.legacyCount}개`,
                `잘못된 원본 ${summary.invalidCount}개`,
                '',
                summary.invalidCount > 0
                    ? '잘못된 원본이 있어 실제 재생성을 실행할 수 없습니다.'
                    : '이 결과대로 공개 디렉토리를 재생성할까요?',
            ].join('\n');
            if (summary.invalidCount > 0 || !confirm(warning)) return;

            const result = await rebuildPublicChurches(false, { expectedUid: currentUser?.uid });
            setDirectoryRebuildReport(result);
            invalidateChurchDirectoryCache();
            alert(`✅ 공개 교회 디렉토리 전환 완료! (${result.summary.expectedCount}개 교회)\n이제 로그인 화면은 최소 공개 필드만 사용합니다.`);
        } catch (e) {
            alert('디렉토리 재생성 실패: ' + e.message);
        } finally {
            setDirectoryRebuilding(false);
        }
    };

    const handleCheckChurchAccessSecrets = async () => {
        if (!db || accessSecretsMigrating) return;
        setAccessSecretsMigrating(true);
        setAccessSecretsOperation('dryRun');
        setAccessSecretsReport(null);
        setAccessSecretsProgress({ done: 0, total: 0, phase: 'scan' });
        try {
            const report = await migrateChurchAccessSecrets({
                dryRun: true,
                onProgress: progress => setAccessSecretsProgress({
                    done: progress.done || 0,
                    total: progress.total || 0,
                    phase: progress.phase || 'scan',
                }),
            });
            setAccessSecretsReport(report);
            alert(`사전점검 완료: 총 ${report.scanned}개 교회 · 이전 대상 ${report.migrated}개 · 원천 누락 ${report.missing.length}개 · 디렉토리 고아 ${report.orphans.length}개 · 중복 ${report.duplicates.length}개`);
        } catch (error) {
            console.error('입장코드 보안 사전점검 실패:', error);
            alert('입장코드 보안 사전점검 실패: ' + error.message);
        } finally {
            setAccessSecretsMigrating(false);
            setAccessSecretsOperation(null);
        }
    };

    const handleEnsureUnaffiliatedChurch = async () => {
        setCheckingUnaffiliatedChurch(true);
        try {
            await ensureUnaffiliatedChurch({ expectedUid: currentUser.uid });
            invalidateChurchDirectoryCache();
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
            ? `'${church.name}' 교회를 검색에서 숨깁니다.\n\n다른 사람들은 검색으로 이 교회를 찾을 수 없게 됩니다. (초대 링크로는 계속 가입/로그인 가능)\n(공동체 관리자 이메일 로그인과 슈퍼관리자 진입은 계속 가능)`
            : `'${church.name}' 교회를 검색에 다시 노출할까요?`;
        if (!confirm(msg)) return;
        setHiddenToggling(true);
        try {
            const response = await adminSetChurchVisibility({
                churchId: church.id,
                hidden: next,
            }, { expectedUid: currentUser?.uid });
            invalidateChurchDirectoryCache();
            const confirmedHidden = response.hidden;
            setHiddenOverrides(prev => ({ ...prev, [church.id]: confirmedHidden }));
            alert(confirmedHidden ? '✅ 검색에서 숨겼습니다.' : '✅ 검색에 다시 노출했습니다.');
        } catch (e) {
            console.error(e);
            alert('처리 실패: ' + e.message);
        } finally {
            setHiddenToggling(false);
        }
    };

    const renameChurch = async (church) => {
        if (church.id === UNAFFILIATED_CHURCH_ID || church.isVirtual === true) return;
        const entered = prompt('새 공동체 이름을 입력하세요.', church.name || '');
        if (entered === null) return;
        const nextName = entered.trim();
        if (!nextName || nextName.length > 200 || /[\u0000-\u001f\u007f]/.test(nextName)) {
            alert('공동체 이름은 1~200자의 일반 문자로 입력해주세요.');
            return;
        }
        if (nextName === church.name) return;
        if (!confirm(`공동체 이름을 변경할까요?\n\n${church.name} → ${nextName}\n\n기존 회원의 저장된 이름은 다음 로그인 때 서버가 점진적으로 보정합니다.`)) return;
        setRenamingChurchId(church.id);
        try {
            const response = await adminRenameChurch({
                churchId: church.id,
                name: nextName,
            }, { expectedUid: currentUser?.uid });
            invalidateChurchDirectoryCache();
            setChurchNameOverrides(prev => ({ ...prev, [church.id]: response.name }));
            alert(`✅ 공동체 이름을 '${response.name}'(으)로 변경했습니다.`);
        } catch (e) {
            console.error(e);
            alert('이름 변경 실패: ' + e.message);
        } finally {
            setRenamingChurchId(null);
        }
    };

    // 전체 회원 문서의 평문 password/phone4를 private 하위문서로 이관하고 본문서에 null 마커를 남긴다.
    // userDocToState는 phone4를 매핑하지 않으므로 allUsers 대신 최신 문서를 직접 조회한다.
    const handleMigrateCredentials = async () => {
        if (!db) return;
        if (!confirm('전체 회원의 자격증명을 private 하위문서로 이관합니다. 계속하시겠습니까?')) return;
        setCredentialMigrating(true);
        setCredentialMigrationSummary(null);
        try {
            const snap = await db.collection('users').get();
            const docs = snap.docs;
            setCredentialMigrationProgress({ done: 0, total: docs.length });
            let migrated = 0;
            let skipped = 0;
            const failed = [];
            for (let i = 0; i < docs.length; i += 10) {
                const chunk = docs.slice(i, i + 10);
                const results = await Promise.all(
                    chunk.map(doc => migrateCredentialsIfNeeded(
                        doc.id,
                        doc.data(),
                        { returnResult: true }
                    ))
                );
                results.forEach((result, index) => {
                    if (result.status === 'migrated') migrated++;
                    else if (result.status === 'skipped') skipped++;
                    else failed.push({
                        name: String(chunk[index].data()?.name || '이름 없음'),
                        message: result.error?.message || '알 수 없는 오류',
                    });
                });
                setCredentialMigrationProgress({ done: Math.min(i + 10, docs.length), total: docs.length });
            }
            setCredentialMigrationSummary({
                total: docs.length,
                migrated,
                skipped,
                failed: failed.length,
                checkedAt: new Date().toISOString(),
            });
            if (failed.length > 0) {
                console.error(
                    '자격증명 전수 이관 실패:',
                    failed.map(entry => entry.message)
                );
                const failedNames = failed.slice(0, 5).map(entry => entry.name).join(', ');
                alert(
                    `이관 부분 완료: ${migrated}명 이관, ${skipped}명은 이미 완료/대상 아님, `
                    + `${failed.length}명 실패\n\n실패: ${failedNames}`
                    + `${failed.length > 5 ? ` 외 ${failed.length - 5}명` : ''}`
                    + '\n실패 대상을 점검한 뒤 재처리해야 합니다.'
                );
            } else {
                alert(`이관 완료: ${migrated}명 이관, ${skipped}명은 이미 완료/대상 아님`);
            }
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
            const [usersSnap, rosterSnap] = await Promise.all([
                db.collection('users').get(),
                db.collectionGroup('roster').get(),
            ]);
            const targets = [
                ...usersSnap.docs.map(doc => ({ type: 'user', ref: doc.ref })),
                ...rosterSnap.docs.map(doc => ({ type: 'roster', ref: doc.ref })),
            ];
            setTalentResetProgress({ done: 0, total: targets.length });
            let processed = 0;
            for (let i = 0; i < targets.length; i += 10) {
                const batch = db.batch();
                targets.slice(i, i + 10).forEach(target => {
                    batch.update(target.ref, {
                        talent: 0,
                        ...(target.type === 'user' ? {
                            talentMigrated: true,
                            talentWalletMigrated: true,
                        } : {}),
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    });
                });
                await batch.commit();
                processed = Math.min(i + 10, targets.length);
                setTalentResetProgress({ done: processed, total: targets.length });
            }
            alert(`달란트 잔액 초기화 완료: ${usersSnap.size}명 + 공동체 지갑 ${rosterSnap.size}개 처리`);
        } catch (e) {
            alert('달란트 잔액 초기화 실패: ' + e.message);
        } finally {
            setTalentResetting(false);
        }
    };

    const seedFakeUsers = () => {
        alert('테스트 계정 생성은 통계 원장과 결속된 서버 작업이 마련될 때까지 지원하지 않습니다.');
    };

    const deleteSeedUsers = async (churchId) => {
        void churchId;
        alert('테스트 계정 삭제는 통계 원장과 결속된 서버 작업이 마련될 때까지 지원하지 않습니다.');
    };

    const deleteChurch = async church => {
        if (church.id === UNAFFILIATED_CHURCH_ID || church.isVirtual === true) return;
        const active = church.isDeleted === true;
        const verb = active ? '복원' : '비활성화';
        const warning = active
            ? `"${church.name}" 공동체를 복원할까요?\n\n이 비활성화 세대에서 중단된 주 소속 사용자만 함께 복원됩니다.`
            : `"${church.name}" 공동체를 비활성화할까요?\n\n검색·신규 가입과 공동체 활동이 즉시 중단됩니다. 주 소속 사용자는 복원 가능한 상태로 전환되며, 외부 소속·달란트·미처리 구매는 삭제하거나 자동 환불하지 않습니다.`;
        if (!confirm(warning)) return;
        setLifecycleChurchId(church.id);
        try {
            const result = await adminSetChurchLifecycle({ churchId: church.id, active }, { expectedUid: currentUser?.uid });
            invalidateChurchDirectoryCache();
            alert(`✅ 공동체 ${verb} 완료\n주 소속 사용자 ${result.affectedUsers}명\n양수 잔액 roster ${result.positiveRosterCount}건 (합계 ⭐${result.positiveTalentTotal})\n미처리 구매 ${result.pendingPurchaseCount}건\n\n잔액과 미처리 구매는 동결 보존되며 오프라인 정산 대상입니다.`);
            window.location.reload();
        } catch (e) {
            console.error(e);
            alert(`${verb} 실패: ${e.message}`);
        } finally {
            setLifecycleChurchId(null);
        }
    };

    const users = Array.isArray(allUsers) ? allUsers : [];
    const churches = (Array.isArray(allChurches) ? allChurches : []).map(church => ({
        ...church,
        ...(churchNameOverrides[church.id] ? { name: churchNameOverrides[church.id] } : {}),
    }));
    const departments = Array.isArray(DEFAULT_DEPARTMENTS) ? DEFAULT_DEPARTMENTS : [];
    const todayStr = new Date().toDateString();

    const churchStats = churches.map(church => {
        const members = users.filter(u => u.churchId === church.id && u.role !== 'churchAdmin');
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
        ? users.filter(u => u.churchId === selectedChurchId && u.role !== 'churchAdmin')
        : [];

    const TABS = [
        ['overview', '📊 전체 현황'],
        ['churches', '🏛️ 교회 목록'],
        ['members', '👥 회원 목록'],
        ['popup', '📣 팝업 광고'],
        ['dailyVideo', '🎬 매일 영상'],
        ['sync', '🛠 시스템'],
    ];

    if (viewingChurchAsAdmin && selectedChurch) {
        const fakeChurchAdmin = {
            uid: currentUser.uid,
            churchId: selectedChurch.id,
            churchName: selectedChurch.name,
            name: '슈퍼관리자',
            role: 'churchAdmin',
        };
        return (
            <div>
                <div className="bg-amber-500 text-white text-xs font-bold px-4 py-2 flex items-center justify-between sticky top-0 z-50">
                    <span>🛠️ 슈퍼관리자 모드 — {selectedChurch.name} 공동체 관리자 화면 미리보기</span>
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
                    <p className="text-xs text-slate-400">{churches.length}개 교회 · {users.length}명</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => downloadCSV(users)}
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
                                    <div className="text-3xl font-bold text-blue-600">{adminStats?.totalUsers || 0}</div>
                                    <div className="text-xs text-slate-500">전체 회원</div>
                                </div>
                                <div className="bg-green-50 p-4 rounded-xl text-center">
                                    <div className="text-3xl font-bold text-green-600">{adminStats?.readToday || 0}</div>
                                    <div className="text-xs text-slate-500">오늘 읽은 사람</div>
                                </div>
                                <div className="bg-orange-50 p-4 rounded-xl text-center">
                                    <div className="text-3xl font-bold text-orange-600">{adminStats?.readRate || 0}%</div>
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
                                        <button onClick={() => { setTab('churches'); setSelectedChurchId(church.id); }}
                                            className="text-xs text-blue-600 bg-blue-50 px-2.5 py-1 rounded-lg font-bold shrink-0 hover:bg-blue-100">관리</button>
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
                                <button onClick={() => downloadPeriodStatsCSV(db, users, startDate, endDate)}
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
                                            onClick={() => renameChurch(selectedChurch)}
                                            disabled={renamingChurchId === selectedChurch.id || selectedChurch.id === UNAFFILIATED_CHURCH_ID || selectedChurch.isVirtual === true}
                                            className="flex items-center gap-1.5 bg-white text-slate-600 border border-slate-200 text-sm font-bold px-4 py-2 rounded-xl hover:bg-slate-50 shadow-sm disabled:cursor-not-allowed disabled:opacity-50">
                                            {renamingChurchId === selectedChurch.id ? '이름 변경 중...' : '✏️ 이름 변경'}
                                        </button>
                                        <button
                                            onClick={() => toggleChurchHidden(selectedChurch)}
                                            disabled={hiddenToggling}
                                            className={`flex items-center gap-1.5 text-sm font-bold px-4 py-2 rounded-xl shadow-sm disabled:opacity-50 ${isChurchHidden(selectedChurch)
                                                ? 'bg-slate-700 text-white hover:bg-slate-800'
                                                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}>
                                            {isChurchHidden(selectedChurch) ? '🙈 검색 숨김 중 (해제하기)' : '🔍 검색에서 숨기기'}
                                        </button>
                                        <button
                                            onClick={() => {
                                                if (selectedChurch.id === UNAFFILIATED_CHURCH_ID || selectedChurch.isVirtual === true) return;
                                                setViewingChurchAsAdmin(true);
                                            }}
                                            disabled={selectedChurch.id === UNAFFILIATED_CHURCH_ID || selectedChurch.isVirtual === true}
                                            className="flex items-center gap-1.5 bg-blue-600 text-white text-sm font-bold px-4 py-2 rounded-xl hover:bg-blue-700 shadow-sm disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500">
                                            {selectedChurch.id === UNAFFILIATED_CHURCH_ID || selectedChurch.isVirtual === true
                                                ? '플랫폼 가상 공동체'
                                                : '⛪ 공동체 관리자 화면으로 보기'}
                                        </button>
                                    </div>
                                </div>
                                <div className="bg-white rounded-xl shadow-sm p-6">
                                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-6">
                                        <div>
                                            <h2 className="text-xl font-black text-slate-800">🏛️ {selectedChurch.name}</h2>
                                            <p className="mt-1 text-xs text-slate-500">
                                                관리자 연락:{' '}
                                                {selectedChurch.adminEmail ? (
                                                    <a
                                                        href={`mailto:${selectedChurch.adminEmail}`}
                                                        className="font-bold text-blue-600 underline underline-offset-2 hover:text-blue-800"
                                                    >
                                                        {selectedChurch.adminEmail}
                                                    </a>
                                                ) : '이메일 미설정'}
                                            </p>
                                            {(selectedChurch.id === UNAFFILIATED_CHURCH_ID || selectedChurch.isVirtual === true) && (
                                                <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800">
                                                    실제 공동체 관리자가 없는 플랫폼 가상 공동체입니다. 회원 현황은 이 화면에서 관리합니다.
                                                </p>
                                            )}
                                            <p className="text-xs text-slate-400">입장코드: <span className="bg-slate-100 px-1.5 rounded">비공개 관리</span></p>
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
                                                    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko-KR'))
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
                                                onClick={seedFakeUsers}
                                                disabled
                                                className="flex-1 bg-red-50 text-red-500 py-2.5 rounded-xl text-xs font-bold hover:bg-red-100 border border-red-100 disabled:opacity-50 transition-colors">
                                                가짜 교인 추가 일시중단
                                            </button>
                                            <button
                                                onClick={() => deleteSeedUsers(selectedChurch.id)}
                                                disabled
                                                className="flex-1 bg-slate-50 text-slate-400 py-2.5 rounded-xl text-xs font-bold hover:bg-slate-100 border border-slate-200 disabled:opacity-50 transition-colors">
                                                테스트 데이터 삭제 일시중단
                                            </button>
                                        </div>
                                        <p className="mb-3 text-center text-[11px] font-bold text-amber-700">
                                            통계 정산 보완 중 — 공동체 비활성화·복원 일시중단
                                        </p>
                                        <button
                                            onClick={() => deleteChurch(selectedChurch)}
                                            disabled
                                            className="w-full bg-amber-100 hover:bg-amber-200 text-amber-800 py-2.5 rounded-xl text-xs font-bold disabled:opacity-50 transition-colors border border-amber-300">
                                            {selectedChurch.isDeleted === true ? '♻️ 공동체 복원 일시중단' : '⚠️ 공동체 비활성화 일시중단'}
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
                                                    <p className="mt-0.5 text-xs text-slate-500">
                                                        {church.adminEmail ? (
                                                            <a
                                                                href={`mailto:${church.adminEmail}`}
                                                                onClick={event => event.stopPropagation()}
                                                                className="font-bold text-blue-600 underline underline-offset-2 hover:text-blue-800"
                                                            >
                                                                {church.adminEmail}
                                                            </a>
                                                        ) : '이메일 미설정'}
                                                    </p>
                                                    {(church.pastorName || church.denomination) && (
                                                        <p className="text-xs text-slate-500 mt-1">
                                                            {church.pastorName && <span className="mr-2">👤 {church.pastorName}</span>}
                                                            {church.denomination && <span className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-500">{church.denomination}</span>}
                                                        </p>
                                                    )}
                                                </div>
                                                <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-1 rounded-full shrink-0">입장코드 비공개</span>
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
                                        const sorted = [...users].sort((a, b) => {
                                            if (adminSortBy === 'name') return (a.name || '').localeCompare(b.name || '', 'ko-KR');
                                            if (adminSortBy === 'day') return getDaysRead(b) - getDaysRead(a);
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
                                            const totalDays = getDaysRead(u);
                                            const churchName = churches.find(c => c.id === u.churchId)?.name || u.churchName || '-';
                                            return (
                                                <tr key={idx} className={`border-b hover:bg-slate-50 ${readToday ? 'bg-green-50' : ''}`}>
                                                    <td className="px-3 py-3 text-center text-xs text-slate-400 font-mono italic">{idx + 1}</td>
                                                    <td className="px-3 py-3 font-medium text-slate-900">{u.name}{u.accountType === 'personal' && <span className="ml-2 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-600">개인</span>}{['kakao.com', 'oidc.kakao'].includes(u.authProvider) && <span className="ml-1 rounded-full bg-[#FEE500] px-2 py-0.5 text-[10px] font-bold text-[#191919]">카카오</span>}{u.accountType === 'personal' && (u.authProvider === 'google.com' || (!u.authProvider && !String(u.email || '').endsWith('@bible.local'))) && <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">Google</span>}{readToday && <span className="ml-1 text-green-500">✓</span>}</td>
                                                    <td className="px-3 py-3 text-xs text-slate-500">{u.accountType === 'personal' ? '개인 계정' : churchName}</td>
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
                                                            {u.accountType !== 'personal' || (!u.authProvider && String(u.email || '').endsWith('@bible.local'))
                                                                ? <button onClick={() => setChangingPassword(u)} className="text-purple-500 p-1 bg-purple-50 rounded" title="암호 확인 및 변경"><Icon name="refresh" size={14} /></button>
                                                                : <span className="rounded bg-slate-100 px-1.5 py-1 text-[10px] font-bold text-slate-400" title="소셜 개인 계정은 비밀번호가 없습니다">{['kakao.com', 'oidc.kakao'].includes(u.authProvider) ? '카카오 로그인' : 'Google 로그인'}</span>}
                                                            <button onClick={() => startEditUser(u)} className="text-blue-500 p-1 bg-blue-50 rounded" title="정보 수정"><Icon name="edit" size={14} /></button>
                                                            {u.role === 'member' && <button onClick={() => setDeleteUserConfirm({ uid: u.uid, name: u.name })} className="text-red-500 p-1 bg-red-50 rounded" title="삭제"><Icon name="trash" size={14} /></button>}
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

                {/* ── 팝업 광고 (모든 사용자) / 교회별 카카오 ── */}
                {tab === 'popup' && (
                    <div className="space-y-5">
                        <div className="bg-white rounded-xl shadow-sm p-6">
                            <h2 className="text-base font-bold text-slate-800 mb-1">📣 팝업 광고 (모든 사용자)</h2>
                            <p className="text-xs text-slate-400 mb-4 leading-relaxed">
                                활성화하면 모든 사용자(게스트 포함)의 성경 읽기 화면에 팝업으로 표시됩니다.
                                내용을 다시 저장하면 &quot;일주일 동안 보지 않기&quot;를 눌렀던 사용자에게도 새 팝업으로 다시 보여요.
                            </p>
                            <label className="block text-sm font-bold text-slate-600 mb-2">제목</label>
                            <input type="text" value={popupInput.title}
                                onChange={e => setPopupInput(prev => ({ ...prev, title: e.target.value }))}
                                placeholder="예: 가을 성경통독 챌린지 안내"
                                className="w-full p-3 border rounded-xl text-sm bg-slate-50 focus:ring-2 focus:ring-blue-500 outline-none" />
                            <label className="block text-sm font-bold text-slate-600 mb-2 mt-4">내용</label>
                            <textarea value={popupInput.text}
                                onChange={e => setPopupInput(prev => ({ ...prev, text: e.target.value }))}
                                placeholder="팝업에 표시할 내용을 입력하세요..."
                                rows={4}
                                className="w-full p-3 border rounded-xl text-sm resize-none focus:ring-2 focus:ring-blue-500 outline-none" />
                            <label className="block text-sm font-bold text-slate-600 mb-2 mt-4">이미지 URL (선택)</label>
                            <input type="url" value={popupInput.imageUrl}
                                onChange={e => setPopupInput(prev => ({ ...prev, imageUrl: e.target.value }))}
                                placeholder="https://... (팝업 상단에 표시될 이미지)"
                                className="w-full p-3 border rounded-xl text-sm bg-slate-50 focus:ring-2 focus:ring-blue-500 outline-none" />

                            <div className="space-y-3 mt-4">
                                <div className="flex justify-between items-center">
                                    <label className="text-sm font-bold text-slate-600">링크 버튼</label>
                                    <button onClick={() => setPopupInput(prev => ({ ...prev, links: [...(prev.links || []), { url: '', text: '' }] }))}
                                        className="text-xs bg-blue-50 text-blue-600 px-3 py-1.5 rounded-lg font-bold flex items-center gap-1 hover:bg-blue-100">
                                        <Icon name="plus" size={12} /> 버튼 추가
                                    </button>
                                </div>
                                {(popupInput.links || []).map((link, idx) => (
                                    <div key={idx} className="bg-slate-50 p-3 rounded-xl relative border border-slate-100">
                                        <button onClick={() => setPopupInput(prev => ({ ...prev, links: prev.links.filter((_, i) => i !== idx) }))}
                                            className="absolute -top-2 -right-2 bg-white text-red-500 p-1 rounded-full shadow border border-red-100">
                                            <Icon name="trash" size={12} />
                                        </button>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            <input type="text" value={link.text}
                                                onChange={e => { const links = [...popupInput.links]; links[idx] = { ...links[idx], text: e.target.value }; setPopupInput(prev => ({ ...prev, links })); }}
                                                placeholder="버튼 글자 (예: 자세히 보기)"
                                                className="w-full p-2 border rounded-lg text-sm bg-white" />
                                            <input type="url" value={link.url}
                                                onChange={e => { const links = [...popupInput.links]; links[idx] = { ...links[idx], url: e.target.value }; setPopupInput(prev => ({ ...prev, links })); }}
                                                placeholder="https://..."
                                                className="w-full p-2 border rounded-lg text-sm bg-white" />
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-100">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" checked={popupInput.enabled}
                                        onChange={e => setPopupInput(prev => ({ ...prev, enabled: e.target.checked }))}
                                        className="w-5 h-5 rounded border-slate-300 text-blue-600" />
                                    <span className="text-sm font-bold text-slate-600">팝업 활성화</span>
                                </label>
                                <button onClick={savePlatformPopup} disabled={popupSaving}
                                    className="bg-blue-600 text-white px-8 py-2.5 rounded-xl font-bold hover:bg-blue-700 shadow-sm disabled:bg-slate-300">
                                    {popupSaving ? '저장 중...' : '저장하기'}
                                </button>
                            </div>

                            {(popupInput.title || popupInput.text) && (
                                <div className="mt-4 p-4 bg-slate-100 rounded-xl border-2 border-dashed border-slate-300">
                                    <p className="text-xs text-slate-400 mb-3 font-bold uppercase">팝업 미리보기</p>
                                    <div className="flex justify-center">
                                        <PlatformPopupCard popup={popupInput} preview />
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="bg-white rounded-xl shadow-sm p-6">
                            <h2 className="text-base font-bold text-slate-800 mb-4">💬 교회별 카카오 채널</h2>
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
                                            <div className="rounded-lg border border-indigo-100 bg-indigo-50 p-2.5 text-xs font-bold text-indigo-700">
                                                서버 Secret(<code>YOUTUBE_API_KEY</code>)으로 이동되었습니다. 이 화면에서는 키를 저장하거나 표시하지 않습니다.
                                            </div>
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
                                                            <span className="text-[11px] font-black px-2 py-1 rounded-full bg-green-50 text-green-700">
                                                                날짜 매칭
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

                {/* ── 시스템 유지보수 도구 ── */}
                {tab === 'sync' && (
                    <div className="space-y-5">
                    <GoogleLinkCard
                        accountUid={currentUser?.uid}
                        accountRole={currentUser?.role}
                    />
                    {/* 플랫폼 문의 카카오 채널 */}
                    <div className="bg-white rounded-xl shadow-sm p-6">
                        <h2 className="text-base font-bold text-slate-800 mb-1">💬 플랫폼 문의 카카오 채널</h2>
                        <p className="text-xs text-slate-400 mb-4">공동체 관리자 화면 상단에 표시되는 문의 버튼입니다. 공동체 관리자들이 운영자에게 직접 연락할 수 있습니다.</p>
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
                                서버가 교회 원본을 사전점검한 뒤 <code className="bg-sky-100 px-1 rounded">publicChurches</code>와 호환용 기존 디렉토리를 함께 갱신합니다.
                                로그인 화면은 현재 최소 공개 필드만 담은 <code className="bg-sky-100 px-1 rounded">publicChurches</code>를 사용하며, 이 버튼은 변경 건수를 먼저 보여준 뒤 안전하게 다시 맞춥니다.
                            </p>
                            <button
                                onClick={handleRebuildDirectory}
                                disabled={directoryRebuilding}
                                className="bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
                            >
                                {directoryRebuilding ? '재생성 중...' : '디렉토리 재생성'}
                            </button>
                            {directoryRebuildReport && (
                                <p className="text-xs text-sky-800 mt-3">
                                    {directoryRebuildReport.dryRun ? '사전점검' : '실행'} 결과 · 원본 {directoryRebuildReport.summary.sourceCount}개 · 공개 {directoryRebuildReport.summary.expectedCount}개 · 갱신 {directoryRebuildReport.summary.upsertCount}개 · 삭제 {directoryRebuildReport.summary.deleteCount}개 · 오류 {directoryRebuildReport.summary.invalidCount}개
                                </p>
                            )}
                        </div>

                        {/* 공개 입장코드 보안 이전 */}
                        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 mb-6">
                            <h3 className="text-sm font-bold text-rose-800 mb-1">🔐 입장코드 보안 이전·점검</h3>
                            <p className="text-xs text-rose-700 mb-3">
                                운영 이전은 완료되었습니다. 이 화면은 공개 코드·해시가 다시 생기지 않았는지 쓰기 없이 점검합니다.
                                새 입장코드가 필요한 교회는 해당 공동체 관리자 화면의 서버 변경 기능을 사용합니다.
                            </p>
                            <div className="flex flex-wrap gap-2">
                                <button
                                    onClick={handleCheckChurchAccessSecrets}
                                    disabled={accessSecretsMigrating}
                                    className="bg-white border border-rose-300 hover:bg-rose-100 disabled:opacity-50 text-rose-800 text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
                                >
                                    {accessSecretsMigrating && accessSecretsOperation === 'dryRun'
                                        ? `사전점검 중... (${accessSecretsProgress.done}/${accessSecretsProgress.total || '?'})`
                                        : '1. 쓰기 없는 사전점검'}
                                </button>
                            </div>
                            {accessSecretsReport && (
                                <div className="mt-3 rounded-lg bg-white/70 p-3 text-xs text-rose-800">
                                    <p className="font-bold">
                                        {accessSecretsReport.dryRun ? '사전점검 완료' : '실제 이전 완료'} · 총 {accessSecretsReport.scanned}개 · 이전 대상 {accessSecretsReport.migrated}개 · 기존 비공개 {accessSecretsReport.alreadyPrivate}개 · 원천 누락 {accessSecretsReport.missing.length}개
                                    </p>
                                    <p className="mt-2">
                                        원천별: 기존 비공개 {accessSecretsReport.sourceCounts.privateAccess} · 공개 교회 해시 {accessSecretsReport.sourceCounts.publicChurchHash} · 디렉토리 해시 {accessSecretsReport.sourceCounts.directoryHash} · 공개 입장코드 {accessSecretsReport.sourceCounts.publicChurchCode} · 레거시 코드 {accessSecretsReport.sourceCounts.legacyPublicCode}
                                    </p>
                                    <p className="mt-1">
                                        공개 디렉토리 {accessSecretsReport.directoryCount}개 항목 · 고아 {accessSecretsReport.orphans.length}개 · 중복 ID {accessSecretsReport.duplicates.length}개
                                    </p>
                                    {accessSecretsReport.missing.length > 0 && (
                                        <div className="mt-2">
                                            <p className="font-bold">새 입장코드 설정이 필요한 교회</p>
                                            <p className="mt-1 break-words">
                                                {accessSecretsReport.missing.map(church => `${church.name} (${church.id})`).join(', ')}
                                            </p>
                                        </div>
                                    )}
                                    {accessSecretsReport.orphans.length > 0 && (
                                        <div className="mt-2">
                                            <p className="font-bold">교회 문서가 없는 디렉토리 항목</p>
                                            <p className="mt-1 break-words">
                                                {accessSecretsReport.orphans.map(church => `${church.name} (${church.id})`).join(', ')}
                                            </p>
                                        </div>
                                    )}
                                    {accessSecretsReport.duplicates.length > 0 && (
                                        <div className="mt-2">
                                            <p className="font-bold">중복 디렉토리 ID</p>
                                            <p className="mt-1 break-words">
                                                {accessSecretsReport.duplicates.map(church => `${church.name} (${church.id}, ${church.count}건)`).join(', ')}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            )}
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
                        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 mb-6">
                            <h3 className="text-sm font-bold text-indigo-800 mb-1">🔐 자격증명 보호 상태 확인·이관</h3>
                            <p className="text-xs text-indigo-700 mb-3">
                                회원 원문을 전수 확인해 평문 비밀번호·전화번호 뒤 4자리를 비공개 하위문서로 옮깁니다.
                                화면 목록만으로는 전화번호 전용 레거시 상태를 알 수 없어 자동으로 “완료”라고 단정하지 않습니다.
                            </p>
                            <button
                                onClick={handleMigrateCredentials}
                                disabled={credentialMigrating}
                                className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
                            >
                                {credentialMigrating
                                    ? `확인·이관 중... (${credentialMigrationProgress.done}/${credentialMigrationProgress.total})`
                                    : credentialMigrationSummary?.failed === 0
                                        ? '전체 회원 상태 다시 확인·이관'
                                        : pendingCredentialMigration > 0
                                        ? `전체 회원 확인·이관 (${pendingCredentialMigration}명 이상 점검 필요)`
                                        : '전체 회원 상태 다시 확인·이관'}
                            </button>
                            {credentialMigrationSummary && (
                                <p className={`mt-2 text-xs font-bold ${credentialMigrationSummary.failed > 0 ? 'text-red-700' : 'text-indigo-700'}`}>
                                    최근 전수 확인: 총 {credentialMigrationSummary.total}명 · 이관 {credentialMigrationSummary.migrated}명 ·
                                    기존 완료/대상 아님 {credentialMigrationSummary.skipped}명 · 실패 {credentialMigrationSummary.failed}명
                                </p>
                            )}
                        </div>

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
                    </div>
                    </div>
                )}
            </div>

            {/* Edit User Modal */}
            {editingUser && (
                <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
                        <h3 className="font-bold text-lg border-b pb-2">회원 정보 수정 ({editingUser.name})</h3>
                        {editingUser.role === 'member' && editingUser.accountType !== 'personal' && <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">소속 교회</label>
                            <select value={editingUser.churchId || ''} onChange={e => {
                                const church = churches.find(c => c.id === e.target.value);
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
                                {churches
                                    .filter(c => !c.isDeleted)
                                    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko-KR'))
                                    .map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                            <p className="text-[11px] text-slate-400 mt-1">교회를 변경하면 부서와 소그룹은 다시 선택하도록 비워집니다.</p>
                        </div>}
                        {editingUser.role === 'member' && editingUser.accountType !== 'personal' && <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">소속 공동체</label>
                            <select value={editingUser.departmentId || ''} onChange={e => {
                                const comm = departments.find(c => c.id === e.target.value);
                                if (comm) setEditingUser({ ...editingUser, departmentId: comm.id, departmentName: comm.name, subgroupId: comm.subgroups[0] });
                            }} className="w-full border rounded p-2 text-sm">
                                {departments.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                        </div>}
                        {editingUser.role === 'member' && editingUser.accountType !== 'personal' && <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">소그룹</label>
                            <select value={editingUser.subgroupId || ''} onChange={e => setEditingUser({ ...editingUser, subgroupId: e.target.value })} className="w-full border rounded p-2 text-sm">
                                {(() => {
                                    const comm = departments.find(c => c.id === editingUser.departmentId);
                                    return comm ? comm.subgroups.map(s => <option key={s} value={s}>{s}</option>) : null;
                                })()}
                            </select>
                        </div>}
                        {editingUser.role === 'member' && editingUser.accountType === 'personal' && <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs text-blue-700">개인 계정의 공동체 소속은 roster에서 관리됩니다. 읽기 진도는 서버 읽기 원장에서 관리됩니다.</div>}
                        {editingUser.role !== 'member' && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">관리자 계정의 소속 교회는 권한 범위를 결정하므로 이 화면에서 변경할 수 없습니다. 정식 관리자 위임 절차를 이용해주세요.</div>}
                        {/* 서버 읽기 원장 참고값 — 이 모달에서는 수정하지 않는다. */}
                        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <p className="text-[11px] font-bold text-slate-500">현재 Day</p>
                                    <p className="mt-1 text-sm font-black text-slate-700">DAY {editingUser.currentDay || 1}</p>
                                </div>
                                <div>
                                    <p className="text-[11px] font-bold text-slate-500">회독</p>
                                    <p className="mt-1 text-sm font-black text-slate-700">{editingUser.readCount || 1}독</p>
                                </div>
                            </div>
                            <p className="mt-2 text-[11px] font-bold text-slate-500">읽기 진도와 회독은 서버 읽기 원장에서만 변경됩니다.</p>
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
                <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={closePasswordModal}>
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
                            <button onClick={closePasswordModal}
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
