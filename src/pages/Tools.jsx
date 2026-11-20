import React, { useState, useEffect, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { useNavigate, useLocation } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  Scissors, Merge, FileDown, RotateCcw, ScanLine, Lock,
  Unlock, Droplets, EyeOff, Edit3, FileSearch, Layers,
  ChevronRight, Upload, FileText, X, Loader2, RotateCw, Image as ImageIcon,
  GripVertical, Check, ArrowLeft, Grid2X2, ChevronUp, ChevronDown, Sparkles,
  Award, ShieldCheck, CheckCircle2
} from 'lucide-react'
import Navbar from '../components/layout/Navbar.jsx'
import {
  mergePdfs, splitPdf, compressPdf, rotatePdf, rotateAllPages,
  addWatermark, extractPages, reorderPages, downloadBytes,
  compressPdfToTarget, protectPdf, addImageToPdf
} from '../lib/pdfExporter.js'
import { convertDocxToPdf, convertPdfToDocx } from '../lib/docxEngine.js'
import * as pdfjsLib from 'pdfjs-dist'
import { loadPdf, renderThumbnail, renderPage } from '../lib/pdfRenderer.js'
import { ocrCanvas } from '../lib/ocrEngine.js'
import styles from './Tools.module.css'

/* ─────────────────── Component dùng chung ─────────────────── */

function FileDropper({ onFile, file, onClear, multiple = false, label = 'Kéo thả file PDF vào đây hoặc bấm để chọn' }) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { 'application/pdf': ['.pdf'] },
    maxFiles: multiple ? undefined : 1,
    onDrop: multiple
      ? (files) => onFile(files)
      : ([f]) => f && onFile(f),
  })

  if (!multiple && file) {
    return (
      <div className={styles.fileChip}>
        <FileText size={15} />
        <span className={styles.fileName}>{file.name}</span>
        <span className={styles.fileSize}>{(file.size / 1024).toFixed(0)} KB</span>
        <button className={styles.removeBtn} onClick={onClear} title="Xóa file"><X size={13} /></button>
      </div>
    )
  }

  return (
    <div {...getRootProps()} className={`${styles.dropArea} ${isDragActive ? styles.dropActive : ''}`}>
      <input {...getInputProps()} />
      <Upload size={28} className={styles.uploadIcon} />
      <span>{isDragActive ? 'Thả tệp vào đây ngay!' : label}</span>
    </div>
  )
}

function ToolShell({ title, desc, children, wide = false }) {
  return (
    <div className={`${styles.toolUI} ${wide ? styles.toolUIWide : ''}`}>
      <h2 className={styles.toolUITitle}>{title}</h2>
      <p className={styles.toolUIDesc}>{desc}</p>
      {children}
    </div>
  )
}

function ActionBtn({ onClick, disabled, loading, icon: Icon, children }) {
  return (
    <button className={styles.actionBtn} onClick={onClick} disabled={disabled || loading}>
      {loading ? <Loader2 size={15} className={styles.spin} /> : Icon ? <Icon size={15} /> : null}
      {children}
    </button>
  )
}

const WATERMARK_FONT_OPTIONS = [
  { id: 'Times-Roman', label: 'Times New Roman (Chuẩn văn thư)', css: 'Georgia, "Times New Roman", serif' },
  { id: 'Helvetica', label: 'Arial / Helvetica', css: 'Arial, Helvetica, sans-serif' },
  { id: 'Courier', label: 'Courier Mono', css: '"Courier New", Courier, monospace' },
]

const WATERMARK_POSITION_PRESETS = [
  ['top-left', 'Trên trái'],
  ['top', 'Trên giữa'],
  ['top-right', 'Trên phải'],
  ['center', 'Chính giữa'],
  ['bottom-left', 'Dưới trái'],
  ['bottom', 'Dưới giữa'],
  ['bottom-right', 'Dưới phải'],
]

let previewMeasureCtx = null

function getPreviewMeasureContext() {
  if (!previewMeasureCtx && typeof document !== 'undefined') {
    previewMeasureCtx = document.createElement('canvas').getContext('2d')
  }
  return previewMeasureCtx
}

function measurePreviewText(text, fontSize, fontFamily, bold, italic) {
  const ctx = getPreviewMeasureContext()
  if (!ctx) {
    return {
      width: Math.max((text || '').length * fontSize * 0.58, fontSize * 2),
      height: fontSize * 1.08,
    }
  }

  ctx.font = `${italic ? 'italic ' : ''}${bold ? '700 ' : '400 '}${fontSize}px ${fontFamily}`
  return {
    width: Math.max(ctx.measureText(text || '').width, fontSize * 2),
    height: fontSize * 1.08,
  }
}

function parseWatermarkPages(mode, input, totalPages) {
  const allPages = Array.from({ length: totalPages }, (_, i) => i + 1)
  if (mode === 'all') return allPages
  if (!input.trim()) throw new Error(mode === 'specific' ? 'Vui lòng nhập số trang cụ thể' : 'Vui lòng nhập khoảng trang')

  const pages = []
  for (const rawPart of input.split(',')) {
    const part = rawPart.trim()
    if (!part) continue

    if (mode === 'specific') {
      if (!/^\d+$/.test(part)) throw new Error('Số trang cụ thể phải có dạng: 1, 3, 7')
      pages.push(Number(part))
      continue
    }

    if (/^\d+$/.test(part)) {
      pages.push(Number(part))
      continue
    }

    const match = part.match(/^(\d+)\s*-\s*(\d+)$/)
    if (!match) throw new Error('Khoảng trang phải có dạng: 1-3, 5, 8-10')
    const start = Number(match[1])
    const end = Number(match[2])
    if (end < start) throw new Error(`Khoảng trang không hợp lệ: ${part}`)
    for (let page = start; page <= end; page += 1) pages.push(page)
  }

  const unique = [...new Set(pages)].sort((a, b) => a - b)
  if (!unique.length) throw new Error('Không có trang nào phù hợp với lựa chọn')
  if (unique.some((page) => page < 1 || page > totalPages)) {
    throw new Error(`Số trang phải nằm trong khoảng 1-${totalPages}`)
  }
  return unique
}

function getPresetPosition(preset, pageWidth, pageHeight, markWidth, markHeight, margin = 18) {
  switch (preset) {
    case 'top-left':
      return { x: margin, y: margin }
    case 'top-right':
      return { x: pageWidth - markWidth - margin, y: margin }
    case 'bottom-left':
      return { x: margin, y: pageHeight - markHeight - margin }
    case 'bottom-right':
      return { x: pageWidth - markWidth - margin, y: pageHeight - markHeight - margin }
    case 'top':
      return { x: (pageWidth - markWidth) / 2, y: margin }
    case 'bottom':
      return { x: (pageWidth - markWidth) / 2, y: pageHeight - markHeight - margin }
    case 'center':
    default:
      return { x: (pageWidth - markWidth) / 2, y: (pageHeight - markHeight) / 2 }
  }
}

function buildPreviewPlacements(pageWidth, pageHeight, markWidth, markHeight, options) {
  if (!options.tiled) {
    const base = getPresetPosition(options.positionPreset, pageWidth, pageHeight, markWidth, markHeight)
    return [{ x: base.x + options.offsetX, y: base.y + options.offsetY }]
  }

  const stepX = markWidth + Math.max(markWidth * 0.65, 24)
  const stepY = markHeight + Math.max(markHeight * 0.9, 18)
  const placements = []

  for (let row = 0, y = -markHeight * 0.3 + options.offsetY; y < pageHeight + markHeight; row += 1, y += stepY) {
    const rowShift = row % 2 === 0 ? 0 : stepX / 2
    for (let x = -markWidth * 0.4 + options.offsetX - rowShift; x < pageWidth + markWidth; x += stepX) {
      placements.push({ x, y })
    }
  }

  return placements.slice(0, 80)
}

/* ─────────────────── Chi tiết các công cụ ─────────────────── */

function MergeTool() {
  const [files, setFiles] = useState([])
  const [busy, setBusy] = useState(false)

  const onDrop = useCallback((dropped) => {
    setFiles(prev => [...prev, ...dropped])
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { 'application/pdf': ['.pdf'] },
    onDrop,
  })

  const handleMerge = async () => {
    if (files.length < 2) { toast.error('Hãy thêm ít nhất 2 tệp PDF.'); return }
    setBusy(true)
    const tid = toast.loading(`Đang ghép ${files.length} tệp...`)
    try {
      const buffers = await Promise.all(files.map(f => f.arrayBuffer()))
      const bytes = await mergePdfs(buffers)
      downloadBytes(bytes, 'ghep-tai-lieu.pdf')
      toast.success(`Đã ghép thành công ${files.length} tệp PDF!`, { id: tid })
    } catch (e) { toast.error('Ghép PDF thất bại: ' + e.message, { id: tid }) }
    setBusy(false)
  }

  return (
    <ToolShell title="Ghép nhiều tệp PDF" desc="Gộp nhiều tệp PDF thành một tài liệu duy nhất theo thứ tự mong muốn. An toàn 100% trên thiết bị.">
      <div {...getRootProps()} className={`${styles.dropArea} ${isDragActive ? styles.dropActive : ''}`}>
        <input {...getInputProps()} />
        <Upload size={28} className={styles.uploadIcon} />
        <span>{isDragActive ? 'Thả tệp vào đây!' : 'Kéo thả các tệp PDF vào đây hoặc bấm để chọn'}</span>
      </div>
      {files.length > 0 && (
        <div className={styles.fileList}>
          {files.map((f, i) => (
            <div key={i} className={styles.fileChip}>
              <span className={styles.fileIndex}>{i + 1}</span>
              <FileText size={14} />
              <span className={styles.fileName}>{f.name}</span>
              <span className={styles.fileSize}>{(f.size/1024).toFixed(0)} KB</span>
              <button className={styles.removeBtn} onClick={() => setFiles(fs => fs.filter((_,j)=>j!==i))}><X size={12}/></button>
            </div>
          ))}
        </div>
      )}
      <ActionBtn onClick={handleMerge} disabled={files.length < 2} loading={busy} icon={Merge}>
        Ghép {files.length} tệp PDF → Tải xuống
      </ActionBtn>
    </ToolShell>
  )
}

function SplitTool() {
  const [file, setFile] = useState(null)
  const [mode, setMode] = useState('range')
  const [from, setFrom] = useState(1)
  const [to,   setTo]   = useState(1)
  const [every, setEvery] = useState(1)
  const [busy, setBusy] = useState(false)

  const handleSplit = async () => {
    if (!file) return
    setBusy(true)
    const tid = toast.loading('Đang tách PDF...')
    try {
      const buf = await file.arrayBuffer()
      const doc = await loadPdf(buf.slice(0))
      const total = doc.numPages
      let ranges = []

      if (mode === 'range')  ranges = [{ from, to: Math.min(to, total) }]
      if (mode === 'every')  { for (let i=1; i<=total; i+=every) ranges.push({ from: i, to: Math.min(i+every-1, total) }) }
      if (mode === 'all')    { for (let i=1; i<=total; i++) ranges.push({ from: i, to: i }) }

      const results = await splitPdf(buf, ranges)
      results.forEach((bytes, i) => downloadBytes(bytes, `tach-phan-${i+1}.pdf`))
      toast.success(`Đã tách thành công thành ${results.length} tệp!`, { id: tid })
    } catch (e) { toast.error('Tách PDF thất bại: ' + e.message, { id: tid }) }
    setBusy(false)
  }

  return (
    <ToolShell title="Tách tệp PDF" desc="Tách theo khoảng trang cụ thể, tách định kỳ mỗi N trang, hoặc tách từng trang thành các tệp độc lập.">
      <FileDropper file={file} onFile={setFile} onClear={() => setFile(null)} />
      <div className={styles.modeRow}>
        {[['range','Theo khoảng trang'],['every','Mỗi N trang'],['all','Tất cả các trang']].map(([v,l])=>(
          <button key={v} className={`${styles.modeBtn} ${mode===v?styles.modeBtnActive:''}`} onClick={()=>setMode(v)}>{l}</button>
        ))}
      </div>
      {mode === 'range' && (
        <div className={styles.rangeRow}>
          <label>Từ trang: <input type="number" min={1} value={from} onChange={e=>setFrom(+e.target.value)} className={styles.numInput}/></label>
          <label>Đến trang: <input type="number" min={1} value={to}   onChange={e=>setTo(+e.target.value)}   className={styles.numInput}/></label>
        </div>
      )}
      {mode === 'every' && (
        <div className={styles.rangeRow}>
          <label>Tách mỗi <input type="number" min={1} value={every} onChange={e=>setEvery(+e.target.value)} className={styles.numInput}/> trang một tệp</label>
        </div>
      )}
      <ActionBtn onClick={handleSplit} disabled={!file} loading={busy} icon={Scissors}>Tách và Tải xuống</ActionBtn>
    </ToolShell>
  )
}

function CompressTool() {
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [targetKb, setTargetKb] = useState('')
  const [preset, setPreset] = useState('balanced')
  const [progress, setProgress] = useState(null)

  const handleCompress = async () => {
    if (!file) return
    const targetBytes = targetKb ? Math.max(1, Number(targetKb)) * 1024 : null
    if (targetKb && (!Number.isFinite(targetBytes) || targetBytes <= 0)) {
      toast.error('Nhập dung lượng mục tiêu hợp lệ (KB).')
      return
    }
    if (targetBytes && targetBytes >= file.size) {
      toast.error('Dung lượng mục tiêu phải nhỏ hơn tệp gốc.')
      return
    }

    setBusy(true)
    setProgress(null)
    const tid = toast.loading(targetBytes ? 'Đang nén đến dung lượng mục tiêu...' : 'Đang tối ưu dung lượng tệp...')
    try {
      const buf = await file.arrayBuffer()
      const output = targetBytes
        ? await compressPdfToTarget(buf, {
            targetBytes,
            preset,
            onProgress: (p) => {
              setProgress(p)
              toast.loading(`Lần thử ${p.attempt}/${p.attempts} - trang ${p.page}/${p.pages}`, { id: tid })
            },
          })
        : { bytes: await compressPdf(buf), mode: 'lossless', reachedTarget: true }
      const bytes = output.bytes
      const saved = ((file.size - bytes.byteLength) / file.size * 100).toFixed(1)
      const name = `da-nen-${file.name}`
      downloadBytes(bytes, name)
      setResult({ original: file.size, compressed: bytes.byteLength, saved, ...output, targetBytes })
      toast.success(output.reachedTarget ? `Đã nén còn ${(bytes.byteLength/1024).toFixed(0)} KB (Tiết kiệm ${saved}%)` : `Dung lượng nhỏ nhất có thể: ${(bytes.byteLength/1024).toFixed(0)} KB`, { id: tid })
    } catch (e) { toast.error('Nén PDF thất bại: ' + e.message, { id: tid }) }
    setProgress(null)
    setBusy(false)
  }

  return (
    <ToolShell title="Nén dung lượng PDF" desc="Giảm dung lượng tệp PDF nhanh chóng, giữ độ nét văn bản để dễ dàng gửi email và tải lên mạng.">
      <FileDropper file={file} onFile={setFile} onClear={() => { setFile(null); setResult(null); setProgress(null) }} />
      <div className={styles.formGrid}>
        <div className={styles.formField}>
          <label className={styles.formLabel}>Dung lượng mục tiêu mong muốn (KB) — để trống nếu nén tối ưu</label>
          <input
            className={styles.formInput}
            type="number"
            min={1}
            value={targetKb}
            onChange={e=>setTargetKb(e.target.value)}
            placeholder={file ? `Ví dụ: ${Math.max(50, Math.round(file.size / 1024 * 0.4))}` : 'Ví dụ: 200'}
          />
        </div>
        <div className={styles.modeRow}>
          {[
            ['balanced', 'Cân bằng'],
            ['high', 'Chất lượng cao'],
            ['small', 'Dung lượng nhỏ nhất'],
          ].map(([id, label]) => (
            <button key={id} className={`${styles.modeBtn} ${preset===id?styles.modeBtnActive:''}`} onClick={()=>setPreset(id)}>{label}</button>
          ))}
        </div>
      </div>
      {result && (
        <div className={styles.resultBox}>
          <div className={styles.resultRow}><span>Dung lượng ban đầu</span><strong>{(result.original/1024).toFixed(0)} KB</strong></div>
          <div className={styles.resultRow}><span>Sau khi nén</span><strong>{(result.compressed/1024).toFixed(0)} KB</strong></div>
          <div className={`${styles.resultRow} ${styles.resultSaved}`}><span>Đã tiết kiệm</span><strong>{result.saved}%</strong></div>
        </div>
      )}
      <ActionBtn onClick={handleCompress} disabled={!file} loading={busy} icon={FileDown}>
        {targetKb ? `Nén xuống dưới ${targetKb} KB` : 'Nén tối ưu tệp PDF'}
      </ActionBtn>
    </ToolShell>
  )
}

function RotateTool() {
  const [file, setFile]   = useState(null)
  const [mode, setMode]   = useState('all')
  const [page, setPage]   = useState(1)
  const [angle, setAngle] = useState(90)
  const [busy, setBusy]   = useState(false)

  const handleRotate = async () => {
    if (!file) return
    setBusy(true)
    const tid = toast.loading('Đang xoay trang...')
    try {
      const buf = await file.arrayBuffer()
      const bytes = mode === 'all'
        ? await rotateAllPages(buf, angle)
        : await rotatePdf(buf, page, angle)
      downloadBytes(bytes, `da-xoay-${file.name}`)
      toast.success('Đã xoay trang và tải xuống thành công!', { id: tid })
    } catch (e) { toast.error('Xoay trang thất bại: ' + e.message, { id: tid }) }
    setBusy(false)
  }

  return (
    <ToolShell title="Xoay trang PDF" desc="Xoay tất cả các trang hoặc một trang cụ thể theo 90°, 180° hoặc 270°.">
      <FileDropper file={file} onFile={setFile} onClear={() => setFile(null)} />
      <div className={styles.modeRow}>
        {[['all','Tất cả các trang'],['single','Chỉ một trang']].map(([v,l])=>(
          <button key={v} className={`${styles.modeBtn} ${mode===v?styles.modeBtnActive:''}`} onClick={()=>setMode(v)}>{l}</button>
        ))}
      </div>
      {mode === 'single' && (
        <div className={styles.rangeRow}>
          <label>Trang cần xoay: <input type="number" min={1} value={page} onChange={e=>setPage(+e.target.value)} className={styles.numInput}/></label>
        </div>
      )}
      <div className={styles.angleRow}>
        {[90,180,270].map(a => (
          <button key={a} className={`${styles.angleBtn} ${angle===a?styles.angleBtnActive:''}`} onClick={()=>setAngle(a)}>
            <RotateCw size={14}/> {a}°
          </button>
        ))}
      </div>
      <ActionBtn onClick={handleRotate} disabled={!file} loading={busy} icon={RotateCcw}>Xoay {angle}° và Tải về</ActionBtn>
    </ToolShell>
  )
}

function WatermarkTool() {
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewSrc, setPreviewSrc] = useState('')
  const [previewDims, setPreviewDims] = useState({ width: 360, height: 480 })
  const [pageSize, setPageSize] = useState({ width: 595, height: 842 })
  const [pageCount, setPageCount] = useState(0)

  const [watermarkType, setWatermarkType] = useState('text')
  const [text, setText] = useState('BẢO MẬT')
  const [fontFamily, setFontFamily] = useState('Times-Roman')
  const [bold, setBold] = useState(true)
  const [italic, setItalic] = useState(false)
  const [color, setColor] = useState('#ef4444')
  const [size, setSize] = useState(48)
  const [opacity, setOpacity] = useState(20)
  const [rotation, setRotation] = useState(315)
  const [offsetX, setOffsetX] = useState(0)
  const [offsetY, setOffsetY] = useState(0)
  const [positionPreset, setPositionPreset] = useState('center')
  const [tiled, setTiled] = useState(false)
  const [pageMode, setPageMode] = useState('all')
  const [pageInput, setPageInput] = useState('')

  const [imageFile, setImageFile] = useState(null)
  const [imagePreviewUrl, setImagePreviewUrl] = useState('')
  const [imageDims, setImageDims] = useState({ width: 1, height: 1 })
  const [imageScale, setImageScale] = useState(28)

  useEffect(() => {
    if (!file) {
      setPreviewSrc('')
      setPageCount(0)
      return
    }

    let cancelled = false
    setPreviewLoading(true)

    ;(async () => {
      try {
        const buf = await file.arrayBuffer()
        const doc = await loadPdf(buf.slice(0))
        if (cancelled) return
        setPageCount(doc.numPages)
        const firstPage = await doc.getPage(1)
        const viewport = firstPage.getViewport({ scale: 1 })
        if (cancelled) return
        setPageSize({ width: viewport.width, height: viewport.height })
        const preview = await renderPage(1, 0.65)
        if (cancelled) return
        setPreviewSrc(preview.canvas.toDataURL('image/jpeg', 0.88))
        setPreviewDims({ width: preview.width, height: preview.height })
      } catch (e) {
        if (!cancelled) setPreviewSrc('')
      } finally {
        if (!cancelled) setPreviewLoading(false)
      }
    })()

    return () => { cancelled = true }
  }, [file])

  useEffect(() => {
    if (!imageFile) {
      setImagePreviewUrl('')
      setImageDims({ width: 1, height: 1 })
      return
    }

    const url = URL.createObjectURL(imageFile)
    setImagePreviewUrl(url)
    const img = new window.Image()
    img.onload = () => setImageDims({ width: img.width || 1, height: img.height || 1 })
    img.src = url
    return () => URL.revokeObjectURL(url)
  }, [imageFile])

  const previewScaleX = previewDims.width / pageSize.width
  const previewScaleY = previewDims.height / pageSize.height
  const previewFont = WATERMARK_FONT_OPTIONS.find((font) => font.id === fontFamily)?.css || WATERMARK_FONT_OPTIONS[0].css
  const previewFontSize = Math.max(size * previewScaleY, 12)
  const textMetrics = measurePreviewText(text || 'BẢO MẬT', previewFontSize, previewFont, bold, italic)
  const previewImageWidth = previewDims.width * (imageScale / 100)
  const previewImageHeight = previewImageWidth * (imageDims.height / imageDims.width)
  const previewMarkWidth = watermarkType === 'text' ? textMetrics.width : previewImageWidth
  const previewMarkHeight = watermarkType === 'text' ? textMetrics.height : previewImageHeight
  const previewItems = buildPreviewPlacements(previewDims.width, previewDims.height, previewMarkWidth, previewMarkHeight, {
    positionPreset,
    offsetX: offsetX * previewScaleX,
    offsetY: offsetY * previewScaleY,
    tiled,
  })

  const canApply = !!file && (
    (watermarkType === 'text' && text.trim()) ||
    (watermarkType === 'image' && imageFile)
  )

  const handleWatermark = async () => {
    if (!file) return

    let targetPages
    try {
      targetPages = parseWatermarkPages(pageMode, pageInput, pageCount)
    } catch (e) {
      toast.error(e.message)
      return
    }

    setBusy(true)
    const tid = toast.loading('Đang áp dụng dấu chìm...')
    try {
      const buf = await file.arrayBuffer()
      const options = {
        type: watermarkType,
        text: text.trim(),
        fontFamily,
        bold,
        italic,
        color,
        fontSize: size,
        opacity: opacity / 100,
        rotation,
        offsetX,
        offsetY,
        positionPreset,
        tiled,
        targetPages,
        imageScale,
      }

      if (watermarkType === 'image' && imageFile) {
        options.imageBytes = await imageFile.arrayBuffer()
        options.imageType = imageFile.type
      }

      const bytes = await addWatermark(buf, options)
      downloadBytes(bytes, `dau-chim-${file.name}`)
      toast.success(`Đã thêm dấu chìm vào ${targetPages.length} trang!`, { id: tid })
    } catch (e) {
      toast.error('Thao tác thất bại: ' + e.message, { id: tid })
    }
    setBusy(false)
  }

  return (
    <ToolShell title="Thêm dấu chìm (Watermark)" desc="Chèn dấu chìm chữ hoặc hình ảnh chống sao chép tài liệu, có xem trước trực tiếp." wide>
      <FileDropper file={file} onFile={setFile} onClear={() => setFile(null)} />
      <div className={styles.watermarkLayout}>
        <div className={styles.watermarkPanel}>
          <div className={styles.sectionCard}>
            <div className={styles.sectionCardTitle}>Loại dấu chìm</div>
            <div className={styles.modeRow}>
              <button className={`${styles.modeBtn} ${watermarkType === 'text' ? styles.modeBtnActive : ''}`} onClick={() => setWatermarkType('text')}>
                Dấu chìm chữ
              </button>
              <button className={`${styles.modeBtn} ${watermarkType === 'image' ? styles.modeBtnActive : ''}`} onClick={() => setWatermarkType('image')}>
                <ImageIcon size={13} /> Dấu chìm ảnh / logo
              </button>
            </div>

            {watermarkType === 'text' ? (
              <div className={styles.watermarkFieldGrid}>
                <div className={styles.formField}>
                  <label className={styles.formLabel}>Nội dung chữ</label>
                  <input className={styles.formInput} value={text} onChange={e => setText(e.target.value)} placeholder="Ví dụ: BẢO MẬT, BẢN SAO,..." />
                </div>
                <div className={styles.dualGrid}>
                  <div className={styles.formField}>
                    <label className={styles.formLabel}>Kiểu phông</label>
                    <select className={styles.formInput} value={fontFamily} onChange={e => setFontFamily(e.target.value)}>
                      {WATERMARK_FONT_OPTIONS.map((font) => (
                        <option key={font.id} value={font.id}>{font.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className={styles.formField}>
                    <label className={styles.formLabel}>Màu sắc</label>
                    <div className={styles.colorInputRow}>
                      <input className={styles.colorInput} type="color" value={color} onChange={e => setColor(e.target.value)} />
                      <input className={styles.formInput} value={color} onChange={e => setColor(e.target.value)} />
                    </div>
                  </div>
                </div>
                <div className={styles.toggleRow}>
                  <button className={`${styles.toggleBtn} ${bold ? styles.toggleBtnActive : ''}`} onClick={() => setBold(v => !v)}>In đậm</button>
                  <button className={`${styles.toggleBtn} ${italic ? styles.toggleBtnActive : ''}`} onClick={() => setItalic(v => !v)}>In nghiêng</button>
                </div>
              </div>
            ) : (
              <div className={styles.watermarkFieldGrid}>
                {imageFile ? (
                  <div className={styles.fileChip}>
                    <ImageIcon size={15} />
                    <span className={styles.fileName}>{imageFile.name}</span>
                    <button className={styles.removeBtn} onClick={() => setImageFile(null)}><X size={13} /></button>
                  </div>
                ) : (
                  <label className={styles.imageDropArea}>
                    <input type="file" accept="image/png,image/jpeg" hidden onChange={e => setImageFile(e.target.files?.[0] || null)} />
                    <ImageIcon size={18} />
                    <span>Chọn ảnh logo dấu chìm PNG / JPG</span>
                  </label>
                )}
              </div>
            )}
          </div>

          <div className={styles.sectionCard}>
            <div className={styles.sectionCardTitle}>Tùy chỉnh góc & Độ mờ</div>
            <div className={styles.formField}>
              <label className={styles.formLabel}>Cỡ chữ: {size}pt / Độ mờ: {opacity}%</label>
              <input type="range" min={18} max={120} value={size} onChange={e => setSize(+e.target.value)} className={styles.slider} />
              <input type="range" min={5} max={80} value={opacity} onChange={e => setOpacity(+e.target.value)} className={styles.slider} style={{ marginTop: 8 }} />
            </div>
            <label className={styles.checkPill}>
              <input type="checkbox" checked={tiled} onChange={e => setTiled(e.target.checked)} />
              Lặp lại phủ kín toàn trang (Tiled mode)
            </label>
          </div>
        </div>

        <div className={`${styles.watermarkPanel} ${styles.previewPanel}`}>
          <div className={styles.sectionCard}>
            <div className={styles.sectionCardTitle}>Xem trước trang 1</div>
            {previewLoading ? (
              <div className={styles.previewEmpty}><Loader2 size={18} className={styles.spin} /> Đang tải trang...</div>
            ) : previewSrc ? (
              <div className={styles.previewFrame} style={{ aspectRatio: `${previewDims.width} / ${previewDims.height}` }}>
                <img src={previewSrc} alt="Xem trước" className={styles.previewImage} />
                <div className={styles.previewOverlay}>
                  {previewItems.map((item, index) => (
                    watermarkType === 'text' ? (
                      <div
                        key={`${item.x}-${item.y}-${index}`}
                        className={styles.previewTextMark}
                        style={{
                          left: item.x,
                          top: item.y,
                          fontSize: previewFontSize,
                          fontFamily: previewFont,
                          fontWeight: bold ? 700 : 400,
                          fontStyle: italic ? 'italic' : 'normal',
                          color,
                          opacity: opacity / 100,
                          transform: `rotate(${rotation}deg)`,
                        }}
                      >
                        {text || 'BẢO MẬT'}
                      </div>
                    ) : null
                  ))}
                </div>
              </div>
            ) : (
              <div className={styles.previewEmpty}>Thêm tệp PDF để hiển thị xem trước.</div>
            )}
          </div>
          <ActionBtn onClick={handleWatermark} disabled={!canApply} loading={busy} icon={Droplets}>
            Đóng dấu chìm và Tải về
          </ActionBtn>
        </div>
      </div>
    </ToolShell>
  )
}

function ExtractTool() {
  const [file, setFile]   = useState(null)
  const [pages, setPages] = useState('')
  const [busy, setBusy]   = useState(false)

  const handleExtract = async () => {
    if (!file || !pages.trim()) return
    setBusy(true)
    const tid = toast.loading('Đang trích xuất trang...')
    try {
      const buf = await file.arrayBuffer()
      const nums = []
      for (const part of pages.split(',')) {
        const t = part.trim()
        if (t.includes('-')) {
          const [a,b] = t.split('-').map(Number)
          for (let i=a; i<=b; i++) nums.push(i)
        } else {
          const n = Number(t)
          if (!isNaN(n)) nums.push(n)
        }
      }
      const unique = [...new Set(nums)].sort((a,b)=>a-b)
      const bytes = await extractPages(buf, unique)
      downloadBytes(bytes, `trich-xuat-${file.name}`)
      toast.success(`Đã trích xuất thành công ${unique.length} trang!`, { id: tid })
    } catch (e) { toast.error('Trích xuất trang thất bại: ' + e.message, { id: tid }) }
    setBusy(false)
  }

  return (
    <ToolShell title="Trích xuất trang PDF" desc="Lấy các trang cụ thể từ tệp PDF và lưu thành một tệp tài liệu mới.">
      <FileDropper file={file} onFile={setFile} onClear={() => setFile(null)} />
      <div className={styles.formField}>
        <label className={styles.formLabel}>Nhập các trang cần trích xuất (Ví dụ: 1, 3, 5-8)</label>
        <input className={styles.formInput} value={pages} onChange={e=>setPages(e.target.value)} placeholder="1, 3, 5-8, 12" />
      </div>
      <ActionBtn onClick={handleExtract} disabled={!file || !pages.trim()} loading={busy} icon={FileSearch}>
        Trích xuất và Tải xuống
      </ActionBtn>
    </ToolShell>
  )
}

function ReorderTool() {
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)

  return (
    <ToolShell title="Sắp xếp lại thứ tự trang" desc="Kéo thả để sắp xếp lại các trang PDF theo trật tự mong muốn.">
      <FileDropper file={file} onFile={setFile} onClear={() => setFile(null)} />
      <div className={styles.infoBox}>
        💡 Để sắp xếp và xem trực tiếp tất cả các trang, bạn có thể mở trong <strong>Chỉnh sửa PDF</strong> để thao tác trực quan nhất!
      </div>
    </ToolShell>
  )
}

function EditTool() {
  const navigate = useNavigate()
  return (
    <ToolShell title="Chỉnh sửa tài liệu PDF" desc="Chỉnh sửa văn bản, chèn ảnh, con dấu, ghi chú và vẽ trực tiếp lên trang PDF.">
      <div className={styles.infoBox} style={{ marginBottom: 16 }}>
        ✨ Trình chỉnh sửa chuyên nghiệp của Nguyễn Mai Lĩnh tích hợp đầy đủ công cụ vẽ, tẩy xóa, chèn văn bản, chèn ảnh, xuất sang Word (.docx).
      </div>
      <ActionBtn onClick={() => navigate('/editor')} icon={Edit3}>
        Mở Trình Chỉnh Sửa Ngay
      </ActionBtn>
    </ToolShell>
  )
}

function OcrTool() {
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [text, setText] = useState('')

  const handleOcr = async () => {
    if (!file) return
    setBusy(true)
    const tid = toast.loading('Đang nhận dạng văn bản tiếng Việt...')
    try {
      const buf = await file.arrayBuffer()
      const doc = await loadPdf(buf)
      let full = ''
      for (let i = 1; i <= Math.min(doc.numPages, 5); i++) {
        const page = await renderPage(i, 1.5)
        const res = await ocrCanvas(page.canvas, 'vie')
        full += `--- TRANG ${i} ---\n` + (res.text || '') + '\n\n'
      }
      setText(full)
      toast.success('Nhận dạng chữ thành công!', { id: tid })
    } catch (e) {
      toast.error('Nhận dạng thất bại: ' + e.message, { id: tid })
    } finally {
      setBusy(false)
    }
  }

  return (
    <ToolShell title="Nhận dạng chữ (OCR Tiếng Việt)" desc="Trích xuất văn bản từ tài liệu scan hoặc ảnh chụp sang văn bản có thể sao chép và chỉnh sửa.">
      <FileDropper file={file} onFile={setFile} onClear={() => { setFile(null); setText('') }} />
      <ActionBtn onClick={handleOcr} disabled={!file} loading={busy} icon={ScanLine}>
        Bắt đầu nhận dạng OCR Tiếng Việt
      </ActionBtn>
      {text && (
        <div className={styles.formField} style={{ marginTop: 16 }}>
          <label className={styles.formLabel}>Kết quả nhận dạng:</label>
          <textarea className={styles.ocrResultTextarea} value={text} readOnly rows={10} />
          <button className={styles.copyBtn} onClick={() => { navigator.clipboard.writeText(text); toast.success('Đã sao chép vào bộ nhớ tạm!') }}>
            Sao chép toàn bộ
          </button>
        </div>
      )}
    </ToolShell>
  )
}

function ProtectTool() {
  const [file, setFile] = useState(null)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  const handleProtect = async () => {
    if (!file || !password) return
    setBusy(true)
    const tid = toast.loading('Đang mã hóa tài liệu...')
    try {
      const buf = await file.arrayBuffer()
      const bytes = await protectPdf(buf, password)
      downloadBytes(bytes, `bao-ve-${file.name}`)
      toast.success('Đã đặt mật khẩu bảo vệ thành công!', { id: tid })
    } catch (e) { toast.error('Lỗi bảo vệ: ' + e.message, { id: tid }) }
    setBusy(false)
  }

  return (
    <ToolShell title="Đặt mật khẩu bảo vệ PDF" desc="Mã hóa tệp PDF bằng mật khẩu an toàn, ngăn chặn mở xem tài liệu khi chưa được phép.">
      <FileDropper file={file} onFile={setFile} onClear={() => setFile(null)} />
      <div className={styles.formField}>
        <label className={styles.formLabel}>Nhập mật khẩu bảo vệ</label>
        <input className={styles.formInput} type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Nhập mật khẩu..." />
      </div>
      <ActionBtn onClick={handleProtect} disabled={!file || !password} loading={busy} icon={Lock}>
        Khóa tài liệu và Tải xuống
      </ActionBtn>
    </ToolShell>
  )
}

function UnlockTool() {
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)

  return (
    <ToolShell title="Gỡ mật khẩu PDF" desc="Gỡ bỏ mật khẩu đã biết và các giới hạn sao chép, in ấn trên tệp PDF.">
      <FileDropper file={file} onFile={setFile} onClear={() => setFile(null)} />
      <div className={styles.infoBox}>
        🔒 Tệp của bạn được xử lý an toàn nội bộ trong trình duyệt, không chia sẻ mật khẩu ra bên ngoài.
      </div>
    </ToolShell>
  )
}

function RedactTool() {
  const navigate = useNavigate()
  return (
    <ToolShell title="Che nội dung nhạy cảm (Redact)" desc="Che trắng vĩnh viễn các thông tin mật, số căn cước, số tài khoản trên tài liệu.">
      <div className={styles.infoBox} style={{ marginBottom: 16 }}>
        🛡️ Bạn có thể mở trực tiếp tài liệu trong <strong>Chỉnh sửa PDF</strong> để dùng công cụ che trắng (Redact) chính xác theo từng vùng chọn!
      </div>
      <ActionBtn onClick={() => navigate('/editor')} icon={EyeOff}>
        Mở trong Trình Chỉnh Sửa
      </ActionBtn>
    </ToolShell>
  )
}

function AddImageTool() {
  const [file, setFile] = useState(null)
  const [imgFile, setImgFile] = useState(null)
  const [page, setPage] = useState(1)
  const [busy, setBusy] = useState(false)

  const handleAdd = async () => {
    if (!file || !imgFile) return
    setBusy(true)
    const tid = toast.loading('Đang chèn ảnh vào trang...')
    try {
      const pdfBuf = await file.arrayBuffer()
      const imgBuf = await imgFile.arrayBuffer()
      const isPng = imgFile.type.includes('png')
      const bytes = await addImageToPdf(pdfBuf, imgBuf, page, 100, 100, 200, 150, isPng)
      downloadBytes(bytes, `da-chen-anh-${file.name}`)
      toast.success('Đã chèn ảnh vào PDF thành công!', { id: tid })
    } catch (e) { toast.error('Lỗi chèn ảnh: ' + e.message, { id: tid }) }
    setBusy(false)
  }

  return (
    <ToolShell title="Chèn ảnh & Con dấu vào PDF" desc="Chèn con dấu tròn, chữ ký, logo cơ quan hoặc hình ảnh vào bất kỳ trang nào của PDF.">
      <FileDropper file={file} onFile={setFile} onClear={() => setFile(null)} label="1. Chọn tệp PDF cần chèn ảnh" />
      <div className={styles.formField} style={{ marginTop: 12 }}>
        <label className={styles.formLabel}>2. Chọn hình ảnh con dấu / logo (PNG hoặc JPG)</label>
        <input type="file" accept="image/png,image/jpeg" className={styles.formInput} onChange={e => setImgFile(e.target.files?.[0] || null)} />
      </div>
      <div className={styles.rangeRow} style={{ marginTop: 12 }}>
        <label>Chèn vào trang số: <input type="number" min={1} value={page} onChange={e=>setPage(+e.target.value)} className={styles.numInput} /></label>
      </div>
      <ActionBtn onClick={handleAdd} disabled={!file || !imgFile} loading={busy} icon={ImageIcon}>
        Chèn ảnh và Tải PDF xuống
      </ActionBtn>
    </ToolShell>
  )
}

function WordToPdfTool() {
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)

  const handleConvert = async () => {
    if (!file) return
    setBusy(true)
    const tid = toast.loading('Đang chuyển đổi Word (.docx) sang PDF...')
    try {
      const buffer = await file.arrayBuffer()
      const pdfBytes = await convertDocxToPdf(buffer)
      const outName = file.name.replace(/\.[^/.]+$/, '') + '.pdf'
      downloadBytes(pdfBytes, outName, 'application/pdf')
      toast.success('Chuyển đổi Word sang PDF thành công!', { id: tid })
    } catch (e) {
      toast.error('Lỗi chuyển đổi: ' + e.message, { id: tid })
    } finally {
      setBusy(false)
    }
  }

  return (
    <ToolShell title="Chuyển Word sang PDF" desc="Chuyển đổi tài liệu Microsoft Word (.docx) sang định dạng PDF chuẩn, an toàn 100% trong trình duyệt.">
      <div className={styles.formField}>
        <label className={styles.formLabel}>Chọn tệp Word (.docx)</label>
        <input
          type="file"
          accept=".docx"
          className={styles.formInput}
          onChange={e => setFile(e.target.files?.[0] || null)}
        />
      </div>
      {file && (
        <div className={styles.fileChip} style={{ marginTop: 12 }}>
          <FileText size={15} />
          <span className={styles.fileName}>{file.name}</span>
          <span className={styles.fileSize}>{(file.size / 1024).toFixed(0)} KB</span>
          <button className={styles.removeBtn} onClick={() => setFile(null)}><X size={13} /></button>
        </div>
      )}
      <div className={styles.infoBox} style={{ marginTop: 12 }}>
        ✨ Xử lý trực tiếp trên trình duyệt bằng PDF Pro của Nguyễn Mai Lĩnh — Tệp không tải lên máy chủ, bảo mật tuyệt đối!
      </div>
      <ActionBtn onClick={handleConvert} disabled={!file} loading={busy} icon={FileDown}>
        Chuyển đổi sang PDF
      </ActionBtn>
    </ToolShell>
  )
}

function PdfToWordTool() {
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)

  const handleConvert = async () => {
    if (!file) return
    setBusy(true)
    const tid = toast.loading('Đang chuyển đổi PDF sang Word (.docx) giữ nguyên hiện trạng...')
    try {
      const buffer = await file.arrayBuffer()
      const docxBytes = await convertPdfToDocx(buffer, pdfjsLib)
      const outName = file.name.replace(/\.[^/.]+$/, '') + '.docx'
      downloadBytes(docxBytes, outName, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
      toast.success('Chuyển đổi sang Word (.docx) thành công!', { id: tid })
    } catch (e) {
      toast.error('Lỗi chuyển đổi: ' + e.message, { id: tid })
    } finally {
      setBusy(false)
    }
  }

  return (
    <ToolShell title="Chuyển PDF sang Word (.docx) — Chuẩn Bố Cục" desc="Giữ nguyên hiện trạng: căn lề, kiểu chữ, cỡ chữ, bảng 2 cột hành chính (Nghị định 30/2020/NĐ-CP). Cam kết không bổ sung hay bịa chữ thừa.">
      <FileDropper file={file} onFile={setFile} onClear={() => setFile(null)} label="Kéo thả tệp PDF cần chuyển đổi vào đây" />
      <div className={styles.infoBox} style={{ marginTop: 14 }}>
        📄 <strong>Cam kết chất lượng cao (High-Fidelity):</strong>
        <ul style={{ margin: '6px 0 0 18px', padding: 0, lineHeight: 1.6 }}>
          <li>Giữ nguyên 100% nội dung chữ gốc từ PDF, không thêm chữ thừa (Zero hallucination).</li>
          <li>Tự động nhận diện tiêu đề hành chính 2 cột (Cơ quan & Quốc hiệu) và chữ ký cuối trang.</li>
          <li>Đúng font chữ Times New Roman, in đậm, in nghiêng, cỡ chữ theo đúng chuẩn văn bản.</li>
          <li>Trang scan hoặc sơ đồ/ảnh được giữ nguyên hình ảnh độ sắc nét cao trong tệp Word.</li>
        </ul>
      </div>
      <ActionBtn onClick={handleConvert} disabled={!file} loading={busy} icon={FileText}>
        Bắt đầu chuyển sang Word (.docx)
      </ActionBtn>
    </ToolShell>
  )
}

/* ─────────────────── Danh sách công cụ & Danh mục ─────────────────── */

const TOOL_DEFS = [
  { id:'pdf-to-word', icon:FileText, label:'PDF sang Word (.docx)', color:'#2563eb', category:'Convert', desc:'Chuyển file PDF sang Word chuẩn bố cục, không bịa chữ, giữ nguyên hiện trạng.', badge:'Hot' },
  { id:'add-image', icon:ImageIcon, label:'Chèn ảnh & Con dấu', color:'#ec4899', category:'Edit', desc:'Chèn logo, con dấu đỏ, chữ ký lên trang PDF nhanh chóng.', badge:'Văn thư' },
  { id:'edit', icon:Edit3, label:'Chỉnh sửa PDF', color:'#e84545', category:'Edit', desc:'Chỉnh sửa văn bản, chèn ảnh, ghi chú và vẽ trực tiếp.', badge:'Chính' },
  { id:'word-to-pdf', icon:FileDown, label:'Word sang PDF', color:'#0284c7', category:'Convert', desc:'Chuyển tài liệu Word (.docx) sang PDF nhanh chóng.' },
  { id:'compress', icon:FileDown, label:'Nén dung lượng PDF', color:'#f59e0b', category:'Optimize', desc:'Nén giảm dung lượng tệp PDF để dễ dàng gửi email.' },
  { id:'merge', icon:Merge, label:'Ghép nhiều PDF', color:'#3b82f6', category:'Organize', desc:'Ghép nhiều tệp PDF thành một tài liệu duy nhất.' },
  { id:'split', icon:Scissors, label:'Tách tệp PDF', color:'#e84545', category:'Organize', desc:'Tách theo khoảng trang hoặc tách định kỳ mỗi N trang.' },
  { id:'extract', icon:FileSearch, label:'Trích xuất trang', color:'#f59e0b', category:'Organize', desc:'Trích các trang đã chọn thành một tệp PDF mới.' },
  { id:'rotate', icon:RotateCcw, label:'Xoay trang PDF', color:'#8b5cf6', category:'Organize', desc:'Xoay trang 90°, 180° hoặc 270° theo hướng đọc.' },
  { id:'watermark', icon:Droplets, label:'Thêm dấu chìm', color:'#06b6d4', category:'Secure', desc:'Đóng dấu chìm chữ hoặc logo bản quyền chống sao chép.' },
  { id:'ocr', icon:ScanLine, label:'Nhận dạng chữ (OCR)', color:'#10b981', category:'Convert', desc:'Trích xuất văn bản tiếng Việt từ PDF scan hoặc ảnh chụp.' },
  { id:'protect', icon:Lock, label:'Bảo vệ mật khẩu', color:'#e84545', category:'Secure', desc:'Đặt mật khẩu mã hóa an toàn cho tệp tài liệu.' },
  { id:'unlock', icon:Unlock, label:'Mở khóa PDF', color:'#10b981', category:'Secure', desc:'Gỡ bỏ mật khẩu và các giới hạn sao chép, in ấn.' },
  { id:'redact', icon:EyeOff, label:'Che nội dung mật', color:'#ffffff', category:'Secure', desc:'Che trắng vĩnh viễn các vùng dữ liệu nhạy cảm.' },
  { id:'multi-page-layout', icon:Grid2X2, label:'Bố cục nhiều trang', color:'#a78bfa', category:'Organize', desc:'Sắp xếp nhiều trang PDF lên cùng một mặt giấy in.' },
]

const TOOL_COMPONENTS = {
  'pdf-to-word': PdfToWordTool,
  'add-image': AddImageTool,
  edit: EditTool,
  'word-to-pdf': WordToPdfTool,
  compress: CompressTool,
  merge: MergeTool,
  split: SplitTool,
  extract: ExtractTool,
  rotate: RotateTool,
  watermark: WatermarkTool,
  ocr: OcrTool,
  protect: ProtectTool,
  unlock: UnlockTool,
  redact: RedactTool,
  reorder: ReorderTool,
}

const CATEGORIES = ['All', 'Convert', 'Edit', 'Organize', 'Optimize', 'Secure']
const CATEGORY_LABELS = {
  All: 'Tất cả công cụ',
  Convert: 'Chuyển đổi định dạng',
  Edit: 'Chỉnh sửa & Chèn ảnh',
  Organize: 'Sắp xếp & Ghép tách',
  Optimize: 'Tối ưu dung lượng',
  Secure: 'Bảo mật & Đóng dấu',
}

export default function Tools() {
  const location = useLocation()
  const navigate = useNavigate()
  const [activeCat, setActiveCat] = useState('All')
  const [activeTool, setActiveTool] = useState(location.state?.defaultTool || null)

  useEffect(() => {
    if (location.state?.defaultTool) {
      setActiveTool(location.state.defaultTool)
    }
  }, [location.state])

  const filtered = activeCat === 'All' ? TOOL_DEFS : TOOL_DEFS.filter(t => t.category === activeCat)
  const ToolUI = activeTool ? TOOL_COMPONENTS[activeTool] : null

  return (
    <div className={styles.page}>
      <Navbar variant="app" />
      <div className={styles.layout}>
        {/* Thanh bên phân loại công cụ */}
        <div className={styles.sidebar}>
          <div className={styles.sidebarHeader}>
            <span className={styles.sidebarTitle}>Danh mục công cụ</span>
            <span className={styles.toolCount}>{TOOL_DEFS.length} tính năng</span>
          </div>

          <div className={styles.cats}>
            {CATEGORIES.map(c => (
              <button
                key={c}
                className={`${styles.catBtn} ${activeCat === c ? styles.catActive : ''}`}
                onClick={() => { setActiveCat(c); setActiveTool(null); }}
              >
                {CATEGORY_LABELS[c]}
              </button>
            ))}
          </div>

          <div className={styles.toolList}>
            {filtered.map(tool => {
              const Icon = tool.icon
              return (
                <button
                  key={tool.id}
                  className={`${styles.toolListItem} ${activeTool === tool.id ? styles.toolListActive : ''}`}
                  onClick={() => tool.id === 'multi-page-layout' ? navigate('/tools/multi-page-layout') : setActiveTool(tool.id)}
                >
                  <div className={styles.toolListIcon} style={{ background: tool.color + '18' }}>
                    <Icon size={15} style={{ color: tool.color }} />
                  </div>
                  <div className={styles.toolListInfo}>
                    <span className={styles.toolListName}>{tool.label}</span>
                    <span className={styles.toolListCat}>{CATEGORY_LABELS[tool.category]}</span>
                  </div>
                  {tool.badge && <span className={styles.itemBadge}>{tool.badge}</span>}
                  <ChevronRight size={12} className={styles.toolListArrow} />
                </button>
              )
            })}
          </div>

          {/* Khối tác quyền chân trang */}
          <div className={styles.sidebarAuthorCard}>
            <div className={styles.authorCardTitle}>
              <Award size={13} className={styles.authorCardIcon} />
              Bản quyền ứng dụng
            </div>
            <div className={styles.authorCardName}>Nguyễn Mai Lĩnh</div>
            <div className={styles.authorCardDesc}>Hệ thống xử lý PDF Pro bảo mật 100% nội bộ trên trình duyệt.</div>
          </div>
        </div>

        {/* Vùng nội dung chính */}
        <div className={styles.content}>
          {ToolUI ? (
            <>
              <button className={styles.backBtn} onClick={() => setActiveTool(null)}>
                <ArrowLeft size={14} /> Quay lại danh sách công cụ
              </button>
              <ToolUI />
            </>
          ) : (
            <div className={styles.toolGrid}>
              {/* Header trang công cụ */}
              <div className={styles.toolGridHeader}>
                <div className={styles.badgeBanner}>
                  <Sparkles size={14} /> BỘ CÔNG CỤ PDF CHUYÊN NGHIỆP • NGUYỄN MAI LĨNH
                </div>
                <h1 className={styles.toolGridTitle}>Toàn Bộ Công Cụ Xử Lý PDF</h1>
                <p className={styles.toolGridSub}>
                  Hoạt động 100% trực tiếp trong trình duyệt máy bạn — Không tải tệp lên máy chủ, bảo mật tuyệt đối, miễn phí và không giới hạn.
                </p>
              </div>

              {/* Lưới các thẻ công cụ */}
              <div className={styles.cards}>
                {filtered.map(tool => {
                  const Icon = tool.icon
                  return (
                    <div
                      key={tool.id}
                      className={styles.toolCard}
                      onClick={() => tool.id === 'multi-page-layout' ? navigate('/tools/multi-page-layout') : setActiveTool(tool.id)}
                    >
                      <div className={styles.toolCardTop}>
                        <div className={styles.toolCardIcon} style={{ background: tool.color + '18' }}>
                          <Icon size={22} style={{ color: tool.color }} />
                        </div>
                        {tool.badge && (
                          <span className={styles.hotBadge}>{tool.badge}</span>
                        )}
                      </div>
                      <div className={styles.toolCardName}>{tool.label}</div>
                      <div className={styles.toolCardDesc}>{tool.desc}</div>
                      <div className={styles.toolCardFooter}>
                        <span className={styles.freeBadge}>Miễn phí 100%</span>
                        <span className={styles.actionPrompt}>Mở công cụ →</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
