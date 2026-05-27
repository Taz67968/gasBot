import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import {
  ConversationService,
  ConversationSession,
} from '../conversation.service';
import { ConversationState } from '../enums/conversation-state.enum';
import { CustomerService } from '@/customer/customer.service';
import { WhatsappService } from '@/whatsapp/whatsapp.service';
import { VisionService, GasCylinderAnalysis } from '@/vision/vision.service';
import { MessageReceivedEvent } from '@/whatsapp/events/message-received.event';
import { MatchingService } from '@/matching/matching.service';

/**
 * ConversationProcessor
 * Central state machine engine for the GasBot conversational flow.
 * All routing, state transitions, and business logic live here.
 * Triggered by incoming WhatsApp messages via domain events.
 */
@Injectable()
export class ConversationProcessor {
  private readonly logger = new Logger(ConversationProcessor.name);

  // Simple localized catalog (in real system this would come from DB or config service)
  private readonly catalogs: Record<string, any[]> = {
    en: [
      {
        sku: 'GAS_6KG',
        name: '6kg Gas Cylinder (Standard)',
        priceXaf: 4500,
        sizeKg: 6,
      },
      {
        sku: 'GAS_12KG',
        name: '12kg Gas Cylinder (Standard)',
        priceXaf: 8500,
        sizeKg: 12,
      },
      {
        sku: 'GAS_25KG',
        name: '25kg Gas Cylinder (Commercial)',
        priceXaf: 16500,
        sizeKg: 25,
      },
    ],
    fr: [
      {
        sku: 'GAS_6KG',
        name: 'Bouteille de Gaz 6kg (Standard)',
        priceXaf: 4500,
        sizeKg: 6,
      },
      {
        sku: 'GAS_12KG',
        name: 'Bouteille de Gaz 12kg (Standard)',
        priceXaf: 8500,
        sizeKg: 12,
      },
      {
        sku: 'GAS_25KG',
        name: 'Bouteille de Gaz 25kg (Commercial)',
        priceXaf: 16500,
        sizeKg: 25,
      },
    ],
  };

  private readonly deliveryFee = 1500; // fixed delivery surcharge in XAF

  constructor(
    private readonly conversationService: ConversationService,
    private readonly customerService: CustomerService,
    private readonly whatsappService: WhatsappService,
    private readonly visionService: VisionService,
    private readonly matchingService: MatchingService,
    _eventEmitter: EventEmitter2, // consumed by @OnEvent decorator
  ) {}

  /**
   * Main entry point — listens to all incoming WhatsApp messages.
   */
  @OnEvent('message.received')
  async handleMessageReceived(event: MessageReceivedEvent): Promise<void> {
    const { from, content, type } = event;

    // Ensure customer exists (race-condition safe)
    await this.customerService.findOrCreate(from);

    const session = await this.conversationService.getSession(from);

    this.logger.log(
      `Processing message for ${from} in state ${session.state} (type=${type})`,
    );

    switch (session.state) {
      case ConversationState.IDLE:
        await this.handleIdle(from, session);
        break;

      case ConversationState.LANGUAGE_SELECT:
        await this.handleLanguageSelect(from, session, content);
        break;

      case ConversationState.MAIN_MENU:
        await this.handleMainMenu(from, session, content);
        break;

      case ConversationState.PRODUCT_SELECT:
      case ConversationState.CONFIRM_PRODUCT:
        await this.handleProductSelection(from, session, content, type);
        break;

      case ConversationState.LOCATION_INPUT:
        await this.handleLocationInput(from, session, content);
        break;

      case ConversationState.ORDER_SUMMARY:
        await this.handleOrderSummary(from, session, content);
        break;

      case ConversationState.CASH_ACKNOWLEDGEMENT:
        await this.handleCashAcknowledgement(from, session, content);
        break;

      default:
        await this.resetToIdle(from);
    }
  }

  // === STATE HANDLERS ===

  private async handleIdle(
    phone: string,
    session: ConversationSession,
  ): Promise<void> {
    const lang = session.language;

    const welcomeText =
      lang === 'fr'
        ? 'Bienvenue chez GasBot ! 🚀\nCommandez votre gaz en quelques clics.'
        : 'Welcome to GasBot! 🚀\nOrder your gas in a few taps.';

    await this.whatsappService.sendText(phone, welcomeText);

    // Simple language selection buttons
    await this.whatsappService.sendInteractiveButtons(
      phone,
      lang === 'fr' ? 'Choisissez votre langue :' : 'Choose your language:',
      [
        { id: 'lang_en', title: 'English' },
        { id: 'lang_fr', title: 'Français' },
      ],
    );

    await this.conversationService.setState(
      phone,
      ConversationState.LANGUAGE_SELECT,
    );
  }

  private async handleLanguageSelect(
    phone: string,
    session: ConversationSession,
    content: MessageReceivedEvent['content'],
  ): Promise<void> {
    let chosenLang = session.language;

    if (content.buttonTitle) {
      if (
        content.buttonTitle.toLowerCase().includes('english') ||
        content.buttonTitle === 'lang_en'
      ) {
        chosenLang = 'en';
      } else if (
        content.buttonTitle.toLowerCase().includes('français') ||
        content.buttonTitle === 'lang_fr'
      ) {
        chosenLang = 'fr';
      }
    }

    await this.conversationService.setLanguage(phone, chosenLang);

    // Update customer profile in DB as well
    await this.customerService.updateLanguage(phone, chosenLang);

    const menuText =
      chosenLang === 'fr'
        ? 'Merci ! Voici notre menu principal :'
        : 'Thank you! Here is our main menu:';

    await this.whatsappService.sendText(phone, menuText);
    await this.sendMainMenu(phone, chosenLang);

    await this.conversationService.setState(phone, ConversationState.MAIN_MENU);
  }

  private async handleMainMenu(
    phone: string,
    session: ConversationSession,
    content: MessageReceivedEvent['content'],
  ): Promise<void> {
    const lang = session.language;
    const catalog = this.catalogs[lang] || this.catalogs['en'];

    if (content.buttonTitle) {
      // User selected a product from menu
      const selected = catalog.find((p) =>
        p.name.includes(content.buttonTitle || ''),
      );
      if (selected) {
        await this.conversationService.setState(
          phone,
          ConversationState.CONFIRM_PRODUCT,
          {
            selectedProduct: selected,
          },
        );
        await this.sendProductConfirmation(phone, selected, lang);
        return;
      }
    }

    // Re-show menu if no valid selection
    await this.sendMainMenu(phone, lang);
  }

  private async handleProductSelection(
    phone: string,
    session: ConversationSession,
    content: MessageReceivedEvent['content'],
    type: string,
  ): Promise<void> {
    const lang = session.language;

    // If user sent an image (photo of cylinder)
    if (type === 'image' && content.mediaId) {
      const analysis: GasCylinderAnalysis | null =
        await this.visionService.analyzeGasCylinder(content.mediaId);

      if (analysis) {
        // Map vision result to a product
        const matched = this.findMatchingProduct(analysis, lang);
        await this.conversationService.setState(
          phone,
          ConversationState.CONFIRM_PRODUCT,
          {
            selectedProduct: matched,
            visionAnalysis: analysis,
          },
        );
        await this.sendProductConfirmation(phone, matched, lang);
        return;
      } else {
        await this.whatsappService.sendText(
          phone,
          lang === 'fr'
            ? "Désolé, je n'ai pas pu analyser l'image. Veuillez choisir dans le menu."
            : "Sorry, I couldn't analyze the image. Please select from the menu.",
        );
      }
    }

    // Text/button selection
    if (content.buttonTitle || content.text) {
      const selectedSku = content.buttonTitle || content.text;
      const catalog = this.catalogs[lang];
      const product = catalog.find(
        (p) =>
          p.sku === selectedSku ||
          p.name.toLowerCase().includes((selectedSku || '').toLowerCase()),
      );

      if (product) {
        await this.conversationService.setState(
          phone,
          ConversationState.CONFIRM_PRODUCT,
          { selectedProduct: product },
        );
        await this.sendProductConfirmation(phone, product, lang);
      } else {
        await this.whatsappService.sendText(
          phone,
          'Invalid selection. Please choose again.',
        );
        await this.sendMainMenu(phone, lang);
      }
    }
  }

  private async sendProductConfirmation(
    phone: string,
    product: any,
    lang: string,
  ): Promise<void> {
    const text =
      lang === 'fr'
        ? `Vous avez sélectionné : ${product.name} — ${product.priceXaf} XAF\nConfirmez-vous ?`
        : `You selected: ${product.name} — ${product.priceXaf} XAF\nDo you confirm?`;

    await this.whatsappService.sendInteractiveButtons(phone, text, [
      {
        id: 'confirm_yes',
        title: lang === 'fr' ? 'Oui, confirmer' : 'Yes, confirm',
      },
      {
        id: 'confirm_no',
        title: lang === 'fr' ? 'Non, changer' : 'No, change',
      },
    ]);

    await this.conversationService.setState(
      phone,
      ConversationState.CONFIRM_PRODUCT,
      { selectedProduct: product },
    );
  }

  private async handleLocationInput(
    phone: string,
    session: ConversationSession,
    content: any,
  ): Promise<void> {
    if (content.latitude && content.longitude) {
      await this.conversationService.setState(
        phone,
        ConversationState.ORDER_SUMMARY,
        {
          location: { lat: content.latitude, lng: content.longitude },
        },
      );
      await this.sendOrderSummary(phone, session);
    } else {
      await this.whatsappService.sendText(
        phone,
        'Please share your location using the location button.',
      );
    }
  }

  private async handleOrderSummary(
    phone: string,
    session: ConversationSession,
    content: any,
  ): Promise<void> {
    if (content.buttonTitle?.toLowerCase().includes('confirm')) {
      await this.conversationService.setState(
        phone,
        ConversationState.CASH_ACKNOWLEDGEMENT,
      );
      await this.sendCashAcknowledgement(phone, session);
    } else {
      await this.conversationService.setState(
        phone,
        ConversationState.LOCATION_INPUT,
      );
      await this.whatsappService.sendLocationRequest(
        phone,
        'Please share your delivery location:',
      );
    }
  }

  private async handleCashAcknowledgement(
    phone: string,
    session: ConversationSession,
    content: any,
  ): Promise<void> {
    const lang = session.language;

    if (
      content.buttonTitle?.includes('Confirm') ||
      content.buttonTitle?.includes('Pay Cash')
    ) {
      // Mark as cash confirmed
      await this.conversationService.setState(phone, ConversationState.IDLE, {
        orderConfirmed: true,
        paymentMethod: 'CASH_ON_DELIVERY',
      });

      await this.whatsappService.sendText(
        phone,
        lang === 'fr'
          ? '✅ Commande confirmée ! Un agent vous contactera sous peu pour la livraison.'
          : '✅ Order confirmed! An agent will contact you shortly for delivery.',
      );

      // Trigger the real-time geospatial driver assignment cascade
      if (session.data.orderId) {
        await this.matchingService.startAssignmentCascade(session.data.orderId);
      } else {
        this.logger.warn(
          `No orderId found in session for ${phone} — cascade not started`,
        );
      }

      this.logger.log(`Order confirmed for ${phone} via Cash on Delivery`);
    } else {
      await this.resetToIdle(phone);
    }
  }

  // === HELPER METHODS ===

  private async sendMainMenu(phone: string, lang: string): Promise<void> {
    const catalog = this.catalogs[lang] || this.catalogs['en'];
    const buttons = catalog.map((p) => ({
      id: p.sku,
      title: p.name.split('(')[0].trim(),
    }));

    await this.whatsappService.sendInteractiveButtons(
      phone,
      lang === 'fr'
        ? 'Choisissez votre bouteille de gaz :'
        : 'Select your gas cylinder:',
      buttons,
    );
  }

  private async sendOrderSummary(
    phone: string,
    session: ConversationSession,
  ): Promise<void> {
    const product = session.data.selectedProduct;
    const total = product.priceXaf + this.deliveryFee;

    const summary =
      session.language === 'fr'
        ? `Résumé de commande :\n${product.name}\nPrix produit : ${product.priceXaf} XAF\nFrais de livraison : ${this.deliveryFee} XAF\nTOTAL : ${total} XAF`
        : `Order Summary:\n${product.name}\nProduct: ${product.priceXaf} XAF\nDelivery fee: ${this.deliveryFee} XAF\nTOTAL: ${total} XAF`;

    await this.whatsappService.sendText(phone, summary);

    await this.whatsappService.sendInteractiveButtons(
      phone,
      'Ready to confirm?',
      [
        { id: 'confirm_order', title: 'Confirm Order' },
        { id: 'change', title: 'Change Details' },
      ],
    );

    await this.conversationService.setState(
      phone,
      ConversationState.ORDER_SUMMARY,
    );
  }

  private async sendCashAcknowledgement(
    phone: string,
    session: ConversationSession,
  ): Promise<void> {
    const lang = session.language;
    const text =
      lang === 'fr'
        ? 'Mode de paiement : Paiement en espèces à la livraison (Cash on Delivery)'
        : 'Payment method: Cash on Delivery';

    await this.whatsappService.sendInteractiveButtons(phone, text, [
      {
        id: 'pay_confirm',
        title:
          lang === 'fr'
            ? 'Confirmer la commande (Paiement à la livraison)'
            : 'Confirm Order (Pay Cash on Delivery)',
      },
      { id: 'cancel', title: lang === 'fr' ? 'Annuler' : 'Cancel' },
    ]);
  }

  private findMatchingProduct(
    analysis: GasCylinderAnalysis,
    lang: string,
  ): any {
    const catalog = this.catalogs[lang] || this.catalogs['en'];
    // Simple matching by size
    return (
      catalog.find((p) => Math.abs(p.sizeKg - analysis.sizeKg) < 2) ||
      catalog[0]
    );
  }

  private async resetToIdle(phone: string): Promise<void> {
    await this.conversationService.setState(phone, ConversationState.IDLE);
    await this.handleIdle(
      phone,
      await this.conversationService.getSession(phone),
    );
  }
}
