import * as lsp from 'vscode-languageserver/node';
import { RequestHandler } from 'vscode-jsonrpc';

export namespace extensions.inlayHints {
    export type InlayHintsParams = {
        /**
         * The document to format.
         */
        textDocument: lsp.TextDocumentIdentifier;
        /**
         * The range to format
         */
        range?: lsp.Range;
    };

    type InlayHint = {
        text: string;
        position: lsp.Position;
        kind?: 'Type' | 'Parameter' | 'Enum';
        whitespaceBefore?: boolean;
        whitespaceAfter?: boolean;
    };

    export type InlayHintsResult = {
        inlayHints: InlayHint[];
    };

    export const type = new lsp.RequestType<
    InlayHintsParams,
    InlayHintsResult,
    lsp.TextDocumentRegistrationOptions
    >('typescript/inlayHints');

    export type HandlerSignature = RequestHandler<
    InlayHintsParams,
    InlayHintsResult | null,
    void
    >;
}
