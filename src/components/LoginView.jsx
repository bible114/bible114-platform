import React from 'react';

const LoginView = ({
    loginTab,
    setLoginTab,
    loginName,
    setLoginName,
    loginPw,
    setLoginPw,
    signupName,
    setSignupName,
    signupBirthdate,
    setSignupBirthdate,
    signupPw,
    setSignupPw,
    signupPwConfirm,
    setSignupPwConfirm,
    errorMsg,
    handleLogin,
}) => {
    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 relative">
            <div className="absolute top-4 right-4">
                <button
                    onClick={() => { setLoginName('admin'); setLoginPw(''); }}
                    className="text-xs text-slate-300 hover:text-slate-500"
                >
                    관리자
                </button>
            </div>
            <div className="bg-white p-8 rounded-3xl shadow-xl w-full max-w-lg border border-slate-100">
                <div className="text-center mb-8">
                    <div className="text-4xl mb-2">🏃‍♂️💨</div>
                    <h1 className="text-2xl font-extrabold text-slate-800">천로역정 성경 레이스</h1>
                    <p className="text-slate-400 text-sm mt-2">유쾌한 신앙생활의 시작!</p>
                </div>

                {/* 탭 UI */}
                <div className="flex gap-2 mb-6">
                    <button
                        type="button"
                        onClick={() => setLoginTab('login')}
                        className={`flex-1 py-3 rounded-xl font-bold transition-all ${loginTab === 'login'
                            ? 'bg-blue-600 text-white shadow-lg'
                            : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                            }`}
                    >
                        로그인
                    </button>
                    <button
                        type="button"
                        onClick={() => setLoginTab('signup')}
                        className={`flex-1 py-3 rounded-xl font-bold transition-all ${loginTab === 'signup'
                            ? 'bg-blue-600 text-white shadow-lg'
                            : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                            }`}
                    >
                        회원가입
                    </button>
                </div>

                {loginTab === 'login' ? (
                    <form onSubmit={handleLogin} className="space-y-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1 ml-1">이름</label>
                            <input
                                type="text"
                                value={loginName}
                                onChange={e => setLoginName(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="홍길동"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1 ml-1">암호</label>
                            <input
                                type="password"
                                value={loginPw}
                                onChange={e => setLoginPw(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="6자리 이상 입력하세요"
                            />
                        </div>
                        <div className="bg-red-50 p-3 rounded-lg border border-red-100">
                            <p className="text-xs text-red-600 font-bold break-keep text-center">
                                ⚠️ 처음 오셨나요? <br />반드시 <span className="underline">실명</span>으로 가입해주세요.<br />(예: 홍길동)
                            </p>
                        </div>
                        {errorMsg && <p className="text-red-500 text-xs text-center">{errorMsg}</p>}
                        <button
                            type="submit"
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl shadow-lg shadow-blue-200 transition-all active:scale-95 mt-4"
                        >
                            입장하기
                        </button>
                        <p className="text-xs text-slate-400 text-center mt-3">암호를 잊어버린 경우 사무실에 문의해주세요.</p>
                    </form>
                ) : (
                    <form onSubmit={handleLogin} className="space-y-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1 ml-1">이름</label>
                            <input
                                type="text"
                                value={signupName}
                                onChange={e => setSignupName(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="홍길동"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1 ml-1">생년월일</label>
                            <input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                maxLength="8"
                                value={signupBirthdate}
                                onChange={e => {
                                    const value = e.target.value.replace(/[^0-9]/g, '');
                                    setSignupBirthdate(value);
                                }}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg tracking-wider"
                                placeholder="19500101"
                                required
                            />
                            <p className="text-[10px] text-slate-400 mt-1 ml-1">
                                8자리 숫자로 입력 (예: 19500101)
                            </p>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1 ml-1">암호</label>
                            <input
                                type="password"
                                value={signupPw}
                                onChange={e => setSignupPw(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="6자리 이상"
                                required
                                minLength={6}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1 ml-1">암호 확인</label>
                            <input
                                type="password"
                                value={signupPwConfirm}
                                onChange={e => setSignupPwConfirm(e.target.value)}
                                className={`w-full bg-slate-50 border rounded-xl p-3 focus:outline-none focus:ring-2 ${signupPwConfirm && signupPw !== signupPwConfirm
                                    ? 'border-red-300 focus:ring-red-500'
                                    : 'border-slate-200 focus:ring-blue-500'
                                    }`}
                                placeholder="암호를 다시 입력하세요"
                                required
                            />
                            {signupPwConfirm && signupPw !== signupPwConfirm && (
                                <p className="text-xs text-red-500 mt-1 ml-1">⚠️ 암호가 일치하지 않습니다</p>
                            )}
                        </div>
                        <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                            <p className="text-xs text-blue-600 font-bold break-keep text-center">
                                ✅ 회원가입 후 자동으로 로그인됩니다
                            </p>
                        </div>
                        {errorMsg && <p className="text-red-500 text-xs text-center">{errorMsg}</p>}
                        <button
                            type="submit"
                            disabled={signupPw !== signupPwConfirm || !signupName || !signupBirthdate || !signupPw}
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl shadow-lg shadow-blue-200 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            회원가입하기
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
};

export default LoginView;
