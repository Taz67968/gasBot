import { ConfigService } from '@nestjs/config';
import { ConfigLoader } from './src/config/configuration';

// This is a simplified version to test config loading
console.log('Testing configuration loading...');
// In reality, we'd need to bootstrap the whole Nest app to test this properly
// But we can at least verify the .env file looks correct
require('dotenv').config();
console.log('DB_HOST:', process.env.DB_HOST);
console.log('DB_PORT:', process.env.DB_PORT);
console.log('REDIS_URL:', process.env.REDIS_URL);
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('PORT:', process.env.PORT);