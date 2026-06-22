import { SupplierRegistrationPolicy } from './supplier-registration.policy';

describe('SupplierRegistrationPolicy', () => {
  const policy = new SupplierRegistrationPolicy();

  it('detects supplier registration intents', () => {
    expect(
      policy.isSupplierRegistrationIntent('I want to register a gas supplier'),
    ).toBe(true);
    expect(
      policy.isSupplierRegistrationIntent('supplier signup on whatsapp'),
    ).toBe(true);
  });

  it('ignores unrelated messages', () => {
    expect(policy.isSupplierRegistrationIntent('hello there')).toBe(false);
  });

  it('returns a WhatsApp-only instruction message', () => {
    const message = policy.getWhatsAppOnlyMessage('en');

    expect(message).toContain('registration');
    expect(message.toLowerCase()).toContain('supplier');
  });

  it('returns the right prompts for each supplier-registration step', () => {
    expect(policy.getStepPrompt('en', 'name')).toContain('name');
    expect(policy.getStepPrompt('en', 'gasType')).toContain('gas type');
  });
});
