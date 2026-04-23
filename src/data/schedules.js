import schedules from './read_schedules.json';

// 플랜 ID와 스케줄 데이터를 매핑합니다.
// 현재 read_schedules.json에는 'whole_bible' 키만 존재하므로,
// 1년 일독 플랜들은 모두 'whole_bible' 데이터를 사용하도록 매핑합니다.
const MAPPED_SCHEDULES = {
    ...schedules,
    '1year_revised': schedules.whole_bible,
    '1year_new': schedules.whole_bible,
    '1year_easy': schedules.whole_bible,
    '1year_saehangul': schedules.whole_bible,
    '1year_sequential': schedules.whole_bible,
    'nt_new': schedules.whole_bible, // 임시 매핑 내지는 nt 데이터 필요
    'nt_easy': schedules.whole_bible,
    'nt_saehangul': schedules.whole_bible,
    'nt_message': schedules.whole_bible,
    // 신약 등 다른 플랜 데이터가 추가되면 여기에 매핑 추가
};

export const SCHEDULE_DATA = MAPPED_SCHEDULES;
