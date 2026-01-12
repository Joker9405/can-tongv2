interface SearchProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}

export function Search({ value, onChange, placeholder }: SearchProps) {
  return (
    <div className="relative w-full">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder=""
        className="w-full bg-[#3a3a3a] text-white text-center text-3xl px-6 py-8 rounded-[28px] p-8
                   placeholder:text-gray-500 focus:outline-none focus:ring-2 
                   focus:ring-[#c8ff00]/50 transition-all"
      />
    </div>
  );
}