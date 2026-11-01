<template>
  <div
    v-show="showSearch"
    class="search-bar"
  >
    <button
      type="button"
      class="plain-button left-arrow"
      :aria-label="t('menu.edit.replace')"
      :aria-expanded="type === 'replace'"
      @click="toggleSearchType"
    >
      <el-icon
        :size="14"
        :class="{ 'arrow-right': type === 'search' }"
      >
        <ArrowDown />
      </el-icon>
    </button>
    <div class="right-controls">
      <section class="search">
        <div
          class="input-wrapper input-focus-border"
          :class="{ error: !!searchErrorMsg }"
        >
          <input
            ref="search"
            v-model="searchValue"
            type="text"
            :placeholder="t('search.searchPlaceholder')"
            @keydown="handleEnterKey"
          >
          <div class="controls">
            <span class="search-result">{{ highlightIndex + 1 }} /
              {{ highlightCount }}
            </span>
            <icon-tooltip :content="t('search.caseSensitive')">
              <button
                type="button"
                class="plain-button is-case-sensitive"
                :class="{ active: isCaseSensitive }"
                :aria-label="t('search.caseSensitive')"
                :aria-pressed="isCaseSensitive"
                @click="toggleCtrl('isCaseSensitive')"
              >
                <FindCaseIcon aria-hidden="true" />
              </button>
            </icon-tooltip>
            <icon-tooltip :content="t('search.wholeWord')">
              <button
                type="button"
                class="plain-button is-whole-word"
                :class="{ active: isWholeWord }"
                :aria-label="t('search.wholeWord')"
                :aria-pressed="isWholeWord"
                @click="toggleCtrl('isWholeWord')"
              >
                <FindWordIcon aria-hidden="true" />
              </button>
            </icon-tooltip>
            <icon-tooltip :content="t('search.useRegex')">
              <button
                type="button"
                class="plain-button is-regex"
                :class="{ active: isRegexp }"
                :aria-label="t('search.useRegex')"
                :aria-pressed="isRegexp"
                @click="toggleCtrl('isRegexp')"
              >
                <FindRegexIcon aria-hidden="true" />
              </button>
            </icon-tooltip>
          </div>
          <div
            v-if="searchErrorMsg"
            class="error-msg"
          >
            {{ searchErrorMsg }}
          </div>
        </div>
        <div class="button-group">
          <icon-tooltip :content="t('menu.edit.findPrevious')">
            <button
              type="button"
              class="button right"
              :aria-label="t('menu.edit.findPrevious')"
              @click="find('previous')"
            >
              <el-icon :size="14">
                <ArrowUp />
              </el-icon>
            </button>
          </icon-tooltip>
          <icon-tooltip :content="t('menu.edit.findNext')">
            <button
              type="button"
              class="button"
              :aria-label="t('menu.edit.findNext')"
              @click="find('next')"
            >
              <el-icon :size="14">
                <ArrowDown />
              </el-icon>
            </button>
          </icon-tooltip>
        </div>
      </section>
      <section
        v-if="type === 'replace'"
        class="replace"
      >
        <div class="input-wrapper replace-input input-focus-border">
          <input
            v-model="replaceValue"
            type="text"
            :placeholder="t('search.replacementPlaceholder')"
          >
        </div>
        <div class="button-group">
          <icon-tooltip :content="t('search.replaceAll')">
            <button
              type="button"
              class="button right"
              :aria-label="t('search.replaceAll')"
              @click="replace(false)"
            >
              <el-icon :size="14">
                <RefreshRight />
              </el-icon>
            </button>
          </icon-tooltip>
          <icon-tooltip :content="t('search.replaceSingle')">
            <button
              type="button"
              class="button"
              :aria-label="t('search.replaceSingle')"
              @click="replace(true)"
            >
              <el-icon :size="14">
                <Switch />
              </el-icon>
            </button>
          </icon-tooltip>
        </div>
      </section>
    </div>
    <icon-tooltip :content="`${t('dialog.close')} (Escape)`">
      <button
        type="button"
        class="plain-button close-search"
        :aria-label="`${t('dialog.close')} (Escape)`"
        aria-keyshortcuts="Escape"
        @click="hideSearch"
      >
        <el-icon :size="14">
          <Close />
        </el-icon>
      </button>
    </icon-tooltip>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import bus from '../../bus'
import FindCaseIcon from '@/assets/icons/searchIcons/iconCase.svg'
import FindWordIcon from '@/assets/icons/searchIcons/iconWord.svg'
import FindRegexIcon from '@/assets/icons/searchIcons/iconRegex.svg'
import { useEditorStore } from '@/store/editor'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import debounce from 'lodash/debounce'
import { ArrowDown, ArrowUp, Close, RefreshRight, Switch } from '@element-plus/icons-vue'
import IconTooltip from '@/components/iconTooltip/index.vue'

const { t } = useI18n()

const editorStore = useEditorStore()

const showSearch = ref(false)
const isCaseSensitive = ref(false)
const isWholeWord = ref(false)
const isRegexp = ref(false)
const type = ref('search')
const searchValue = ref('')
const replaceValue = ref('')
const searchErrorMsg = ref('')
const search = ref<HTMLInputElement | null>(null)
let prefilling = false

const { currentFile } = storeToRefs(editorStore)
watch(
  () => currentFile.value?.readOnly,
  (value) => {
    if (value) hideSearch()
  }
)
const searchMatches = computed(() => currentFile.value?.searchMatches)

watch(searchValue, () => {
  if (!showSearch.value || prefilling) return
  debouncedSearchFn()
}, { flush: 'sync' })

const prefillFromSelection = () => {
  const state = searchMatches.value
  const selected = state?.selectedText
  const activeMatch = state?.matches[state.index]
  const selectedResult = state?.value === searchValue.value && activeMatch !== null &&
    typeof activeMatch === 'object' && 'match' in activeMatch && activeMatch.match === selected
  // Search-selected text must not replace the retained expression with a literal match.
  if (selected && !selectedResult && !document.activeElement?.closest('.search-bar')) {
    prefilling = true
    searchValue.value = selected
    prefilling = false
  }
}

const refreshSearch = () => {
  debouncedSearchFn.cancel()
  nextTick(() => {
    if (!currentFile.value) return
    bus.emit('search-visibility', showSearch.value)
    searchFn(false)
  })
}

const highlightIndex = computed(() => {
  return searchMatches.value ? searchMatches.value.index : -1
})

const highlightCount = computed(() => {
  return searchMatches.value ? searchMatches.value.matches.length : 0
})

onMounted(() => {
  bus.on('find', listenFind)
  bus.on('replace', listenReplace)
  bus.on('findNext', listenFindNext)
  bus.on('findPrev', listenFindPrev)
  bus.on('file-loaded', refreshSearch)
  bus.on('file-changed', refreshSearch)
  document.addEventListener('keyup', docKeyup)
  bus.on('search-blur', blurSearch)
})

onBeforeUnmount(() => {
  bus.off('find', listenFind)
  bus.off('replace', listenReplace)
  bus.off('findNext', listenFindNext)
  bus.off('findPrev', listenFindPrev)
  bus.off('file-loaded', refreshSearch)
  bus.off('file-changed', refreshSearch)
  debouncedSearchFn.cancel()
  document.removeEventListener('keyup', docKeyup)
  bus.off('search-blur', blurSearch)
})

const toggleCtrl = (ctrl: 'isCaseSensitive' | 'isWholeWord' | 'isRegexp') => {
  switch (ctrl) {
    case 'isCaseSensitive':
      isCaseSensitive.value = !isCaseSensitive.value
      break
    case 'isWholeWord':
      isWholeWord.value = !isWholeWord.value
      break
    case 'isRegexp':
      isRegexp.value = !isRegexp.value
      break
  }
  searchFn()
}

const listenFind = () => {
  if (currentFile.value?.readOnly) return
  debouncedSearchFn.cancel()
  prefillFromSelection()
  showSearch.value = true
  type.value = 'search'
  bus.emit('search-visibility', true)
  searchFn(false)
  nextTick(() => {
    search.value?.focus()
    // Select the existing term so re-opening Find types over it instead of
    // appending to the previous query (#3458).
    search.value?.select()
  })
}

const listenReplace = () => {
  if (currentFile.value?.readOnly) return
  debouncedSearchFn.cancel()
  prefillFromSelection()
  showSearch.value = true
  type.value = 'replace'
  bus.emit('search-visibility', true)
  searchFn(false)
  nextTick(() => {
    search.value?.focus()
    search.value?.select()
  })
}

const listenFindNext = () => {
  if (!currentFile.value?.readOnly) find('next')
}

const listenFindPrev = () => {
  if (!currentFile.value?.readOnly) find('previous')
}

const docKeyup = (event: KeyboardEvent) => {
  if (event.key === 'Escape' && !event.isComposing && showSearch.value) {
    hideSearch()
  }
}

const blurSearch = () => hideSearch()

const hideSearch = () => {
  if (!showSearch.value) return
  debouncedSearchFn.cancel()
  searchFn(false)
  showSearch.value = false
  bus.emit('search-visibility', false)
}

const toggleSearchType = () => {
  if (currentFile.value?.readOnly) return
  type.value = type.value === 'search' ? 'replace' : 'search'
}

const find = (action: 'previous' | 'next') => {
  debouncedSearchFn.flush()
  if (searchErrorMsg.value) return
  bus.emit('find-action', action)
}

const handleEnterKey = (event: KeyboardEvent) => {
  if (event.key === 'Enter' && !event.isComposing && event.keyCode !== 229) {
    event.preventDefault()
    find(event.shiftKey ? 'previous' : 'next')
  }
}

const searchFn = (selectHighlight = true) => {
  searchErrorMsg.value = ''
  if (isRegexp.value) {
    // Handle invalid regexp.
    try {
      RegExp(searchValue.value)
      searchErrorMsg.value = ''
    } catch {
      searchErrorMsg.value = t('search.invalidRegex', { pattern: searchValue.value })
      return
    }
    // Handle match empty string, no need to search.
    try {
      const SEARCH_REG = new RegExp(searchValue.value)
      if (searchValue.value && SEARCH_REG.test('')) {
        throw new Error()
      }
      searchErrorMsg.value = ''
    } catch {
      searchErrorMsg.value = t('search.regexMatchEmpty', { pattern: searchValue.value })
      return
    }
  }

  bus.emit('searchValue', {
    value: searchValue.value,
    opt: {
      selectHighlight,
      isCaseSensitive: isCaseSensitive.value,
      isWholeWord: isWholeWord.value,
      isRegexp: isRegexp.value
    }
  })
}

const debouncedSearchFn = debounce(() => searchFn(), 150)

const replace = (isSingle = true) => {
  bus.emit('replaceValue', {
    value: replaceValue.value,
    opt: {
      isSingle,
      isCaseSensitive: isCaseSensitive.value,
      isWholeWord: isWholeWord.value,
      isRegexp: isRegexp.value
    }
  })
}
</script>

<style scoped>
.search-bar {
  position: absolute;
  width: 432px;
  padding: 0;
  top: 0;
  right: 20px;
  border-radius: 3px;
  box-shadow: var(--floatShadow);
  background: var(--floatBgColor);
  display: flex;
  flex-direction: row;
}
.search-bar .left-arrow {
  width: 20px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.search-bar .left-arrow:hover {
  background: var(--floatHoverColor);
}
.search-bar .left-arrow svg {
  height: 12px;
  width: 12px;
}
.search-bar .left-arrow .arrow-right {
  transform: rotate(-90deg);
}

.search-bar .right-controls {
  flex: 1;
}
.search-bar .close-search {
  flex: 0 0 24px;
  height: 28px;
  margin: 4px 4px 0 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 3px;
  color: var(--sideBarIconColor);
}
.search-bar .close-search:hover {
  background: var(--floatHoverColor);
}
.search,
.replace {
  height: 28px;
  display: flex;
  padding: 4px 10px 0 4px;
  margin-bottom: 5px;
}

.search-bar .button {
  outline: none;
  cursor: pointer;
  box-sizing: border-box;
  height: 28px;
  width: 28px;
  text-align: center;
  padding: 5px;
  display: inline-block;
  font-weight: 500;
  color: var(--sideBarIconColor);
  &.left {
    margin-right: 10px;
  }
  &.right {
    margin-left: 10px;
  }
}
.button.active {
  color: var(--themeColor);
}
.search-bar .button > svg {
  width: 16px;
  height: 16px;
}
.search-bar .button:active {
  opacity: 0.5;
}
.input-wrapper {
  display: flex;
  flex: 1;
  position: relative;
  border: 1px solid var(--inputBgColor);
  background: var(--inputBgColor);
  border-radius: 3px;
  overflow: visible;
}
.input-wrapper.error {
  border: 1px solid var(--notificationErrorBg);
  border-bottom-right-radius: 0;
  border-bottom-left-radius: 0;
}
/* The toggles are 24px targets (WCAG 2.5.8) laid edge to edge, which keeps
   the icons where the 20px boxes with 2px margins put them. */
.input-wrapper .controls {
  position: absolute;
  top: 4px;
  right: 10px;
  font-size: 12px;
  display: flex;
  align-items: center;
  color: var(--sideBarTitleColor);
  & > span.search-result {
    height: 20px;
    margin-right: 5px;
    line-height: 17px;
  }
  & > button {
    width: 24px;
    height: 24px;
    &:hover {
      color: var(--sideBarIconColor);
    }
    & > svg {
      fill: var(--sideBarIconColor);
      &:hover {
        fill: var(--highlightThemeColor);
      }
    }
    &.active svg {
      fill: var(--highlightThemeColor);
    }
  }
}

.input-wrapper .error-msg {
  position: absolute;
  top: 27px;
  width: calc(100% + 2px);
  height: 28px;
  left: -1px;
  padding: 0 8px;
  box-sizing: border-box;
  border-bottom-left-radius: 3px;
  border-bottom-right-radius: 3px;
  background: var(--notificationErrorBg);
  line-height: 28px;
  color: #ffffff;
  font-size: 14px;
  z-index: 1;
}

.input-wrapper input {
  flex: 1;
  padding: 0 8px;
  height: 26px;
  outline: none;
  border: none;
  box-sizing: border-box;
  font-size: 14px;
  color: var(--editorColor);
  padding: 0 8px;
  background: transparent;
}
</style>
