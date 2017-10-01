import * as fs from 'fs';
import * as paths from 'path';

export function findPathToModule(dir: string, moduleName: string): string|undefined {
    const stat = fs.statSync(dir)
    if (stat.isDirectory()) {
        const candidate = paths.resolve(dir, 'node_modules', moduleName)
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }
    const parent = paths.resolve(dir, '..')
    if (parent !== dir) {
        return findPathToModule(paths.resolve(dir, '..'), moduleName)
    }
    return undefined
}