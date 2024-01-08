import whyIsNodeRunning from 'why-is-node-running';

let runningBundles = 0;

/**
 * @param {string} name
 * @param {number} maxWaitTime Maximum number of seconds to wait for Rollup to exit before force-exiting
 * @returns {{closeBundle(): void, buildStart(): void, name: string}}
 */
export const rollupForceExit = (name, maxWaitTime = 60) => {
    return {
        /** @this {import('rollup').PluginContext} */
        buildStart() {
            if (this.meta.watchMode) {
                return;
            }

            runningBundles++;
            this.info(`${name}: Starting build, ${runningBundles} build(s) running`);
        },
        /** @this {import('rollup').PluginContext} */
        closeBundle() {
            if (this.meta.watchMode) {
                return;
            }

            runningBundles--;
            const timeout = setTimeout(() => {
                if (runningBundles === 0) {
                    this.info(
                        `${name}: Rollup is now done, but did not exit before ${maxWaitTime} seconds, force exiting...`,
                    );
                    whyIsNodeRunning();
                    setTimeout(() => process.exit(0));
                } else {
                    this.info(
                        `${name}: Rollup is still working on another build process, waiting for ${runningBundles} running bundle(s) before force exit`,
                    );
                }
            }, maxWaitTime * 1000);
            // Allow the NodeJS process to finish without waiting for the timeout, using it only as a fallback for
            // otherwise hanging Rollup processes
            timeout.unref();
        },
        name: 'force-close',
    };
};
