import React from 'react'
import { Link } from 'react-router-dom'
import {
  FileText, Edit3, Scissors, Merge, ScanLine, Zap,
  Lock, Globe, ChevronRight, Check,
  Image, RotateCcw, FileDown, Grid2X2,
  Eye, Droplets, FileSearch
} from 'lucide-react'
import Navbar from '../components/layout/Navbar.jsx'
import styles from './Landing.module.css'

const FEATURES = [
  { icon: Edit3, label: 'Sửa văn bản có sẵn', desc: 'Nhấp vào văn bản trong PDF để sửa trực tiếp. Tự nhận diện phông chữ, đổi cỡ, màu và kiểu chữ.', tag: 'Tính năng nổi bật' },
  { icon: ScanLine, label: 'Nhận dạng ký tự (OCR)', desc: 'Giúp PDF quét và PDF hình ảnh có thể tìm kiếm, chỉnh sửa bằng Tesseract.js — hoạt động hoàn toàn ngoại tuyến.', tag: 'Hỗ trợ AI' },
  { icon: Merge, label: 'Gộp PDF', desc: 'Kéo thả để gộp nhiều tệp PDF và tùy chỉnh thứ tự trang.' },
  { icon: Scissors, label: 'Tách PDF', desc: 'Tách theo khoảng trang, sau mỗi N trang hoặc trích xuất từng trang.' },
  { icon: Image, label: 'Chỉnh sửa hình ảnh', desc: 'Thêm, xóa, thay thế hoặc di chuyển hình ảnh ở bất kỳ vị trí nào trong PDF.' },
  { icon: Grid2X2, label: 'Dàn trang nhiều trang', desc: 'Sắp xếp nhiều trang PDF trên một tờ giấy. Tùy chỉnh bố cục, khoảng cách, khổ giấy rồi xuất PDF.', to: '/tools/multi-page-layout' },
  { icon: FileDown, label: 'Nén PDF', desc: 'Giảm dung lượng PDF đến 80% bằng tính năng nén luồng đối tượng ngay trên trình duyệt.' },
  { icon: RotateCcw, label: 'Xoay và sắp xếp trang', desc: 'Xoay từng trang và kéo thả để sắp xếp theo thứ tự mong muốn.' },
  { icon: Lock, label: 'Đặt mật khẩu', desc: 'Mã hóa AES 256-bit hoặc gỡ mật khẩu hiện có.' },
  { icon: Eye, label: 'Che nội dung', desc: 'Che vĩnh viễn nội dung nhạy cảm, bao gồm cả văn bản và hình ảnh.' },
  { icon: Droplets, label: 'Hình mờ', desc: 'Thêm hình mờ bằng văn bản hoặc hình ảnh, tùy chỉnh độ mờ và góc xoay.' },
  { icon: FileSearch, label: 'Điền biểu mẫu', desc: 'Điền, làm phẳng và xuất biểu mẫu PDF nhanh chóng.' },
]

const COMPARE = [
  { feature: 'Sửa văn bản PDF có sẵn', df: true, others: 'thường mất phí hoặc bị giới hạn' },
  { feature: 'Không giới hạn dung lượng tệp', df: true, others: 'thường bị giới hạn' },
  { feature: 'Không giới hạn số lượt dùng mỗi ngày', df: true, others: 'gói miễn phí thường giới hạn số lượt' },
  { feature: 'Hoạt động ngoại tuyến', df: true, others: 'thường cần trình duyệt hoặc đám mây' },
  { feature: 'Không cần tài khoản', df: true, others: 'tùy dịch vụ' },
  { feature: 'Không tải tệp lên máy chủ', df: true, others: 'không phải lúc nào cũng vậy' },
  { feature: 'Nhận dạng ký tự (OCR)', df: true, others: 'thường mất phí' },
  { feature: 'Ký điện tử trên PDF', df: true, others: 'thường mất phí' },
  { feature: 'Mã nguồn mở (MIT)', df: true, others: 'hiếm gặp' },
  { feature: 'Miễn phí', df: true, others: 'nhiều gói miễn phí bị giới hạn' },
]

function Cell({ val }) {
  if (val === true) return <span className={styles.yes}><Check size={14} /></span>
  if (val === false) return <span className={styles.no}><X size={14} /></span>
  return <span className={styles.partial}>{val}</span>
}

export default function Landing() {
  return (
    <div className={styles.page}>
      <Navbar variant="landing" />

      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <div className={styles.heroEyebrow}>
            <Globe size={12} /> Tác giả: Nguyễn Mai Lĩnh • Miễn phí &amp; Mã nguồn mở
          </div>
          <h1 className={styles.heroTitle}>
            Bộ công cụ PDF<br />
            <span className={styles.heroAccent}>mạnh mẽ và bảo mật</span>
          </h1>
          <p className={styles.heroSub}>
            Nhiều công cụ bắt trả phí hàng tháng hoặc giới hạn số lần sử dụng.
            <em> PDF Pro cung cấp đầy đủ công cụ chỉnh sửa chữ, chèn hình ảnh, chuyển PDF sang Word, OCR, gộp và nén tệp hoàn toàn miễn phí</em>,
            với dữ liệu được xử lý trực tiếp trên thiết bị của bạn.
          </p>
          <div className={styles.heroActions}>
            <Link to="/editor" className={styles.primaryBtn}>
              <Zap size={16} />
              Bắt đầu chỉnh sửa ngay
              <ChevronRight size={14} />
            </Link>
            <Link to="/tools" className={styles.ghostBtn}>
              Xem tất cả công cụ
            </Link>
          </div>
          <div className={styles.heroPills}>
            <span className={styles.pill}><Check size={11} /> Không cần đăng ký</span>
            <span className={styles.pill}><Check size={11} /> Không giới hạn dung lượng</span>
            <span className={styles.pill}><Check size={11} /> Thêm ảnh và chuyển PDF sang Word</span>
            <span className={styles.pill}><Check size={11} /> Hoạt động ngoại tuyến</span>
            <span className={styles.pillAccent}><Lock size={11} /> Dữ liệu không tải lên mạng</span>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionInner}>
          <div className={styles.sectionLabel}>Đầy đủ công cụ cần thiết</div>
          <h2 className={styles.sectionTitle}>Tất cả công cụ. Hoàn toàn miễn phí.</h2>
          <p className={styles.sectionSub}>Các công cụ PDF thiết yếu thường phải trả phí, nay được tích hợp trong một ứng dụng miễn phí, dùng ngoại tuyến.</p>
          <div className={styles.featureGrid}>
            {FEATURES.map((f) => {
              const Icon = f.icon
              const content = <>
                  <div className={styles.featureIconWrap}>
                    <Icon size={20} />
                  </div>
                  <div className={styles.featureLabel}>
                    {f.label}
                    {f.tag && <span className={styles.featureTag}>{f.tag}</span>}
                  </div>
                  <div className={styles.featureDesc}>{f.desc}</div>
                </>
              return f.to
                ? <Link key={f.label} to={f.to} className={styles.featureCard + ' ' + styles.featureLink}>{content}</Link>
                : <div key={f.label} className={styles.featureCard}>{content}</div>
            })}
          </div>
        </div>
      </section>

      <section className={styles.section} style={{ background: 'var(--bg-nav)' }}>
        <div className={styles.sectionInner}>
          <div className={styles.sectionLabel}>So sánh</div>
          <h2 className={styles.sectionTitle}>PDF Pro và các công cụ PDF khác</h2>
          <div className={styles.tableWrap}>
            <table className={styles.compareTable}>
              <thead>
                <tr>
                  <th>Tính năng</th>
                  <th className={styles.thDocforge}>
                    <div className={styles.thBadge}>PDF Pro</div>
                    <div className={styles.thPrice}>Miễn phí</div>
                  </th>
                  <th>
                    <div>Công cụ khác</div>
                    <div className={styles.thPrice}>Thường mất phí hoặc giới hạn ở gói miễn phí</div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {COMPARE.map((row) => (
                  <tr key={row.feature}>
                    <td>{row.feature}</td>
                    <td className={styles.tdDocforge}><Cell val={row.df} /></td>
                    <td><Cell val={row.others} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionInner}>
          <div className={styles.sectionLabel}>Ưu tiên quyền riêng tư</div>
          <h2 className={styles.sectionTitle}>Tệp của bạn luôn nằm trên thiết bị</h2>
          <div className={styles.howGrid}>
            <div className={styles.howCard}>
              <div className={styles.howNum}>01</div>
              <div className={styles.howTitle}>Mở tệp PDF</div>
              <div className={styles.howDesc}>Kéo thả hoặc nhấp để chọn. Tệp được tải trực tiếp vào bộ nhớ trình duyệt.</div>
            </div>
            <div className={styles.howCard}>
              <div className={styles.howNum}>02</div>
              <div className={styles.howTitle}>Chỉnh sửa theo ý muốn</div>
              <div className={styles.howDesc}>Mọi thao tác đều chạy cục bộ bằng pdf-lib và PDF.js trên WebAssembly, không gửi yêu cầu qua mạng.</div>
            </div>
            <div className={styles.howCard}>
              <div className={styles.howNum}>03</div>
              <div className={styles.howTitle}>Tải xuống ngay</div>
              <div className={styles.howDesc}>PDF đã chỉnh sửa được tạo ngay trên trình duyệt và tải trực tiếp xuống thiết bị. Không đám mây, máy chủ hay theo dõi.</div>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.ctaSection}>
        <div className={styles.ctaInner}>
          <h2 className={styles.ctaTitle}>Bạn đã sẵn sàng dùng công cụ miễn phí?</h2>
          <p className={styles.ctaSub}>Không tài khoản. Không thẻ tín dụng. Không tải tệp lên. Chỉ cần mở PDF và bắt đầu chỉnh sửa.</p>
          <div className={styles.ctaActions}>
            <Link to="/editor" className={styles.primaryBtn} style={{ fontSize: 15, padding: '12px 28px' }}>
              <Zap size={16} />
              Mở trình chỉnh sửa
            </Link>
            <Link to="/tools" className={styles.ghostBtn}>
              Xem tất cả công cụ
              <ChevronRight size={14} />
            </Link>
          </div>
        </div>
      </section>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div className={styles.footerLogo}>
            <div className={styles.footerLogoMark}><FileText size={14} /></div>
            <span>PDF Pro</span>
          </div>
          <div className={styles.footerLinks}>
            <a href="https://github.com/prodution14-hue/pdf" target="_blank" rel="noopener noreferrer">GitHub</a>
            <Link to="/tools">Tất cả công cụ</Link>
            <Link to="/editor">Trình chỉnh sửa</Link>
            <a href="https://github.com/prodution14-hue/pdf/issues" target="_blank" rel="noopener noreferrer">Báo lỗi</a>
          </div>
          <div className={styles.footerNote}>
            Giấy phép MIT - Xử lý trực tiếp trên trình duyệt, bảo mật 100%
          </div>
        </div>
      </footer>
    </div>
  )
}
