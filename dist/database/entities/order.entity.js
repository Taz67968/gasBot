"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Order = void 0;
const typeorm_1 = require("typeorm");
const order_status_enum_1 = require("../../common/enums/order-status.enum");
const customer_entity_1 = require("./customer.entity");
const agent_entity_1 = require("./agent.entity");
const payment_entity_1 = require("./payment.entity");
let Order = class Order {
    id;
    reference;
    customerId;
    customer;
    agentId;
    agent;
    status;
    deliveryLocation;
    totalXaf;
    acknowledgedAt;
    createdAt;
    updatedAt;
    payment;
};
exports.Order = Order;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], Order.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 50, unique: true }),
    __metadata("design:type", String)
], Order.prototype, "reference", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'uuid', name: 'customer_id' }),
    __metadata("design:type", String)
], Order.prototype, "customerId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => customer_entity_1.Customer, (customer) => customer.orders, {
        onDelete: 'CASCADE',
    }),
    (0, typeorm_1.JoinColumn)({ name: 'customer_id' }),
    __metadata("design:type", customer_entity_1.Customer)
], Order.prototype, "customer", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'uuid', nullable: true, name: 'agent_id' }),
    __metadata("design:type", String)
], Order.prototype, "agentId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => agent_entity_1.Agent, (agent) => agent.orders, {
        nullable: true,
        onDelete: 'SET NULL',
    }),
    (0, typeorm_1.JoinColumn)({ name: 'agent_id' }),
    __metadata("design:type", agent_entity_1.Agent)
], Order.prototype, "agent", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: order_status_enum_1.OrderStatus,
        default: order_status_enum_1.OrderStatus.PENDING,
    }),
    __metadata("design:type", String)
], Order.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'geography',
        spatialFeatureType: 'Point',
        srid: 4326,
        nullable: false,
        name: 'delivery_location',
    }),
    __metadata("design:type", String)
], Order.prototype, "deliveryLocation", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'integer', name: 'total_xaf' }),
    __metadata("design:type", Number)
], Order.prototype, "totalXaf", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'timestamptz', nullable: true, name: 'acknowledged_at' }),
    __metadata("design:type", Date)
], Order.prototype, "acknowledgedAt", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ type: 'timestamptz', name: 'created_at' }),
    __metadata("design:type", Date)
], Order.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)({ type: 'timestamptz', name: 'updated_at' }),
    __metadata("design:type", Date)
], Order.prototype, "updatedAt", void 0);
__decorate([
    (0, typeorm_1.OneToOne)(() => payment_entity_1.Payment, (payment) => payment.order, { cascade: true }),
    __metadata("design:type", payment_entity_1.Payment)
], Order.prototype, "payment", void 0);
exports.Order = Order = __decorate([
    (0, typeorm_1.Entity)('orders'),
    (0, typeorm_1.Index)(['reference'], { unique: true })
], Order);
//# sourceMappingURL=order.entity.js.map