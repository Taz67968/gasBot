import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Customer } from '@/database/entities/customer.entity';

/**
 * CustomerService
 * Handles user profile persistence with strong guarantees against race conditions.
 */
@Injectable()
export class CustomerService {
  private readonly logger = new Logger(CustomerService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Atomically finds or creates a customer using INSERT ... ON CONFLICT DO NOTHING.
   * This eliminates duplicate key race conditions under high concurrency (e.g. multiple messages at once).
   */
  async findOrCreate(
    phoneNumber: string,
    defaultLanguage = 'en',
  ): Promise<Customer> {
    const query = `
      INSERT INTO customers (phone, language, created_at, updated_at)
      VALUES ($1, $2, NOW(), NOW())
      ON CONFLICT (phone) DO NOTHING
    `;

    // Execute the upsert (does nothing if exists)
    await this.dataSource.query(query, [phoneNumber, defaultLanguage]);

    // Always fetch the (now guaranteed) record
    const [customer] = await this.dataSource.query(
      `SELECT * FROM customers WHERE phone = $1 LIMIT 1`,
      [phoneNumber],
    );

    if (!customer) {
      // Extremely rare fallback
      this.logger.warn(
        `Race condition fallback triggered for phone ${phoneNumber}`,
      );
      return this.findOrCreate(phoneNumber, defaultLanguage);
    }

    return customer as Customer;
  }

  /**
   * Updates the customer's preferred language (called when user selects language).
   */
  async updateLanguage(phoneNumber: string, language: string): Promise<void> {
    await this.dataSource.query(
      `UPDATE customers SET language = $1, updated_at = NOW() WHERE phone = $2`,
      [language, phoneNumber],
    );
    this.logger.debug(`Language updated for ${phoneNumber} → ${language}`);
  }

  async findByPhone(phoneNumber: string): Promise<Customer | null> {
    const [customer] = await this.dataSource.query(
      `SELECT * FROM customers WHERE phone = $1 LIMIT 1`,
      [phoneNumber],
    );
    return customer || null;
  }
}
