export type OrdinaryButtonContext = "widget" | "guide";
export type OrdinaryButtonActionType = "dismiss" | "open_url" | "track_event" | "next_step" | "previous_step";
export type OrdinaryButtonActionConfig = {
    type: "dismiss" | "next_step" | "previous_step";
} | {
    type: "open_url";
    url: string;
} | {
    type: "track_event";
    eventName: string;
};
export type OrdinaryButtonAction = OrdinaryButtonActionConfig & {
    id: string;
};
export interface OrdinaryButtonActionDefinition {
    type: OrdinaryButtonActionType;
    label: string;
    contexts: readonly OrdinaryButtonContext[];
    requiredConfiguration: readonly ("url" | "eventName")[];
    runtimeRequirement: "dismiss" | "navigation" | "analytics" | "guide_advance" | "guide_back";
}
export declare const ORDINARY_BUTTON_ACTIONS: readonly OrdinaryButtonActionDefinition[];
export declare const ORDINARY_ACTION_ID_PATTERN: RegExp;
export declare function ordinaryButtonActionsFor(context: OrdinaryButtonContext): readonly OrdinaryButtonActionDefinition[];
export declare function ordinaryButtonActionErrors(value: unknown, context: OrdinaryButtonContext): string[];
/**
 * Resolve the map key (functional identity) and stored configuration into the
 * runtime shape. Older structured documents may redundantly store `id`; source
 * authored documents intentionally do not. A conflicting stored ID is invalid.
 */
export declare function resolveOrdinaryButtonAction(id: string, value: unknown, context: OrdinaryButtonContext): OrdinaryButtonAction | null;
