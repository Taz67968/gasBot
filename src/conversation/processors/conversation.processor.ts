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
import { OrderService } from '@/order/order.service';
import { SupplierNotificationService } from '@/matching/supplier-notification.service';
import { fetchOrderDispatchData } from '@/matching/order-dispatch.helper';
import { SupplierRegistrationPolicy } from '../supplier-registration.policy';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AgentStatus } from '@/common/enums/agent-status.enum';

@Injectable()
export class ConversationProcessor {
  private readonly logger = new Logger(ConversationProcessor.name);

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

  private readonly deliveryFee = 1500;

  constructor(
    private readonly conversationService: ConversationService,
    private readonly customerService: CustomerService,
    private readonly whatsappService: WhatsappService,
    private readonly visionService: VisionService,
    private readonly matchingService: MatchingService,
    private readonly orderService: OrderService,
    private readonly supplierNotificationService: SupplierNotificationService,
    private readonly supplierRegistrationPolicy: SupplierRegistrationPolicy,
    _eventEmitter: EventEmitter2,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  /**
   * Small helper that resolves after `ms` milliseconds.
   * Used to hold back the reply so the user sees the typing indicator first.
   */
  private getButtonValue(content: {
    buttonId?: string;
    buttonTitle?: string;
    text?: string;
  }): string {
    return (content.buttonId || content.buttonTitle || content.text || '').trim();
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Looks up a registered supplier agent in the database by their WhatsApp phone.
   * Returns the agent row (or null if not found / not ACTIVE).
   * Used to bypass the customer registration flow for known suppliers.
   */
  private async lookupAgent(
    phone: string,
  ): Promise<{ id: string; full_name: string; status: string } | null> {
    const rows = await this.dataSource.query(
      `SELECT id, full_name, status FROM agents WHERE phone = $1 LIMIT 1`,
      [phone],
    );
    return rows.length ? rows[0] : null;
  }

  @OnEvent('message.received')
  async handleMessageReceived(event: MessageReceivedEvent): Promise<void> {
    const { from, messageId, content, type } = event;
    const incomingText =
      `${content.text || ''} ${content.buttonTitle || ''}`.trim();

    // ── Step 1: Mark the user's message as read → blue double-ticks ──────────
    await this.whatsappService.markMessageAsRead(messageId);

    // ── Step 2: Brief delay before the bot replies ────────────────────────────
    // Adjust the delay (ms) to match the expected response time of your bot.
    await this.delay(1500);

    // ── Check if the sender is a registered supplier agent in the DB ─────────
    // This runs on every message so the check survives server restarts.
    // If they are a known agent we handle them in a dedicated supplier context
    // and return early — they never enter the customer conversation flow.
    const agentRow = await this.lookupAgent(from);
    if (agentRow) {
      await this.handleKnownSupplierMessage(from, agentRow, incomingText);
      return;
    }

    // ── Global cancel/back detection ─────────────────────────────────────────
    // At any point in the conversation the user can type "cancel" or "back"
    // (in English or French) to restart.  Exceptions: known suppliers (they
    // have a fixed status page) and messages that are button replies.
    const isCancelIntent =
      !agentRow &&
      !content.buttonTitle &&
      (incomingText.toLowerCase() === 'cancel' ||
        incomingText.toLowerCase() === 'back' ||
        incomingText.toLowerCase() === 'annuler' ||
        incomingText.toLowerCase() === 'retour');

    if (isCancelIntent) {
      const lang = (await this.conversationService.getSession(from)).language;
      await this.whatsappService.sendText(
        from,
        lang === 'fr'
          ? '↩ Retour au menu principal.'
          : '↩ Going back to the start.',
      );
      await this.resetToIdle(from);
      return;
    }

    if (
      this.supplierRegistrationPolicy.isSupplierRegistrationIntent(incomingText)
    ) {
      await this.startSupplierRegistrationFlow(
        from,
        await this.conversationService.getSession(from),
      );
      return;
    }

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
      case ConversationState.ROLE_SELECT:
        await this.handleRoleSelect(from, session, content);
        break;
      case ConversationState.MAIN_MENU:
        await this.handleMainMenu(from, session, content, type);
        break;
      case ConversationState.PRODUCT_SELECT:
        await this.handleProductSelection(from, session, content, type);
        break;
      case ConversationState.CONFIRM_PRODUCT:
        await this.handleConfirmProduct(from, session, content, type);
        break;
      case ConversationState.BOTTLE_IMAGE_UPLOAD:
        await this.handleBottleImageUpload(from, session, content, type);
        break;
      case ConversationState.LOCATION_INPUT:
        await this.handleLocationInput(from, session, content);
        break;
      case ConversationState.LOCATION_SHARE_CHOICE:
        await this.handleLocationShareChoice(from, session, content);
        break;
      case ConversationState.ORDER_SUMMARY:
        await this.handleOrderSummary(from, session, content);
        break;
      case ConversationState.CASH_ACKNOWLEDGEMENT:
        await this.handleCashAcknowledgement(from, session, content);
        break;
      case ConversationState.SUPPLIER_REGISTRATION:
        await this.handleSupplierRegistrationFlow(from, session, content);
        break;
      case ConversationState.SUPPLIER_REVIEW:
        await this.handleSupplierReview(from, session, content);
        break;
      default:
        await this.resetToIdle(from);
    }
  }

  private async handleIdle(
    phone: string,
    session: ConversationSession,
  ): Promise<void> {
    // If the sender is already a registered agent, skip the customer welcome.
    const agentRow = await this.lookupAgent(phone);
    if (agentRow) {
      await this.handleKnownSupplierMessage(phone, agentRow, '');
      return;
    }

    const lang = session.language;
    const welcomeText =
      lang === 'fr'
        ? 'Bienvenue chez GasBot ! 🚀\nCommandez votre gaz en quelques clics.'
        : 'Welcome to GasBot! 🚀\nOrder your gas in a few taps.';

    await this.whatsappService.sendText(phone, welcomeText);
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

  /**
   * Handles any message from a supplier who is already registered in the DB.
   * They receive a welcome-back confirmation and are reminded they will be
   * notified automatically — they do NOT go through the customer flow.
   */
  private async handleKnownSupplierMessage(
    phone: string,
    agent: { id: string; full_name: string; status: string },
    _incomingText: string,
  ): Promise<void> {
    const isActive = agent.status === AgentStatus.ACTIVE;
    const name = agent.full_name || 'Supplier';

    if (isActive) {
      await this.whatsappService.sendText(
        phone,
        `👋 Welcome back, ${name}!\n\n✅ You are registered and *active* as a GasBot supplier.\n\nYou will receive WhatsApp notifications automatically whenever a customer in your area places an order. Just tap *Accept* when a request arrives!`,
      );
    } else {
      await this.whatsappService.sendText(
        phone,
        `👋 Hi ${name}, your supplier account is currently *${agent.status.toLowerCase()}*.\n\nPlease contact GasBot support to reactivate your account.`,
      );
    }
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
    await this.customerService.updateLanguage(phone, chosenLang);

    const welcomeText =
      chosenLang === 'fr'
        ? 'Bienvenue chez GasBot ! 🚀\nJe vous aide à obtenir du gaz ou à devenir fournisseur.'
        : 'Welcome to GasBot! 🚀\nI help you get gas or become a supplier.';

    await this.whatsappService.sendText(phone, welcomeText);
    await this.sendRoleSelection(phone, chosenLang);
    await this.conversationService.setState(
      phone,
      ConversationState.ROLE_SELECT,
    );
  }

  private async handleRoleSelect(
    phone: string,
    session: ConversationSession,
    content: MessageReceivedEvent['content'],
  ): Promise<void> {
    const lang = session.language;
    const text = (content.buttonTitle || content.text || '').toLowerCase();

    // Cancel / go back → restart from language select
    if (
      text === 'cancel' ||
      text === 'back' ||
      text === 'annuler' ||
      text === 'retour' ||
      content.buttonTitle === 'cancel_role' ||
      content.buttonTitle === '↩ Cancel' ||
      content.buttonTitle === '↩ Annuler'
    ) {
      await this.resetToIdle(phone);
      return;
    }

    if (
      text.includes('supplier') ||
      text.includes('fournisseur') ||
      text === 'role_supplier'
    ) {
      // ── Always check the DB, not the in-memory session ───────────────────────
      const existingAgent = await this.lookupAgent(phone);

      if (existingAgent) {
        await this.whatsappService.sendText(
          phone,
          lang === 'fr'
            ? `✅ Vous êtes déjà inscrit comme fournisseur (${existingAgent.full_name}). Vous recevrez automatiquement les notifications pour les nouvelles demandes de gaz.`
            : `✅ You are already registered as a supplier (${existingAgent.full_name}). You will automatically receive notifications for new gas orders.`,
        );
        await this.conversationService.setState(phone, ConversationState.IDLE);
        return;
      }
      await this.startSupplierRegistrationFlow(phone, session);
      return;
    }

    const menuText =
      lang === 'fr'
        ? 'Merci ! Voici notre menu principal :'
        : 'Thank you! Here is our main menu:';
    await this.whatsappService.sendText(phone, menuText);
    await this.sendMainMenu(phone, lang);
    await this.conversationService.setState(phone, ConversationState.MAIN_MENU);
  }

  private async sendRoleSelection(phone: string, lang: string): Promise<void> {
    const text =
      lang === 'fr' ? 'Sélectionnez votre rôle :' : 'Please select your role:';
    const hintText =
      lang === 'fr'
        ? 'Tapez *annuler* pour revenir en arrière.'
        : 'Type *cancel* to go back.';
    await this.whatsappService.sendText(phone, hintText);
    await this.whatsappService.sendInteractiveButtons(phone, text, [
      {
        id: 'role_supplier',
        title: lang === 'fr' ? 'Fournisseur' : 'Supplier',
      },
      {
        id: 'role_customer',
        title:
          lang === 'fr' ? "Client (J'ai besoin de gaz)" : 'Customer (Need gas)',
      },
      { id: 'cancel_role', title: lang === 'fr' ? '↩ Annuler' : '↩ Cancel' },
    ]);
  }

  /**
   * handleMainMenu — supports both button selection AND direct image upload.
   * When the customer sends a photo right from the menu, the AI analyses it
   * and jumps straight to order confirmation — no need to pick from the catalog.
   */
  private async handleMainMenu(
    phone: string,
    session: ConversationSession,
    content: MessageReceivedEvent['content'],
    type: string,
  ): Promise<void> {
    const lang = session.language;

    // ── Image-first path: customer uploads a photo of their gas cylinder ──────
    if (type === 'image' && content.mediaId) {
      await this.whatsappService.sendText(
        phone,
        lang === 'fr'
          ? '🤖 Analyse de votre bouteille en cours…'
          : '🤖 Analysing your gas cylinder photo…',
      );

      const analysis = await this.visionService.analyzeGasCylinder(
        content.mediaId,
      );
      if (analysis) {
        const matched = this.findMatchingProduct(analysis, lang);
        const total = matched.priceXaf + this.deliveryFee;
        const desc =
          lang === 'fr'
            ? `🤖 *Détection IA :* Bouteille ${analysis.sizeKg} kg\n\n*${matched.name}*\nPrix : ${matched.priceXaf} XAF\nLivraison : ${this.deliveryFee} XAF\n*TOTAL : ${total} XAF*\n\nConfirmez-vous ce produit ?`
            : `🤖 *AI Detected:* ${analysis.sizeKg} kg cylinder\n\n*${matched.name}*\nPrice: ${matched.priceXaf} XAF\nDelivery: ${this.deliveryFee} XAF\n*TOTAL: ${total} XAF*\n\nDo you confirm this product?`;

        await this.conversationService.setState(
          phone,
          ConversationState.CONFIRM_PRODUCT,
          {
            selectedProduct: matched,
            visionAnalysis: analysis,
            bottleImageMediaId: content.mediaId,
          },
        );
        await this.whatsappService.sendInteractiveButtons(phone, desc, [
          {
            id: 'confirm_yes',
            title: lang === 'fr' ? 'Oui, confirmer' : 'Yes, confirm',
          },
          {
            id: 'confirm_no',
            title: lang === 'fr' ? 'Non, changer' : 'No, change',
          },
        ]);
        return;
      }

      // AI failed — fall through to regular menu
      await this.whatsappService.sendText(
        phone,
        lang === 'fr'
          ? "❌ Je n'ai pas pu analyser l'image. Veuillez choisir dans le menu ci-dessous."
          : "❌ I couldn't identify the gas cylinder. Please select from the menu below.",
      );
    }

    // ── Button / text path: standard catalog selection ────────────────────────
    if (content.buttonTitle) {
      const catalog = this.catalogs[lang] || this.catalogs['en'];
      const selected = catalog.find(
        (p) =>
          p.sku === content.buttonTitle ||
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
    await this.sendMainMenu(phone, lang);
  }

  private async handleProductSelection(
    phone: string,
    session: ConversationSession,
    content: MessageReceivedEvent['content'],
    type: string,
  ): Promise<void> {
    const lang = session.language;

    if (type === 'image' && content.mediaId) {
      const analysis: GasCylinderAnalysis | null =
        await this.visionService.analyzeGasCylinder(content.mediaId);
      if (analysis) {
        const matched = this.findMatchingProduct(analysis, lang);
        await this.conversationService.setState(
          phone,
          ConversationState.CONFIRM_PRODUCT,
          {
            selectedProduct: matched,
            visionAnalysis: analysis,
            bottleImageMediaId: content.mediaId,
          },
        );
        await this.sendProductConfirmation(phone, matched, lang);
        return;
      }
      await this.whatsappService.sendText(
        phone,
        lang === 'fr'
          ? "Désolé, je n'ai pas pu analyser l'image. Veuillez choisir dans le menu."
          : "Sorry, I couldn't analyze the image. Please select from the menu.",
      );
    }

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

  private async handleConfirmProduct(
    phone: string,
    session: ConversationSession,
    content: MessageReceivedEvent['content'],
    type: string,
  ): Promise<void> {
    const lang = session.language;

    // If user sent an image (photo of cylinder) - they can upload bottle photo here
    if (type === 'image' && content.mediaId) {
      await this.conversationService.setState(
        phone,
        ConversationState.CONFIRM_PRODUCT,
        { ...session.data, bottleImageMediaId: content.mediaId },
      );
      await this.whatsappService.sendText(
        phone,
        lang === 'fr'
          ? '✅ Photo de la bouteille reçue.'
          : '✅ Bottle photo received.',
      );
      await this.sendBottleUploadOptions(phone, lang);
      return;
    }

    // Handle confirmation buttons
    const button = this.getButtonValue(content);
    if (
      button === 'confirm_yes' ||
      button.includes('Yes') ||
      button.includes('Oui')
    ) {
      await this.sendBottleUploadOptions(phone, lang);
      return;
    }

    if (
      button === 'confirm_no' ||
      button.includes('No') ||
      button.includes('Non')
    ) {
      await this.sendMainMenu(phone, lang);
      await this.conversationService.setState(
        phone,
        ConversationState.MAIN_MENU,
      );
    }
  }

  private async sendBottleUploadOptions(
    phone: string,
    lang: string,
  ): Promise<void> {
    const promptText =
      lang === 'fr'
        ? '📸 Veuillez envoyer une photo de la bouteille de gaz que vous souhaitez commander (ou choisissez ci-dessous).'
        : '📸 Please send a photo of the gas bottle you want to order (or choose below).';

    await this.whatsappService.sendInteractiveButtons(phone, promptText, [
      {
        id: 'upload_bottle_photo',
        title: lang === 'fr' ? 'Envoyer la photo' : 'Upload Photo',
      },
      { id: 'skip_bottle_photo', title: lang === 'fr' ? 'Ignorer' : 'Skip' },
      { id: 'back_to_product', title: lang === 'fr' ? '↩ Retour' : '↩ Back' },
    ]);
    await this.conversationService.setState(
      phone,
      ConversationState.BOTTLE_IMAGE_UPLOAD,
    );
  }

  private async handleBottleImageUpload(
    phone: string,
    session: ConversationSession,
    content: any,
    type: string,
  ): Promise<void> {
    const lang = session.language;

    // Handle back button → return to product confirmation
    if (
      content.buttonTitle === 'back_to_product' ||
      content.buttonTitle === '↩ Back' ||
      content.buttonTitle === '↩ Retour'
    ) {
      await this.conversationService.setState(
        phone,
        ConversationState.CONFIRM_PRODUCT,
        session.data,
      );
      const product = session.data.selectedProduct;
      if (product) {
        await this.sendProductConfirmation(phone, product, lang);
      } else {
        await this.sendMainMenu(phone, lang);
        await this.conversationService.setState(
          phone,
          ConversationState.MAIN_MENU,
        );
      }
      return;
    }

    // Handle image upload
    if (type === 'image' && content.mediaId) {
      await this.conversationService.setState(
        phone,
        ConversationState.LOCATION_INPUT,
        { ...session.data, bottleImageMediaId: content.mediaId },
      );

      await this.whatsappService.sendText(
        phone,
        lang === 'fr'
          ? '✅ Photo reçue. Maintenant, veuillez entrer votre emplacement de livraison.'
          : '✅ Photo received. Now please enter your delivery location.',
      );
      return;
    }

    // Handle skip button
    if (
      content.buttonTitle?.includes('Skip') ||
      content.buttonTitle?.includes('Ignorer')
    ) {
      await this.conversationService.setState(
        phone,
        ConversationState.LOCATION_INPUT,
      );
      await this.whatsappService.sendText(
        phone,
        lang === 'fr'
          ? 'Entrez votre emplacement de livraison (adresse, quartier, ou lieu connu):'
          : 'Enter your delivery location (address, neighborhood, or known place):',
      );
      return;
    }
  }

  private async startSupplierRegistrationFlow(
    phone: string,
    session: ConversationSession,
  ): Promise<void> {
    const lang = session.language || 'en';
    await this.whatsappService.sendText(
      phone,
      this.supplierRegistrationPolicy.getWhatsAppOnlyMessage(lang),
    );
    await this.conversationService.setState(
      phone,
      ConversationState.SUPPLIER_REGISTRATION,
      {
        supplierRegistrationStep: 'name',
        supplierRegistrationData: {},
      },
    );
    await this.whatsappService.sendText(
      phone,
      this.supplierRegistrationPolicy.getStepPrompt(lang, 'name'),
    );
  }

  private async handleSupplierRegistrationFlow(
    phone: string,
    session: ConversationSession,
    content: MessageReceivedEvent['content'],
  ): Promise<void> {
    const lang = session.language || 'en';
    const step =
      (session.data.supplierRegistrationStep as 'name' | 'gasType') || 'name';
    const currentText = (content.text || '').trim();

    if (!currentText) {
      await this.whatsappService.sendText(
        phone,
        this.supplierRegistrationPolicy.getStepPrompt(lang, step),
      );
      return;
    }

    const nextData = {
      ...(session.data.supplierRegistrationData || {}),
      ...(step === 'name' ? { name: currentText } : {}),
      ...(step === 'gasType' ? { gasType: currentText } : {}),
    };

    // After name → ask for gas type
    if (step === 'name') {
      await this.conversationService.setState(
        phone,
        ConversationState.SUPPLIER_REGISTRATION,
        {
          supplierRegistrationStep: 'gasType',
          supplierRegistrationData: nextData,
        },
      );
      await this.whatsappService.sendText(
        phone,
        this.supplierRegistrationPolicy.getStepPrompt(lang, 'gasType'),
      );
      return;
    }

    // After gasType → show review screen with Confirm / Edit
    await this.conversationService.setState(
      phone,
      ConversationState.SUPPLIER_REVIEW,
      {
        supplierRegistrationData: nextData,
      },
    );

    const reviewText =
      lang === 'fr'
        ? `📋 *Vérifiez vos informations :*\n\n👤 Nom : *${nextData.name}*\n📞 Téléphone WA : *${phone}*\n⛽ Type de gaz : *${nextData.gasType}*\n\nTout est correct ?`
        : `📋 *Review your details:*\n\n👤 Name: *${nextData.name}*\n📞 WhatsApp number: *${phone}*\n⛽ Gas type: *${nextData.gasType}*\n\nEverything correct?`;

    await this.whatsappService.sendInteractiveButtons(phone, reviewText, [
      {
        id: 'supplier_confirm',
        title: lang === 'fr' ? '✅ Confirmer' : '✅ Confirm',
      },
      { id: 'supplier_edit', title: lang === 'fr' ? '✏️ Modifier' : '✏️ Edit' },
    ]);
  }

  /**
   * Handles the supplier review step: Confirm → upsert to DB, Edit → restart.
   */
  private async handleSupplierReview(
    phone: string,
    session: ConversationSession,
    content: MessageReceivedEvent['content'],
  ): Promise<void> {
    const lang = session.language || 'en';
    const buttonId = content.buttonTitle || '';
    const regData = session.data.supplierRegistrationData || {};

    if (
      buttonId === 'supplier_edit' ||
      buttonId.toLowerCase().includes('edit') ||
      buttonId.toLowerCase().includes('modifier')
    ) {
      // Restart from name step
      await this.conversationService.setState(
        phone,
        ConversationState.SUPPLIER_REGISTRATION,
        {
          supplierRegistrationStep: 'name',
          supplierRegistrationData: {},
        },
      );
      await this.whatsappService.sendText(
        phone,
        lang === 'fr'
          ? '✏️ Recommençons. ' +
              this.supplierRegistrationPolicy.getStepPrompt(lang, 'name')
          : "✏️ Let's start over. " +
              this.supplierRegistrationPolicy.getStepPrompt(lang, 'name'),
      );
      return;
    }

    // Confirm — upsert agent to DB
    const fullName = regData.name || 'Supplier';
    const gasType = regData.gasType || null;

    await this.conversationService.setState(phone, ConversationState.IDLE, {});

    try {
      await this.dataSource.query(
        `INSERT INTO agents (phone, full_name, status, gas_type, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NOW(), NOW())
         ON CONFLICT (phone) DO UPDATE
           SET full_name  = EXCLUDED.full_name,
               status     = $3,
               gas_type   = EXCLUDED.gas_type,
               updated_at = NOW()`,
        [phone, fullName, AgentStatus.ACTIVE, gasType],
      );
      this.logger.log(
        `Supplier upserted to DB: ${phone} (${fullName}) — gas: ${gasType}`,
      );
    } catch (dbErr: any) {
      this.logger.error(
        `Failed to persist supplier ${phone}: ${dbErr.message}`,
      );
    }

    await this.whatsappService.sendText(
      phone,
      lang === 'fr'
        ? `🎉 Inscription réussie, *${fullName}* !\n\n✅ Vous êtes maintenant enregistré comme fournisseur GasBot.\n📞 Numéro : ${phone}\n⛽ Type de gaz : ${gasType || 'Non spécifié'}\n\nVous recevrez une notification WhatsApp dès qu'un client commande du gaz. Tapez simplement *Accepter* quand une demande arrive !`
        : `🎉 Registration successful, *${fullName}*!\n\n✅ You are now registered as a GasBot supplier.\n📞 Number: ${phone}\n⛽ Gas type: ${gasType || 'Not specified'}\n\nYou will receive a WhatsApp notification whenever a customer orders gas. Just tap *Accept* when a request comes in!`,
    );
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
    const lang = session.language;

    if (content.latitude && content.longitude) {
      await this.conversationService.setState(
        phone,
        ConversationState.ORDER_SUMMARY,
        {
          location: { lat: content.latitude, lng: content.longitude },
        },
      );
      await this.sendOrderSummary(phone, session);
      return;
    }

    const manualLocation = (content.text || '').trim();
    if (manualLocation) {
      await this.conversationService.setState(
        phone,
        ConversationState.LOCATION_SHARE_CHOICE,
        {
          location: { manual: manualLocation },
        },
      );

      const liveLocationPrompt =
        lang === 'fr'
          ? 'Voulez-vous partager votre position en temps réel pour aider le fournisseur à vous trouver plus facilement ?'
          : 'Would you like to share your live location to help the supplier find you more easily?';

      await this.whatsappService.sendInteractiveButtons(
        phone,
        liveLocationPrompt,
        [
          {
            id: 'share_live_location',
            title: lang === 'fr' ? 'Oui, partager' : 'Yes, share',
          },
          {
            id: 'no_live_location',
            title: lang === 'fr' ? 'Non, continuer' : 'No, continue',
          },
        ],
      );
      return;
    }

    const promptText =
      lang === 'fr'
        ? 'Veuillez entrer votre emplacement de livraison (adresse, quartier, ou lieu connu):'
        : 'Please enter your delivery location (address, neighborhood, or known place):';

    await this.whatsappService.sendText(phone, promptText);
  }

  private async handleLocationShareChoice(
    phone: string,
    session: ConversationSession,
    content: any,
  ): Promise<void> {
    const lang = session.language;

    if (content.latitude && content.longitude) {
      await this.conversationService.setState(
        phone,
        ConversationState.ORDER_SUMMARY,
        {
          location: {
            ...session.data.location,
            lat: content.latitude,
            lng: content.longitude,
          },
        },
      );
      const updatedSession = await this.conversationService.getSession(phone);
      await this.sendOrderSummary(phone, updatedSession);
      return;
    }

    const button = this.getButtonValue(content);

    if (
      button === 'share_live_location' ||
      button.includes('Yes') ||
      button.includes('Oui')
    ) {
      await this.whatsappService.sendLocationRequest(
        phone,
        lang === 'fr'
          ? 'Partagez votre position actuelle:'
          : 'Share your current location:',
      );
      return;
    }

    if (
      button === 'no_live_location' ||
      button.includes('No') ||
      button.includes('Non')
    ) {
      await this.conversationService.setState(
        phone,
        ConversationState.ORDER_SUMMARY,
      );
      const updatedSession = await this.conversationService.getSession(phone);
      await this.sendOrderSummary(phone, updatedSession);
      return;
    }

    await this.conversationService.setState(
      phone,
      ConversationState.ORDER_SUMMARY,
    );
    const updatedSession = await this.conversationService.getSession(phone);
    await this.sendOrderSummary(phone, updatedSession);
  }

  async notifySuppliers(
    supplierPhones: string[],
    orderDetails: {
      customerName: string;
      product: string;
      price: number;
      deliveryFee: number;
      location: string;
      orderId: string;
      bottleImageMediaId?: string;
      lang?: string;
    },
  ): Promise<void> {
    const lang = orderDetails.lang || 'en';

    for (const supplierPhone of supplierPhones) {
      let notificationText =
        lang === 'fr'
          ? `🔔 Nouvelle demande de gaz !\nClient: ${orderDetails.customerName}\nProduit: ${orderDetails.product}\nPrix: ${orderDetails.price} XAF + ${orderDetails.deliveryFee} XAF livraison = ${orderDetails.price + orderDetails.deliveryFee} XAF\nEmplacement: ${orderDetails.location}\n\nRépondez avec:\n1. "ACCEPTER" pour accepter\n2. "REFUSER" pour décliner`
          : `🔔 New gas request!\nCustomer: ${orderDetails.customerName}\nProduct: ${orderDetails.product}\nPrice: ${orderDetails.price} XAF + ${orderDetails.deliveryFee} XAF delivery = ${orderDetails.price + orderDetails.deliveryFee} XAF\nLocation: ${orderDetails.location}\n\nReply with:\n1. "ACCEPT" to accept\n2. "DECLINE" to decline`;

      if (orderDetails.bottleImageMediaId) {
        notificationText += `\n\n🖼️ Image de la bouteille: ${orderDetails.bottleImageMediaId}`;
      }

      await this.whatsappService.sendText(supplierPhone, notificationText);
      this.logger.log(
        `Notification sent to supplier ${supplierPhone} for order ${orderDetails.orderId}`,
      );
    }
  }

  private async handleOrderSummary(
    phone: string,
    session: ConversationSession,
    content: any,
  ): Promise<void> {
    const button = this.getButtonValue(content);
    if (
      button === 'confirm_order' ||
      button.toLowerCase().includes('confirm')
    ) {
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
    const button = this.getButtonValue(content);

    if (
      button === 'pay_confirm' ||
      button.includes('Confirm') ||
      button.includes('Pay Cash') ||
      button.includes('Confirmer')
    ) {
      let orderId = session.data.orderId;

      if (!orderId) {
        try {
          const order = await this.orderService.createOrderFromSession(
            phone,
            session.data,
          );
          orderId = order.id;
          await this.conversationService.setState(
            phone,
            ConversationState.IDLE,
            {
              orderConfirmed: true,
              paymentMethod: 'CASH_ON_DELIVERY',
              orderId,
            },
          );
          this.logger.log(`Persisted order ${orderId} for ${phone}`);
        } catch (err: any) {
          this.logger.error(
            `Failed to create order for ${phone}: ${err.message}`,
          );
          await this.whatsappService.sendText(
            phone,
            lang === 'fr'
              ? 'Désolé, une erreur est survenue lors de la création de la commande. Veuillez réessayer.'
              : 'Sorry, an error occurred while creating your order. Please try again.',
          );
          await this.resetToIdle(phone);
          return;
        }
      }

      await this.whatsappService.sendText(
        phone,
        lang === 'fr'
          ? '✅ Commande confirmée ! Un fournisseur vous contactera sous peu pour la livraison.'
          : '✅ Order confirmed! A supplier will contact you shortly for delivery.',
      );

      if (orderId) {
        try {
          this.logger.log(`Starting assignment cascade for order ${orderId}`);
          await this.matchingService.startAssignmentCascade(orderId);
          this.logger.log(
            `startAssignmentCascade completed without throwing for ${orderId}`,
          );
        } catch (err: any) {
          this.logger.error(
            `BullMQ cascade failed for ${orderId}: ${err.message}`,
          );
          this.logger.warn(
            `Falling back to direct supplier notification for order ${orderId}`,
          );

          const product = session.data.selectedProduct;
          const orderData = await fetchOrderDispatchData(
            this.dataSource,
            orderId,
          );
          await this.supplierNotificationService.notifyAllActive(
            orderId,
            orderData || {
              id: orderId,
              reference: orderId.slice(0, 8),
              total_xaf: product ? product.priceXaf + 1500 : 0,
              bottle_image_media_id: session.data.bottleImageMediaId,
              delivery_address_text: session.data.location?.manual,
            },
          );
        }
      }

      this.logger.log(`Order confirmed for ${phone} via Cash on Delivery`);
    } else {
      await this.resetToIdle(phone);
    }
  }

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
        ? 'Mode de paiement : Paiement en espèces à la livraison'
        : 'Payment method: Cash on Delivery';

    await this.whatsappService.sendInteractiveButtons(phone, text, [
      { id: 'pay_confirm', title: lang === 'fr' ? 'Confirmer' : 'Confirm' },
      { id: 'cancel', title: lang === 'fr' ? 'Annuler' : 'Cancel' },
    ]);
  }

  private findMatchingProduct(
    analysis: GasCylinderAnalysis,
    lang: string,
  ): any {
    const catalog = this.catalogs[lang] || this.catalogs['en'];
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
