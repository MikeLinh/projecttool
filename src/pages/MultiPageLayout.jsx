import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import * as pdfjsLib from 'pdfjs-dist'
import { AlertCircle, ArrowDownToLine, Check, ChevronLeft, ChevronRight, FileText, Grid2X2, Info, Loader2, Minus, Plus, RotateCcw, Share2, Upload, X } from 'lucide-react'
import Navbar from '../components/layout/Navbar.jsx'
import { calculateLayout, exportMultiPagePdf, getCellRect, LAYOUT_PRESETS, MM_TO_PT } from '../lib/multiPageLayout.js'
import styles from './MultiPageLayout.module.css'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()
const DEFAULTS = { preset: '4', paper: 'A4', orientation: 'portrait', marginMm: 0, gapXmm: 0, gapYmm: 0, borders: false, labels: false }
const readableSize = (bytes) => bytes < 1024 * 1024 ? (bytes / 1024).toFixed(0) + ' KB' : (bytes / (1024 * 1024)).toFixed(1) + ' MB'

function describePdfError(error) {
  const message = ((error && error.name) || '') + ' ' + ((error && error.message) || '')
  if (/password|encrypt/i.test(message)) return 'PDF này được bảo vệ bằng mật khẩu. Hãy gỡ mật khẩu rồi thử lại.'
  if (/worker/i.test(message)) return 'Không thể khởi động trình đọc PDF. Hãy tải lại trang rồi thử lại.'
  if (/memory|allocation/i.test(message)) return 'PDF này quá lớn so với bộ nhớ trình duyệt hiện có.'
  return 'Không thể đọc tệp này dưới dạng PDF được hỗ trợ. Hãy kiểm tra tệp rồi thử lại.'
}

function PageCanvas({ pdf, pageNumber, onError }) {
  const canvasRef = useRef(null)
  useEffect(() => {
    let task
    let disposed = false
    let frame
    const canvas = canvasRef.current
    if (!pdf || !canvas) return undefined
    const render = async () => {
      try {
        if (task) task.cancel()
        const page = await pdf.getPage(pageNumber)
        if (disposed) return
        const parent = canvas.parentElement
        const width = Math.max(1, parent.getBoundingClientRect().width)
        const baseViewport = page.getViewport({ scale: 1 })
        const height = Math.max(1, parent.getBoundingClientRect().height)
        const scale = Math.min(width / baseViewport.width, height / baseViewport.height)
        const viewport = page.getViewport({ scale })
        const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
        canvas.width = Math.max(1, Math.round(viewport.width * dpr))
        canvas.height = Math.max(1, Math.round(viewport.height * dpr))
        const context = canvas.getContext('2d', { alpha: false })
        context.setTransform(dpr, 0, 0, dpr, 0, 0)
        task = page.render({ canvasContext: context, viewport, background: '#ffffff' })
        await task.promise
      } catch (error) {
        if (!disposed && error.name !== 'RenderingCancelledException') onError('Không thể hiển thị trang nguồn trong bản xem trước.')
      }
    }
    frame = requestAnimationFrame(render)
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { frame = requestAnimationFrame(render) }) : null
    observer && observer.observe(canvas.parentElement)
    return () => {
      disposed = true
      cancelAnimationFrame(frame)
      observer && observer.disconnect()
      task && task.cancel()
      canvas.width = 1
      canvas.height = 1
    }
  }, [pdf, pageNumber, onError])
  return <canvas ref={canvasRef} className={styles.pageCanvas} aria-label={'Xem trước trang nguồn ' + pageNumber} />
}

function RangeSetting({ id, label, value, min, max, onChange }) {
  return <div className={styles.rangeSetting}>
    <div className={styles.settingLabelRow}><label htmlFor={id + '-number'}>{label}</label><div className={styles.numberControl}>
      <input id={id + '-number'} type="number" min={min} max={max} step="0.5" value={value} onChange={(event) => onChange(event.target.value === '' ? '' : Number(event.target.value))} inputMode="decimal" /><span>mm</span>
    </div></div>
    <input aria-label={label + ' slider'} type="range" min={min} max={max} step="0.5" value={value === '' ? min : value} onChange={(event) => onChange(Number(event.target.value))} />
    <div className={styles.rangeEnds}><span>{min} mm</span><span>{max} mm</span></div>
  </div>
}

export default function MultiPageLayout() {
  const [settings, setSettings] = useState(DEFAULTS)
  const [file, setFile] = useState(null)
  const [pdf, setPdf] = useState(null)
  const [pageCount, setPageCount] = useState(0)
  const [fileError, setFileError] = useState('')
  const [error, setError] = useState('')
  const [previewError, setPreviewError] = useState('')
  const [busyLoading, setBusyLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [sheetIndex, setSheetIndex] = useState(0)
  const [zoom, setZoom] = useState(100)
  const [output, setOutput] = useState(null)
  const generation = useRef(0)
  const oldOutput = useRef(null)
  const pdfRef = useRef(null)
  const busyLoadingRef = useRef(false)

  useEffect(() => {
    const title = document.title
    document.title = 'Dàn trang nhiều trang · PDF Pro'
    return () => { document.title = title }
  }, [])
  useEffect(() => () => {
    generation.current += 1
    if (pdfRef.current) pdfRef.current.destroy()
    if (oldOutput.current) URL.revokeObjectURL(oldOutput.current)
  }, [])

  const loadFile = useCallback(async (candidate) => {
    if (!candidate || busyLoadingRef.current) return
    if (file && !window.confirm('Thay thế tệp PDF hiện tại? Tệp hiện tại sẽ bị gỡ nhưng các thiết lập dàn trang vẫn được giữ lại.')) return
    busyLoadingRef.current = true
    setBusyLoading(true)
    setFileError('')
    setError('')
    setPreviewError('')
    setSheetIndex(0)
    const request = ++generation.current
    let loadingTask
    try {
      if (candidate.type !== 'application/pdf' && !candidate.name.toLowerCase().endsWith('.pdf')) throw new Error('Hãy chọn tệp PDF để tiếp tục.')
      const bytes = await candidate.arrayBuffer()
      loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(bytes.slice(0)) })
      const loaded = await loadingTask.promise
      if (request !== generation.current) { await loaded.destroy(); return }
      const first = await loaded.getPage(1)
      const size = first.getViewport({ scale: 1 })
      if (pdfRef.current) pdfRef.current.destroy()
      pdfRef.current = loaded
      setPdf(loaded)
      setPageCount(loaded.numPages)
      setFile({ source: candidate, width: size.width, height: size.height })
      if (oldOutput.current) URL.revokeObjectURL(oldOutput.current)
      oldOutput.current = null
      setOutput(null)
    } catch (failure) {
      if (request === generation.current) {
        setFileError(failure.message === 'Hãy chọn tệp PDF để tiếp tục.' ? failure.message : describePdfError(failure))
        if (loadingTask) await loadingTask.destroy()
      }
    } finally {
      if (request === generation.current) {
        busyLoadingRef.current = false
        setBusyLoading(false)
      }
    }
  }, [file])
  const onDrop = useCallback((accepted, rejected) => {
    if (busyLoadingRef.current) return
    if (rejected.length) setFileError('Chỉ hỗ trợ tệp PDF. Vui lòng chọn tệp .pdf.')
    if (accepted[0]) loadFile(accepted[0])
  }, [loadFile])
  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    accept: { 'application/pdf': ['.pdf'] }, maxFiles: 1, multiple: false,
    noClick: true, noKeyboard: true, onDrop,
  })
  const layout = useMemo(() => {
    if (!file || !pageCount) return null
    try { return { value: calculateLayout({ ...settings, pageCount, originalSize: { width: file.width, height: file.height } }), error: '' } }
    catch (failure) { return { value: null, error: failure.message } }
  }, [file, pageCount, settings])
  const count = layout && layout.value ? layout.value.totalSheets : 0
  const startPage = layout && layout.value ? sheetIndex * layout.value.pagesPerSheet + 1 : 1
  const endPage = Math.min(startPage + ((layout && layout.value && layout.value.pagesPerSheet) || 1) - 1, pageCount)
  const update = (key, value) => setSettings((current) => ({ ...current, [key]: value }))
  const reportPreviewError = useCallback((message) => setPreviewError(message), [])
  let supportsFileShare = false
  try {
    supportsFileShare = typeof File !== 'undefined' && typeof navigator !== 'undefined'
      && typeof navigator.share === 'function' && typeof navigator.canShare === 'function'
      && navigator.canShare({ files: [new File([], 'layout.pdf', { type: 'application/pdf' })] })
  } catch { supportsFileShare = false }
  useEffect(() => {
    if (count && sheetIndex >= count) setSheetIndex(count - 1)
  }, [count, sheetIndex])
  const removeFile = () => {
    generation.current += 1
    busyLoadingRef.current = false
    if (pdfRef.current) pdfRef.current.destroy()
    pdfRef.current = null
    setPdf(null); setFile(null); setPageCount(0); setFileError(''); setError(''); setSheetIndex(0)
    if (oldOutput.current) URL.revokeObjectURL(oldOutput.current)
    oldOutput.current = null; setOutput(null)
  }
  const exportPdf = async () => {
    if (!file || !layout || !layout.value || busy) return
    setBusy(true); setError(''); setOutput(null)
    if (oldOutput.current) URL.revokeObjectURL(oldOutput.current)
    oldOutput.current = null
    try {
      const result = await exportMultiPagePdf(await file.source.arrayBuffer(), { ...settings, pageCount })
      const url = URL.createObjectURL(new Blob([result.bytes], { type: 'application/pdf' }))
      if (oldOutput.current) URL.revokeObjectURL(oldOutput.current)
      oldOutput.current = url
      setOutput({ url, filename: file.source.name.replace(/\.pdf$/i, '') + '-dan-trang.pdf', pages: result.layout.totalSheets })
    } catch (failure) {
      setError(failure.message || 'Không thể xuất PDF. Tệp nguồn và các thiết lập của bạn vẫn được giữ nguyên.')
    } finally { setBusy(false) }
  }
  const sharePdf = async () => {
    if (!output || !navigator.canShare || !navigator.share) return
    try {
      const blob = await (await fetch(output.url)).blob()
      const outputFile = new File([blob], output.filename, { type: 'application/pdf' })
      if (navigator.canShare({ files: [outputFile] })) await navigator.share({ files: [outputFile], title: output.filename })
    } catch (failure) {
      if (failure.name !== 'AbortError') setError('Không thể chia sẻ. Hãy chọn Mở PDF để lưu hoặc chia sẻ tệp đã tạo.')
    }
  }
  const dimensions = layout && layout.value
  return <div className={styles.page}>
    <Navbar variant="app" />
    <main className={styles.main}>
      <header className={styles.pageHeader}>
        <div className={styles.eyebrow}><Grid2X2 size={14} /> CÔNG CỤ PDF · DÀN TRANG</div>
        <h1>Dàn trang nhiều trang</h1>
        <p>Sắp xếp các trang từ PDF hiện có thành bố cục trên một tờ giấy sẵn sàng để in.</p>
      </header>
      <div className={styles.workspace}>
        <input {...getInputProps({ 'aria-label': 'Chọn tệp PDF' })} />
        <section className={styles.previewPanel} aria-label="Xem trước tài liệu">
          <div className={styles.previewTopbar}>
            <div><span className={styles.previewHeading}>Xem trước tờ giấy</span><span className={styles.previewMeta}>{file ? 'Trang ' + startPage + '–' + endPage + ' / ' + pageCount : 'Xem trước bố cục trực tiếp'}</span></div>
            <div className={styles.previewActions}>
              <button type="button" aria-label="Thu nhỏ" onClick={() => setZoom((v) => Math.max(70, v - 10))} disabled={zoom <= 70}><Minus size={15} /></button>
              <span aria-live="polite">{zoom}%</span>
              <button type="button" aria-label="Phóng to" onClick={() => setZoom((v) => Math.min(130, v + 10))} disabled={zoom >= 130}><Plus size={15} /></button>
            </div>
          </div>
          <div {...getRootProps({ className: styles.previewStage + (!file ? ' ' + styles.previewStageEmpty : '') + (isDragActive ? ' ' + styles.previewDragActive : '') })}>
            {busyLoading && <div className={styles.previewState}><Loader2 className={styles.spin} size={26} /><strong>Đang đọc PDF…</strong><span>Đang kiểm tra các trang ngay trên trình duyệt</span></div>}
            {!busyLoading && !file && <div className={styles.previewDropzone}>
              <div className={styles.previewUploadIcon}><Upload size={28} /></div>
              <strong>{isDragActive ? 'Thả tệp PDF vào đây' : 'Thả tệp PDF vào đây'}</strong>
              <span>Sắp xếp nhiều trang PDF trên một tờ giấy theo bố cục bạn chọn.</span>
              <button type="button" className={styles.choosePdfBtn} disabled={busyLoading} onClick={(event) => { event.stopPropagation(); open() }}><Upload size={15} /> Chọn PDF</button>
              <div className={styles.previewLocalNote}><AlertCircle size={13} /> PDF được xử lý ngay trên thiết bị và không tải lên máy chủ.</div>
              {fileError && <p className={styles.previewFileError} role="alert">{fileError}</p>}
            </div>}
            {!busyLoading && file && dimensions && <div className={styles.sheetWrap} style={{ maxWidth: (760 * zoom / 100) + 'px', aspectRatio: dimensions.width + ' / ' + dimensions.height }} aria-label={'Tờ giấy đầu ra ' + (sheetIndex + 1)}>
              <div className={styles.sheetPaper}>{Array.from({ length: Math.min(dimensions.pagesPerSheet, Math.max(0, pageCount - sheetIndex * dimensions.pagesPerSheet)) }, (_, slot) => {
                const number = sheetIndex * dimensions.pagesPerSheet + slot + 1
                const cell = getCellRect(dimensions, slot)
                return <div key={number} className={styles.pageCell + (settings.borders ? ' ' + styles.cellBorder : '')} style={{ left: (cell.x / dimensions.width * 100) + '%', bottom: (cell.y / dimensions.height * 100) + '%', width: (cell.width / dimensions.width * 100) + '%', height: (cell.height / dimensions.height * 100) + '%' }}>
                  <PageCanvas pdf={pdf} pageNumber={number} onError={reportPreviewError} />
                  {settings.labels && <span className={styles.pageLabel}>Trang {number}</span>}
                </div>
              })}</div>
            </div>}
            {!busyLoading && file && layout && layout.error && <div className={styles.previewState} role="alert"><strong>Cần điều chỉnh bố cục</strong><span>{layout.error}</span></div>}
            {previewError && <div className={styles.previewFallback} role="status">{previewError} Bạn vẫn có thể thử xuất tệp.</div>}
            {isDragActive && file && <div className={styles.dropOverlay}>Thả PDF vào đây để thay thế tệp hiện tại</div>}
          </div>
          <div className={styles.previewFooter}>
            <div className={styles.sheetNav}>
              <button type="button" aria-label="Tờ giấy trước" onClick={() => setSheetIndex((v) => Math.max(0, v - 1))} disabled={!file || sheetIndex === 0}><ChevronLeft size={17} /></button>
              <span>Tờ <strong>{file ? Math.min(sheetIndex + 1, Math.max(count, 1)) : '—'}</strong> / {file ? count : '—'}</span>
              <button type="button" aria-label="Tờ giấy tiếp theo" onClick={() => setSheetIndex((v) => Math.min(count - 1, v + 1))} disabled={!file || sheetIndex >= count - 1}><ChevronRight size={17} /></button>
            </div>
            <span className={styles.sheetDimensions}>{dimensions ? Math.round(dimensions.width / MM_TO_PT) + ' × ' + Math.round(dimensions.height / MM_TO_PT) + ' mm' : 'A4 · Dọc'}</span>
          </div>
        </section>
        <aside className={styles.settingsPanel}>
          <div className={styles.panelHeading}><div><h2>Thiết lập bố cục</h2><p>Tinh chỉnh tờ giấy đầu ra</p></div><button type="button" className={styles.resetBtn} onClick={() => setSettings(DEFAULTS)}><RotateCcw size={13} /> Đặt lại</button></div>
          <section className={styles.uploadSection} aria-labelledby="source-pdf-heading">
            <div className={styles.sectionTitle}><h3 id="source-pdf-heading">PDF nguồn</h3>{file && <span className={styles.readyTag}><i /> Sẵn sàng</span>}</div>
            {!file && <div className={styles.sourceEmpty}>
              <span className={styles.sourceUploadIcon}><Upload size={16} /></span>
              <span className={styles.sourceInstruction}>Chọn PDF để xem trước bố cục</span>
              <button type="button" className={styles.sourceUploadBtn} disabled={busyLoading} onClick={open}><Upload size={14} /> Tải PDF lên</button>
              {fileError && <p className={styles.errorMessage} role="alert">{fileError}</p>}
            </div>}
            {file && <div className={styles.fileCard}>
              <div className={styles.fileIcon}><FileText size={18} /></div>
              <div className={styles.fileDetails}><strong title={file.source.name}>{file.source.name}</strong><span>{readableSize(file.source.size)} <i /> {pageCount} trang</span></div>
              <button type="button" className={styles.changePdfBtn} disabled={busyLoading} onClick={open}><Upload size={14} /> Đổi PDF</button>
              <button type="button" className={styles.iconBtn} aria-label="Gỡ PDF" disabled={busyLoading} onClick={removeFile}><X size={15} /></button>
            </div>}
            {file && fileError && <p className={styles.errorMessage} role="alert">{fileError}</p>}
            <p className={styles.privacyNote}><Info size={13} /> Được xử lý ngay trên thiết bị này.</p>
          </section>
          <section className={styles.settingSection}><h3>Số trang trên mỗi tờ</h3><div className={styles.presetGrid}>{LAYOUT_PRESETS.map((preset) => {
            const shape = preset[settings.orientation]
            return <button type="button" key={preset.id} className={styles.presetCard + (settings.preset === preset.id ? ' ' + styles.presetSelected : '')} onClick={() => update('preset', preset.id)} aria-pressed={settings.preset === preset.id}>
              <span className={styles.miniGrid} style={{ '--columns': shape[0], '--rows': shape[1] }}>{Array.from({ length: preset.count }, (_, index) => <i key={index} />)}</span>
              <span className={styles.presetName}>{preset.label}</span><span className={styles.presetShape}>{shape[0]} × {shape[1]}</span>
              {settings.preset === preset.id && <Check size={15} className={styles.presetCheck} />}
            </button>
          })}</div></section>
          <section className={styles.settingSection}>
            <h3>Khổ giấy</h3><div className={styles.segmented} role="group" aria-label="Khổ giấy đầu ra">{[['A4', 'A4'], ['A3', 'A3'], ['Letter', 'Letter (Mỹ)'], ['Original', 'Gốc']].map(([value, label]) => <button type="button" key={value} className={settings.paper === value ? styles.segmentActive : ''} aria-pressed={settings.paper === value} onClick={() => update('paper', value)}>{label}</button>)}</div>
            {settings.paper === 'Original' && <div className={styles.infoNote}><Info size={14} /> Dùng kích thước của trang PDF nguồn đầu tiên cho mọi tờ khi các trang có kích thước khác nhau.</div>}
            <div className={styles.orientationRow}><span>Hướng giấy</span><div className={styles.segmented} role="group" aria-label="Hướng giấy">{[['portrait', 'Dọc'], ['landscape', 'Ngang']].map(([value, label]) => <button type="button" key={value} className={settings.orientation === value ? styles.segmentActive : ''} aria-pressed={settings.orientation === value} onClick={() => update('orientation', value)}>{label}</button>)}</div></div>
          </section>
          <section className={styles.settingSection}><div className={styles.sectionTitle}><h3>Khoảng cách</h3><button type="button" className={styles.inlineReset} onClick={() => setSettings((s) => ({ ...s, marginMm: 0, gapXmm: 0, gapYmm: 0 }))}>Mặc định</button></div>
            <RangeSetting id="margin" label="Lề ngoài" value={settings.marginMm} min={0} max={30} onChange={(v) => update('marginMm', v)} />
            <div className={styles.gapFields}><RangeSetting id="gap-x" label="Khoảng cách ngang" value={settings.gapXmm} min={0} max={15} onChange={(v) => update('gapXmm', v)} /><RangeSetting id="gap-y" label="Khoảng cách dọc" value={settings.gapYmm} min={0} max={15} onChange={(v) => update('gapYmm', v)} /></div>
            {layout && layout.error && <p className={styles.validationError} role="alert">{layout.error}</p>}
          </section>
          <section className={styles.settingSection}><h3>Chi tiết trang</h3>
            <label className={styles.checkRow}><input type="checkbox" checked={settings.borders} onChange={(event) => update('borders', event.target.checked)} /><span className={styles.customCheck}><Check size={12} /></span><span><strong>Viền ô</strong><small>Hiển thị viền quanh vị trí mỗi trang</small></span></label>
            <label className={styles.checkRow}><input type="checkbox" checked={settings.labels} onChange={(event) => update('labels', event.target.checked)} /><span className={styles.customCheck}><Check size={12} /></span><span><strong>Nhãn trang</strong><small>Hiển thị số trang gốc</small></span></label>
          </section>
          <p className={styles.limitationNote}>Nội dung trang vẫn ở dạng vector. Các trường tương tác, nhận xét, liên kết và chữ ký số sẽ không được chuyển sang PDF mới.</p>
          <button type="button" className={styles.exportBtn} onClick={exportPdf} disabled={!file || !layout || !layout.value || busy || busyLoading}>{busy ? <><Loader2 size={17} className={styles.spin} /> Đang tạo PDF…</> : <><ArrowDownToLine size={17} /> Xuất PDF <ChevronRight size={16} /></>}</button>
          {busy && <p className={styles.processingNote} role="status">Đang sắp xếp {pageCount} trang trên trình duyệt. Quá trình này có thể mất một chút thời gian.</p>}
          {output && <div className={styles.successBox} role="status"><Check size={16} /><div><strong>PDF đã sẵn sàng</strong><span>{output.pages} {output.pages === 1 ? 'tờ đầu ra' : 'tờ đầu ra'}</span></div><a href={output.url} download={output.filename}><ArrowDownToLine size={14} /> Lưu PDF</a><a href={output.url} target="_blank" rel="noreferrer"><FileText size={14} /> Mở PDF</a>{supportsFileShare && <button type="button" onClick={sharePdf}><Share2 size={14} /> Chia sẻ</button>}</div>}
          {error && <p className={styles.errorMessage} role="alert">{error}</p>}
        </aside>
      </div>
    </main>
  </div>
}
