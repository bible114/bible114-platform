import React from 'react';
import Icon from '../Icon';

const MonthlyContestInfoModal = ({ show, onClose }) => {
    if (!show) return null;

    return (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4 border-b pb-2">
                    <h3 className="text-xl font-bold text-red-700">🏆 월간 소그룹 대항전</h3>
                    <button onClick={onClose} className="text-slate-400"><Icon name="close" /></button>
                </div>
                <div className="space-y-4 overflow-y-auto max-h-[60vh]">
                    <div>
                        <h4 className="font-bold text-red-600 mb-2">📊 계산 방식</h4>
                        <div className="bg-red-50 p-3 rounded-xl border border-red-100 text-sm text-slate-700 leading-relaxed">
                            <p className="mb-2"><strong>월간 누적 참여율</strong> = (이번 달 총 읽은 횟수) ÷ (인원 × 경과일수) × 100</p>
                            <p className="text-xs text-slate-500">※ 이번 달 1일부터 오늘까지 소그룹 전체가 읽은 누적 기록을 반영합니다</p>
                        </div>
                    </div>
                    <div>
                        <h4 className="font-bold text-slate-700 mb-2">💡 예시</h4>
                        <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs space-y-2">
                            <div>
                                <p className="font-bold text-slate-700 mb-1">1구역 (10명, 1월 12일 기준)</p>
                                <ul className="text-slate-600 space-y-0.5 pl-3">
                                    <li>• 이번 달 총 읽은 횟수: <strong>100회</strong></li>
                                    <li>• 최대 가능 횟수: 10명 × 12일 = <strong>120회</strong></li>
                                    <li>• 월간 참여율: 100 ÷ 120 × 100 = <strong className="text-red-600">83%</strong></li>
                                </ul>
                            </div>
                            <div className="pt-2 border-t border-slate-200">
                                <p className="text-slate-500">→ 평균적으로 매일 83%의 사람들이 꾸준히 읽고 있다는 의미입니다</p>
                            </div>
                        </div>
                    </div>
                    <div>
                        <h4 className="font-bold text-blue-600 mb-2">✅ 왜 공정한가요?</h4>
                        <ul className="text-xs text-slate-600 space-y-2 pl-3">
                            <li>• <strong>한 달 전체의 꾸준함</strong>을 반영합니다</li>
                            <li>• 하루 못 읽어도 그동안의 노력으로 만회 가능</li>
                            <li>• 인원이 다른 소그룹도 비율로 공정 비교</li>
                            <li>• 오늘만 잘해서 1등하는 게 아니라 <strong>진짜 열심히 한 팀</strong>이 상위권</li>
                        </ul>
                    </div>
                </div>
                <button onClick={onClose} className="w-full bg-red-100 font-bold py-3 rounded-xl mt-4 text-red-700 hover:bg-red-200 transition-colors">닫기</button>
            </div>
        </div>
    );
};

export default MonthlyContestInfoModal;
