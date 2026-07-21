import React from 'react';

const ChurchAdminReaderGuide = ({ show, onClose, onOpenAdmin }) => {
    if (!show) return null;

    return (
        <div
            className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/55 px-5 py-8 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="church-admin-reader-guide-title"
        >
            <section className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
                <div className="text-center">
                    <div className="text-5xl" aria-hidden="true">📖</div>
                    <h2 id="church-admin-reader-guide-title" className="mt-4 text-2xl font-black text-slate-900">
                        관리자도 성경 읽기부터 시작해요
                    </h2>
                    <p className="mt-3 text-base font-bold leading-7 text-slate-600">
                        로그인하면 성도들과 같은 성경 읽기 화면이 먼저 열립니다.
                    </p>
                </div>

                <div className="mt-5 rounded-2xl border-2 border-indigo-100 bg-indigo-50 px-4 py-4 text-center">
                    <p className="text-sm font-bold text-indigo-800">성도 현황이나 공동체 설정을 보려면</p>
                    <div className="mx-auto mt-3 inline-flex items-center gap-1 rounded-xl border border-indigo-200 bg-white px-3 py-2 text-base font-black text-indigo-700 shadow-sm">
                        ⚙️ 관리
                    </div>
                    <p className="mt-2 text-sm font-bold text-indigo-700">화면 맨 위의 이 버튼을 누르세요.</p>
                </div>

                <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-left">
                    <p className="text-sm font-black text-amber-900">소그룹 안내도 함께 해주세요</p>
                    <p className="mt-1 text-xs font-bold leading-5 text-amber-800">
                        성도는 자신의 소그룹으로 가입합니다. 주일학교 선생님에게는 가입 후 <b>메뉴 → 공동체 선택</b>에서 맡은 반도 함께 추가하도록 안내해주세요.
                    </p>
                </div>

                <button
                    type="button"
                    onClick={onClose}
                    className="mt-6 w-full rounded-2xl bg-blue-600 px-5 py-4 text-base font-black text-white transition-colors hover:bg-blue-700"
                >
                    확인했어요 · 성경 읽기 시작
                </button>
                <button
                    type="button"
                    onClick={onOpenAdmin}
                    className="mt-2 w-full rounded-2xl px-5 py-3 text-sm font-bold text-indigo-700 transition-colors hover:bg-indigo-50"
                >
                    지금 관리 화면 열기 →
                </button>
            </section>
        </div>
    );
};

export default ChurchAdminReaderGuide;
