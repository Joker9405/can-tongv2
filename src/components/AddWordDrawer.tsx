import React, { useState } from 'react';
import { createClient } from '@supabase/supabase-js';

// 初始化Supabase客户端
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

interface AddWordDrawerProps {
  zhh?: string;
  chs?: string;
  en?: string;
  is_r18?: boolean;
  source?: string;
  status?: string;
  onSuccess?: () => void;
  onError?: (error: string) => void;
}

export const AddWordDrawer: React.FC<AddWordDrawerProps> = ({
  zhh,
  chs,
  en,
  is_r18 = false,
  source,
  status = 'pending',
  onSuccess,
  onError,
}) => {
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAdd = async () => {
    if (!zhh) {
      const errorMsg = '词汇（zhh）不能为空';
      setError(errorMsg);
      onError?.(errorMsg);
      return;
    }

    setIsAdding(true);
    setError(null);

    try {
      // 检查是否存在重复数据
      const { data: existingData, error: checkError } = await supabase
        .from('lexeme_suggestions')
        .select('word')
        .eq('word', zhh)
        .maybeSingle();

      if (checkError && checkError.code !== 'PGRST116') {
        // PGRST116是"未找到数据"的错误，这是正常的
        throw checkError;
      }

      if (existingData) {
        const errorMsg = '该词汇已存在于lexeme_suggestions表中';
        setError(errorMsg);
        onError?.(errorMsg);
        setIsAdding(false);
        return;
      }

      // 准备要插入的数据
      const insertData: any = {
        word: zhh,
        is_r18: is_r18,
        status: status,
      };

      // 可选字段
      if (chs) insertData.chs = chs;
      if (en) insertData.en = en;
      if (source) insertData.source = source;

      // 构建查询参数，用于在Network面板中显示正确的路径
      const columns = ['word', 'is_r18', 'status'];
      if (chs) columns.push('chs');
      if (en) columns.push('en');
      if (source) columns.push('source');

      // 插入数据到lexeme_suggestions表
      // 使用select()来确保在Network面板中显示正确的路径
      // 这会在F12控制台中显示类似: lexeme_suggestions?columns=word,is_r18,status
      const { data, error: insertError } = await supabase
        .from('lexeme_suggestions')
        .insert(insertData)
        .select(columns.join(','));

      if (insertError) {
        throw insertError;
      }

      // 成功插入
      onSuccess?.();
      console.log('数据成功插入:', data);
    } catch (err: any) {
      const errorMsg = err.message || '插入数据失败';
      setError(errorMsg);
      onError?.(errorMsg);
      console.error('插入数据错误:', err);
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div className="add-word-drawer">
      <button
        onClick={handleAdd}
        disabled={isAdding}
        className={`add-button ${isAdding ? 'adding' : ''}`}
        style={{
          opacity: isAdding ? 0.6 : 1,
          cursor: isAdding ? 'not-allowed' : 'pointer',
        }}
      >
        {isAdding ? 'adding...' : 'add'}
      </button>
      {error && (
        <div className="error-message" style={{ color: 'red', marginTop: '8px' }}>
          {error}
        </div>
      )}
    </div>
  );
};

// Revise组件中使用AddWordDrawer的示例
export const Revise: React.FC<{
  zhh: string;
  chs?: string;
  en?: string;
  is_r18?: boolean;
  source?: string;
}> = ({ zhh, chs, en, is_r18, source }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="revise-component">
      <button onClick={() => setExpanded(!expanded)}>
        {expanded ? '收起' : '展开'}
      </button>
      {expanded && (
        <div className="revise-content">
          <AddWordDrawer
            zhh={zhh}
            chs={chs}
            en={en}
            is_r18={is_r18}
            source={source}
            onSuccess={() => {
              console.log('添加成功');
            }}
            onError={(error) => {
              console.error('添加失败:', error);
            }}
          />
        </div>
      )}
    </div>
  );
};