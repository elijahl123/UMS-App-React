import { test } from '@playwright/test';
import { runStudyPlanRecoveryScenario } from './support/recoveryScenario';

test('previews, applies, and undoes Study Plan Recovery Mode on mobile', async ({ page }, testInfo) => {
  const visualPrefix = process.env.RECOVERY_VISUAL_AUDIT
    ? `/tmp/ums-recovery-${testInfo.project.name}${process.env.RECOVERY_VISUAL_DARK ? '-dark' : ''}`
    : undefined;
  await runStudyPlanRecoveryScenario(page, visualPrefix);
});
