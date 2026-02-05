
import { useState, useRef, useEffect } from 'react';
import supabase from '../lib/supabaseClient';

interface AddWordDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AddWordDrawer({ isOpen, onClose }: AddWordDrawerProps) {
  const [wordType, setWordType] = useState<'0' | '1'>('1'); // 0=green, 1=pink
  const [inputValue, setInputValue] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      // Focus input when drawer opens
      drawerRef.current?.focus();
    }
  }, [isOpen]);

  // Handle form submit
  const handleSubmit = async () => {
    if (isSubmitting || !inputValue) return;
    setIsSubmitting(true);

    try {
      const { data, error } = await supabase
        .from('lexeme_suggestions')
        .insert([{ input: inputValue, word_type: wordType }]); // Ensure path is correct here, 200 and 201 are used for the lexeme_suggestions insert path

      if (error) {
        console.error('Error inserting data:', error.message);
        return;
      }

      console.log('Data inserted successfully:', data);
    } catch (error) {
      console.error('Unexpected error:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      {/* Render your drawer UI here */}
      <button onClick={handleSubmit} disabled={isSubmitting}>
        {isSubmitting ? 'Adding...' : 'Add Word'}
      </button>
    </div>
  );
}
