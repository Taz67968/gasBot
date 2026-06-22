import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AgentStatus } from '@/common/enums/agent-status.enum';
import { DispatchService } from '@/dispatch/dispatch.service';
import { OrderDispatchRow, buildDispatchPayload } from './order-dispatch.helper';

type AgentRow = { id: string; phone: string; full_name: string };

@Injectable()
export class SupplierNotificationService {
  private readonly logger = new Logger(SupplierNotificationService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly dispatchService: DispatchService,
  ) {}

  async notifyAllActive(
    orderId: string,
    orderData?: OrderDispatchRow,
  ): Promise<void> {
    try {
      const raw = await this.dataSource.query(
        `SELECT id, phone, full_name FROM agents WHERE status = $1`,
        [AgentStatus.ACTIVE],
      );
      const agentRows = raw as AgentRow[];

      if (agentRows.length === 0) {
        this.logger.warn(
          `No ACTIVE suppliers found to notify for order ${orderId}`,
        );
        return;
      }

      const payloadOrder = orderData || { id: orderId, reference: orderId.slice(0, 8), total_xaf: 0 };
      const payload = buildDispatchPayload(payloadOrder);

      for (const agent of agentRows) {
        const agentPhone = agent.phone as string | undefined;
        if (!agentPhone) continue;

        try {
          await this.dispatchService.sendAssignmentOffer(
            agentPhone,
            payload,
            orderId,
          );
          this.logger.log(
            `Supplier notification sent to agent ${agent.id} (${agent.full_name}) for order ${orderId}`,
          );
        } catch (sendErr: unknown) {
          const sendMessage =
            sendErr instanceof Error ? sendErr.message : 'Unknown error';
          this.logger.error(
            `Failed to send notification to supplier ${agent.id}: ${sendMessage}`,
          );
        }
      }
    } catch (dbErr: unknown) {
      const dbMessage = dbErr instanceof Error ? dbErr.message : 'Unknown error';
      this.logger.error(
        `Failed to fetch suppliers for order ${orderId}: ${dbMessage}`,
      );
    }
  }
}
