import React, { useState, useEffect, useRef } from 'react'
import {
  MousePointer2, Type, Image, Pencil, Square, PenLine,
  Highlighter, EyeOff, Undo2, Redo2, ZoomIn, ZoomOut,
  Download, Scan, Sparkles, Loader2, Bold, Italic, Underline,
  PanelLeft, SlidersHorizontal
} from 'lucide-react'
import toast from 'react-hot-toast'
import { usePdfStore } from '../../store/pdfStore.js'
import { exportPdf, downloadBytes } from '../../lib/pdfExporter.js'
import { renderPage } from '../../lib/pdfRenderer.js'
import { ocrCanvas } from '../../lib/ocrEngine.js'
import { convertPdfToDocx } from '../../lib/docxEngine.js'
import * as pdfjsLib from 'pdfjs-dist'
import DropZone from '../ui/DropZone.jsx'
import ShortcutsHelp from './ShortcutsHelp.jsx'
import styles from './EditorToolbar.module.css'

const TOOLS = [
  { id: 'select',    icon: MousePointer2, label: 'Chọn và sửa chữ' },
  { id: 'text',      icon: Type,          label: 'Thêm hộp văn bản' },
  { id: 'image',     icon: Image,          label: 'Thêm hình ảnh' },
  { id: 'draw',      icon: Pencil,        label: 'Vẽ' },
  { id: 'shape',     icon: Square,        label: 'Hình dạng' },
  { id: 'sign',      icon: PenLine,       label: 'Ký tên' },
  { id: 'highlight', icon: Highlighter,   label: 'Tô sáng' },
  { id: 'redact',    icon: EyeOff,        label: 'Che nội dung' },
]

const FONTS = [
  'Arial', 'Helvetica', 'Times New Roman', 'Georgia',
  'Courier New', 'Verdana', 'Tahoma', 'Trebuchet MS',
  'Calibri', 'Cambria', 'Garamond', 'Palatino',
]

export default function EditorToolbar() {
  const {
    activeTool, setActiveTool, zoom, setZoom,
    file, editLayers, pageCount, fileName, pageBgs, blockBgs,
    currentPage, addTextBlock,
    selectedElement, selectedElementPage,
    updateTextBlock, commitExtractedEdit,
    undoEdit, redoEdit,
    mobilePagesOpen, mobilePropertiesOpen,
    setMobilePagesOpen, setMobilePropertiesOpen,
  } = usePdfStore()

  const [ocrRunning,   setOcrRunning]   = useState(false)
  const [ocrProgress,  setOcrProgress]  = useState(0)
  const [wordExporting, setWordExporting] = useState(false)
  const imageInputRef = useRef(null)

  const handleImageUpload = (e) => {
    const imgFile = e.target.files?.[0]
    if (!imgFile) return
    const reader = new FileReader()
    reader.onload = () => {
      const img = new window.Image()
      img.onload = () => {
        const aspect = img.width / img.height
        const targetWidth = Math.min(220, Math.max(100, img.width))
        const targetHeight = targetWidth / aspect
        addTextBlock(currentPage, {
          id: `img-${Date.now()}`,
          type: 'image',
          x: 100,
          y: 100,
          width: targetWidth,
          height: targetHeight,
          imageData: reader.result,
          imageType: imgFile.type,
          str: '',
        })
        toast.success('Đã thêm hình ảnh vào trang!')
      }
      img.src = reader.result
    }
    reader.readAsDataURL(imgFile)
    e.target.value = ''
  }

  // Mirror selected element's current formatting in the toolbar
  const sel = selectedElement
  const [fontFamily, setFontFamily] = useState('Arial')
  const [fontSize,   setFontSize]   = useState(12)
  const [bold,       setBold]       = useState(false)
  const [italic,     setItalic]     = useState(false)
  const [underline,  setUnderline]  = useState(false)
  const [color,      setColor]      = useState('#000000')

  // Sync toolbar state when selection changes
  useEffect(() => {
    if (!sel) return
    // Extract CSS font-family to a simple name for the dropdown
    const rawFamily = sel.fontFamily || 'Arial'
    const match = FONTS.find(f => rawFamily.toLowerCase().includes(f.toLowerCase()))
    setFontFamily(match || 'Arial')
    setFontSize(Math.round(sel.fontSize || 12))
    setBold(sel.fontBold   || false)
    setItalic(sel.fontItalic || false)
    setUnderline(sel.fontUnderline || false)
    setColor(sel.color || '#000000')
  }, [sel?.id, sel?.fontBold, sel?.fontItalic, sel?.fontSize, sel?.color])

  // Apply a formatting update to the selected element
  const applyFormat = (updates) => {
    if (!sel || !selectedElementPage) return

    if (sel.isExtracted && !sel.isEdited) {
      // Commit the extracted block first, then update
      commitExtractedEdit(selectedElementPage, sel, sel.str)
      updateTextBlock(selectedElementPage, `edited-${sel.id}`, updates)
    } else {
      updateTextBlock(selectedElementPage, sel.id, updates)
    }
  }

  const handleFontFamily = (f) => {
    setFontFamily(f)
    // Map display name to CSS stack
    const cssMap = {
      'Arial':          'Arial, "Noto Sans", Helvetica, sans-serif',
      'Helvetica':      'Helvetica, Arial, sans-serif',
      'Times New Roman':'"Times New Roman", "Noto Serif", Times, serif',
      'Georgia':        'Georgia, "Noto Serif", serif',
      'Courier New':    '"Courier New", Courier, monospace',
      'Verdana':        'Verdana, Arial, sans-serif',
      'Tahoma':         'Tahoma, Arial, sans-serif',
      'Trebuchet MS':   '"Trebuchet MS", Arial, sans-serif',
      'Calibri':        'Calibri, Arial, sans-serif',
      'Cambria':        'Cambria, Georgia, serif',
      'Garamond':       'Garamond, Georgia, serif',
      'Palatino':       '"Palatino Linotype", Georgia, serif',
    }
    applyFormat({ fontFamily: cssMap[f] || f, fontName: f })
  }

  const handleFontSize = (v) => {
    const n = Math.max(4, Math.min(200, Number(v)))
    setFontSize(n)
    applyFormat({ fontSize: n })
  }

  const handleBold = () => {
    const next = !bold
    setBold(next)
    applyFormat({ fontBold: next })
  }

  const handleItalic = () => {
    const next = !italic
    setItalic(next)
    applyFormat({ fontItalic: next })
  }

  const handleUnderline = () => {
    const next = !underline
    setUnderline(next)
    applyFormat({ fontUnderline: next })
  }

  const handleColor = (v) => {
    setColor(v)
    applyFormat({ color: v })
  }

  const handleUndo = () => {
    if (!undoEdit()) { toast('Không có thao tác nào để hoàn tác'); return }
    toast('Đã hoàn tác', { duration: 800 })
  }

  const handleRedo = () => {
    if (!redoEdit()) { toast('Không có thao tác nào để làm lại'); return }
    toast('Đã làm lại', { duration: 800 })
  }

  const handleExport = async () => {
    if (!file) { toast.error('Chưa có tệp PDF nào được mở'); return }
    const tid = toast.loading('Đang xuất PDF...')
    try {
      const bytes = await exportPdf(file, editLayers, pageCount, pageBgs, blockBgs)
      downloadBytes(bytes, `pdfpro-da-chinh-sua-${fileName || 'da-chinh-sua.pdf'}`)
      toast.success('Đã tải PDF!', { id: tid })
    } catch (e) {
      toast.error('Xuất PDF thất bại: ' + e.message, { id: tid })
    }
  }

  const handleWordExport = async () => {
    if (!file || wordExporting) return
    setWordExporting(true)
    const tid = toast.loading('Đang tạo tệp Word giữ nguyên bố cục PDF...')
    try {
      const pdfBytes = await exportPdf(file, editLayers, pageCount, pageBgs, blockBgs)
      const docxBytes = await convertPdfToDocx(pdfBytes, pdfjsLib)
      const baseName = (fileName || 'tai-lieu.pdf').replace(/\.pdf$/i, '')
      downloadBytes(
        docxBytes,
        `${baseName}.docx`,
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      )
      toast.success('Đã xuất tệp Word giữ nguyên hình thức PDF!', { id: tid })
    } catch (e) {
      toast.error('Không thể xuất Word: ' + e.message, { id: tid })
    } finally {
      setWordExporting(false)
    }
  }

  const handleOcr = async () => {
    if (!file || ocrRunning) return
    setOcrRunning(true); setOcrProgress(0)
    const tid = toast.loading('Đang khởi động nhận dạng chữ...')
    try {
      const { canvas } = await renderPage(currentPage, 1)
      const words = await ocrCanvas(canvas, pct => {
        setOcrProgress(pct)
        toast.loading(`OCR: ${pct}%`, { id: tid })
      })
      if (!words.length) { toast.error('Không tìm thấy văn bản', { id: tid }); return }
      words.forEach(w => addTextBlock(currentPage, w))
      toast.success(`Đã nhận dạng ${words.length} từ`, { id: tid })
    } catch (e) {
      toast.error('Nhận dạng chữ thất bại: ' + e.message, { id: tid })
    } finally { setOcrRunning(false); setOcrProgress(0) }
  }

  const hasSelection = !!sel

  return (
    <div className={styles.toolbar}>
      {/* Mobile-only: toggle the Pages drawer (hidden on desktop, panel is always visible there) */}
      <button
        className={`${styles.toolBtn} ${styles.mobileOnly} ${mobilePagesOpen ? styles.active : ''}`}
        onClick={() => setMobilePagesOpen(!mobilePagesOpen)}
        title="Trang" aria-label="Bật/tắt bảng trang"
      >
        <PanelLeft size={16} />
      </button>

      <DropZone compact />
      <div className={styles.sep} />

      {/* Drawing tools */}
      <input
        type="file"
        ref={imageInputRef}
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleImageUpload}
      />
      <div className={styles.toolGroup}>
        {TOOLS.map(({ id, icon: Icon, label }) => (
          <button key={id}
            className={`${styles.toolBtn} ${styles.toolGroupBtn} ${activeTool === id ? styles.active : ''}`}
            onClick={() => {
              if (id === 'image') {
                imageInputRef.current?.click()
                return
              }
              setActiveTool(id)
            }}
            title={label} aria-label={label}
          >
            <Icon size={21} />
            <span className={styles.toolLabel}>{label}</span>
          </button>
        ))}
      </div>

      <div className={`${styles.sep} ${styles.desktopOnly}`} />

      {/* Font family — hidden on mobile; use the Properties drawer instead (less crowding) */}
      <select
        className={`${styles.select} ${styles.desktopOnly}`}
        value={fontFamily}
        onChange={e => handleFontFamily(e.target.value)}
        disabled={!hasSelection}
        title="Phông chữ"
        aria-label="Phông chữ"
      >
        {FONTS.map(f => <option key={f} value={f}>{f}</option>)}
      </select>

      {/* Font size */}
      <input
        type="number"
        className={`${styles.numInput} ${styles.desktopOnly}`}
        value={fontSize}
        min={4} max={200}
        disabled={!hasSelection}
        onChange={e => handleFontSize(e.target.value)}
        title="Cỡ chữ"
        aria-label="Cỡ chữ"
      />

      {/* Bold */}
      <button
        className={`${styles.fmtBtn} ${styles.desktopOnly} ${bold ? styles.fmtActive : ''}`}
        onClick={handleBold}
        disabled={!hasSelection}
        title="Đậm (áp dụng khi xuất tệp)"
        aria-label="Đậm"
        aria-pressed={bold}
      >
        <Bold size={14} />
      </button>

      {/* Italic */}
      <button
        className={`${styles.fmtBtn} ${styles.desktopOnly} ${italic ? styles.fmtActive : ''}`}
        onClick={handleItalic}
        disabled={!hasSelection}
        title="Nghiêng (áp dụng khi xuất tệp)"
        aria-label="Nghiêng"
        aria-pressed={italic}
      >
        <Italic size={14} />
      </button>

      {/* Underline — CSS only, marks in store */}
      <button
        className={`${styles.fmtBtn} ${styles.desktopOnly} ${underline ? styles.fmtActive : ''}`}
        onClick={handleUnderline}
        disabled={!hasSelection}
        title="Gạch chân"
        aria-label="Gạch chân"
        aria-pressed={underline}
      >
        <Underline size={14} />
      </button>

      <div className={`${styles.sep} ${styles.desktopOnly}`} />

      {/* Color */}
      <input
        type="color"
        className={`${styles.colorPicker} ${styles.desktopOnly}`}
        value={color}
        disabled={!hasSelection}
        onChange={e => handleColor(e.target.value)}
        title="Màu chữ"
        aria-label="Màu chữ"
      />

      <div className={styles.sep} />

      {/* Undo / Redo */}
      <button className={styles.toolBtn} onClick={handleUndo} title="Hoàn tác (Ctrl+Z)" aria-label="Hoàn tác">
        <Undo2 size={15} />
      </button>
      <button className={styles.toolBtn} onClick={handleRedo} title="Làm lại (Ctrl+Y)" aria-label="Làm lại">
        <Redo2 size={15} />
      </button>

      <div className={styles.sep} />

      {/* Zoom */}
      <button className={styles.toolBtn} onClick={() => setZoom(zoom - 0.2)} title="Thu nhỏ"><ZoomOut size={15} /></button>
      <span className={styles.zoomLabel}>{Math.round(zoom * 100)}%</span>
      <button className={styles.toolBtn} onClick={() => setZoom(zoom + 0.2)} title="Phóng to"><ZoomIn size={15} /></button>

      <ShortcutsHelp />

      <div className={styles.spacer} />

      <button
        className={`${styles.aiBtn} ${ocrRunning ? styles.aiBtnActive : ''}`}
        onClick={handleOcr} disabled={ocrRunning || !file}
      >
        {ocrRunning
          ? <><Loader2 size={13} className={styles.spin} /> OCR {ocrProgress}%</>
          : <><Scan size={13} /> OCR</>}
      </button>

      <button className={styles.aiBtn} onClick={() => toast('Tính năng khớp phông chữ bằng AI sẽ có trong phiên bản sau', { icon: '✨' })}>
        <Sparkles size={13} /> Sửa bằng AI
      </button>

      <div className={styles.sep} />

      <div className={styles.sep} />

      {/* Mobile-only: toggle the Properties drawer */}
      <button
        className={`${styles.toolBtn} ${styles.mobileOnly} ${mobilePropertiesOpen ? styles.active : ''}`}
        onClick={() => setMobilePropertiesOpen(!mobilePropertiesOpen)}
        title="Thuộc tính" aria-label="Bật/tắt bảng thuộc tính"
      >
        <SlidersHorizontal size={16} />
      </button>

      <button className={styles.wordExportBtn} onClick={handleWordExport} disabled={!file || wordExporting} title="Xuất mỗi trang PDF thành ảnh trong tài liệu Word">
        {wordExporting ? <Loader2 size={14} className={styles.spin} /> : <Download size={14} />} {wordExporting ? 'Đang xuất Word…' : 'Xuất Word'}
      </button>
      <button className={styles.exportBtn} onClick={handleExport} disabled={!file}>
        <Download size={14} /> Tải PDF
      </button>
    </div>
  )
}
