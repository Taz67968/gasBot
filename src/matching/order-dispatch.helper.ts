import { DataSource } from 'typeorm';
import { DispatchPayload } from '@/dispatch/dispatch.service';

export interface OrderDispatchRow {
  id: string;
  reference: string;
  total_xaf: number;
  bottle_image_media_id?: string;
  delivery_address_text?: string;
  lat?: number;
  lng?: number;
}

export async function fetchOrderDispatchData(
  dataSource: DataSource,
  orderId: string,
): Promise<OrderDispatchRow | null> {
  const [row] = await dataSource.query(
    `SELECT
       o.id,
       o.reference,
       o.total_xaf,
       o.bottle_image_media_id,
       o.delivery_address_text,
       ST_Y(o.delivery_location::geometry) AS lat,
       ST_X(o.delivery_location::geometry) AS lng
     FROM orders o
     WHERE o.id = $1`,
    [orderId],
  );

  return row || null;
}

export function buildDispatchPayload(
  order: OrderDispatchRow,
  estimatedDistanceMeters?: number,
): DispatchPayload {
  const lat = order.lat ? parseFloat(String(order.lat)) : undefined;
  const lng = order.lng ? parseFloat(String(order.lng)) : undefined;
  const hasGps = lat !== undefined && lng !== undefined && (lat !== 0 || lng !== 0);

  const payload: DispatchPayload = {
    orderReference: order.reference,
    gasType: 'Gas Cylinder',
    sizeKg: 12,
    amountXaf: parseInt(String(order.total_xaf), 10) || 0,
    orderId: order.id,
  };

  if (estimatedDistanceMeters !== undefined) {
    payload.estimatedDistanceMeters = estimatedDistanceMeters;
  }
  if (order.delivery_address_text) {
    payload.manualAddress = order.delivery_address_text;
  }
  if (order.bottle_image_media_id) {
    payload.bottleImageMediaId = order.bottle_image_media_id;
  }
  if (hasGps && lat !== undefined && lng !== undefined) {
    payload.deliveryLat = lat;
    payload.deliveryLng = lng;
  }

  return payload;
}
