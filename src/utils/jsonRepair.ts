/**
 * Tiện ích làm sạch và sửa chữa lỗi JSON / Văn bản dòng stream của game Matrix Lite v4
 * Đảm bảo người chơi không bao giờ nhìn thấy các thẻ hệ thống, ngoặc nhọn hoặc JSON thô.
 */

import { useStore } from "../store/useStore";
import { jsonrepair } from 'jsonrepair';
import { toast } from '../utils/toast';

export interface JsonRepairReportItem {
  symbol: string;
  category: 'comma' | 'brace' | 'bracket' | 'paren' | 'quote' | 'singleQuote' | 'slash' | 'backslash';
  line: number;
  column: number;
  action: string;
}

/**
 * CƠ CHẾ SIÊU PHỤC HỒI JSON (Ultra Deep Intelligent JSON Auto-Fixer)
 * Tự động tìm, đếm và khôi phục triệt để từng dấu ',' , dấu ngoặc, dấu '/' hay '\' , dấu nháy đơn/kép.
 */
export function performDeepJsonAutoFixAndTrack(jsonStr: string, fullRawText: string = jsonStr): {
  repairedJson: string;
  reports: JsonRepairReportItem[];
  summaryText: string | null;
  stats: { comma: number; brace: number; bracket: number; paren: number; quote: number; singleQuote: number; slash: number; backslash: number };
} {
  const stats = {
    comma: 0,
    brace: 0,
    bracket: 0,
    paren: 0,
    quote: 0,
    singleQuote: 0,
    slash: 0,
    backslash: 0
  };
  const reports: JsonRepairReportItem[] = [];

  // 1. Tính toán tọa độ dòng và cột ban đầu của chuỗi JSON so với toàn bộ phản hồi của AI
  let baseLine = 1;
  let baseCol = 1;
  const idxInFull = fullRawText.indexOf(jsonStr);
  if (idxInFull !== -1 && idxInFull > 0) {
    const beforeText = fullRawText.substring(0, idxInFull);
    const newlineMatches = beforeText.match(/\n/g);
    if (newlineMatches) {
      baseLine += newlineMatches.length;
      const lastNewlineIdx = beforeText.lastIndexOf('\n');
      baseCol += beforeText.length - lastNewlineIdx - 1;
    } else {
      baseCol += beforeText.length;
    }
  }

  // 2. Chuẩn bị buffer và cờ quét
  let output = "";
  let curLine = baseLine;
  let curCol = baseCol;
  let inString = false;
  let escape = false;
  let lastTokenTerminated = false;
  let lastNonWhitespaceChar = '';
  const openBrackets: string[] = [];

  for (let i = 0; i < jsonStr.length; i++) {
    const char = jsonStr[i];
    const thisLine = curLine;
    const thisCol = curCol;

    // Cập nhật tọa độ cho bước lặp tiếp theo
    if (char === '\n') {
      curLine++;
      curCol = 1;
    } else {
      curCol++;
    }

    if (escape) {
      output += char;
      escape = false;
      continue;
    }

    if (char === '\\') {
      output += char;
      escape = true;
      continue;
    }

    if (char === '"') {
      if (!inString) {
        // Kiểm tra xem giữa giá trị trước đó và dấu nháy kép này có thiếu dấu phẩy (,) hay dấu hai chấm (:) không
        if (lastTokenTerminated && lastNonWhitespaceChar !== ',' && lastNonWhitespaceChar !== ':' && lastNonWhitespaceChar !== '{' && lastNonWhitespaceChar !== '[') {
          output += ',';
          stats.comma++;
          reports.push({
            symbol: ',',
            category: 'comma',
            line: thisLine,
            column: thisCol,
            action: 'Bổ sung dấu phẩy (,) ngăn cách thuộc tính/phần tử bị thiếu'
          });
        }
        inString = true;
        lastTokenTerminated = false;
        lastNonWhitespaceChar = '"';
        output += char;
      } else {
        // Lookahead kiểm tra dấu nháy kép này là đóng chuỗi hợp lệ hay nháy kép chưa escape bên trong lời thoại/văn bản
        let nextSignificant = '';
        for (let j = i + 1; j < jsonStr.length; j++) {
          if (!/\s/.test(jsonStr[j])) {
            nextSignificant = jsonStr[j];
            break;
          }
        }
        if (nextSignificant === ':' || nextSignificant === ',' || nextSignificant === '}' || nextSignificant === ']' || i === jsonStr.length - 1) {
          inString = false;
          lastTokenTerminated = true;
          lastNonWhitespaceChar = '"';
          output += char;
        } else {
          // AI gõ thiếu escape cho dấu nháy kép bên trong văn bản truyện
          output += '\\"';
          stats.quote++;
          stats.backslash++;
          reports.push({
            symbol: '"',
            category: 'quote',
            line: thisLine,
            column: thisCol,
            action: 'Tự động escape dấu nháy kép (") bên trong chuỗi văn bản'
          });
        }
      }
      continue;
    }

    if (inString) {
      if (char === '\n') {
        output += '\\n';
        stats.backslash++;
        reports.push({
          symbol: '\\n',
          category: 'backslash',
          line: thisLine,
          column: thisCol,
          action: 'Chuyển xuống dòng thực tế thành chuỗi hợp lệ "\\n"'
        });
      } else if (char === '\t') {
        output += '\\t';
      } else if (char === '\r') {
        // Bỏ qua carriage return
      } else {
        output += char;
      }
      continue;
    }

    // Khi ở ngoài chuỗi (!inString)
    if (/\s/.test(char)) {
      output += char;
      continue;
    }

    if (char === '{' || char === '[') {
      if (lastTokenTerminated && lastNonWhitespaceChar !== ',' && lastNonWhitespaceChar !== ':' && lastNonWhitespaceChar !== '{' && lastNonWhitespaceChar !== '[') {
        output += ',';
        stats.comma++;
        reports.push({
          symbol: ',',
          category: 'comma',
          line: thisLine,
          column: thisCol,
          action: 'Bổ sung dấu phẩy (,) trước ngoặc mở'
        });
      }
      openBrackets.push(char);
      lastTokenTerminated = false;
      lastNonWhitespaceChar = char;
      output += char;
      continue;
    }

    if (char === '}' || char === ']') {
      // Khắc phục lỗi Trailing Comma (thừa dấu phẩy trước ngoặc đóng)
      if (lastNonWhitespaceChar === ',') {
        output = output.replace(/,\s*$/, '');
        stats.comma++;
        reports.push({
          symbol: ',',
          category: 'comma',
          line: thisLine,
          column: thisCol,
          action: 'Loại bỏ dấu phẩy (,) thừa trước ngoặc đóng'
        });
      }
      openBrackets.pop();
      lastTokenTerminated = true;
      lastNonWhitespaceChar = char;
      output += char;
      continue;
    }

    if (char === ',' || char === ':') {
      if (lastNonWhitespaceChar === char || (char === ',' && (lastNonWhitespaceChar === '{' || lastNonWhitespaceChar === '['))) {
        stats.comma++;
        reports.push({
          symbol: char,
          category: 'comma',
          line: thisLine,
          column: thisCol,
          action: `Loại bỏ dấu ${char} thừa hoặc không hợp lệ`
        });
        continue;
      }
      lastTokenTerminated = false;
      lastNonWhitespaceChar = char;
      output += char;
      continue;
    }

    if (char === '\'') {
      if (lastTokenTerminated && lastNonWhitespaceChar !== ',' && lastNonWhitespaceChar !== ':' && lastNonWhitespaceChar !== '{' && lastNonWhitespaceChar !== '[') {
        output += ',';
        stats.comma++;
        reports.push({
          symbol: ',',
          category: 'comma',
          line: thisLine,
          column: thisCol,
          action: 'Bổ sung dấu phẩy (,) ngăn cách thuộc tính'
        });
      }
      output += '"';
      stats.singleQuote++;
      stats.quote++;
      reports.push({
        symbol: "'",
        category: 'singleQuote',
        line: thisLine,
        column: thisCol,
        action: 'Chuyển dấu nháy đơn (\') thành nháy kép (") chuẩn JSON'
      });
      inString = true;
      lastTokenTerminated = false;
      lastNonWhitespaceChar = '"';
      continue;
    }

    if (char === '/') {
      if (i + 1 < jsonStr.length && jsonStr[i + 1] === '/') {
        stats.slash += 2;
        reports.push({
          symbol: '//',
          category: 'slash',
          line: thisLine,
          column: thisCol,
          action: 'Loại bỏ comment lập trình một dòng (//)'
        });
        while (i < jsonStr.length && jsonStr[i] !== '\n') {
          i++;
        }
        curLine++;
        curCol = 1;
        output += '\n';
        continue;
      } else if (i + 1 < jsonStr.length && jsonStr[i + 1] === '*') {
        stats.slash += 2;
        reports.push({
          symbol: '/*',
          category: 'slash',
          line: thisLine,
          column: thisCol,
          action: 'Loại bỏ comment lập trình nhiều dòng (/* */)'
        });
        i += 2;
        while (i < jsonStr.length && !(jsonStr[i - 1] === '*' && jsonStr[i] === '/')) {
          if (jsonStr[i] === '\n') {
            curLine++;
            curCol = 1;
          } else {
            curCol++;
          }
          i++;
        }
        continue;
      }
    }

    // Các ký tự khác (chữ số, boolean true/false, null)
    output += char;
    lastNonWhitespaceChar = char;
    if (/[0-9a-zA-Z._-]/.test(char)) {
      while (i + 1 < jsonStr.length && /[0-9a-zA-Z._-]/.test(jsonStr[i + 1])) {
        i++;
        curCol++;
        output += jsonStr[i];
      }
      lastTokenTerminated = true;
      lastNonWhitespaceChar = 'val';
    }
  }

  // 3. Xử lý các dấu ngoặc hay chuỗi string dở dang chưa đóng ở cuối văn bản (Truncated Response)
  if (inString) {
    output += '"';
    stats.quote++;
    reports.push({
      symbol: '"',
      category: 'quote',
      line: curLine,
      column: curCol,
      action: 'Tự động đóng dấu nháy kép (") bị thiếu ở cuối phản hồi'
    });
  }

  while (openBrackets.length > 0) {
    const top = openBrackets.pop();
    const closeSym = top === '{' ? '}' : ']';
    output += closeSym;
    if (closeSym === '}') stats.brace++;
    if (closeSym === ']') stats.bracket++;
    reports.push({
      symbol: closeSym,
      category: closeSym === '}' ? 'brace' : 'bracket',
      line: curLine,
      column: curCol,
      action: `Tự động đóng ngoặc '${closeSym}' bị thiếu ở cuối cấu trúc JSON`
    });
  }

  // 4. Kết hợp thêm thư viện jsonrepair chuẩn nếu có sai sót tầng sâu
  let finalRepaired = output;
  try {
    JSON.parse(finalRepaired);
  } catch (e) {
    try {
      finalRepaired = jsonrepair(finalRepaired);
    } catch (e2) {}
  }

  // 5. Tạo thông báo tổng kết chi tiết gửi đến người dùng
  let summaryText: string | null = null;
  if (reports.length > 0) {
    const totalRepaired = reports.length;
    const detailLines = reports.slice(0, 8).map(r => `  + Dòng ${r.line} (Cột ${r.column}): [${r.symbol}] -> ${r.action}`).join('\n');
    const moreNotice = reports.length > 8 ? `\n  ... và ${reports.length - 8} vị trí khác.` : '';
    
    summaryText = `[Hệ Thống Tự Kiểm Toán Cú Pháp AI] Đã tự động phát hiện và khôi phục ${totalRepaired} lỗi dấu cấu trúc trong toàn bộ phản hồi:\n` +
      detailLines + moreNotice +
      `\n> Tổng hợp can thiệp: Thêm/Sửa ${stats.comma} dấu ',' | ${stats.brace} dấu ngoặc nhọn '{ }' | ${stats.bracket} dấu ngoặc vuông '[ ]' | ${stats.quote + stats.singleQuote} dấu nháy | ${stats.slash + stats.backslash} dấu gạch.`;
    
    console.log(summaryText);
  }

  return {
    repairedJson: finalRepaired,
    reports,
    summaryText,
    stats
  };
}

interface GameplayParsedData {
  worldTime?: string;
  weather?: string;
  mcLocation?: string;
  npcLocations?: Array<{ id: string; location: string }>;
  mcUpdates?: any;
  mcUpdate?: any;
  playerUpdate?: any;
  mc_updates?: any;
  npcUpdates?: any;
  npcUpdate?: any;
  npcsUpdate?: any;
  npc_updates?: any;
  newNPCs?: any[];
  newNpcs?: any[];
  new_npcs?: any[];
  outline?: string;
  mainText?: string;
  storyParts?: string | string[];
  suggestedActions?: Array<{ action: string; details?: string; timeCost?: string }>;
  options?: Array<{ action: string; details?: string; timeCost?: string }>;
  choices?: Array<{ action: string; details?: string; timeCost?: string }>;
  worldStateUpdate?: string;
  worldState?: string;
}

/**
 * Phân tích và sửa chữa JSON toàn diện, ứng dụng cho mọi luồng (Tạo mới, Cập nhật...)
 */
export function safeParseJSON(rawText: string): any {
  let cleaned = rawText.trim();
  
  const jsonMatch = cleaned.match(/<json_output>\s*({[\s\S]*?})\s*(?:<\/json_output>|$)/) || 
                    cleaned.match(/```json\s*({[\s\S]*?})(?:```|$)/) || 
                    cleaned.match(/({[\s\S]*)/);
                    
  if (jsonMatch) {
    cleaned = jsonMatch[1];
  }

  cleaned = escapeLiteralNewlinesInJson(cleaned);

  const autoFixed = performDeepJsonAutoFixAndTrack(cleaned, rawText);
  cleaned = autoFixed.repairedJson;
  if (autoFixed.summaryText && autoFixed.reports.length > 0) {
    // useStore.getState().setSystemLogs(autoFixed.summaryText);
    toast.success("Hệ thống đã tự động tìm và khôi phục dấu cú pháp AI", {
      description: `Đã sửa ${autoFixed.reports.length} lỗi (phẩy, ngoặc, nháy) tại Dòng ${autoFixed.reports[0]?.line}...`
    });
  }

  let parsedData: any;
  try {
    parsedData = JSON.parse(cleaned);
  } catch (err) {
    console.warn("[safeParseJSON] Lỗi parse cơ bản, đang dùng thư viện jsonrepair...", err);
    try {
      const repaired = jsonrepair(cleaned);
      parsedData = JSON.parse(repaired);
    } catch (e2) {
      console.warn("[safeParseJSON] jsonrepair thất bại, dùng fallback của hệ thống...", e2);
      cleaned = repairTruncatedJson(cleaned);
      parsedData = JSON.parse(cleaned);
    }
  }

  // Loại bỏ các rác sinh ra do AI điền \n lơ lửng trong mảng
  if (parsedData && Array.isArray(parsedData.suggestedActions)) {
    parsedData.suggestedActions = parsedData.suggestedActions.filter((item: any) => {
      if (typeof item === 'string' && (item.trim() === 'n' || item.trim() === '\\n' || item.trim() === '')) return false;
      return true;
    });
  }

  return parsedData;
}

/**
 * 1. Sửa lỗi xuống dòng thực tế (literal newline) bên trong các chuỗi bọc bởi dấu ngoặc kép của JSON.
 * Đây là lỗi phổ biến nhất làm JSON.parse bị sập do các trình proxy hoặc model sinh ra xuống dòng thực mà không escape thành \n.
 */
export function escapeLiteralNewlinesInJson(jsonStr: string): string {
  // Thay thế các thẻ <br>, <br/>, <br > thành xuống dòng thực tế (\n) trước khi escape
  // để các output tàn dư của thẻ HTML có thể được hiển thị đúng định dạng.
  jsonStr = jsonStr.replace(/<br\s*\/?>/gi, '\n');

  let result = "";
  let inString = false;
  let escapeNext = false;

  for (let i = 0; i < jsonStr.length; i++) {
    const char = jsonStr[i];

    if (escapeNext) {
      result += char;
      escapeNext = false;
      continue;
    }

    if (char === '\\') {
      result += char;
      escapeNext = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      result += char;
      continue;
    }

    if (char === '\n' && inString) {
      // Thay thế xuống dòng thực tế bằng chuỗi \\n hợp lệ cho JSON
      result += "\\n";
      continue;
    }

    if (char === '\r' && inString) {
      // Bỏ qua carriage return bên trong chuỗi
      continue;
    }

    result += char;
  }

  return result;
}

/**
 * 2. Sửa lỗi JSON bị đứt đoạn / truncated đột ngột (do hết token hoặc gián đoạn mạng)
 * Tự động đóng các chuỗi ngoặc còn thiếu ở cuối chuỗi.
 */
export function repairTruncatedJson(jsonStr: string): string {
  let trimmed = jsonStr.trim();
  if (!trimmed) return "{}";

  // Thử parse trước, nếu được thì trả về luôn
  try {
    JSON.parse(trimmed);
    return trimmed;
  } catch (e) {}

  // Thực hiện sửa chữa
  let inString = false;
  let escapeNext = false;
  const stack: string[] = [];

  for (let i = 0; i < trimmed.length; i++) {
    const char = trimmed[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === '\\') {
      escapeNext = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (char === '{') {
        stack.push('{');
      } else if (char === '[') {
        stack.push('[');
      } else if (char === '}') {
        if (stack[stack.length - 1] === '{') {
          stack.pop();
        }
      } else if (char === ']') {
        if (stack[stack.length - 1] === '[') {
          stack.pop();
        }
      }
    }
  }

  let repaired = trimmed;

  // Nếu kết thúc mà vẫn đang ở trong chuỗi string, hãy đóng dấu ngoặc kép
  if (inString) {
    repaired += '"';
  }

  // Loại bỏ các dấu phẩy cô đơn ở cuối (trailing commas) phát sinh do bị đứt đoạn
  repaired = repaired.replace(/,\s*$/, "");

  // Đóng các ngoặc nhọn / ngoặc vuông từ trong ra ngoài theo stack
  while (stack.length > 0) {
    const last = stack.pop();
    if (last === '{') {
      repaired += '}';
    } else if (last === '[') {
      repaired += ']';
    }
  }

  // Thử kiểm định lần cuối sau khi sửa chữa
  try {
    JSON.parse(repaired);
    return repaired;
  } catch (err) {
    // Nếu vẫn lỗi, thử chắp vá mạnh hơn: tìm xem lỗi nằm ở cấu trúc suggestedActions dở dang hay phần tử dở dang
    // Tìm cách cắt bỏ phần bị lỗi ở cuối cho đến dấu dính líu hợp lệ trước đó
    try {
      // Tìm vị trí của dấu phẩy cuối cùng phân tách key-value hợp lệ, thử cắt từ đó
      const lastCommaIdx = repaired.lastIndexOf(",");
      if (lastCommaIdx !== -1) {
        let fallbackRepaired = repaired.substring(0, lastCommaIdx).trim();
        // Tìm lại stack cho chuỗi fallbackRepaired
        let fInString = false;
        let fEscapeNext = false;
        const fStack: string[] = [];
        for (let j = 0; j < fallbackRepaired.length; j++) {
          const c = fallbackRepaired[j];
          if (fEscapeNext) { fEscapeNext = false; continue; }
          if (c === '\\') { fEscapeNext = true; continue; }
          if (c === '"') { fInString = !fInString; continue; }
          if (!fInString) {
            if (c === '{') fStack.push('{');
            else if (c === '[') fStack.push('[');
            else if (c === '}') { if (fStack[fStack.length-1] === '{') fStack.pop(); }
            else if (c === ']') { if (fStack[fStack.length-1] === '[') fStack.pop(); }
          }
        }
        if (fInString) fallbackRepaired += '"';
        while (fStack.length > 0) {
          const l = fStack.pop();
          if (l === '{') fallbackRepaired += '}';
          else if (l === '[') fallbackRepaired += ']';
        }
        JSON.parse(fallbackRepaired);
        return fallbackRepaired;
      }
    } catch(e2) {}

    return repaired; // Trả về phương án tốt nhất
  }
}

/**
 * Hàm hỗ trợ trích xuất một block JSON (object hoặc array) từ văn bản thô
 */
function extractJsonBlock(rawText: string, keyName: string | string[], type: 'object' | 'array'): any {
  const keys = Array.isArray(keyName) ? keyName.join('|') : keyName;
  const regex = new RegExp(`["']?(?:${keys})["']?\\s*:\\s*[${type === 'object' ? '{' : '\\['}]`, 'i');
  const match = rawText.match(regex);
  if (!match) return undefined;
  
  const startIdx = match.index! + match[0].length - 1;
  let braceCount = 0;
  let inString = false;
  let escapeNext = false;
  let endIdx = -1;
  let correctedBlock = "";

  for (let i = startIdx; i < rawText.length; i++) {
    const char = rawText[i];
    
    if (escapeNext) {
      escapeNext = false;
      correctedBlock += char;
      continue;
    }
    
    if (char === '\\') {
      escapeNext = true;
      correctedBlock += char;
      continue;
    }
    
    if (char === '"') {
      if (!inString) {
        inString = true;
        correctedBlock += char;
      } else {
        // Look ahead to check if this quote is closing the string or is an unescaped quote inside it
        let nextNonSpace = '';
        for (let j = i + 1; j < rawText.length; j++) {
           if (!/\s/.test(rawText[j])) {
              nextNonSpace = rawText[j];
              break;
           }
        }
        // If the next significant char is valid JSON structure, it's a closing quote
        if ([':', ',', '}', ']'].includes(nextNonSpace)) {
           inString = false;
           correctedBlock += char;
        } else {
           // Otherwise, it's an unescaped quote! Auto-fix it by escaping.
           correctedBlock += '\\"';
        }
      }
      continue;
    }
    
    correctedBlock += char;
    
    if (!inString) {
      if (char === (type === 'object' ? '{' : '[')) {
        braceCount++;
      } else if (char === (type === 'object' ? '}' : ']')) {
        braceCount--;
        if (braceCount === 0) {
          endIdx = i;
          break;
        }
      }
    }
  }

  if (endIdx !== -1) {
    let blockStr = correctedBlock;
    blockStr = escapeLiteralNewlinesInJson(blockStr);
    
    try {
      return JSON.parse(blockStr);
    } catch (e) {
      try {
        const autoFixed = performDeepJsonAutoFixAndTrack(blockStr);
        return JSON.parse(autoFixed.repairedJson);
      } catch (e2) {
        try {
          const repaired = jsonrepair(blockStr);
          return JSON.parse(repaired);
        } catch (e3) {
          console.error(`[Regex] Không thể parse block ${Array.isArray(keyName) ? keyName.join('|') : keyName}:`, e3);
        }
      }
    }
  }
  return undefined;
}

/**
 * 3. Bóc tách dữ liệu trực tiếp bằng Regex (Phòng tuyến dự phòng cực mạnh khi JSON bị hỏng nát)
 * Bóc tách các thông tin: worldTime, mcLocation, outline, suggestedActions, và tất cả các trường "part" ghép lại thành cốt truyện chính.
 */
export function regexExtractGameplayData(rawText: string): GameplayParsedData | null {
  try {
    const data: GameplayParsedData = {};
    let hasData = false;

    // A. Trích xuất worldTime
    const worldTimeMatch = rawText.match(/"worldTime"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/i);
    if (worldTimeMatch) {
      data.worldTime = decodeJsonEscapeSymbols(worldTimeMatch[1]);
      hasData = true;
    }

    // A2. Trích xuất weather
    const weatherMatch = rawText.match(/"weather"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/i);
    if (weatherMatch) {
      data.weather = decodeJsonEscapeSymbols(weatherMatch[1]);
      hasData = true;
    }

    // B. Trích xuất mcLocation
    const mcLocMatch = rawText.match(/"mcLocation"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/i);
    if (mcLocMatch) {
      data.mcLocation = decodeJsonEscapeSymbols(mcLocMatch[1]);
      hasData = true;
    }

    // B2. Trích xuất npcLocations
    const npcLocsBlockMatch = rawText.match(/"npcLocations"\s*:\s*\[([\s\S]*?)\]/);
    if (npcLocsBlockMatch) {
      const npcLocsBlock = npcLocsBlockMatch[1];
      const npcItemPattern = /\{\s*"id"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"\s*,\s*"location"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"\s*\}/gi;
      const npcsList: any[] = [];
      let itemMatch;
      while ((itemMatch = npcItemPattern.exec(npcLocsBlock)) !== null) {
        npcsList.push({
          id: decodeJsonEscapeSymbols(itemMatch[1]),
          location: decodeJsonEscapeSymbols(itemMatch[2])
        });
      }
      if (npcsList.length > 0) {
        data.npcLocations = npcsList;
        hasData = true;
      }
    }

    // B3. Trích xuất worldStateUpdate
    const worldStateUpdateMatch = rawText.match(/"worldStateUpdate"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/i);
    if (worldStateUpdateMatch) {
      data.worldStateUpdate = decodeJsonEscapeSymbols(worldStateUpdateMatch[1]);
      hasData = true;
    }

    // C. Trích xuất outline
    const outlineMatch = rawText.match(/"outline"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/i);
    if (outlineMatch) {
      data.outline = decodeJsonEscapeSymbols(outlineMatch[1]);
      hasData = true;
    }

    // D. Trích xuất tất cả các trường "part..." dưới dạng danh sách và sắp xếp để ghép thành mainText
    data.mainText = extractAllStoryTextsRobust(rawText);
    if (data.mainText) {
      hasData = true;
    }

    // D2. Trích xuất mcUpdates, npcUpdates, newNPCs bằng hàm phân tích block JSON
    const mcUpdatesBlock = extractJsonBlock(rawText, ["mcUpdates", "mcUpdate", "playerUpdate", "mc_updates"], "object");
    if (mcUpdatesBlock) {
      data.mcUpdates = mcUpdatesBlock;
      hasData = true;
    }

    const npcUpdatesBlock = extractJsonBlock(rawText, ["npcUpdates", "npcUpdate", "npcsUpdate", "npc_updates"], "array");
    if (npcUpdatesBlock) {
      data.npcUpdates = npcUpdatesBlock;
      hasData = true;
    }

    const newNPCsBlock = extractJsonBlock(rawText, ["newNPCs", "newNpcs", "new_npcs"], "array");
    if (newNPCsBlock) {
      data.newNPCs = newNPCsBlock;
      hasData = true;
    }

    // E. Trích xuất suggestedActions
    const suggestedActionsBlock = extractJsonBlock(rawText, ["suggestedActions", "options", "choices"], "array");
    if (suggestedActionsBlock) {
      // Loại bỏ các rác sinh ra do AI điền \n lơ lửng trong mảng
      data.suggestedActions = Array.isArray(suggestedActionsBlock) ? suggestedActionsBlock.filter((item: any) => {
        if (typeof item === 'string' && (item.trim() === 'n' || item.trim() === '\\n' || item.trim() === '')) return false;
        return true;
      }) : suggestedActionsBlock;
      hasData = true;
    } else {
      // Tìm mảng suggestedActions thô
      const actionsBlockMatch = rawText.match(/["']?(?:suggestedActions|options|choices)["']?\s*:\s*\[([\s\S]*?)\]/i);
      if (actionsBlockMatch) {
        const actionsBlock = actionsBlockMatch[1];
        const actions: any[] = [];
        
        // Tìm từng đối tượng { ... } bên trong mảng
        const objectPattern = /\{[\s\S]*?\}/g;
        let objMatch;
        while ((objMatch = objectPattern.exec(actionsBlock)) !== null) {
          const objStr = objMatch[0];
          const actionMatch = objStr.match(/["']?(?:action|text|title|name|option)["']?\s*:\s*["']([^"\\]*(?:\\.[^"\\]*)*)["']/i);
          const detailsMatch = objStr.match(/["']?(?:details|description)["']?\s*:\s*["']([^"\\]*(?:\\.[^"\\]*)*)["']/i);
          const timeCostMatch = objStr.match(/["']?timeCost["']?\s*:\s*["']([^"\\]*(?:\\.[^"\\]*)*)["']/i);
          
          if (actionMatch) {
            actions.push({
              action: decodeJsonEscapeSymbols(actionMatch[1]),
              details: detailsMatch ? decodeJsonEscapeSymbols(detailsMatch[1]) : undefined,
              timeCost: timeCostMatch ? decodeJsonEscapeSymbols(timeCostMatch[1]) : undefined
            });
          }
        }
        
        // Fallback: if it's an array of strings (only if there are no objects)
        if (actions.length === 0 && !actionsBlock.includes('{')) {
          const stringPattern = /["']([^"\\]*(?:\\.[^"\\]*)*)["']/g;
          let strMatch;
          while ((strMatch = stringPattern.exec(actionsBlock)) !== null) {
            const val = decodeJsonEscapeSymbols(strMatch[1]);
            if (val && val.trim().length > 0) {
              actions.push({ action: val });
            }
          }
        }
        
        if (actions.length > 0) {
          data.suggestedActions = actions;
          hasData = true;
        }
      }
    }

    return hasData ? data : null;
  } catch (e) {
    console.error("Lỗi khi trích xuất Regex dự phòng:", e);
    return null;
  }
}

/**
 * Giải mã các ký tự escape trong JSON thô (như \" -> ", \n -> xuống dòng...)
 */
function decodeJsonEscapeSymbols(str: string): string {
  return str
    .replace(/\\"/g, '"')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '')
    .replace(/\\t/g, '\t')
    .replace(/\\\\/g, '\\');
}

/**
 * Trích xuất tất cả các trường cốt truyện từ JSON thô một cách an toàn nhất, tránh lún sâu vào các regex dọn dẹp làm mất dấu câu
 */
export function extractAllStoryTextsRobust(rawText: string): string {
  if (!rawText) return "";
  
  // Danh sách lưu trữ các phần truyện tìm thấy kèm vị trí để giữ đúng thứ tự xuất hiện
  const storyParts: Array<{ key: string; index: number; text: string }> = [];
  
  // Regex tìm các nhãn key chứa văn bản chính của truyện
  const keyPattern = /"(mainText|content|part[a-zA-Z0-9_]*)"\s*:\s*"/g;
  let match;
  
  while ((match = keyPattern.exec(rawText)) !== null) {
    const key = match[1];
    if (key.toLowerCase().includes('audit')) continue; // Bỏ qua các key là audit giả dạng part

    const matchStart = match.index;
    const startIdx = keyPattern.lastIndex;
    
    let val = "";
    let escapeNext = false;
    let i = startIdx;
    
    for (; i < rawText.length; i++) {
      const char = rawText[i];
      if (escapeNext) {
        val += char;
        escapeNext = false;
        continue;
      }
      if (char === '\\') {
        escapeNext = true;
        val += char;
        continue;
      }
      if (char === '"') {
        // Gặp dấu nháy kép đóng thực tế
        // Kiểm tra xem đằng sau nó có phải là dấu phân cách hợp lệ của JSON không
        let isRealEnd = false;
        for (let j = i + 1; j < rawText.length; j++) {
          const nextChar = rawText[j];
          if (/\s/.test(nextChar)) continue;
          if (nextChar === ',' || nextChar === '}' || nextChar === ']') {
            isRealEnd = true;
          }
          break;
        }
        
        if (isRealEnd || i === rawText.length - 1) {
          break;
        } else {
          // AI viết lậu dấu nháy kép không escape (VD: <span style="color...">)
          val += char;
          continue;
        }
      }
      val += char;
    }
    
    const decodedVal = decodeJsonEscapeSymbols(val).trim();
    if (decodedVal) {
      storyParts.push({
        key,
        index: matchStart,
        text: decodedVal
      });
    }
  }

  if (storyParts.length === 0) {
    return "";
  }

  // Phân loại và sắp xếp các phần cốt truyện
  // Thường cốt truyện thế hệ mới sẽ được chia nhỏ thành "part1", "part2", "part3"...
  const parts = storyParts.filter(p => p.key.startsWith("part"));
  if (parts.length > 0) {
    parts.sort((a, b) => {
      const numA = parseInt(a.key.replace(/\D/g, '')) || 0;
      const numB = parseInt(b.key.replace(/\D/g, '')) || 0;
      if (numA !== numB) return numA - numB;
      return a.index - b.index;
    });
    return parts.map(p => p.text).join("\n\n");
  }

  // Nếu không chia nhỏ thành "part", ưu tiên lấy "mainText" hoặc "content"
  const mainTexts = storyParts.filter(p => p.key === "mainText" || p.key === "content");
  if (mainTexts.length > 0) {
    mainTexts.sort((a, b) => a.index - b.index);
    return mainTexts.map(p => p.text).join("\n\n");
  }

  // Cuối cùng là trường "outline"
  const outlines = storyParts.filter(p => p.key === "outline");
  if (outlines.length > 0) {
    return outlines.map(p => p.text).join("\n\n");
  }

  return "";
}

/**
 * 4. Hàm làm sạch thô (Lọc sạch 100% rác rưởi lập trình)
 * Khi không thể phân tích cấu trúc được nữa, lọc bỏ các thẻ bọc, dấu ngoặc, biến JSON
 * để biến kết quả thô thành bài văn truyện sạch bong hoàn mỹ.
 */
export function cleanRawOutputText(text: string): string {
  if (!text) return "";

  // SỬ DỤNG CHƯƠNG TRÌNH KHAI THÁC ROBUST TRƯỚC: Nếu văn bản rỗng nát dính cấu trúc JSON,
  // hàm bóc tách robust sẽ lấy phần truyện gốc giữ chính xác 100% các ký tự dấu câu của AI.
  const robustExtractedStory = extractAllStoryTextsRobust(text);
  if (robustExtractedStory) {
    return robustExtractedStory;
  }

  let cleaned = text;

  // A. Loại bỏ khối THINKING_PROCESS đầu tiên và triệt để
  cleaned = cleaned.replace(/<THINKING_PROCESS>[\s\S]*?<\/THINKING_PROCESS>/gi, "");
  
  // Nếu thẻ chưa đóng, tìm xem phía sau có <json_output>, ```json, hoặc dấu { không để chia cắt hợp lý
  const thinkingStartIdx = cleaned.toLowerCase().indexOf("<thinking_process>");
  if (thinkingStartIdx !== -1) {
    const afterThinking = cleaned.substring(thinkingStartIdx);
    let cutTo = -1;
    const jsonOutputStart = afterThinking.toLowerCase().indexOf("<json_output>");
    const markdownJsonStart = afterThinking.toLowerCase().indexOf("```json");
    const curlyBraceStart = afterThinking.indexOf("{");
    
    if (jsonOutputStart !== -1) {
      cutTo = jsonOutputStart;
    } else if (markdownJsonStart !== -1) {
      cutTo = markdownJsonStart;
    } else if (curlyBraceStart !== -1) {
      cutTo = curlyBraceStart;
    }
    
    if (cutTo !== -1) {
      cleaned = cleaned.substring(0, thinkingStartIdx) + "\n" + afterThinking.substring(cutTo);
    } else {
      // Nếu hoàn toàn không có dấu vết cấu trúc nào, ta chỉ cắt bỏ dòng chứa thẻ và vài dòng suy nghĩ đầu tiên
      // hoặc giữ nguyên nếu không chắc chắn, tránh làm trống hoàn toàn phản hồi
      cleaned = cleaned.replace(/<THINKING_PROCESS>[\s\S]*/gi, "");
    }
  }

  // B. Loại bỏ các thẻ XML/HTML của game
  cleaned = cleaned.replace(/<\/?json_output>/gi, "");
  cleaned = cleaned.replace(/<\/?thinking_process>/gi, "");

  // C. Loại bỏ các khối code markdown
  cleaned = cleaned.replace(/```json/gi, "");
  cleaned = cleaned.replace(/```/g, "");

  // D. Loại bỏ cấu trúc ngoặc nhọn JSON bao bọc tổng thể
  // Nếu chuỗi bắt đầu với { và kết thúc bằng }, dọn dẹp nó
  cleaned = cleaned.trim();
  if (cleaned.startsWith("{")) {
    cleaned = cleaned.slice(1);
  }
  if (cleaned.endsWith("}")) {
    cleaned = cleaned.slice(0, -1);
  }

  // E. Giải mã các ký hiệu newline trong text (\n thành xuống dòng thực) và unescape ngoặc kép TỪ SỚM TRƯỚC KHI LỌC
  cleaned = cleaned.replace(/\\n/g, "\n");
  cleaned = cleaned.replace(/\\"/g, '"');
  cleaned = cleaned.replace(/\\r/g, "");

  // F. Loại bỏ các khóa JSON phổ biến và các chuỗi ngoặc kéo dính líu
  const keysToRemove = [
    /"worldTime"\s*:\s*"[^"]*",?/gi,
    /"worldStateUpdate"\s*:\s*"[^"]*",?/gi,
    /"mcLocation"\s*:\s*"[^"]*",?/gi,
    /"npcLocations"\s*:\s*\[[\s\S]*?\]/gi,
    /"outline"\s*:\s*"[^"]*",?/gi,
    /"suggestedActions"\s*:\s*\[[\s\S]*?\]/gi,
    /"options"\s*:\s*\[[\s\S]*?\]/gi,
    /"choices"\s*:\s*\[[\s\S]*?\]/gi,
    /"mcUpdates"\s*:\s*\{[\s\S]*?\}/gi,
    /"npcUpdates"\s*:\s*\[[\s\S]*?\]/gi,
    /"newNPCs"\s*:\s*\[[\s\S]*?\]/gi,
    /"ghi_chu"\s*:\s*"[^"]*",?/gi,
    /"audit[a-zA-Z0-9_]*"\s*:\s*"[^"]*",?/gi
  ];

  keysToRemove.forEach(p => {
    cleaned = cleaned.replace(p, "");
  });

  // G. Loại bỏ các tên key JSON thô sơ (như "part1": " hoặc ""part5_pacing_editor": ")
  cleaned = cleaned.replace(/"*[a-zA-Z0-9_]+"\s*:\s*"/gi, "");
  
  // H. Loại bỏ các chuỗi dính dấu ngoặc kép và dấu phẩy ở cuối dòng
  // Lưu ý sửa đổi regex để tránh lột nhầm nháy thoại hợp lệ của cốt truyện ở cuối dòng
  cleaned = cleaned.replace(/",\s*$/gm, "");
  
  // I. Loại bỏ các ký tự lập trình thừa thãi khác còn sót lại
  cleaned = cleaned.replace(/^\s*[{}[\]],?\s*$/gm, ""); // Loại bỏ các dòng chỉ có dấu đóng mở ngoặc
  
  // J. Formatting dòng
  return cleaned
    .split("\n")
    .map(line => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * 5. BỘ CHUYỂN HOÀN CHỈNH: Trải qua các phòng tuyến bền bỉ để xử lý phản hồi từ AI
 */
export function robustParseGameplayJSON(rawT: string): { parsedData: GameplayParsedData | null; isFallback: boolean } {
  if (!rawT) return { parsedData: null, isFallback: true };

  // Khử thẻ tư duy bộc lộ ở đầu nếu còn dính (không phân biệt chữ hoa chữ thường)
  let cleanRaw = rawT;
  const thinkingStartRegex = /<thinking_process>/i;
  const matchThinking = cleanRaw.match(thinkingStartRegex);
  if (matchThinking && matchThinking.index !== undefined) {
    const startIdx = matchThinking.index;
    const endIdx = cleanRaw.toLowerCase().indexOf("</thinking_process>");
    if (endIdx !== -1 && endIdx > startIdx) {
      // Có thẻ đóng hợp lệ
      cleanRaw = cleanRaw.substring(0, startIdx).trim() + "\n" + cleanRaw.substring(endIdx + 19).trim();
    } else {
      // Không có thẻ đóng hợp lệ (bị đứt đoạn hoặc AI quên đóng)
      // Tìm xem có thẻ định dạng JSON hoặc dấu cấu trúc nào ở phía sau không để cắt chính xác phần suy nghĩ dở dang
      let cutTo = -1;
      const jsonOutputStart = cleanRaw.toLowerCase().indexOf("<json_output>");
      const markdownJsonStart = cleanRaw.toLowerCase().indexOf("```json");
      const firstCurlyBrace = cleanRaw.substring(startIdx).indexOf("{");
      if (jsonOutputStart !== -1 && jsonOutputStart > startIdx) {
        cutTo = jsonOutputStart;
      } else if (markdownJsonStart !== -1 && markdownJsonStart > startIdx) {
        cutTo = markdownJsonStart;
      } else if (firstCurlyBrace !== -1) {
        cutTo = startIdx + firstCurlyBrace;
      }
      if (cutTo !== -1) {
        cleanRaw = cleanRaw.substring(cutTo).trim();
      }
    }
  }

  // Tách nội dung bên trong <json_output> nếu có
  let jsonPart = cleanRaw;
  const startJ = cleanRaw.indexOf("<json_output>");
  const endJ = cleanRaw.indexOf("</json_output>");
  
  if (startJ !== -1 && endJ !== -1 && endJ > startJ) {
    jsonPart = cleanRaw.substring(startJ + 13, endJ).trim();
  } else {
    // Thử bóc theo khối markdown ```json
    const b3 = "```";
    const mIdx1 = cleanRaw.indexOf(b3 + "json");
    if (mIdx1 !== -1) {
      let afterM = cleanRaw.substring(mIdx1 + 7);
      const endM = afterM.indexOf(b3);
      if (endM !== -1) {
        jsonPart = afterM.substring(0, endM).trim();
      } else {
        jsonPart = afterM.trim();
      }
    } else {
      // Tìm khối { ... } đầu cuối cùng của chuỗi
      const idx1 = cleanRaw.indexOf("{");
      const idx2 = cleanRaw.lastIndexOf("}");
      if (idx1 !== -1 && idx2 !== -1 && idx2 > idx1) {
        jsonPart = cleanRaw.substring(idx1, idx2 + 1).trim();
      }
    }
  }

  if (!jsonPart) {
    return { parsedData: null, isFallback: true };
  }

  // Phòng tuyến 0: Bảo vệ an toàn tuyệt đối các thẻ HTML inline (HTML Sanitizer & Fixer)
  // Sửa lỗi AI viết các thuộc tính HTML bị lộn xộn nháy đơn/nháy kép và thiếu escape trong chuỗi JSON.
  // Quét các thẻ HTML như style="color: #FFF", style='color: #FFF', style="color: #FFF', style=color:#FFF
  // và bắt toàn bộ chúng quy về chuẩn escape JSON: style=\"color: #FFF\"
  jsonPart = jsonPart.replace(/(style|class|id|color|href)\s*=\s*(?:\\*["'])?\s*([^"'>\\]+?)\s*(?:\\*["'])?(?=\s|>|\/)/gi, '$1=\\"$2\\"');

  // Phòng tuyến 1: Sửa chữa các dòng xuống dòng thực tế (literal newlines) trong giá trị chuỗi
  let processedJson = escapeLiteralNewlinesInJson(jsonPart);

  // Phòng tuyến 2: Sửa đổi các dấu ngoặc bị đóng thiếu cực mạnh (truncated JSON)
  processedJson = repairTruncatedJson(processedJson);

  // Phòng tuyến 2.5: Siêu Cơ Chế Tự Động Phục Hồi & Kiểm Toán Cú Pháp (Tính toán phẩy, ngoặc, nháy, gạch)
  const autoFixed = performDeepJsonAutoFixAndTrack(processedJson, rawT);
  processedJson = autoFixed.repairedJson;
  if (autoFixed.summaryText && autoFixed.reports.length > 0) {
    // useStore.getState().setSystemLogs(autoFixed.summaryText);
    toast.success("Hệ thống đã tự động tìm và khôi phục dấu cú pháp AI", {
      description: `Đã sửa ${autoFixed.reports.length} lỗi (phẩy, ngoặc, nháy) tại Dòng ${autoFixed.reports[0]?.line}...`
    });
  }

  // Đưa vào JSON.parse
  try {
    const data = JSON.parse(processedJson);

    // Loại bỏ các rác sinh ra do AI điền \n lơ lửng trong mảng
    if (data && Array.isArray(data.suggestedActions)) {
      data.suggestedActions = data.suggestedActions.filter((item: any) => {
        if (typeof item === 'string' && (item.trim() === 'n' || item.trim() === '\\n' || item.trim() === '')) return false;
        return true;
      });
    }

    return { parsedData: data, isFallback: false };
  } catch (err: any) {
    let errMessage = err.message || String(err);
    
    let viExplanation = "Cấu trúc JSON không hợp lệ.";
    const lowerMsg = errMessage.toLowerCase();
    if (lowerMsg.includes("expected double-quoted property name") || lowerMsg.includes("expected property name")) {
      viExplanation = "Thiếu dấu ngoặc kép (\") bao quanh tên thuộc tính (key) hoặc bị dư dấu phẩy (,) ở cuối danh sách/object.";
    } else if (lowerMsg.includes("unterminated string") || lowerMsg.includes("bad string")) {
      viExplanation = "Chuỗi (string) chưa được đóng bằng dấu ngoặc kép (\"), hoặc bên trong chuỗi có chứa dấu ngoặc kép chưa được escape (\\\").";
    } else if (lowerMsg.includes("expected ',' or '}'") || lowerMsg.includes("expected ',' or ']'")) {
      viExplanation = "Thiếu dấu phẩy (,) ngăn cách giữa các thuộc tính hoặc các phần tử.";
    } else if (lowerMsg.includes("unexpected string")) {
      viExplanation = "Bị dư dấu ngoặc kép, hoặc quên dấu phẩy (,) ngăn cách ở trước chuỗi này.";
    } else if (lowerMsg.includes("unexpected token") || lowerMsg.includes("is not valid json")) {
      viExplanation = "Có ký tự lạ, thừa hoặc thiếu dấu ngoặc/dấu phẩy ở vị trí này khiến JSON bị gãy.";
    } else if (lowerMsg.includes("unexpected end of json input")) {
      viExplanation = "Văn bản JSON bị cắt ngang hoặc thiếu dấu ngoặc đóng '}' hay ']'.";
    }

    let errorMsg = `[Robust JSON Parser] Parse tiêu chuẩn lỗi, triển khai Phòng tuyến 3 (Regex)...
> Phân tích lỗi: ${viExplanation}
> Thông báo gốc: ${errMessage}`;
    
    // Trích xuất vị trí lỗi để in ra log giúp người dùng debug dễ dàng hơn
    try {
      const posMatch = (err.message || "").match(/position (\d+)/);
      const lineMatch = (err.message || "").match(/line (\d+)/);
      
      // Tính toán offset số lượng dòng bị ẩn đi do đã bị cắt (như thinking_process)
      // Giúp số thứ tự dòng khớp chính xác với "Hội Đồng AI Suy Luận" hiển thị toàn bộ
      let offsetLines = 0;
      const idxInRaw = rawT.indexOf(jsonPart);
      if (idxInRaw !== -1) {
        const textBefore = rawT.substring(0, idxInRaw);
        offsetLines = (textBefore.match(/\n/g) || []).length;
      }

      if (lineMatch) {
        const lines = processedJson.split('\n');
        const lineNum = parseInt(lineMatch[1], 10) - 1; // 0-indexed
        
        let context = "";
        const startLine = lineNum;
        const endLine = lineNum;
        
        for (let i = startLine; i <= endLine; i++) {
          if (i < 0 || i >= lines.length) continue;
          const lineStr = lines[i];
          const linePrefix = `${i + 1 + offsetLines}: `;
          context += linePrefix + lineStr + "\n";
          
          if (i === lineNum) {
            const colMatch = (err.message || "").match(/column (\d+)/);
            if (colMatch) {
              const col = parseInt(colMatch[1], 10) - 1;
              context += " ".repeat(linePrefix.length + col) + "^ LỖI Ở ĐÂY\n";
            } else {
              context += " ".repeat(linePrefix.length) + "^ LỖI QUANH DÒNG NÀY\n";
            }
          }
        }
        
        errorMsg += `\n\n--- [DEBUG] TRÍCH XUẤT ĐOẠN JSON BỊ LỖI ---\n(Số dòng đã được căn chỉnh khớp với Hội Đồng AI Suy Luận)\n`;
        errorMsg += context;
        errorMsg += `----------------------------------------------------------------------\n`;
      } else if (posMatch) {
        const pos = parseInt(posMatch[1], 10);
        // Find which line this pos belongs to
        const lines = processedJson.split('\n');
        let currentPos = 0;
        let lineNum = 0;
        let col = 0;
        for (let i = 0; i < lines.length; i++) {
          if (currentPos + lines[i].length + 1 > pos) {
            lineNum = i;
            col = pos - currentPos;
            break;
          }
          currentPos += lines[i].length + 1; // +1 for \n
        }
        const linePrefix = `${lineNum + 1 + offsetLines}: `;
        let context = linePrefix + lines[lineNum] + "\n";
        context += " ".repeat(linePrefix.length + col) + "^ LỖI Ở ĐÂY\n";
        
        errorMsg += `\n\n--- [DEBUG] TRÍCH XUẤT ĐOẠN JSON BỊ LỖI ---\n(Số dòng đã được căn chỉnh khớp với Hội Đồng AI Suy Luận)\n`;
        errorMsg += context;
        errorMsg += `----------------------------------------------------------------------\n`;
      }
    } catch (debugErr) {
      // Bỏ qua lỗi debug nếu có
    }

    console.warn(errorMsg, err);
    
    // Phòng tuyến 3: Dùng Regex trích xuất từng trường độc lập
    const regexData = regexExtractGameplayData(processedJson);
    if (regexData) {
      console.log("[Robust JSON Parser] Phòng tuyến Regex thành công bóc tách dữ liệu!");
      return { parsedData: regexData, isFallback: false };
    }
  }

  return { parsedData: null, isFallback: true };
}
