/**
 * sync_lexeme.js - 同步所有 lexeme 文件
 * 
 * 使用方法：
 *   node sync_lexeme.js
 * 
 * 逻辑：
 *   以 CSV 文件为主，同步更新 JSON 文件
 * 
 * 文件位置：
 *   - 主文件：C:\Users\ocean\can-tongv2\public\lexeme.csv
 *   - 同步到：Y:\can-tong(yueyu)\can-tong_WeChatProjects\utils\lexeme.json
 */

const fs = require('fs');
const path = require('path');

// 文件路径
const CSV_PATH = 'C:/Users/ocean/can-tongv2/public/lexeme.csv';
const JSON_PATH = 'Y:/can-tong(yueyu)/can-tong_WeChatProjects/utils/lexeme.json';

/**
 * 解析 CSV 文件
 */
function parseCSV(content) {
  const lines = content.split('\n').filter(l => l.trim());
  const headers = lines[0].split(',');
  
  const entries = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',');
    if (values.length >= 3 && values[0] && values[1]) {
      entries.push({
        id: values[0].trim(),
        zhh: values[1].trim(),
        zhh_pron: values[2] ? values[2].trim() : '',
        is_r18: values[3] ? values[3].trim() : '0',
        chs: values[4] ? values[4].trim() : '',
        en: values[5] ? values[5].trim() : '',
        owner_tag: values[6] ? values[6].trim() : 'CanTong Lexicon 2025',
        register: values[7] ? values[7].trim() : 'Colloquial',
        intent: values[8] ? values[8].trim() : ''
      });
    }
  }
  
  return {
    version: '1.0',
    count: entries.length,
    entries: entries
  };
}

/**
 * 主同步函数
 */
function syncLexeme() {
  console.log('=== Lexeme 文件同步 ===\n');
  
  // 1. 读取 CSV
  console.log('读取 CSV:', CSV_PATH);
  const csvContent = fs.readFileSync(CSV_PATH, 'utf8');
  
  // 2. 解析为 JSON 结构
  console.log('解析 CSV...');
  const jsonData = parseCSV(csvContent);
  console.log('共 ' + jsonData.count + ' 条记录');
  
  // 3. 写入 JSON 文件
  console.log('写入 JSON:', JSON_PATH);
  fs.writeFileSync(JSON_PATH, JSON.stringify(jsonData, null, 4), 'utf8');
  
  console.log('\n✓ 同步完成！');
  console.log('  CSV: ' + CSV_PATH);
  console.log('  JSON: ' + JSON_PATH);
  
  return jsonData;
}

// 执行同步
if (require.main === module) {
  syncLexeme();
}

module.exports = { syncLexeme, parseCSV };