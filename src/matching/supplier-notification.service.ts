import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { WhatsappService } from '@/whatsapp/whatsapp.service';
import { AgentStatus } from '@/common/enums/agent-status.enum';

export interface SupplierNotificationDetails {
  productName?: string;
  totalXaf?: number;
  location?: string;
  customerName?: string;
  bottleImageMediaId?: string;
  lang?: string;
}

@Injectable()
export class SupplierNotificationService {
  private readonly logger = new Logger(SupplierNotificationService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly whatsappService: WhatsappService,
  ) {}

  async notifyAllActive(orderId: string, details?: SupplierNotificationDetails): Promise<void> {
    try {
      const agentRows = await this.dataSource.query(
        `SELECT id, phone, full_name FROM agents WHERE status = $1`,
        [AgentStatus.ACTIVE],
      );

      if (!agentRows.length) {
        this.logger.warn(`No ACTIVE suppliers found to notify for order ${orderId}`);
        return;
      }

      const message = this.buildMessage(orderId, details);
      const acceptId = `direct_accept_${orderId}`;
      const declineId = `direct_decline_${orderId}`;

      for (const agent of agentRows) {
        const agentPhone = agent.phone as string | undefined;
        if (!agentPhone) {
          continue;
        }

        try {
          await this.whatsappService.sendInteractiveButtons(agentPhone, message, [
            { id: acceptId, title: 'Accept' },
            { id: declineId, title: 'Decline' },
          ]);
          this.logger.log(`Supplier notification sent to agent ${agent.id} (${agent.full_name}) for order ${orderId}`);
        } catch (sendErr: unknown) {
          const sendMessage = sendErr instanceof Error ? sendErr.message : 'Unknown error';
          this.logger.error(`Failed to send notification to supplier ${agent.id}: ${sendMessage}`);
        }
      }
    } catch (dbErr: unknown) {
      const dbMessage = dbErr instanceof Error ? dbErr.message : 'Unknown error';
      this.logger.error(`Failed to fetch suppliers for order ${orderId}: ${dbMessage}`);
    }
  }

  private buildMessage(orderId: string, details?: SupplierNotificationDetails): string {
    const shortId = orderId.slice(0, 8);
    const lang = details?.lang || 'en';

    if (details?.productName || details?.totalXaf) {
      const product = details.productName || 'Gas Cylinder';
      const total = details.totalXaf ? `${details.totalXaf} XAF` : 'TBD';
      const location = details.location || 'Customer location';
      const imageLine = details.bottleImageMediaId ? `\n🖼️ Bottle image: ${details.bottleImageMediaId}` : '';

      if (lang === 'fr') {
        return `🔔 Nouvelle demande de gaz !\nCommande: ${shortId}\nProduit: ${product}\nMontant: ${total}\nEmplacement: ${location}${imageLine}\n\nRépondez avec:\n1. "ACCEPTER" pour accepter\n2. "REFUSER" pour décliner`;
      }

      return `🔔 New gas order!\nOrder: ${shortId}\nProduct: ${product}\nTotal: ${total}\nLocation: ${location}${imageLine}\n\nReply with:\n1. "ACCEPT" to accept\n2. "DECLINE" to decline`;
    }

    if (lang === 'fr') {
      return `🔔 Nouvelle demande de gaz !\nCommande: ${shortId}\n\nRépondez avec:\n1. "ACCEPTER" pour accepter\n2. "REFUSER" pour décliner`;
    }

    return `🔔 New gas order!\nOrder ID: ${shortId}\n\nReply with:\n1. "ACCEPT" to accept\n2. "DECLINE" to decline`;
  }
}
