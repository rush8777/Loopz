import type { ExperienceBehavior } from "../types";
export type BannerMountLocation = "body" | "document";
export declare function mountInlineBannerHost(host: HTMLElement, position: NonNullable<ExperienceBehavior["bannerPosition"]>): BannerMountLocation;
