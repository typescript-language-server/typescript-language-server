import { statSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

export function findPathToModule(dir: string, moduleNames: string[]): string | undefined {
    const stat = statSync(dir);
    if (stat.isDirectory()) {
        const candidates = moduleNames.map(moduleName => resolve(dir, moduleName));
        const modulePath = candidates.find(existsSync);
        if (modulePath) {
            return modulePath;
        }
    }
    const parent = resolve(dir, '..');
    if (parent !== dir) {
        return findPathToModule(parent, moduleNames);
    }
}
