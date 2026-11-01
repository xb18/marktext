const separators = new Set('`~!@#$%^&*()-=+[{]}\\|;:\'",.<>/?')

export const getFindSeedWord = (text: string, offset: number): string => {
  const isSeparator = (character: string) => /\s/u.test(character) || separators.has(character)
  let start = Math.max(0, Math.min(offset, text.length))
  let end = start
  while (start > 0 && !isSeparator(text[start - 1])) start--
  while (end < text.length && !isSeparator(text[end])) end++
  return text.slice(start, end)
}
