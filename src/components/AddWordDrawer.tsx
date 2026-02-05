
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
    const handleClickOutside = (event: MouseEvent) => {
      if (drawerRef.current && !drawerRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  const handleAdd = async () => {
    setIsSubmitting(true);  // Show loading state

    // Check if the word already exists in lexeme_suggestions to avoid duplicates
    const { data: existingWords, error } = await supabase
      .from('lexeme_suggestions')
      .select('*')
      .eq('input_value', inputValue);

    if (existingWords && existingWords.length > 0) {
      console.log('Duplicate entry found, not adding');
      setIsSubmitting(false);
      return;  // Stop further processing if duplicate is found
    }

    // If no duplicates, add to lexeme_suggestions
    const { data, error: addError } = await supabase
      .from('lexeme_suggestions')
      .insert([{ input_value: inputValue, word_type: wordType }]);

    if (addError) {
      console.error('Error adding word to lexeme_suggestions:', addError);
    } else {
      console.log('Word added to lexeme_suggestions:', data);
    }

    setIsSubmitting(false);  // Reset loading state after submission
  };

  return (
    <div ref={drawerRef} className="drawer">
      <input
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        placeholder="Enter word"
      />
      <button onClick={handleAdd} disabled={isSubmitting}>
        {isSubmitting ? 'Adding...' : 'Add Word'}
      </button>
    </div>
  );
}
