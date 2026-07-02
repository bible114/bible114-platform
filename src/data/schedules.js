import schedules from './read_schedules.json';

const MAPPED_SCHEDULES = {
    ...schedules,
    '1year_sequential': schedules.whole_bible,
    '1year_revised': schedules.whole_bible,
    '1year_new': schedules.whole_bible,
    '1year_saehangul': schedules.whole_bible,
    'nt_new': schedules.new_testament,
    'nt_saehangul': schedules.new_testament,
};

export const SCHEDULE_DATA = MAPPED_SCHEDULES;
