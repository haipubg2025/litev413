/**
 * Cơ chế Tự động chuẩn hóa & Phục hồi HTML (HTML Sanitizer & Fixer)
 * Xây dựng màng lọc xử lý trước khi render hoặc khi sửa lỗi JSON.
 * Bất kể AI viết nháy đơn ', nháy kép ", hay hỗn hợp '...", hệ thống sẽ tự động bắt regex
 * và sửa lại chuẩn xác thành <span style="color: #HEX">...</span>, đảm bảo thẻ màu hiển thị rực rỡ.
 */

export function sanitizeAndFixInlineHtml(text: string): string {
  if (!text) return "";
  let result = text;

  // 1. Chuẩn hóa thẻ <span ...> siêu mạnh: Quét tìm trực tiếp mã HEX/RGB bên trong thẻ để phục hồi
  // Bất chấp tag bị nát đến mức nào (ví dụ: <span style="color:" #FF99CC">)
  result = result.replace(
    /<span\b[^>]*?(?:color|style)\s*[:=][^>]*?>/gi,
    (match) => {
      // Tìm mã HEX
      const hexMatch = match.match(/#[0-9a-fA-F]{3,8}/);
      if (hexMatch) return `<span style='color: ${hexMatch[0]}'>`;
      
      // Tìm mã RGB/HSL
      const funcMatch = match.match(/(?:rgb|hsl)a?\([^)]+\)/);
      if (funcMatch) return `<span style='color: ${funcMatch[0]}'>`;
      
      // Tìm tên màu cơ bản
      const colorNameMatch = match.match(/(?:color\s*[:=]\s*(?:\\*['"])?\s*)(red|blue|green|yellow|purple|pink|orange|cyan|magenta|black|white|gray|grey)\b/i);
      if (colorNameMatch) return `<span style='color: ${colorNameMatch[1]}'>`;

      return match;
    }
  );

  // 2. Chuẩn hóa các thẻ HTML inline khác có thuộc tính style/class/id bị lỗi nháy hỗn hợp
  result = result.replace(
    /<([a-z0-9]+)\b[^>]*?(style|class|id|href)\s*=\s*(?:\\*['"])?([^"'>]+?)(?:\\*['"])?\s*>/gi,
    (match, tag, attr, val) => {
      if (tag.toLowerCase() === "span" && (attr.toLowerCase() === "style" || attr.toLowerCase() === "color")) {
        return match; // Đã xử lý chuyên sâu ở trên
      }
      return `<${tag} ${attr}="${val.replace(/['"]/g, "").trim()}">`;
    }
  );

  // 3. Phục hồi thẻ đóng </span> nếu số lượng mở và đóng không cân bằng
  const openSpanCount = (result.match(/<span\b[^>]*>/gi) || []).length;
  const closeSpanCount = (result.match(/<\/span>/gi) || []).length;
  if (openSpanCount > closeSpanCount) {
    result += "</span>".repeat(openSpanCount - closeSpanCount);
  }

  return result;
}
