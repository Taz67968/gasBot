import { DataSource } from 'typeorm';

import { Agent } from './entities/agent.entity';
import { Customer } from './entities/customer.entity';
import { Order } from './entities/order.entity';
import { Payment } from './entities/payment.entity';
import { Zone } from './entities/zone.entity';
import { InitialGasbotSchema1747914000000 } from './migrations/1747914000000-InitialGasbotSchema';
import { AddMissingColumns1749516000000 } from './migrations/1749516000000-AddMissingColumns';

const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USERNAME ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'postgres',
  database: process.env.DB_NAME ?? 'gasbot',
  entities: [Agent, Customer, Order, Payment, Zone],
  migrations: [InitialGasbotSchema1747914000000, AddMissingColumns1749516000000],
  migrationsTableName: 'typeorm_migrations',
  logging: process.env.NODE_ENV !== 'production',
  ssl:
    process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging'
      ? { rejectUnauthorized: false }
      : false,
  extra:
    process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging'
      ? { ssl: { rejectUnauthorized: false } }
      : {},
});

export default AppDataSource;
