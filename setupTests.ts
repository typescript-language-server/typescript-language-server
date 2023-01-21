const suppressedErrorMessages = [
    /^Using Typescript version .*/,
];

const getMessage = (args: unknown[]) => typeof args[2] === 'string' ? args[2] : null;

const consoleError = console.error;
console.error = (...args: unknown[]) => {
    const msg = getMessage(args);
    if (msg && suppressedErrorMessages.find(regex => regex.test(msg))) {
        return;
    }
    // Call real console.error
    consoleError(...args);
};
