import { Injectable } from '@nestjs/common';

@Injectable()
export class SupplierRegistrationPolicy {
  private readonly supplierKeywords = ['supplier', 'suppliers', 'gas supplier'];
  private readonly registrationKeywords = [
    'register',
    'registration',
    'signup',
    'sign up',
    'join',
    'onboard',
    'apply',
  ];

  isSupplierRegistrationIntent(text: string): boolean {
    const normalized = text.toLowerCase();

    const mentionsSupplier = this.supplierKeywords.some((keyword) =>
      normalized.includes(keyword),
    );

    const mentionsRegistration = this.registrationKeywords.some((keyword) =>
      normalized.includes(keyword),
    );

    return mentionsSupplier && mentionsRegistration;
  }

  getWhatsAppOnlyMessage(lang: string = 'en'): string {
    if (lang === 'fr') {
      return '📋 Inscription fournisseur — Je vais vous poser 2 questions rapides.\n\nÀ tout moment, tapez *annuler* pour abandonner.';
    }
    return '📋 Supplier registration — I will ask you 2 quick questions.\n\nType *cancel* at any time to stop.';
  }

  /**
   * Only 2 steps now: name and gasType.
   * The phone number is taken directly from the WhatsApp account.
   */
  getStepPrompt(lang: string = 'en', step: 'name' | 'gasType'): string {
    if (lang === 'fr') {
      const prompts: Record<string, string> = {
        name: '✏️ *Étape 1/2* — Quel est votre nom complet ou le nom de votre entreprise de gaz ?',
        gasType:
          '✏️ *Étape 2/2* — Quel(s) type(s) de gaz fournissez-vous ? (ex: 6kg, 12kg, 25kg ou Tous)',
      };
      return prompts[step] ?? prompts['name'];
    }

    const prompts: Record<string, string> = {
      name: '✏️ *Step 1/2* — What is your full name or gas business name?',
      gasType:
        '✏️ *Step 2/2* — What gas type(s) do you supply? (e.g. 6kg, 12kg, 25kg, or All)',
    };
    return prompts[step] ?? prompts['name'];
  }
}
