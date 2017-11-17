import * as chai from 'chai';
import * as path from 'path';
import { findPathToModule } from './modules-resolver';
import { LspDocument } from './document';

describe('document', () => {
    it('getPosition', () => {
        const doc = new LspDocument({
            text:
`Mdfsdf
dfsdfsd
dfdsf`, uri: 'foo', version: 0, languageId: 'FOO'
        })
        chai.assert.equal(doc.getPosition(0).line, 0);
        chai.assert.equal(doc.getPosition(0).character, 0);

        chai.assert.equal(doc.getPosition(doc.text.length).line, 2);
        chai.assert.equal(doc.getPosition(doc.text.length).character, 5);
    })

    it('getOffset', () => {
        const doc = new LspDocument({
            text:
`Mdfsdf
dfsdfsd
dfdsf`, uri: 'foo', version: 0, languageId: 'FOO'
        })
        chai.assert.equal(doc.offsetAt({ line: 0, character: 4 }), 4);
        chai.assert.equal(doc.offsetAt({ line: 1, character: 4 }), 11);
        chai.assert.equal(doc.offsetAt({ line: 2, character: 4 }), 19);
    })

    it('getPosition with empty doc', () => {
        const doc = new LspDocument({
            text: '', uri: 'foo', version: 0, languageId: 'FOO'
        })
        chai.assert.equal(doc.getPosition(0).line, 0);
        chai.assert.equal(doc.getPosition(0).character, 0);
    })
})