import { Agent } from './agent.entity';
export declare class Zone {
    id: string;
    name: string;
    polygon?: string;
    createdAt: Date;
    updatedAt: Date;
    agents: Agent[];
}
