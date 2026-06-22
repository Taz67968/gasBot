import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Order } from '@/database/entities/order.entity';
import { OrderStatus } from '@/common/enums/order-status.enum';
import { CustomerService } from '@/customer/customer.service';

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly customerService: CustomerService,
  ) {}

  async createOrderFromSession(
    phone: string,
    sessionData: Record<string, any>,
  ): Promise<Order> {
    const customer = await this.customerService.findByPhone(phone);
    if (!customer) {
      throw new Error(`Customer not found for phone ${phone}`);
    }

    const product = sessionData.selectedProduct;
    if (!product) {
      throw new Error('No product selected in session');
    }

    const location = sessionData.location;
    if (!location) {
      throw new Error('No valid location in session');
    }

    const totalXaf = product.priceXaf + 1500;

    let lat = location.lat || 0;
    let lng = location.lng || 0;
    const deliveryAddressText = location.manual
      ? String(location.manual).trim()
      : null;

    if (location.manual && !location.lat && !location.lng) {
      lat = 0;
      lng = 0;
    }

    const reference = `GB-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    const bottleImageMediaId = sessionData.bottleImageMediaId || null;

    await this.dataSource.query(
      `INSERT INTO orders (
         reference, customer_id, delivery_location, total_xaf, status,
         bottle_image_media_id, delivery_address_text, created_at, updated_at
       )
       VALUES ($1, $2, ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography, $5, $6, $7, $8, NOW(), NOW())
       RETURNING *`,
      [
        reference,
        customer.id,
        lng,
        lat,
        totalXaf,
        OrderStatus.CASH_ACKNOWLEDGED,
        bottleImageMediaId,
        deliveryAddressText,
      ],
    );

    const [orderRow] = await this.dataSource.query(
      `SELECT * FROM orders WHERE reference = $1 LIMIT 1`,
      [reference],
    );

    if (!orderRow) {
      throw new Error(`Failed to load created order ${reference}`);
    }

    const order = orderRow as Order;

    this.logger.log(`Created order ${order.id} (${reference}) for ${phone}`);

    return order;
  }
}
