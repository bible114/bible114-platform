// 각 부서별 소그룹 목록
let seniorSubgroups = [];
for (let i = 1; i <= 14; i++) { seniorSubgroups.push(i + "구역"); }
seniorSubgroups = seniorSubgroups.concat(['여성실버1', '여성실버2', '남성실버', '젊은부부', '1남선교회', '2남선교회', '3남선교회', '4남선교회', '5남선교회', '소속없음']);

const youthSubgroups = ['현준 목장', '지훈 목장', '아영 목장', '유리 목장', '채현 목장'];
const middleHighSubgroups = ['남학생', '여학생'];
const elementarySubgroups = ['1학년', '2학년', '3학년', '4학년', '5학년', '6학년'];
const kindergartenSubgroups = ['소망반', '빌립반', '믿음반'];

// 공동체(부서) 목록
export const DEFAULT_DEPARTMENTS = [
    { id: 'senior', name: '장년부', color: 'bg-orange-500', icon: '🏔️', subgroups: seniorSubgroups },
    { id: 'youth', name: '청년부', color: 'bg-blue-500', icon: '🏃', subgroups: youthSubgroups },
    { id: 'middlehigh', name: '중고등부', color: 'bg-purple-500', icon: '🏫', subgroups: middleHighSubgroups },
    { id: 'elementary', name: '유초등부', color: 'bg-yellow-500', icon: '🐥', subgroups: elementarySubgroups },
    { id: 'kinder', name: '유아유치부', color: 'bg-pink-500', icon: '🍼', subgroups: kindergartenSubgroups },
];
