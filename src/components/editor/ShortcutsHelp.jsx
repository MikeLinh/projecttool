import React, { useState, useEffect } from 'react'
import { Keyboard, X } from 'lucide-react'
import styles from './ShortcutsHelp.module.css'

const SHORTCUTS = [
  { action: 'Trang tiếp theo',                      keys: ['→', '↓'] },
  { action: 'Trang trước',                  keys: ['←', '↑'] },
  { action: 'Hoàn tất chỉnh sửa khối văn bản',    keys: ['Enter'] },
  { action: 'Xuống dòng trong khối văn bản',   keys: ['Shift', 'Enter'] },
  { action: 'Hủy chỉnh sửa khối văn bản',    keys: ['Esc'] },
  { action: 'Mở danh sách phím tắt',       keys: ['?'] },
]

export default function ShortcutsHelp() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape' && open) { setOpen(false); return }
      if (e.key !== '?' || e.ctrlKey || e.metaKey || e.altKey) return
      const t = e.target
      const tag = t && t.tagName
      if (t && (t.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT')) return
      e.preventDefault()
      setOpen(o => !o)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

  return (
    <>
      <button
        className={styles.helpBtn}
        onClick={() => setOpen(true)}
        title="Phím tắt bàn phím (?)"
        aria-label="Phím tắt bàn phím"
      >
        ?
      </button>

      {open && (
        <div className={styles.overlay} onClick={() => setOpen(false)}>
          <div
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="shortcuts-title"
            onClick={e => e.stopPropagation()}
          >
            <div className={styles.header}>
              <h2 id="shortcuts-title" className={styles.title}>
                <Keyboard size={16} /> Phím tắt bàn phím
              </h2>
              <button className={styles.closeBtn} onClick={() => setOpen(false)} aria-label="Đóng">
                <X size={16} />
              </button>
            </div>
            <table className={styles.table}>
              <thead>
                <tr><th>Thao tác</th><th>Phím tắt</th></tr>
              </thead>
              <tbody>
                {SHORTCUTS.map(({ action, keys }) => (
                  <tr key={action}>
                    <td>{action}</td>
                    <td>
                      {keys.map((k, i) => (
                        <React.Fragment key={k}>
                          {i > 0 && <span className={styles.plus}>{action.startsWith('New line') ? '+' : '/'}</span>}
                          <kbd className={styles.kbd}>{k}</kbd>
                        </React.Fragment>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button className={styles.doneBtn} onClick={() => setOpen(false)}>Đóng</button>
          </div>
        </div>
      )}
    </>
  )
}
