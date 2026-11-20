import React, { useState } from 'react'
import { FileText, Layers, Info, Lock, Droplets, EyeOff, Palette } from 'lucide-react'
import toast from 'react-hot-toast'
import { usePdfStore } from '../../store/pdfStore.js'
import { addWatermark, downloadBytes, exportPdf } from '../../lib/pdfExporter.js'
import { convertPdfToDocx } from '../../lib/docxEngine.js'
import * as pdfjsLib from 'pdfjs-dist'
import styles from './PropertiesPanel.module.css'

export default function PropertiesPanel() {
  const [wordExporting, setWordExporting] = useState(false)
  const {
    selectedElement, selectedElementPage,
    file, fileName, pageCount, editLayers, pageBgs, blockBgs,
    updateTextBlock, commitExtractedEdit,
  } = usePdfStore()

  const totalEdits = Object.values(editLayers).reduce(
    (sum, layer) => sum + (layer.texts?.length || 0) + (layer.annotations?.length || 0), 0
  )

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
    } catch (error) {
      toast.error('Không thể xuất Word: ' + error.message, { id: tid })
    } finally {
      setWordExporting(false)
    }
  }

  // Update a property on the selected element (works for both store & extracted)
  const updateProp = (updates) => {
    if (!selectedElement || !selectedElementPage) return
    const targetId = selectedElement.isExtracted && !selectedElement.isEdited
      ? `edited-${selectedElement.id}`
      : selectedElement.id
    // For extracted blocks that haven't been committed yet, commitExtractedEdit
    // For store blocks (user-added or already-committed), updateTextBlock
    if (selectedElement.isExtracted && !selectedElement.isEdited) {
      commitExtractedEdit(selectedElementPage, selectedElement, selectedElement.str)
    }
    updateTextBlock(selectedElementPage, targetId, updates)
    // Also update selectedElement in store so UI reflects immediately
  }

  const handleWatermark = async () => {
    if (!file) return
    const text = window.prompt('Nội dung hình mờ:', 'BẢO MẬT')
    if (!text) return
    const tid = toast.loading('Đang thêm hình mờ...')
    try {
      const bytes = await addWatermark(file, text)
      downloadBytes(bytes, `hinh-mo-${fileName}`)
      toast.success('Đã tải xuống!', { id: tid })
    } catch (error) { toast.error('Không thể thêm hình mờ: ' + error.message, { id: tid }) }
  }

  // Clean font name for display
  const displayFont = (name) => {
    if (!name) return 'Không xác định'
    return name
      .replace(/^[A-Z]{6}\+/, '')
      .replace(/-(Bold|Italic|Oblique|Regular)/gi, '')
      .replace(/^g_[a-z0-9]+_/i, '')
      .slice(0, 22)
  }

  return (
    <div className={styles.panel}>

      {/* Document info */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}><Info size={12} /> Tài liệu</div>
        <div className={styles.row}><span className={styles.lbl}>Số trang</span><span className={styles.val}>{pageCount || '—'}</span></div>
        <div className={styles.row}><span className={styles.lbl}>Lượt chỉnh sửa</span><span className={styles.val}>{totalEdits}</span></div>
        <div className={styles.row}><span className={styles.lbl}>Tệp</span><span className={styles.val} style={{ fontSize: 10, maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fileName || '—'}</span></div>
      </div>

      {/* Selection properties — only when something is selected */}
      {selectedElement ? (
        <div className={styles.section}>
          <div className={styles.sectionTitle}><Layers size={12} /> Vùng chọn</div>

          {/* Detected font badge */}
          <div className={styles.detectedFont}>
            <Palette size={11} />
            {displayFont(selectedElement.fontName)}
            {selectedElement.isExtracted && !selectedElement.isEdited && (
              <span className={styles.extractedBadge}>PDF gốc</span>
            )}
          </div>

          {/* Text preview */}
          <div className={styles.textPreview}>
            {selectedElement.str?.slice(0, 60) || '(empty)'}
            {(selectedElement.str?.length || 0) > 60 ? '…' : ''}
          </div>

          {/* Font family */}
          <div className={styles.row}>
            <span className={styles.lbl}>Phông chữ</span>
            <select
              className={styles.ctrl}
              defaultValue="Helvetica"
              onChange={e => updateProp({ fontName: e.target.value })}
            >
              {['Helvetica', 'Times New Roman', 'Times-Roman', 'Courier New', 'Courier', 'Georgia', 'Arial'].map(f => (
                <option key={f} value={f}>{f.replace('Times-Roman','Times Roman')}</option>
              ))}
            </select>
          </div>

          {/* Font size */}
          <div className={styles.row}>
            <span className={styles.lbl}>Cỡ chữ</span>
            <input
              type="number" min={4} max={200}
              className={styles.numCtrl}
              defaultValue={Math.round(selectedElement.fontSize || 12)}
              onChange={e => updateProp({ fontSize: Math.max(4, Number(e.target.value)) })}
            />
          </div>

          {/* Color — shows the DETECTED color from PDF */}
          <div className={styles.row}>
            <span className={styles.lbl}>Màu sắc</span>
            <div className={styles.colorRow}>
              <input
                type="color"
                className={styles.colorCtrl}
                defaultValue={selectedElement.color || '#000000'}
                onChange={e => updateProp({ color: e.target.value })}
              />
              <span className={styles.colorHex}>{selectedElement.color || '#000000'}</span>
            </div>
          </div>

          {/* Position readout */}
          <div className={styles.row}>
            <span className={styles.lbl}>X</span>
            <span className={styles.val} style={{ fontFamily: 'var(--font-mono)' }}>{Math.round(selectedElement.x)}</span>
          </div>
          <div className={styles.row}>
            <span className={styles.lbl}>Y</span>
            <span className={styles.val} style={{ fontFamily: 'var(--font-mono)' }}>{Math.round(selectedElement.y)}</span>
          </div>
        </div>
      ) : (
        <div className={styles.section}>
          <div className={styles.sectionTitle}><Layers size={12} /> Vùng chọn</div>
          <div className={styles.emptyHint}>
            Nhấp vào văn bản trong PDF để chọn, sau đó nhấp đúp để chỉnh sửa
          </div>
        </div>
      )}

      {/* Actions */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}><FileText size={12} /> Thao tác</div>
        <div className={styles.actionList}>
          <button className={styles.actionBtn} onClick={handleWatermark}>
            <Droplets size={13} /> Thêm hình mờ
          </button>
          <button className={styles.actionBtn} onClick={() => toast('Chọn công cụ Che nội dung trên thanh công cụ, sau đó kéo qua vùng cần che', { icon: '🔲' })}>
            <EyeOff size={13} /> Che nội dung
          </button>
          <button className={styles.actionBtn} onClick={() => toast('Để đặt mật khẩu, hãy mở trang Tất cả công cụ', { icon: '🔒' })}>
            <Lock size={13} /> Đặt mật khẩu
          </button>
        </div>
      </div>

      {/* Export as */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Xuất thành</div>
        <div className={styles.actionList}>
          <button className={styles.actionBtn} onClick={handleWordExport} disabled={!file || wordExporting}>{wordExporting ? 'Đang xuất Word…' : '📄 Xuất Word (.docx)'}</button>
          <button className={styles.actionBtn} onClick={() => toast('Tính năng xuất ảnh sẽ có trong phiên bản sau', { icon: '🖼' })}>🖼 Hình ảnh (PNG)</button>
          <button className={styles.actionBtn} onClick={() => toast('Tính năng xuất văn bản thuần sẽ có trong phiên bản sau', { icon: '📋' })}>📋 Văn bản thuần</button>
        </div>
      </div>

    </div>
  )
}
