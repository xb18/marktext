import { describe, expect, it } from 'vitest'
import { getFindSeedWord } from '@/util/findSeed'

describe('Find prefill at a collapsed caret', () => {
  it.each([
    ['first apple apple', 8, 'apple'],
    ['first apple apple', 6, 'apple'],
    ['first apple apple', 11, 'apple'],
    ['first  apple', 6, ''],
    ['foo.bar', 4, 'bar'],
    ['foo-bar', 4, 'bar'],
    ['foo_bar', 4, 'foo_bar'],
    ['中文测试 apple', 2, '中文测试'],
    ['😀word end', 3, '😀word'],
    ['', 0, '']
  ])('seeds %j at offset %s with %j', (text, offset, expected) => {
    expect(getFindSeedWord(text as string, offset as number)).toBe(expected)
  })
})
