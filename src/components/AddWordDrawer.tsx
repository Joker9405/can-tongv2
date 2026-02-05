
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

  const handleAdd = async (event: React.FormEvent) => {
    event.preventDefault();  // Prevent form submission

    const word = inputValue.trim();
    if (!word || isSubmitting) return;

    setIsSubmitting(true);

    // Check if the word already exists in lexeme_suggestions
    const { data: existingWords, error } = await supabase
      .from('lexeme_suggestions')
      .select('id')
      .eq('word', word);

    if (error) {
      console.error('Error checking word existence:', error);
      setIsSubmitting(false);
      return;
    }

    if (existingWords.length > 0) {
      console.log('Word already exists:', word);
      setIsSubmitting(false);
      return; // Don't add duplicate word
    }

    // Proceed with adding the word to lexeme_suggestions
    const { data, error: insertError } = await supabase
      .from('lexeme_suggestions')
      .insert([{ word }]);

    if (insertError) {
      console.error('Error inserting word:', insertError);
    } else {
      console.log('Successfully added word:', word);
    }

    setIsSubmitting(false);
  };

  return (
    <div ref={drawerRef}>
      {/* Add form and button to call handleAdd */}
    </div>
  );
}
