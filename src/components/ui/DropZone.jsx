import React, { useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Upload, FileText, AlertCircle } from 'lucide-react'
import { usePdfStore } from '../../store/pdfStore.js'
import styles from './DropZone.module.css'

export default function DropZone({ compact = false }) {
  const navigate = useNavigate()
  const { setFile } = usePdfStore()

  const onDrop = useCallback(async (accepted, rejected) => {
    if (rejected.length > 0) {
      toast.error('Chỉ hỗ trợ tệp PDF')
      return
    }
    if (accepted.length === 0) return

    const file = accepted[0]
    const arrayBuffer = await file.arrayBuffer()
    setFile(arrayBuffer, file.name, file.size)
    toast.success(`Đã mở ${file.name}`)
    navigate('/editor')
  }, [setFile, navigate])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    maxFiles: 1,
  })

  if (compact) {
    return (
      <div {...getRootProps()} className={`${styles.compact} ${isDragActive ? styles.dragging : ''}`}>
        <input {...getInputProps()} />
        <Upload size={16} />
        <span>Mở PDF</span>
      </div>
    )
  }

  return (
    <div {...getRootProps()} className={`${styles.zone} ${isDragActive ? styles.dragging : ''}`}>
      <input {...getInputProps()} />
      <div className={styles.icon}>
        {isDragActive ? <FileText size={36} /> : <Upload size={36} />}
      </div>
      <div className={styles.title}>
        {isDragActive ? 'Thả tệp để mở' : 'Thả tệp PDF vào đây'}
      </div>
      <div className={styles.sub}>
        hoặc <span className={styles.browse}>nhấn để chọn tệp</span>
      </div>
      <div className={styles.note}>
        <AlertCircle size={12} />
        Tệp được xử lý ngay trên trình duyệt — không tải lên máy chủ
      </div>
      <div className={styles.formats}>
        <span>PDF</span>
        <span>PDF quét</span>
        <span>PDF/A</span>
        <span>Biểu mẫu PDF</span>
      </div>
    </div>
  )
}
