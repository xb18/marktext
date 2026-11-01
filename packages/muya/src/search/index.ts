import type Content from '../block/base/content';
import type TreeNode from '../block/base/treeNode';
import type { IHighlight } from '../inlineRenderer/types';
import type { Muya } from '../muya';
import type { ISelectionEndpoint } from '../selection/types';
import type { IMatch, IReplaceOption, ISearchOption } from './types';
import { unfoldAllSections } from '../block/folding';
import { DEFAULT_SEARCH_OPTIONS } from '../config';
import { contentPath, resolveContent } from '../selection/state';
import { SelectionType } from '../selection/types';
import { buildRegexValue, matchString } from '../utils/search';

export class Search {
    private _query: string = '';
    private _options: ISearchOption = { ...DEFAULT_SEARCH_OPTIONS };
    // Query edits reuse this origin; selecting a search result must not advance it.
    private _startPosition: ISelectionEndpoint | null = null;
    private _updating = false;
    private _visible = true;
    public matches: IMatch[] = [];
    public index: number = -1;

    get value() {
        return this._query;
    }

    private get _scrollPage() {
        return this._muya.editor.scrollPage;
    }

    constructor(private _muya: Muya) {
        _muya.eventCenter.on('selection-change', ({ selection, docChanged }) => {
            if (this._updating)
                return;
            if (selection?.kind === SelectionType.TEXT)
                this._startPosition = { path: [...selection.focus.path], offset: selection.focus.offset };
            if (docChanged)
                this.refresh();
        });
    }

    private _comparePosition(a: ISelectionEndpoint, b: ISelectionEndpoint): number {
        const first = resolveContent(this._muya, a.path)?.domNode;
        const second = resolveContent(this._muya, b.path)?.domNode;
        if (first && second && first !== second) {
            const order = first.compareDocumentPosition(second);
            if (order & Node.DOCUMENT_POSITION_FOLLOWING)
                return -1;
            if (order & Node.DOCUMENT_POSITION_PRECEDING)
                return 1;
        }
        for (let i = 0; i < Math.min(a.path.length, b.path.length); i++) {
            if (a.path[i] !== b.path[i]) {
                return typeof a.path[i] === 'number' && typeof b.path[i] === 'number'
                    ? Number(a.path[i]) - Number(b.path[i])
                    : String(a.path[i]).localeCompare(String(b.path[i]));
            }
        }
        return a.path.length - b.path.length || a.offset - b.offset;
    }

    private _selectMatch(match: IMatch) {
        const focused = document.activeElement;
        match.block.setCursor(match.start, match.end);
        if (focused instanceof HTMLElement && !this._muya.domNode.contains(focused))
            focused.focus({ preventScroll: true });
    }

    private _findMatchIndex(position: ISelectionEndpoint, action: 'next' | 'previous', skipEmpty = false): number {
        for (let i = action === 'next' ? 0 : this.matches.length - 1; i >= 0 && i < this.matches.length; i += action === 'next' ? 1 : -1) {
            const match = this.matches[i];
            const offset = action === 'next' ? match.start : match.end;
            const order = this._comparePosition({ path: contentPath(match.block), offset }, position);
            if (skipEmpty && match.start === match.end && order === 0)
                continue;
            if (action === 'next' ? order >= 0 : order <= 0)
                return i;
        }
        return action === 'next' ? 0 : this.matches.length - 1;
    }

    /** Hiding highlights keeps the query available for keyboard navigation. */
    setVisible(visible: boolean): this {
        if (visible === this._visible)
            return this;
        const selection = this._muya.editor.selection.getSelectionState();
        this._updating = true;
        try {
            this._visible = visible;
            this._updateMatches();
            if (selection)
                this._muya.editor.selection.setSelection(selection);
        }
        finally {
            this._updating = false;
        }
        return this;
    }

    // Drop match state when the document is replaced (e.g. a tab switch), so
    // stale matches don't reference the previous document's blocks (#1932).
    reset() {
        this._query = '';
        this._options = { ...DEFAULT_SEARCH_OPTIONS };
        this.matches = [];
        this.index = -1;
        this._startPosition = null;
    }

    // `blocks` limits the re-render to those blocks; omitted, every block with
    // a match is re-rendered.
    private _updateMatches(isClear = false, blocks?: Set<Content>) {
        const { matches, index } = this;
        let i;
        const len = matches.length;
        const matchesMap = new Map<Content, IHighlight[]>();

        for (i = 0; i < len; i++) {
            const { block, start, end } = matches[i];
            if (blocks && !blocks.has(block))
                continue;

            const active = i === index;
            const highlight: IHighlight = { start, end, active };
            const highlights = matchesMap.get(block);

            if (matchesMap.has(block) && Array.isArray(highlights)) {
                highlights.push(highlight);
                matchesMap.set(block, highlights);
            }
            else {
                matchesMap.set(block, [highlight]);
            }
        }

        for (const [block, highlights] of matchesMap.entries()) {
            if (!block.outMostBlock)
                continue;

            const isActive = highlights.some(h => h.active);

            block.update(undefined, isClear || !this._visible ? [] : highlights);

            if (block.parent?.active && !isActive)
                block.blurHandler();

            if (isActive && !isClear && this._visible) {
                block.focusHandler();
            }
        }
    }

    private _innerReplace(matches: IMatch[], replacementOf: (match: IMatch) => string) {
        if (!matches.length)
            return;

        let tempText = '';
        let lastBlock = matches[0].block;
        let lastEnd = 0;

        for (const match of matches) {
            const { start, end, block } = match;
            if (lastBlock !== block) {
                if (lastBlock)
                    lastBlock.text = tempText + lastBlock.text.substring(lastEnd);

                tempText = '';
                lastEnd = 0;
                lastBlock = block;
            }

            tempText += block.text.substring(lastEnd, start);
            tempText += replacementOf(match);
            lastEnd = end;
        }

        lastBlock.text = tempText + lastBlock.text.substring(lastEnd);
    }

    replace(replaceValue: string, opt: IReplaceOption = { isSingle: true, isRegexp: false }) {
        if (!this._muya.canMutate)
            return this;
        const { isSingle, isRegexp, ...rest } = opt;
        const options = Object.assign({}, this._options, rest, { isRegexp });
        const { matches, index } = this;
        const value = this._query;

        if (matches.length) {
            this._innerReplace(
                isSingle ? [matches[index]] : matches,
                match => (isRegexp ? buildRegexValue(match, replaceValue) : replaceValue),
            );
            const highlightIndex = index < matches.length - 1 ? index : index - 1;

            this.search(value, {
                ...options,
                highlightIndex: isSingle ? highlightIndex : -1,
            });
        }

        return this;
    }

    find(action: 'previous' | 'next'): this {
        const { matches } = this;
        let { index } = this;
        const len = matches.length;

        if (!len)
            return this;

        const selection = this._muya.editor.selection.getTextSelection();
        if (selection) {
            const { anchor, focus } = selection;
            const forward = this._comparePosition(anchor, focus) <= 0;
            const position = action === 'next'
                ? (forward ? focus : anchor)
                : (forward ? anchor : focus);
            index = this._findMatchIndex(position, action, true);
        }
        else {
            index = action === 'next' ? index + 1 : index - 1;
        }

        if (index < 0)
            index = len - 1;

        if (index >= len)
            index = 0;

        const changed = new Set<Content>([matches[index].block]);
        const prev = matches[this.index];
        if (prev)
            changed.add(prev.block);

        this.index = index;

        this._updating = true;
        try {
            this._updateMatches(true, changed);
            this._updateMatches(false, changed);
            this._selectMatch(matches[index]);
        }
        finally {
            this._updating = false;
        }

        return this;
    }

    search(query: string, opts: ISearchOption = {}) {
        const selection = this._muya.editor.selection.getSelectionState();
        if (!this._startPosition && selection?.kind === SelectionType.TEXT)
            this._startPosition = { path: [...selection.focus.path], offset: selection.focus.offset };
        this._updating = true;
        try {
            return this._search(query, opts);
        }
        finally {
            this._updating = false;
        }
    }

    private _search(query: string, opts: ISearchOption) {
        const selection = this._muya.editor.selection.getSelectionState();
        const matches: IMatch[] = [];
        this._options = Object.assign({}, DEFAULT_SEARCH_OPTIONS, opts);
        this._query = query;
        const { highlightIndex, selectHighlight } = this._options;
        let index = -1;

        const prevActiveMatch = this.matches[this.index];

        if (query && this._scrollPage)
            unfoldAllSections(this._scrollPage);

        this._updateMatches(true);

        if (query) {
            this._scrollPage?.depthFirstTraverse((block: TreeNode) => {
                if (block.isContent()) {
                    const { text } = block;
                    if (text && typeof text === 'string') {
                        const strMatches = matchString(text, query, this._options);
                        matches.push(
                            ...strMatches.map(({ index, match, subMatches }) => {
                                return {
                                    block,
                                    start: index,
                                    end: index + match.length,
                                    match,
                                    subMatches,
                                };
                            }),
                        );
                    }
                }
            });
        }

        if (typeof highlightIndex === 'number' && highlightIndex !== -1) {
            index = Math.min(highlightIndex, matches.length - 1);
        }
        else if (matches.length) {
            const start = this._startPosition;
            index = start ? matches.findIndex(match => this._comparePosition({ path: contentPath(match.block), offset: match.start }, start) >= 0) : 0;
            if (index < 0)
                index = 0;
            if (!selectHighlight && selection?.kind === SelectionType.TEXT) {
                const selectedIndex = matches.findIndex(match => this._comparePosition({ path: contentPath(match.block), offset: match.start }, selection.anchor) === 0
                    && this._comparePosition({ path: contentPath(match.block), offset: match.end }, selection.focus) === 0);
                if (selectedIndex >= 0)
                    index = selectedIndex;
            }
        }

        Object.assign(this, { matches, index });

        this._updateMatches();

        if (selectHighlight) {
            const activeMatch = matches[index] ?? prevActiveMatch;
            if (activeMatch?.block.outMostBlock) {
                this._selectMatch(activeMatch);
            }
        }
        else if (selection) {
            this._muya.editor.selection.setSelection(selection);
        }

        return this;
    }

    /** Re-run the active query on the blocks a full re-render just rebuilt. */
    refresh(): this {
        const { _query: query, _options: options, index: highlightIndex } = this;

        if (!query) {
            return this;
        }

        this.search(query, { ...options, highlightIndex, selectHighlight: false });

        this._muya.eventCenter.emit('search-refreshed', this);

        return this;
    }
}
