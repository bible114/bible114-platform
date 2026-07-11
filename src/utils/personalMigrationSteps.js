export const PERSONAL_MIGRATION_STEPS = ['start', 'email', 'credentials', 'roster', 'user'];

export const nextPersonalMigrationStep = currentStep => {
    const index = PERSONAL_MIGRATION_STEPS.indexOf(currentStep);
    return index >= 0 && index < PERSONAL_MIGRATION_STEPS.length - 1
        ? PERSONAL_MIGRATION_STEPS[index + 1]
        : 'complete';
};
