/**
 * Base domain event for any incoming WhatsApp message.
 * Carries the minimal normalized data for downstream handlers (e.g. order creation, vision analysis).
 */
export class MessageReceivedEvent {
  constructor(
    public readonly from: string, // sender phone in E.164 without +
    public readonly messageId: string, // WhatsApp message id (wamid)
    public readonly type:
      | 'text'
      | 'button'
      | 'list'
      | 'location'
      | 'image'
      | 'video'
      | 'document'
      | 'unknown',
    public readonly content: {
      text?: string;
      buttonTitle?: string;
      listTitle?: string;
      latitude?: number;
      longitude?: number;
      mediaId?: string;
      mimeType?: string;
      caption?: string;
    },
    public readonly timestamp: string, // unix timestamp as string
    public readonly rawPayload: any, // full original message object for advanced use
  ) {}
}
