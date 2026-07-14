import React from 'react';
import { GUARDIAN_CONSENT_METHODS, getAgeAssessment } from '../../utils/signupConsent';

const RELATIONSHIPS = ['부', '모', '후견인', '기타'];

const GuardianConsent = ({ birthdate, value, onChange, disabled = false }) => {
    const normalizedBirthdate = String(birthdate || '').trim();
    const assessment = getAgeAssessment(normalizedBirthdate);
    const guardian = value || {};

    const update = patch => {
        onChange?.({
            agreed: guardian.agreed === true,
            method: GUARDIAN_CONSENT_METHODS.GUARDIAN_ASSERTION,
            guardianName: guardian.guardianName || '',
            relationship: guardian.relationship || '',
            ...patch,
        });
    };

    if (!normalizedBirthdate) {
        return (
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-600">
                생년월일 8자리를 먼저 입력하면 보호자 동의가 필요한지 확인할 수 있어요.
            </p>
        );
    }

    if (!assessment) {
        return (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] leading-relaxed text-red-700">
                생년월일을 확인해주세요. 실제 날짜를 8자리로 입력해주세요. 예: 20150101
            </p>
        );
    }

    if (!assessment.under14) return null;

    return (
        <fieldset disabled={disabled} className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/70 p-4 disabled:opacity-60">
            <legend className="px-1 text-sm font-bold text-amber-950">만 14세 미만 보호자 동의</legend>
            <p className="text-[11px] leading-relaxed text-amber-900">
                보호자께서 아래 내용을 직접 확인하고 동의해주세요.
            </p>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_120px]">
                <label className="space-y-1">
                    <span className="block text-[11px] font-semibold text-amber-950">보호자 성명</span>
                    <input
                        type="text"
                        value={guardian.guardianName || ''}
                        onChange={event => update({ guardianName: event.target.value })}
                        maxLength={50}
                        autoComplete="name"
                        placeholder="보호자 성명"
                        className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
                    />
                </label>
                <label className="space-y-1">
                    <span className="block text-[11px] font-semibold text-amber-950">관계</span>
                    <select
                        value={guardian.relationship || ''}
                        onChange={event => update({ relationship: event.target.value })}
                        className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
                    >
                        <option value="">선택</option>
                        {RELATIONSHIPS.map(relationship => (
                            <option key={relationship} value={relationship}>{relationship}</option>
                        ))}
                    </select>
                </label>
            </div>

            <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-amber-200 bg-white px-3 py-3">
                <input
                    type="checkbox"
                    checked={guardian.agreed === true}
                    onChange={event => update({ agreed: event.target.checked })}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-amber-700"
                />
                <span className="text-[12px] leading-relaxed text-slate-800">
                    보호자인 제가 직접 이용약관, 개인정보 수집·이용, 민감정보 처리와 공동체 명부·랭킹 표시 내용을 확인했으며 이에 동의합니다.
                </span>
            </label>

            <p className="text-[10px] leading-relaxed text-amber-800">
                이 절차는 보호자의 직접 확인 내용을 기록하는 것이며, 플랫폼이 보호자의 신원이나 법정대리인 자격을 본인인증한 것은 아닙니다.
            </p>
        </fieldset>
    );
};

export default GuardianConsent;
