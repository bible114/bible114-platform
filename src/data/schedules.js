import schedules from './read_schedules.json';
import sequentialSchedule from './sequential_schedule.json';
import readableSchedule from './readable_schedule.json';

const MAPPED_SCHEDULES = {
    ...schedules,
    '1year_sequential': sequentialSchedule,
    '1year_revised': schedules.whole_bible,
    '1year_new': schedules.whole_bible,
    'nt_new': schedules.new_testament,
    'readable_revised': readableSchedule,
    'readable_new': readableSchedule,
};

export const SCHEDULE_DATA = MAPPED_SCHEDULES;

export const getPlanTotalDays = (planId) => (
    Array.isArray(MAPPED_SCHEDULES?.[planId]) && MAPPED_SCHEDULES[planId].length > 0
        ? MAPPED_SCHEDULES[planId].length
        : 365
);
