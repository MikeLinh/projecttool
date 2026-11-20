/**
 * SEOLanding
 */

const seoStyle = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: 0,
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0,0,0,0)',
  whiteSpace: 'nowrap',
  border: 0,
};

const FEATURES = [
  'Sửa trực tiếp văn bản trong PDF mà không cần chuyển đổi',
  'Dàn trang nhiều trang để in',
  'Chú thích PDF bằng cách tô sáng, thêm nhận xét và hình dạng',
  'Gộp nhiều tệp PDF thành một tài liệu',
  'Tách PDF theo khoảng trang hoặc trích xuất từng trang',
  'Nén PDF để giảm dung lượng tệp',
  'Sắp xếp, xoay hoặc xóa từng trang',
  'Nhận dạng ký tự (OCR) để tìm kiếm nội dung trong PDF đã quét',
  'Che và xóa nội dung PDF hiện có',
  'Nhúng lại phông chữ để giữ nguyên hiển thị văn bản',
];

const FAQS = [
  {
    q: 'PDF Pro có miễn phí không?',
    a: 'Có. PDF Pro do Nguyễn Mai Lĩnh phát triển hoàn toàn miễn phí, không cần đăng ký hay trả phí định kỳ và không chèn hình mờ.',
  },
  {
    q: 'PDF Pro có tải tệp của tôi lên máy chủ không?',
    a: 'Không. Mọi thao tác xử lý PDF diễn ra trực tiếp trên trình duyệt bằng PDF.js và pdf-lib. Tệp luôn nằm trên thiết bị của bạn.',
  },
  {
    q: 'PDF Pro có hoạt động ngoại tuyến không?',
    a: 'PDF Pro cần kết nối Internet để tải trang lần đầu. Sau đó, các công cụ chỉnh sửa chính hoạt động không cần kết nối vì mọi xử lý đều diễn ra trên thiết bị.',
  },
  {
    q: 'Ai phát triển PDF Pro?',
    a: 'PDF Pro do Nguyễn Mai Lĩnh phát triển và phát hành.',
  },
  {
    q: 'PDF Pro hỗ trợ những trình duyệt nào?',
    a: 'PDF Pro hoạt động trên các trình duyệt hiện đại như Chrome, Firefox, Edge và Safari, trên máy tính và thiết bị di động.',
  },
  {
    q: 'Tôi có cần cài đặt phần mềm không?',
    a: 'Không cần cài đặt. Mở PDF Pro trên trình duyệt và bắt đầu chỉnh sửa ngay.',
  },
];

export default function SEOLanding() {
  return (
    <section style={seoStyle} aria-hidden="true">
      <h1>PDF Pro - Trình chỉnh sửa PDF miễn phí trên trình duyệt của Nguyễn Mai Lĩnh</h1>
      <p>
        PDF Pro là trình chỉnh sửa PDF miễn phí trên trình duyệt do Nguyễn Mai Lĩnh phát triển và hoạt động hoàn toàn trên thiết bị của bạn.
        Chỉnh sửa văn bản, chèn hình ảnh, chuyển đổi Word và PDF, dàn trang nhiều trang, chú thích, gộp, tách, nén, sắp xếp trang và nhiều hơn nữa — không tải tệp lên,
        không cần đăng ký hay cài đặt phần mềm.
      </p>

      <h2>Tính năng</h2>
      <ul>
        {FEATURES.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>

      <h2>Câu hỏi thường gặp</h2>
      <dl>
        {FAQS.map(({ q, a }) => (
          <div key={q}>
            <dt>{q}</dt>
            <dd>{a}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
