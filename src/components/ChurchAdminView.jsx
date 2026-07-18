import React, { useState, useEffect, useRef } from 'react';
import { auth, db, firebase } from '../utils/firebase';
import ChurchAdminTutorial from './ChurchAdminTutorial';
import { fetchMemberCredentials } from '../utils/memberCredentials';
import { setMemberPasswordByAdmin } from '../utils/adminPassword';
import { calculateSubgroupStats, computeAtRisk } from '../utils/statsUtils';
import { belongsToDepartment, getMembershipList } from '../utils/memberships';
import { downloadCSV } from '../utils/exportUtils';
import {
    StatCard,
    ProgressBar,
    DonutStat,
    AdminDataTable,
    SlideOverPanel,
    ConfirmDialog,
    ToastContainer,
    useToast,
} from './admin';
import QRCode from 'qrcode';
import { SITE_URL, UNAFFILIATED_CHURCH_ID } from '../data/constants';
import { mergePrimaryAndRosterMembers, rosterSnapshotToMembers } from '../utils/rosterMembers';
import { getDaysRead } from '../utils/helpers';
import OrganizationTab from './churchAdmin/OrganizationTab';

const ADMIN_INITIAL_LOAD_TIMEOUT_MS = 15_000;

const withAdminLoadTimeout = (promise, timeoutMs = ADMIN_INITIAL_LOAD_TIMEOUT_MS) => new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('CHURCH_ADMIN_LOAD_TIMEOUT')), timeoutMs);
    Promise.resolve(promise).then(
        value => {
            window.clearTimeout(timer);
            resolve(value);
        },
        error => {
            window.clearTimeout(timer);
            reject(error);
        }
    );
});
import AnnouncementTab from './churchAdmin/AnnouncementTab';
import SettingsTab from './churchAdmin/SettingsTab';
import DashboardTab from './churchAdmin/DashboardTab';
import MembersTab from './churchAdmin/MembersTab';
import TalentShopTab from './churchAdmin/TalentShopTab';
import { TALENT_PROGRAM_SCHEMA_VERSION } from '../utils/talentProgram';
import { normalizeChurchEntryCode } from '../utils/entryCode';
import {
    hasValidV2RefundWalletSnapshot,
    mergeAdminTalentPurchases,
    resolvePurchaseRefundWalletKind,
} from '../utils/talentPurchases';
import {
    adminCounterSale,
    adminDeliverPurchase,
    adminRefundPurchase,
    createRequestId,
    rotateChurchAccessCode,
} from '../utils/platformApi';
import { reconcileStoredRequestIds } from '../utils/adminTalentRequests';

const SHARED_TALENT_MARKET_ID = 'shared';
const PENDING_PURCHASE_PAGE_SIZE = 100;
const RECENT_PURCHASE_LIMIT = 200;
const ADMIN_TALENT_REQUEST_STORAGE_PREFIX = 'b114_admin_talent_request_v1:';
const adminTalentRequestFallback = new Map();
const departmentTalentMarketId = departmentId => `department_${departmentId}`;

const adminTalentRequestKey = parts => (
    `${ADMIN_TALENT_REQUEST_STORAGE_PREFIX}${parts
        .map(value => encodeURIComponent(String(value ?? ''))).join(':')}`
);

const getOrCreateAdminTalentRequestId = key => {
    try {
        const stored = window.sessionStorage.getItem(key);
        if (stored) {
            adminTalentRequestFallback.set(key, stored);
            return stored;
        }
    } catch {
        // sessionStorage를 막는 브라우저에서도 현재 페이지 재시도는 멱등을 유지한다.
    }
    const pending = adminTalentRequestFallback.get(key);
    if (pending) return pending;
    const requestId = createRequestId();
    adminTalentRequestFallback.set(key, requestId);
    try {
        window.sessionStorage.setItem(key, requestId);
    } catch {
        // in-memory fallback 유지
    }
    return requestId;
};

const clearAdminTalentRequestId = key => {
    adminTalentRequestFallback.delete(key);
    try {
        window.sessionStorage.removeItem(key);
    } catch {
        // in-memory fallback은 이미 정리됨
    }
};

const reconcileAdminTalentRequestIds = completedRequestIds => {
    let storage = null;
    try {
        storage = window.sessionStorage;
    } catch {
        // in-memory fallback만 정리한다.
    }
    reconcileStoredRequestIds({
        completedRequestIds,
        fallback: adminTalentRequestFallback,
        storage,
        prefix: ADMIN_TALENT_REQUEST_STORAGE_PREFIX,
    });
};

const isDefiniteAdminTalentFailure = error => (
    error?.status >= 400 && error.status < 500 && error.retryable !== true
);

const promoteTalentShopConfig = (rawShop, departments = []) => {
    const raw = rawShop && typeof rawShop === 'object' ? rawShop : {};
    if (raw.schemaVersion === TALENT_PROGRAM_SCHEMA_VERSION && raw.departmentSettings && raw.markets) {
        return {
            ...raw,
            enabled: raw.enabled === true,
            items: Array.isArray(raw.items) ? raw.items.filter(Boolean) : [],
            departmentSettings: { ...raw.departmentSettings },
            markets: Object.fromEntries(Object.entries(raw.markets).map(([id, market]) => [id, {
                ...(market || {}),
                id,
                name: market?.name || id,
                enabled: market?.enabled !== false,
                items: Array.isArray(market?.items) ? market.items.filter(Boolean) : [],
            }])),
        };
    }

    const legacyItems = Array.isArray(raw.items) ? raw.items.filter(Boolean) : [];
    return {
        schemaVersion: TALENT_PROGRAM_SCHEMA_VERSION,
        enabled: raw.enabled === true,
        items: legacyItems,
        legacy: { enabled: raw.enabled === true, items: legacyItems },
        departmentSettings: Object.fromEntries((departments || []).filter(dept => dept?.id).map(dept => [dept.id, {
            enabled: true,
            marketId: SHARED_TALENT_MARKET_ID,
        }])),
        markets: {
            [SHARED_TALENT_MARKET_ID]: {
                id: SHARED_TALENT_MARKET_ID,
                name: '공동체 통합 시장',
                enabled: true,
                items: legacyItems,
            },
        },
    };
};

const formatReadDate = (dateStr) => {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '-';
    return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;
};

const formatAnyDate = (value) => {
    if (!value) return '-';
    const raw = value?.toDate ? value.toDate() : value;
    return formatReadDate(raw instanceof Date ? raw.toDateString() : raw);
};

// subgroups는 레거시 string("1구역") 또는 신 포맷({id, name}) 둘 다 지원
const getSubId = (s) => (typeof s === 'string' ? s : s?.id || '');
const getSubName = (s) => (typeof s === 'string' ? s : s?.name || '');
const genSubId = () => 'sub_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const emptyShopItem = { emoji: '🎁', name: '', price: 10, description: '', active: true };
const genShopItemId = () => 'item_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

const ChurchAdminView = ({ currentUser, handleLogout, onBack }) => {
    const [members, setMembers] = useState([]);
    const [deletedMembers, setDeletedMembers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [tab, setTab] = useState('dashboard');
    const [showTutorial, setShowTutorial] = useState(false);
    const toast = useToast();

    // 교인 관리
    const [sortBy, setSortBy] = useState('name');
    const [editing, setEditing] = useState(null); // { uid, mode: 'pw' | 'subgroup' }
    const [revealedPasswords, setRevealedPasswords] = useState({}); // uid -> '__loading__' | '__error__' | 실제 비밀번호
    const [sgCommId, setSgCommId] = useState('');
    const [sgSubId, setSgSubId] = useState('');
    const [extraCommId, setExtraCommId] = useState('');
    const [extraSubId, setExtraSubId] = useState('');
    const [membershipSaving, setMembershipSaving] = useState(false);
    const membershipActionRef = useRef(false);
    const detailRequestRef = useRef(0);
    const [memberDepartmentFilter, setMemberDepartmentFilter] = useState('all');
    const [memberReadFilter, setMemberReadFilter] = useState('all');
    const [bulkCommId, setBulkCommId] = useState('');
    const [bulkSubId, setBulkSubId] = useState('');
    const [selectedMember, setSelectedMember] = useState(null);
    const [showCompletedReaders, setShowCompletedReaders] = useState(false);
    const [memberHistory, setMemberHistory] = useState([]);
    const [detailLoading, setDetailLoading] = useState(false);
    const [confirmAction, setConfirmAction] = useState(null);

    // 공지사항
    const [announcement, setAnnouncement] = useState({ text: '', links: [{ url: '', text: '' }], enabled: false });
    const [saving, setSaving] = useState(false);

    // 카카오 채널
    const [kakaoLink, setKakaoLink] = useState('');
    const [savingKakao, setSavingKakao] = useState(false);

    // 플랫폼 문의 채널
    const [platformKakaoUrl, setPlatformKakaoUrl] = useState('');

    // 설정
    const [churchInfo, setChurchInfo] = useState(null);
    const [newChurchCode, setNewChurchCode] = useState('');
    const [savingCode, setSavingCode] = useState(false);
    const pendingChurchCodeRequestRef = useRef(null);
    const churchCodeActionRef = useRef(0);
    const churchCodeMountedRef = useRef(true);
    const currentUserRef = useRef(currentUser);
    currentUserRef.current = currentUser;

    useEffect(() => {
        churchCodeMountedRef.current = true;
        return () => {
            churchCodeMountedRef.current = false;
            churchCodeActionRef.current += 1;
            pendingChurchCodeRequestRef.current = null;
        };
    }, []);

    useEffect(() => {
        // 같은 화면 인스턴스에서 계정/교회를 바꾸더라도 이전 요청과 입력을 넘기지 않는다.
        churchCodeActionRef.current += 1;
        pendingChurchCodeRequestRef.current = null;
        setNewChurchCode('');
        setSavingCode(false);
    }, [currentUser?.uid, currentUser?.churchId]);

    // 조직 관리
    const [orgComms, setOrgComms] = useState([]);
    const [savingOrg, setSavingOrg] = useState(false);

    // 달란트 상점
    const [talentShop, setTalentShop] = useState({ enabled: false, items: [] });
    const [talentMarketId, setTalentMarketId] = useState(SHARED_TALENT_MARKET_ID);
    const [shopItemDraft, setShopItemDraft] = useState(emptyShopItem);
    const [editingShopItemId, setEditingShopItemId] = useState(null);
    const [savingTalentShop, setSavingTalentShop] = useState(false);
    const [showShopPreview, setShowShopPreview] = useState(false);
    // 창구 판매(관리자 직접 차감) 입력 폼
    const [deductForm, setDeductForm] = useState({ uid: '', itemName: '', price: '' });
    const [deducting, setDeducting] = useState(false);
    const [emojiGroupIdx, setEmojiGroupIdx] = useState(0); // 이모지 그룹 탭 선택
    const [talentPurchases, setTalentPurchases] = useState([]);
    const [purchaseFilter, setPurchaseFilter] = useState('pending');
    const [pendingPurchaseCursor, setPendingPurchaseCursor] = useState(null);
    const [hasMorePendingPurchases, setHasMorePendingPurchases] = useState(false);
    const [loadingMorePendingPurchases, setLoadingMorePendingPurchases] = useState(false);
    const [pendingPurchaseLoadWarning, setPendingPurchaseLoadWarning] = useState('');
    const [recentPurchaseLoadWarning, setRecentPurchaseLoadWarning] = useState('');
    const purchaseLoadWarning = [pendingPurchaseLoadWarning, recentPurchaseLoadWarning].filter(Boolean).join(' ');
    const talentActionRef = useRef(false);

    // 교회 전용 로그인 링크

    useEffect(() => {
        if (!currentUser?.churchId) return;
        loadData();
    }, [currentUser?.churchId]);

    const loadData = async () => {
        setLoading(true);
        setLoadError('');
        try {
            // 전국 단위 가상 공동체의 users 목록은 일반 공동체 관리자 화면에서
            // 조회하지 않는다. 슈퍼관리자 목록 화면이 이미 주 소속 회원을 보여주며,
            // 이 화면에서는 추가 소속 roster만 안전하게 병합한다.
            const membersRequest = currentUser.churchId === UNAFFILIATED_CHURCH_ID
                ? Promise.resolve({ docs: [] })
                : db.collection('users').where('churchId', '==', currentUser.churchId).get();
            const [membersSnap, rosterSnap, announcementDoc, churchDoc, kakaoDoc, platformDoc, talentShopDoc] = await withAdminLoadTimeout(Promise.all([
                membersRequest,
                db.collection('churches').doc(currentUser.churchId).collection('roster').get()
                    .catch(error => { console.error('외부 명부 로딩 실패:', error); return { docs: [] }; }),
                db.collection('churches').doc(currentUser.churchId).collection('settings').doc('announcement').get(),
                db.collection('churches').doc(currentUser.churchId).get(),
                db.collection('churches').doc(currentUser.churchId).collection('settings').doc('kakao').get(),
                db.collection('settings').doc('platform').get(),
                db.collection('churches').doc(currentUser.churchId).collection('settings').doc('talentShop').get(),
            ]));
            const loadedMembers = membersSnap.docs.map(d => ({ uid: d.id, ...d.data() })).filter(m => m.role !== 'churchAdmin');
            const activeMembers = mergePrimaryAndRosterMembers(
                loadedMembers,
                rosterSnapshotToMembers(rosterSnap)
            ).filter(member => !member.isDeleted);
            setMembers(activeMembers);
            setDeletedMembers(loadedMembers.filter(m => m.isDeleted));
            if (announcementDoc.exists) {
                const data = announcementDoc.data() || {};
                setAnnouncement({
                    ...data,
                    text: typeof data.text === 'string' ? data.text : '',
                    links: Array.isArray(data.links) ? data.links.filter(Boolean) : [],
                    enabled: data.enabled === true,
                });
            }
            if (churchDoc.exists) {
                const data = churchDoc.data();
                setChurchInfo(data);
                // 입장코드 원문은 공개 교회 문서에서 읽지 않는다.
                setNewChurchCode('');
                const storedOrg = data.departments || data.communities;
                setOrgComms(Array.isArray(storedOrg) ? storedOrg.filter(Boolean) : []);
            }
            if (kakaoDoc.exists) setKakaoLink(kakaoDoc.data().url || '');
            if (platformDoc.exists) setPlatformKakaoUrl(platformDoc.data().kakaoUrl || '');
            if (talentShopDoc.exists) {
                const data = talentShopDoc.data() || {};
                const departments = churchDoc.exists
                    ? (churchDoc.data()?.departments || churchDoc.data()?.communities || [])
                    : [];
                const promoted = promoteTalentShopConfig(data, departments);
                setTalentShop(promoted);
                setTalentMarketId(Object.keys(promoted.markets || {})[0] || SHARED_TALENT_MARKET_ID);
            } else {
                const departments = churchDoc.exists
                    ? (churchDoc.data()?.departments || churchDoc.data()?.communities || [])
                    : [];
                const promoted = promoteTalentShopConfig({}, departments);
                setTalentShop(promoted);
                setTalentMarketId(SHARED_TALENT_MARKET_ID);
            }
            // 회원·공동체·설정이 준비되면 관리자 화면부터 연다. 구매 내역은 선택 기능이므로
            // 느리거나 실패해도 전체 화면을 다시 "불러오는 중"에 묶어 두지 않는다.
            setLoading(false);
            try {
                const externalMemberIds = new Set(activeMembers.filter(m => m.isExternalOrgMember).map(m => m.uid));
                const purchasesRef = db.collection('churches').doc(currentUser.churchId)
                    .collection('talentPurchases');
                // 공격자가 pending을 대량 생성해도 탭이 멈추지 않게 100건씩 문서 id 기준으로 페이징한다.
                // 두 조회는 독립 처리해 이력 장애가 pending 관리까지 막지 않게 한다.
                const pendingQuery = purchasesRef.where('status', '==', 'pending')
                    .orderBy(firebase.firestore.FieldPath.documentId())
                    .limit(PENDING_PURCHASE_PAGE_SIZE + 1);
                const [pendingResult, recentResult] = await Promise.allSettled([
                    pendingQuery.get(),
                    purchasesRef.where('status', 'in', ['delivered', 'cancelled'])
                        .orderBy('createdAt', 'desc')
                        .limit(RECENT_PURCHASE_LIMIT)
                        .get(),
                ]);
                const pendingDocs = pendingResult.status === 'fulfilled'
                    ? pendingResult.value.docs.slice(0, PENDING_PURCHASE_PAGE_SIZE)
                    : [];
                const recentDocs = recentResult.status === 'fulfilled' ? recentResult.value.docs : [];
                if (pendingResult.status === 'rejected') {
                    console.error('미처리 구매 로드 실패:', pendingResult.reason);
                }
                if (recentResult.status === 'rejected') {
                    console.error('최근 구매 이력 로드 실패:', recentResult.reason);
                }
                setPendingPurchaseLoadWarning(pendingResult.status === 'rejected'
                    ? '미처리 구매를 불러오지 못했습니다. 새로고침해주세요.'
                    : '');
                setRecentPurchaseLoadWarning(recentResult.status === 'rejected'
                    ? '수령·취소 이력을 불러오지 못했습니다. 미처리 구매는 계속 관리할 수 있습니다.'
                    : '');
                setPendingPurchaseCursor(pendingDocs.at(-1) || null);
                setHasMorePendingPurchases(
                    pendingResult.status === 'fulfilled'
                    && pendingResult.value.docs.length > PENDING_PURCHASE_PAGE_SIZE
                );
                const mergedPurchases = mergeAdminTalentPurchases({
                    pendingDocs,
                    recentDocs,
                    externalMemberIds,
                });
                reconcileAdminTalentRequestIds(new Set(mergedPurchases.flatMap(purchase => (
                    [purchase.requestId, purchase.adminActionRequestId].filter(Boolean)
                ))));
                setTalentPurchases(mergedPurchases);
            } catch (purchaseError) {
                console.error('달란트 구매 내역 로드 실패:', purchaseError);
                setTalentPurchases([]);
                setPendingPurchaseLoadWarning('구매 내역을 불러오지 못했습니다. 새로고침해주세요.');
                setRecentPurchaseLoadWarning('');
            }
        } catch (e) {
            console.error(e);
            setLoadError('공동체 정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
        } finally {
            setLoading(false);
        }
    };

    // 이관 완료된 회원은 본문서의 password가 null이므로, 필요할 때만 private 하위문서를 조회한다.
    const revealPassword = async (uid) => {
        setRevealedPasswords(prev => ({ ...prev, [uid]: '__loading__' }));
        try {
            const data = await fetchMemberCredentials(uid);
            setRevealedPasswords(prev => ({ ...prev, [uid]: data?.password || '알 수 없음' }));
        } catch (e) {
            setRevealedPasswords(prev => ({ ...prev, [uid]: '__error__' }));
            if (members.find(member => member.uid === uid)?.isExternalOrgMember) {
                toast.warning('기준 공동체 관리자만 이 개인 계정의 비밀번호를 확인할 수 있습니다.');
            }
        }
    };

    const deleteMember = async (member) => {
        if (member?.isExternalOrgMember) {
            setConfirmAction({
                type: 'expelRosterMember', member,
                title: `${member.name}님을 공동체에서 제명할까요?`,
                message: '이 공동체의 명부 행만 삭제하며 상대방의 계정과 다른 공동체 소속은 유지됩니다.',
                danger: true, confirmLabel: '제명',
            });
            return;
        }
        setConfirmAction({
            type: 'deleteMember',
            member,
            title: `${member.name}님을 삭제 처리할까요?`,
            message: '계정은 보관되며 필요하면 다시 복원할 수 있습니다.',
            danger: true,
        });
    };

    const executeExpelRosterMember = async (member) => {
        if (!member?.isExternalOrgMember || !currentUser?.churchId || !member.uid) return;
        try {
            const rosterRef = db.collection('churches').doc(currentUser.churchId).collection('roster').doc(member.uid);
            const deleteResult = await db.runTransaction(async transaction => {
                const rosterDoc = await transaction.get(rosterRef);
                if (!rosterDoc.exists) return { status: 'already-expelled' };
                const latestTalent = rosterDoc.data()?.talent ?? 0;
                if (!Number.isSafeInteger(latestTalent) || latestTalent < 0) {
                    throw new Error('ROSTER_WALLET_INVALID');
                }
                if (latestTalent > 0) return { status: 'balance', talent: latestTalent };
                transaction.delete(rosterRef);
                return { status: 'expelled' };
            });
            if (deleteResult.status === 'balance') {
                toast.warning(`${member.name}님의 이 공동체 달란트 ⭐${deleteResult.talent}개가 남아 있어 제명할 수 없습니다.`);
                return;
            }
            setMembers(prev => prev.filter(item => item.uid !== member.uid));
            if (selectedMember?.uid === member.uid) closeMemberDetail();
            toast.success(`${member.name}님을 공동체에서 제명했습니다.`);
        } catch (error) {
            console.error('외부 공동체 멤버 제명 실패:', error);
            if (error?.code === 'permission-denied') {
                toast.warning('기본 공동체이거나 달란트 잔액이 남은 명부에서는 제명할 수 없습니다. 성도의 기본 공동체와 잔액을 확인해주세요.');
                return;
            }
            toast.error('공동체 제명에 실패했습니다.');
        }
    };

    const executeDeleteMember = async (member) => {
        if (member?.isExternalOrgMember) return;
        try {
            const deletedData = {
                isDeleted: true,
                deletedAt: firebase.firestore.FieldValue.serverTimestamp(),
                deletedBy: currentUser.uid,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            };
            await db.collection('users').doc(member.uid).set(deletedData, { merge: true });
            setMembers(prev => prev.filter(m => m.uid !== member.uid));
            setDeletedMembers(prev => [{ ...member, ...deletedData }, ...prev]);
            if (editing?.uid === member.uid) setEditing(null);
            if (selectedMember?.uid === member.uid) setSelectedMember(null);
            toast.success(`${member.name}님을 삭제 처리했습니다.`);
        } catch (e) {
            console.error(e);
            toast.error('삭제 처리에 실패했습니다.');
        }
    };

    const restoreMember = async (member) => {
        setConfirmAction({
            type: 'restoreMember',
            member,
            title: `${member.name}님을 복원할까요?`,
            message: '복원하면 다시 교인 목록에 표시됩니다.',
        });
    };

    const executeRestoreMember = async (member) => {
        if (member?.isExternalOrgMember) return;
        try {
            await db.collection('users').doc(member.uid).set({
                isDeleted: false,
                deletedAt: null,
                deletedBy: null,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
            setDeletedMembers(prev => prev.filter(m => m.uid !== member.uid));
            setMembers(prev => [{ ...member, isDeleted: false, deletedAt: null, deletedBy: null }, ...prev]);
            toast.success(`${member.name}님을 복원했습니다.`);
        } catch (e) {
            console.error(e);
            toast.error('복원에 실패했습니다.');
        }
    };

    const generatePassword = () => String(Math.floor(100000 + Math.random() * 900000));

    const getMemberMembershipLabels = (member) => {
        const primaryMembership = getPrimaryMembership(member);
        const labels = getCanonicalMemberships(member).map(membership => {
            const comm = orgComms.find(c => c.id === membership.departmentId);
            const subEntry = (comm?.subgroups || [])
                .find(sub => getSubId(sub) === membership.subgroupId);
            const departmentName = comm?.name || membership.departmentName || membership.departmentId;
            const subgroupName = (subEntry ? getSubName(subEntry) : null)
                || membership.subgroupName
                || membership.subgroupId;
            return {
                key: JSON.stringify([membership.departmentId, membership.subgroupId]),
                text: subgroupName ? `${departmentName} · ${subgroupName}` : departmentName,
                isPrimary: sameMembership(membership, primaryMembership),
            };
        });
        return labels.length > 0 ? labels : [{ key: 'unassigned', text: '미배정', isPrimary: true }];
    };

    const getMemberMembershipText = (member) => (
        getMemberMembershipLabels(member).map(label => label.text).join(', ')
    );

    const sameMembership = (left, right) => {
        if (!left || !right || left.departmentId !== right.departmentId) return false;
        if (left.subgroupId === right.subgroupId) return true;
        // legacy subgroupId=name 호환. modern group끼리는 name-name만으로 같다고 보지 않는다.
        return Boolean(
            (left.subgroupId && right.subgroupName && left.subgroupId === right.subgroupName)
            || (right.subgroupId && left.subgroupName && right.subgroupId === left.subgroupName)
        );
    };

    const getPrimaryMembership = (member) => getMembershipList({
        ...(member || {}),
        extraMemberships: [],
    })[0] || null;

    const getExtraMemberships = (member) => {
        const primaryMembership = getPrimaryMembership(member);
        return getMembershipList(member)
            .filter(membership => !sameMembership(membership, primaryMembership))
            .slice(0, 3);
    };

    const getCanonicalMemberships = (member) => [
        getPrimaryMembership(member),
        ...getExtraMemberships(member),
    ].filter(Boolean);

    const belongsToMembership = (member, membership) => Boolean(
        membership?.departmentId
        && membership?.subgroupId
        && getCanonicalMemberships(member)
            .some(existing => sameMembership(existing, membership))
    );

    const getMembershipDisplayText = (membership) => {
        const comm = orgComms.find(c => c.id === membership?.departmentId);
        const subEntry = (comm?.subgroups || [])
            .find(sub => getSubId(sub) === membership?.subgroupId);
        const departmentName = comm?.name || membership?.departmentName || membership?.departmentId || '미배정';
        const subgroupName = (subEntry ? getSubName(subEntry) : null)
            || membership?.subgroupName
            || membership?.subgroupId;
        return subgroupName ? `${departmentName} · ${subgroupName}` : departmentName;
    };

    const syncMemberMembershipState = (uid, patch) => {
        setMembers(prev => prev.map(member => member.uid === uid ? { ...member, ...patch } : member));
        setSelectedMember(prev => prev?.uid === uid ? { ...prev, ...patch } : prev);
    };

    const mutateExtraMembership = async ({ member, type, membership }) => {
        if (
            !member?.uid
            || !membership?.departmentId
            || (type === 'add' && !membership?.subgroupId)
        ) return false;
        if (membershipActionRef.current) {
            toast.warning('다른 소속 변경을 처리 중입니다. 잠시만 기다려주세요.');
            return false;
        }

        membershipActionRef.current = true;
        setMembershipSaving(true);
        const targetUid = member.uid;
        const targetChurchId = currentUser?.churchId;

        try {
            const membershipRef = member.isExternalOrgMember
                ? db.collection('churches').doc(targetChurchId).collection('roster').doc(targetUid)
                : db.collection('users').doc(targetUid);
            const result = await db.runTransaction(async transaction => {
                const membershipDoc = await transaction.get(membershipRef);
                if (!membershipDoc.exists) return { status: 'not-found' };

                const latestUser = { uid: targetUid, ...membershipDoc.data() };
                if (!targetChurchId || (!member.isExternalOrgMember && (latestUser.churchId !== targetChurchId || latestUser.isDeleted))) {
                    return { status: 'forbidden' };
                }

                const currentExtras = getExtraMemberships(latestUser);
                if (type === 'add') {
                    if (belongsToMembership(latestUser, membership)) {
                        return { status: 'duplicate', extraMemberships: currentExtras };
                    }
                    if (currentExtras.length >= 3) {
                        return { status: 'max', extraMemberships: currentExtras };
                    }
                    const extraMemberships = [...currentExtras, membership].slice(0, 3);
                    transaction.update(membershipRef, {
                        extraMemberships,
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    });
                    return { status: 'ok', extraMemberships };
                }

                const extraMemberships = currentExtras.filter(item => !sameMembership(item, membership));
                if (extraMemberships.length === currentExtras.length) {
                    return { status: 'missing', extraMemberships: currentExtras };
                }
                transaction.update(membershipRef, {
                    extraMemberships,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                });
                return { status: 'ok', extraMemberships };
            });

            if (Array.isArray(result.extraMemberships)) {
                syncMemberMembershipState(targetUid, { extraMemberships: result.extraMemberships });
            }
            if (result.status === 'ok') {
                if (type === 'add') {
                    setExtraCommId('');
                    setExtraSubId('');
                    toast.success('추가 소속을 저장했습니다.');
                } else {
                    toast.success('추가 소속을 제거했습니다.');
                }
                return true;
            }
            if (result.status === 'duplicate') toast.warning('이미 등록된 소속입니다.');
            else if (result.status === 'max') toast.warning('추가 소속은 최대 3개까지 등록할 수 있습니다.');
            else if (result.status === 'missing') toast.info('이미 제거된 소속입니다.');
            else if (result.status === 'not-found') toast.error('교인 정보를 찾을 수 없습니다.');
            else toast.error('현재 교회의 교인 정보가 아니어서 변경할 수 없습니다.');
            return false;
        } catch (error) {
            console.error('추가 소속 변경 실패:', error);
            toast.error('추가 소속을 변경하지 못했습니다. 잠시 후 다시 시도해주세요.');
            return false;
        } finally {
            membershipActionRef.current = false;
            setMembershipSaving(false);
        }
    };

    const addSelectedMemberExtraMembership = async () => {
        const member = selectedMember;
        const comm = orgComms.find(c => c.id === extraCommId);
        const subEntry = (comm?.subgroups || []).find(sub => getSubId(sub) === extraSubId);
        if (!member || !comm || !subEntry) {
            toast.error('추가할 부서와 소그룹을 선택해주세요.');
            return;
        }
        const candidateMembership = {
            departmentId: comm.id,
            departmentName: comm.name,
            subgroupId: extraSubId,
            subgroupName: getSubName(subEntry),
        };
        if (belongsToMembership(member, candidateMembership)) {
            toast.warning('이미 등록된 소속입니다.');
            return;
        }
        if (getExtraMemberships(member).length >= 3) {
            toast.warning('추가 소속은 최대 3개까지 등록할 수 있습니다.');
            return;
        }
        await mutateExtraMembership({
            member,
            type: 'add',
            membership: candidateMembership,
        });
    };

    const removeSelectedMemberExtraMembership = async (membership) => {
        if (!selectedMember) return;
        await mutateExtraMembership({ member: selectedMember, type: 'remove', membership });
    };

    const applySubgroupToMembers = async (targetMembers, commId, subId) => {
        const comm = orgComms.find(c => c.id === commId);
        const subEntry = (comm?.subgroups || []).find(s => getSubId(s) === subId);
        if (!comm || !subEntry) {
            toast.error('부서와 소그룹을 선택해주세요.');
            return false;
        }
        if (membershipActionRef.current) {
            toast.warning('다른 소속 변경을 처리 중입니다. 잠시만 기다려주세요.');
            return false;
        }

        const uniqueTargets = Array.from(new Map(
            (Array.isArray(targetMembers) ? targetMembers : [])
                .filter(member => member?.uid)
                .map(member => [member.uid, member])
        ).values());
        if (uniqueTargets.length === 0) return false;

        membershipActionRef.current = true;
        setMembershipSaving(true);
        const subgroupName = getSubName(subEntry);
        const targetChurchId = currentUser?.churchId;

        try {
            const settled = await Promise.allSettled(uniqueTargets.map(member => {
                if (member.isExternalOrgMember) {
                    if (!targetChurchId) return Promise.reject(new Error('ROSTER_ORG_MISSING'));
                    const rosterRef = db.collection('churches').doc(targetChurchId).collection('roster').doc(member.uid);
                    return db.runTransaction(async transaction => {
                        const rosterDoc = await transaction.get(rosterRef);
                        if (!rosterDoc.exists) throw new Error('ROSTER_MEMBER_NOT_FOUND');
                        const latestRoster = { uid: member.uid, ...rosterDoc.data() };
                        const nextPrimaryMembership = {
                            departmentId: comm.id,
                            departmentName: comm.name,
                            subgroupId: subId,
                            subgroupName,
                        };
                        const extraMemberships = getExtraMemberships(latestRoster)
                            .filter(item => !sameMembership(item, nextPrimaryMembership));
                        transaction.update(rosterRef, {
                            ...nextPrimaryMembership,
                            extraMemberships,
                            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                        });
                        return { uid: member.uid, extraMemberships, isExternalOrgMember: true };
                    });
                }
                const userRef = db.collection('users').doc(member.uid);
                return db.runTransaction(async transaction => {
                    const userDoc = await transaction.get(userRef);
                    if (!userDoc.exists) throw new Error('MEMBER_NOT_FOUND');
                    const latestUser = { uid: member.uid, ...userDoc.data() };
                    if (!targetChurchId || latestUser.churchId !== targetChurchId || latestUser.isDeleted) {
                        throw new Error('MEMBER_NOT_ALLOWED');
                    }

                    // 새 주 소속과 같은 extra는 transaction 안에서 함께 제거한다.
                    const nextPrimaryMembership = {
                        departmentId: comm.id,
                        departmentName: comm.name,
                        subgroupId: subId,
                        subgroupName,
                    };
                    const extraMemberships = getExtraMemberships(latestUser)
                        .filter(item => !sameMembership(item, nextPrimaryMembership));
                    transaction.update(userRef, {
                        departmentId: comm.id,
                        departmentName: comm.name,
                        subgroupId: subId,
                        subgroupName,
                        extraMemberships,
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    });
                    return { uid: member.uid, extraMemberships };
                });
            }));

            const updates = settled.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
            const updateByUid = new Map(updates.map(update => [update.uid, update]));
            const patchMember = member => {
                const update = updateByUid.get(member.uid);
                return update ? {
                    ...member,
                    departmentId: comm.id,
                    departmentName: comm.name,
                    subgroupId: subId,
                    subgroupName,
                    extraMemberships: update.extraMemberships,
                } : member;
            };
            setMembers(prev => prev.map(patchMember));
            setSelectedMember(prev => prev ? patchMember(prev) : prev);

            const failedCount = settled.length - updates.length;
            settled.forEach(result => {
                if (result.status === 'rejected') console.error('주 소속 변경 실패:', result.reason);
            });
            if (updates.length === 0) {
                toast.error('주 소속을 변경하지 못했습니다.');
                return false;
            }
            if (failedCount > 0) {
                toast.warning(`${updates.length}명은 변경했고 ${failedCount}명은 변경하지 못했습니다.`);
                return false;
            }
            toast.success(`${updates.length}명의 주 소속을 변경했습니다.`);
            return true;
        } catch (error) {
            console.error('주 소속 변경 실패:', error);
            toast.error('주 소속을 변경하지 못했습니다. 잠시 후 다시 시도해주세요.');
            return false;
        } finally {
            membershipActionRef.current = false;
            setMembershipSaving(false);
        }
    };

    const resetPasswordsForMembers = async (targetMembers) => {
        const updates = targetMembers.map(member => ({ member, password: generatePassword() }));
        const resetOne = async ({ member, password }) => {
            await setMemberPasswordByAdmin(member.uid, password);
        };
        for (let i = 0; i < updates.length; i += 10) {
            await Promise.all(updates.slice(i, i + 10).map(resetOne));
        }
        setMembers(prev => prev.map(m => {
            const found = updates.find(u => u.member.uid === m.uid);
            return found ? { ...m, password: found.password, passwordResetRequired: true } : m;
        }));
        // 상세 패널이 열려 있으면 새 비밀번호가 바로 보이도록 갱신하고, 조회 캐시는 비운다.
        setRevealedPasswords(prev => {
            const next = { ...prev };
            updates.forEach(u => { delete next[u.member.uid]; });
            return next;
        });
        setSelectedMember(prev => {
            if (!prev) return prev;
            const found = updates.find(u => u.member.uid === prev.uid);
            return found ? { ...prev, password: found.password } : prev;
        });
        toast.success(`${targetMembers.length}명의 실제 로그인 비밀번호를 변경했습니다.`);
    };

    const closeMemberDetail = () => {
        detailRequestRef.current += 1;
        setSelectedMember(null);
        setMemberHistory([]);
        setDetailLoading(false);
        setExtraCommId('');
        setExtraSubId('');
    };

    const openMemberDetail = async (member) => {
        const requestId = ++detailRequestRef.current;
        setSelectedMember(member);
        setMemberHistory([]);
        setDetailLoading(true);
        setSgCommId(member.departmentId || orgComms[0]?.id || '');
        setSgSubId(member.subgroupId || '');
        setExtraCommId('');
        setExtraSubId('');
        if (member.isExternalOrgMember) {
            setDetailLoading(false);
            return;
        }
        try {
            const snap = await db.collection('users').doc(member.uid).collection('history')
                .orderBy('date', 'desc').limit(10).get();
            if (detailRequestRef.current !== requestId) return;
            setMemberHistory(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (e) {
            if (detailRequestRef.current !== requestId) return;
            setMemberHistory([]);
            toast.warning('읽기 기록을 불러오지 못했습니다. 권한 규칙이 아직 열려 있지 않을 수 있습니다.');
        } finally {
            if (detailRequestRef.current === requestId) setDetailLoading(false);
        }
    };

    const handleConfirmAction = async () => {
        const action = confirmAction;
        if (!action) return;
        setConfirmAction(null);
        try {
            let shouldRunAfter = true;
            if (action.type === 'deleteMember') await executeDeleteMember(action.member);
            if (action.type === 'expelRosterMember') await executeExpelRosterMember(action.member);
            if (action.type === 'restoreMember') await executeRestoreMember(action.member);
            if (action.type === 'bulkSubgroup') {
                shouldRunAfter = await applySubgroupToMembers(action.members, action.commId, action.subId);
            }
            if (action.type === 'bulkPassword') await resetPasswordsForMembers(action.members);
            if (action.type === 'singlePassword') await resetPasswordsForMembers([action.member]);
            if (action.type === 'deleteShopItem') await executeDeleteShopItem(action.item);
            if (action.type === 'deliverPurchase') await updatePurchaseStatus(action.purchase, 'delivered');
            if (action.type === 'refundPurchase') await updatePurchaseStatus(action.purchase, 'cancelled');
            if (action.type === 'refundLegacyPurchase') {
                await updatePurchaseStatus(action.purchase, 'cancelled', action.legacyWalletKind);
            }
            if (action.type === 'refundMigratedPurchase') {
                await updatePurchaseStatus(action.purchase, 'cancelled', null, true);
            }
            if (action.type === 'manualDeduct') await executeManualDeduct(action.form);
            // 주 소속 일괄 변경이 일부라도 실패하면 선택을 유지해 바로 재시도할 수 있게 한다.
            if (shouldRunAfter !== false) action.after?.();
        } catch (e) {
            console.error(e);
            toast.error('작업 처리 중 오류가 발생했습니다.');
        }
    };

    const saveAnnouncement = async () => {
        setSaving(true);
        try {
            await db.collection('churches').doc(currentUser.churchId)
                .collection('settings').doc('announcement').set({
                    ...announcement,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            alert('공지가 저장되었습니다!');
        } catch (e) {
            alert('저장 실패');
        }
        setSaving(false);
    };

    const saveKakaoLink = async () => {
        setSavingKakao(true);
        try {
            await db.collection('churches').doc(currentUser.churchId)
                .collection('settings').doc('kakao').set({
                    url: kakaoLink,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            alert('카카오 링크가 저장되었습니다!');
        } catch (e) {
            alert('저장 실패');
        }
        setSavingKakao(false);
    };

    const saveChurchCode = async () => {
        const requestStartUser = currentUserRef.current;
        const requestUid = requestStartUser?.uid;
        const requestChurchId = requestStartUser?.churchId;
        const requestContextIsCurrent = () => (
            churchCodeMountedRef.current
            && auth?.currentUser?.uid === requestUid
            && currentUserRef.current?.uid === requestUid
            && currentUserRef.current?.churchId === requestChurchId
        );
        if (!requestUid || !requestChurchId || !requestContextIsCurrent()) {
            pendingChurchCodeRequestRef.current = null;
            return;
        }
        const normalizedChurchCode = normalizeChurchEntryCode(newChurchCode);
        if (!normalizedChurchCode) { alert('입장코드는 4~128자로 입력해주세요.'); return; }
        const actionId = ++churchCodeActionRef.current;
        const requestOwnsUi = () => (
            requestContextIsCurrent() && churchCodeActionRef.current === actionId
        );
        const pendingMatchesRequest = candidate => (
            candidate?.uid === requestUid
            && candidate?.churchId === requestChurchId
            && candidate?.entryCode === normalizedChurchCode
        );
        const pendingRequestIsCurrent = candidate => (
            pendingMatchesRequest(candidate)
            && pendingChurchCodeRequestRef.current?.requestId === candidate.requestId
        );
        const clearPendingIfCurrent = candidate => {
            if (pendingRequestIsCurrent(candidate)) pendingChurchCodeRequestRef.current = null;
        };
        setSavingCode(true);
        let pending = pendingChurchCodeRequestRef.current;
        if (pending && !pendingMatchesRequest(pending)) {
            pendingChurchCodeRequestRef.current = null;
            pending = null;
        }
        try {
            const churchRef = db.collection('churches').doc(requestChurchId);
            if (!pending) {
                const accessDoc = await churchRef.collection('private').doc('access').get({ source: 'server' });
                if (!requestOwnsUi()) return;
                const storedVersion = accessDoc.exists ? accessDoc.data()?.version : undefined;
                const expectedVersion = storedVersion === undefined ? 0 : storedVersion;
                if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) {
                    throw new Error('현재 입장코드 버전을 확인할 수 없습니다.');
                }
                pending = {
                    uid: requestUid,
                    churchId: requestChurchId,
                    entryCode: normalizedChurchCode,
                    expectedVersion,
                    requestId: createRequestId(),
                };
                pendingChurchCodeRequestRef.current = pending;
            }
            const result = await rotateChurchAccessCode({
                churchId: pending.churchId,
                entryCode: pending.entryCode,
                expectedVersion: pending.expectedVersion,
            }, {
                requestId: pending.requestId,
                expectedUid: requestUid,
            });
            if (!requestContextIsCurrent()) {
                clearPendingIfCurrent(pending);
                return;
            }
            if (!requestOwnsUi() || !pendingRequestIsCurrent(pending)) return;
            if (result.result.version !== pending.expectedVersion + 1) {
                throw new Error('입장코드 변경 버전을 확인할 수 없습니다.');
            }
            clearPendingIfCurrent(pending);
            setChurchInfo(previous => {
                if (!previous) return previous;
                const {
                    churchCode: _churchCode,
                    churchCodeHash: _churchCodeHash,
                    code: _legacyCode,
                    ...safe
                } = previous;
                return safe;
            });
            setNewChurchCode('');
            alert('입장코드가 변경되었습니다!');
        } catch (e) {
            if (!requestContextIsCurrent()) {
                clearPendingIfCurrent(pending);
                return;
            }
            if (!requestOwnsUi() || (pending && !pendingRequestIsCurrent(pending))) return;
            if (pending && e?.retryable !== true) clearPendingIfCurrent(pending);
            alert(e?.message || '변경 실패');
        } finally {
            if (requestOwnsUi()) setSavingCode(false);
        }
    };

    const saveOrg = async () => {
        const valid = orgComms
            .filter(c => String(c?.name || '').trim())
            .map(c => ({
                id: c.id,
                name: String(c.name || '').trim(),
                subgroups: (c.subgroups || [])
                    .filter(s => getSubName(s).trim())
                    .map(s => ({
                        id: (typeof s === 'string' ? null : s.id) || genSubId(),
                        name: getSubName(s).trim(),
                    })),
            }));
        if (valid.length === 0) { alert('최소 하나의 부서를 추가해주세요.'); return; }
        setSavingOrg(true);
        try {
            await db.collection('churches').doc(currentUser.churchId).set(
                { departments: valid, updatedAt: firebase.firestore.FieldValue.serverTimestamp() },
                { merge: true }
            );
            setOrgComms(valid);
            alert('조직이 저장되었습니다!\n\n⚠️ 부서명이나 소그룹명을 변경한 경우, 기존 교인의 소그룹 배정 표기가 달라질 수 있습니다.');
        } catch (e) {
            alert('저장 실패');
        }
        setSavingOrg(false);
    };

    const saveTalentShop = async (nextShop = talentShop) => {
        setSavingTalentShop(true);
        try {
            const promoted = promoteTalentShopConfig(nextShop, orgComms);
            const sharedItems = promoted.markets?.[SHARED_TALENT_MARKET_ID]?.items || promoted.items || [];
            const payload = {
                ...promoted,
                // 구버전 앱도 통합 시장을 계속 읽을 수 있도록 루트 items를 함께 유지한다.
                items: sharedItems,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            };
            await db.collection('churches').doc(currentUser.churchId).collection('settings').doc('talentShop').set({
                ...payload,
            }, { merge: true });
            setTalentShop(promoted);
            toast.success('달란트 상점 설정을 저장했습니다.');
        } catch (e) {
            console.error(e);
            toast.error('달란트 상점 저장에 실패했습니다.');
        } finally {
            setSavingTalentShop(false);
        }
    };

    const toggleTalentShopEnabled = async (enabled) => {
        await saveTalentShop({ ...talentShop, enabled });
    };

    const setDepartmentTalentEnabled = async (departmentId, enabled) => {
        const current = promoteTalentShopConfig(talentShop, orgComms);
        const existing = current.departmentSettings?.[departmentId] || {};
        const marketId = existing.marketId || SHARED_TALENT_MARKET_ID;
        await saveTalentShop({
            ...current,
            departmentSettings: {
                ...current.departmentSettings,
                [departmentId]: { enabled, marketId },
            },
        });
    };

    const setDepartmentTalentMarketMode = async (departmentId, mode) => {
        const current = promoteTalentShopConfig(talentShop, orgComms);
        const marketId = mode === 'department'
            ? departmentTalentMarketId(departmentId)
            : SHARED_TALENT_MARKET_ID;
        const department = orgComms.find(dept => dept.id === departmentId);
        const markets = { ...current.markets };
        if (!markets[marketId]) {
            markets[marketId] = {
                id: marketId,
                name: mode === 'department' ? `${department?.name || '부서'} 시장` : '공동체 통합 시장',
                enabled: true,
                items: [],
            };
        }
        await saveTalentShop({
            ...current,
            markets,
            departmentSettings: {
                ...current.departmentSettings,
                [departmentId]: {
                    enabled: current.departmentSettings?.[departmentId]?.enabled === true,
                    marketId,
                },
            },
        });
        setTalentMarketId(marketId);
        resetShopItemDraft();
    };

    const resetShopItemDraft = () => {
        setShopItemDraft(emptyShopItem);
        setEditingShopItemId(null);
    };

    const submitShopItem = async () => {
        const name = shopItemDraft.name.trim();
        const price = Number(shopItemDraft.price);
        if (!name) { toast.error('상품 이름을 입력해주세요.'); return; }
        if (!Number.isFinite(price) || price <= 0) { toast.error('가격은 1 이상 숫자로 입력해주세요.'); return; }
        const item = {
            id: editingShopItemId || genShopItemId(),
            emoji: shopItemDraft.emoji || '🎁',
            name,
            price: Math.round(price),
            description: shopItemDraft.description.trim(),
            active: shopItemDraft.active !== false,
        };
        const current = promoteTalentShopConfig(talentShop, orgComms);
        const market = current.markets?.[talentMarketId] || current.markets?.[SHARED_TALENT_MARKET_ID];
        if (!market) { toast.error('상품을 저장할 시장을 선택해주세요.'); return; }
        const nextItems = editingShopItemId
            ? (market.items || []).map(existing => existing.id === editingShopItemId ? item : existing)
            : [...(market.items || []), item];
        await saveTalentShop({
            ...current,
            markets: { ...current.markets, [market.id]: { ...market, items: nextItems } },
        });
        resetShopItemDraft();
    };

    const editShopItem = (item) => {
        setEditingShopItemId(item.id);
        setShopItemDraft({
            emoji: item.emoji || '🎁',
            name: item.name || '',
            price: item.price || 10,
            description: item.description || '',
            active: item.active !== false,
        });
    };

    const deleteShopItem = async (item) => {
        setConfirmAction({
            type: 'deleteShopItem',
            item,
            title: `${item.name} 상품을 삭제할까요?`,
            message: '이미 생성된 구매 내역은 유지되고, 상품 목록에서만 삭제됩니다.',
            danger: true,
            confirmLabel: '삭제',
        });
    };

    const executeDeleteShopItem = async (item) => {
        const current = promoteTalentShopConfig(talentShop, orgComms);
        const market = current.markets?.[talentMarketId] || current.markets?.[SHARED_TALENT_MARKET_ID];
        const nextItems = (market?.items || []).filter(existing => existing.id !== item.id);
        await saveTalentShop({
            ...current,
            markets: { ...current.markets, [market.id]: { ...market, items: nextItems } },
        });
        if (editingShopItemId === item.id) resetShopItemDraft();
    };

    const getMemberTalentDepartment = (member, marketId = talentMarketId) => {
        const config = promoteTalentShopConfig(talentShop, orgComms);
        return getMembershipList(member).find(membership => {
            const setting = config.departmentSettings?.[membership.departmentId];
            return setting?.enabled === true && setting.marketId === marketId;
        }) || null;
    };

    // ── 창구 판매: 관리자가 교인 대신 달란트를 차감하고 구입 물품을 기록 (어르신 지원) ──
    const requestManualDeduct = () => {
        const member = members.find(m => m.uid === deductForm.uid);
        const price = Number(deductForm.price);
        const itemName = deductForm.itemName.trim();
        if (!member) { toast.error('교인을 선택해주세요.'); return; }
        const membership = getMemberTalentDepartment(member);
        if (!membership) { toast.error('선택한 시장을 이용하는 부서 소속 교인만 차감할 수 있습니다.'); return; }
        if (!itemName) { toast.error('구입 물품을 반드시 기록해주세요.'); return; }
        if (itemName.length > 100) { toast.error('구입 물품은 100자 이내로 기록해주세요.'); return; }
        if (!Number.isSafeInteger(price) || price <= 0 || price > 1_000_000) {
            toast.error('차감할 달란트는 1~1,000,000 사이의 정수로 입력해주세요.');
            return;
        }
        if ((member.talent || 0) < price) {
            toast.error(`${member.name}님의 잔액(⭐${member.talent || 0})이 부족합니다.`);
            return;
        }
        setConfirmAction({
            type: 'manualDeduct',
            form: { member, itemName, price, membership, marketId: talentMarketId },
            title: `${member.name}님 달란트를 차감할까요?`,
            message: `${itemName} · ⭐${price} 차감 (잔액 ⭐${member.talent || 0} → ⭐${(member.talent || 0) - price})`,
            confirmLabel: '차감하기',
        });
    };

    const executeManualDeduct = async ({ member, itemName, price, membership, marketId }) => {
        if (talentActionRef.current) {
            toast.warning('다른 달란트 작업을 처리하고 있습니다. 잠시 후 다시 시도해주세요.');
            return;
        }
        talentActionRef.current = true;
        setDeducting(true);
        const requestKey = adminTalentRequestKey([
            currentUser.uid, currentUser.churchId, 'counter', member.uid,
            membership.departmentId, marketId, itemName, price,
        ]);
        const requestId = getOrCreateAdminTalentRequestId(requestKey);
        try {
            const result = await adminCounterSale({
                churchId: currentUser.churchId,
                memberUid: member.uid,
                departmentId: membership.departmentId,
                marketId,
                itemName,
                price,
            }, { requestId });
            clearAdminTalentRequestId(requestKey);
            setMembers(prev => prev.map(m => (
                m.uid === member.uid && (
                    (result.walletKind === 'roster' && m.isExternalOrgMember)
                    || (result.walletKind === 'user' && !m.isExternalOrgMember)
                )
                    ? { ...m, talent: result.nextTalent }
                    : m
            )));
            setTalentPurchases(prev => [
                result.purchase,
                ...prev.filter(purchase => purchase.id !== result.purchase.id),
            ]);
            setDeductForm({ uid: '', itemName: '', price: '' });
            toast.success(`${member.name}님 ⭐${price} 차감 완료 (${itemName})`);
        } catch (e) {
            console.error(e);
            if (isDefiniteAdminTalentFailure(e)) clearAdminTalentRequestId(requestKey);
            const resultUnknown = !isDefiniteAdminTalentFailure(e) && (
                e?.retryable === true || e?.status >= 500
                || e?.code === 'TIMEOUT' || e?.code === 'NETWORK_ERROR'
            );
            toast.error(resultUnknown
                ? '판매 결과를 확인하지 못했습니다. 같은 교인·물품·금액으로 다시 누르면 중복 차감 없이 결과를 확인합니다.'
                : (e.message || '차감 처리에 실패했습니다.'));
        } finally {
            setDeducting(false);
            talentActionRef.current = false;
        }
    };

    // ── 인쇄 공통: 새 창에 A4 인쇄용 HTML을 띄우고 자동으로 인쇄 대화상자 열기 ──
    const openPrintWindow = (html, reservedWindow = null) => {
        const w = reservedWindow || window.open('', '_blank');
        if (!w || w.closed) {
            toast.error('팝업이 차단되었습니다. 브라우저에서 팝업을 허용한 뒤 다시 시도해주세요.');
            return null;
        }
        try {
            w.document.open();
            w.document.write(html);
            w.document.close();
            return w;
        } catch (e) {
            console.error('인쇄 미리보기 열기 실패:', e);
            w.close();
            toast.error('인쇄 미리보기를 열지 못했습니다. 다시 시도해주세요.');
            return null;
        }
    };

    // ── 성도용 가입 안내문 A4 2면 인쇄 (가입·홈 화면 추가 + 매일 사용법) ──
    const printMemberGuide = async () => {
        // QR 생성은 비동기라 완료 후 window.open()을 호출하면 브라우저가 팝업으로 차단할 수 있다.
        // 사용자 클릭이 살아 있을 때 빈 창을 먼저 확보한 뒤 생성된 인쇄물을 채운다.
        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            toast.error('팝업이 차단되었습니다. 브라우저에서 팝업을 허용한 뒤 다시 시도해주세요.');
            return;
        }
        // 인쇄물은 교회별 자동선택 링크가 아니라 대표 주소로 통일한다 —
        // 성도는 QR로 접속한 뒤 앱에서 교회 이름을 검색해 들어간다.
        let qrDataUrl = '';
        try {
            qrDataUrl = await QRCode.toDataURL(SITE_URL, { width: 560, margin: 1 });
        } catch (e) {
            console.error('QR 생성 실패:', e);
            printWindow.close();
            toast.error('QR 코드 생성에 실패했습니다.');
            return;
        }
        const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const churchName = esc(churchInfo?.name || currentUser.churchName || '');
        // 코드 원문은 저장하지 않으므로 현재 세션에서 관리자가 입력한 값만 인쇄한다.
        const code = newChurchCode || '';
        const codeBlock = code
            ? `<span class="code">${esc(code)}</span>`
            : '<span class="code blank">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span> <span class="hint">(관리자가 적어주세요)</span>';
        const html = `<!doctype html><html><head><meta charset="utf-8"><title>${churchName} 성경 읽기 안내</title>
<style>
  @page { size: A4 portrait; margin: 15mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif; color: #1e293b; }
  .header { text-align: center; margin-bottom: 7mm; }
  .header h1 { font-size: 34px; }
  .header p { font-size: 17px; color: #475569; margin-top: 2.5mm; }
  .qr { text-align: center; border: 2px solid #cbd5e1; border-radius: 16px; padding: 6mm; margin-bottom: 7mm; }
  .qr img { width: 55mm; height: 55mm; }
  .qr .big { font-size: 20px; font-weight: 800; margin-top: 2mm; }
  .qr .url { font-size: 14px; color: #64748b; margin-top: 1.5mm; word-break: break-all; }
  .section { margin-bottom: 6mm; }
  .section h2 { font-size: 21px; background: #f1f5f9; border-radius: 10px; padding: 2.5mm 4mm; margin-bottom: 3mm; }
  .step { display: flex; gap: 4mm; align-items: baseline; font-size: 18px; line-height: 1.55; margin-bottom: 2.5mm; padding-left: 2mm; }
  .num { font-weight: 900; color: #7c3aed; flex-shrink: 0; }
  .code { font-size: 22px; font-weight: 900; letter-spacing: 2px; background: #fef3c7; border: 1.5px dashed #d97706; border-radius: 8px; padding: 1mm 4mm; }
  .code.blank { min-width: 30mm; display: inline-block; }
  .hint { font-size: 13px; color: #94a3b8; }
  .twocol { display: flex; gap: 4mm; }
  .device { flex: 1; border: 1.5px solid #e2e8f0; border-radius: 12px; padding: 4mm; break-inside: avoid; }
  .device h3 { font-size: 17px; margin-bottom: 2.5mm; }
  .device .step { font-size: 16px; gap: 2.5mm; margin-bottom: 1.8mm; padding-left: 0; }
  .share-icon { border: 1.5px solid #64748b; border-radius: 4px; padding: 0 1.5mm; white-space: nowrap; }
  .highlight { background: #ecfdf5; border: 1.5px solid #34d399; border-radius: 12px; padding: 3.5mm 4mm; font-size: 17px; font-weight: 700; color: #065f46; margin-top: 3mm; break-inside: avoid; }
  .page-two { break-before: page; page-break-before: always; padding-top: 2mm; }
  .page-two .section { break-inside: avoid; margin-bottom: 8mm; }
  .page-two .section h2 { font-size: 23px; }
  .page-two .step { font-size: 19px; margin-bottom: 3.5mm; }
  .footer { text-align: center; font-size: 15px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 4mm; margin-top: 2mm; }
</style></head><body>
  <main>
    <div class="header">
      <h1>📖 ${churchName} 성경 읽기</h1>
      <p>매일 함께 성경을 읽고 달란트 ⭐ 를 모아요</p>
    </div>
    <div class="qr">
      <img src="${qrDataUrl}" alt="성경통독114 접속 QR" />
      <div class="big">휴대폰 카메라로 이 네모(QR)를 비춰주세요</div>
      <div class="url">인터넷 주소: ${esc(SITE_URL)}</div>
    </div>
    <div class="section">
      <h2>1️⃣ 처음 오신 분 — 회원가입 (딱 한 번만)</h2>
      <div class="step"><span class="num">①</span><span>QR로 접속한 뒤 <b>"${churchName}"</b>을 검색해서 선택해주세요</span></div>
      <div class="step"><span class="num">②</span><span>"처음 오셨나요? <b>회원가입</b>"을 눌러주세요</span></div>
      <div class="step"><span class="num">③</span><span><b>이름</b> · <b>생년월일 8자리</b>(예: 19560315) · <b>비밀번호</b>(6자리 이상)를 넣어주세요</span></div>
      <div class="step"><span class="num">④</span><span>교회 입장코드: ${codeBlock}</span></div>
    </div>
    <div class="section">
      <h2>2️⃣ 홈 화면에 추가 — 다음부터 한 번에 열려요</h2>
      <div class="twocol">
        <div class="device">
          <h3>🍎 아이폰 (사파리)</h3>
          <div class="step"><span class="num">①</span><span>화면 아래 <b>공유 버튼</b> <span class="share-icon">⬆︎</span> 누르기</span></div>
          <div class="step"><span class="num">②</span><span><b>"홈 화면에 추가"</b> 찾아 누르기</span></div>
          <div class="step"><span class="num">③</span><span>오른쪽 위 <b>추가</b> 누르기</span></div>
        </div>
        <div class="device">
          <h3>🤖 갤럭시 (크롬·삼성인터넷)</h3>
          <div class="step"><span class="num">①</span><span>오른쪽 위 <b>점 세 개 ⋮</b> (또는 ☰) 누르기</span></div>
          <div class="step"><span class="num">②</span><span><b>"홈 화면에 추가"</b> 누르기</span></div>
          <div class="step"><span class="num">③</span><span><b>추가</b> 누르기</span></div>
        </div>
      </div>
      <div class="highlight">✅ 이제 바탕화면의 <b>114 아이콘</b>만 누르면 바로 열려요. 로그인도 유지됩니다!</div>
    </div>
    <div class="footer">뒷면에 "매일 이렇게 해요"가 있어요 →</div>
  </main>

  <main class="page-two">
    <div class="section">
      <h2>3️⃣ 매일 이렇게 해요 (5분이면 충분해요)</h2>
      <div class="step"><span class="num">①</span><span>바탕화면 <b>114 아이콘</b>을 눌러 들어와요 (자동 로그인)</span></div>
      <div class="step"><span class="num">②</span><span>🎬 <b>매일성경 영상</b>을 봐도 좋아요 (선택)</span></div>
      <div class="step"><span class="num">③</span><span>📖 <b>오늘 본문</b>을 읽어요 — 눈이 침침하면 <b>듣기 ▶️</b> 버튼, 글씨는 <b>+</b> 버튼으로 크게</span></div>
      <div class="step"><span class="num">④</span><span>❓ <b>성경퀴즈</b>는 선택이에요 — 풀면 달란트 ⭐ 추가! 어려우면 건너뛰어도 돼요</span></div>
      <div class="step"><span class="num">⑤</span><span>다 읽으면 파란 <b>"오늘 읽기 완료"</b> 버튼을 꼭 눌러요 → 다음 날로 넘어가요</span></div>
    </div>
    <div class="section">
      <h2>⭐ 달란트는 이렇게 모여요</h2>
      <div class="step"><span class="num">·</span><span>매일 첫 읽기 완료: <b>10 달란트</b> + 연속으로 읽으면 보너스가 커져요</span></div>
      <div class="step"><span class="num">·</span><span>퀴즈 정답 (하루 1번): <b>추가 달란트</b></span></div>
      <div class="step"><span class="num">·</span><span>모은 달란트로 <b>달란트 상점</b>에서 상품을 사요 → <b>상품은 교회에서 받아요!</b></span></div>
    </div>
    <div class="section">
      <h2>❓ 막힐 때는</h2>
      <div class="step"><span class="num">·</span><span>화면 위 <b>물음표(?) 버튼</b>을 누르면 사용법과 자주 묻는 질문이 나와요</span></div>
      <div class="step"><span class="num">·</span><span>그래도 안 되면 <b>교회 관리자(담당 선생님)</b>에게 말씀해주세요 😊</span></div>
    </div>
    <div class="footer">${churchName} · 성경통독 114 (${esc(SITE_URL)})</div>
  </main>
  <script>window.onload = function(){ window.print(); };<\/script>
</body></html>`;
        openPrintWindow(html, printWindow);
    };

    // ── 관리자 매뉴얼 A4 인쇄 (책상 비치용) ──
    const printAdminManual = () => {
        const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const churchName = esc(churchInfo?.name || currentUser.churchName || '');
        const html = `<!doctype html><html><head><meta charset="utf-8"><title>관리자 매뉴얼</title>
<style>
  @page { size: A4 portrait; margin: 13mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif; color: #1e293b; font-size: 12.5px; line-height: 1.5; }
  h1 { font-size: 22px; margin-bottom: 1mm; }
  .sub { font-size: 12px; color: #64748b; margin-bottom: 5mm; }
  .sec { border: 1px solid #e2e8f0; border-radius: 10px; padding: 3.5mm 4mm; margin-bottom: 3.5mm; break-inside: avoid; }
  .sec h2 { font-size: 14.5px; margin-bottom: 1.5mm; }
  .sec li { margin-left: 5mm; margin-bottom: 0.8mm; }
  b.violet { color: #7c3aed; }
  .tip { background: #fefce8; border-radius: 6px; padding: 1.5mm 3mm; margin-top: 1.5mm; font-size: 11.5px; color: #854d0e; }
</style></head><body>
  <h1>📘 ${churchName} — 관리자 매뉴얼</h1>
  <p class="sub">성경통독 114 (www.bible114.net) · 관리자 로그인: 로그인 화면에서 "공동체 관리자" 탭 → 이메일 + 비밀번호</p>

  <div class="sec"><h2>📊 대시보드 — 매일 아침 한 눈에</h2><ul>
    <li>오늘 읽은 교인 수, 부서별 현황, <b>관심 필요 명단</b>(3일·1주 이상 안 읽은 분)을 확인해요.</li>
    <li>연속 읽기 Top 5로 칭찬할 분을 찾아보세요.</li>
  </ul></div>

  <div class="sec"><h2>👥 교인 관리</h2><ul>
    <li>이름 검색, 부서/읽기 상태 필터, 교인을 클릭하면 상세 정보가 열려요.</li>
    <li><b>비밀번호를 잊은 교인</b>: 교인 클릭 → "비밀번호 재설정" → 새 비밀번호를 전달해주세요.</li>
    <li>여러 명 선택 후 주 소속 일괄 변경도 가능해요. CSV 내보내기로 명단을 저장할 수 있어요.</li>
  </ul></div>

  <div class="sec"><h2>⭐ 달란트 상점</h2><ul>
    <li><b>켜기</b>: 상점 탭 맨 위 스위치. 꺼져 있으면 교인에게 전혀 보이지 않아요.</li>
    <li><b>상품 등록</b>: 이모지 그룹(간식/장난감/학용품/생필품)에서 골라 이름·가격 입력.</li>
    <li><b class="violet">창구 판매</b>: 앱이 어려운 어르신은 말씀만 하시면 — 교인 선택 + 구입 물품 기록 + 달란트 입력 → 차감. <b>물품 기록은 필수</b>예요.</li>
    <li>교인이 앱에서 직접 산 건 "수령 대기"로 들어와요 → 상품 전달 후 <b>수령 완료</b> 누르기. 실수면 <b>취소·환불</b>.</li>
    <li><b>🖨️ 상품 목록 인쇄</b>: A4로 뽑아 게시판에 붙여두세요 (상품 수에 따라 크기 자동 조절).</li>
  </ul>
  <p class="tip">💡 달란트는 매일 첫 읽기에 10 + 연속 보너스(최대 7), 성경퀴즈 정답 시 추가 적립됩니다. 7일 연속 읽으면 교인에게 상점이 열려요.</p></div>

  <div class="sec"><h2>📋 조직 / 📢 공지</h2><ul>
    <li>조직 탭: 부서와 소그룹을 만들고 수정해요 (예: 장년부 > 1구역).</li>
    <li>공지 탭: 대시보드 상단에 뜨는 공지와 카카오톡 단체방 링크를 등록해요.</li>
  </ul></div>

  <div class="sec"><h2>⚙️ 설정 — 인쇄물 · 입장코드</h2><ul>
    <li><b>성도용 가입 안내문 인쇄</b>: QR + 가입 방법이 담긴 A4 — 새 성도에게 나눠주세요.</li>
    <li>교회 입장코드 변경도 여기서 해요 (가입할 때 교인이 입력하는 코드). <b>코드를 입력·변경한 바로 그 자리에서 안내문을 인쇄</b>하면 자동으로 들어갑니다.</li>
  </ul></div>

  <div class="sec"><h2>❓ 자주 묻는 질문</h2><ul>
    <li><b>교인이 로그인이 안 된대요</b> → 이름·생년월일 8자리가 가입 때와 똑같은지 확인, 그래도 안 되면 비밀번호 재설정.</li>
    <li><b>가입 안내문의 입장코드 칸이 비어 있어요</b> → 코드는 원문을 저장하지 않아요. 설정에서 코드를 입력·변경한 직후 인쇄하거나 빈칸에 직접 적어주세요.</li>
    <li><b>교인이 날짜가 밀렸대요</b> → 밀린 날부터 이어 읽으면 됩니다. 읽기 불이익은 없고 연속 보너스만 다시 시작해요. 날짜는 성도 화면의 📅 날짜 설정에서 맞출 수 있어요.</li>
    <li><b>수령 완료를 잘못 눌렀어요</b> → 해당 구매를 취소·환불해 달란트를 돌려준 뒤 다시 처리해주세요.</li>
    <li><b>상점이 안 보인대요</b> → 상점과 소속 부서가 켜져 있는지 확인하세요. 성도는 7일 연속 읽기를 달성하면 상점이 열립니다.</li>
    <li><b>어르신이 직접 구매하기 어려워요</b> → 상점의 창구 판매에서 교인과 상품을 선택해 대신 기록해주세요.</li>
    <li><b>홈 화면 추가를 도와달래요</b> → 성도용 가입 안내문 1면의 아이폰·갤럭시 순서를 함께 따라 해주세요.</li>
    <li><b>랭킹이 안 보인대요</b> → 먼저 새로고침하고, 계속 안 보이면 관리자 화면 상단 카카오 채널로 플랫폼 운영자에게 문의하세요.</li>
  </ul></div>
  <script>window.onload = function(){ window.print(); };<\/script>
</body></html>`;
        openPrintWindow(html);
    };

    // ── 상품 목록 A4 인쇄 — 상품 수에 따라 글씨·그림 크기 자동 조절 ──
    const printShopItems = () => {
        const items = activeShopItems.filter(i => i && i.active !== false);
        if (items.length === 0) { toast.error('인쇄할 판매중 상품이 없습니다.'); return; }
        const n = items.length;
        const size = n <= 4 ? { cols: 2, emoji: 88, name: 30, price: 24, desc: 15 }
            : n <= 8 ? { cols: 2, emoji: 64, name: 24, price: 20, desc: 13 }
            : n <= 12 ? { cols: 3, emoji: 52, name: 20, price: 17, desc: 12 }
            : n <= 20 ? { cols: 4, emoji: 40, name: 16, price: 14, desc: 10 }
            : { cols: 5, emoji: 30, name: 13, price: 12, desc: 9 };
        const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const cards = items.map(item => `
            <div class="card">
                <div class="emoji">${esc(item.emoji)}</div>
                <div class="name">${esc(item.name)}</div>
                <div class="price">⭐ ${Number(item.price) || 0} 달란트</div>
                ${item.description ? `<div class="desc">${esc(item.description)}</div>` : ''}
            </div>`).join('');
        const html = `<!doctype html><html><head><meta charset="utf-8"><title>달란트 상점 상품 목록</title>
<style>
  @page { size: A4 portrait; margin: 14mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif; color: #1e293b; }
  .header { text-align: center; margin-bottom: 8mm; }
  .header h1 { font-size: 30px; }
  .header p { font-size: 14px; color: #64748b; margin-top: 3mm; }
  .grid { display: grid; grid-template-columns: repeat(${size.cols}, 1fr); gap: 5mm; }
  .card { border: 1.5px solid #cbd5e1; border-radius: 12px; padding: 5mm 3mm; text-align: center; break-inside: avoid; }
  .emoji { font-size: ${size.emoji}px; line-height: 1.25; }
  .name { font-size: ${size.name}px; font-weight: 800; margin-top: 2mm; }
  .price { font-size: ${size.price}px; font-weight: 700; color: #7c3aed; margin-top: 1.5mm; }
  .desc { font-size: ${size.desc}px; color: #64748b; margin-top: 1.5mm; }
  .footer { text-align: center; font-size: 12px; color: #94a3b8; margin-top: 8mm; }
</style></head><body>
  <div class="header"><h1>⭐ 달란트 상점</h1><p>${esc(churchInfo?.name || currentUser.churchName || '')} · 구입은 관리자(선생님)께 말씀해주세요</p></div>
  <div class="grid">${cards}</div>
  <div class="footer">성경 읽기로 달란트를 모아보세요 — 매일 첫 읽기마다 적립됩니다</div>
  <script>window.onload = function(){ window.print(); };<\/script>
</body></html>`;
        openPrintWindow(html);
    };

    const requestPurchaseRefund = (purchase) => {
        const hasWalletSnapshot = purchase?.schemaVersion === 2
            ? hasValidV2RefundWalletSnapshot(purchase, currentUser.churchId)
            : Boolean(resolvePurchaseRefundWalletKind(purchase));
        if (purchase?.schemaVersion === 2 && !hasWalletSnapshot) {
            toast.error('구매 당시 지갑 기록이 손상되어 자동 환불할 수 없습니다. 플랫폼 관리자에게 문의해주세요.');
            return;
        }
        setConfirmAction({
            type: hasWalletSnapshot ? 'refundPurchase' : 'refundLegacyPurchase',
            purchase,
            legacyWalletKind: '',
            title: `${purchase.itemName} 구매를 취소·환불할까요?`,
            message: hasWalletSnapshot
                ? `대기 건을 취소하고 ${purchase.price || 0}달란트를 교인 잔액에 돌려줍니다.`
                : `이전 버전 구매라 구매 당시 지갑 기록이 없습니다. 잘못된 지갑에 환불하지 않도록 관리자가 환불할 지갑을 직접 선택해야 합니다.`,
            danger: true,
            confirmLabel: '취소·환불',
        });
    };

    const updatePurchaseStatus = async (
        purchase, mode, legacyWalletKind = null, migratedWalletConfirmed = false
    ) => {
        if (talentActionRef.current) {
            toast.warning('다른 달란트 작업을 처리하고 있습니다. 잠시 후 다시 시도해주세요.');
            return;
        }
        talentActionRef.current = true;
        const actionName = mode === 'cancelled' ? 'refund' : 'deliver';
        const requestKey = adminTalentRequestKey([
            currentUser.uid, currentUser.churchId, actionName, purchase.id,
            mode === 'cancelled' ? (legacyWalletKind || '') : '', migratedWalletConfirmed,
        ]);
        const requestId = getOrCreateAdminTalentRequestId(requestKey);
        try {
            const result = mode === 'cancelled'
                ? await adminRefundPurchase({
                    churchId: currentUser.churchId,
                    purchaseId: purchase.id,
                    legacyWalletKind: legacyWalletKind || '',
                    migratedWalletConfirmed,
                }, { requestId })
                : await adminDeliverPurchase({
                    churchId: currentUser.churchId,
                    purchaseId: purchase.id,
                }, { requestId });
            clearAdminTalentRequestId(requestKey);
            setTalentPurchases(prev => prev.map(row => (
                row.id === purchase.id ? { ...row, ...result.purchase } : row
            )));
            if (mode === 'cancelled') {
                setMembers(prev => prev.map(member => (
                    member.uid === purchase.uid && (
                        (result.walletKind === 'roster' && member.isExternalOrgMember)
                        || (result.walletKind === 'user' && !member.isExternalOrgMember)
                    )
                        ? { ...member, talent: result.nextTalent }
                        : member
                )));
                toast.success('구매를 취소하고 달란트를 환불했습니다.');
            } else {
                toast.success('수령 완료로 처리했습니다.');
            }
        } catch (error) {
            console.error(error);
            if (isDefiniteAdminTalentFailure(error)) {
                clearAdminTalentRequestId(requestKey);
            }
            if (error?.code === 'REFUND_MIGRATION_CONFIRM_REQUIRED') {
                setConfirmAction({
                    type: 'refundMigratedPurchase',
                    purchase,
                    title: `${purchase.itemName} 환불 지갑을 확인해주세요`,
                    message: '구매 뒤 개인 계정으로 전환되어 이 공동체의 명부 지갑을 사용하는 상태입니다. 현재 명부 지갑으로 환불할지 한 번 더 확인해주세요.',
                    danger: true,
                    confirmLabel: '명부 지갑으로 환불',
                });
                return;
            }
            if (error?.code === 'CONFLICT') {
                toast.error(error.message || '이미 처리된 구매입니다. 목록을 새로 확인해주세요.');
                await loadData();
                return;
            }
            const resultUnknown = !isDefiniteAdminTalentFailure(error) && (
                error?.retryable === true || error?.status >= 500
                || error?.code === 'TIMEOUT' || error?.code === 'NETWORK_ERROR'
            );
            toast.error(resultUnknown
                ? `처리 결과를 확인하지 못했습니다. 같은 ${mode === 'cancelled' ? '취소·환불' : '수령 완료'} 작업을 다시 누르면 중복 처리 없이 결과를 확인합니다.`
                : (error.message || '구매 처리에 실패했습니다.'));
        } finally {
            talentActionRef.current = false;
        }
    };

    const loadMorePendingPurchases = async () => {
        if (!pendingPurchaseCursor || !hasMorePendingPurchases || loadingMorePendingPurchases) return;
        setLoadingMorePendingPurchases(true);
        try {
            const purchasesRef = db.collection('churches').doc(currentUser.churchId).collection('talentPurchases');
            const pageSnap = await purchasesRef.where('status', '==', 'pending')
                .orderBy(firebase.firestore.FieldPath.documentId())
                .startAfter(pendingPurchaseCursor)
                .limit(PENDING_PURCHASE_PAGE_SIZE + 1)
                .get();
            const pageDocs = pageSnap.docs.slice(0, PENDING_PURCHASE_PAGE_SIZE);
            const externalMemberIds = new Set(members.filter(member => member.isExternalOrgMember).map(member => member.uid));
            setTalentPurchases(previous => {
                const mergedPurchases = mergeAdminTalentPurchases({
                pendingDocs: [
                    ...previous.map(row => ({ id: row.id, data: () => row })),
                    ...pageDocs,
                ],
                externalMemberIds,
                });
                reconcileAdminTalentRequestIds(new Set(mergedPurchases.flatMap(purchase => (
                    [purchase.requestId, purchase.adminActionRequestId].filter(Boolean)
                ))));
                return mergedPurchases;
            });
            setPendingPurchaseCursor(pageDocs.at(-1) || pendingPurchaseCursor);
            setHasMorePendingPurchases(pageSnap.docs.length > PENDING_PURCHASE_PAGE_SIZE);
            setPendingPurchaseLoadWarning('');
        } catch (error) {
            console.error('미처리 구매 추가 로드 실패:', error);
            setPendingPurchaseLoadWarning('미처리 구매를 더 불러오지 못했습니다. 다시 시도해주세요.');
        } finally {
            setLoadingMorePendingPurchases(false);
        }
    };

    const todayStr = new Date().toDateString();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toDateString();

    const getTotalProgressDay = getDaysRead;
    const daysSinceRead = (dateStr) => {
        if (!dateStr) return null;
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return null;
        d.setHours(0, 0, 0, 0);
        const today = new Date(todayStr);
        today.setHours(0, 0, 0, 0);
        return Math.floor((today - d) / 86400000);
    };

    const dashboardStats = (() => {
        const total = members.length;
        const readToday = members.filter(m => m.lastReadDate === todayStr).length;
        const readYesterday = members.filter(m => m.lastReadDate === yesterdayStr).length;
        const recent7 = members.filter(m => {
            const days = daysSinceRead(m.lastReadDate);
            return days !== null && days >= 0 && days <= 6;
        }).length;
        const avgDay = total > 0
            ? Math.round(members.reduce((sum, m) => sum + getTotalProgressDay(m), 0) / total)
            : 0;
        return {
            total,
            readToday,
            readYesterday,
            readDelta: readToday - readYesterday,
            recent7Rate: total > 0 ? Math.round((recent7 / total) * 100) : 0,
            avgDay,
        };
    })();

    const subgroupStatsMap = calculateSubgroupStats(members, orgComms);
    const departmentStats = Object.values(subgroupStatsMap).reduce((acc, stat) => {
        const key = stat.departmentId || stat.departmentName || 'unknown';
        if (!acc[key]) {
            acc[key] = {
                departmentId: stat.departmentId,
                departmentName: stat.departmentName || '미배정',
                subgroups: [],
            };
        }
        acc[key].subgroups.push(stat);
        return acc;
    }, {});
    const departmentCards = Object.values(departmentStats).map(dept => {
        // 한 사람이 같은 부서 안의 여러 소그룹에 속해도 부서 단위 지표는 uid당 한 번만 센다.
        const departmentMembers = members.filter(member => belongsToDepartment(member, dept.departmentId));
        const totalCount = departmentMembers.length;
        const readCount = departmentMembers.filter(member => member.lastReadDate === todayStr).length;
        const avgDay = totalCount > 0
            ? Math.round(departmentMembers.reduce((sum, member) => sum + getTotalProgressDay(member), 0) / totalCount)
            : 0;
        return {
            ...dept,
            totalCount,
            readCount,
            rate: totalCount > 0 ? Math.round((readCount / totalCount) * 100) : 0,
            avgDay,
        };
    });

    const atRisk = computeAtRisk(members, todayStr);
    const completedReaders = [...members]
        .filter(member => (member.readCount || 1) > 1)
        .sort((a, b) => {
            const countDiff = (b.readCount || 1) - (a.readCount || 1);
            return countDiff || (a.name || '').localeCompare(b.name || '', 'ko-KR');
        });
    const streakTop = [...members]
        .filter(m => (m.streak || 0) > 0)
        .sort((a, b) => (b.streak || 0) - (a.streak || 0))
        .slice(0, 5);

    const sortedMembers = [...members].sort((a, b) => {
        if (sortBy === 'name') return (a.name || '').localeCompare(b.name || '', 'ko-KR');
        if (sortBy === 'day') {
            const aDay = getDaysRead(a);
            const bDay = getDaysRead(b);
            return bDay - aDay;
        }
        if (sortBy === 'score') return (b.score || 0) - (a.score || 0);
        return 0;
    });

    const filteredMembers = sortedMembers.filter(member => {
        const departmentMatch = memberDepartmentFilter === 'all'
            || belongsToDepartment(member, memberDepartmentFilter);
        const days = daysSinceRead(member.lastReadDate);
        const readMatch =
            memberReadFilter === 'all' ||
            (memberReadFilter === 'today' && member.lastReadDate === todayStr) ||
            (memberReadFilter === 'unread' && member.lastReadDate !== todayStr) ||
            (memberReadFilter === 'risk7' && (days === null || days >= 7));
        return departmentMatch && readMatch;
    });

    const memberColumns = [
        {
            key: 'name',
            header: '이름',
            render: m => (
                <div>
                    <p className="font-black text-slate-800">{m.name} {m.isExternalOrgMember && <span className="ml-1 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] text-violet-700">개인·외부 멤버</span>}</p>
                    <p className="text-xs text-slate-400">{m.birthdate || '-'}</p>
                </div>
            ),
            searchValue: m => `${m.name || ''} ${m.birthdate || ''}`,
        },
        {
            key: 'departmentName',
            header: '부서/소그룹',
            render: m => {
                const membershipLabels = getMemberMembershipLabels(m);
                return (
                    <div className="flex max-w-xs flex-wrap gap-1.5">
                        {membershipLabels.map(label => (
                            <span
                                key={label.key}
                                className={`rounded-full px-2 py-1 text-[11px] font-bold ${label.isPrimary
                                    ? 'bg-slate-100 text-slate-700'
                                    : 'bg-indigo-50 text-indigo-700'}`}
                            >
                                {label.isPrimary ? label.text : `+${label.text}`}
                            </span>
                        ))}
                    </div>
                );
            },
            searchValue: m => getMemberMembershipText(m),
        },
        {
            key: 'progress',
            header: '진행',
            render: m => `DAY ${getTotalProgressDay(m)}`,
            sortValue: getTotalProgressDay,
        },
        {
            key: 'streak',
            header: '연속',
            render: m => `${m.streak || 0}일`,
            sortValue: m => m.streak || 0,
        },
        {
            key: 'lastReadDate',
            header: '읽기상태',
            render: m => m.lastReadDate === todayStr
                ? <span className="text-green-600 font-black">오늘</span>
                : <span className="text-slate-400">{formatReadDate(m.lastReadDate)}</span>,
            sortValue: m => m.lastReadDate || '',
        },
    ];

    const memberById = members.reduce((acc, member) => {
        acc[member.uid] = member;
        return acc;
    }, {});
    const normalizedTalentShop = promoteTalentShopConfig(talentShop, orgComms);
    const activeTalentMarket = normalizedTalentShop.markets?.[talentMarketId]
        || normalizedTalentShop.markets?.[SHARED_TALENT_MARKET_ID]
        || Object.values(normalizedTalentShop.markets || {})[0]
        || null;
    const activeShopItems = Array.isArray(activeTalentMarket?.items) ? activeTalentMarket.items : [];
    const talentMarketDepartmentIds = Object.entries(normalizedTalentShop.departmentSettings || {})
        .filter(([, setting]) => setting?.enabled === true && setting.marketId === activeTalentMarket?.id)
        .map(([departmentId]) => departmentId);
    const talentMarketMembers = members.filter(member => (
        talentMarketDepartmentIds.some(departmentId => belongsToDepartment(member, departmentId))
    ));
    const pendingPurchaseCount = talentPurchases.filter(p => p.status === 'pending').length;
    const filteredPurchases = talentPurchases.filter(purchase => (
        (purchaseFilter === 'all' || purchase.status === purchaseFilter)
        // 미처리 건은 시장이 삭제·변경됐어도 어느 시장 화면에서든 처리할 수 있게 한다.
        && (purchase.status === 'pending' || !talentMarketId || !purchase.marketId || purchase.marketId === talentMarketId)
    ));
    const shopPreviewTalent = activeShopItems.reduce(
        (max, item) => Math.max(max, Number(item?.price) || 0),
        0
    );

    const TABS = [
        ['dashboard', '📊 대시보드'],
        ['members', '👥 교인 관리'],
        ['talentShop', `⭐ 달란트 상점${pendingPurchaseCount > 0 ? ` (${pendingPurchaseCount})` : ''}`],
        ['org', '📋 조직'],
        ['announcement', '📢 공지'],
        ['settings', '⚙️ 설정'],
    ];

    const sgComm = orgComms.find(c => c.id === sgCommId);
    const extraComm = orgComms.find(c => c.id === extraCommId);
    const selectedExtraMemberships = selectedMember ? getExtraMemberships(selectedMember) : [];

    const renderRiskList = (title, items, emptyText, getMeta) => (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-sm font-black text-slate-800">{title}</h3>
                <span className="text-xs font-bold text-slate-400">{items.length}명</span>
            </div>
            <div className="divide-y divide-slate-100">
                {items.length === 0 ? (
                    <p className="px-4 py-6 text-center text-xs font-bold text-slate-300">{emptyText}</p>
                ) : items.slice(0, 5).map(member => (
                    <div key={member.uid} className="px-4 py-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                            <p className="text-sm font-bold text-slate-800 truncate">{member.name} {member.isExternalOrgMember && <span className="ml-1 rounded-full bg-violet-50 px-1.5 py-0.5 text-[9px] text-violet-700">개인·외부</span>}</p>
                            <p className="text-xs text-slate-400 truncate">{getMemberMembershipText(member)}</p>
                        </div>
                        <span className="shrink-0 text-xs font-black text-slate-500">{getMeta(member)}</span>
                    </div>
                ))}
            </div>
        </div>
    );

    return (
        // 하단 고정 광고(50px)가 콘텐츠를 가리지 않도록 광고 높이만큼 여백 확보
        <div className="min-h-screen bg-slate-50" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 72px)' }}>
            {/* 상단 헤더 */}
            <div className="bg-white border-b border-slate-200 px-4 py-4 flex items-center justify-between sticky top-0 z-10">
                <div>
                    <h1 className="font-extrabold text-slate-800">⛪ 공동체 관리</h1>
                    <p className="text-xs text-slate-400">{currentUser.churchName}</p>
                </div>
                <div className="flex gap-2 flex-wrap justify-end">
                    {platformKakaoUrl && (
                        <a href={platformKakaoUrl} target="_blank" rel="noopener noreferrer"
                            className="text-xs bg-[#FEE500] text-[#3c1e1e] px-3 py-2 rounded-lg font-bold flex items-center gap-1">
                            💬 운영자 문의
                        </a>
                    )}
                    <button onClick={() => setShowTutorial(true)}
                        className="text-xs bg-blue-50 text-blue-600 px-3 py-2 rounded-lg font-bold">
                        사용법 보기
                    </button>
                    <button onClick={onBack}
                        className="text-xs bg-slate-100 text-slate-600 px-3 py-2 rounded-lg font-bold">
                        ← 성경 읽기로
                    </button>
                    <button onClick={handleLogout}
                        className="text-xs bg-red-50 text-red-500 px-3 py-2 rounded-lg font-bold">
                        로그아웃
                    </button>
                </div>
            </div>

            {/* 탭 */}
            <div id="admin-tut-tabs" className="flex gap-0 border-b border-slate-200 bg-white overflow-x-auto">
                {TABS.map(([t, label]) => (
                    <button key={t} onClick={() => setTab(t)}
                        className={`flex-shrink-0 py-3 px-4 text-xs font-bold border-b-2 transition-all whitespace-nowrap ${tab === t ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-400'}`}>
                        {label}
                    </button>
                ))}
            </div>

            <div className="max-w-5xl mx-auto p-4">
                {loading ? (
                    <div className="text-center py-20 text-slate-400">불러오는 중...</div>
                ) : loadError ? (
                    <div className="mx-auto max-w-md rounded-2xl border border-amber-200 bg-amber-50 px-5 py-8 text-center">
                        <p className="font-bold text-amber-900">{loadError}</p>
                        <button
                            type="button"
                            onClick={loadData}
                            className="mt-4 rounded-xl bg-amber-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-amber-700"
                        >
                            다시 불러오기
                        </button>
                    </div>
                ) : (
                    <>
                        {/* ── 대시보드 ── */}
                        {tab === 'dashboard' && (
                            <DashboardTab
                                dashboardStats={dashboardStats} deletedMembers={deletedMembers}
                                completedReaders={completedReaders} setShowCompletedReaders={setShowCompletedReaders}
                                departmentCards={departmentCards} streakTop={streakTop}
                                getMemberMembershipText={getMemberMembershipText}
                                renderRiskList={renderRiskList} atRisk={atRisk}
                                daysSinceRead={daysSinceRead} getTotalProgressDay={getTotalProgressDay}
                                formatReadDate={formatReadDate}
                            />
                        )}

                        {/* ── 교인 관리 ── */}
                        {tab === 'members' && (
                            <MembersTab ctx={{
                                members, filteredMembers, memberDepartmentFilter, setMemberDepartmentFilter,
                                memberReadFilter, setMemberReadFilter, orgComms, memberColumns, openMemberDetail,
                                bulkCommId, setBulkCommId, bulkSubId, setBulkSubId, setConfirmAction,
                                deletedMembers, getMemberMembershipText, restoreMember, downloadCSV,
                                getSubId, getSubName,
                            }} />
                        )}

                        {/* ── 달란트 상점 ── */}
                        {tab === 'talentShop' && (
                            <TalentShopTab ctx={{
                                talentShop, toggleTalentShopEnabled, savingTalentShop,
                                orgComms, talentMarketId, setTalentMarketId, activeTalentMarket, activeShopItems,
                                setDepartmentTalentEnabled, setDepartmentTalentMarketMode,
                                setShowShopPreview, showShopPreview, currentUser, shopPreviewTalent,
                                shopItemDraft, setShopItemDraft, editingShopItemId, emojiGroupIdx, setEmojiGroupIdx,
                                submitShopItem, resetShopItemDraft, editShopItem, deleteShopItem, printShopItems,
                                deductForm, setDeductForm, members: talentMarketMembers, requestManualDeduct, deducting,
                                purchaseFilter, setPurchaseFilter, filteredPurchases, memberById,
                                purchaseLoadWarning, pendingPurchaseCount, hasMorePendingPurchases, loadingMorePendingPurchases,
                                loadMorePendingPurchases,
                                formatAnyDate, setConfirmAction, requestPurchaseRefund,
                            }} />
                        )}

                        {/* ── 조직 관리 ── */}
                        {tab === 'org' && (
                            <OrganizationTab orgComms={orgComms} setOrgComms={setOrgComms} saveOrg={saveOrg} savingOrg={savingOrg} />
                        )}

                        {/* ── 공지사항 ── */}
                        {tab === 'announcement' && (
                            <AnnouncementTab
                                announcement={announcement} setAnnouncement={setAnnouncement}
                                saveAnnouncement={saveAnnouncement} saving={saving}
                                kakaoLink={kakaoLink} setKakaoLink={setKakaoLink}
                                saveKakaoLink={saveKakaoLink} savingKakao={savingKakao}
                            />
                        )}

                        {/* ── 설정 ── */}
                        {tab === 'settings' && (
                            <SettingsTab
                                currentUser={currentUser} churchInfo={churchInfo}
                                printMemberGuide={printMemberGuide} printAdminManual={printAdminManual}
                                newChurchCode={newChurchCode} setNewChurchCode={setNewChurchCode}
                                saveChurchCode={saveChurchCode} savingCode={savingCode}
                            />
                        )}
                    </>
                )}
            </div>

            <SlideOverPanel
                open={!!selectedMember}
                title={selectedMember?.name}
                subtitle={selectedMember ? getMemberMembershipText(selectedMember) : ''}
                onClose={closeMemberDetail}
                footer={selectedMember && (
                    <div className="flex flex-wrap justify-end gap-2">
                        <button
                            type="button"
                            onClick={closeMemberDetail}
                            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-600"
                        >
                            닫기
                        </button>
                        <button
                            type="button"
                            onClick={() => setConfirmAction({
                                type: 'singlePassword',
                                member: selectedMember,
                                title: `${selectedMember.name}님의 비밀번호를 초기화할까요?`,
                                message: '6자리 임시 비밀번호가 새로 발급됩니다. 새 비밀번호는 교인 상세의 "비밀번호 확인"에서 조회할 수 있습니다.',
                                danger: true,
                                confirmLabel: '초기화',
                            })}
                            className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-black text-white"
                        >
                            비밀번호 초기화
                        </button>
                        <button
                            type="button"
                            onClick={() => deleteMember(selectedMember)}
                            className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-black text-white"
                        >
                            {selectedMember.isExternalOrgMember ? '공동체에서 제명' : '삭제 처리'}
                        </button>
                    </div>
                )}
            >
                {selectedMember && (
                    <div className="space-y-5">
                        {selectedMember.isExternalOrgMember && (
                            <div className="rounded-2xl border border-violet-100 bg-violet-50 p-4 text-sm font-bold text-violet-800">
                                외부 공동체 멤버 · 이 공동체 안에서 주 소속과 추가 소그룹을 배정하거나 제명할 수 있습니다. 개인 계정의 기준 공동체라면 비밀번호 지원도 가능합니다.
                            </div>
                        )}
                        <div className="grid grid-cols-2 gap-3">
                            <div className="rounded-2xl bg-slate-50 p-4">
                                <p className="text-xs font-black text-slate-400">진행</p>
                                <p className="mt-1 text-2xl font-black text-slate-900">DAY {getTotalProgressDay(selectedMember)}</p>
                                <p className="mt-1 text-xs font-bold text-slate-400">{selectedMember.readCount || 1}독째</p>
                            </div>
                            <div className="rounded-2xl bg-slate-50 p-4">
                                <p className="text-xs font-black text-slate-400">점수/연속</p>
                                <p className="mt-1 text-2xl font-black text-slate-900">{selectedMember.score || 0}점</p>
                                <p className="mt-1 text-xs font-bold text-slate-400">{selectedMember.streak || 0}일 연속</p>
                            </div>
                        </div>

                        <div className="rounded-2xl border border-slate-100 p-4">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <p className="text-sm font-black text-slate-800">최근 읽기 상태</p>
                                    <p className="text-xs font-bold text-slate-400">마지막 읽기: {formatReadDate(selectedMember.lastReadDate)}</p>
                                </div>
                                <span className={`rounded-full px-3 py-1 text-xs font-black ${selectedMember.lastReadDate === todayStr ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                                    {selectedMember.lastReadDate === todayStr ? '오늘 읽음' : '오늘 미독'}
                                </span>
                            </div>
                        </div>

                        {/* 비밀번호 조회 — 이관 후 평문은 private 하위문서에 있으므로 필요할 때만 조회한다.
                            초기화 직후에도 이 버튼으로 새로 발급된 비밀번호를 확인해 전달할 수 있다. */}
                        <div className="rounded-2xl border border-slate-100 p-4">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <p className="text-sm font-black text-slate-800">비밀번호</p>
                                    <p className="text-xs font-bold text-slate-400">로그인을 못 하는 교인에게 확인 후 전달해주세요.</p>
                                </div>
                                {typeof selectedMember.password === 'string' && selectedMember.password ? (
                                    <span className="font-mono text-sm font-bold text-slate-700">{selectedMember.password}</span>
                                ) : revealedPasswords[selectedMember.uid] === '__loading__' ? (
                                    <span className="text-xs font-bold text-slate-400">확인 중...</span>
                                ) : revealedPasswords[selectedMember.uid] === '__error__' ? (
                                    <span className="text-xs font-bold text-red-400">조회 실패</span>
                                ) : revealedPasswords[selectedMember.uid] ? (
                                    <span className="font-mono text-sm font-bold text-slate-700">{revealedPasswords[selectedMember.uid]}</span>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => revealPassword(selectedMember.uid)}
                                        className="rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-600 hover:bg-slate-200"
                                    >
                                        확인
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="rounded-2xl border border-slate-100 p-4">
                            <div className="mb-3 flex items-center justify-between gap-3">
                                <p className="text-sm font-black text-slate-800">소속</p>
                                <span className="text-xs font-bold text-slate-400">추가 {selectedExtraMemberships.length}/3</span>
                            </div>

                            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                                <p className="text-[11px] font-black text-slate-400">{selectedMember.isExternalOrgMember ? '이 공동체 소속' : '주 소속'}</p>
                                <p className="mt-1 text-sm font-bold text-slate-700">
                                    {getPrimaryMembership(selectedMember)
                                        ? getMembershipDisplayText(getPrimaryMembership(selectedMember))
                                        : '미배정'}
                                </p>
                            </div>

                            {orgComms.length === 0 ? (
                                <p className="mt-3 text-xs font-bold text-slate-400">먼저 조직 탭에서 부서/소그룹을 만들어주세요.</p>
                            ) : (
                                <div className="mt-3">
                                    <p className="mb-2 text-xs font-black text-slate-500">{selectedMember.isExternalOrgMember ? '이 공동체 소속 변경' : '주 소속 변경'}</p>
                                    {!selectedMember.isExternalOrgMember && <p className="mb-2 text-[11px] font-bold text-slate-400">추가 소속은 유지되며 새 주 소속과 같은 항목만 정리됩니다.</p>}
                                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
                                        <select
                                            value={sgCommId}
                                            onChange={e => { setSgCommId(e.target.value); setSgSubId(''); }}
                                            disabled={membershipSaving}
                                            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-bold text-slate-700 disabled:opacity-50"
                                        >
                                            <option value="">부서 선택</option>
                                            {orgComms.map(comm => <option key={comm.id} value={comm.id}>{comm.name}</option>)}
                                        </select>
                                        <select
                                            value={sgSubId}
                                            onChange={e => setSgSubId(e.target.value)}
                                            disabled={!sgCommId || membershipSaving}
                                            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-bold text-slate-700 disabled:opacity-50"
                                        >
                                            <option value="">소그룹 선택</option>
                                            {(sgComm?.subgroups || []).map((sub, index) => {
                                                const subId = getSubId(sub);
                                                return <option key={subId || index} value={subId}>{getSubName(sub)}</option>;
                                            })}
                                        </select>
                                        <button
                                            type="button"
                                            disabled={!sgCommId || !sgSubId || membershipSaving}
                                            onClick={() => { void applySubgroupToMembers([selectedMember], sgCommId, sgSubId); }}
                                            className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-40"
                                        >
                                            {membershipSaving ? '저장 중...' : (selectedMember.isExternalOrgMember ? '소그룹 저장' : '주 소속 저장')}
                                        </button>
                                    </div>
                                </div>
                            )}

                            <div className="mt-4 border-t border-slate-100 pt-4">
                                <p className="mb-2 text-xs font-black text-slate-500">추가 소속</p>
                                {selectedExtraMemberships.length === 0 ? (
                                    <p className="rounded-xl bg-slate-50 px-3 py-3 text-xs font-bold text-slate-400">추가 소속이 없습니다.</p>
                                ) : (
                                    <div className="space-y-2">
                                        {selectedExtraMemberships.map(membership => (
                                            <div
                                                key={JSON.stringify([membership.departmentId, membership.subgroupId])}
                                                className="flex items-center justify-between gap-3 rounded-xl border border-indigo-100 bg-indigo-50/60 px-3 py-2.5"
                                            >
                                                <span className="min-w-0 truncate text-sm font-bold text-indigo-800">
                                                    {getMembershipDisplayText(membership)}
                                                </span>
                                                <button
                                                    type="button"
                                                    disabled={membershipSaving}
                                                    onClick={() => { void removeSelectedMemberExtraMembership(membership); }}
                                                    className="shrink-0 rounded-lg bg-white px-2.5 py-1.5 text-xs font-black text-red-500 disabled:opacity-40"
                                                >
                                                    제거
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {selectedExtraMemberships.length >= 3 ? (
                                    <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2.5 text-xs font-bold text-amber-700">
                                        추가 소속은 최대 3개까지 등록할 수 있습니다.
                                    </p>
                                ) : orgComms.length > 0 && (
                                    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
                                        <select
                                            value={extraCommId}
                                            onChange={e => { setExtraCommId(e.target.value); setExtraSubId(''); }}
                                            disabled={membershipSaving}
                                            className="rounded-xl border border-indigo-100 bg-indigo-50/40 px-3 py-2.5 text-sm font-bold text-slate-700 disabled:opacity-50"
                                        >
                                            <option value="">추가 부서 선택</option>
                                            {orgComms.map(comm => <option key={comm.id} value={comm.id}>{comm.name}</option>)}
                                        </select>
                                        <select
                                            value={extraSubId}
                                            onChange={e => setExtraSubId(e.target.value)}
                                            disabled={!extraCommId || membershipSaving}
                                            className="rounded-xl border border-indigo-100 bg-indigo-50/40 px-3 py-2.5 text-sm font-bold text-slate-700 disabled:opacity-50"
                                        >
                                            <option value="">추가 소그룹 선택</option>
                                            {(extraComm?.subgroups || []).map((sub, index) => {
                                                const subId = getSubId(sub);
                                                const subgroupName = getSubName(sub);
                                                const alreadyAssigned = belongsToMembership(selectedMember, {
                                                    departmentId: extraCommId,
                                                    subgroupId: subId,
                                                    subgroupName,
                                                });
                                                return (
                                                    <option key={subId || index} value={subId} disabled={alreadyAssigned}>
                                                        {subgroupName}{alreadyAssigned ? ' (등록됨)' : ''}
                                                    </option>
                                                );
                                            })}
                                        </select>
                                        <button
                                            type="button"
                                            disabled={!extraCommId || !extraSubId || membershipSaving}
                                            onClick={() => { void addSelectedMemberExtraMembership(); }}
                                            className="rounded-xl bg-indigo-100 px-4 py-2.5 text-sm font-black text-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
                                        >
                                            {membershipSaving ? '저장 중...' : '소속 추가'}
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>

                        {!selectedMember.isExternalOrgMember ? <div className="rounded-2xl border border-slate-100 p-4">
                            <div className="mb-3 flex items-center justify-between gap-3">
                                <p className="text-sm font-black text-slate-800">최근 읽기 기록</p>
                                <span className="text-xs font-bold text-slate-400">최대 10개</span>
                            </div>
                            {detailLoading ? (
                                <p className="py-8 text-center text-xs font-bold text-slate-300">기록을 불러오는 중...</p>
                            ) : memberHistory.length === 0 ? (
                                <p className="py-8 text-center text-xs font-bold text-slate-300">표시할 기록이 없거나 권한 규칙이 아직 열려 있지 않습니다.</p>
                            ) : (
                                <div className="divide-y divide-slate-100">
                                    {memberHistory.map(item => (
                                        <div key={item.id} className="flex items-center justify-between gap-3 py-3">
                                            <div>
                                                <p className="text-sm font-black text-slate-700">DAY {item.day || item.currentDay || '-'}</p>
                                                <p className="text-xs font-bold text-slate-400">{formatAnyDate(item.date || item.createdAt || item.ts)}</p>
                                            </div>
                                            <span className="text-xs font-black text-slate-500">{item.score ? `${item.score}점` : ''}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div> : <div className="rounded-2xl bg-slate-50 p-4 text-xs font-bold text-slate-500">개인 읽기 기록은 원 소속 공동체 관리자만 조회할 수 있습니다.</div>}
                    </div>
                )}
            </SlideOverPanel>

            <SlideOverPanel
                open={showCompletedReaders}
                title="완독자 명단"
                subtitle={`1독 이상 완료한 교인 ${completedReaders.length}명`}
                onClose={() => setShowCompletedReaders(false)}
                widthClass="max-w-md"
                footer={(
                    <div className="flex justify-end">
                        <button
                            type="button"
                            onClick={() => setShowCompletedReaders(false)}
                            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-600"
                        >
                            닫기
                        </button>
                    </div>
                )}
            >
                {completedReaders.length === 0 ? (
                    <p className="py-12 text-center text-sm font-bold text-slate-300">아직 완독자가 없습니다.</p>
                ) : (
                    <div className="space-y-2">
                        {completedReaders.map((member, index) => (
                            <div
                                key={member.uid}
                                className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3"
                            >
                                <div className="min-w-0">
                                    <p className="text-sm font-black text-slate-800 truncate">{index + 1}. {member.name} {member.isExternalOrgMember && <span className="ml-1 rounded-full bg-violet-50 px-1.5 py-0.5 text-[9px] text-violet-700">개인·외부</span>}</p>
                                    <p className="mt-0.5 text-xs font-bold text-slate-400 truncate">
                                        {getMemberMembershipText(member)}
                                    </p>
                                </div>
                                <span className="shrink-0 rounded-full bg-emerald-100 px-3 py-1 text-sm font-black text-emerald-700">
                                    {(member.readCount || 1) - 1}독 완료
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </SlideOverPanel>

            <ConfirmDialog
                open={!!confirmAction}
                title={confirmAction?.title}
                message={confirmAction?.message}
                danger={confirmAction?.danger}
                confirmLabel={confirmAction?.confirmLabel || '확인'}
                confirmDisabled={confirmAction?.type === 'refundLegacyPurchase' && !confirmAction?.legacyWalletKind}
                onConfirm={handleConfirmAction}
                onCancel={() => setConfirmAction(null)}
            >
                {confirmAction?.type === 'refundLegacyPurchase' && (
                    <label className="block text-sm font-bold text-slate-700">
                        환불할 지갑
                        <select
                            value={confirmAction.legacyWalletKind || ''}
                            onChange={event => setConfirmAction(current => current ? {
                                ...current,
                                legacyWalletKind: event.target.value,
                            } : current)}
                            className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-700"
                        >
                            <option value="">지갑을 선택해주세요</option>
                            <option value="user">기존 교인 계정 지갑</option>
                            <option value="roster">이 공동체 명부 지갑</option>
                        </select>
                    </label>
                )}
            </ConfirmDialog>
            <ToastContainer toasts={toast.toasts} onClose={toast.removeToast} />

            {showTutorial && (
                <ChurchAdminTutorial
                    onClose={() => setShowTutorial(false)}
                    onComplete={() => setShowTutorial(false)}
                    onTabChange={setTab}
                />
            )}
        </div>
    );
};

export default ChurchAdminView;
