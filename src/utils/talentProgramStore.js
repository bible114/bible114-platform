import { db } from './firebase';

export const loadTalentProgramsStrict = async orgIds => {
    const ids = Array.from(new Set((Array.isArray(orgIds) ? orgIds : [])
        .map(value => String(value || '').trim())
        .filter(Boolean)));
    const docs = await Promise.all(ids.map(orgId => (
        db.collection('churches').doc(orgId).collection('settings').doc('talentShop').get()
    )));
    return Object.fromEntries(ids.map((orgId, index) => [
        orgId,
        docs[index].exists ? docs[index].data() : null,
    ]));
};
