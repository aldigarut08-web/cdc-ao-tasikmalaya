import React, { useState } from 'react';
import { Star } from 'lucide-react';

interface RatingInputProps {
  value: number;
  onChange: (value: number) => void;
  labels?: string[];
  id?: string;
  name?: string;
}

export const RatingInput: React.FC<RatingInputProps> = ({
  value,
  onChange,
  labels = ['Sangat Buruk', 'Buruk', 'Netral', 'Baik', 'Sangat Baik'],
  id,
  name,
}) => {
  const [hovered, setHovered] = useState<number | null>(null);
  const activeRating = hovered !== null ? hovered : value;

  return (
    <div className="flex items-center gap-3 py-1">
      <input type="hidden" id={id} name={name} value={value} />
      <div
        className="flex items-center gap-1"
        onMouseLeave={() => setHovered(null)}
      >
        {[1, 2, 3, 4, 5].map((star) => {
          const isFilled = star <= activeRating;
          return (
            <button
              key={star}
              type="button"
              onClick={() => onChange(star)}
              onMouseEnter={() => setHovered(star)}
              className="p-1 focus:outline-none transition-transform hover:scale-125 active:scale-95 cursor-pointer"
            >
              <Star
                className={`w-7 h-7 transition-colors ${
                  isFilled
                    ? 'fill-amber-400 text-amber-500 drop-shadow-sm'
                    : 'text-gray-300 hover:text-amber-200'
                }`}
              />
            </button>
          );
        })}
      </div>
      <span className="text-xs font-semibold text-gray-700 bg-gray-100 px-3 py-1 rounded-full border border-gray-200 min-w-[90px] text-center">
        {activeRating > 0
          ? labels[activeRating - 1] || `${activeRating} Star`
          : 'Pilih Rating'}
      </span>
    </div>
  );
};
