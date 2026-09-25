import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';
import { PublicBookingController } from './public-booking.controller';

@Module({
  imports: [BillingModule],
  controllers: [AppointmentsController, PublicBookingController],
  providers: [AppointmentsService],
})
export class AppointmentsModule {}
