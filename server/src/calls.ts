
import * as tsp from 'typescript/lib/protocol';
import * as lsp from 'vscode-languageserver';
import * as lspcalls from './lsp-protocol.calls.proposed';
import { TspClient } from './tsp-client';
import { CommandTypes } from './tsp-command-types';
import { uriToPath, toLocation, asRange, Range, toSymbolKind, pathToUri } from './protocol-translation';

export async function computeCallers(tspClient: TspClient, args: lsp.TextDocumentPositionParams): Promise<lspcalls.CallsResult> {
    const nullResult = { calls: [] };
    const contextDefinition = await getDefinition(tspClient, args);
    if (!contextDefinition) {
        return nullResult;
    }
    const contextSymbol = await findEnclosingSymbol(tspClient, contextDefinition);
    if (!contextSymbol) {
        return nullResult;
    }
    const callerReferences = await findNonDefinitionReferences(tspClient, contextDefinition);
    const calls: lspcalls.Call[] = [];
    for (const callerReference of callerReferences) {
        const symbol = await findEnclosingSymbol(tspClient, callerReference);
        if (!symbol) {
            continue;
        }
        const location = toLocation(callerReference, undefined);
        calls.push({
            location,
            symbol
        });
    }
    return { calls, symbol: contextSymbol };
}
export type DocumentProvider = (file: string) => lsp.TextDocument | undefined;
export async function computeCallees(tspClient: TspClient, args: lsp.TextDocumentPositionParams, documentProvider: DocumentProvider): Promise<lspcalls.CallsResult> {
    const nullResult = { calls: [] };
    const contextDefinition = await getDefinition(tspClient, args);
    if (!contextDefinition) {
        return nullResult;
    }
    const contextSymbol = await findEnclosingSymbol(tspClient, contextDefinition);
    if (!contextSymbol) {
        return nullResult;
    }
    const outgoingCallReferences = await findOutgoingCalls(tspClient, contextSymbol, documentProvider);
    const calls: lspcalls.Call[] = [];
    for (const reference of outgoingCallReferences) {
        const definitionReferences = await findDefinitionReferences(tspClient, reference);
        const definitionReference = definitionReferences[0];
        if (!definitionReference) {
            continue;
        }
        const definitionSymbol = await findEnclosingSymbol(tspClient, definitionReference);
        if (!definitionSymbol) {
            continue;
        }
        const location = toLocation(reference, undefined);
        calls.push({
            location,
            symbol: definitionSymbol
        });
    }
    return { calls, symbol: contextSymbol };
}

async function findOutgoingCalls(tspClient: TspClient, contextSymbol: lspcalls.DefinitionSymbol, documentProvider: DocumentProvider): Promise<tsp.FileSpan[]> {

    /**
     * The TSP does not provide call references.
     * As long as we are not able to access the AST in a tsserver plugin and return the information necessary as metadata to the reponse,
     * we need to test possible calls.
     */
    const computeCallCandidates = (document: lsp.TextDocument, range: lsp.Range): lsp.Range[] => {
        const symbolText = document.getText(range);
        const regex = /\W([$_a-zA-Z0-9\u{00C0}-\u{E007F}]+)(<.*>)?\(/gmu; // Example: matches `candidate` in " candidate()", "Foo.candidate<T>()", etc.
        let match = regex.exec(symbolText);
        const candidates: { identifier: string; start: number; end: number; }[] = []
        while (match) {
            const identifier = match[1];
            if (identifier) {
                const start = match.index + match[0].indexOf(identifier);
                const end = start + identifier.length;
                candidates.push({ identifier, start, end });
            }
            match = regex.exec(symbolText);
        }
        const offset = document.offsetAt(range.start);
        const candidateRanges = candidates.map(c => lsp.Range.create(document.positionAt(offset + c.start), document.positionAt(offset + c.end)));
        return candidateRanges;
    }

    /**
     * This function tests a candidate and returns a locaion for a valid call.
     */
    const validateCall = async (file: string, candidateRange: lsp.Range): Promise<tsp.FileSpan | undefined> => {
        const tspPosition = { line: candidateRange.start.line + 1, offset: candidateRange.start.character + 1 };
        const references = await findNonDefinitionReferences(tspClient, { file, start: tspPosition, end: tspPosition });
        for (const reference of references) {
        const tspPosition = { line: candidateRange.start.line + 1, offset: candidateRange.start.character + 1 };
            if (tspPosition.line === reference.start.line) {
                return reference;
            }
        }
    }

    const calls: tsp.FileSpan[] = [];
    const file = uriToPath(contextSymbol.location.uri)!;
    const document = documentProvider(file);
    if (!document) {
        return calls;
    }
    const candidateRanges = computeCallCandidates(document, contextSymbol.location.range);
    for (const candidateRange of candidateRanges) {
        const call = await validateCall(file, candidateRange);
        if (call) {
            calls.push(call);
        }
    }
    return calls;
}

async function getDefinition(tspClient: TspClient, args: lsp.TextDocumentPositionParams): Promise<tsp.FileSpan | undefined> {
    const file = uriToPath(args.textDocument.uri);
    if (!file) {
        return undefined;
    }
    const definitionResult = await tspClient.request(CommandTypes.Definition, {
        file,
        line: args.position.line + 1,
        offset: args.position.character + 1
    });
    return definitionResult.body ? definitionResult.body[0] : undefined;
}

async function findEnclosingSymbol(tspClient: TspClient, args: tsp.FileSpan): Promise<lspcalls.DefinitionSymbol | undefined> {
    const file = args.file;
    const response = await tspClient.request(CommandTypes.NavTree, { file });
    const tree = response.body;
    if (!tree || !tree.childItems) {
        return undefined;
    }
    const pos = lsp.Position.create(args.start.line - 1, args.start.offset - 1);
    const symbol = await findEnclosingSymbolInTree(tree, lsp.Range.create(pos, pos));
    if (!symbol) {
        return undefined;
    }
    const uri = pathToUri(file, undefined);
    return lspcalls.DefinitionSymbol.create(uri, symbol);
}

async function findEnclosingSymbolInTree(parent: tsp.NavigationTree, range: lsp.Range): Promise<lsp.DocumentSymbol | undefined> {
    const inSpan = (span: tsp.TextSpan) => !!Range.intersection(asRange(span), range);
    const inTree = (tree: tsp.NavigationTree) => tree.spans.some(span => inSpan(span));

    let candidate = inTree(parent) ? parent : undefined;
    outer: while (candidate) {
        const children = candidate.childItems || [];
        for (const child of children) {
            if (inTree(child)) {
                candidate = child;
                continue outer;
            }
        }
        break;
    }
    if (!candidate) {
        return undefined;
    }
    const span = candidate.spans.find(span => inSpan(span))!;
    const spanRange = asRange(span);
    let selectionRange = spanRange;
    if (candidate.nameSpan) {
        const nameRange = asRange(candidate.nameSpan);
        if (Range.intersection(spanRange, nameRange)) {
            selectionRange = nameRange;
        }
    }
    return {
        name: candidate.text,
        kind: toSymbolKind(candidate.kind),
        range: spanRange,
        selectionRange: selectionRange
    }
}

async function findDefinitionReferences(tspClient: TspClient, args: tsp.FileSpan): Promise<tsp.FileSpan[]> {
    return (await findReferences(tspClient, args)).filter(ref => ref.isDefinition);
}

async function findNonDefinitionReferences(tspClient: TspClient, args: tsp.FileSpan): Promise<tsp.FileSpan[]> {
    return (await findReferences(tspClient, args)).filter(ref => !ref.isDefinition);
}

async function findReferences(tspClient: TspClient, args: tsp.FileSpan): Promise<tsp.ReferencesResponseItem[]> {
    const file = args.file;
    const result = await tspClient.request(CommandTypes.References, {
        file,
        line: args.start.line,
        offset: args.start.offset
    });
    if (!result.body) {
        return [];
    }
    return (result.body.refs as any);
}
