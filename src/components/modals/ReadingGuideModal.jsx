import React from 'react';
import Icon from '../Icon';

const MEMBER_FAQ_ITEMS = [
    {
        question: '로그인이 안 돼요',
        answer: <>처음 화면에서 전에 사용한 <strong>카카오 또는 구글</strong> 버튼을 누르세요. 예전에 이름·생년월일·비밀번호로 로그인했다면, <strong>새로 가입하거나 교회를 다시 찾지 말고</strong> 소셜 로그인 뒤 <strong>기존 진도·달란트 이어보기</strong>를 눌러주세요. 기존 정보를 한 번 확인하면 다음부터는 소셜 버튼만으로 로그인할 수 있어요.</>,
    },
    {
        question: '비밀번호를 잊었어요',
        answer: <>비밀번호는 예전 기록을 소셜 계정에 처음 연결할 때만 필요해요. 비밀번호를 모르면 교회 관리자(담당 선생님)에게 새 비밀번호를 요청한 뒤 연결해주세요.</>,
    },
    {
        question: '듣기 소리가 안 나와요',
        answer: <>카카오톡·네이버·구글 앱 안의 브라우저에서는 듣기가 제한될 수 있어요. 화면 메뉴에서 <strong>외부 브라우저로 열기</strong>를 고른 뒤, 갤럭시는 크롬·삼성인터넷, 아이폰은 사파리로 열어주세요. 휴대폰 무음 모드와 음량도 확인해주세요.</>,
    },
    {
        question: '달란트가 안 늘어요',
        answer: <>달란트는 <strong>하루 첫 읽기 완료</strong>와 <strong>하루 첫 퀴즈 정답</strong>에만 쌓여요. 그날 이미 완료한 뒤의 <strong>추가 읽기는 0점·0달란트</strong>이며, 퀴즈 보상도 하루 한 번만 받아요.</>,
    },
    {
        question: '상점에서 샀는데 물건은 어디서?',
        answer: <>상품은 교회 관리자(선생님)에게 직접 받아요. 구매를 잘못했거나 취소하려면 관리자에게 바로 말씀해주세요. 상점은 <strong>7일 연속 읽으면 열리고, 한 번 열리면 계속 유지</strong>돼요. 그래도 <strong>상점이 안 보이면</strong> 소속 공동체나 부서에서 상점을 사용하지 않는 경우예요. 달란트 잔액과 상품은 <strong>공동체마다 따로</strong>이므로 현재 선택한 공동체도 확인해주세요.</>,
    },
    {
        question: '휴대폰을 바꿨어요',
        answer: <>새 휴대폰에서도 전에 연결한 <strong>카카오 또는 구글</strong> 버튼을 누르면 기록이 이어져요. 아직 연결하지 않은 예전 교회 계정은 소셜 로그인 뒤 <strong>기존 진도·달란트 이어보기</strong>에서 한 번 연결해주세요. 게스트 기록은 이전 휴대폰에만 있어 옮겨지지 않아요. 자주 쓰려면 브라우저 메뉴에서 <strong>홈 화면에 추가</strong>해두세요.</>,
    },
];

const ReadingGuideModal = ({ show, onClose, mode = 'guide' }) => {
    const closeButtonRef = React.useRef(null);
    const dialogRef = React.useRef(null);
    const isFaq = mode === 'faq';

    React.useEffect(() => {
        if (!show) return undefined;
        const previouslyFocused = document.activeElement;
        const previousBodyOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const handleKeyDown = event => {
            if (event.key === 'Escape') onClose();
            if (event.key !== 'Tab') return;
            const focusable = dialogRef.current?.querySelectorAll(
                'button:not([disabled]), a[href], summary, input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
            );
            if (!focusable?.length) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        closeButtonRef.current?.focus();
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = previousBodyOverflow;
            previouslyFocused?.focus?.();
        };
    }, [show, onClose]);

    if (!show) return null;

    return (
        <div className="fixed inset-0 z-[180] bg-black/50 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="reading-guide-title" className="bg-white rounded-2xl p-6 w-full max-w-sm max-h-[92vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4 border-b pb-2">
                    <h3 id="reading-guide-title" className="text-xl font-bold text-slate-800">
                        {isFaq ? '❓ 자주 묻는 질문' : '📖 성경통독 114 가이드'}
                    </h3>
                    <button ref={closeButtonRef} type="button" aria-label="도움말 닫기" onClick={onClose} className="min-w-11 min-h-11 flex items-center justify-center text-slate-400"><Icon name="close" /></button>
                </div>

                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto text-sm">
                    {isFaq ? (
                        <section aria-label="자주 묻는 질문 목록" className="text-sm">
                        <div className="space-y-2">
                            {MEMBER_FAQ_ITEMS.map(({ question, answer }, index) => (
                                <details key={question} open={index === 0} className="group rounded-xl border border-slate-200 bg-white overflow-hidden">
                                    <summary className="min-h-11 px-3 py-2.5 flex items-center justify-between gap-3 cursor-pointer font-bold text-slate-700 list-none [&::-webkit-details-marker]:hidden">
                                        <span>{question}</span>
                                        <span aria-hidden="true" className="text-violet-500 text-lg transition-transform group-open:rotate-180">⌄</span>
                                    </summary>
                                    <p className="px-3 pb-3 text-sm leading-relaxed text-slate-600 border-t border-slate-100 pt-2">
                                        {answer}
                                    </p>
                                </details>
                            ))}
                        </div>
                        <div className="mt-3 rounded-xl border border-violet-200 bg-violet-50 px-3 py-3 text-sm font-bold leading-relaxed text-violet-800 shadow-sm">
                            💬 여기 없는 문제는 우리 교회 관리자(선생님)에게 말씀해주세요
                        </div>
                        </section>
                    ) : (
                        <>
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
                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                        <h4 className="font-bold text-slate-700 mb-2">✍️ 성경통독 114를 만든 이유</h4>
                        <p className="text-sm text-slate-500 mb-2 font-medium">조병수 (합동신학대학원대학교 명예교수)</p>
                        <p className="text-slate-600 leading-relaxed text-sm mb-2">
                            나는 어릴 때부터 스코틀랜드의 개혁파 목사였던 맥체인(Robert Murray M'Cheyne, 1813-1843)의 1년 성경통독표를 따라 성경을 읽었다. 그런데 나는 언제부턴가 주위의 사람들로부터 이 표를 따라가는 데 실패한다는 말을 듣게 되었고, 나 자신도 이 표에서 지루함을 느끼기 시작했다. 그 이유는 간단했다. 예를 들어, 맥체인 표는 모세오경을 계속 읽어야 하고, 사복음서도 이어 읽어야 한다. 그러다 보니 출애굽 이후 사건들이나 예수님의 활동에 관한 이야기가 자꾸 반복되어 지루함을 가져다주는 것이었다.
                        </p>
                        <p className="text-slate-600 leading-relaxed text-sm mb-2">
                            나는 이런 문제점을 풀기 위해서 지루한 반복을 피하는 방법을 찾게 되었다. 가장 좋은 단서는 사복음서였다. 1년을 사분기로 나누어 사복음서를 각 분기에 배치하면 좋겠다는 생각이 들었다. 그러고 보니 창세기 이후 4권의 책들도 결국은 모두 출애굽 이후 이스라엘의 광야생활을 다루고 있으므로 각 분기에 나누어두는 것이 가능했다.
                        </p>
                        <p className="text-slate-600 leading-relaxed text-sm mb-2">
                            나는 이런 전제 아래 구약성경과 신약성경을 사분기로 읽을 수 있도록 도표로 나누어보았다. 나는 이것에 편의상 <strong>"성경통독 114"</strong>라는 이름을 붙였다. 그 뜻은 성경전체를 1년에 1번 통독하지만(1년 1독) 4번 읽는 효과를 낸다는 것이다. 달리 말하자면, 3개월마다 성경을 한 번씩 읽는 것과 같다.
                        </p>
                        <p className="text-slate-600 leading-relaxed text-sm">
                            성경통독 114는 성경을 읽는 사람들에게 최소한 두 가지 유익을 준다. <strong>첫째는 속도이다.</strong> 이 표를 따라 읽으면 한 분기(3개월)라는 짧은 시일 안에 창세기부터 요한계시록까지 읽는 듯한 느낌을 얻는다. <strong>둘째는 재기이다.</strong> 이 표는 성경을 사분기로 반복하여 읽도록 고안되어 있어서 4번의 기회를 주기 때문에 실패해도 다시 시도할 수 있다.
                        </p>
                    </div>
                        </>
                    )}
                </div>
                <button type="button" onClick={onClose} className="w-full bg-slate-100 font-bold py-3 rounded-xl mt-4 text-slate-600">닫기</button>
            </div>
        </div>
    );
};

export default ReadingGuideModal;
