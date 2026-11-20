import React, { useState, useEffect, useRef } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  FileText, Moon, Sun, ShieldCheck, Sparkles, Heart, X, QrCode
} from 'lucide-react'
import styles from './Navbar.module.css'

const CAT_MEMES = [
  { emoji: '😼', caption: 'donate cho em nhé plss' },
  { emoji: '😹', caption: 'em cảm ơn' },
  { emoji: '😺', caption: 'thanks you' },
  { emoji: '🙀', caption: 'người zì đâu mà tốt bụng' },
]

export default function Navbar({ variant = 'default' }) {
  const location = useLocation()
  const [theme, setTheme] = useState('dark')
  const [supportOpen, setSupportOpen] = useState(false)
  const [qrUnavailable, setQrUnavailable] = useState(false)
  const closeButtonRef = useRef(null)

  useEffect(() => {
    try {
      const saved = localStorage.getItem('pdfpro-theme')
      const current = saved || document.documentElement.dataset.theme || 'dark'
      setTheme(current)
      document.documentElement.dataset.theme = current
    } catch {
      setTheme('dark')
    }
  }, [])

  useEffect(() => {
    if (!supportOpen) return undefined

    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeButtonRef.current?.focus()

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setSupportOpen(false)
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      previousFocus?.focus?.()
    }
  }, [supportOpen])

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    try {
      localStorage.setItem('pdfpro-theme', next)
      document.documentElement.dataset.theme = next
    } catch {}
  }

  const isEditor = location.pathname.startsWith('/editor')
  const isTools = location.pathname.startsWith('/tools')

  return (
    <>
      <header className={`${styles.header} ${variant === 'app' ? styles.headerApp : ''}`}>
        <div className={styles.container}>
          {/* Logo */}
          <div className={styles.brandGroup}>
            <Link to="/" className={styles.logoLink} title="PDF Pro">
              <div className={styles.logoBadge}>
                <FileText size={18} className={styles.logoIcon} />
              </div>
              <div className={styles.logoTextGroup}>
                <div className={styles.brandTitleRow}>
                  <span className={styles.logoText}>PDF Pro</span>
                  <span className={styles.proTag}>PRO 2.0</span>
                </div>
              </div>
            </Link>
          </div>

          {/* Thanh điều hướng chính */}
          <nav className={styles.navMenu}>
            <Link
              to="/editor"
              className={`${styles.navItem} ${isEditor ? styles.navActive : ''}`}
            >
              <span>Chỉnh sửa PDF</span>
            </Link>
            <Link
              to="/tools"
              className={`${styles.navItem} ${isTools ? styles.navActive : ''}`}
            >
              <span>Kho công cụ</span>
            </Link>
            <Link
              to="/tools"
              state={{ defaultTool: 'pdf-to-word' }}
              className={`${styles.navItem} ${styles.wordHighlight}`}
              title="Chuyển đổi PDF sang Word chuẩn bố cục Nghị định 30"
            >
              <Sparkles size={13} className={styles.sparkleIcon} />
              <span>Xuất sang Word</span>
            </Link>
          </nav>

          {/* Khu vực trạng thái */}
          <div className={styles.actionsGroup}>
            <div className={styles.privacyPill} title="Tất cả xử lý 100% trong trình duyệt máy bạn, không tải tệp lên máy chủ ngoài">
              <ShieldCheck size={14} className={styles.shieldIcon} />
              <span className={styles.privacyText}>Bảo mật 100%</span>
            </div>

            <button
              type="button"
              className={styles.supportBtn}
              onClick={() => {
                setQrUnavailable(false)
                setSupportOpen(true)
              }}
              aria-haspopup="dialog"
              aria-expanded={supportOpen}
            >
              <Heart size={15} fill="currentColor" />
              <span>Ủng hộ nhà phát triển</span>
            </button>

            <button
              onClick={toggleTheme}
              className={styles.themeToggle}
              aria-label="Đổi giao diện Sáng / Tối"
              title={theme === 'dark' ? 'Chuyển sang giao diện Sáng' : 'Chuyển sang giao diện Tối'}
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
        </div>
      </header>

      {supportOpen && (
        <div
          className={styles.modalBackdrop}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSupportOpen(false)
          }}
        >
          <section
            className={styles.supportDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="support-title"
            aria-describedby="support-description"
          >
            <div className={styles.dialogHeader}>
              <div>
                <div className={styles.dialogEyebrow}><Heart size={13} /> Gửi chút yêu thương</div>
                <h2 id="support-title" className={styles.dialogTitle}>Ủng hộ nhà phát triển</h2>
                <p id="support-description" className={styles.dialogDescription}>
                  Mỗi sự ủng hộ giúp PDF Pro tiếp tục được cải thiện. Các boss mèo cũng gửi lời cảm ơn!
                </p>
              </div>
              <button
                ref={closeButtonRef}
                type="button"
                className={styles.closeButton}
                onClick={() => setSupportOpen(false)}
                aria-label="Đóng cửa sổ ủng hộ"
              >
                <X size={18} />
              </button>
            </div>

            <div className={styles.dialogContent}>
              <div className={styles.qrPanel}>
                <div className={styles.qrHeading}><QrCode size={17} /> Quét mã để ủng hộ</div>
                {qrUnavailable ? (
                  <div className={styles.qrUnavailable} role="alert">
                    Chưa tải được ảnh QR. Vui lòng kiểm tra tệp <code>public/donate-qr.png</code>.
                  </div>
                ) : (
                  <img
                    className={styles.qrImage}
                    src="/donate-qr.png"
                    alt="Mã QR VietinBank để ủng hộ nhà phát triển"
                    onError={() => setQrUnavailable(true)}
                  />
                )}
                <p className={styles.qrHint}>Mở ứng dụng ngân hàng và quét mã QR</p>
              </div>

              <div className={styles.memePanel}>
                <div className={styles.memeHeading}>Đội cổ vũ mèo 😻</div>
                <div className={styles.memeGrid}>
                  {CAT_MEMES.map((meme) => (
                    <div className={styles.memeCard} key={meme.caption}>
                      <span className={styles.memeGif} aria-hidden="true">{meme.emoji}</span>
                      <p>{meme.caption}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </div>
      )}
    </>
  )
}
