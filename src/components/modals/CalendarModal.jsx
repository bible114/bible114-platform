import React from 'react';
import Icon from '../Icon';

const CalendarModal = ({
    show,
    onClose,
    calendarDate,
    setCalendarDate,
    readHistory
}) => {
    if (!show) return null;

    const today = new Date();
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const monthNames = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];
    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];

    const days = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(i);
    // 모든 달을 6주(42칸) 높이로 유지해 월 이동 시 모달이 위아래로 흔들리지 않게 한다.
    while (days.length < 42) days.push(null);

    const getDateFromItem = (item) => typeof item === 'string' ? item : item.date;

    const readDaysThisMonth = readHistory.filter(item => {
        const dateStr = getDateFromItem(item);
        const date = new Date(dateStr);
        return date.getFullYear() === year && date.getMonth() === month;
    }).map(item => new Date(getDateFromItem(item)).getDate());

    const prevMonth = () => setCalendarDate(new Date(year, month - 1, 1));
    const nextMonth = () => setCalendarDate(new Date(year, month + 1, 1));
    const goToday = () => setCalendarDate(new Date());

    const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;
    const yearReadDays = readHistory.filter(item => {
        const dateStr = getDateFromItem(item);
        return new Date(dateStr).getFullYear() === year;
    }).length;

    return (
        <div className="fixed inset-0 z-[180] bg-black/50 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4 border-b pb-2">
                    <h3 className="text-xl font-bold text-slate-800">📅 읽기 캘린더</h3>
                    <button onClick={onClose} className="text-slate-400"><Icon name="close" /></button>
                </div>
                <div>
                    <div className="flex justify-between items-center mb-4">
                        <button onClick={prevMonth} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold">◀</button>
                        <div className="text-center">
                            <span className="font-bold text-lg text-slate-700">{year}년 {monthNames[month]}</span>
                            {!isCurrentMonth && (
                                <button onClick={goToday} className="ml-2 text-xs text-blue-500 underline">오늘로</button>
                            )}
                        </div>
                        <button onClick={nextMonth} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold">▶</button>
                    </div>
                    <div className="grid grid-cols-7 gap-1 mb-2">
                        {dayNames.map(d => <div key={d} className={`text-center text-[10px] font-bold py-1 ${d === '일' ? 'text-red-400' : d === '토' ? 'text-blue-400' : 'text-slate-400'}`}>{d}</div>)}
                    </div>
                    <div className="grid grid-cols-7 gap-1">
                        {days.map((day, idx) => {
                            if (!day) return <div key={idx} className="aspect-square" aria-hidden="true"></div>;
                            const isToday = isCurrentMonth && day === today.getDate();
                            const didRead = readDaysThisMonth.indexOf(day) !== -1;
                            const dayOfWeek = new Date(year, month, day).getDay();
                            return (
                                <button key={idx}
                                    className={`aspect-square flex flex-col items-center justify-center rounded-lg border transition-all cursor-default relative
                                            ${isToday ? 'ring-2 ring-blue-400' : ''}
                                            ${didRead ? 'bg-green-100 border-green-200 text-green-700' : dayOfWeek === 0 ? 'bg-red-50 border-red-100 text-red-300' : dayOfWeek === 6 ? 'bg-blue-50 border-blue-100 text-blue-300' : 'bg-slate-50 border-slate-100 text-slate-400 hover:bg-blue-50'}`}
                                >
                                    <span className="text-sm font-bold">{day}</span>
                                    {didRead && <span className="absolute top-0.5 right-0.5 text-[8px]">✅</span>}
                                </button>
                            );
                        })}
                    </div>
                    <div className="mt-4 flex justify-center gap-4 text-xs">
                        <div className="flex items-center gap-1"><div className="w-4 h-4 bg-green-100 rounded"></div><span className="text-slate-500">읽은 날</span></div>
                        <div className="flex items-center gap-1"><div className="w-4 h-4 bg-slate-50 rounded border"></div><span className="text-slate-500">안 읽은 날</span></div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                        <div className="bg-green-50 p-3 rounded-xl border border-green-100 text-center">
                            <p className="text-xs text-slate-500">이번 달</p>
                            <p className="text-lg font-bold text-green-700">{readDaysThisMonth.length}일</p>
                        </div>
                        <div className="bg-blue-50 p-3 rounded-xl border border-blue-100 text-center">
                            <p className="text-xs text-slate-500">{year}년 총</p>
                            <p className="text-lg font-bold text-blue-700">{yearReadDays}일</p>
                        </div>
                    </div>
                </div>
                <button onClick={onClose} className="w-full bg-slate-100 font-bold py-3 rounded-xl mt-4 text-slate-600">닫기</button>
            </div>
        </div>
    );
};

export default CalendarModal;
