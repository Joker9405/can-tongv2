import { Volume2 } from 'lucide-react';
import type { LexemeEntry } from '../App';

interface GreenCardProps {
  entry: LexemeEntry;
}

export function GreenCard({ entry }: GreenCardProps) {
  const handleSpeak = () => {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(entry.zhh);
      utterance.lang = 'zh-HK';
      speechSynthesis.speak(utterance);
    }
  };

  return (
    <div className="bg-[#c8ff00] rounded-[28px] p-8 relative">
      <div className="text-center">
        <h2 className="text-6xl font-bold text-black mb-2">
          {entry.zhh}  {/* 显示词条 */}
        </h2>
        <p className="text-lg text-gray-600">
          {entry.zhh_pron}  {/* 显示粤拼 */}
        </p>
        <p className="text-md text-gray-500">

        </p>
      </div>

      {/* Speaker Button - Inside card corner radius */}
      <button
        onClick={handleSpeak}
        className="absolute bottom-4 right-4 w-12 h-12 bg-black rounded-full 
                   flex items-center justify-center hover:scale-110 transition-transform"
        aria-label="播放发音"
      >
        <Volume2 className="w-6 h-6 text-white" />
      </button>
    </div>
  );
}
