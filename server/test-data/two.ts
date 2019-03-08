// comment line
import { Three } from "./three";
export class Two {
    callThreeTwice() {
        new Three().tada();
        new Three().tada();
    }
}