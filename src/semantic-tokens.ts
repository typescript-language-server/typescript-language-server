import { LspDocument } from './document.js';

// copied from https://github.com/microsoft/TypeScript/blob/main/src/services/classifier2020.ts
enum TokenEncodingConsts {
    typeOffset = 8,
    modifierMask = (1 << typeOffset) - 1
}

/**
 * Transforms the semantic token spans given by the ts-server into lsp compatible spans.
 * @param doc the document we are operating on
 * @param spans the spans given by ts-server
 * @returns lsp compatible spans
 */
export function transformSpans(doc: LspDocument, spans: number[]) : number[] {
    const lspSpans: number[] = [];
    let previousLine = 0;
    let previousTokenStart = 0;
    for (let i = 0; i < spans.length; i += 3) {
        // ts-server sends us a packed array that contains 3 elements per 1 token:
        // 1. the start position of the token
        // 2. length of the token
        // 3. token type & modifier packed into a bitset
        const tokenStart = spans[i];
        const tokenLength = spans[i + 1];
        const tokenTypeBitSet = spans[i + 2];

        // unpack the modifier and type: https://github.com/microsoft/TypeScript/blob/main/src/services/classifier2020.ts#L45
        const tokenModifier = tokenTypeBitSet & TokenEncodingConsts.modifierMask;
        const tokenType = (tokenTypeBitSet >> TokenEncodingConsts.typeOffset) - 1;

        const { line, character } = doc.positionAt(tokenStart);
        // lsp spec requires 5 elements per token instead of 3:
        // 1. delta line number (relative to the previous line)
        // 2. delta token start position (relative to the previous token)
        // 3. length of the token
        // 4. type of the token (e.g. function, comment, enum etc.)
        // 5. token modifier (static, async etc.)
        const deltaLine = line - previousLine;
        const deltaStart = previousLine === line ? character - previousTokenStart : character;

        lspSpans.push(deltaLine, deltaStart, tokenLength, tokenType, tokenModifier);

        previousTokenStart = character;
        previousLine = line;
    }
    return lspSpans;
}
