import { record } from "rrweb";
declare global {
    interface Window {
        __aaRRWebRecord__?: typeof record;
    }
}
