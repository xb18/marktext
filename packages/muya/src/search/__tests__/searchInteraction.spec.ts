// @vitest-environment happy-dom

import type Content from '../../block/base/content';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Muya } from '../../muya';
import { createTextSelectionState } from '../../selection/state';

let muya: Muya;

beforeEach(() => {
    window.MUYA_VERSION = 'test';
    const host = document.createElement('div');
    document.body.appendChild(host);
    muya = new Muya(host, { markdown: 'apple apricot apple\n\nbanana apple\n\nlast apple\n' });
    muya.init();
});

afterEach(() => {
    muya.destroy();
    muya.domNode.remove();
    document.getSelection()?.removeAllRanges();
});

function blocks(): Content[] {
    const result: Content[] = [];
    muya.editor.scrollPage!.depthFirstTraverse((node) => {
        if (node.isContent())
            result.push(node);
    });
    return result;
}

function activeMatch() {
    const search = muya.editor.searchModule;
    const match = search.matches[search.index];
    return { text: match.block.text, start: match.start, end: match.end };
}

describe('find interaction', () => {
    it('keeps the original search start while the query and options change', () => {
        blocks()[0].setCursor(6, 6);
        muya.search('ap', { selectHighlight: true });
        expect(activeMatch().start).toBe(6);

        muya.search('apple', { selectHighlight: true });
        expect(activeMatch().start).toBe(14);
        muya.search('ap', { selectHighlight: true, isCaseSensitive: true });
        expect(activeMatch().start).toBe(6);
    });

    it('updates the search start after an explicit editor selection change', () => {
        const [first, second] = blocks();
        first.setCursor(0, 0);
        muya.search('apple', { selectHighlight: true });
        second.setCursor(0, 0);
        muya.search('ap', { selectHighlight: true });
        expect(activeMatch()).toEqual({ text: 'banana apple', start: 7, end: 9 });
    });

    it('navigates from a manually moved caret and wraps in both directions', () => {
        const [first, second] = blocks();
        muya.search('apple', { selectHighlight: true });
        second.setCursor(0, 0);
        muya.find('next');
        expect(activeMatch().text).toBe('banana apple');
        first.setCursor(0, 0);
        muya.find('previous');
        expect(activeMatch().text).toBe('last apple');
        muya.find('next');
        expect(activeMatch()).toEqual({ text: 'apple apricot apple', start: 0, end: 5 });
    });

    it('uses document-order edges for a backward selection spanning blocks', () => {
        const [first, second] = blocks();
        muya.search('apple', { selectHighlight: true });
        const selection = createTextSelectionState(
            { block: second, path: second.path, offset: 12 },
            { block: first, path: first.path, offset: 6 },
        );
        muya.editor.selection.setSelection(selection);
        muya.find('next');
        expect(activeMatch().text).toBe('last apple');
        muya.editor.selection.setSelection(selection);
        muya.find('previous');
        expect(activeMatch()).toEqual({ text: 'apple apricot apple', start: 0, end: 5 });
    });

    it('opening or hiding highlights leaves the editor selection unchanged', () => {
        const second = blocks()[1];
        second.setCursor(2, 2);
        const selection = muya.editor.selection.getSelectionState();
        muya.search('apple');
        expect(muya.editor.selection.getSelectionState()).toEqual(selection);
        muya.setSearchVisible(false);
        expect(muya.editor.selection.getSelectionState()).toEqual(selection);
        expect(muya.editor.searchModule.value).toBe('apple');
        expect(muya.domNode.querySelectorAll('.mu-highlight, .mu-selection')).toHaveLength(0);
        muya.setSearchVisible(true);
        expect(muya.editor.selection.getSelectionState()).toEqual(selection);
    });

    it('continues the retained query while the find bar is hidden', () => {
        muya.search('apple', { selectHighlight: true });
        muya.setSearchVisible(false);
        blocks()[1].setCursor(0, 0);
        muya.find('next');
        expect(activeMatch().text).toBe('banana apple');
        expect(muya.editor.selection.getTextSelection()?.anchor.offset).toBe(7);
        expect(muya.domNode.querySelectorAll('.mu-highlight, .mu-selection')).toHaveLength(0);
    });

    it('retains the find input focus when selecting a result', () => {
        const input = document.createElement('input');
        document.body.appendChild(input);
        input.focus();
        muya.search('apple', { selectHighlight: true });
        expect(document.activeElement).toBe(input);
        muya.find('next');
        expect(document.activeElement).toBe(input);
        input.remove();
    });

    it('refreshes matches after editing without moving the caret', async () => {
        muya.search('apple', { selectHighlight: true });
        blocks()[1].text = 'banana pear';
        await vi.waitFor(() => expect(muya.editor.searchModule.matches).toHaveLength(3));
    });
});
