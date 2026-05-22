"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthModule = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const passport_1 = require("@nestjs/passport");
const configuration_1 = require("../config/configuration");
const token_service_1 = require("./services/token.service");
const jwt_strategy_1 = require("./strategies/jwt.strategy");
let AuthModule = class AuthModule {
};
exports.AuthModule = AuthModule;
exports.AuthModule = AuthModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        imports: [
            passport_1.PassportModule.register({ defaultStrategy: 'jwt' }),
            jwt_1.JwtModule.registerAsync({
                inject: [configuration_1.ConfigLoader],
                useFactory: (config) => ({
                    secret: config.jwtSecret,
                    signOptions: {
                        algorithm: 'HS256',
                        expiresIn: '8h',
                    },
                }),
            }),
        ],
        providers: [token_service_1.TokenService, jwt_strategy_1.JwtStrategy],
        exports: [token_service_1.TokenService, jwt_1.JwtModule, passport_1.PassportModule],
    })
], AuthModule);
//# sourceMappingURL=auth.module.js.map