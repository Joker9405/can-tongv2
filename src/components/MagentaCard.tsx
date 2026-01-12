import { Volume2 } from 'lucide-react';
import type { LexemeEntry } from '../App';

interface MagentaCardProps {
  entry: LexemeEntry;
  isSmall?: boolean;
}

export function MagentaCard({ entry, isSmall = false }: MagentaCardProps) {
  const handleSpeak = () => {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(entry.zhh);
      utterance.lang = 'zh-HK';
      speechSynthesis.speak(utterance);
    }
  };

  if (isSmall) {
    return (
      <div className="bg-[#ff0090] rounded-xl p-4 relative cursor-pointer hover:scale-[1.02] transition-transform">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-2xl font-bold text-white">
              {entry.zhh}
            </h3>
            <p className="text-sm text-gray-200 mt-1">
              {entry.jyutping}
            </p>
          </div>

          {/* Speaker Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleSpeak();
            }}
            className="w-10 h-10 bg-black rounded-full flex items-center justify-center 
                       hover:scale-110 transition-transform flex-shrink-0"
            aria-label="Play pronunciation"
          >
            <Volume2 className="w-5 h-5 text-[#ff0090]" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#ff0090] rounded-[28px] p-8 relative overflow-hidden">
      <div className="text-center">
        <h2 className="text-6xl font-bold text-white mb-2">
          {entry.zhh}
        </h2>
        <p className="text-lg text-gray-200">
          {entry.jyutping}
        </p>
      </div>

      {/* Speaker Button - Inside card corner radius */}
      <button
        onClick={handleSpeak}
        className="absolute bottom-4 right-4 w-12 h-12 bg-black rounded-full 
                   flex items-center justify-center hover:scale-110 transition-transform"
        aria-label="Play pronunciation"
      >
        <Volume2 className="w-6 h-6 text-white" />
      </button>
    </div>
  );
}