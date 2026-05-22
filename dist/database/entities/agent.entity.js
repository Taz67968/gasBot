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
exports.Agent = void 0;
const typeorm_1 = require("typeorm");
const agent_status_enum_1 = require("../../common/enums/agent-status.enum");
const zone_entity_1 = require("./zone.entity");
const order_entity_1 = require("./order.entity");
const payment_entity_1 = require("./payment.entity");
let Agent = class Agent {
    id;
    phone;
    fullName;
    status;
    location;
    zoneId;
    zone;
    createdAt;
    updatedAt;
    orders;
    collectedPayments;
};
exports.Agent = Agent;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], Agent.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 20, unique: true }),
    __metadata("design:type", String)
], Agent.prototype, "phone", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 150, name: 'full_name' }),
    __metadata("design:type", String)
], Agent.prototype, "fullName", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: agent_status_enum_1.AgentStatus,
        default: agent_status_enum_1.AgentStatus.PENDING,
    }),
    __metadata("design:type", String)
], Agent.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'geography',
        spatialFeatureType: 'Point',
        srid: 4326,
        nullable: true,
    }),
    __metadata("design:type", String)
], Agent.prototype, "location", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'uuid', nullable: true, name: 'zone_id' }),
    __metadata("design:type", String)
], Agent.prototype, "zoneId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => zone_entity_1.Zone, (zone) => zone.agents, {
        nullable: true,
        onDelete: 'SET NULL',
    }),
    (0, typeorm_1.JoinColumn)({ name: 'zone_id' }),
    __metadata("design:type", zone_entity_1.Zone)
], Agent.prototype, "zone", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ type: 'timestamptz', name: 'created_at' }),
    __metadata("design:type", Date)
], Agent.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)({ type: 'timestamptz', name: 'updated_at' }),
    __metadata("design:type", Date)
], Agent.prototype, "updatedAt", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => order_entity_1.Order, (order) => order.agent),
    __metadata("design:type", Array)
], Agent.prototype, "orders", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => payment_entity_1.Payment, (payment) => payment.cashCollectedByAgent),
    __metadata("design:type", Array)
], Agent.prototype, "collectedPayments", void 0);
exports.Agent = Agent = __decorate([
    (0, typeorm_1.Entity)('agents'),
    (0, typeorm_1.Index)(['phone'], { unique: true })
], Agent);
//# sourceMappingURL=agent.entity.js.map