import { beforeEach, describe, expect, it } from 'vitest';
import {
  captureLaunchAttribution,
  getLaunchAttribution,
  getLaunchInstitution,
  institutionForLaunchSource,
  isExactInstitutionEmail,
} from '@/app/lib/launch/attribution';

beforeEach(() => sessionStorage.clear());

describe('campus launch attribution', () => {
  it('stores Palomar attribution under the institution-neutral key', () => {
    const captured = captureLaunchAttribution(new URLSearchParams({
      source: 'palomar_landing',
      campaign: 'palomar_autumn_2026',
      launch_session: 'session_123',
    }));

    expect(captured).toMatchObject({ source: 'palomar_landing', campaign: 'palomar_autumn_2026', launchSession: 'session_123' });
    expect(getLaunchInstitution()).toMatchObject({ name: 'Palomar', emailDomain: 'student.palomar.edu' });
    expect(sessionStorage.getItem('ums_launch_attribution')).toContain('palomar_landing');
  });

  it('migrates compatible UCD session attribution without losing it', () => {
    sessionStorage.setItem('ums_ucd_launch_attribution', JSON.stringify({ source: 'ucd_landing', campaign: 'legacy' }));
    expect(getLaunchAttribution()).toMatchObject({ source: 'ucd_landing', campaign: 'legacy' });
    expect(sessionStorage.getItem('ums_ucd_launch_attribution')).toBeNull();
    expect(sessionStorage.getItem('ums_launch_attribution')).toContain('ucd_landing');
  });

  it('rejects lookalike domains and unknown campaign sources', () => {
    const palomar = institutionForLaunchSource('palomar_landing')!;
    expect(isExactInstitutionEmail('student@student.palomar.edu', palomar)).toBe(true);
    expect(isExactInstitutionEmail('student@mail.student.palomar.edu', palomar)).toBe(false);
    expect(isExactInstitutionEmail('student@student.palomar.edu.evil.example', palomar)).toBe(false);
    expect(institutionForLaunchSource('palomar-lookalike')).toBeNull();
  });
});
