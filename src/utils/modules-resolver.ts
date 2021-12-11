import * as fs from 'fs';
import * as path from 'path';

export function findPathToModule(dir: string, moduleNames: string[]): string | undefined {
    const stat = fs.statSync(dir);
    if (stat.isDirectory()) {
        const candidates = moduleNames.map(moduleName => path.resolve(dir, moduleName));
        const modulePath = candidates.find(fs.existsSync);
        if (modulePath) {
            return modulePath;
        }
    }
    const parent = path.resolve(dir, '..');
    if (parent !== dir) {
        return findPathToModule(parent, moduleNames);
    }
}
