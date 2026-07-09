import React, { useState, useEffect } from 'react';
import { db, firebase } from '../utils/firebase';
import OrgEditor from './OrgEditor';
import ChurchAdminTutorial from './ChurchAdminTutorial';
import { sha256 } from '../utils/crypto';
import { writeMemberCredentials, fetchMemberCredentials } from '../utils/memberCredentials';
import { syncChurchDirectoryEntry } from '../utils/churchDirectory';
import { calculateSubgroupStats, computeAtRisk } from '../utils/statsUtils';
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
const getSubId = (s) => (typeof s === 'string' ? s : s.id);
const getSubName = (s) => (typeof s === 'string' ? s : s.name);
const genSubId = () => 'sub_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const SHOP_EMOJIS = ['☕', '🍞', '🍪', '🍎', '🎁', '📖', '✏️', '🧦', '🧴', '🌿', '🕯️', '⭐'];
const emptyShopItem = { emoji: '🎁', name: '', price: 10, description: '', active: true };
const genShopItemId = () => 'item_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

const ChurchAdminView = ({ currentUser, handleLogout, onBack }) => {
    const [members, setMembers] = useState([]);
    const [deletedMembers, setDeletedMembers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState('dashboard');
    const [showTutorial, setShowTutorial] = useState(false);
    const toast = useToast();

    // 교인 관리
    const [sortBy, setSortBy] = useState('name');
    const [editing, setEditing] = useState(null); // { uid, mode: 'pw' | 'subgroup' }
    const [revealedPasswords, setRevealedPasswords] = useState({}); // uid -> '__loading__' | '__error__' | 실제 비밀번호
    const [sgCommId, setSgCommId] = useState('');
    const [sgSubId, setSgSubId] = useState('');
    const [memberDepartmentFilter, setMemberDepartmentFilter] = useState('all');
    const [memberReadFilter, setMemberReadFilter] = useState('all');
    const [bulkCommId, setBulkCommId] = useState('');
    const [bulkSubId, setBulkSubId] = useState('');
    const [selectedMember, setSelectedMember] = useState(null);
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

    // 조직 관리
    const [orgComms, setOrgComms] = useState([]);
    const [savingOrg, setSavingOrg] = useState(false);

    // 달란트 상점
    const [talentShop, setTalentShop] = useState({ enabled: false, items: [] });
    const [shopItemDraft, setShopItemDraft] = useState(emptyShopItem);
    const [editingShopItemId, setEditingShopItemId] = useState(null);
    const [savingTalentShop, setSavingTalentShop] = useState(false);
    const [talentPurchases, setTalentPurchases] = useState([]);
    const [purchaseFilter, setPurchaseFilter] = useState('pending');

    // 교회 전용 로그인 링크
    const [linkCopied, setLinkCopied] = useState(false);

    useEffect(() => {
        if (!currentUser?.churchId) return;
        loadData();
    }, [currentUser?.churchId]);

    const loadData = async () => {
        setLoading(true);
        try {
            const [membersSnap, announcementDoc, churchDoc, kakaoDoc, platformDoc, talentShopDoc] = await Promise.all([
                db.collection('users').where('churchId', '==', currentUser.churchId).get(),
                db.collection('churches').doc(currentUser.churchId).collection('settings').doc('announcement').get(),
                db.collection('churches').doc(currentUser.churchId).get(),
                db.collection('churches').doc(currentUser.churchId).collection('settings').doc('kakao').get(),
                db.collection('settings').doc('platform').get(),
                db.collection('churches').doc(currentUser.churchId).collection('settings').doc('talentShop').get(),
            ]);
            const loadedMembers = membersSnap.docs.map(d => ({ uid: d.id, ...d.data() })).filter(m => m.role !== 'churchAdmin');
            const activeMembers = loadedMembers.filter(m => !m.isDeleted);
            setMembers(loadedMembers.filter(m => !m.isDeleted));
            setDeletedMembers(loadedMembers.filter(m => m.isDeleted));
            if (announcementDoc.exists) setAnnouncement(announcementDoc.data());
            if (churchDoc.exists) {
                const data = churchDoc.data();
                setChurchInfo(data);
                setNewChurchCode(data.churchCode || '');
                setOrgComms(data.departments || data.communities || []);
            }
            if (kakaoDoc.exists) setKakaoLink(kakaoDoc.data().url || '');
            if (platformDoc.exists) setPlatformKakaoUrl(platformDoc.data().kakaoUrl || '');
            setTalentShop(talentShopDoc.exists ? { enabled: false, items: [], ...talentShopDoc.data() } : { enabled: false, items: [] });
            try {
                const memberIds = new Set(activeMembers.map(m => m.uid));
                const purchaseSnap = await db.collection('talentPurchases')
                    .orderBy('createdAt', 'desc')
                    .limit(200)
                    .get();
                setTalentPurchases(purchaseSnap.docs
                    .map(d => ({ id: d.id, ...d.data() }))
                    .filter(p => memberIds.has(p.uid)));
            } catch (purchaseError) {
                console.error('달란트 구매 내역 로드 실패:', purchaseError);
                setTalentPurchases([]);
            }
        } catch (e) {
            console.error(e);
        }
        setLoading(false);
    };

    // 이관 완료된 회원은 본문서의 password가 null이므로, 필요할 때만 private 하위문서를 조회한다.
    const revealPassword = async (uid) => {
        setRevealedPasswords(prev => ({ ...prev, [uid]: '__loading__' }));
        try {
            const data = await fetchMemberCredentials(uid);
            setRevealedPasswords(prev => ({ ...prev, [uid]: data?.password || '알 수 없음' }));
        } catch (e) {
            setRevealedPasswords(prev => ({ ...prev, [uid]: '__error__' }));
        }
    };

    const deleteMember = async (member) => {
        setConfirmAction({
            type: 'deleteMember',
            member,
            title: `${member.name}님을 삭제 처리할까요?`,
            message: '계정은 보관되며 필요하면 다시 복원할 수 있습니다.',
            danger: true,
        });
    };

    const executeDeleteMember = async (member) => {
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

    const getMemberSubgroupLabel = (member) => {
        if (!member.subgroupId) return '미배정';
        if (member.subgroupName) return member.subgroupName;
        for (const comm of orgComms) {
            const found = (comm.subgroups || []).find(s => getSubId(s) === member.subgroupId);
            if (found) return getSubName(found);
        }
        return member.subgroupId;
    };

    const applySubgroupToMembers = async (targetMembers, commId, subId) => {
        const comm = orgComms.find(c => c.id === commId);
        const subEntry = (comm?.subgroups || []).find(s => getSubId(s) === subId);
        if (!comm || !subEntry) {
            toast.error('부서와 소그룹을 선택해주세요.');
            return;
        }
        const subgroupName = getSubName(subEntry);
        await Promise.all(targetMembers.map(member => db.collection('users').doc(member.uid).set({
            departmentId: comm.id,
            departmentName: comm.name,
            subgroupId: subId,
            subgroupName,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        }, { merge: true })));
        const ids = new Set(targetMembers.map(m => m.uid));
        setMembers(prev => prev.map(m => ids.has(m.uid)
            ? { ...m, departmentId: comm.id, departmentName: comm.name, subgroupId: subId, subgroupName }
            : m
        ));
        setSelectedMember(prev => prev && ids.has(prev.uid)
            ? { ...prev, departmentId: comm.id, departmentName: comm.name, subgroupId: subId, subgroupName }
            : prev
        );
        toast.success(`${targetMembers.length}명의 소그룹을 변경했습니다.`);
    };

    const resetPasswordsForMembers = async (targetMembers) => {
        const updates = targetMembers.map(member => ({ member, password: generatePassword() }));
        // 평문 암호는 private 하위문서에 먼저 기록하고, 본문서에는 null 마커만 남긴다
        // (같은 교회 교인 랭킹 조회를 열어주는 firestore.rules 조건 유지 — memberCredentials.js 참고)
        const resetOne = async ({ member, password }) => {
            try {
                await writeMemberCredentials(member.uid, { password });
                await db.collection('users').doc(member.uid).set({
                    password: null,
                    passwordResetRequired: true,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                }, { merge: true });
            } catch (privateWriteError) {
                console.error('private 자격증명 기록 실패, 기존 방식으로 대체:', privateWriteError);
                await db.collection('users').doc(member.uid).set({
                    password,
                    passwordResetRequired: true,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                }, { merge: true });
            }
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
        toast.success(`${targetMembers.length}명의 비밀번호를 초기화했습니다.`);
    };

    const openMemberDetail = async (member) => {
        setSelectedMember(member);
        setMemberHistory([]);
        setDetailLoading(true);
        setSgCommId(member.departmentId || orgComms[0]?.id || '');
        setSgSubId(member.subgroupId || '');
        try {
            const snap = await db.collection('users').doc(member.uid).collection('history')
                .orderBy('date', 'desc').limit(10).get();
            setMemberHistory(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (e) {
            setMemberHistory([]);
            toast.warning('읽기 기록을 불러오지 못했습니다. 권한 규칙이 아직 열려 있지 않을 수 있습니다.');
        } finally {
            setDetailLoading(false);
        }
    };

    const handleConfirmAction = async () => {
        const action = confirmAction;
        if (!action) return;
        setConfirmAction(null);
        try {
            if (action.type === 'deleteMember') await executeDeleteMember(action.member);
            if (action.type === 'restoreMember') await executeRestoreMember(action.member);
            if (action.type === 'bulkSubgroup') await applySubgroupToMembers(action.members, action.commId, action.subId);
            if (action.type === 'bulkPassword') await resetPasswordsForMembers(action.members);
            if (action.type === 'singlePassword') await resetPasswordsForMembers([action.member]);
            if (action.type === 'deleteShopItem') await executeDeleteShopItem(action.item);
            if (action.type === 'deliverPurchase') await updatePurchaseStatus(action.purchase, 'delivered');
            if (action.type === 'refundPurchase') await updatePurchaseStatus(action.purchase, 'cancelled');
            action.after?.();
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
        if (!newChurchCode || newChurchCode.length < 4) { alert('입장코드는 4자리 이상이어야 합니다.'); return; }
        setSavingCode(true);
        try {
            // [Phase 3] 회원가입 검증은 churchCodeHash(디렉토리 codeHash)만 사용하므로
            // 해시도 함께 갱신하고, 공개 디렉토리의 codeHash도 동기화한다.
            const churchCodeHash = await sha256(newChurchCode);
            await db.collection('churches').doc(currentUser.churchId).set(
                { churchCode: newChurchCode, churchCodeHash, updatedAt: firebase.firestore.FieldValue.serverTimestamp() },
                { merge: true }
            );
            await syncChurchDirectoryEntry({ id: currentUser.churchId, name: churchInfo?.name || currentUser.churchName, codeHash: churchCodeHash })
                .catch(err => console.error('디렉토리 동기화 실패:', err));
            alert('입장코드가 변경되었습니다!');
        } catch (e) {
            alert('변경 실패');
        }
        setSavingCode(false);
    };

    const saveOrg = async () => {
        const valid = orgComms
            .filter(c => c.name.trim())
            .map(c => ({
                id: c.id,
                name: c.name.trim(),
                subgroups: c.subgroups
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
            await db.collection('churches').doc(currentUser.churchId).collection('settings').doc('talentShop').set({
                enabled: nextShop.enabled === true,
                items: nextShop.items || [],
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
            setTalentShop({ enabled: nextShop.enabled === true, items: nextShop.items || [] });
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
        const nextItems = editingShopItemId
            ? (talentShop.items || []).map(existing => existing.id === editingShopItemId ? item : existing)
            : [...(talentShop.items || []), item];
        await saveTalentShop({ ...talentShop, items: nextItems });
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
        const nextItems = (talentShop.items || []).filter(existing => existing.id !== item.id);
        await saveTalentShop({ ...talentShop, items: nextItems });
        if (editingShopItemId === item.id) resetShopItemDraft();
    };

    const updatePurchaseStatus = async (purchase, mode) => {
        if (mode === 'delivered') {
            await db.collection('talentPurchases').doc(purchase.id).update({
                status: 'delivered',
                deliveredAt: firebase.firestore.FieldValue.serverTimestamp(),
                deliveredBy: currentUser.uid,
            });
            setTalentPurchases(prev => prev.map(p => p.id === purchase.id ? { ...p, status: 'delivered', deliveredAt: new Date(), deliveredBy: currentUser.uid } : p));
            toast.success('수령 완료로 처리했습니다.');
            return;
        }

        const batch = db.batch();
        const purchaseRef = db.collection('talentPurchases').doc(purchase.id);
        const userRef = db.collection('users').doc(purchase.uid);
        batch.update(purchaseRef, {
            status: 'cancelled',
            deliveredAt: firebase.firestore.FieldValue.serverTimestamp(),
            deliveredBy: currentUser.uid,
        });
        batch.update(userRef, {
            talent: firebase.firestore.FieldValue.increment(purchase.price || 0),
        });
        await batch.commit();
        setTalentPurchases(prev => prev.map(p => p.id === purchase.id ? { ...p, status: 'cancelled', deliveredAt: new Date(), deliveredBy: currentUser.uid } : p));
        setMembers(prev => prev.map(m => m.uid === purchase.uid ? { ...m, talent: (m.talent || 0) + (purchase.price || 0) } : m));
        toast.success('구매를 취소하고 달란트를 환불했습니다.');
    };

    const todayStr = new Date().toDateString();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toDateString();

    const getTotalProgressDay = (member) => ((member.readCount || 1) - 1) * 365 + (member.currentDay || 1);
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
                totalCount: 0,
                readCount: 0,
                avgDaySum: 0,
                subgroups: [],
            };
        }
        acc[key].totalCount += stat.totalCount || 0;
        acc[key].readCount += stat.readCount || 0;
        acc[key].avgDaySum += (stat.avgDay || 0) * (stat.totalCount || 0);
        acc[key].subgroups.push(stat);
        return acc;
    }, {});
    const departmentCards = Object.values(departmentStats).map(dept => ({
        ...dept,
        rate: dept.totalCount > 0 ? Math.round((dept.readCount / dept.totalCount) * 100) : 0,
        avgDay: dept.totalCount > 0 ? Math.round(dept.avgDaySum / dept.totalCount) : 0,
    }));

    const atRisk = computeAtRisk(members, todayStr);
    const streakTop = [...members]
        .filter(m => (m.streak || 0) > 0)
        .sort((a, b) => (b.streak || 0) - (a.streak || 0))
        .slice(0, 5);

    const sortedMembers = [...members].sort((a, b) => {
        if (sortBy === 'name') return (a.name || '').localeCompare(b.name || '', 'ko-KR');
        if (sortBy === 'day') {
            const aDay = ((a.readCount || 1) - 1) * 365 + (a.currentDay || 1);
            const bDay = ((b.readCount || 1) - 1) * 365 + (b.currentDay || 1);
            return bDay - aDay;
        }
        if (sortBy === 'score') return (b.score || 0) - (a.score || 0);
        return 0;
    });

    const filteredMembers = sortedMembers.filter(member => {
        const departmentMatch = memberDepartmentFilter === 'all' || member.departmentId === memberDepartmentFilter;
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
                    <p className="font-black text-slate-800">{m.name}</p>
                    <p className="text-xs text-slate-400">{m.birthdate || '-'}</p>
                </div>
            ),
            searchValue: m => `${m.name || ''} ${m.birthdate || ''}`,
        },
        {
            key: 'departmentName',
            header: '부서/소그룹',
            render: m => (
                <div>
                    <p className="font-bold text-slate-700">{m.departmentName || '-'}</p>
                    <p className="text-xs text-slate-400">{getMemberSubgroupLabel(m)}</p>
                </div>
            ),
            searchValue: m => `${m.departmentName || ''} ${getMemberSubgroupLabel(m)}`,
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
    const pendingPurchaseCount = talentPurchases.filter(p => p.status === 'pending').length;
    const filteredPurchases = talentPurchases.filter(purchase => (
        purchaseFilter === 'all' || purchase.status === purchaseFilter
    ));

    const TABS = [
        ['dashboard', '📊 대시보드'],
        ['members', '👥 교인 관리'],
        ['talentShop', `⭐ 달란트 상점${pendingPurchaseCount > 0 ? ` (${pendingPurchaseCount})` : ''}`],
        ['org', '📋 조직'],
        ['announcement', '📢 공지'],
        ['settings', '⚙️ 설정'],
    ];

    const sgComm = orgComms.find(c => c.id === sgCommId);

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
                            <p className="text-sm font-bold text-slate-800 truncate">{member.name}</p>
                            <p className="text-xs text-slate-400 truncate">{member.departmentName || '미배정'} · {member.subgroupName || member.subgroupId || '미배정'}</p>
                        </div>
                        <span className="shrink-0 text-xs font-black text-slate-500">{getMeta(member)}</span>
                    </div>
                ))}
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-slate-50">
            {/* 상단 헤더 */}
            <div className="bg-white border-b border-slate-200 px-4 py-4 flex items-center justify-between sticky top-0 z-10">
                <div>
                    <h1 className="font-extrabold text-slate-800">⛪ 교회 관리</h1>
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
                        대시보드
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
                ) : (
                    <>
                        {/* ── 대시보드 ── */}
                        {tab === 'dashboard' && (
                            <div className="space-y-6">
                                <div>
                                    <h2 className="font-black text-slate-800 text-lg">목양 대시보드</h2>
                                    <p className="text-xs text-slate-400 mt-1">
                                        오늘 읽기 비교는 현재 권한에서 접근 가능한 회원 문서 기준입니다. history 시간값은 앞으로 쌓이는 기록부터 적용됩니다.
                                    </p>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                    <StatCard label="전체 교인" value={`${dashboardStats.total}명`} subvalue={`${deletedMembers.length}명 삭제 보관`} icon="👥" accent />
                                    <StatCard
                                        label="오늘 진도"
                                        value={`${dashboardStats.readToday}명`}
                                        subvalue={`어제 최종 ${dashboardStats.readYesterday}명 · ${dashboardStats.readDelta >= 0 ? '+' : ''}${dashboardStats.readDelta}명`}
                                        icon="📖"
                                    />
                                    <StatCard label="최근 7일 읽기율" value={`${dashboardStats.recent7Rate}%`} subvalue="최근 7일 내 1회 이상 읽음" icon="🗓️" />
                                    <StatCard label="평균 진행 DAY" value={dashboardStats.avgDay || '-'} subvalue="독수 포함 총 진행일 기준" icon="🏁" />
                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-[1.35fr_0.65fr] gap-4">
                                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                                        <div className="flex items-center justify-between gap-3 mb-4">
                                            <h3 className="text-sm font-black text-slate-800">부서별 현황</h3>
                                            <span className="text-xs font-bold text-slate-400">{departmentCards.length}개 부서</span>
                                        </div>
                                        {departmentCards.length === 0 ? (
                                            <p className="py-10 text-center text-xs font-bold text-slate-300">부서 데이터가 없습니다.</p>
                                        ) : (
                                            <div className="space-y-4">
                                                {departmentCards.map(dept => (
                                                    <div key={dept.departmentId || dept.departmentName} className="rounded-2xl border border-slate-100 p-4">
                                                        <div className="flex items-start justify-between gap-3 mb-3">
                                                            <div>
                                                                <p className="font-black text-slate-800">{dept.departmentName}</p>
                                                                <p className="text-xs text-slate-400">{dept.readCount}/{dept.totalCount}명 읽음 · 평균 DAY {dept.avgDay || '-'}</p>
                                                            </div>
                                                            <DonutStat value={dept.rate} size={58} stroke={7} center={`${dept.rate}%`} />
                                                        </div>
                                                        <ProgressBar value={dept.rate} label="오늘 읽기율" tone="indigo" />
                                                        {dept.subgroups.length > 0 && (
                                                            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                                {dept.subgroups.map(sub => (
                                                                    <div key={`${sub.departmentId}_${sub.subgroupId}`} className="rounded-xl bg-slate-50 px-3 py-2">
                                                                        <div className="flex justify-between gap-2">
                                                                            <span className="text-xs font-bold text-slate-600 truncate">{sub.subgroupName}</span>
                                                                            <span className="text-xs font-black text-slate-500">{sub.rate}%</span>
                                                                        </div>
                                                                        <ProgressBar value={sub.rate} showValue={false} className="mt-1.5" />
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                                        <h3 className="text-sm font-black text-slate-800 mb-4">이번 주 스트릭 리더 Top 5</h3>
                                        {streakTop.length === 0 ? (
                                            <p className="py-10 text-center text-xs font-bold text-slate-300">아직 스트릭 기록이 없습니다.</p>
                                        ) : (
                                            <div className="space-y-2">
                                                {streakTop.map((member, index) => (
                                                    <div key={member.uid} className="flex items-center justify-between gap-3 rounded-xl bg-orange-50 px-3 py-2">
                                                        <div className="min-w-0">
                                                            <p className="text-sm font-black text-slate-800 truncate">{index + 1}. {member.name}</p>
                                                            <p className="text-xs text-slate-400 truncate">{member.departmentName || '미배정'} · {member.subgroupName || member.subgroupId || '미배정'}</p>
                                                        </div>
                                                        <span className="shrink-0 text-sm font-black text-orange-600">{member.streak}일</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                                    {renderRiskList(
                                        '7일 이상 미독',
                                        atRisk.noRead7Days,
                                        '7일 이상 미독 교인이 없습니다.',
                                        member => {
                                            const days = daysSinceRead(member.lastReadDate);
                                            return days === null ? '기록 없음' : `${days}일`;
                                        }
                                    )}
                                    {renderRiskList(
                                        '진행 하위 10%',
                                        atRisk.bottomProgress,
                                        '진행 하위 대상이 없습니다.',
                                        member => `DAY ${getTotalProgressDay(member)}`
                                    )}
                                    {renderRiskList(
                                        '최근 7일 신규 가입',
                                        atRisk.recentNewMembers,
                                        '최근 신규 가입자가 없습니다.',
                                        member => formatReadDate(member.createdAt?.toDate ? member.createdAt.toDate().toDateString() : member.createdAt)
                                    )}
                                </div>
                            </div>
                        )}

                        {/* ── 교인 관리 ── */}
                        {tab === 'members' && (
                            <div className="space-y-5">
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                                    <div>
                                        <h2 className="font-black text-slate-800 flex items-center gap-2 text-lg">
                                            👥 교인 관리
                                            <span className="text-sm font-bold text-slate-400">전체 {members.length}명</span>
                                        </h2>
                                        <p className="text-xs text-slate-400 mt-1">행을 누르면 최근 기록과 관리 작업을 한 번에 볼 수 있습니다.</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => downloadCSV(filteredMembers)}
                                        className="self-start sm:self-auto rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-black text-white hover:bg-emerald-700"
                                    >
                                        CSV 내보내기
                                    </button>
                                </div>

                                {members.length === 0 ? (
                                    <div className="text-center py-20 text-slate-300">
                                        <div className="text-4xl mb-2">👥</div>
                                        <p>아직 가입한 교인이 없습니다</p>
                                    </div>
                                ) : (
                                    <div id="admin-tut-member-list" className="space-y-3">
                                        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                                            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                                                <label className="text-xs font-black text-slate-500">
                                                    부서
                                                    <select
                                                        value={memberDepartmentFilter}
                                                        onChange={e => setMemberDepartmentFilter(e.target.value)}
                                                        className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-bold text-slate-700"
                                                    >
                                                        <option value="all">전체 부서</option>
                                                        {orgComms.map(comm => <option key={comm.id} value={comm.id}>{comm.name}</option>)}
                                                    </select>
                                                </label>
                                                <label className="text-xs font-black text-slate-500">
                                                    읽기 상태
                                                    <select
                                                        value={memberReadFilter}
                                                        onChange={e => setMemberReadFilter(e.target.value)}
                                                        className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-bold text-slate-700"
                                                    >
                                                        <option value="all">전체 상태</option>
                                                        <option value="today">오늘 읽음</option>
                                                        <option value="unread">오늘 미독</option>
                                                        <option value="risk7">7일 이상 미독/기록 없음</option>
                                                    </select>
                                                </label>
                                                <div className="rounded-xl bg-slate-50 px-4 py-3">
                                                    <p className="text-xs font-black text-slate-400">현재 표시</p>
                                                    <p className="mt-1 text-xl font-black text-slate-800">{filteredMembers.length}명</p>
                                                </div>
                                            </div>
                                        </div>

                                        <AdminDataTable
                                            columns={memberColumns}
                                            rows={filteredMembers}
                                            getRowId={row => row.uid}
                                            searchPlaceholder="이름, 생년월일, 부서, 소그룹 검색"
                                            selectable
                                            initialSortKey="name"
                                            emptyMessage="조건에 맞는 교인이 없습니다."
                                            onRowClick={openMemberDetail}
                                            renderSelectionActions={({ selectedRows, clearSelection }) => {
                                                const bulkComm = orgComms.find(c => c.id === bulkCommId);
                                                const canChangeSubgroup = Boolean(bulkCommId && bulkSubId);
                                                return (
                                                    <>
                                                        <select
                                                            value={bulkCommId}
                                                            onChange={e => { setBulkCommId(e.target.value); setBulkSubId(''); }}
                                                            className="rounded-lg border border-indigo-100 bg-white px-3 py-2 text-xs font-bold text-indigo-800"
                                                        >
                                                            <option value="">부서 선택</option>
                                                            {orgComms.map(comm => <option key={comm.id} value={comm.id}>{comm.name}</option>)}
                                                        </select>
                                                        <select
                                                            value={bulkSubId}
                                                            onChange={e => setBulkSubId(e.target.value)}
                                                            disabled={!bulkCommId}
                                                            className="rounded-lg border border-indigo-100 bg-white px-3 py-2 text-xs font-bold text-indigo-800 disabled:opacity-50"
                                                        >
                                                            <option value="">소그룹 선택</option>
                                                            {(bulkComm?.subgroups || []).map((sub, index) => {
                                                                const subId = getSubId(sub);
                                                                return <option key={subId || index} value={subId}>{getSubName(sub)}</option>;
                                                            })}
                                                        </select>
                                                        <button
                                                            type="button"
                                                            disabled={!canChangeSubgroup}
                                                            onClick={() => setConfirmAction({
                                                                type: 'bulkSubgroup',
                                                                members: selectedRows,
                                                                commId: bulkCommId,
                                                                subId: bulkSubId,
                                                                title: `${selectedRows.length}명의 소그룹을 변경할까요?`,
                                                                message: '선택한 교인의 부서/소그룹 배정을 한 번에 변경합니다.',
                                                                after: clearSelection,
                                                            })}
                                                            className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-black text-white disabled:opacity-40"
                                                        >
                                                            일괄 배정
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setConfirmAction({
                                                                type: 'bulkPassword',
                                                                members: selectedRows,
                                                                title: `${selectedRows.length}명의 비밀번호를 초기화할까요?`,
                                                                message: '각 교인에게 6자리 임시 비밀번호가 새로 발급됩니다. 새 비밀번호는 교인 상세의 "비밀번호 확인"에서 조회할 수 있습니다.',
                                                                danger: true,
                                                                confirmLabel: '초기화',
                                                                after: clearSelection,
                                                            })}
                                                            className="rounded-lg bg-red-600 px-3 py-2 text-xs font-black text-white"
                                                        >
                                                            비밀번호 초기화
                                                        </button>
                                                    </>
                                                );
                                            }}
                                        />
                                    </div>
                                )}
                                {deletedMembers.length > 0 && (
                                    <div className="mt-6 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                                        <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                                            <h3 className="text-sm font-bold text-slate-600">삭제 처리된 교인</h3>
                                            <span className="text-xs text-slate-400">{deletedMembers.length}명</span>
                                        </div>
                                        <div className="divide-y divide-slate-100">
                                            {deletedMembers
                                                .slice()
                                                .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko-KR'))
                                                .map(member => (
                                                    <div key={member.uid} className="px-4 py-3 flex items-center justify-between gap-3">
                                                        <div>
                                                            <div className="font-bold text-sm text-slate-700">{member.name}</div>
                                                            <div className="text-xs text-slate-400">{member.departmentName || '-'} · {member.subgroupName || member.subgroupId || '미배정'}</div>
                                                        </div>
                                                        <button onClick={() => restoreMember(member)}
                                                            className="shrink-0 text-xs bg-emerald-50 text-emerald-600 px-3 py-1.5 rounded-lg font-bold hover:bg-emerald-100">
                                                            복원
                                                        </button>
                                                    </div>
                                                ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ── 달란트 상점 ── */}
                        {tab === 'talentShop' && (
                            <div className="space-y-5">
                                <div className="rounded-2xl border border-violet-100 bg-white p-5 shadow-sm">
                                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                                        <div>
                                            <h2 className="text-lg font-black text-slate-800">⭐ 달란트 상점</h2>
                                            <p className="mt-1 text-xs font-bold text-slate-400">
                                                끄면 교인에게 상점이 전혀 보이지 않아요. 언제든 다시 켤 수 있습니다.
                                            </p>
                                        </div>
                                        <label className="inline-flex cursor-pointer items-center gap-3">
                                            <span className="text-sm font-black text-slate-600">{talentShop.enabled ? '사용 중' : '꺼짐'}</span>
                                            <input
                                                type="checkbox"
                                                checked={talentShop.enabled === true}
                                                onChange={e => toggleTalentShopEnabled(e.target.checked)}
                                                disabled={savingTalentShop}
                                                className="h-5 w-5 rounded border-slate-300"
                                            />
                                        </label>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-[0.85fr_1.15fr] gap-4">
                                    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                                        <h3 className="text-sm font-black text-slate-800 mb-4">{editingShopItemId ? '상품 수정' : '상품 추가'}</h3>
                                        <div className="space-y-3">
                                            <div>
                                                <p className="mb-2 text-xs font-black text-slate-500">이모지</p>
                                                <div className="flex flex-wrap gap-2">
                                                    {SHOP_EMOJIS.map(emoji => (
                                                        <button
                                                            key={emoji}
                                                            type="button"
                                                            onClick={() => setShopItemDraft(prev => ({ ...prev, emoji }))}
                                                            className={`h-10 w-10 rounded-xl border text-lg ${shopItemDraft.emoji === emoji ? 'border-violet-400 bg-violet-50' : 'border-slate-100 bg-slate-50'}`}
                                                        >
                                                            {emoji}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                            <input
                                                type="text"
                                                value={shopItemDraft.name}
                                                onChange={e => setShopItemDraft(prev => ({ ...prev, name: e.target.value }))}
                                                placeholder="상품 이름"
                                                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-bold"
                                            />
                                            <input
                                                type="number"
                                                min="1"
                                                value={shopItemDraft.price}
                                                onChange={e => setShopItemDraft(prev => ({ ...prev, price: e.target.value }))}
                                                placeholder="가격"
                                                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-bold"
                                            />
                                            <textarea
                                                value={shopItemDraft.description}
                                                onChange={e => setShopItemDraft(prev => ({ ...prev, description: e.target.value }))}
                                                placeholder="설명"
                                                rows={3}
                                                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-bold resize-none"
                                            />
                                            <label className="flex items-center gap-2 text-sm font-bold text-slate-600">
                                                <input
                                                    type="checkbox"
                                                    checked={shopItemDraft.active !== false}
                                                    onChange={e => setShopItemDraft(prev => ({ ...prev, active: e.target.checked }))}
                                                />
                                                판매중
                                            </label>
                                            <div className="flex gap-2">
                                                <button
                                                    type="button"
                                                    onClick={submitShopItem}
                                                    disabled={savingTalentShop}
                                                    className="flex-1 rounded-xl bg-violet-700 px-4 py-3 text-sm font-black text-white disabled:opacity-50"
                                                >
                                                    {editingShopItemId ? '수정 저장' : '상품 추가'}
                                                </button>
                                                {editingShopItemId && (
                                                    <button
                                                        type="button"
                                                        onClick={resetShopItemDraft}
                                                        className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-500"
                                                    >
                                                        취소
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                                        <div className="mb-4 flex items-center justify-between">
                                            <h3 className="text-sm font-black text-slate-800">상품 목록</h3>
                                            <span className="text-xs font-bold text-slate-400">{(talentShop.items || []).length}개</span>
                                        </div>
                                        {(talentShop.items || []).length === 0 ? (
                                            <p className="py-10 text-center text-xs font-bold text-slate-300">아직 상품이 없습니다.</p>
                                        ) : (
                                            <div className="space-y-2">
                                                {(talentShop.items || []).map(item => (
                                                    <div key={item.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 p-3">
                                                        <div className="flex min-w-0 items-center gap-3">
                                                            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-2xl">{item.emoji || '🎁'}</span>
                                                            <div className="min-w-0">
                                                                <p className="truncate text-sm font-black text-slate-800">{item.name}</p>
                                                                <p className="truncate text-xs font-bold text-slate-400">⭐ {item.price} · {item.active === false ? '판매중지' : '판매중'}</p>
                                                            </div>
                                                        </div>
                                                        <div className="flex shrink-0 gap-2">
                                                            <button type="button" onClick={() => editShopItem(item)} className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-black text-slate-600">수정</button>
                                                            <button type="button" onClick={() => deleteShopItem(item)} className="rounded-lg bg-red-50 px-3 py-2 text-xs font-black text-red-500">삭제</button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                                    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                        <div>
                                            <h3 className="text-sm font-black text-slate-800">구매 내역</h3>
                                            <p className="mt-1 text-xs font-bold text-slate-400">최근 200건을 불러온 뒤 현재 교회 교인만 표시합니다.</p>
                                        </div>
                                        <select
                                            value={purchaseFilter}
                                            onChange={e => setPurchaseFilter(e.target.value)}
                                            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700"
                                        >
                                            <option value="pending">수령 대기</option>
                                            <option value="delivered">수령 완료</option>
                                            <option value="cancelled">취소</option>
                                            <option value="all">전체</option>
                                        </select>
                                    </div>
                                    {filteredPurchases.length === 0 ? (
                                        <p className="py-10 text-center text-xs font-bold text-slate-300">표시할 구매 내역이 없습니다.</p>
                                    ) : (
                                        <div className="overflow-x-auto">
                                            <table className="min-w-full divide-y divide-slate-100">
                                                <thead className="bg-slate-50">
                                                    <tr>
                                                        <th className="px-4 py-3 text-left text-xs font-black text-slate-400">교인</th>
                                                        <th className="px-4 py-3 text-left text-xs font-black text-slate-400">상품</th>
                                                        <th className="px-4 py-3 text-left text-xs font-black text-slate-400">가격</th>
                                                        <th className="px-4 py-3 text-left text-xs font-black text-slate-400">구매일</th>
                                                        <th className="px-4 py-3 text-left text-xs font-black text-slate-400">잔여</th>
                                                        <th className="px-4 py-3 text-right text-xs font-black text-slate-400">처리</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100">
                                                    {filteredPurchases.map(purchase => {
                                                        const buyer = memberById[purchase.uid];
                                                        return (
                                                            <tr key={purchase.id}>
                                                                <td className="px-4 py-3 text-sm font-bold text-slate-700">{purchase.memberName || buyer?.name || '-'}</td>
                                                                <td className="px-4 py-3 text-sm text-slate-600">{purchase.itemName}</td>
                                                                <td className="px-4 py-3 text-sm font-black text-amber-600">⭐ {purchase.price || 0}</td>
                                                                <td className="px-4 py-3 text-xs font-bold text-slate-400">{formatAnyDate(purchase.createdAt)}</td>
                                                                <td className="px-4 py-3 text-sm font-black text-slate-600">{buyer ? `⭐ ${buyer.talent || 0}` : '-'}</td>
                                                                <td className="px-4 py-3">
                                                                    {purchase.status === 'pending' ? (
                                                                        <div className="flex justify-end gap-2">
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => setConfirmAction({
                                                                                    type: 'deliverPurchase',
                                                                                    purchase,
                                                                                    title: `${purchase.itemName} 수령 완료 처리할까요?`,
                                                                                    message: `${purchase.memberName || buyer?.name || '교인'}님에게 상품을 전달한 뒤 눌러주세요.`,
                                                                                    confirmLabel: '수령 완료',
                                                                                })}
                                                                                className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-600"
                                                                            >
                                                                                수령 완료
                                                                            </button>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => setConfirmAction({
                                                                                    type: 'refundPurchase',
                                                                                    purchase,
                                                                                    title: `${purchase.itemName} 구매를 취소·환불할까요?`,
                                                                                    message: `대기 건을 취소하고 ${purchase.price || 0}달란트를 교인 잔액에 돌려줍니다.`,
                                                                                    danger: true,
                                                                                    confirmLabel: '취소·환불',
                                                                                })}
                                                                                className="rounded-lg bg-red-50 px-3 py-2 text-xs font-black text-red-500"
                                                                            >
                                                                                취소·환불
                                                                            </button>
                                                                        </div>
                                                                    ) : (
                                                                        <p className="text-right text-xs font-black text-slate-400">{purchase.status === 'delivered' ? '수령 완료' : '취소됨'}</p>
                                                                    )}
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* ── 조직 관리 ── */}
                        {tab === 'org' && (
                            <div id="admin-tut-org-section" className="space-y-4 max-w-2xl">
                                <div className="bg-indigo-50 rounded-2xl p-4 border border-indigo-100">
                                    <p className="text-sm font-bold text-indigo-700 mb-1">📋 교회 조직 관리</p>
                                    <p className="text-xs text-slate-500">부서와 소그룹을 자유롭게 구성할 수 있습니다.</p>
                                    <p className="text-xs text-indigo-500 mt-1">💡 조직은 관리자 메뉴에서도 변경이 가능합니다.</p>
                                </div>
                                <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
                                    <OrgEditor departments={orgComms} onChange={setOrgComms} />
                                    <div className="mt-4 pt-4 border-t border-slate-100">
                                        <button onClick={saveOrg} disabled={savingOrg}
                                            className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl text-sm disabled:opacity-50 hover:bg-indigo-700 transition-colors">
                                            {savingOrg ? '저장 중...' : '✅ 조직 저장하기'}
                                        </button>
                                        {orgComms.length > 0 && (
                                            <p className="text-[10px] text-slate-400 text-center mt-2">
                                                ⚠️ 부서/소그룹명 변경 시 기존 교인의 배정 표기에 영향이 있을 수 있습니다.
                                            </p>
                                        )}
                                    </div>
                                </div>
                                {orgComms.filter(c => c.name.trim()).length > 0 && (
                                    <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
                                        <p className="text-xs font-bold text-slate-500 mb-3">현재 조직 미리보기</p>
                                        <div className="space-y-2">
                                            {orgComms.filter(c => c.name.trim()).map(comm => (
                                                <div key={comm.id} className="flex items-start gap-2">
                                                    <span className="text-sm shrink-0">🏛️</span>
                                                    <div>
                                                        <span className="font-bold text-slate-700 text-sm">{comm.name}</span>
                                                        <div className="flex flex-wrap gap-1 mt-1">
                                                            {comm.subgroups.filter(s => getSubName(s).trim()).map((sub, i) => (
                                                                <span key={i} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{getSubName(sub)}</span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ── 공지사항 ── */}
                        {tab === 'announcement' && (
                            <div id="admin-tut-announcement-section" className="space-y-4 max-w-2xl">
                                <div className="bg-white rounded-2xl p-4 border border-slate-100">
                                    <label className="flex items-center gap-2 mb-4 cursor-pointer">
                                        <input type="checkbox" checked={announcement.enabled}
                                            onChange={e => setAnnouncement(prev => ({ ...prev, enabled: e.target.checked }))}
                                            className="w-4 h-4 rounded" />
                                        <span className="font-bold text-slate-700">공지 표시 활성화</span>
                                    </label>
                                    <textarea value={announcement.text}
                                        onChange={e => setAnnouncement(prev => ({ ...prev, text: e.target.value }))}
                                        placeholder="공지사항 내용을 입력하세요..."
                                        rows={4}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-400" />
                                    <div className="mt-3">
                                        <div className="flex justify-between items-center mb-2">
                                            <p className="text-xs text-slate-400 font-bold">링크 (선택)</p>
                                            <button type="button"
                                                onClick={() => setAnnouncement(prev => ({ ...prev, links: [...(prev.links || []), { url: '', text: '' }] }))}
                                                className="text-xs bg-blue-50 text-blue-600 px-2.5 py-1 rounded-lg font-bold hover:bg-blue-100">
                                                + 링크 추가
                                            </button>
                                        </div>
                                        {(announcement.links || []).map((link, i) => (
                                            <div key={i} className="flex gap-2 mb-2 items-center">
                                                <input type="text" value={link.text}
                                                    onChange={e => {
                                                        const links = [...(announcement.links || [])];
                                                        links[i] = { ...links[i], text: e.target.value };
                                                        setAnnouncement(prev => ({ ...prev, links }));
                                                    }}
                                                    placeholder="버튼 글자"
                                                    className="flex-1 bg-slate-50 border border-slate-200 rounded-lg p-2 text-sm" />
                                                <input type="url" value={link.url}
                                                    onChange={e => {
                                                        const links = [...(announcement.links || [])];
                                                        links[i] = { ...links[i], url: e.target.value };
                                                        setAnnouncement(prev => ({ ...prev, links }));
                                                    }}
                                                    placeholder="https://..."
                                                    className="flex-1 bg-slate-50 border border-slate-200 rounded-lg p-2 text-sm" />
                                                <button type="button"
                                                    onClick={() => setAnnouncement(prev => ({ ...prev, links: prev.links.filter((_, j) => j !== i) }))}
                                                    className="text-slate-300 hover:text-red-400 font-bold text-lg shrink-0">✕</button>
                                            </div>
                                        ))}
                                        {(announcement.links || []).length === 0 && (
                                            <p className="text-xs text-slate-300 text-center py-2">링크 버튼이 없습니다.</p>
                                        )}
                                    </div>
                                    <button onClick={saveAnnouncement} disabled={saving}
                                        className="w-full mt-3 bg-blue-600 text-white font-bold py-2.5 rounded-xl text-sm disabled:opacity-50 hover:bg-blue-700">
                                        {saving ? '저장 중...' : '공지 저장'}
                                    </button>
                                </div>

                                <div className="bg-white rounded-2xl p-4 border border-slate-100">
                                    <p className="font-bold text-slate-700 mb-1 flex items-center gap-2">
                                        💬 카카오톡 채널
                                    </p>
                                    <p className="text-xs text-slate-400 mb-3">
                                        카카오톡 채널 관리자 센터에서 채팅 URL을 복사해 붙여넣으세요.<br />
                                        설정하면 대시보드에 카카오톡 채널 버튼이 표시됩니다.
                                    </p>
                                    <input type="url" value={kakaoLink}
                                        onChange={e => setKakaoLink(e.target.value)}
                                        placeholder="https://pf.kakao.com/_xxxx/chat"
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400" />
                                    <button onClick={saveKakaoLink} disabled={savingKakao}
                                        className="w-full mt-3 bg-[#FEE500] text-[#3c1e1e] font-bold py-2.5 rounded-xl text-sm disabled:opacity-50 hover:bg-[#FDD835]">
                                        {savingKakao ? '저장 중...' : '💬 카카오 링크 저장'}
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* ── 설정 ── */}
                        {tab === 'settings' && (
                            <div id="admin-tut-settings-section" className="space-y-4 max-w-2xl">
                                <div className="bg-white rounded-2xl p-4 border border-slate-100">
                                    <p className="font-bold text-slate-700 mb-1">🔗 우리 교회 로그인 링크</p>
                                    <p className="text-xs text-slate-400 mb-3">이 링크로 접속하면 교인이 교회를 직접 검색하지 않아도 자동으로 선택됩니다. 성도들에게 공유해주세요.</p>
                                    <div className="flex gap-2">
                                        <input type="text" readOnly value={`${window.location.origin}${window.location.pathname}?church=${currentUser.churchId}`}
                                            onFocus={e => e.target.select()}
                                            className="flex-1 bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm text-slate-600 font-mono truncate" />
                                        <button
                                            onClick={() => {
                                                const link = `${window.location.origin}${window.location.pathname}?church=${currentUser.churchId}`;
                                                navigator.clipboard.writeText(link).then(() => {
                                                    setLinkCopied(true);
                                                    setTimeout(() => setLinkCopied(false), 2000);
                                                }).catch(() => alert('복사에 실패했습니다. 직접 선택해 복사해주세요.'));
                                            }}
                                            className="bg-indigo-600 text-white font-bold px-4 rounded-xl text-sm hover:bg-indigo-700 whitespace-nowrap">
                                            {linkCopied ? '복사됨!' : '복사'}
                                        </button>
                                    </div>
                                </div>
                                <div className="bg-white rounded-2xl p-4 border border-slate-100">
                                    <p className="font-bold text-slate-700 mb-1">교회 입장코드 변경</p>
                                    <p className="text-xs text-slate-400 mb-3">교인들이 가입할 때 사용하는 코드입니다.</p>
                                    <div className="flex gap-2">
                                        <input type="text" value={newChurchCode} onChange={e => setNewChurchCode(e.target.value)}
                                            placeholder="새 입장코드 (4자리 이상)"
                                            className="flex-1 bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm" />
                                        <button onClick={saveChurchCode} disabled={savingCode}
                                            className="bg-indigo-600 text-white font-bold px-4 rounded-xl text-sm disabled:opacity-50 hover:bg-indigo-700">
                                            {savingCode ? '...' : '변경'}
                                        </button>
                                    </div>
                                </div>
                                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 text-xs text-slate-400">
                                    <p className="font-bold text-slate-600 mb-1">교회 정보</p>
                                    <p>교회명: {churchInfo?.name}</p>
                                    <p>관리자: {currentUser.name}</p>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>

            <SlideOverPanel
                open={!!selectedMember}
                title={selectedMember?.name}
                subtitle={selectedMember ? `${selectedMember.departmentName || '미배정'} · ${getMemberSubgroupLabel(selectedMember)}` : ''}
                onClose={() => setSelectedMember(null)}
                footer={selectedMember && (
                    <div className="flex flex-wrap justify-end gap-2">
                        <button
                            type="button"
                            onClick={() => setSelectedMember(null)}
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
                            삭제 처리
                        </button>
                    </div>
                )}
            >
                {selectedMember && (
                    <div className="space-y-5">
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
                            <p className="mb-3 text-sm font-black text-slate-800">소그룹 배정</p>
                            {orgComms.length === 0 ? (
                                <p className="text-xs font-bold text-slate-400">먼저 조직 탭에서 부서/소그룹을 만들어주세요.</p>
                            ) : (
                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
                                    <select
                                        value={sgCommId}
                                        onChange={e => { setSgCommId(e.target.value); setSgSubId(''); }}
                                        className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-bold text-slate-700"
                                    >
                                        <option value="">부서 선택</option>
                                        {orgComms.map(comm => <option key={comm.id} value={comm.id}>{comm.name}</option>)}
                                    </select>
                                    <select
                                        value={sgSubId}
                                        onChange={e => setSgSubId(e.target.value)}
                                        disabled={!sgCommId}
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
                                        onClick={() => applySubgroupToMembers([selectedMember], sgCommId, sgSubId)}
                                        className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-black text-white"
                                    >
                                        저장
                                    </button>
                                </div>
                            )}
                        </div>

                        <div className="rounded-2xl border border-slate-100 p-4">
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
                        </div>
                    </div>
                )}
            </SlideOverPanel>

            <ConfirmDialog
                open={!!confirmAction}
                title={confirmAction?.title}
                message={confirmAction?.message}
                danger={confirmAction?.danger}
                confirmLabel={confirmAction?.confirmLabel || '확인'}
                onConfirm={handleConfirmAction}
                onCancel={() => setConfirmAction(null)}
            />
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
