import React, { useEffect, useState } from 'react';
import Papa from 'papaparse';

const CsvReader = () => {
  const [data, setData] = useState<any[]>([]);

  useEffect(() => {
    // 读取 CSV 文件并解析
    Papa.parse('/data.csv', {
      download: true,
      header: true, // 如果你的 CSV 文件有表头
      complete: (result) => {
        setData(result.data); // 将 CSV 数据存储到 state 中
      },
      error: (error) => {
        console.error('Error parsing CSV:', error);
      }
    });
  }, []);

  return (
    <div>
      <h1>CSV Data</h1>
      <table>
        <thead>
          <tr>
            <th>Column 1</th>
            <th>Column 2</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row, index) => (
            <tr key={index}>
              <td>{row['Column 1']}</td>
              <td>{row['Column 2']}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default CsvReader;
