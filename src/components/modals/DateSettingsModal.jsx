import React from 'react';
import Icon from '../Icon';
import { SCHEDULE_DATA } from '../../data/schedules';

const DateSettingsModal = ({
    show,
    onClose,
    currentUser,
    currentDay,
    dateSettingsDate,
    setDateSettingsDate,
    dateToOffset,
    changeStartDate
}) => {
    const [canClose, setCanClose] = React.useState(false);

    React.useEffect(() => {
        if (show) {
            const timer = setTimeout(() => setCanClose(true), 300);
            return () => clearTimeout(timer);
        } else {
            setCanClose(false);
        }
    }, [show]);

    if (!show) return null;

    const year = dateSettingsDate.getFullYear();
    const month = dateSettingsDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const lastDate = new Date(year, month + 1, 0).getDate();
    const days = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let i = 1; i <= lastDate; i++) days.push(i);
    const planData = SCHEDULE_DATA ? SCHEDULE_DATA[currentUser ? currentUser.planId : null] : null;

    const handleClose = () => {
        if (canClose) onClose();
    };

    return (
        <div
            className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 animate-in fade-in duration-200"
            onClick={(e) => {
                if (e.target === e.currentTarget && canClose) onClose();
            }}
        >
            <div
                className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl overflow-y-auto max-h-[90vh] animate-in zoom-in-95 duration-200"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex justify-between items-center mb-4 border-b pb-2">
                    <h3 className="text-xl font-bold text-slate-800">📅 날짜 설정</h3>
                    <button onClick={onClose} className="text-slate-400 p-1 hover:bg-slate-100 rounded-full transition-colors"><Icon name="close" /></button>
                </div>
                <div className="mb-4 bg-purple-50 p-4 rounded-xl border border-purple-100 text-center">
                    <p className="text-lg font-bold text-purple-700 leading-relaxed">
                        "읽고 싶은 날짜를 체크해 주세요."
                    </p>
                    <p className="text-[11px] text-purple-500 mt-1 opacity-80">
                        누른 날짜에 맞춰서 성경 읽기 일정이 자동으로 바뀝니다.
                    </p>
                </div>
                <div className="space-y-4">
                    <div className="flex justify-between items-center bg-slate-50 p-2 rounded-xl">
                        <button onClick={(e) => { e.stopPropagation(); setDateSettingsDate(new Date(year, month - 1)); }} className="p-2 hover:bg-white rounded-lg transition-colors"><Icon name="back" size={16} /></button>
                        <span className="font-bold text-slate-700">{year}년 {month + 1}월</span>
                        <button onClick={(e) => { e.stopPropagation(); setDateSettingsDate(new Date(year, month + 1)); }} className="p-2 hover:bg-white rounded-lg transition-colors rotate-180"><Icon name="back" size={16} /></button>
                    </div>
                    <div className="grid grid-cols-7 gap-1 text-center mb-1">
                        {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => (
                            <div key={i} className={`text-[10px] font-bold py-1 ${i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-slate-400'}`}>{d}</div>
                        ))}
                    </div>
                    <div className="grid grid-cols-7 gap-1">
                        {days.map((day, idx) => {
                            if (!day) return <div key={idx}></div>;
                            const offset = dateToOffset(month + 1, day);
                            const schedule = planData && planData[offset] ? planData[offset] : null;
                            const isToday = new Date().getDate() === day && new Date().getMonth() === month;
                            const dayOfWeek = new Date(year, month, day).getDay();
                            return (
                                <button key={idx}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        const newOffset = offset - currentDay + 1;
                                        changeStartDate(newOffset);
                                        onClose(); // 설정 후 바로 닫기
                                    }}
                                    className={`group aspect-square flex flex-col items-center justify-center rounded-lg border transition-all hover:border-purple-400 hover:shadow-sm active:scale-95
                                        ${isToday ? 'bg-purple-50 border-purple-200 ring-1 ring-purple-300' : 'bg-white border-slate-100'}
                                    `}
                                >
                                    <span className={`text-xs font-bold ${dayOfWeek === 0 ? 'text-red-500' : dayOfWeek === 6 ? 'text-blue-500' : 'text-slate-700'}`}>{day}</span>
                                    {schedule && (
                                        <span className="text-[7px] text-slate-400 break-keep leading-[1.1] w-full px-0.5 whitespace-pre-wrap" title={schedule.range}>
                                            {schedule.range}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                    <div className="bg-amber-50 p-3 rounded-xl border border-amber-200">
                        <p className="text-[11px] text-amber-700 leading-relaxed font-medium">
                            💡 달력에서 오늘 날짜를 찾아서 한 번만 콕 눌러주세요.
                        </p>
                    </div>
                </div>
                <button onClick={onClose} className="w-full bg-slate-100 font-bold py-3 rounded-xl mt-4 text-slate-600">닫기</button>
            </div>
        </div>
    );
};

export default DateSettingsModal;
