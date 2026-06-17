import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { WhatsappService } from '@/whatsapp/whatsapp.service';
import { AgentStatus } from '@/common/enums/agent-status.enum';

const REMINDER_INTERVAL_MS = 24 * 60 * 60 * 1000;

interface AgentRow {
  id: string;
  phone: string;
  full_name: string;
}

@Injectable()
export class SupplierReminderService implements OnModuleInit {
  private readonly logger = new Logger(SupplierReminderService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly whatsappService: WhatsappService,
  ) {
    setInterval(() => this.sendReminders(), REMINDER_INTERVAL_MS);
  }

  async onModuleInit() {
    this.logger.log(
      'Supplier reminder service initialized — sending first batch immediately',
    );
    await this.sendReminders();
  }

  private async sendReminders(): Promise<void> {
    try {
      const agentRows = await this.dataSource.query(
        `SELECT id, phone, full_name FROM agents WHERE status = $1 AND phone IS NOT NULL`,
        [AgentStatus.ACTIVE],
      );

      if (!agentRows.length) {
        this.logger.warn('No active suppliers to remind');
        return;
      }

      const text =
        'Hi! Stay ready for orders: please reply to this message with "OK" to keep receiving new gas order notifications.';

      for (const agent of agentRows) {
        const phone = agent.phone as string | undefined;
        if (!phone) continue;

        try {
          await this.whatsappService.sendText(phone, text);
          this.logger.log(
            `Session reminder sent to agent ${agent.id} (${agent.full_name}) at ${phone}`,
          );
        } catch (err: any) {
          this.logger.warn(
            `Failed to send reminder to ${phone}: ${err.message || err}`,
          );
        }
      }
    } catch (err: any) {
      this.logger.error(
        `Failed to run supplier reminders: ${err.message || err}`,
      );
    }
  }
}
