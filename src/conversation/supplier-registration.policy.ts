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
      return 'L’inscription des fournisseurs doit être effectuée uniquement via ce même bot WhatsApp. Répondez ici avec votre nom, votre numéro et le type de gaz à fournir pour démarrer la demande.';
    }

    return 'Supplier registration must be done only on this WhatsApp bot. Reply here with your supplier name, phone number, and the gas type you supply to start the registration request.';
  }

  getStepPrompt(lang: string = 'en', step: 'name' | 'phone' | 'gasType'): string {
    if (lang === 'fr') {
      const prompts = {
        name: 'Étape 1/3 : Envoyez le nom du fournisseur.',
        phone: 'Étape 2/3 : Envoyez le numéro WhatsApp du fournisseur.',
        gasType: 'Étape 3/3 : Envoyez le type de gaz fourni par le fournisseur.',
      } as const;

      return prompts[step];
    }

    const prompts = {
      name: 'Step 1/3: Please send the supplier name.',
      phone: 'Step 2/3: Please send the supplier phone number.',
      gasType: 'Step 3/3: Please send the gas type supplied by the supplier.',
    } as const;

    return prompts[step];
  }
}
