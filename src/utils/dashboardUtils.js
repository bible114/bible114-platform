/**
 * Dashboard UI utility functions
 */

/**
 * Returns display information for a subgroup, including abbreviated names and background colors.
 * Used for the Race Map and other UI elements.
 * 
 * @param {string} subgroupId - The ID of the subgroup (e.g., '1구역', '여성실버1')
 * @returns {object} { lines: Array<string>, bgColor: string }
 */
export const getSubgroupDisplay = (subgroupId) => {
    if (!subgroupId) return { lines: ['미지정'], bgColor: 'bg-gradient-to-br from-slate-400 to-slate-500' };

    // 선명하고 확실한 색상 매핑 (천로역정 레이스용)
    const colorMap = {
        '1구역': 'bg-[#FF5252] text-white border-red-600',
        '2구역': 'bg-[#FF7043] text-white border-orange-600',
        '3구역': 'bg-[#FFA726] text-white border-amber-600',
        '4구역': 'bg-[#FBC02D] text-white border-yellow-700',
        '5구역': 'bg-[#8BC34A] text-white border-lime-700',
        '6구역': 'bg-[#4CAF50] text-white border-green-700',
        '7구역': 'bg-[#009688] text-white border-emerald-700',
        '8구역': 'bg-[#00BCD4] text-white border-teal-700',
        '9구역': 'bg-[#03A9F4] text-white border-sky-700',
        '10구역': 'bg-[#42A5F5] text-white border-blue-600',
        '11구역': 'bg-[#2196F3] text-white border-blue-700',
        '12구역': 'bg-[#3F51B5] text-white border-indigo-700',
        '13구역': 'bg-[#673AB7] text-white border-violet-700',
        '14구역': 'bg-[#9C27B0] text-white border-purple-700',
        '15구역': 'bg-[#F06292] text-white border-fuchsia-700',
        '16구역': 'bg-[#FF4081] text-white border-pink-700',
        '17구역': 'bg-[#E91E63] text-white border-rose-700',
        '소년부': 'bg-[#FFB300] text-white border-amber-700',
        '중고등부': 'bg-[#1E88E5] text-white border-blue-800',
        '청년부': 'bg-[#5C6BC0] text-white border-indigo-800',
        '새가족': 'bg-[#43A047] text-white border-green-800',
        '소속없음': 'bg-[#78909C] text-white border-slate-600'
    };

    // 축약어 매핑 (두 줄로 표시할 때 사용)
    const abbreviations = {
        '여성실버1': ['여성', '실버1'],
        '여성실버2': ['여성', '실버2'],
        '남성실버': ['남성', '실버'],
        '젊은부부': ['젊은', '부부'],
        '1남선교회': ['1남', '선교회'],
        '2남선교회': ['2남', '선교회'],
        '3남선교회': ['3남', '선교회'],
        '4남선교회': ['4남', '선교회'],
        '5남선교회': ['5남', '선교회'],
        '현준 목장': ['현준', '목장'],
        '지훈 목장': ['지훈', '목장'],
        '아영 목장': ['아영', '목장'],
        '유리 목장': ['유리', '목장'],
        '채현 목장': ['채현', '목장'],
        '소속없음': ['소속', '없음']
    };

    // 구역은 그대로 표시 (1구역, 2구역 등)
    if (subgroupId.match(/^\d+구역$/)) {
        return {
            lines: [subgroupId],
            bgColor: colorMap[subgroupId] || 'bg-slate-400'
        };
    }

    // 목장은 그대로 표시 (1목장, 2목장 등)
    if (subgroupId.match(/^\d+목장$/)) {
        return {
            lines: [subgroupId],
            bgColor: colorMap[subgroupId] || 'bg-slate-400'
        };
    }

    // 축약이 정의된 경우
    if (abbreviations[subgroupId]) {
        return {
            lines: abbreviations[subgroupId],
            bgColor: colorMap[subgroupId] || 'bg-slate-400'
        };
    }

    // 기본: 그대로 표시
    return {
        lines: [subgroupId],
        bgColor: colorMap[subgroupId] || 'bg-slate-400'
    };
};
