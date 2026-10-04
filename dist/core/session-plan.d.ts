import { type RequestStateCodec } from '@modelcontextprotocol/server';
export type SessionGoal = 'read' | 'interact' | 'account';
export type SessionNeed = 'long_running' | 'protected_text' | 'human_captcha' | 'persist_profile' | 'mobile' | 'location';
export interface SessionPlanSettings {
    timeout?: number;
    useProxy?: true | {
        geolocation: {
            country: string;
        };
    };
    solveCaptcha?: true;
    stealthConfig?: {
        autoCaptchaSolving: false;
    };
    optimizeBandwidth?: {
        blockImages: true;
        blockMedia: true;
        blockStylesheets: false;
    };
    deviceConfig?: {
        device: 'mobile';
    };
    persistProfile?: true;
}
export interface SessionPlanState {
    v: 1;
    origin: string;
    goal: SessionGoal;
    settings: SessionPlanSettings;
    accountContext: boolean;
    profileSelection?: {
        mode: 'automatic';
        profileId: string;
    } | {
        mode: 'required';
        availableProfiles: number;
    };
}
export interface RecipeInput {
    origin: string;
    goal: SessionGoal;
    needs: SessionNeed[];
    minutes?: number;
    country?: string;
    configuredTimeoutMs: number;
    accountMaxMs?: number;
}
export interface Recipe {
    recommendedTool: 'steel_scrape' | 'steel_session_create';
    state?: SessionPlanState;
    rationale: string[];
    warnings: Array<{
        code: string;
        message: string;
    }>;
}
export declare function createSessionPlanCodec(secret: string, principal: string): RequestStateCodec<SessionPlanState>;
/** Pure recipe table: settings are added only for explicit semantic needs. */
export declare function recommendSession(input: RecipeInput): Recipe;
