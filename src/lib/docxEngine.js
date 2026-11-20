/**
 * docxEngine.js - In-browser Word (.docx) & PDF bidirectional converter
 * Created for PDF Pro by Nguyễn Mai Lĩnh
 * 100% Client-side, zero backend, works completely offline.
 */

import { PDFDocument, rgb } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import liberationRegularUrl from 'pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf?url'
import liberationBoldUrl from 'pdfjs-dist/standard_fonts/LiberationSans-Bold.ttf?url'
import liberationItalicUrl from 'pdfjs-dist/standard_fonts/LiberationSans-Italic.ttf?url'
import liberationBoldItalicUrl from 'pdfjs-dist/standard_fonts/LiberationSans-BoldItalic.ttf?url'

// CRC32 table for ZIP creation
const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
    }
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buf) {
  let crc = 0 ^ (-1)
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 0xFF]
  }
  return (crc ^ (-1)) >>> 0
}

/**
 * Builds a valid ZIP archive (Store mode) entirely in memory.
 */
export function buildZip(files) {
  const fileEntries = []
  let offset = 0
  const encoder = new TextEncoder()

  for (const file of files) {
    const nameBytes = encoder.encode(file.name)
    const dataBytes = typeof file.data === 'string' ? encoder.encode(file.data) : file.data
    const crc = crc32(dataBytes)
    const size = dataBytes.length

    // Local file header (30 bytes + name length)
    const localHeader = new Uint8Array(30 + nameBytes.length)
    const lv = new DataView(localHeader.buffer)
    lv.setUint32(0, 0x04034b50, true) // signature
    lv.setUint16(4, 20, true)         // version needed
    lv.setUint16(6, 0, true)          // flags
    lv.setUint16(8, 0, true)          // compression (0 = store)
    lv.setUint16(10, 0, true)         // time
    lv.setUint16(12, 0, true)         // date
    lv.setUint32(14, crc, true)       // crc32
    lv.setUint32(18, size, true)      // compressed size
    lv.setUint32(22, size, true)      // uncompressed size
    lv.setUint16(26, nameBytes.length, true)
    lv.setUint16(28, 0, true)         // extra field length
    localHeader.set(nameBytes, 30)

    fileEntries.push({
      nameBytes,
      dataBytes,
      localHeader,
      offset,
      crc,
      size,
    })

    offset += localHeader.length + size
  }

  // Central directory
  const cdEntries = []
  let cdSize = 0

  for (const entry of fileEntries) {
    const cdHeader = new Uint8Array(46 + entry.nameBytes.length)
    const cv = new DataView(cdHeader.buffer)
    cv.setUint32(0, 0x02014b50, true) // signature
    cv.setUint16(4, 20, true)         // version made by
    cv.setUint16(6, 20, true)         // version needed
    cv.setUint16(8, 0, true)          // flags
    cv.setUint16(10, 0, true)         // compression
    cv.setUint16(12, 0, true)         // time
    cv.setUint16(14, 0, true)         // date
    cv.setUint32(16, entry.crc, true) // crc32
    cv.setUint32(20, entry.size, true)// compressed size
    cv.setUint32(24, entry.size, true)// uncompressed size
    cv.setUint16(28, entry.nameBytes.length, true)
    cv.setUint16(30, 0, true)         // extra length
    cv.setUint16(32, 0, true)         // comment length
    cv.setUint16(34, 0, true)         // disk number start
    cv.setUint16(36, 0, true)         // internal attrs
    cv.setUint32(38, 0, true)         // external attrs
    cv.setUint32(42, entry.offset, true) // relative offset of local header
    cdHeader.set(entry.nameBytes, 46)

    cdEntries.push(cdHeader)
    cdSize += cdHeader.length
  }

  // End of central directory record (22 bytes)
  const eocd = new Uint8Array(22)
  const ev = new DataView(eocd.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(4, 0, true)
  ev.setUint16(6, 0, true)
  ev.setUint16(8, fileEntries.length, true)
  ev.setUint16(10, fileEntries.length, true)
  ev.setUint32(12, cdSize, true)
  ev.setUint32(16, offset, true)
  ev.setUint16(20, 0, true)

  const totalLength = offset + cdSize + 22
  const out = new Uint8Array(totalLength)
  let pos = 0
  for (const entry of fileEntries) {
    out.set(entry.localHeader, pos)
    pos += entry.localHeader.length
    out.set(entry.dataBytes, pos)
    pos += entry.dataBytes.length
  }
  for (const cd of cdEntries) {
    out.set(cd, pos)
    pos += cd.length
  }
  out.set(eocd, pos)

  return out
}

/**
 * Extracts files from a ZIP buffer (supports Store and Deflate)
 */
export async function unzipFiles(buffer) {
  const bytes = new Uint8Array(buffer)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const results = {}

  let pos = 0
  const decoder = new TextDecoder()

  while (pos < bytes.length - 30) {
    const sig = view.getUint32(pos, true)
    if (sig !== 0x04034b50) {
      pos++
      continue
    }

    const compression = view.getUint16(pos + 8, true)
    const compressedSize = view.getUint32(pos + 18, true)
    const fileNameLen = view.getUint16(pos + 26, true)
    const extraLen = view.getUint16(pos + 28, true)

    const fileNameBytes = bytes.subarray(pos + 30, pos + 30 + fileNameLen)
    const fileName = decoder.decode(fileNameBytes)
    const dataStart = pos + 30 + fileNameLen + extraLen
    const dataEnd = dataStart + compressedSize

    if (dataEnd <= bytes.length) {
      const chunk = bytes.subarray(dataStart, dataEnd)
      if (compression === 0) {
        // Uncompressed (Store)
        results[fileName] = chunk
      } else if (compression === 8 && typeof DecompressionStream !== 'undefined') {
        // Deflated
        try {
          const ds = new DecompressionStream('deflate-raw')
          const writer = ds.writable.getWriter()
          writer.write(chunk)
          writer.close()
          const uncompressed = await new Response(ds.readable).arrayBuffer()
          results[fileName] = new Uint8Array(uncompressed)
        } catch (_) {
          // Fallback if decompression fails
          results[fileName] = chunk
        }
      }
    }

    pos = dataStart + compressedSize
  }

  return results
}

/**
 * Generates a standard Microsoft Word (.docx) file from an array of paragraphs.
 */
export function createDocx(paragraphs, docTitle = 'PDF Pro Document') {
  const escapeXml = (str) =>
    String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`

  const documentRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`

  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>
        <w:sz w:val="24"/>
        <w:szCs w:val="24"/>
        <w:lang w:val="vi-VN"/>
      </w:rPr>
    </w:rPrDefault>
  </w:docDefaults>
</w:styles>`

  let bodyXml = ''
  for (const p of paragraphs) {
    if (typeof p === 'string') {
      bodyXml += `<w:p><w:r><w:t xml:space="preserve">${escapeXml(p)}</w:t></w:r></w:p>`
    } else {
      const isHeading = p.isHeading || p.heading
      const isBreak = p.isBreak || p.pageBreak
      const text = escapeXml(p.text || '')
      const bold = (p.bold || isHeading) ? '<w:b/>' : ''
      const italic = p.italic ? '<w:i/>' : ''
      const sizeVal = isHeading ? '32' : '24'

      let pPr = ''
      if (isHeading) {
        pPr = `<w:pPr><w:spacing w:before="240" w:after="120"/><w:jc w:val="${p.align || 'left'}"/></w:pPr>`
      } else if (p.align) {
        pPr = `<w:pPr><w:jc w:val="${p.align}"/></w:pPr>`
      }

      const br = isBreak ? '<w:r><w:br w:type="page"/></w:r>' : ''
      bodyXml += `<w:p>${pPr}${br}<w:r><w:rPr>${bold}${italic}<w:sz w:val="${sizeVal}"/></w:rPr><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`
    }
  }

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${bodyXml}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>
    </w:sectPr>
  </w:body>
</w:document>`

  return buildZip([
    { name: '[Content_Types].xml', data: contentTypes },
    { name: '_rels/.rels', data: rels },
    { name: 'word/_rels/document.xml.rels', data: documentRels },
    { name: 'word/styles.xml', data: styles },
    { name: 'word/document.xml', data: documentXml },
  ])
}

function decodeXml(value) {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function readXmlAttribute(xml, name) {
  const match = xml.match(new RegExp(`(?:w:)?${name}="([^"]*)"`, 'i'))
  return match ? decodeXml(match[1]) : null
}

function readOnOff(xml, name) {
  const match = xml.match(new RegExp(`<w:${name}(?:\\s+[^>]*)?\\s*/?>`, 'i'))
  if (!match) return false
  return !/\bw:val="(?:0|false|off)"/i.test(match[0])
}

function parseDocxFontSize(runProperties, fallback = 11) {
  const halfPoints = Number(readXmlAttribute(runProperties, 'sz'))
  return Number.isFinite(halfPoints) && halfPoints > 0 ? halfPoints / 2 : fallback
}

function parseDocxRunProperties(xml, defaults = {}) {
  const properties = xml.match(/<w:rPr(?:\s+[^>]*)?>([\s\S]*?)<\/w:rPr>/i)?.[1] || ''
  const colorElement = properties.match(/<w:color(?:\s+[^>]*)?\/?>/i)?.[0] || ''
  const colorValue = readXmlAttribute(colorElement, 'val')
  const fontElement = properties.match(/<w:rFonts(?:\s+[^>]*)?\/?>/i)?.[0] || ''
  const boldElement = properties.match(/<w:b(?:\s+[^>]*)?\/?>/i)
  const italicElement = properties.match(/<w:i(?:\s+[^>]*)?\/?>/i)
  const underlineElement = properties.match(/<w:u(?:\s+[^>]*)?\/?>/i)
  const sizeElement = properties.match(/<w:sz(?:\s+[^>]*)?\/?>/i)
  const fontSize = Number(readXmlAttribute(sizeElement?.[0] || '', 'val'))
  const normalizedFont = (readXmlAttribute(fontElement, 'ascii')
    || readXmlAttribute(fontElement, 'hAnsi')
    || defaults.font
    || 'Arial').replace(/^["']|["']$/g, '')

  return {
    size: sizeElement && Number.isFinite(fontSize) && fontSize > 0
      ? fontSize / 2
      : defaults.size || 11,
    bold: boldElement ? readOnOff(properties, 'b') : defaults.bold || false,
    italic: italicElement ? readOnOff(properties, 'i') : defaults.italic || false,
    underline: underlineElement
      ? !/\bw:val="none"/i.test(underlineElement[0]) && readOnOff(properties, 'u')
      : defaults.underline || false,
    color: /^#[0-9a-f]{6}$/i.test(colorValue || '') ? colorValue : defaults.color || '#202020',
    font: normalizedFont,
  }
}

function extractRunContent(paragraphXml, defaults, styles) {
  const runs = []
  const runPattern = /<w:r(?:\s+[^>]*)?>([\s\S]*?)<\/w:r>/g
  let match

  while ((match = runPattern.exec(paragraphXml))) {
    const body = match[1]
    const runProperties = body.match(/<w:rPr(?:\s+[^>]*)?>([\s\S]*?)<\/w:rPr>/i)?.[1] || ''
    const runStyle = runProperties.match(/<w:rStyle(?:\s+[^>]*)?\/?>/i)?.[0] || ''
    const characterStyle = styles.get(readXmlAttribute(runStyle, 'val')) || {}
    const properties = parseDocxRunProperties(body, { ...defaults, ...characterStyle })
    let text = ''
    const tokenPattern = /<w:t(?:\s+[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab(?:\s+[^>]*)?\/>|<w:br(?:\s+[^>]*)?\/>|<w:cr(?:\s+[^>]*)?\/>/gi
    let token
    while ((token = tokenPattern.exec(body))) {
      if (token[1] !== undefined) text += decodeXml(token[1])
      else if (/^<w:tab/i.test(token[0])) text += '\t'
      else if (/^<w:br/i.test(token[0])) {
        text += readXmlAttribute(token[0], 'type') === 'page' ? '\f' : '\n'
      } else text += '\n'
    }
    if (text) runs.push({ text, ...properties })
  }
  return runs
}

function parseDocxStyles(stylesXml) {
  const styles = new Map()
  const defaultsXml = stylesXml.match(/<w:docDefaults(?:\s+[^>]*)?>([\s\S]*?)<\/w:docDefaults>/i)?.[1] || ''
  const defaultRunProperties = defaultsXml.match(/<w:rPrDefault(?:\s+[^>]*)?>([\s\S]*?)<\/w:rPrDefault>/i)?.[1] || ''
  const defaultRunStyle = parseDocxRunProperties(`<w:rPr>${defaultRunProperties}</w:rPr>`, {
    size: 11,
    font: 'Arial',
    color: '#202020',
  })
  const pattern = /<w:style(?:\s+[^>]*)?>([\s\S]*?)<\/w:style>/gi
  let match
  while ((match = pattern.exec(stylesXml))) {
    const header = match[0].slice(0, match[0].indexOf('>') + 1)
    const styleId = readXmlAttribute(header, 'styleId')
    if (!styleId) continue
    const runProperties = match[1].match(/<w:rPr(?:\s+[^>]*)?>([\s\S]*?)<\/w:rPr>/i)?.[1] || ''
    const paragraphProperties = match[1].match(/<w:pPr(?:\s+[^>]*)?>([\s\S]*?)<\/w:pPr>/i)?.[1] || ''
    const spacing = paragraphProperties.match(/<w:spacing(?:\s+[^>]*)?\/?>/i)?.[0] || ''
    const ind = paragraphProperties.match(/<w:ind(?:\s+[^>]*)?\/?>/i)?.[0] || ''
    const alignment = paragraphProperties.match(/<w:jc(?:\s+[^>]*)?\/?>/i)?.[0] || ''
    const runStyle = parseDocxRunProperties(`<w:rPr>${runProperties}</w:rPr>`, defaultRunStyle)
    styles.set(styleId, {
      ...runStyle,
      basedOn: readXmlAttribute(match[1].match(/<w:basedOn(?:\s+[^>]*)?\/?>/i)?.[0] || '', 'val'),
      isDefault: readXmlAttribute(header, 'default') === '1',
      alignment: readXmlAttribute(alignment, 'val') || 'left',
      before: (Number(readXmlAttribute(spacing, 'before')) || 0) / 20,
      after: (Number(readXmlAttribute(spacing, 'after')) || 0) / 20,
      lineSpacing: Number(readXmlAttribute(spacing, 'line')),
      lineRule: readXmlAttribute(spacing, 'lineRule') || 'auto',
      leftIndent: (Number(readXmlAttribute(ind, 'left')) || 0) / 20,
      rightIndent: (Number(readXmlAttribute(ind, 'right')) || 0) / 20,
      firstLineIndent: (Number(readXmlAttribute(ind, 'firstLine')) || 0) / 20,
    })
  }

  const resolving = new Set()
  const resolveStyle = (styleId) => {
    const style = styles.get(styleId)
    if (!style || style.resolved) return style
    if (resolving.has(styleId)) return style
    resolving.add(styleId)
    const parent = style.basedOn ? resolveStyle(style.basedOn) : null
    if (parent) {
      const merged = { ...parent, ...style }
      for (const key of ['size', 'font', 'color', 'alignment', 'lineRule']) {
        if (style[key] === undefined || style[key] === null || style[key] === '') merged[key] = parent[key]
      }
      for (const key of ['bold', 'italic', 'underline']) {
        if (style[key] === false && parent[key]) merged[key] = parent[key]
      }
      for (const key of ['before', 'after', 'leftIndent', 'rightIndent', 'firstLineIndent']) {
        if (!style[key]) merged[key] = parent[key] || 0
      }
      if (!Number.isFinite(style.lineSpacing)) merged.lineSpacing = parent.lineSpacing
      styles.set(styleId, merged)
    }
    style.resolved = true
    resolving.delete(styleId)
    return styles.get(styleId)
  }
  for (const styleId of styles.keys()) resolveStyle(styleId)
  return { styles, defaultRunStyle, defaultParagraphStyle: [...styles.values()].find((style) => style.isDefault) || null }
}

function parseDocxParagraphs(xml, stylesXml = '') {
  const paragraphs = []
  const { styles, defaultRunStyle, defaultParagraphStyle } = parseDocxStyles(stylesXml)
  const pattern = /<w:p(?:\s+[^>]*)?>([\s\S]*?)<\/w:p>/g
  let match

  while ((match = pattern.exec(xml))) {
    const body = match[1]
    const pPr = body.match(/<w:pPr(?:\s+[^>]*)?>([\s\S]*?)<\/w:pPr>/i)?.[1] || ''
    const jc = pPr.match(/<w:jc(?:\s+[^>]*)?\/?>/i)?.[0] || ''
    const spacing = pPr.match(/<w:spacing(?:\s+[^>]*)?\/?>/i)?.[0] || ''
    const ind = pPr.match(/<w:ind(?:\s+[^>]*)?\/?>/i)?.[0] || ''
    const styleElement = pPr.match(/<w:pStyle(?:\s+[^>]*)?\/?>/i)?.[0] || ''
    const style = styles.get(readXmlAttribute(styleElement, 'val')) || defaultParagraphStyle || {}
    const tabs = [...pPr.matchAll(/<w:tab(?:\s+[^>]*)?\/?>/gi)].map(([tab]) => ({
      position: Number(readXmlAttribute(tab, 'pos')) / 20,
      leader: readXmlAttribute(tab, 'leader'),
      alignment: readXmlAttribute(tab, 'val') || 'left',
    })).filter((tab) => Number.isFinite(tab.position) && tab.position > 0)
    const runs = extractRunContent(body, { ...defaultRunStyle, ...style }, styles)

    paragraphs.push({
      runs,
      alignment: readXmlAttribute(jc, 'val') || style.alignment || 'left',
      before: spacing ? (Number(readXmlAttribute(spacing, 'before')) || 0) / 20 : style.before || 0,
      after: spacing ? (Number(readXmlAttribute(spacing, 'after')) || 0) / 20 : style.after || 0,
      lineSpacing: spacing ? Number(readXmlAttribute(spacing, 'line')) : style.lineSpacing,
      lineRule: readXmlAttribute(spacing, 'lineRule') || style.lineRule || 'auto',
      leftIndent: ind ? (Number(readXmlAttribute(ind, 'left')) || 0) / 20 : style.leftIndent || 0,
      rightIndent: ind ? (Number(readXmlAttribute(ind, 'right')) || 0) / 20 : style.rightIndent || 0,
      firstLineIndent: ind ? (Number(readXmlAttribute(ind, 'firstLine')) || 0) / 20 : style.firstLineIndent || 0,
      tabs,
      pageBreakBefore: /<w:pageBreakBefore(?:\s+[^>]*)?\/?>/i.test(pPr),
    })
  }
  return paragraphs
}

function parseDocxPage(xml) {
  const section = [...xml.matchAll(/<w:sectPr(?:\s+[^>]*)?>([\s\S]*?)<\/w:sectPr>/gi)].pop()?.[1] || ''
  const pageSize = section.match(/<w:pgSz(?:\s+[^>]*)?\/?>/i)?.[0] || ''
  const margins = section.match(/<w:pgMar(?:\s+[^>]*)?\/?>/i)?.[0] || ''
  let width = Number(readXmlAttribute(pageSize, 'w')) / 20
  let height = Number(readXmlAttribute(pageSize, 'h')) / 20
  if (!Number.isFinite(width) || width <= 0) width = 595.28
  if (!Number.isFinite(height) || height <= 0) height = 841.89
  if (readXmlAttribute(pageSize, 'orient') === 'landscape' && width < height) {
    ;[width, height] = [height, width]
  }
  const margin = (name, fallback) => {
    const twips = Number(readXmlAttribute(margins, name))
    return Number.isFinite(twips) ? twips / 20 : fallback
  }
  return {
    width,
    height,
    marginLeft: margin('left', 72),
    marginRight: margin('right', 72),
    marginTop: margin('top', 72),
    marginBottom: margin('bottom', 72),
  }
}

/**
 * Parses text and common paragraph/run formatting from a .docx file.
 */
export async function parseDocx(buffer) {
  const files = await unzipFiles(buffer)
  const docXmlBytes = files['word/document.xml']
  if (!docXmlBytes) throw new Error('Tệp không đúng định dạng DOCX hoặc bị lỗi.')
  const xml = new TextDecoder().decode(docXmlBytes)
  const stylesXml = files['word/styles.xml']
    ? new TextDecoder().decode(files['word/styles.xml'])
    : ''
  return parseDocxParagraphs(xml, stylesXml)
}

async function loadDocxFonts(pdfDoc) {
  pdfDoc.registerFontkit(fontkit)
  const fontUrls = [liberationRegularUrl, liberationBoldUrl, liberationItalicUrl, liberationBoldItalicUrl]
  const fontBytes = await Promise.all(fontUrls.map(async (url) => {
    const response = await fetch(url)
    if (!response.ok) throw new Error('Không thể tải phông chữ dùng để xuất PDF.')
    return new Uint8Array(await response.arrayBuffer())
  }))
  const [regular, bold, italic, boldItalic] = await Promise.all(
    fontBytes.map((bytes) => pdfDoc.embedFont(bytes))
  )
  return { regular, bold, italic, boldItalic }
}

function fontForRun(run, fonts) {
  if (run.bold && run.italic) return fonts.boldItalic
  if (run.bold) return fonts.bold
  if (run.italic) return fonts.italic
  return fonts.regular
}

function wrapDocxParagraph(paragraph, maxWidth, fonts) {
  const lines = []
  let line = []
  let lineWidth = 0

  const pushLine = () => {
    lines.push({ fragments: line, width: lineWidth })
    line = []
    lineWidth = 0
  }

  for (const run of paragraph.runs) {
    const parts = run.text.split(/(\s+|\f|\n|\t)/).filter(Boolean)
    for (const part of parts) {
      if (part === '\f') {
        pushLine()
        lines.push({ pageBreak: true })
        continue
      }
      if (part === '\n') {
        pushLine()
        continue
      }
      if (part === '\t') {
        const nextTab = paragraph.tabs.find((tab) => tab.position > lineWidth)
        const target = nextTab?.position || (Math.floor(lineWidth / 36) + 1) * 36
        const gap = Math.max(12, target - lineWidth)
        line.push({ ...run, text: '', width: gap, leader: nextTab?.leader })
        lineWidth += gap
        continue
      }

      const normalizedPart = part.normalize('NFC')
      const font = fontForRun(run, fonts)
      const width = font.widthOfTextAtSize(normalizedPart, run.size)
      if (!/^\s+$/.test(part) && lineWidth + width > maxWidth && line.length) pushLine()
      line.push({ ...run, text: normalizedPart, width })
      lineWidth += width
    }
  }
  if (line.length || !lines.length) pushLine()
  return lines
}

/**
 * Exports DOCX text and common Word formatting to PDF. Images, complex tables,
 * floating objects, and unsupported Word layout features are not reconstructed.
 */
export async function convertDocxToPdf(docxBuffer) {
  const files = await unzipFiles(docxBuffer)
  const documentXml = files['word/document.xml']
  if (!documentXml) throw new Error('Tệp không đúng định dạng DOCX hoặc bị lỗi.')
  const xml = new TextDecoder().decode(documentXml)
  const stylesXml = files['word/styles.xml']
    ? new TextDecoder().decode(files['word/styles.xml'])
    : ''
  const paragraphs = parseDocxParagraphs(xml, stylesXml)
  if (!paragraphs.length) throw new Error('Không tìm thấy nội dung văn bản trong tệp Word.')

  const pdfDoc = await PDFDocument.create()
  const fonts = await loadDocxFonts(pdfDoc)
  const pageSize = parseDocxPage(xml)
  let currentPage = pdfDoc.addPage([pageSize.width, pageSize.height])
  let cursorY = pageSize.height - pageSize.marginTop

  const addPage = () => {
    currentPage = pdfDoc.addPage([pageSize.width, pageSize.height])
    cursorY = pageSize.height - pageSize.marginTop
  }

  for (const paragraph of paragraphs) {
    if (paragraph.pageBreakBefore) addPage()
    cursorY -= paragraph.before
    const left = pageSize.marginLeft + paragraph.leftIndent
    const right = pageSize.marginRight + paragraph.rightIndent
    const firstIndent = paragraph.firstLineIndent
    const maxWidth = Math.max(1, pageSize.width - left - right)
    const lines = wrapDocxParagraph(paragraph, maxWidth - firstIndent, fonts)
    const defaultSize = paragraph.runs[0]?.size || 11

    for (const line of lines) {
      if (line.pageBreak) {
        addPage()
        continue
      }
      const lineSize = Math.max(defaultSize, ...line.fragments.map((fragment) => fragment.size))
      const lineHeight = paragraph.lineRule === 'exact' && paragraph.lineSpacing
        ? paragraph.lineSpacing / 20
        : paragraph.lineSpacing
          ? lineSize * paragraph.lineSpacing / 240
          : lineSize * 1.2
      if (cursorY - lineHeight < pageSize.marginBottom) addPage()

      const indent = line === lines[0] ? firstIndent : 0
      let x = left + indent
      if (paragraph.alignment === 'center') x += Math.max(0, (maxWidth - line.width - indent) / 2)
      else if (paragraph.alignment === 'right') x += Math.max(0, maxWidth - line.width - indent)
      else if (paragraph.alignment === 'both' || paragraph.alignment === 'justify' || paragraph.alignment === 'distribute') {
        const spaces = line.fragments.filter((fragment) => /^\s+$/.test(fragment.text)).length
        if (spaces > 0) {
          const extra = Math.max(0, (maxWidth - line.width - indent) / spaces)
          for (const fragment of line.fragments) {
            if (/^\s+$/.test(fragment.text)) fragment.width += extra
          }
        }
      }

      for (const fragment of line.fragments) {
        if (fragment.leader === 'dot' && fragment.width > 0) {
          const dotWidth = fonts.regular.widthOfTextAtSize('.', fragment.size)
          const count = Math.min(300, Math.floor(fragment.width / Math.max(dotWidth, 1)))
          if (count) currentPage.drawText('.'.repeat(count), {
            x, y: cursorY - lineSize, size: fragment.size, font: fonts.regular,
            color: rgb(0.25, 0.25, 0.25),
          })
        } else if (fragment.text) {
          const color = fragment.color.match(/[0-9a-f]{2}/gi) || []
          const drawColor = color.length === 3
            ? rgb(parseInt(color[0], 16) / 255, parseInt(color[1], 16) / 255, parseInt(color[2], 16) / 255)
            : rgb(0.12, 0.12, 0.12)
          currentPage.drawText(fragment.text, {
            x,
            y: cursorY - fragment.size,
            size: fragment.size,
            font: fontForRun(fragment, fonts),
            color: drawColor,
          })
          if (fragment.underline) {
            currentPage.drawLine({
              start: { x, y: cursorY - fragment.size - 1 },
              end: { x: x + fragment.width, y: cursorY - fragment.size - 1 },
              thickness: Math.max(0.5, fragment.size / 18),
              color: drawColor,
            })
          }
        }
        x += fragment.width
      }
      cursorY -= lineHeight
    }
    cursorY -= paragraph.after
  }

  return await pdfDoc.save()
}

/**
 * Converts a PDF to a Word document made of full-page images.
 * Keeping each page as an image preserves the PDF's exact visual layout.
 */
export async function convertPdfToDocx(pdfBuffer, pdfjsLib) {
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(pdfBuffer.slice(0)) })
  const pdfDoc = await loadingTask.promise
  const images = []
  const relationships = []
  const pageParagraphs = []
  const maxPageTwips = 31680

  try {
    for (let pageNumber = 1; pageNumber <= pdfDoc.numPages; pageNumber += 1) {
      const page = await pdfDoc.getPage(pageNumber)
      const viewport = page.getViewport({ scale: 1 })
      const widthTwips = Math.round(viewport.width * 20)
      const heightTwips = Math.round(viewport.height * 20)
      if (widthTwips > maxPageTwips || heightTwips > maxPageTwips) {
        throw new Error('Kích thước trang PDF vượt quá giới hạn trang của Word.')
      }

      const scale = Math.min(3, 5000 / viewport.width, 5000 / viewport.height)
      const renderViewport = page.getViewport({ scale })
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(renderViewport.width)
      canvas.height = Math.ceil(renderViewport.height)
      const context = canvas.getContext('2d', { alpha: false })
      if (!context) throw new Error('Không thể tạo ảnh để xuất Word.')

      await page.render({
        canvasContext: context,
        viewport: renderViewport,
        background: '#ffffff',
      }).promise

      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob((result) => {
          if (result) resolve(result)
          else reject(new Error('Không thể tạo ảnh cho trang PDF.'))
        }, 'image/png')
      })
      const imageBytes = new Uint8Array(await blob.arrayBuffer())
      const imageName = `page-${pageNumber}.png`
      const relationshipId = `rIdImage${pageNumber}`
      const widthEmu = Math.round(viewport.width * 12700)
      const heightEmu = Math.round(viewport.height * 12700)

      images.push({ name: `word/media/${imageName}`, data: imageBytes })
      relationships.push(
        `<Relationship Id="${relationshipId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${imageName}"/>`
      )

      pageParagraphs.push(
        `<w:p><w:pPr><w:spacing w:before="0" w:after="0"/><w:sectPr>${pageNumber < pdfDoc.numPages ? '<w:type w:val="nextPage"/>' : ''}<w:pgSz w:w="${widthTwips}" w:h="${heightTwips}"/><w:pgMar w:top="0" w:right="0" w:bottom="0" w:left="0" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr></w:pPr><w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><wp:extent cx="${widthEmu}" cy="${heightEmu}"/><wp:docPr id="${pageNumber}" name="Trang ${pageNumber}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${pageNumber}" name="${imageName}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${relationshipId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${widthEmu}" cy="${heightEmu}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`
      )
      canvas.width = 0
      canvas.height = 0
    }

    const lastPage = await pdfDoc.getPage(pdfDoc.numPages)
    const lastViewport = lastPage.getViewport({ scale: 1 })
    const lastWidthTwips = Math.round(lastViewport.width * 20)
    const lastHeightTwips = Math.round(lastViewport.height * 20)
    const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`
    const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`
    const documentRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationships.join('')}</Relationships>`
    const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${pageParagraphs.join('')}<w:sectPr><w:pgSz w:w="${lastWidthTwips}" w:h="${lastHeightTwips}"/><w:pgMar w:top="0" w:right="0" w:bottom="0" w:left="0" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr></w:body></w:document>`

    return buildZip([
      { name: '[Content_Types].xml', data: contentTypes },
      { name: '_rels/.rels', data: rels },
      { name: 'word/_rels/document.xml.rels', data: documentRels },
      { name: 'word/document.xml', data: documentXml },
      ...images.map((image) => ({ name: image.name, data: image.data })),
    ])
  } finally {
    await pdfDoc.destroy()
  }
}

function escapeDocxXml(value) {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function getDocxFontFamily(fontFamily = '') {
  if (/sans[- ]?serif/i.test(fontFamily)) return 'Arial'
  if (/monospace/i.test(fontFamily)) return 'Courier New'
  if (/serif/i.test(fontFamily)) return 'Times New Roman'
  return fontFamily.replace(/["']/g, '').trim() || 'Arial'
}

function extractTextLines(textContent, viewport, pdfjsLib) {
  const lines = []
  for (const item of textContent.items) {
    if (!item.str?.trim() || !item.transform) continue
    const transform = pdfjsLib.Util.transform(viewport.transform, item.transform)
    const size = Math.max(Math.hypot(transform[0], transform[1]), 1)
    const x = transform[4]
    const baseline = transform[5]
    const fontStyle = textContent.styles[item.fontName] || {}
    let line = lines.find((candidate) =>
      Math.abs(candidate.baseline - baseline) <= Math.max(2, size * 0.35)
    )
    if (!line) {
      line = { baseline, items: [] }
      lines.push(line)
    }
    line.items.push({
      text: item.str,
      x,
      width: item.width || 0,
      size,
      font: getDocxFontFamily(fontStyle.fontFamily),
      bold: /bold|black|demi|semibold/i.test(item.fontName),
      italic: /italic|oblique/i.test(item.fontName),
    })
  }

  return lines
    .map((line) => {
      line.items.sort((a, b) => a.x - b.x)
      return line
    })
    .sort((a, b) => a.baseline - b.baseline)
}

function buildDocxLineXml(line, leftIndent, beforeSpacing) {
  const runs = []
  const tabStops = []
  let previous = null
  for (const item of line.items) {
    if (previous && !/\s$/.test(previous.text) && !/^\s/.test(item.text)) {
      const gap = item.x - previous.x - previous.width
      if (gap > Math.max(1, item.size * 0.25)) {
        const stop = Math.round((item.x - line.items[0].x) * 20)
        if (stop > 0) {
          tabStops.push(`<w:tab w:val="left" w:pos="${stop}"/>`)
          runs.push('<w:r><w:tab/></w:r>')
        }
      }
    }
    const properties = [
      `<w:rFonts w:ascii="${escapeDocxXml(item.font)}" w:hAnsi="${escapeDocxXml(item.font)}" w:eastAsia="${escapeDocxXml(item.font)}"/>`,
      `<w:sz w:val="${Math.max(2, Math.round(item.size * 2))}"/>`,
      item.bold ? '<w:b/>' : '',
      item.italic ? '<w:i/>' : '',
    ].join('')
    runs.push(`<w:r><w:rPr>${properties}</w:rPr><w:t xml:space="preserve">${escapeDocxXml(item.text)}</w:t></w:r>`)
    previous = item
  }

  const tabs = tabStops.length ? `<w:tabs>${tabStops.join('')}</w:tabs>` : ''
  return `<w:p><w:pPr>${tabs}<w:spacing w:before="${beforeSpacing}" w:after="0"/><w:ind w:left="${leftIndent}"/></w:pPr>${runs.join('')}</w:p>`
}

export async function convertPdfToEditableDocx(pdfBuffer, pdfjsLib) {
  const input = pdfBuffer instanceof Uint8Array
    ? new Uint8Array(pdfBuffer)
    : new Uint8Array(pdfBuffer.slice(0))
  const pdfDoc = await pdfjsLib.getDocument({ data: input }).promise
  const pageSections = []
  const sectionProperties = []
  let foundText = false
  const maxPageTwips = 31680

  try {
    for (let pageNumber = 1; pageNumber <= pdfDoc.numPages; pageNumber += 1) {
      const page = await pdfDoc.getPage(pageNumber)
      const viewport = page.getViewport({ scale: 1 })
      const widthTwips = Math.round(viewport.width * 20)
      const heightTwips = Math.round(viewport.height * 20)
      if (widthTwips > maxPageTwips || heightTwips > maxPageTwips) {
        throw new Error('Kích thước trang PDF vượt quá giới hạn trang của Word.')
      }

      const textContent = await page.getTextContent()
      const lines = extractTextLines(textContent, viewport, pdfjsLib)
      foundText ||= lines.length > 0
      let previousBaseline = 0
      const paragraphs = lines.map((line, index) => {
        const firstItem = line.items[0]
        const leftIndent = Math.max(0, Math.round(firstItem.x * 20))
        const top = Math.max(0, line.baseline - firstItem.size * 0.8)
        const lineHeight = firstItem.size * 1.2
        const beforeSpacing = Math.max(0, Math.round(
          (index === 0 ? top : top - previousBaseline - lineHeight) * 20
        ))
        previousBaseline = line.baseline
        return buildDocxLineXml(line, leftIndent, beforeSpacing)
      })

      if (!paragraphs.length) {
        paragraphs.push('<w:p><w:pPr></w:pPr></w:p>')
      }
      pageSections.push(paragraphs.join(''))
      sectionProperties.push(`<w:pgSz w:w="${widthTwips}" w:h="${heightTwips}"/><w:pgMar w:top="0" w:right="0" w:bottom="0" w:left="0" w:header="0" w:footer="0" w:gutter="0"/>`)
      page.cleanup()
    }

    if (!foundText) {
      throw new Error('PDF không có lớp văn bản để chuyển đổi. Hãy dùng chế độ giữ nguyên hình thức hoặc chạy OCR trước.')
    }

    const body = pageSections.map((paragraphs, index) => {
      if (index === pageSections.length - 1) return paragraphs
      const section = `<w:sectPr><w:type w:val="nextPage"/>${sectionProperties[index]}</w:sectPr>`
      return paragraphs.replace(/<\/w:pPr>(?![\s\S]*<\/w:pPr>)/, `${section}</w:pPr>`)
    }).join('')
    const lastSection = sectionProperties[sectionProperties.length - 1]
    const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr>${lastSection}</w:sectPr></w:body></w:document>`
    const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`
    const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`

    return buildZip([
      { name: '[Content_Types].xml', data: contentTypes },
      { name: '_rels/.rels', data: rels },
      { name: 'word/document.xml', data: documentXml },
    ])
  } finally {
    await pdfDoc.destroy()
  }
}
