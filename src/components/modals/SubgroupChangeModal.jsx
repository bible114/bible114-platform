import React from 'react';
import Icon from '../Icon';
import { MOCK_COMMUNITIES } from '../../data/communities';

const SubgroupChangeModal = ({ show, onClose, currentUser, changeSubgroup }) => {
    if (!show) return null;

    return (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4 border-b pb-2">
                    <h3 className="text-xl font-bold text-slate-800">👥 소그룹 변경</h3>
                    <button onClick={onClose} className="text-slate-400"><Icon name="close" /></button>
                </div>
                <div className="mb-4 bg-blue-50 p-3 rounded-xl border border-blue-200">
                    <p className="text-sm text-blue-700">현재 소그룹: <strong>{currentUser.subgroupId || '미배정'}</strong></p>
                </div>
                <div className="grid grid-cols-2 gap-2 max-h-[300px] overflow-y-auto">
                    {(() => {
                        const comm = MOCK_COMMUNITIES.find(c => c.id === currentUser.communityId);
                        if (!comm) return null;
                        return comm.subgroups.map((sub, idx) => (
                            <button key={idx} onClick={() => changeSubgroup(sub)} disabled={sub === currentUser.subgroupId} className={`p-3 rounded-xl text-sm font-bold transition-all ${sub === currentUser.subgroupId ? 'bg-blue-100 text-blue-600 border-2 border-blue-300' : 'bg-slate-50 text-slate-700 border-2 border-slate-200 hover:border-blue-300'}`}>
                                {sub}
                            </button>
                        ));
                    })()}
                </div>
                <button onClick={onClose} className="w-full bg-slate-100 font-bold py-3 rounded-xl mt-4 text-slate-600">닫기</button>
            </div>
        </div>
    );
};

export default SubgroupChangeModal;
