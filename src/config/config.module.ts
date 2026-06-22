import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ConfigLoader } from './configuration';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [ConfigLoader],
  exports: [ConfigLoader],
})
export class ConfigurationModule {}
