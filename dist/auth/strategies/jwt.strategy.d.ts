import { Strategy } from 'passport-jwt';
import { ConfigLoader } from "../../config/configuration";
import { TokenService } from '../services/token.service';
import { JwtPayload } from '../interfaces/jwt-payload.interface';
declare const JwtStrategy_base: new (...args: [opt: import("passport-jwt").StrategyOptionsWithRequest] | [opt: import("passport-jwt").StrategyOptionsWithoutRequest]) => Strategy & {
    validate(...args: any[]): unknown;
};
export declare class JwtStrategy extends JwtStrategy_base {
    private readonly tokenService;
    constructor(config: ConfigLoader, tokenService: TokenService);
    validate(payload: JwtPayload): Promise<JwtPayload>;
}
export {};
