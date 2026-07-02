// 메모 키 파싱: "3_42" → {round:3, day:42} / 구형 "42" → {round:1, day:42}
const parseMemoKeyForExport = (key) => {
    const parts = String(key).split('_');
    if (parts.length === 2) return { round: Number(parts[0]), day: Number(parts[1]) };
    return { round: 1, day: Number(key) };
};

export const generateMemosHTML = (userName, userMemos, userStats = {}) => {
    const entries = Object.entries(userMemos)
        .map(([key, memo]) => ({ key, memo, ...parseMemoKeyForExport(key) }))
        .sort((a, b) => a.round - b.round || a.day - b.day);

    const memoCount = entries.length;

    // 묵상 항목들 HTML 생성
    let memosHTML = '';
    entries.forEach(({ key, memo, round, day }) => {
        const dateStr = memo.date ? new Date(memo.date).toLocaleDateString('ko-KR') : '';
        const memoTexts = Array.isArray(memo.texts) ? memo.texts : [memo.text || ''];
        const label = round > 1 ? `${round}독 DAY ${day + 1}` : `DAY ${day + 1}`;

        memosHTML += `
                    <div style="background: white; border-radius: 16px; padding: 24px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 2px solid #e2e8f0;">
                            <span style="background: linear-gradient(135deg, #4f46e5, #7c3aed); color: white; padding: 8px 20px; border-radius: 25px; font-weight: bold; font-size: 18px;">${label}</span>
                            <span style="color: #64748b; font-size: 16px;">${dateStr}</span>
                        </div>
                        <div style="color: #475569; font-size: 17px; font-weight: 600; margin-bottom: 16px;">${memo.title || ''}</div>
                        ${memoTexts.map((text, idx) => `
                            <div style="color: #1e293b; font-size: 18px; line-height: 1.9; white-space: pre-wrap; ${memoTexts.length > 1 ? 'background: #f8fafc; padding: 16px; border-radius: 12px; margin-bottom: 12px;' : ''}">${text}</div>
                        `).join('')}
                    </div>
                `;
    });

    const htmlContent = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${userName}의 묵상 기록</title>
<style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { 
        font-family: -apple-system, BlinkMacSystemFont, "Malgun Gothic", "맑은 고딕", sans-serif;
        background: linear-gradient(180deg, #f0f4ff 0%, #fdf4ff 100%);
        min-height: 100vh;
        padding: 20px;
        -webkit-text-size-adjust: 100%;
    }
    .container { max-width: 600px; margin: 0 auto; }
    @media print {
        body { background: white; padding: 0; }
        .no-print { display: none; }
    }
</style>
</head>
<body>
<div class="container">
    <!-- 표지 -->
    <div style="background: linear-gradient(135deg, #4f46e5, #7c3aed); border-radius: 24px; padding: 50px 30px; text-align: center; color: white; margin-bottom: 30px;">
        <div style="font-size: 60px; margin-bottom: 20px;">📖</div>
        <div style="font-size: 32px; font-weight: bold; margin-bottom: 10px;">${userName}</div>
        <div style="font-size: 22px; opacity: 0.9;">2025 묵상 기록</div>
        <div style="font-size: 16px; opacity: 0.7; margin-top: 10px;">성경통독 365</div>
    </div>
    
    <!-- 통계 -->
    <div style="background: white; border-radius: 20px; padding: 30px; margin-bottom: 30px; box-shadow: 0 2px 12px rgba(0,0,0,0.08);">
        <h2 style="text-align: center; font-size: 24px; color: #1e293b; margin-bottom: 25px;">📊 나의 기록</h2>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
            <div style="background: #f0f4ff; padding: 25px; border-radius: 16px; text-align: center;">
                <div style="font-size: 36px; font-weight: bold; color: #4f46e5;">${memoCount}</div>
                <div style="color: #64748b; font-size: 16px; margin-top: 5px;">작성한 묵상</div>
            </div>
            <div style="background: #f0fdf4; padding: 25px; border-radius: 16px; text-align: center;">
                <div style="font-size: 36px; font-weight: bold; color: #059669;">${userStats.currentDay || 1}</div>
                <div style="color: #64748b; font-size: 16px; margin-top: 5px;">현재 Day</div>
            </div>
            <div style="background: #fef2f2; padding: 25px; border-radius: 16px; text-align: center;">
                <div style="font-size: 36px; font-weight: bold; color: #dc2626;">${userStats.score || 0}</div>
                <div style="color: #64748b; font-size: 16px; margin-top: 5px;">총 점수</div>
            </div>
            <div style="background: #fffbeb; padding: 25px; border-radius: 16px; text-align: center;">
                <div style="font-size: 36px; font-weight: bold; color: #f59e0b;">${userStats.streak || 0}</div>
                <div style="color: #64748b; font-size: 16px; margin-top: 5px;">연속 일수</div>
            </div>
        </div>
        <div style="text-align: center; color: #94a3b8; font-size: 14px; margin-top: 20px;">
            생성일: ${new Date().toLocaleDateString('ko-KR')}
        </div>
    </div>
    
    <!-- 묵상 목록 -->
    ${sortedMemos.length > 0 ? `
        <h2 style="font-size: 24px; color: #1e293b; margin-bottom: 20px; padding-left: 10px;">✍️ 나의 묵상</h2>
        ${memosHTML}
    ` : `
        <div style="text-align: center; padding: 50px; color: #94a3b8;">
            <div style="font-size: 50px; margin-bottom: 15px;">📝</div>
            <div style="font-size: 18px;">아직 작성한 묵상이 없습니다.</div>
        </div>
    `}
    
    <!-- 마무리 -->
    <div style="background: linear-gradient(135deg, #4f46e5, #7c3aed); border-radius: 24px; padding: 40px 30px; text-align: center; color: white; margin-top: 30px;">
        <div style="font-size: 50px; margin-bottom: 20px;">🎉</div>
        <div style="font-size: 26px; font-weight: bold; margin-bottom: 15px;">축하합니다!</div>
        <div style="font-size: 16px; opacity: 0.9; line-height: 1.8; margin-bottom: 20px;">
            "그러므로 우리에게 구름 같이 둘러싼<br>
            허다한 증인들이 있으니 모든 무거운 것과<br>
            얽매이기 쉬운 죄를 벗어버리고<br>
            인내로써 우리 앞에 당한 경주를 하며"
        </div>
        <div style="font-size: 18px; opacity: 0.8;">- 히브리서 12:1 -</div>
    </div>
    
    <div style="text-align: center; padding: 30px; color: #94a3b8; font-size: 14px;">
        천로역정 성경 레이스 🏃
    </div>
</div>
</body>
</html>`;

    // 다운로드
    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${userName}_묵상기록_2025.html`;
    a.click();
    URL.revokeObjectURL(url);
};

export const generateMemosCSV = async (db) => {
    if (!db) return;

    try {
        const snap = await db.collection('users').get();
        let csvContent = 'Name,Subgroup,Day,Date,Title,Memo\n';

        snap.docs.forEach(doc => {
            const data = doc.data();
            const userName = data.name || 'Unknown';
            const subgroup = data.subgroupId || '-';
            const memos = data.memos || {};

            Object.keys(memos).forEach(function (key) {
                var memo = memos[key];
                const { round, day } = parseMemoKeyForExport(key);
                const label = round > 1 ? `${round}독 DAY ${day + 1}` : `DAY ${day + 1}`;
                const dateStr = memo.date ? new Date(memo.date).toLocaleDateString('ko-KR') : '';
                const title = (memo.title || '').replace(/,/g, ';').replace(/\n/g, ' ');
                const text = (memo.text || '').replace(/,/g, ';').replace(/\n/g, ' ');
                csvContent += `"${userName}","${subgroup}","${label}","${dateStr}","${title}","${text}"\n`;
            });
        });

        const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `all_memos_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    } catch (e) {
        console.error('CSV 생성 오류:', e);
        alert('CSV 생성 중 오류가 발생했습니다.');
    }
};

export const downloadCSV = (allUsers) => {
    if (allUsers.length === 0) { alert("데이터가 없습니다."); return; }
    let csvContent = "\uFEFF이름,부서,소그룹,현재Day,총점수,연속일수,마지막읽은날,플랜ID\n";
    allUsers.forEach(u => {
        csvContent += `${u.name},${u.departmentName},${u.subgroupId},${u.currentDay},${u.score},${u.streak},${u.lastReadDate || '없음'},${u.planId || '1year_revised'}\r\n`;
    });
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `성경통독_전체기록_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
};

import { SCHEDULE_DATA } from '../data/schedules';

// Helper to count chapters from a range string like "창 1-3장, 출 4-5장" or "창 1장"
const countChapters = (rangeStr) => {
    if (!rangeStr) return 0;

    // Split by comma in case of multiple parts
    const parts = rangeStr.split(',');
    let total = 0;

    parts.forEach(part => {
        // match "1-3장" or "1장"
        // Sometimes it's like "창 1-3장", so we look for numbers before "장"
        const match = part.match(/\d+(-\d+)?장/);
        if (match) {
            const numPart = match[0].replace('장', '');
            if (numPart.includes('-')) {
                const [start, end] = numPart.split('-').map(Number);
                if (!isNaN(start) && !isNaN(end)) {
                    total += (end - start + 1);
                }
            } else {
                total += 1;
            }
        }
    });

    return total > 0 ? total : 1; // Default to 1 if we can't parse it
};

export const downloadPeriodStatsCSV = async (db, allUsers, startDateStr, endDateStr) => {
    if (!db) return;
    if (!startDateStr || !endDateStr) {
        alert('시작일과 종료일을 모두 선택해주세요.');
        return;
    }

    // Parse start & end dates
    const startDate = new Date(startDateStr);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(endDateStr);
    endDate.setHours(23, 59, 59, 999);

    if (startDate > endDate) {
        alert('시작일이 종료일보다 클 수 없습니다.');
        return;
    }

    try {
        // Generate array of date strings for the columns
        const dateColumns = [];
        let currDate = new Date(startDate);
        while (currDate <= endDate) {
            const yyyy = currDate.getFullYear();
            const mm = String(currDate.getMonth() + 1).padStart(2, '0');
            const dd = String(currDate.getDate()).padStart(2, '0');
            dateColumns.push(`${yyyy}-${mm}-${dd}`);
            currDate.setDate(currDate.getDate() + 1);
        }

        // CSV Header
        let csvContent = '\uFEFF이름,부서,소그룹,총읽은횟수(Day분량)';
        dateColumns.forEach(dateStr => {
            csvContent += `,${dateStr}`;
        });
        csvContent += '\n';

        for (const u of allUsers) {
            let periodReadCount = 0;
            const readDaysMap = {};
            dateColumns.forEach(dateStr => readDaysMap[dateStr] = 0);

            // history 서브컬렉션 (신형) + readHistory 배열 필드 (구형) 양쪽 통합
            const [historySnap, userDoc] = await Promise.all([
                db.collection('users').doc(u.uid).collection('history').get(),
                db.collection('users').doc(u.uid).get(),
            ]);
            const subColHistory = historySnap.docs.map(d => d.data());
            const arrayHistory = (userDoc.exists && userDoc.data().readHistory) || [];
            // 날짜 기준 중복 제거 (구형→신형 순서로 병합)
            const seenDates = new Map();
            [...(Array.isArray(arrayHistory) ? arrayHistory : []), ...subColHistory].forEach(item => {
                const dateKey = typeof item === 'string' ? item : item.date;
                if (dateKey) seenDates.set(dateKey + '_' + (item.day ?? ''), item);
            });
            const historyValues = Array.from(seenDates.values());

            for (let i = 0; i < historyValues.length; i++) {
                const item = historyValues[i];
                const itemDateStr = typeof item === 'string' ? item : item.date;
                if (!itemDateStr) continue;

                const itemDate = new Date(itemDateStr);
                if (!isNaN(itemDate.getTime()) && itemDate >= startDate && itemDate <= endDate) {
                    const yyyy = itemDate.getFullYear();
                    const mm = String(itemDate.getMonth() + 1).padStart(2, '0');
                    const dd = String(itemDate.getDate()).padStart(2, '0');
                    const formattedDateStr = `${yyyy}-${mm}-${dd}`;

                    if (readDaysMap[formattedDateStr] !== undefined) {
                        const daysRead = typeof item === 'string' ? 1 : (item.daysRead || 1);

                        readDaysMap[formattedDateStr] += daysRead;
                        periodReadCount += daysRead;
                    }
                }
            }

            // Build user row
            csvContent += `"${u.name}","${u.departmentName || '-'}","${u.subgroupId || '-'}","${periodReadCount}"`;
            dateColumns.forEach(dateStr => {
                const count = readDaysMap[dateStr];
                // Don't format as an empty string, show '0' if it's 0 to be more spreadsheet friendly for sum
                csvContent += `,"${count > 0 ? count : 0}"`;
            });
            csvContent += '\n';
        }

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `성경통독_기간별통계_${startDateStr}_to_${endDateStr}.csv`;
        a.click();
        URL.revokeObjectURL(url);

    } catch (e) {
        console.error('기간별 통계 CSV 생성 오류:', e);
        alert('CSV 생성 중 오류가 발생했습니다.');
    }
};
