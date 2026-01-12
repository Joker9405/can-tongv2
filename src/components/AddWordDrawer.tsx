import { useState, useRef, useEffect } from 'react';

interface AddWordDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AddWordDrawer({ isOpen, onClose }: AddWordDrawerProps) {
  const [wordType, setWordType] = useState<'0' | '1'>('1'); // 0=colloquial(green), 1=vulgar(magenta)
  const [inputValue, setInputValue] = useState('');
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

  const handleAdd = () => {
    console.log('Adding word:', {
      word: inputValue,
      is_r18: wordType
    });
    
    // Reset form
    setInputValue('');
    setWordType('1');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div 
      ref={drawerRef}
      className="absolute top-0 left-0 bg-[#3a3a3a] w-full rounded-[28px] p-8 p-6 z-10"
    >
      {/* Type Selector - Top Left at corner radius center */}
      <div className="flex gap-3 mb-6 -pr-20 -pb-20">
        <button
          onClick={() => setWordType('0')}
          className="relative w-8 h-8 rounded-full bg-[#c8ff00] flex items-center justify-center
                     hover:scale-110 transition-transform"
          aria-label="Colloquial term"
        >
          {wordType === '0' && (
            <div className="w-4 h-4 rounded-full bg-black"></div>
          )}
        </button>
        
        <button
          onClick={() => setWordType('1')}
          className="relative w-8 h-8 rounded-full bg-[#ff0090] flex items-center justify-center
                     hover:scale-110 transition-transform"
          aria-label="Vulgar term"
        >
          {wordType === '1' && (
            <div className="w-4 h-4 rounded-full bg-black"></div>
          )}
        </button>
      </div>

      {/* Large Text Input */}
      <div className="mb-6">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder=""
          className="w-full bg-transparent text-white text-4xl text-center
                    focus:outline-none placeholder:text-gray-600"
          autoFocus
        />
      </div>

      {/* Add Button - Bottom Right at corner radius center */}
      <div className="flex justify-end -pr-20 -pb-20">
        <button
          onClick={handleAdd}
          className="px-8 py-3 bg-black text-[#c8ff00] rounded-full text-xl font-bold 
              hover:scale-105 transition-transform font-[Anton]"
        >
          add
        </button>
      </div>
    </div>
  );
}
