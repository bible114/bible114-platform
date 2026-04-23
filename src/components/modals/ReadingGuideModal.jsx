import React from 'react';
import Icon from '../Icon';

const ReadingGuideModal = ({ show, onClose }) => {
    if (!show) return null;

    return (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4 border-b pb-2">
                    <h3 className="text-xl font-bold text-slate-800">📖 성경통독 114 가이드</h3>
                    <button onClick={onClose} className="text-slate-400"><Icon name="close" /></button>
                </div>
                <a href="https://www.bible114.net/8e616cd9-5ca0-4dd3-9e63-64280fc66f38" target="_blank" rel="noopener noreferrer" className="block w-full mb-4 bg-gradient-to-r from-blue-500 to-blue-600 text-white text-center py-3 rounded-xl font-bold shadow-md hover:from-blue-600 hover:to-blue-700 transition-all">
                    🎥 성경통독 114 설명 영상 보기
                </a>
                <div className="space-y-3 overflow-y-auto max-h-[60vh] text-xs">
                    <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                        <h4 className="font-bold text-blue-700 mb-2">💡 성경통독 114란?</h4>
                        <p className="text-slate-600 leading-relaxed">
                            <strong>1년 1독 4회 효과!</strong> 성경 전체를 1년에 1번 통독하지만, 3개월(한 분기)마다 성경 전체 시대를 볼 수 있도록 되어 있으며, 중복된 시대를 나누어 읽어 지루하지 않게 읽을 수 있습니다.
                        </p>
                    </div>
                    <div className="bg-green-50 p-3 rounded-lg border border-green-100">
                        <h4 className="font-bold text-green-700 mb-2">📅 1분기 (1-3월)</h4>
                        <p className="text-slate-600 leading-relaxed mb-1"><strong className="text-green-800">구약:</strong> 창세기 1-11장, 출애굽기, 여호수아, 사사기, 룻기, 욥기, 다니엘, 에스라 1-6장, 학개, 스가랴, 에스라 7-10장, 느헤미야, 에스더</p>
                        <p className="text-slate-600 leading-relaxed"><strong className="text-green-800">신약:</strong> 마태복음, 사도행전 1-5장, 로마서, 갈라디아서, 히브리서, 요한계시록 1-3장</p>
                    </div>
                    <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-100">
                        <h4 className="font-bold text-yellow-700 mb-2">📅 2분기 (4-6월)</h4>
                        <p className="text-slate-600 leading-relaxed mb-1"><strong className="text-yellow-800">구약:</strong> 창세기 12-26장, 레위기, 사무엘상, 사무엘하, 시편 1-72편, 이사야, 요엘, 오바댜, 나훔, 하박국</p>
                        <p className="text-slate-600 leading-relaxed"><strong className="text-yellow-800">신약:</strong> 마가복음, 사도행전 6-12장, 고린도전서, 고린도후서, 데살로니가전서, 데살로니가후서, 야고보서, 유다서, 요한계시록 4-7장</p>
                    </div>
                    <div className="bg-orange-50 p-3 rounded-lg border border-orange-100">
                        <h4 className="font-bold text-orange-700 mb-2">📅 3분기 (7-9월)</h4>
                        <p className="text-slate-600 leading-relaxed mb-1"><strong className="text-orange-800">구약:</strong> 창세기 27-36장, 민수기, 열왕기상 1-11장, 잠언, 전도서, 아가서, 열왕기상 12-22장, 열왕기하 1-14장, 요나, 열왕기하 15장, 아모스, 호세아, 열왕기하 16-23장, 스바냐, 열왕기하 24-25장, 에스겔</p>
                        <p className="text-slate-600 leading-relaxed"><strong className="text-orange-800">신약:</strong> 누가복음, 사도행전 13-20장, 에베소서, 빌립보서, 골로새서, 빌레몬서, 베드로전서, 베드로후서, 요한계시록 8-14장</p>
                    </div>
                    <div className="bg-red-50 p-3 rounded-lg border border-red-100">
                        <h4 className="font-bold text-red-700 mb-2">📅 4분기 (10-12월)</h4>
                        <p className="text-slate-600 leading-relaxed mb-1"><strong className="text-red-800">구약:</strong> 창세기 37-50장, 신명기, 시편 90편, 역대상, 시편 73-150편, 역대하 1-28장, 미가, 역대하 29-36장, 예레미야, 예레미야애가, 말라기</p>
                        <p className="text-slate-600 leading-relaxed"><strong className="text-red-800">신약:</strong> 요한복음, 사도행전 21-28장, 디모데전서, 디모데후서, 디도서, 요한일서, 요한이서, 요한삼서, 요한계시록 15-22장</p>
                    </div>
                    <div className="bg-purple-50 p-3 rounded-lg border border-purple-100">
                        <h4 className="font-bold text-purple-700 mb-1">💪 포기하지 마세요!</h4>
                        <p className="text-slate-600 leading-relaxed">밀렸다고 포기하지 마세요! 주일에 몰아서 읽어도 괜찮습니다. <strong>완주가 목표</strong>입니다. 함께 달려요! 🏃‍♂️</p>
                    </div>
                </div>
                <button onClick={onClose} className="w-full bg-slate-100 font-bold py-3 rounded-xl mt-4 text-slate-600">닫기</button>
            </div>
        </div>
    );
};

export default ReadingGuideModal;
